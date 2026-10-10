import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockGoogleYoutube } = vi.hoisted(() => ({ mockGoogleYoutube: vi.fn() }));

vi.mock("googleapis", () => ({ google: { youtube: mockGoogleYoutube } }));

import { YouTubeClient } from "../src/youtube-client.js";

describe("YouTubeClient adopted API wrapper", () => {
  beforeEach(() => {
    mockGoogleYoutube.mockReset().mockReturnValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries a safe read after a YouTube server error", async () => {
    vi.useFakeTimers();
    const client = new YouTubeClient(() => ({ fake: true }) as never);
    let attempts = 0;

    const result = client.execute(async () => {
      attempts += 1;
      if (attempts === 1) throw { response: { status: 503 } };
      return "ok";
    });

    await vi.runAllTimersAsync();
    await expect(result).resolves.toBe("ok");
    expect(attempts).toBe(2);
  });

  it("never retries subscription writes after an ambiguous failure", async () => {
    const client = new YouTubeClient(() => ({ fake: true }) as never);
    const write = vi.fn(async () => {
      throw { response: { status: 503 } };
    });

    await expect(client.execute(write, { retrySafe: false })).rejects.toMatchObject({
      response: { status: 503 }
    });
    expect(write).toHaveBeenCalledTimes(1);
  });
});
