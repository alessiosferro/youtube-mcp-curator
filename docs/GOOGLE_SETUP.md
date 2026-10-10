# Configurare Google OAuth e YouTube Data API

Questa procedura collega il server locale al tuo account Google. Il progetto non riceve né salva la password Google: Google presenta la propria pagina di consenso e restituisce al server locale un token OAuth.

## 1. Crea il progetto API

1. Apri [Google Cloud Console](https://console.cloud.google.com/).
2. Crea o seleziona un progetto di tua proprietà.
3. Attiva **YouTube Data API v3**.
4. Nella schermata **Google Auth Platform**, configura il pubblico dell’app. Per la prima prova personale puoi usare lo stato **Testing** e aggiungere il tuo account Google come test user.
5. Crea un OAuth Client ID di tipo **Web application**.
6. Aggiungi questo redirect URI autorizzato, carattere per carattere:

   `http://127.0.0.1:8788/oauth2callback`

   Se cambi `GOOGLE_REDIRECT_URI` in `.env`, aggiorna anche il redirect URI in Cloud Console. Il callback locale accetta solo `localhost` o `127.0.0.1`.

## 2. Inserisci le credenziali locali

Copia il modello e compilalo sul tuo computer:

```sh
cp .env.example .env
npm run generate-key
```

Inserisci nel file `.env`:

- `GOOGLE_CLIENT_ID`: il Client ID creato nella Console.
- `GOOGLE_CLIENT_SECRET`: il relativo Client Secret.
- `TOKEN_ENCRYPTION_KEY`: la stringa base64 prodotta dal comando.
- `GOOGLE_REDIRECT_URI`: il redirect URI configurato in Google.

Non inserire i valori in issue o messaggi. `.env` è ignorato da Git. Conserva la chiave di cifratura separatamente: senza di essa il file dei token non è recuperabile.

## 3. Autorizza il tuo account

Con `.env` completo:

```sh
npm run auth
```

Apri nel browser l’indirizzo stampato dal programma e scegli il tuo account Google. Controlla la schermata di consenso e autorizza lo scope YouTube richiesto. Al ritorno, il server salva i token cifrati nel percorso locale indicato da `TOKEN_STORE_PATH`.

Se Google non restituisce un refresh token, revoca l’accesso dell’app dalle impostazioni del tuo account Google e ripeti `npm run auth`.

## 4. Verifica

Avvia il server con `npm run dev`. Prova l’endpoint locale:

```sh
curl http://127.0.0.1:8787/health
```

La risposta attesa contiene `"status":"ok"`. Poi segui [la guida di test MCP](CHATGPT_SETUP.md).

## Note sullo stato OAuth di test

Per un’app esterna mantenuta nello stato Testing, Google limita i test agli utenti elencati e segnala che le autorizzazioni OAuth e i refresh token con scope YouTube scadono dopo sette giorni. Potrebbe quindi essere necessario ripetere il collegamento. Prima di un uso pubblico, verifica la classificazione dello scope e i requisiti di verifica correnti nella Console; non spostare l’app in produzione senza aver completato i requisiti Google applicabili.

Fonti ufficiali:

- [OAuth per applicazioni web server](https://developers.google.com/youtube/v3/guides/auth/server-side-web-apps)
- [OAuth 2.0 scopes per le API Google](https://developers.google.com/identity/protocols/oauth2/scopes)
- [Gestire il pubblico e lo stato Testing](https://support.google.com/cloud/answer/15549945)
- [Politiche OAuth 2.0 di Google](https://developers.google.com/identity/protocols/oauth2/policies)
