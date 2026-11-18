A tutti gli amici di ZeppBridge:

Ciao, sono Lingcang.

Questo è un aggiornamento importante. Prima di tutto, vorrei ringraziare tre collaboratori: felipepmdias, Jax Tsai e andrejd1.

Grazie al lavoro di felipepmdias sulla decodifica dei dati di allenamento della forza di Zepp, la nuova versione supporta finalmente i dettagli serie per serie e la mappa muscolare del corpo, rendendo l’esperienza dell’allenamento di forza in ZeppBridge davvero utile. Jax Tsai e andrejd1 mi hanno invece aiutato a migliorare le prestazioni su Linux. Non possiedo un dispositivo Linux, quindi ogni singolo miglioramento è stato testato passo dopo passo sui loro computer. Senza di loro ci sono molte cose che non sarei riuscito a fare da solo. Grazie a voi, e grazie anche a tutti gli utenti Linux che hanno continuato a inviare segnalazioni con pazienza.

In queste due settimane senza nuove versioni ho ricevuto più lettere che mai. Grazie a tutti coloro che mi hanno scritto per incoraggiarmi, scaldarmi il cuore o condividere idee meravigliose. Non ho mai avuto così tanti amici di penna.

Qualcuno mi ha detto di non riuscire a trovare la Cassetta postale, così ho aggiunto un pulsante per le lettere nell’angolo in alto a destra: un tocco per scrivere, una pressione prolungata per aprire la Cassetta postale, e un piccolo punto rosso si accende quando c’è una nuova risposta. Se durante l’uso noti qualcosa che non ti convince, scrivimi pure senza farti problemi per il disturbo. Ricevere le vostre lettere è già di per sé qualcosa che mi rende davvero felice.

Ora vorrei parlarti delle tre cose che mi stanno più a cuore in questo aggiornamento. Hanno occupato gran parte delle mie ultime due settimane e su alcune di esse ho riflettuto a lungo, esitando più volte.

**Sui Personal Agent nel cloud**

In questo periodo ho provato assistenti personali nel cloud come Muse e Hark. Più li uso, più sento che potrebbero cambiare il nostro modo di vivere, proprio come i Coding Agent stanno cambiando lo sviluppo software.

Lascia che ti racconti come sono trascorse le mie ultime due settimane.

Ho collegato ZeppBridge al mio sito personale in modo che Hark possa ricevere costantemente i miei dati sulla salute. Ogni mattina appena sveglio mi basta aprire Zepp per sincronizzare il sonno della notte precedente; il tempo di lavarmi i denti e la faccia, e Hark ha già riassunto la qualità del sonno e il recupero fisico, suggerendomi l’allenamento della giornata.

Lo stesso accade tornando a casa dopo una corsa. Sincronizzo i dati e ricevo subito l’analisi della corsa lunga appena conclusa: se la frequenza cardiaca è salita troppo, se ho rallentato nella seconda metà o se la cadenza è cambiata in modo evidente. Se poi voglio perfezionare ulteriormente il piano di allenamento, una volta davanti al computer posso discuterne nei dettagli con GPT o Claude tramite «Passa all’IA» di ZeppBridge.

Tutto questo si poteva fare anche prima, ma richiedeva sempre che mi ricordassi di farlo, che raccogliessi i dati e che avviassi la conversazione di persona. Un Personal Agent mi risparmia il passo più facile da trascurare: iniziare.

Questa esperienza mi ha convinto a portare la funzione agli utenti di ZeppBridge. Dopotutto, se è qualcosa che piace così tanto a me, perché non permettere a tutti di provarlo?

Ma ho esitato a lungo. Fin dall’inizio ZeppBridge ha promesso di mantenere l’archiviazione locale dei dati al centro di tutto, e consentire a un assistente nel cloud di leggere continuamente i tuoi dati sanitari richiede evidentemente la massima cautela.

Per questo motivo la funzione è disattivata per impostazione predefinita. Finché non la attivi tu stesso, ZeppBridge non la userà mai per inviare i tuoi dati a servizi esterni, e il tuo modo abituale di usare l’app non cambierà di una virgola.

Anche scegliendo di attivarla, dovrai preparare un tuo sito personale, configurare una chiave di accesso ruotabile e completare l’abbinamento con il tuo assistente personale. Forse non è adatta a tutti, ma se hai voglia di provarla, te la consiglio caldamente.

Credo sempre di più che assistenti personali come questi — capaci di prendersi cura di te, capirti e aiutarti al momento giusto — entreranno a far parte della nostra vita quotidiana.

**Portare «Stage Manager» nei dettagli dell’allenamento**

È un pensiero che mi accompagnava fin dalla versione 3.0.0.

Avevo ridisegnato le schede di quasi tutte le schermate, ma la pagina dei dettagli dell’allenamento continuava ad aspettare. Gli utenti di lunga data ricorderanno che era rimasta sostanzialmente fedele al design della 1.0.0: schede in posizioni e dimensioni fisse, senza alcuna libertà di riorganizzarle o combinarle.

Poi, in queste due settimane, provando iPadOS 27 ho aperto per caso Stage Manager e mi è venuta un’ispirazione.

Secondo me, la cosa più interessante di Stage Manager è che assegna a ogni finestra uno spazio indipendente. Puoi spostarla, ridimensionarla e ridefinire il suo rapporto con le altre finestre. Così mi sono chiesto: perché le schede di ZeppBridge non possono avere la stessa libertà?

Seguendo questa idea ho riprogettato l’intera pagina dei dettagli dell’allenamento, cercando di portarvi la logica interattiva di Stage Manager.

Ora puoi affiancare frequenza cardiaca, passo e percorso di corsa nella stessa schermata per analizzare la tua prestazione momento per momento; oppure puoi selezionare un istante su un grafico e vedere sulla mappa dove ti trovavi esattamente, per capire il legame tra la risposta del tuo corpo e l’ambiente circostante. Per l’allenamento della forza, puoi persino mettere insieme la mappa muscolare e le serie, vedendo a colpo d’occhio quali gruppi muscolari ha coinvolto ogni serie.

Spero che ognuno possa organizzare i dati che gli stanno davvero a cuore secondo le proprie abitudini.

Quanto alle altre combinazioni possibili, lascio a te il piacere di scoprirle poco a poco.

**Rifinire ZeppBridge CLI**

Oltre alla funzione «Passa all’IA» che già conosci, ZeppBridge integra anche MCP e una CLI, così gli strumenti di IA possono accedere direttamente ai dati locali senza dover scaricare o installare nulla in più.

A essere sinceri, finora questa parte era piuttosto grezza. È stato solo dopo aver ricevuto di recente l’invito dall’autore di SparkyFitness che ne ho riesaminato seriamente il valore.

Questa volta ho fatto soprattutto due cose.

Prima di tutto, l’IA è passata dal «poter solo guardare» al «poterti aiutare a tenere traccia».

Ora puoi chiedere all’IA collegata a ZeppBridge di registrare infortuni, gare, scarpe e sensazioni post-allenamento, oppure di correggere un tipo di allenamento riconosciuto in modo errato. Per esempio, ti basta dirle «ieri dopo la corsa mi faceva un po’ male il ginocchio sinistro» e lo annoterà al posto tuo.

Sapendo che permettere a un’IA di modificare i propri dati può mettere un po’ di apprensione, ogni voce scritta dall’IA compare nelle Impostazioni sotto «Ultime modifiche dell’IA» e può essere annullata in qualsiasi momento. L’IA non ha il permesso di eliminare dati. Se preferisci che legga soltanto i dati che hai scelto tu, puoi attivare «Solo attività condivise», limitando l’accesso ai contenuti condivisi e disattivando del tutto la scrittura.

Inoltre, puoi chiedere all’IA di sincronizzare i dati o esportare file direttamente. Tra gli strumenti collegabili con un clic si sono aggiunti anche OpenCode, Grok Build e Factory. Se c’è un altro strumento che ami e non è ancora supportato, scrivimi pure per farmelo sapere.

In secondo luogo, ZeppBridge ora può condividere i dati con altre applicazioni self-hosted.

SparkyFitness è un’app open-source e self-hosted per il monitoraggio della salute. Questa collaborazione mi ha fatto capire che ZeppBridge può diventare un ponte tra i dati di Zepp e altre app dedicate alla salute.

Per questo ho aggiunto alla CLI una modalità sempre attiva. Puoi eseguirla su un NAS o su un piccolo server domestico, così altre app possono leggere sonno, frequenza cardiaca, allenamenti, peso e altro ancora.

Il servizio offre un accesso in sola lettura, richiede una chiave per connettersi e la chiave può essere revocata in qualsiasi momento. Per impostazione predefinita accetta solo connessioni locali e non espone i percorsi degli allenamenti. Non si avvia mai da solo: se non ne hai bisogno, puoi semplicemente ignorarlo.

Il lavoro lato ZeppBridge è già concluso, ma SparkyFitness ha bisogno ancora di un po’ di tempo per completare l’adattamento, quindi l’integrazione tra i due non è ancora utilizzabile. Ti chiedo ancora un pizzico di pazienza.

Arrivato a scrivere fin qui, mi ritrovo di nuovo a chiedermi: quale sarà il futuro di ZeppBridge?

Forse ciò che mi riesce meglio è continuare a rispondere alle vostre esigenze, risolvere quei piccoli ma reali problemi e, di tanto in tanto, aggiungere qualche animazione originale per rendere l’uso dell’app un po’ più piacevole.

Ma potremmo spingerci oltre, realizzando cose che oggi non riusciamo nemmeno a immaginare?

Non lo so. Almeno per ora, ho trasformato in questo software molte idee che un tempo vivevano solo nella mia testa. Per il resto servirà forse un po’ di tempo, e continuare ad ascoltare le vostre storie.

Questa è ZeppBridge 3.2.0.

L’inverno non è uguale in tutto il mondo; forse, mentre leggi questa lettera, fuori dalla tua finestra sta già nevicando.

Sono cresciuto nella Cina meridionale e non ho visto molta neve in vita mia. Una volta ho visto le fotografie di un fotografo dedicate ad Aomori, in Giappone: case ricoperte da uno strato spesso di neve e alte pareti bianche lungo entrambi i lati della strada. Un inverno così, per me, sembra davvero lontano.

Non ho mai visto nemmeno un vero camino. A volte immagino che un giorno potrò sedermi accanto a un camino acceso, mentre fuori nevica fitto, con tutte le vostre lettere a portata di mano, leggendole con calma mentre osservo un agente trasformare a poco a poco in realtà ciò che un tempo potevo solo sognare.

Forse è proprio quella la vita che desidero.

Vi auguro tanta salute e un buon inverno!

— Lingcang
