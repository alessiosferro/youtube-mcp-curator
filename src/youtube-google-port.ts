import { createGoogleOAuthClient } from "./google-oauth.js";
import { loadTokens, saveTokens } from "./token-store.js";
import type { YouTubePort } from "./youtube-service.js";
import { YouTubeClient } from "./youtube-client.js";

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

  const youtube = new YouTubeClient(() => oauth);
  return {
    async listSubscriptions(args) {
      const response = await youtube.execute((api) =>
        api.subscriptions.list({
          part: ["snippet", "contentDetails"],
          mine: true,
          maxResults: args.maxResults,
          ...(args.pageToken ? { pageToken: args.pageToken } : {})
        })
      );
      return {
        items: apiItems(response.data.items),
        ...(response.data.nextPageToken ? { nextPageToken: response.data.nextPageToken } : {})
      };
    },

    async searchChannels(args) {
      const response = await youtube.execute((api) =>
        api.search.list({
          part: ["snippet"],
          q: args.query,
          type: ["channel"],
          maxResults: args.maxResults,
          ...(args.pageToken ? { pageToken: args.pageToken } : {})
        })
      );
      return {
        items: apiItems(response.data.items)
          .map((item) => ({ id: item.id?.channelId, snippet: item.snippet }))
          .filter((item) => Boolean(item.id)),
        ...(response.data.nextPageToken ? { nextPageToken: response.data.nextPageToken } : {})
      };
    },

    async getChannel(channelId) {
      const response = await youtube.execute((api) =>
        api.channels.list({
          part: ["snippet"],
          id: [channelId],
          maxResults: 1
        })
      );
      return response.data.items?.[0] ?? null;
    },

    async insertSubscription(channelId) {
      const response = await youtube.execute(
        (api) =>
          api.subscriptions.insert({
            part: ["snippet"],
            requestBody: {
              snippet: {
                resourceId: {
                  kind: "youtube#channel",
                  channelId
                }
              }
            }
          }),
        { retrySafe: false }
      );
      return { subscriptionId: response.data.id ?? null };
    },

    async getSubscription(subscriptionId) {
      // `id` and `mine` are mutually exclusive filters in subscriptions.list.
      // Resolve the ID first, then verify that it belongs to the authenticated
      // account with `mine` + `forChannelId` before allowing an unsubscribe.
      const response = await youtube.execute((api) =>
        api.subscriptions.list({
          part: ["snippet", "contentDetails"],
          id: [subscriptionId],
          maxResults: 1
        })
      );
      const candidate = response.data.items?.[0];
      const channelId = candidate?.snippet?.resourceId?.channelId;
      if (!candidate?.id || !channelId) return null;

      const ownSubscriptions = await youtube.execute((api) =>
        api.subscriptions.list({
          part: ["snippet"],
          mine: true,
          forChannelId: channelId,
          maxResults: 50
        })
      );
      return apiItems(ownSubscriptions.data.items).some((item) => item.id === subscriptionId)
        ? candidate
        : null;
    },

    async deleteSubscription(subscriptionId) {
      await youtube.execute(
        (api) => api.subscriptions.delete({ id: subscriptionId }),
        { retrySafe: false }
      );
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
  if (reason === "incompatibleParameters") {
    return "Richiesta YouTube non valida: due filtri non possono essere usati insieme. Nessuna modifica è stata applicata.";
  }
  if (reason === "insufficientPermissions") {
    return "Il collegamento Google non dispone dei permessi YouTube necessari. Ripeti npm run auth e accetta le autorizzazioni richieste.";
  }
  if (reason === "subscriptionDuplicate") return "Sei già iscritto a questo canale.";
  if (reason === "subscriptionNotFound") return "Iscrizione non trovata: potrebbe essere già stata rimossa.";
  if (reason === "subscriptionForbidden") {
    return "YouTube ha rifiutato la disiscrizione: il collegamento non è autorizzato per questa iscrizione. Ripeti npm run auth e verifica l'account collegato.";
  }
  if (reason === "publisherNotFound" || status === 404) return "Canale o iscrizione non trovati.";
  if (status === 401) return "Autorizzazione Google scaduta o revocata. Ripeti npm run auth.";
  if (status === 403) {
    return "Google ha rifiutato la richiesta. Controlla che YouTube Data API v3 sia attiva, il consenso OAuth e i limiti sulle iscrizioni.";
  }
  const details = [
    typeof status === "number" ? `HTTP ${status}` : undefined,
    reason ? `motivo ${reason}` : undefined
  ].filter(Boolean);
  return `La richiesta a YouTube non è riuscita${details.length ? ` (${details.join(", ")})` : ""}. Nessuna modifica è stata applicata.`;
}

export function isYouTubeApiError(error: unknown): boolean {
  return typeof error === "object" && error !== null && ("response" in error || "code" in error);
}
