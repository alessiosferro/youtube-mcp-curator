# Testare il server locale

La V0.1 offre due percorsi. MCP Inspector è il test diretto più semplice e non richiede una chiave OpenAI. Per provarlo dentro ChatGPT, collega lo stesso server locale tramite Secure MCP Tunnel.

## A. MCP Inspector

1. Completa [la configurazione Google](GOOGLE_SETUP.md).
2. Avvia il server:

   ```sh
   npm run dev
   ```

3. In un secondo terminale avvia l’Inspector:

   ```sh
   npm run inspect
   ```

4. Nell’interfaccia seleziona **Streamable HTTP**, inserisci `http://127.0.0.1:8787/mcp` e connettiti.
5. Prova `list_subscriptions` e `search_channels`.
6. Per testare una scrittura, chiama prima `prepare_subscribe` o `prepare_unsubscribe`. Questi strumenti mostrano l’oggetto e restituiscono un token temporaneo senza modificare YouTube. Dopo aver mostrato il canale e aver ricevuto una conferma esplicita dell’utente, chiama `subscribe` o `unsubscribe` con lo stesso ID, il token e `confirmed: true`.

Gli ID canale YouTube iniziano con `UC`. Il tool `unsubscribe` richiede l’ID dell’iscrizione, non l’ID del canale.

## B. ChatGPT tramite Secure MCP Tunnel

Il tunnel fa arrivare le chiamate di ChatGPT al server locale con una connessione in uscita. Il server resta associato a `127.0.0.1` e non viene pubblicato su Internet.

Servono:

- accesso ai Secure MCP Tunnel nell’organizzazione OpenAI Platform;
- un tunnel associato sia all’organizzazione Platform sia al workspace ChatGPT da usare;
- un runtime API key OpenAI per `tunnel-client`;
- il programma `tunnel-client`, scaricato dalla pagina Tunnel della Platform.

La chiave OpenAI serve solo al client del tunnel. Il server YouTube non chiama l’API OpenAI. Non incollare la chiave in `.env`, in questo repository o in chat.

1. Avvia prima il server: `npm run dev`.
2. In Platform crea un tunnel e annota il suo `tunnel_id`. Associa il tunnel al workspace ChatGPT che userà il plugin.
3. Scarica il client dalla pagina ufficiale [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels) e segui `tunnel-client help quickstart`.
4. Configura il client per inoltrare a `http://127.0.0.1:8787/mcp`, con il tuo `tunnel_id` e runtime API key. Tieni il client in esecuzione durante il test.
5. In ChatGPT apri **Plugins**, aggiungi un server MCP personalizzato e scegli **Tunnel** come connessione. Seleziona il tunnel associato e crea l’app personale.
6. Installa l’app nel workspace, avvia una nuova chat Work e selezionala con `@`.
7. Dopo aver cambiato nomi, schemi o annotazioni dei tool, aggiorna/ricarica la connessione del server MCP in ChatGPT. Poi prova letture e una singola modifica. L’assistente deve mostrare il canale, attendere un messaggio separato di conferma e solo allora invocare il tool di scrittura; ChatGPT può inoltre chiedere la propria approvazione per `unsubscribe`. Se non arriva conferma, non chiamare il tool di scrittura.

La disponibilità di plugin personali, developer mode e tunnel dipende dalle autorizzazioni del workspace e dell’organizzazione Platform. OpenAI documenta l’Inspector e il tunnel come percorsi di test distinti. Il tunnel è adatto al test privato, ma non è accettato come endpoint per la pubblicazione pubblica.

Fonti ufficiali:

- [Quickstart per collegare un server MCP a ChatGPT](https://developers.openai.com/plugins/build/app-quickstart)
- [Connettere e testare un plugin](https://developers.openai.com/plugins/deploy/connect-chatgpt)
- [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
