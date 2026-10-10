import { google } from "googleapis";

export const YOUTUBE_WRITE_SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl";

export function getGoogleOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? "http://127.0.0.1:8788/oauth2callback";

  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth credentials are missing. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.");
  }

  const redirect = new URL(redirectUri);
  if (!["127.0.0.1", "localhost"].includes(redirect.hostname)) {
    throw new Error("The personal V0.1 OAuth callback must use localhost or 127.0.0.1.");
  }

  return { clientId, clientSecret, redirectUri };
}

export function createGoogleOAuthClient() {
  const { clientId, clientSecret, redirectUri } = getGoogleOAuthConfig();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}
