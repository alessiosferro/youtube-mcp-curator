# Adozione del server YouTube MCP upstream

La V0.1 adotta come base tecnica il progetto [prmichaelsen/youtube-mcp](https://github.com/prmichaelsen/youtube-mcp), release `1.1.1`, verificata al commit `f0175a41dbdf252e39e110de1c4ca133f9beb1b6` il 10 ottobre 2026. Il progetto upstream dichiara licenza MIT.

Dal progetto upstream abbiamo preso il modello di client tipizzato per YouTube Data API, la ricerca per tipo di risorsa e le chiamate `subscriptions.list`, `subscriptions.insert` e `subscriptions.delete`. La nostra applicazione registra solo `list_subscriptions`, `search_channels`, `subscribe` e `unsubscribe`.

## Modifiche di sicurezza per l'uso personale

- I token OAuth restano cifrati localmente con AES-256-GCM.
- Il server HTTP rimane associato a `127.0.0.1`.
- Il token Google richiede solo lo scope necessario alle operazioni YouTube selezionate.
- Le iscrizioni e le disiscrizioni passano da una richiesta di conferma firmata, con scadenza e verifica dell'azione e dell'identificativo.
- I tentativi automatici sono limitati alle letture. Le scritture non vengono ripetute automaticamente dopo un errore di rete.
- L'intero catalogo upstream, che comprende altri strumenti di scrittura, non viene registrato.

Il pacchetto upstream è utile come implementazione generale, ma il suo server standard espone un insieme più ampio di operazioni. La configurazione OAuth upstream salva i token in un file JSON e la configurazione HTTP predefinita ascolta su tutte le interfacce; questi comportamenti non vengono usati da Social Curator AI.

## Verifica della release scelta

Nel clone temporaneo della release `1.1.1`, tutti i 101 test upstream e il typecheck sono passati. La prima installazione segnalava 47 vulnerabilità nelle dipendenze, incluse 11 runtime. Dopo gli aggiornamenti compatibili, l'audit delle sole dipendenze runtime è sceso a zero; l'audit completo lasciava 21 avvisi nelle dipendenze di sviluppo.

La voce eseguibile upstream crea il server senza passare un oggetto OAuth, mentre la registrazione degli strumenti avviene solo quando l'autenticazione viene fornita. Per questo Social Curator AI usa il codice selezionato come base e mantiene il proprio avvio, OAuth cifrato e catalogo ristretto. I test upstream non verificano da soli queste protezioni.

## Aggiornamenti upstream

Prima di aggiornare la base, confrontare le modifiche a ricerca, iscrizioni, OAuth, client Google e trasporto. Rieseguire i test del progetto, controllare gli scope richiesti e verificare che tutte le operazioni di scrittura richiedano ancora conferma lato server.
