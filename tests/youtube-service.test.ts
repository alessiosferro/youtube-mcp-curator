import { describe, expect, it, vi } from "vitest";
import { YouTubeService, type YouTubePort } from "../src/youtube-service.js";

const channelId = "UC1234567890123456789012";

function makePort(overrides: Partial<YouTubePort> = {}): YouTubePort {
  return {
    listSubscriptions: vi.fn(async () => ({
      items: [{
        id: "sub-1",
        snippet: {
          title: "Science channel",
          resourceId: { channelId },
          publishedAt: "2026-01-01T00:00:00Z"
        },
        contentDetails: { totalItemCount: 12, newItemCount: 2 }
      }],
      nextPageToken: "next-page"
    })),
    searchChannels: vi.fn(async () => ({
      items: [{ id: channelId, snippet: { title: "Science channel", description: "About science" } }]
    })),
    getChannel: vi.fn(async (id) => ({ id, snippet: { title: "Science channel" } })),
    insertSubscription: vi.fn(async () => ({ subscriptionId: "sub-created" })),
    getSubscription: vi.fn(async (id) => ({
      id,
      snippet: { title: "Science channel", resourceId: { channelId } }
    })),
    deleteSubscription: vi.fn(async () => undefined),
    ...overrides
  };
}

describe("YouTube subscription service", () => {
  it("returns the subscription page and next-page token", async () => {
    const port = makePort();
    const service = new YouTubeService(port);
    const result = await service.listSubscriptions(25);

    expect(result.items).toEqual([expect.objectContaining({
      subscriptionId: "sub-1",
      channelId,
      channelTitle: "Science channel",
      totalItemCount: 12
    })]);
    expect(result.nextPageToken).toBe("next-page");
  });

  it("searches only channels and normalizes the query", async () => {
    const port = makePort();
    const service = new YouTubeService(port);
    const result = await service.searchChannels("  science  ");

    expect(port.searchChannels).toHaveBeenCalledWith({ query: "science", maxResults: 10 });
    expect(result.items[0]).toEqual(expect.objectContaining({ channelId, title: "Science channel" }));
  });

  it("validates a channel before an insert is possible", async () => {
    const port = makePort();
    const service = new YouTubeService(port);

    await expect(service.previewSubscribe("not-a-channel-id")).rejects.toThrow("non valido");
    expect(port.insertSubscription).not.toHaveBeenCalled();
  });

  it("deletes only the requested subscription ID", async () => {
    const port = makePort();
    const service = new YouTubeService(port);
    const result = await service.unsubscribe("sub-1");

    expect(result.subscriptionId).toBe("sub-1");
    expect(port.deleteSubscription).toHaveBeenCalledExactlyOnceWith("sub-1");
  });

  it("does not delete an ID that is not in the authenticated account", async () => {
    const port = makePort({ getSubscription: vi.fn(async () => null) });
    const service = new YouTubeService(port);

    await expect(service.unsubscribe("unknown-sub")).rejects.toThrow("non trovata");
    expect(port.deleteSubscription).not.toHaveBeenCalled();
  });

  it("bounds page sizes and rejects short searches", async () => {
    const port = makePort();
    const service = new YouTubeService(port);

    await service.listSubscriptions(500);
    expect(port.listSubscriptions).toHaveBeenCalledWith({ maxResults: 50 });
    await expect(service.searchChannels("x")).rejects.toThrow("da 2 a 100");
  });
});
