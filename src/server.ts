import "dotenv/config";
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { createRequestStateCodec, McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod/v4";
import { createYouTubePort, getGoogleApiFailureMessage, isYouTubeApiError } from "./youtube-google-port.js";
import { YouTubeService, type ChannelSummary, type SubscriptionSummary } from "./youtube-service.js";

const MCP_PATH = "/mcp";
const CONFIRMATION_TTL_SECONDS = 300;
const PROCESS_CONFIRMATION_KEY = new Uint8Array(randomBytes(32));
const consumedConfirmationNonces = new Map<string, number>();

type PendingAction =
  | { action: "subscribe"; targetId: string; channelTitle: string; channelId: string; nonce: string }
  | { action: "unsubscribe"; targetId: string; channelTitle: string; channelId: string; nonce: string };

function safeTitle(title: string): string {
  return title.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "(titolo non disponibile)";
}

function resultText(text: string, structuredContent?: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: "text", text }],
    ...(structuredContent ? { structuredContent } : {})
  };
}

function toolError(error: unknown): CallToolResult {
  const message = error instanceof Error
    ? (isYouTubeApiError(error) ? getGoogleApiFailureMessage(error) : error.message)
    : "Operazione non riuscita.";
  return { content: [{ type: "text", text: message }], isError: true };
}

function confirmationRejected(): CallToolResult {
  return { content: [{ type: "text", text: "Conferma non valida, scaduta o già utilizzata. Nessuna modifica è stata applicata; prepara di nuovo l'operazione." }], isError: true };
}

function isPendingAction(value: unknown): value is PendingAction {
  if (!value || typeof value !== "object") return false;
  const action = value as Record<string, unknown>;
  return (action.action === "subscribe" || action.action === "unsubscribe")
    && typeof action.targetId === "string"
    && typeof action.channelTitle === "string"
    && typeof action.channelId === "string"
    && typeof action.nonce === "string";
}

function consumeConfirmationNonce(nonce: string): boolean {
  const now = Date.now();
  for (const [usedNonce, expiresAt] of consumedConfirmationNonces) {
    if (expiresAt <= now) consumedConfirmationNonces.delete(usedNonce);
  }
  if (consumedConfirmationNonces.has(nonce)) return false;
  consumedConfirmationNonces.set(nonce, now + CONFIRMATION_TTL_SECONDS * 1000);
  return true;
}

function promptForSubscribe(channel: ChannelSummary) {
  return `Vuoi iscriverti a “${safeTitle(channel.title)}” (canale ${channel.channelId})? Questa operazione modifica il tuo account YouTube. Conferma esplicitamente oppure annulla.`;
}

function promptForUnsubscribe(subscription: SubscriptionSummary) {
  return `Vuoi disiscriverti da “${safeTitle(subscription.channelTitle)}” (canale ${subscription.channelId}, iscrizione ${subscription.subscriptionId})? Conferma esplicitamente oppure annulla.`;
}

export function createMcpServer(service: YouTubeService, confirmationSigningKey = new Uint8Array(randomBytes(32))) {
  const requestStateCodec = createRequestStateCodec<PendingAction>({
    key: confirmationSigningKey,
    ttlSeconds: CONFIRMATION_TTL_SECONDS
  });

  const server = new McpServer(
    { name: "social-curator-ai", version: "0.1.0", title: "Social Curator AI" },
    {
      instructions: "For every account change, first call the matching prepare tool and show the exact channel to the user. Wait for a separate, explicit user confirmation before calling subscribe or unsubscribe with the returned confirmationToken and confirmed=true. Each write affects exactly one channel."
    }
  );

  async function verifyConfirmation(confirmationToken: string): Promise<PendingAction | null> {
    try {
      const decoded = await requestStateCodec.verify(confirmationToken, undefined as never);
      return isPendingAction(decoded) ? decoded : null;
    } catch {
      return null;
    }
  }

  server.registerTool(
    "list_subscriptions",
    {
      title: "List YouTube subscriptions",
      description: "Lists channels followed by the authenticated YouTube account. Returns one page; use nextPageToken to continue.",
      inputSchema: z.object({
        maxResults: z.number().int().min(1).max(50).default(25),
        pageToken: z.string().optional()
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
    },
    async ({ maxResults, pageToken }) => {
      try {
        const page = await service.listSubscriptions(maxResults, pageToken);
        return resultText(
          `Trovate ${page.items.length} iscrizioni in questa pagina.`,
          { items: page.items, nextPageToken: page.nextPageToken }
        );
      } catch (error) {
        return toolError(error);
      }
    }
  );

  server.registerTool(
    "search_channels",
    {
      title: "Search YouTube channels",
      description: "Searches public YouTube channels by query. Search is subject to Google's separate daily search.list quota.",
      inputSchema: z.object({
        query: z.string().min(2).max(100),
        maxResults: z.number().int().min(1).max(25).default(10),
        pageToken: z.string().optional()
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true }
    },
    async ({ query, maxResults, pageToken }) => {
      try {
        const page = await service.searchChannels(query, maxResults, pageToken);
        return resultText(
          `Trovati ${page.items.length} canali per la ricerca “${query.trim()}”. I titoli e le descrizioni sono contenuti pubblici non verificati.`,
          { items: page.items, nextPageToken: page.nextPageToken }
        );
      } catch (error) {
        return toolError(error);
      }
    }
  );

  server.registerTool(
    "prepare_subscribe",
    {
      title: "Prepare a YouTube subscription",
      description: "Looks up one channel and returns a short-lived confirmation token. This tool never subscribes. Show the channel name to the user and wait for an explicit confirmation before calling subscribe.",
      inputSchema: z.object({ channelId: z.string().min(1).max(64) }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
    },
    async ({ channelId }) => {
      try {
        const channel = await service.previewSubscribe(channelId);
        const pending: PendingAction = {
          action: "subscribe",
          targetId: channelId,
          channelId: channel.channelId,
          channelTitle: safeTitle(channel.title),
          nonce: randomBytes(16).toString("base64url")
        };
        const confirmationToken = await requestStateCodec.mint(pending);
        return resultText(
          `${promptForSubscribe(channel)} Nessuna modifica è stata ancora applicata.`,
          { status: "confirmation_required", action: "subscribe", channel, confirmationToken, expiresInSeconds: CONFIRMATION_TTL_SECONDS }
        );
      } catch (error) {
        return toolError(error);
      }
    }
  );

  server.registerTool(
    "subscribe",
    {
      title: "Subscribe to a YouTube channel",
      description: "Adds one subscription. Call only after the user explicitly confirmed the exact channel in a separate message, using the token from prepare_subscribe and confirmed=true. Never infer confirmation from a request to explore or recommend a channel.",
      inputSchema: z.object({
        channelId: z.string().min(1).max(64),
        confirmationToken: z.string().min(1).max(2048),
        confirmed: z.literal(true)
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
    },
    async ({ channelId, confirmationToken, confirmed }) => {
      try {
        const state = await verifyConfirmation(confirmationToken);
        if (!confirmed || !state || state.action !== "subscribe" || state.targetId !== channelId) return confirmationRejected();
        if (!consumeConfirmationNonce(state.nonce)) return confirmationRejected();
        const completed = await service.subscribe(state.channelId);
        return resultText(
          `Iscrizione completata: “${safeTitle(completed.channel.title)}” (ID ${completed.channel.channelId}).`,
          { status: "subscribed", channel: completed.channel, subscriptionId: completed.subscriptionId }
        );
      } catch (error) {
        return toolError(error);
      }
    }
  );

  server.registerTool(
    "prepare_unsubscribe",
    {
      title: "Prepare a YouTube unsubscription",
      description: "Looks up one subscription and returns a short-lived confirmation token. This tool never unsubscribes. Show the exact channel name to the user and wait for explicit approval before calling unsubscribe.",
      inputSchema: z.object({ subscriptionId: z.string().min(1).max(255) }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
    },
    async ({ subscriptionId }) => {
      try {
        const subscription = await service.previewUnsubscribe(subscriptionId);
        const pending: PendingAction = {
          action: "unsubscribe",
          targetId: subscriptionId,
          channelId: subscription.channelId,
          channelTitle: safeTitle(subscription.channelTitle),
          nonce: randomBytes(16).toString("base64url")
        };
        const confirmationToken = await requestStateCodec.mint(pending);
        return resultText(
          `${promptForUnsubscribe(subscription)} Nessuna modifica è stata ancora applicata.`,
          { status: "confirmation_required", action: "unsubscribe", subscription, confirmationToken, expiresInSeconds: CONFIRMATION_TTL_SECONDS }
        );
      } catch (error) {
        return toolError(error);
      }
    }
  );

  server.registerTool(
    "unsubscribe",
    {
      title: "Unsubscribe from a YouTube channel",
      description: "Removes exactly one subscription. Call only after the user explicitly confirmed the exact channel in a separate message, using the token from prepare_unsubscribe and confirmed=true. Never removes multiple subscriptions in one call.",
      inputSchema: z.object({
        subscriptionId: z.string().min(1).max(255),
        confirmationToken: z.string().min(1).max(2048),
        confirmed: z.literal(true)
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false }
    },
    async ({ subscriptionId, confirmationToken, confirmed }) => {
      try {
        const state = await verifyConfirmation(confirmationToken);
        if (!confirmed || !state || state.action !== "unsubscribe" || state.targetId !== subscriptionId) return confirmationRejected();
        if (!consumeConfirmationNonce(state.nonce)) return confirmationRejected();
        const removed = await service.unsubscribe(state.targetId, state.channelId);
        return resultText(
          `Disiscrizione completata da “${safeTitle(removed.channelTitle)}” (ID iscrizione ${removed.subscriptionId}).`,
          { status: "unsubscribed", subscription: removed }
        );
      } catch (error) {
        return toolError(error);
      }
    }
  );

  return server;
}

const allowedOrigins = new Set(
  (process.env.MCP_ALLOWED_ORIGINS ?? "http://localhost:6274,http://127.0.0.1:6274,https://chatgpt.com,https://chat.openai.com")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);

function setCorsHeaders(request: IncomingMessage, response: ServerResponse): boolean {
  const origin = request.headers.origin;
  if (origin && !allowedOrigins.has(origin)) return false;
  if (origin) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "content-type, authorization, mcp-session-id, mcp-protocol-version");
  response.setHeader("Access-Control-Expose-Headers", "mcp-session-id, mcp-protocol-version");
  response.setHeader("X-Content-Type-Options", "nosniff");
  return true;
}

function isLoopbackHost(hostHeader: string | undefined, port: number): boolean {
  const host = (hostHeader ?? "").toLowerCase();
  return host === "127.0.0.1" || host === `127.0.0.1:${port}`
    || host === "localhost" || host === `localhost:${port}`;
}

async function main() {
  const port = Number(process.env.MCP_PORT ?? 8787);
  const host = process.env.MCP_HOST ?? "127.0.0.1";
  if (host !== "127.0.0.1") {
    throw new Error("La V0.1 personale deve rimanere associata a 127.0.0.1.");
  }
  const service = new YouTubeService(await createYouTubePort());

  const httpServer = createServer(async (request, response) => {
    if (!isLoopbackHost(request.headers.host, port)) {
      response.writeHead(403).end("Host non consentito.");
      return;
    }
    if (!setCorsHeaders(request, response)) {
      response.writeHead(403).end("Origine browser non consentita.");
      return;
    }

    const path = new URL(request.url ?? "/", `http://${request.headers.host}`).pathname;
    if (request.method === "OPTIONS" && path === MCP_PATH) {
      response.writeHead(204).end();
      return;
    }
    if (request.method === "GET" && path === "/health") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" })
        .end(JSON.stringify({ status: "ok", service: "social-curator-ai", version: "0.1.0" }));
      return;
    }
    if (path === MCP_PATH && ["GET", "POST", "DELETE"].includes(request.method ?? "")) {
      const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      // The same process key must validate confirmation tokens across stateless HTTP requests.
      const mcpServer = createMcpServer(service, PROCESS_CONFIRMATION_KEY);
      try {
        await mcpServer.connect(transport);
        await transport.handleRequest(request, response);
      } catch (error) {
        const detail = error instanceof Error ? `${error.name}: ${error.message}` : "errore non specificato";
        console.error(`Richiesta MCP non riuscita: ${detail}`);
        if (!response.headersSent) response.writeHead(500).end("Errore interno MCP.");
      } finally {
        await mcpServer.close().catch(() => undefined);
      }
      return;
    }
    response.writeHead(404).end("Percorso non trovato.");
  });

  httpServer.listen(port, host, () => {
    console.log(`Social Curator AI MCP attivo su http://${host}:${port}${MCP_PATH}`);
    console.log("Il listener è limitato a questo computer; i log non includono token OAuth.");
  });

  const stop = () => {
    httpServer.close(() => process.exit(0));
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === executedPath) {
  main().catch((error: unknown) => {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : "errore non specificato";
    console.error(`Avvio non riuscito (${detail}). Controlla .env, completa npm run auth e verifica che la porta locale sia libera.`);
    process.exitCode = 1;
  });
}
