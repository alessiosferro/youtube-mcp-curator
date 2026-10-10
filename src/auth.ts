import "dotenv/config";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { createGoogleOAuthClient, YOUTUBE_WRITE_SCOPE } from "./google-oauth.js";
import { saveTokens } from "./token-store.js";

const oauth = createGoogleOAuthClient();
const redirectUri = new URL(process.env.GOOGLE_REDIRECT_URI ?? "http://127.0.0.1:8788/oauth2callback");
const callbackState = randomBytes(24).toString("hex");
let completed = false;

const server = createServer(async (request, response) => {
  if (!request.url) {
    response.writeHead(400).end("Richiesta non valida.");
    return;
  }

  const callbackUrl = new URL(request.url, redirectUri.origin);
  if (request.method !== "GET" || callbackUrl.pathname !== redirectUri.pathname) {
    response.writeHead(404).end("Percorso non trovato.");
    return;
  }

  if (callbackUrl.searchParams.get("state") !== callbackState) {
    response.writeHead(400).end("Verifica OAuth non riuscita. Riprova con npm run auth.");
    return;
  }

  const error = callbackUrl.searchParams.get("error");
  if (error) {
    response.writeHead(400, { "content-type": "text/html; charset=utf-8" })
      .end("<p>Accesso Google annullato o non riuscito. Puoi chiudere questa scheda.</p>");
    console.error("Autorizzazione Google non completata.");
    server.close();
    return;
  }

  const code = callbackUrl.searchParams.get("code");
  if (!code) {
    response.writeHead(400).end("Codice OAuth mancante.");
    return;
  }

  try {
    const { tokens } = await oauth.getToken(code);
    if (!tokens.refresh_token) {
      response.writeHead(400, { "content-type": "text/html; charset=utf-8" })
        .end("<p>Google non ha restituito un refresh token. Revoca l'accesso dell'app in Google Account e ripeti npm run auth.</p>");
      console.error("Google non ha restituito un refresh token. Nessun token è stato salvato.");
      server.close();
      return;
    }

    await saveTokens(tokens);
    completed = true;
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" })
      .end("<p>Account YouTube collegato. I token sono stati salvati cifrati su questo computer. Puoi chiudere questa scheda.</p>");
    console.log("Account YouTube collegato; token cifrati salvati nel percorso locale configurato.");
    server.close();
  } catch {
    response.writeHead(500, { "content-type": "text/html; charset=utf-8" })
      .end("<p>Collegamento non riuscito. Controlla la configurazione OAuth e i log locali.</p>");
    console.error("Scambio del codice OAuth non riuscito. I dettagli sensibili sono stati omessi.");
    server.close();
  }
});

server.listen(Number(redirectUri.port || 80), redirectUri.hostname, () => {
  const authorizationUrl = oauth.generateAuthUrl({
    access_type: "offline",
    include_granted_scopes: true,
    prompt: "consent",
    scope: [YOUTUBE_WRITE_SCOPE],
    state: callbackState
  });
  console.log(`Apri questo indirizzo per autorizzare l'accesso YouTube:\n${authorizationUrl}`);
  console.log(`In attesa del callback locale su ${redirectUri.origin}${redirectUri.pathname}`);
});

process.on("SIGINT", () => {
  if (!completed) console.log("\nAutorizzazione interrotta; nessun nuovo token è stato salvato.");
  server.close(() => process.exit(0));
});
