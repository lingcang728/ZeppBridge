/** Italian P4 copy. Same shape as zh in ../p4Copy.ts; only the strings differ. */
import type { P4Copy } from '../p4Copy';

const pack: P4Copy = {
  chapters: [
    { id: 'motion', name: 'Design', title: 'Amore a prima vista.', lead: 'Navigazione in vetro, schede che si trasformano in pagine e giorni da sfogliare come carte da gioco.', points: [
      { id: 'glass', title: 'Vetro', text: 'Premi e trascina lentamente lungo la barra di navigazione, poi tocca per cambiare. I bordi rifrangono la luce seguendo il dito.', scene: 'glass' },
      { id: 'morph', title: 'Trasformazione', text: 'Una scheda si apre a tutta pagina e torna al suo posto quando torni indietro. Un elemento a fuoco, tutto il resto sfuma.', scene: 'morph' },
      { id: 'poker', title: 'Tavolo delle carte', text: 'Sfoglia le schede dei giorni, poi apri a ventaglio un mese o una settimana. Conserva i migliori nella scatola di raccolta.', scene: 'poker' },
      { id: 'theme', title: 'Giorno e notte', text: 'Temi scuro e chiaro. Un tocco e scende la notte.', scene: 'theme' },
    ] },
    { id: 'connection', name: 'Connessione', title: 'I tuoi dati, dal cloud alla scrivania.', lead: 'Collega il tuo account Zepp e i tuoi dati si sincronizzano su questo computer. Scegli la frequenza e lascia fare alla sincronizzazione automatica.', points: [
      { id: 'account', title: 'Accesso ufficiale', text: 'Accedi a Zepp nel browser di sistema, anche con account di terze parti. Verifica lo stato dell’autorizzazione in qualsiasi momento.', scene: 'account' },
      { id: 'sync', title: 'Sincronizzazione automatica', text: 'Disattivata, 15, 30 o 60 minuti. Tu riposi, il sistema sincronizza.', scene: 'sync' },
      { id: 'devices', title: 'Riconosce il tuo orologio', text: 'I modelli vengono riconosciuti automaticamente. Se uno è errato, puoi correggerlo manualmente.', scene: 'devices' },
      { id: 'local', title: 'Resta su questo computer', text: 'I dati sanitari sincronizzati da Zepp sono salvati su questo computer e non passano mai dai nostri server. Decidi tu cosa condividere con l’IA.', scene: 'local' },
    ] },
    { id: 'records', name: 'Comprensione', title: 'Decine di metriche a colpo d’occhio.', lead: 'Tutti i trend in un’unica schermata per vedere come sta il tuo corpo. Apri una metrica per consultare lo storico completo.', points: [
      { id: 'overview', title: 'Il tuo ordine', text: 'Sonno o allenamento per primi: la home page segue ciò che conta per te. Scorri e apri i dettagli.', scene: 'overview' },
      { id: 'hourly', title: 'Ora per ora', text: 'Passi, distanza e calorie per ogni ora della giornata.', scene: 'hourly' },
      { id: 'workouts', title: 'Ogni corsa ha una sua eco', text: 'Confronta ogni sessione con i tuoi allenamenti su distanze simili, esaminando battito cardiaco, passo e tracciato.', scene: 'workouts' },
      { id: 'gaps', title: 'Nessun dato inventato', text: 'Se non è stato misurato, rimane vuoto. Niente zeri fittizi, valori precedenti o stime ipotetiche.', scene: 'gaps' },
    ] },
    { id: 'ai', name: 'Invia all’IA', title: 'Usa l’abbonamento che hai già.', lead: 'Scegli i giorni e i tuoi dati diventano un unico file. Consegnalo all’IA che usi già, continua la conversazione e importa la bozza.', points: [
      { id: 'providers', title: 'Sette tra cui scegliere', text: 'ChatGPT, Claude, Gemini, Kimi, DeepSeek, Doubao e Grok. Con il tuo account e la tua quota consueti.', scene: 'ai' },
      { id: 'prompt', title: 'Chiedi ciò che vuoi', text: 'Modifica la domanda preimpostata o scrivine una tua da zero.', scene: 'prompt' },
      { id: 'events', title: 'Il contesto conta', text: 'Annota un raffreddore, un viaggio o una settimana intensa di lavoro così che l’IA comprenda meglio alti e bassi.', scene: 'events' },
      { id: 'autopaste', title: 'Completamente automatico · Windows', text: 'Quando attivo, incolla e invia per te, verificando la schermata prima di ogni passaggio. Disattivato per impostazione predefinita.', scene: 'autopaste' },
    ] },
    { id: 'ai-plan', name: 'Piano di allenamento', title: 'Perfeziona sul computer. Allenati al polso.', lead: 'Racconta all’IA come ti senti e pianificherà la settimana. Incollalo di ritorno, modificalo finché non calza a pennello, poi invialo all’orologio.', points: [
      { id: 'receive', title: 'Incolla di ritorno', text: 'Dalla conversazione alla bozza: copia il testo e hai un piano settimanale pronto.', scene: 'receive' },
      { id: 'edit', title: 'Il tuo piano', text: 'Trascina per scambiare due giorni, apri qualsiasi data e modifica durata e intensità di ogni passaggio. Passa sopra con il mouse per i dettagli.', scene: 'plan-edit' },
      { id: 'templates', title: 'Modelli e importazione', text: 'Salvalo come modello per la prossima volta. Importa anche file .zwo e allenamenti .fit.', scene: 'templates' },
      { id: 'easy', title: 'Stanchezza oggi', text: 'Se erano previsti intervalli ma la prontezza è sotto il consueto, passa a una sessione facile con un tocco. Confermi tu prima dell’invio.', scene: 'easy' },
    ] },
  ],
  records: {
    sleep: { title: 'Sonno', text: 'Dalle fasi di una notte all’andamento degli ultimi sette giorni. Apri e scorri verso il basso.' },
    workouts: { title: 'Allenamenti', text: 'Visualizza l’intera sessione e scopri come si differenzia da quelle precedenti.' },
  },
  settings: {
    title: 'Impostazioni',
    lead: 'Sfoglia le schede grandi una per una; quelle piccole si impilano come in un portacarte. Account, sincronizzazione, visualizzazione e dati a portata di tocco.',
    summaryTitle: 'I dettagli vivono nelle Impostazioni.',
    summaryLead: 'Quattordici impostazioni quotidiane, raccolte in un unico mazzo di schede.',
    items: [
      { id: 'sync', title: 'Sincronizzazione automatica', text: 'Disattivata, 15, 30 o 60 minuti. Scegline una.', icon: 'auto-sync' },
      { id: 'retention', title: 'Dieci anni, tutti qui', text: 'Scarica fino a dieci anni di cronologia su questo computer e conservala. Non svanisce quando la finestra del cloud si sposta.', icon: 'database' },
      { id: 'data', title: 'Copertura dei dati', text: 'Cosa può essere sincronizzato e cosa no, a colpo d’occhio.', icon: 'overview' },
      { id: 'mcp', title: 'MCP', text: 'Strumenti locali come Claude Code e Codex possono interrogare direttamente. L’invio dei piani richiede un’autorizzazione separata.', icon: 'structured-data' },
      { id: 'formats', title: 'Quattro formati', text: 'JSON · CSV · GPX, oltre a FIT nella pagina degli allenamenti.', icon: 'document' },
      { id: 'units', title: 'Unità di misura', text: 'Chilometri o miglia. Distanza e andatura cambiano insieme.', icon: 'settings' },
      { id: 'time', title: 'Ora', text: 'Segui la tua area geografica o scegli il formato a 12 o 24 ore.', icon: 'auto-sync' },
      { id: 'date', title: 'Formato data', text: 'Giorno, mese e anno nell’ordine a cui sei abituato.', icon: 'document' },
      { id: 'scale', title: 'Scala dell’interfaccia', text: 'Ingrandisci o rimpicciolisci l’intera finestra.', icon: 'overview' },
      { id: 'backup', title: 'Istantanee e ripristino', text: 'Salva istantanee del database e ripristinale quando necessario.', icon: 'database' },
      { id: 'api', title: 'API locale', text: 'Vincolata a 127.0.0.1. Sola lettura, token richiesto.', icon: 'structured-data' },
      { id: 'privacy', title: 'Privacy e sicurezza', text: 'Le credenziali sono protette dal sistema operativo. I token non finiscono mai nei log.', icon: 'browser-login' },
      { id: 'filename', title: 'Nomi dei file', text: 'Decidi tu come nominare i file preparati per l’IA.', icon: 'document' },
      { id: 'folder', title: 'Portalo con te', text: 'I tuoi dati risiedono in una cartella su questo computer e tutto ciò che hai scritto qui — valutazioni, piani, attività IA — si esporta in un unico file JSON.', icon: 'database' },
    ],
  },
  nav: [
    { label: 'Scopri ZeppBridge', links: [{ id: 'motion', label: 'Design' }, { id: 'connection', label: 'Connessione' }, { id: 'records', label: 'Comprensione' }] },
    { label: 'Dai dati all’azione', links: [{ id: 'ai', label: 'Invia all’IA' }, { id: 'ai-plan', label: 'Piano di allenamento' }, { id: 'record-sleep', label: 'Sonno e allenamenti' }] },
    { label: 'A modo tuo', links: [{ id: 'connect', label: 'Impostazioni' }, { id: 'set-mcp', label: 'MCP' }, { id: 'set-api', label: 'API locale' }] },
  ],
  demoPrompt: 'Mercoledì prossimo ho impegni. Mantieni una sessione a intervalli e rendi il resto facile.',
};

export default pack;
