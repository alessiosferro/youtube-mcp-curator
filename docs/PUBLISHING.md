# Dal server personale al plugin pubblico

La V0.1 locale è pronta per essere collegata e provata sul computer dell’utente. Per pubblicare Social Curator AI nel catalogo universale di ChatGPT e Codex, il servizio dovrà diventare un’integrazione multiutente ospitata pubblicamente.

## Lavoro tecnico richiesto

1. Pubblicare il server MCP su un endpoint HTTPS stabile, per esempio `https://mcp.tuodominio.example/mcp`. Secure MCP Tunnel e gli URL temporanei servono per i test, non per l’invio al catalogo.
2. Implementare OAuth 2.1 per collegare ogni utente al server MCP: metadati `/.well-known/oauth-protected-resource`, metadati dell’authorization server, PKCE S256, audience/resource token, verifica di issuer, audience, scadenza e scope a ogni richiesta.
3. Usare un provider OAuth o un broker consolidato. Google OAuth resta il passaggio che concede al servizio l’accesso YouTube; il token di Google non sostituisce il token OAuth MCP richiesto da ChatGPT.
4. Conservare i token Google in un secret store cifrato, isolandoli per utente. Implementare revoca, cancellazione e gestione dei refresh token. Non registrare token né dati personali nei log.
5. Definire privacy policy, condizioni, supporto e sito pubblico. Descrivere in modo preciso il più ampio scope Google richiesto e il fatto che il plugin legge la lista delle iscrizioni.
6. Verificare il progetto Google: pubblico, OAuth consent, classificazione degli scope, verifica e audit YouTube applicabili.
7. Preparare il pacchetto plugin con manifest root `plugin.json` e server MCP in `mcp.json`; inserire URL e identità reali solo quando pronti. Non aggiungere segreti al pacchetto.
8. Inviare il pacchetto dalla directory Plugin di OpenAI Platform. Completare la verifica dell’identità dello sviluppatore e i materiali di revisione.

## Materiali di revisione OpenAI

Per una prima revisione di un plugin MCP, la documentazione OpenAI richiede cinque casi positivi e tre negativi. Prepara inoltre un video dimostrativo accessibile ai revisori, credenziali di test dedicate con dati fittizi se serve un account, note di rilascio, logo e collegamenti pubblici a privacy, termini, supporto e prodotto. Le credenziali di test si inseriscono nel modulo sicuro della dashboard, non nel file ZIP.

La revisione pubblica non è garantita: la directory effettua controlli automatici e revisione. Dopo la pubblicazione, il server ospitato viene ricontrollato. La disponibilità del plugin segue i paesi selezionati e la distribuzione del catalogo.

## Stato

Nella V0.1 non sono presenti URL pubblici, account demo, identità sviluppatore verificata o credenziali OAuth. Questi dati devono essere creati dal titolare del prodotto; non sono inventati né inseriti nel repository.

Fonti ufficiali:

- [Guida OpenAI per plugin](https://developers.openai.com/plugins)
- [Autenticare utenti MCP](https://developers.openai.com/plugins/build/auth)
- [Pacchettizzare plugin](https://developers.openai.com/plugins/build/plugins)
- [Testare e collegare a ChatGPT](https://developers.openai.com/plugins/deploy/connect-chatgpt)
- [Inviare e pubblicare](https://developers.openai.com/plugins/deploy/submission)
- [Requisiti di revisione per server MCP remoti](https://developers.openai.com/plugins/deploy/app-review)
- [Politiche sviluppatori YouTube](https://developers.google.com/youtube/terms/developer-policies)
