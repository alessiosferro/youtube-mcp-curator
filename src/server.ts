import "dotenv/config";
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import {
  acceptedContent,
  createRequestStateCodec,
  inputRequired,
  inputResponse,
  McpServer,
  type CallToolResult,
  type InputRequiredResult
} from "@modelcontextprotocol/server";
import { z } from "zod/v4";
import { createYouTubePort, getGoogleApiFailureMessage, isYouTubeApiError } from "./youtube-google-port.js";
import { confirmationOutcome } from "./confirmation.js";
import { YouTubeService, type ChannelSummary, type SubscriptionSummary } from "./youtube-service.js";

const MCP_PATH = "/mcp";
const confirmationSchema = z.object({
  confirmed: z.boolean().meta({ title: "Confermo questa modifica" })
});

type PendingAction =
  | { action: "subscribe"; targetId: string; channelTitle: string; channelId: string }
  | { action: "unsubscribe"; targetId: string; channelTitle: string; channelId: string };

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

function cancelledText(): CallToolResult {
  return resultText("Annullato. Nessuna modifica è stata applicata.");
}

function pendingMismatch(): CallToolResult {
  return { content: [{ type: "text", text: "La conferma non corrisponde all'operazione richiesta. Ripeti la richiesta dall'inizio." }], isError: true };
}

function promptForSubscribe(channel: ChannelSummary) {
  return `Vuoi iscriverti a “${safeTitle(channel.title)}” (canale ${channel.channelId})? Questa operazione modifica il tuo account YouTube. Conferma esplicitamente oppure annulla.`;
}

function promptForUnsubscribe(subscription: SubscriptionSummary) {
  return `Vuoi disiscriverti da “${safeTitle(subscription.channelTitle)}” (canale ${subscription.channelId}, iscrizione ${subscription.subscriptionId})? Conferma esplicitamente oppure annulla.`;
}

export function createMcpServer(service: YouTubeService, requestStateKey = new Uint8Array(randomBytes(32))) {
  const requestStateCodec = createRequestStateCodec<PendingAction>({
    key: requestStateKey,
    ttlSeconds: 300
  });

  const server = new McpServer(
    {
      name: "social-curator-ai",
      version: "0.1.0",
      title: "Social Curator AI"
    },
    {
      requestState: { verify: requestStateCodec.verify }
    }
  );

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
    "subscribe",
    {
      title: "Subscribe to a YouTube channel",
      description: "Subscribes the authenticated account to the channel ID only after the server presents an explicit confirmation form and the user accepts it. Never treat a request to explore or recommend a channel as approval to subscribe.",
      inputSchema: z.object({
        channelId: z.string().min(1).max(64)
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
    },
    async ({ channelId }, context): Promise<CallToolResult | InputRequiredResult> => {
      try {
        const state = context.mcpReq.requestState<PendingAction>();
        if (state && (state.action !== "subscribe" || state.targetId !== channelId)) return pendingMismatch();

        const response = inputResponse(context.mcpReq.inputResponses, "confirmation");
        const accepted = acceptedContent(context.mcpReq.inputResponses, "confirmation", confirmationSchema);
        const outcome = confirmationOutcome(accepted?.confirmed, response.kind === "elicit" ? response.action : undefined);
        if (outcome === "cancelled") return cancelledText();

        if (outcome === "confirmed") {
          if (!state || state.action !== "subscribe" || state.channelId !== channelId) return pendingMismatch();
          const completed = await service.subscribe(state.channelId);
          return resultText(
            `Iscrizione completata: “${safeTitle(completed.channel.title)}” (ID ${completed.channel.channelId}).`,
            { status: "subscribed", channel: completed.channel, subscriptionId: completed.subscriptionId }
          );
        }


        const channel = state?.action === "subscribe"
          ? { channelId: state.channelId, title: state.channelTitle, description: "", thumbnailUrl: null }
          : await service.previewSubscribe(channelId);
        const pending: PendingAction = state ?? {
          action: "subscribe",
          targetId: channelId,
          channelId: channel.channelId,
          channelTitle: safeTitle(channel.title)
        };
        return inputRequired({
          requestState: await requestStateCodec.mint(pending),
          inputRequests: {
            confirmation: inputRequired.elicit({
              message: promptForSubscribe(channel),
              requestedSchema: confirmationSchema
            })
          }
        });
      } catch (error) {
        return toolError(error);
      }
    }
  );

  server.registerTool(
    "unsubscribe",
    {
      title: "Unsubscribe from a YouTube channel",
      description: "Removes one subscription by subscription ID only after the server presents an explicit confirmation form and the user accepts it. It never removes multiple subscriptions in one call.",
      inputSchema: z.object({
        subscriptionId: z.string().min(1).max(255)
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
    },
    async ({ subscriptionId }, context): Promise<CallToolResult | InputRequiredResult> => {
      try {
        const state = context.mcpReq.requestState<PendingAction>();
        if (state && (state.action !== "unsubscribe" || state.targetId !== subscriptionId)) return pendingMismatch();

        const response = inputResponse(context.mcpReq.inputResponses, "confirmation");
        const accepted = acceptedContent(context.mcpReq.inputResponses, "confirmation", confirmationSchema);
        const outcome = confirmationOutcome(accepted?.confirmed, response.kind === "elicit" ? response.action : undefined);
        if (outcome === "cancelled") return cancelledText();

        if (outcome === "confirmed") {
          if (!state || state.action !== "unsubscribe" || state.targetId !== subscriptionId) return pendingMismatch();
          const removed = await service.unsubscribe(state.targetId, state.channelId);
          return resultText(
            `Disiscrizione completata da “${safeTitle(removed.channelTitle)}” (ID iscrizione ${removed.subscriptionId}).`,
            { status: "unsubscribed", subscription: removed }
          );
        }


        const subscription = state?.action === "unsubscribe"
          ? {
              subscriptionId: state.targetId,
              channelId: state.channelId,
              channelTitle: state.channelTitle,
              description: "",
              subscribedAt: null,
              thumbnailUrl: null,
              totalItemCount: null,
              newItemCount: null
            }
          : await service.previewUnsubscribe(subscriptionId);
        const pending: PendingAction = state ?? {
          action: "unsubscribe",
          targetId: subscriptionId,
          channelId: subscription.channelId,
          channelTitle: safeTitle(subscription.channelTitle)
        };
        return inputRequired({
          requestState: await requestStateCodec.mint(pending),
          inputRequests: {
            confirmation: inputRequired.elicit({
              message: promptForUnsubscribe(subscription),
              requestedSchema: confirmationSchema
            })
          }
        });
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
  const mcpServer = createMcpServer(service);
  const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await mcpServer.connect(transport);

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
      try {
        await transport.handleRequest(request, response);
      } catch {
        if (!response.headersSent) response.writeHead(500).end("Errore interno MCP.");
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
    httpServer.close(() => {
      void transport.close();
      void mcpServer.close();
      process.exit(0);
    });
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch(() => {
  console.error("Avvio non riuscito. Controlla .env, completa npm run auth e verifica che la porta locale sia libera.");
  process.exitCode = 1;
});
