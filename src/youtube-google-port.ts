import { google } from "googleapis";
import { createGoogleOAuthClient } from "./google-oauth.js";
import { loadTokens, saveTokens } from "./token-store.js";
import type { YouTubePort } from "./youtube-service.js";

function apiItems<T>(value: T[] | null | undefined): T[] {
  return value ?? [];
}

export async function createYouTubePort(): Promise<YouTubePort> {
  const tokens = await loadTokens();
  if (!tokens?.refresh_token) {
    throw new Error("Account Google non collegato. Completa prima la procedura con npm run auth.");
  }

  const oauth = createGoogleOAuthClient();
  oauth.setCredentials(tokens);
  let persistence = Promise.resolve();
  oauth.on("tokens", (updatedTokens) => {
    const merged = { ...oauth.credentials, ...updatedTokens };
    oauth.setCredentials(merged);
    persistence = persistence
      .then(() => saveTokens(merged))
      .catch(() => console.error("Impossibile aggiornare il token cifrato. Ripeti il collegamento Google se il problema continua."));
  });

  const youtube = google.youtube({ version: "v3", auth: oauth });
  return {
    async listSubscriptions(args) {
      const response = await youtube.subscriptions.list({
        part: ["snippet", "contentDetails"],
        mine: true,
        maxResults: args.maxResults,
        ...(args.pageToken ? { pageToken: args.pageToken } : {})
      });
      return {
        items: apiItems(response.data.items),
        ...(response.data.nextPageToken ? { nextPageToken: response.data.nextPageToken } : {})
      };
    },

    async searchChannels(args) {
      const response = await youtube.search.list({
        part: ["snippet"],
        q: args.query,
        type: ["channel"],
        maxResults: args.maxResults,
        ...(args.pageToken ? { pageToken: args.pageToken } : {})
      });
      return {
        items: apiItems(response.data.items)
          .map((item) => ({ id: item.id?.channelId, snippet: item.snippet }))
          .filter((item) => Boolean(item.id)),
        ...(response.data.nextPageToken ? { nextPageToken: response.data.nextPageToken } : {})
      };
    },

    async getChannel(channelId) {
      const response = await youtube.channels.list({
        part: ["snippet"],
        id: [channelId],
        maxResults: 1
      });
      return response.data.items?.[0] ?? null;
    },

    async insertSubscription(channelId) {
      const response = await youtube.subscriptions.insert({
        part: ["snippet"],
        requestBody: {
          snippet: {
            resourceId: {
              kind: "youtube#channel",
              channelId
            }
          }
        }
      });
      return { subscriptionId: response.data.id ?? null };
    },

    async getSubscription(subscriptionId) {
      const response = await youtube.subscriptions.list({
        part: ["snippet", "contentDetails"],
        id: [subscriptionId],
        mine: true,
        maxResults: 1
      });
      return response.data.items?.[0] ?? null;
    },

    async deleteSubscription(subscriptionId) {
      await youtube.subscriptions.delete({ id: subscriptionId });
    }
  };
}

export function getGoogleApiFailureMessage(error: unknown): string {
  const value = error as {
    code?: number;
    response?: { status?: number; data?: { error?: { errors?: Array<{ reason?: string }> } } };
  };
  const status = value?.response?.status ?? value?.code;
  const reason = value?.response?.data?.error?.errors?.[0]?.reason;

  if (reason === "quotaExceeded" || reason === "dailyLimitExceeded" || reason === "rateLimitExceeded") {
    return "Quota YouTube esaurita o limite temporaneo raggiunto. Controlla la pagina Quotas del progetto Google Cloud.";
  }
  if (reason === "subscriptionDuplicate") return "Sei già iscritto a questo canale.";
  if (reason === "publisherNotFound" || status === 404) return "Canale o iscrizione non trovati.";
  if (status === 401) return "Autorizzazione Google scaduta o revocata. Ripeti npm run auth.";
  if (status === 403) {
    return "Google ha rifiutato la richiesta. Controlla che YouTube Data API v3 sia attiva, il consenso OAuth e i limiti sulle iscrizioni.";
  }
  return "La richiesta a YouTube non è riuscita. Riprova e controlla la configurazione Google Cloud.";
}

export function isYouTubeApiError(error: unknown): boolean {
  return typeof error === "object" && error !== null && ("response" in error || "code" in error);
}
