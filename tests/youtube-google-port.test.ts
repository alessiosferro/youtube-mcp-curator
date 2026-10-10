import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  oauth: {
    credentials: { refresh_token: "test-refresh-token" },
    on: vi.fn(),
    setCredentials: vi.fn()
  }
}));

vi.mock("../src/google-oauth.js", () => ({
  createGoogleOAuthClient: () => mocks.oauth
}));

vi.mock("../src/token-store.js", () => ({
  loadTokens: async () => ({ refresh_token: "test-refresh-token" }),
  saveTokens: async () => undefined
}));

vi.mock("../src/youtube-client.js", () => ({
  YouTubeClient: class {
    async execute<T>(operation: (api: unknown) => Promise<T>) {
      return operation({ subscriptions: { list: mocks.list } });
    }
  }
}));

import { createYouTubePort, getGoogleApiFailureMessage } from "../src/youtube-google-port.js";

const subscription = {
  id: "sub-1",
  snippet: { resourceId: { channelId: "UC1234567890123456789012" } }
};

describe("YouTube Google API port", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("looks up an ID and verifies ownership without combining exclusive filters", async () => {
    mocks.list
      .mockResolvedValueOnce({ data: { items: [subscription] } })
      .mockResolvedValueOnce({ data: { items: [subscription] } });
    const port = await createYouTubePort();

    await expect(port.getSubscription("sub-1")).resolves.toEqual(subscription);

    expect(mocks.list).toHaveBeenNthCalledWith(1, {
      part: ["snippet", "contentDetails"],
      id: ["sub-1"],
      maxResults: 1
    });
    expect(mocks.list).toHaveBeenNthCalledWith(2, {
      part: ["snippet"],
      mine: true,
      forChannelId: "UC1234567890123456789012",
      maxResults: 50
    });
  });

  it("does not return an ID that is not in the authenticated account", async () => {
    mocks.list
      .mockResolvedValueOnce({ data: { items: [subscription] } })
      .mockResolvedValueOnce({ data: { items: [] } });
    const port = await createYouTubePort();

    await expect(port.getSubscription("sub-1")).resolves.toBeNull();
  });

  it("explains incompatible YouTube request filters", () => {
    expect(getGoogleApiFailureMessage({
      response: {
        status: 400,
        data: { error: { errors: [{ reason: "incompatibleParameters" }] } }
      }
    })).toContain("due filtri non possono essere usati insieme");
  });
});
