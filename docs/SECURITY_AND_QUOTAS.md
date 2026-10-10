# Sicurezza, autorizzazioni e quote

## Protezione della V0.1 locale

- Il server HTTP ascolta solo su `127.0.0.1`; non configurarlo su `0.0.0.0`.
- I token Google sono cifrati con AES-256-GCM e una chiave generata localmente. Il file è creato con permessi restrittivi e si trova in `.data/`.
- Le credenziali OAuth e la chiave di cifratura sono in `.env`, escluso da Git.
- Il server non registra token, refresh token o risposte integrali di YouTube nei log.
- La conferma usa due chiamate MCP compatibili con client che non supportano l’elicitation: `prepare_subscribe`/`prepare_unsubscribe` restituiscono solo l’anteprima e un token HMAC firmato, legato a tipo e ID dell’azione, valido cinque minuti. I tool di scrittura richiedono quel token e `confirmed: true`; la conferma è monouso e un token non valido, scaduto, riutilizzato o associato a un ID diverso non esegue la scrittura.
- `unsubscribe` dichiara `destructiveHint: true`, così ChatGPT può chiedere la propria approvazione oltre al gate del server. `subscribe` è un’aggiunta reversibile, quindi dichiara `destructiveHint: false`, ma richiede comunque un messaggio di conferma separato prima della chiamata di scrittura.
- `subscribe` e `unsubscribe` operano su un solo canale per chiamata. L’iscrizione viene ricontrollata prima della rimozione.

La modalità personale presuppone che il computer locale sia sotto il controllo dell’utente. Non esporre la porta 8787 su una rete pubblica. Per più utenti o per un server remoto servono autenticazione MCP, separazione dei token per utente, secret management e procedure di revoca.

## Scope Google richiesto

Il programma richiede `https://www.googleapis.com/auth/youtube.force-ssl`: Google lo accetta per `subscriptions.insert`, necessario a iscriversi. Non esiste uno scope API limitato alle sole iscrizioni; Google descrive `youtube.force-ssl` come capace di vedere, modificare e cancellare permanentemente anche video, valutazioni, commenti e sottotitoli. Questo accesso è più ampio delle funzioni offerte dalla V0.1. La schermata Google mostra lo scope prima del consenso.

La Console Google assegna la classificazione corrente dello scope. Le applicazioni pubbliche che chiedono scope sensibili o ristretti possono dover completare verifica del brand, verifica dello scope e, per alcuni scope ristretti trattati su server, una valutazione di sicurezza. Controlla la classificazione attuale nella Google Auth Platform prima della distribuzione.

## Quote verificate il 10 ottobre 2026

| Chiamata | Costo o limite documentato |
|---|---:|
| `subscriptions.list` | 1 unità per pagina |
| `subscriptions.insert` | 50 unità |
| `subscriptions.delete` | 50 unità |
| `search.list` | 1 unità per richiesta; bucket distinto di 100 richieste al giorno per progetto |

Il budget predefinito indicato da Google è 10.000 unità al giorno per gli altri metodi, oltre ai bucket separati per la ricerca. Ogni pagina aggiuntiva è una nuova chiamata e consuma quota. Google può cambiare l’allocazione. Le quote si controllano nella pagina **Quotas** di Google Cloud Console. Un’estensione di quota richiede il percorso di audit di conformità YouTube.

YouTube può anche rifiutare un’iscrizione duplicata, un canale non valido, un account al limite massimo di iscrizioni o richieste troppo ravvicinate. Il server restituisce messaggi sintetici e non ripete automaticamente le modifiche.

## Revoca e privacy

Puoi revocare l’accesso da Google Account → Sicurezza → Connessioni con app e servizi di terze parti. Elimina anche `.data/google-tokens.enc` per rimuovere la copia locale cifrata. Il server deve essere fermato prima di cancellare il file.

YouTube richiede che gli utenti mantengano controllo sulle azioni fatte per loro conto e che la privacy policy descriva dati consultati, conservati e condivisi. Se il prodotto passa a un servizio remoto, la gestione dei dati e delle richieste di cancellazione dovrà rispettare i termini YouTube, inclusa la cancellazione dei dati conservati dopo la revoca nei tempi previsti.

Fonti ufficiali:

- [Subscriptions: insert](https://developers.google.com/youtube/v3/docs/subscriptions/insert)
- [Subscriptions: list](https://developers.google.com/youtube/v3/docs/subscriptions/list)
- [Quota calculator](https://developers.google.com/youtube/v3/determine_quota_cost)
- [OAuth scopes Google](https://developers.google.com/identity/protocols/oauth2/scopes)
- [Verifica scope restricted](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)
- [Politiche YouTube API e controllo dell’utente](https://developers.google.com/youtube/terms/developer-policies)
