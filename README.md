# Social Curator AI — V0.1

Server MCP personale per consultare e gestire le iscrizioni YouTube da ChatGPT. La V0.1 gira sul computer dell’utente, usa OAuth 2.0 Google e non richiede un account o un backend ospitato dal progetto.

## Funzioni

- `list_subscriptions`: legge una pagina delle iscrizioni dell’account collegato.
- `search_channels`: cerca canali pubblici su YouTube.
- `subscribe`: mostra il canale selezionato e richiede una conferma MCP esplicita prima dell’iscrizione.
- `unsubscribe`: mostra l’iscrizione selezionata e richiede una conferma MCP esplicita prima della rimozione.

L’agente può usare i risultati per proporre canali, ma la V0.1 non implementa un motore autonomo di raccomandazione. Le modifiche riguardano un solo canale per chiamata.

## Prerequisiti

- Node.js 24 o successivo.
- Un progetto Google Cloud dell’utente con YouTube Data API v3 attivata.
- Credenziali OAuth 2.0 create dall’utente in Google Cloud.
- MCP Inspector per provare direttamente il server; per ChatGPT, un Secure MCP Tunnel disponibile nell’account.

Non inserire password Google o credenziali OAuth in chat. Servono il Client ID, il Client Secret e una chiave locale di cifratura generata con il progetto. Tutti i valori sono esclusi da Git.

## Avvio rapido

1. Installa i pacchetti con `npm install`.
2. Copia `.env.example` in `.env` e inserisci le tue credenziali Google.
3. Genera una chiave con `npm run generate-key` e incollala in `TOKEN_ENCRYPTION_KEY`.
4. Completa il collegamento OAuth con `npm run auth`.
5. Avvia il server con `npm run dev`.
6. In un secondo terminale esegui `npm run inspect` e collega MCP Inspector a `http://127.0.0.1:8787/mcp`.

Per la configurazione Google e il test in ChatGPT, consulta:

- [Google OAuth e YouTube Data API](docs/GOOGLE_SETUP.md)
- [Test locale e collegamento a ChatGPT](docs/CHATGPT_SETUP.md)
- [Sicurezza, scope e quote](docs/SECURITY_AND_QUOTAS.md)
- [Preparazione alla pubblicazione](docs/PUBLISHING.md)

## Comandi di sviluppo

```sh
npm run typecheck
npm test
npm run generate-key
npm run auth
npm run dev
npm run inspect
```

Il server ascolta solo su `127.0.0.1`; il token Google viene cifrato in `.data/google-tokens.enc` con AES-256-GCM. Il file dei token e `.env` non devono essere aggiunti a Git.

## Stato della V0.1

La V0.1 è pensata per un solo utente sul computer locale. Per pubblicare un plugin installabile da altri utenti serviranno un endpoint HTTPS stabile, autenticazione MCP OAuth 2.1 multiutente, gestione isolata dei token, informative e verifiche di Google e OpenAI. La guida descrive questi passaggi; non contiene credenziali o URL di produzione.
