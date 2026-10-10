export interface ChannelSummary {
  channelId: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
}

export interface SubscriptionSummary {
  subscriptionId: string;
  channelId: string;
  channelTitle: string;
  description: string;
  subscribedAt: string | null;
  thumbnailUrl: string | null;
  totalItemCount: number | null;
  newItemCount: number | null;
}

interface ApiChannel {
  id?: string | null | undefined;
  snippet?: {
    title?: string | null | undefined;
    description?: string | null | undefined;
    thumbnails?: { default?: { url?: string | null | undefined } | undefined; medium?: { url?: string | null | undefined } | undefined } | null | undefined;
  } | null | undefined;
}

interface ApiSubscription {
  id?: string | null | undefined;
  snippet?: {
    title?: string | null | undefined;
    channelTitle?: string | null | undefined;
    description?: string | null | undefined;
    publishedAt?: string | null | undefined;
    resourceId?: { channelId?: string | null | undefined } | null | undefined;
    thumbnails?: { default?: { url?: string | null | undefined } | undefined; medium?: { url?: string | null | undefined } | undefined } | null | undefined;
  } | null | undefined;
  contentDetails?: {
    totalItemCount?: number | null | undefined;
    newItemCount?: number | null | undefined;
  } | null | undefined;
}

export interface YouTubePort {
  listSubscriptions(args: {
    maxResults: number;
    pageToken?: string;
  }): Promise<{ items: ApiSubscription[]; nextPageToken?: string }>;
  searchChannels(args: {
    query: string;
    maxResults: number;
    pageToken?: string;
  }): Promise<{ items: ApiChannel[]; nextPageToken?: string }>;
  getChannel(channelId: string): Promise<ApiChannel | null>;
  insertSubscription(channelId: string): Promise<{ subscriptionId: string | null }>;
  getSubscription(subscriptionId: string): Promise<ApiSubscription | null>;
  deleteSubscription(subscriptionId: string): Promise<void>;
}

export type WritePreview<T> =
  | { status: "confirmation_required"; item: T }
  | { status: "cancelled" }
  | { status: "completed"; item: T };

function thumbnailUrl(snippet: ApiChannel["snippet"] | ApiSubscription["snippet"]): string | null {
  return snippet?.thumbnails?.medium?.url ?? snippet?.thumbnails?.default?.url ?? null;
}

function channelSummary(channel: ApiChannel): ChannelSummary | null {
  if (!channel.id) return null;
  return {
    channelId: channel.id,
    title: channel.snippet?.title ?? "(titolo non disponibile)",
    description: channel.snippet?.description ?? "",
    thumbnailUrl: thumbnailUrl(channel.snippet)
  };
}

function subscriptionSummary(subscription: ApiSubscription): SubscriptionSummary | null {
  if (!subscription.id) return null;
  return {
    subscriptionId: subscription.id,
    channelId: subscription.snippet?.resourceId?.channelId ?? "",
    channelTitle: subscription.snippet?.title ?? subscription.snippet?.channelTitle ?? "(titolo non disponibile)",
    description: subscription.snippet?.description ?? "",
    subscribedAt: subscription.snippet?.publishedAt ?? null,
    thumbnailUrl: thumbnailUrl(subscription.snippet),
    totalItemCount: subscription.contentDetails?.totalItemCount ?? null,
    newItemCount: subscription.contentDetails?.newItemCount ?? null
  };
}

export class YouTubeService {
  constructor(private readonly api: YouTubePort) {}

  async listSubscriptions(maxResults = 25, pageToken?: string) {
    const result = await this.api.listSubscriptions({
      maxResults: Math.max(1, Math.min(50, Math.floor(maxResults))),
      ...(pageToken ? { pageToken } : {})
    });
    return {
      items: result.items.map(subscriptionSummary).filter((item): item is SubscriptionSummary => item !== null),
      nextPageToken: result.nextPageToken ?? null
    };
  }

  async searchChannels(query: string, maxResults = 10, pageToken?: string) {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2 || normalizedQuery.length > 100) {
      throw new Error("La ricerca deve contenere da 2 a 100 caratteri.");
    }

    const result = await this.api.searchChannels({
      query: normalizedQuery,
      maxResults: Math.max(1, Math.min(25, Math.floor(maxResults))),
      ...(pageToken ? { pageToken } : {})
    });
    return {
      items: result.items.map(channelSummary).filter((item): item is ChannelSummary => item !== null),
      nextPageToken: result.nextPageToken ?? null
    };
  }

  async previewSubscribe(channelId: string): Promise<ChannelSummary> {
    if (!/^UC[a-zA-Z0-9_-]{22}$/.test(channelId)) {
      throw new Error("ID canale YouTube non valido.");
    }
    const channel = await this.api.getChannel(channelId);
    const summary = channel ? channelSummary(channel) : null;
    if (!summary) throw new Error("Canale YouTube non trovato.");
    return summary;
  }

  async subscribe(channelId: string): Promise<{ channel: ChannelSummary; subscriptionId: string | null }> {
    const channel = await this.previewSubscribe(channelId);
    const result = await this.api.insertSubscription(channelId);
    return { channel, subscriptionId: result.subscriptionId };
  }

  async previewUnsubscribe(subscriptionId: string): Promise<SubscriptionSummary> {
    if (subscriptionId.trim().length === 0 || subscriptionId.length > 255) {
      throw new Error("ID iscrizione non valido.");
    }
    const subscription = await this.api.getSubscription(subscriptionId);
    const summary = subscription ? subscriptionSummary(subscription) : null;
    if (!summary) throw new Error("Iscrizione non trovata: potrebbe essere già stata rimossa.");
    return summary;
  }

  async unsubscribe(subscriptionId: string, expectedChannelId?: string): Promise<SubscriptionSummary> {
    const current = await this.previewUnsubscribe(subscriptionId);
    if (expectedChannelId && current.channelId !== expectedChannelId) {
      throw new Error("L’iscrizione è cambiata dopo la conferma. Nessuna modifica è stata applicata.");
    }
    await this.api.deleteSubscription(subscriptionId);
    return current;
  }
}
