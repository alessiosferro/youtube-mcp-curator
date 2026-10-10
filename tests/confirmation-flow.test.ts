import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createMcpServer } from "../src/server.js";
import { YouTubeService, type YouTubePort } from "../src/youtube-service.js";

const channelId = "UC1234567890123456789012";

function makePort(): YouTubePort & {
  insertSubscription: ReturnType<typeof vi.fn>;
  deleteSubscription: ReturnType<typeof vi.fn>;
} {
  return {
    listSubscriptions: vi.fn(async () => ({ items: [] })),
    searchChannels: vi.fn(async () => ({ items: [] })),
    getChannel: vi.fn(async (id) => ({ id, snippet: { title: "Science channel" } })),
    insertSubscription: vi.fn(async () => ({ subscriptionId: "sub-created" })),
    getSubscription: vi.fn(async (id) => ({
      id,
      snippet: { title: "Science channel", resourceId: { channelId } }
    })),
    deleteSubscription: vi.fn(async () => undefined)
  };
}

async function connectClient(port = makePort(), key = new Uint8Array(randomBytes(32))) {
  const server = createMcpServer(new YouTubeService(port), key);
  // Deliberately do not advertise or handle MCP elicitation: ChatGPT connections
  // can complete the preview/confirmation round trip using ordinary tool calls.
  const client = new Client({ name: "social-curator-test", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { port, server, client };
}

function readConfirmationToken(result: { structuredContent?: unknown }): string {
  const content = result.structuredContent as { status?: string; confirmationToken?: string } | undefined;
  expect(content?.status).toBe("confirmation_required");
  expect(content?.confirmationToken).toEqual(expect.any(String));
  return content!.confirmationToken!;
}

describe("ChatGPT-compatible write confirmation", () => {
  const openConnections: Array<{ server: ReturnType<typeof createMcpServer>; client: Client }> = [];

  afterEach(async () => {
    await Promise.all(openConnections.splice(0).map(async ({ server, client }) => {
      await Promise.all([server.close(), client.close()]);
    }));
  });

  it("subscribes only after the user confirms a prepared channel", async () => {
    const connected = await connectClient();
    openConnections.push(connected);
    const preview = await connected.client.callTool({ name: "prepare_subscribe", arguments: { channelId } });
    const token = readConfirmationToken(preview);

    expect(connected.port.insertSubscription).not.toHaveBeenCalled();
    const result = await connected.client.callTool({
      name: "subscribe",
      arguments: { channelId, confirmationToken: token, confirmed: true }
    });

    expect(connected.port.insertSubscription).toHaveBeenCalledExactlyOnceWith(channelId);
    expect(result.content).toContainEqual(expect.objectContaining({
      type: "text",
      text: expect.stringContaining("Iscrizione completata")
    }));
  });

  it("does not subscribe when the user has not confirmed after the preview", async () => {
    const connected = await connectClient();
    openConnections.push(connected);
    await connected.client.callTool({ name: "prepare_subscribe", arguments: { channelId } });

    expect(connected.port.insertSubscription).not.toHaveBeenCalled();
  });

  it("does not unsubscribe when the user has not confirmed after the preview", async () => {
    const connected = await connectClient();
    openConnections.push(connected);
    await connected.client.callTool({ name: "prepare_unsubscribe", arguments: { subscriptionId: "sub-1" } });

    expect(connected.port.deleteSubscription).not.toHaveBeenCalled();
  });

  it("marks only the actual unsubscribe tool as destructive for ChatGPT approval", async () => {
    const connected = await connectClient();
    openConnections.push(connected);
    const { tools } = await connected.client.listTools();

    expect(tools.find((tool) => tool.name === "prepare_unsubscribe")?.annotations?.destructiveHint).toBe(false);
    expect(tools.find((tool) => tool.name === "unsubscribe")?.annotations?.destructiveHint).toBe(true);
  });

  it("unsubscribes only the prepared subscription after confirmation", async () => {
    const connected = await connectClient();
    openConnections.push(connected);
    const preview = await connected.client.callTool({ name: "prepare_unsubscribe", arguments: { subscriptionId: "sub-1" } });
    const token = readConfirmationToken(preview);
    expect(connected.port.deleteSubscription).not.toHaveBeenCalled();

    const result = await connected.client.callTool({
      name: "unsubscribe",
      arguments: { subscriptionId: "sub-1", confirmationToken: token, confirmed: true }
    });

    expect(connected.port.deleteSubscription).toHaveBeenCalledExactlyOnceWith("sub-1");
    expect(result.content).toContainEqual(expect.objectContaining({
      type: "text",
      text: expect.stringContaining("Disiscrizione completata")
    }));
  });

  it("accepts a prepared confirmation across stateless MCP server instances in the same process", async () => {
    const port = makePort();
    const key = new Uint8Array(randomBytes(32));
    const previewConnection = await connectClient(port, key);
    const confirmConnection = await connectClient(port, key);
    openConnections.push(previewConnection, confirmConnection);
    const preview = await previewConnection.client.callTool({
      name: "prepare_unsubscribe",
      arguments: { subscriptionId: "sub-1" }
    });
    const token = readConfirmationToken(preview);

    const result = await confirmConnection.client.callTool({
      name: "unsubscribe",
      arguments: { subscriptionId: "sub-1", confirmationToken: token, confirmed: true }
    });

    expect(result.isError).not.toBe(true);
    expect(port.deleteSubscription).toHaveBeenCalledExactlyOnceWith("sub-1");
  });

  it("rejects a confirmation token for a different subscription", async () => {
    const connected = await connectClient();
    openConnections.push(connected);
    const preview = await connected.client.callTool({ name: "prepare_unsubscribe", arguments: { subscriptionId: "sub-1" } });
    const token = readConfirmationToken(preview);
    const result = await connected.client.callTool({
      name: "unsubscribe",
      arguments: { subscriptionId: "sub-2", confirmationToken: token, confirmed: true }
    });

    expect(result.isError).toBe(true);
    expect(connected.port.deleteSubscription).not.toHaveBeenCalled();
  });

  it("rejects replay of a consumed confirmation token", async () => {
    const connected = await connectClient();
    openConnections.push(connected);
    const preview = await connected.client.callTool({ name: "prepare_unsubscribe", arguments: { subscriptionId: "sub-1" } });
    const token = readConfirmationToken(preview);
    const request = {
      name: "unsubscribe",
      arguments: { subscriptionId: "sub-1", confirmationToken: token, confirmed: true }
    };

    await connected.client.callTool(request);
    const replay = await connected.client.callTool(request);

    expect(replay.isError).toBe(true);
    expect(connected.port.deleteSubscription).toHaveBeenCalledExactlyOnceWith("sub-1");
  });
});
