import { google, type youtube_v3 } from "googleapis";

type GoogleOAuthClient = InstanceType<typeof google.auth.OAuth2>;

interface ExecuteOptions {
  /** Retry only calls that are safe to repeat (read operations). */
  retrySafe?: boolean;
  maxRetries?: number;
}

function statusCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const value = error as { code?: unknown; response?: { status?: unknown } };
  const status = value.response?.status ?? value.code;
  return typeof status === "number" ? status : undefined;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Narrow adaptation of the YouTubeClient pattern from
 * https://github.com/prmichaelsen/youtube-mcp (MIT, upstream commit
 * f0175a41dbdf252e39e110de1c4ca133f9beb1b6).
 *
 * This version injects the encrypted-token OAuth client and retries only
 * explicitly safe reads; subscription writes are never retried automatically.
 */
export class YouTubeClient {
  constructor(private readonly getOAuthClient: () => Promise<GoogleOAuthClient> | GoogleOAuthClient) {}

  async getApi(): Promise<youtube_v3.Youtube> {
    const auth = await this.getOAuthClient();
    return google.youtube({ version: "v3", auth });
  }

  async execute<T>(
    operation: (api: youtube_v3.Youtube) => Promise<T>,
    options: ExecuteOptions = {}
  ): Promise<T> {
    const retrySafe = options.retrySafe ?? true;
    const maxRetries = retrySafe ? Math.max(0, Math.min(3, options.maxRetries ?? 3)) : 0;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        return await operation(await this.getApi());
      } catch (error) {
        const status = statusCode(error);
        if (!retrySafe || status === undefined || status < 500 || attempt === maxRetries) {
          throw error;
        }
        await delay(2 ** attempt * 1000);
      }
    }

    throw new Error("YouTube request failed after retries.");
  }
}
