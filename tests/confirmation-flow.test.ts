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

async function connectClient(confirm: "accept" | "decline") {
  const port = makePort();
  const server = createMcpServer(new YouTubeService(port), new Uint8Array(randomBytes(32)));
  const client = new Client(
    { name: "social-curator-test", version: "0.1.0" },
    { capabilities: { elicitation: {} } }
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  client.setRequestHandler("elicitation/create", async (request) => {
    expect(request.params.message).toContain("Science channel");
    return confirm === "accept"
      ? { action: "accept", content: { confirmed: true } }
      : { action: "decline" };
  });
  return { port, server, client };
}

describe("MCP write confirmation", () => {
  const openConnections: Array<{ server: ReturnType<typeof createMcpServer>; client: Client }> = [];

  afterEach(async () => {
    await Promise.all(openConnections.splice(0).map(async ({ server, client }) => {
      await Promise.all([server.close(), client.close()]);
    }));
  });

  it("subscribes only after the MCP confirmation is accepted", async () => {
    const connected = await connectClient("accept");
    openConnections.push(connected);
    const result = await connected.client.callTool({
      name: "subscribe",
      arguments: { channelId }
    });

    expect(connected.port.insertSubscription).toHaveBeenCalledExactlyOnceWith(channelId);
    expect(result.content).toContainEqual(expect.objectContaining({
      type: "text",
      text: expect.stringContaining("Iscrizione completata")
    }));
  });

  it("does not subscribe after the user declines", async () => {
    const connected = await connectClient("decline");
    openConnections.push(connected);
    await connected.client.callTool({
      name: "subscribe",
      arguments: { channelId }
    });

    expect(connected.port.insertSubscription).not.toHaveBeenCalled();
  });

  it("does not unsubscribe after the user declines", async () => {
    const connected = await connectClient("decline");
    openConnections.push(connected);
    await connected.client.callTool({
      name: "unsubscribe",
      arguments: { subscriptionId: "sub-1" }
    });

    expect(connected.port.deleteSubscription).not.toHaveBeenCalled();
  });

  it("unsubscribes only after the MCP confirmation is accepted", async () => {
    const connected = await connectClient("accept");
    openConnections.push(connected);
    const result = await connected.client.callTool({
      name: "unsubscribe",
      arguments: { subscriptionId: "sub-1" }
    });

    expect(connected.port.deleteSubscription).toHaveBeenCalledExactlyOnceWith("sub-1");
    expect(result.content).toContainEqual(expect.objectContaining({
      type: "text",
      text: expect.stringContaining("Disiscrizione completata")
    }));
  });
});
