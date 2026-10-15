import { plural, type LocalePack } from '../index';

/**
 * Pacchetto di lingua italiana (it).
 *
 * Linee guida:
 * - Azioni all'infinito ("Esporta", "Annulla", "Sincronizza")
 * - Stati concisi e diretti
 * - Errori: causa + azione correttiva
 * - Corretto uso delle lettere accentate (à, è, é, ì, ò, ù)
 * - Nessun dato inventato o approssimato per campioni assenti
 */

export default {
  modules: {
'App': {
    quickReturn: (page: string) => `Torna a ${page}`,
    previousPage: 'Pagina precedente',
    bottomNav: 'Navigazione principale mobile',
    browserPreview: 'L’anteprima del browser non legge i dati dell’account; apri l’applicazione desktop.',
    compacted: (saved: string) => `Messaggi storici compattati — liberati circa ${saved} di spazio su disco.`,
    compacting: (pending: number) =>
      `Compattazione dei messaggi storici in corso (${pending} rimanenti) — il banner scomparirà al termine; la sincronizzazione è in attesa.`,
    mainNav: 'Navigazione principale',
    navHandoff: 'Passa all’IA',
    navOverview: 'Panoramica',
    navSettings: 'Impostazioni',
    preparingData: 'Apertura del database locale; il primo avvio dopo un aggiornamento potrebbe richiedere una decina di secondi…',
    routeNotFound: 'Questa pagina non esiste; ritorno alla panoramica.',
    skipToContent: 'Salta al contenuto principale',
    trayHint: 'Chiudendo la finestra, ZeppBridge rimane nella barra di sistema; la sincronizzazione automatica continua.',
  },

  'components/BackupPanel': {
    title: 'Istantanee e ripristino del database',
    intro1a: 'Un’istantanea è una copia completa dell’intero file ',
    intro1b: '. Rimane su questo computer e non viene mai caricata da nessuna parte. ZeppBridge ne crea una automaticamente prima di ogni aggiornamento del database; puoi crearne una manualmente in qualsiasi momento.',
    compareLead: 'Non confondere i tre tipi di esportazione: ',
    compareExchange: ' serve allo scambio di dati con altri strumenti (solo per l’intervallo selezionato);',
    compareSnapshotName: 'un’istantanea del database',
    compareSnapshot: ' è una copia completa del database per il ripristino di emergenza, leggibile solo da ZeppBridge;',
    comparePackName: 'un pacchetto per l’IA',
    comparePack: ' raccoglie ciò che selezioni e anonimizzi per un modello esterno. Solo un’istantanea può ripristinare il database allo stato precedente.',

    pendingTitle: 'Un ripristino è in coda',
    pendingBodyA: (stagedAt: string) => `In coda da ${stagedAt}. Il database verrà sostituito al `,
    pendingNextStart: 'prossimo avvio',
    pendingBodyB: '. Il database attuale viene prima salvato come punto di ripristino, così da poter tornare indietro in caso di problemi.',
    cancelRestore: 'Annulla il ripristino',

    creating: 'Creazione in corso…',
    createSnapshot: 'Crea un’istantanea',
    refreshList: 'Aggiorna l’elenco',
    noSnapshots: 'Ancora nessuna istantanea.',

    pinned: 'Conservata',
    metaLine: (size: string, appVersion: string, schemaVersion: number) =>
      `${size} · app ${appVersion} · schema ${schemaVersion}`,
    coverage: (from: string, to: string) => ` · campioni da ${from} a ${to}`,
    noSamples: ' · nessun campione di salute in questa istantanea',
    verifyFailed: (problem: string) => `Verifica non riuscita: ${problem}`,
    problemFileMissing: 'Il file di backup non è più presente nella cartella dei backup',
    problemSizeMismatch: 'La dimensione del file di backup non corrisponde al manifesto — potrebbe essere danneggiato',
    problemSha256Mismatch: 'Il checksum SHA-256 del file di backup non corrisponde al manifesto — potrebbe essere danneggiato o modificato',
    problemIntegrityFailed: 'Il file di backup non ha superato il controllo di integrità SQLite',
    problemUnknown: 'Questa istantanea non ha superato la verifica per un motivo non registrato.',
    blockerFutureSchema: (backup: number, current: number) =>
      `Questa istantanea proviene da una versione più recente di ZeppBridge (schema ${backup} rispetto a ${current} attuale). Aprendola qui si perderebbero campi, quindi non verrà ripristinata e il database attuale rimarrà intatto. Aggiorna prima ZeppBridge.`,
    blockerUnknown: 'Al momento non è possibile ripristinare questa istantanea; nessun motivo registrato.',
    verifyPassed: 'Nuova verifica superata: file, dimensioni, SHA-256 e integrità corrispondono.',
    integrityOk: (sha: string) => `Controllo di integrità superato alla creazione · SHA-256 ${sha}…`,
    integrityBad: 'Il controllo di integrità non è riuscito al momento della creazione. Non eseguire il ripristino da questa istantanea.',
    verifyAgain: 'Verifica di nuovo',
    unpin: 'Non conservare più',
    pin: 'Conserva',
    restoreToThis: 'Ripristina questa',

    previewTitle: 'Anteprima del ripristino',
    compatibilityUnknown: 'Compatibilità sconosciuta.',
    colContent: 'Contenuto',
    colBackup: 'Nell’istantanea',
    colCurrent: 'Database attuale',
    colDelta: 'Differenza',
    previewNote: 'Differenza negativa: dopo il ripristino ci saranno meno record rispetto a ora. Il ripristino non recupera mai dati dal cloud — sincronizza di nuovo se ti servono ancora quei dati.',
    staging: 'Messa in coda in corso…',
    stageRestore: 'Metti in coda il ripristino (applicato al prossimo avvio)',
    cancel: 'Annulla',

    listFailed: 'Impossibile leggere l’elenco dei backup',
    created: (size: string) => `Istantanea creata: ${size}, controllo di integrità superato.`,
    createFailed: 'Creazione dell’istantanea non riuscita',
    verifyError: 'Verifica non riuscita',
    pinFailed: 'Impossibile modificare il contrassegno di conservazione',
    previewFailed: 'Impossibile generare l’anteprima del ripristino',
    staged: 'Ripristino messo in coda: non cambia nulla durante questa sessione, il database verrà sostituito al prossimo avvio di ZeppBridge.',
    stageFailed: 'Impossibile mettere in coda il ripristino',
    cancelled: 'Ripristino in coda annullato; il database è rimasto invariato.',
    cancelFailed: 'Impossibile annullare il ripristino',

    kind: {
      manual: 'manuale',
      pre_migration: 'automatico prima dell’aggiornamento',
      pre_restore: 'punto di ripristino pre-ripristino',
    },
    compatibility: {
      future_schema_refused: 'Versione dell’applicazione più recente, struttura illeggibile qui — impossibile ripristinare.',
      older_schema_will_migrate: 'Schema precedente — aggiornamento automatico al prossimo avvio dopo il ripristino.',
      same_schema: 'Stessa versione dello schema di questa applicazione — ripristino diretto.',
    },
    table: {
      daily_metrics: 'Metriche giornaliere',
      life_events: 'Eventi di vita',
      metric_samples: 'Campioni delle metriche',
      raw_records: 'Messaggi non elaborati',
      sleep_sessions: 'Sonno',
      workout_samples: 'Punti dell’allenamento',
      workouts: 'Sessioni di allenamento',
    },
  },

  'components/CoverageNotice': {
    empty: 'Nessun dato su questo computer. Sincronizza una volta per visualizzare i grafici.',
    emptyAfterSync: 'La sincronizzazione è stata completata senza trovare dati. Questo account non ha dati per questo periodo in Zepp oppure l’orologio non li ha ancora inviati all’app Zepp. Controlla prima l’app Zepp sul telefono, quindi sincronizza di nuovo.',
    emptyUnconfirmedRegion: 'La sincronizzazione è stata completata senza trovare dati. La connessione non ha potuto confermare la regione Zepp del tuo account e ZeppBridge sta usando una stima: se la regione è errata, la sincronizzazione sembra riuscire ma non restituisce nulla. Prova a riconnettere l’account.',
    short: (covered: number, earliest: string) =>
      `Questo computer conserva solo ${covered} giorni (a partire dal ${earliest}). Prima di questa data non c’è nulla perché non è ancora stato recuperato nulla, non perché non ci fossero registrazioni.`,
    syncNow: 'Sincronizza ora',
    backfill: 'Recupera più cronologia',
    backfilling: 'Recupero in corso…',
    reconnect: 'Riconnetti l’account',
    connect: 'Connetti l’account Zepp',
    emptyNotConnected: 'Nessun dato su questo computer al momento. Connetti prima il tuo account Zepp, quindi sincronizza una volta.',
    keepAllHint: 'Per impostazione predefinita, questo computer conserva tutto: nulla viene eliminato dopo la sincronizzazione.',
    keepAllChange: 'Conserva solo il periodo recente',
  },

  'components/DeviceMarquee': {
    marqueeAria: 'Dispositivi Amazfit attualmente a catalogo',
  },

  'components/DevicePicker': {
    pickerAria: 'Scegli manualmente il modello del dispositivo',
    searchAria: 'Cerca per nome del modello',
    searchPlaceholder: 'Cerca un modello, ad es. Balance 2',
    empty: 'Nessun modello corrispondente. Modifica la parola chiave o reimposta il filtro su «Tutti».',
    prev: 'Modello precedente',
    next: 'Modello successivo',
    alreadyAssigned: 'Già impostato su questo',
    confirm: 'È il mio dispositivo',
    clear: 'Rimuovi selezione',
    later: 'Non ora',
    contributeTitle: 'Aiuta la prossima versione a riconoscere questo dispositivo automaticamente',
    contributeBody: 'Invia a ZeppBridge il modello scelto e i codici modello del dispositivo (deviceSource / deviceType, solo numeri interi). Entrambi indicano unicamente di quale orologio si tratta: nessun account, nessun numero di serie, nessun indirizzo MAC, nessun dato sanitario. Huami non pubblica alcuna tabella di corrispondenza per questi codici; questo è l’unico modo per arricchire il catalogo integrato — non appena alcuni utenti associano un modello, questo verrà riconosciuto automaticamente per tutti.',
    note: 'Una volta scelto, verrà mostrato come «Modello scelto da te», mai come identificazione automatica. Le immagini e i modelli provengono dal catalogo integrato; la navigazione non effettua richieste di rete.',
    filterAll: 'Tutti',
    filterWatch: 'Orologi',
    filterBand: 'Smartband',
    filterStrap: 'Bracciali senza schermo',
    filterRing: 'Anelli',
    filterEarbuds: 'Auricolari',
  },

  'components/DeviceVisual': {
    watch: 'Orologio',
    band: 'Smartband',
    strap: 'Bracciale senza schermo',
    ring: 'Anello',
    earbuds: 'Auricolari',
    scale: 'Bilancia',
    unknown: 'Dispositivo',
  },

  'components/HeartRateZonePicker': {
    title: 'Zone di frequenza cardiaca',
    intro: 'I tre modelli calcolano zone diverse; solo tu sai quale sia più adatta alle tue esigenze — ZeppBridge non impone un valore predefinito e non usa mai formule stimate come 220 − età. Ogni valore di riferimento sotto riporta la fonte e la data della misurazione.',
    clearChoice: 'Cancella selezione',
    desktopOnly: 'Apri questa sezione nell’applicazione desktop ZeppBridge: il calcolo delle zone legge i record locali.',
    noBases: 'Nessun valore di riferimento della frequenza cardiaca su questo computer. Sincronizza una sessione di allenamento: qui appariranno i valori misurati, come la frequenza cardiaca massima registrata.',
    modelGroup: 'Modello',
    modelAria: 'Modello delle zone di frequenza cardiaca',
    pickModelFirst: 'Scegli prima un modello — le zone verranno quindi calcolate in base ai valori di riferimento selezionati.',
    pickBasesNext: 'Seleziona i valori di riferimento sopra per visualizzare le zone e il tempo trascorso in ciascuna.',
    window: (days: number, total: string) => `FC secondo per secondo degli allenamenti degli ultimi ${days} giorni · totale ${total}`,
    outside: (below: string, above: string) => `Fuori dalle zone: sotto Z1 ${below} · sopra Z5 ${above}`,
    formulaNote: (formula: string, bases: string) =>
      `${formula}. I limiti sono arrotondati per difetto, come sull’orologio. Riferimenti: ${bases}`,
    missingBases: (list: string) => `Non ancora presenti su questo computer: ${list}`,
    basesSeparator: ', ',
    zonesUnavailable: 'Al momento non è possibile leggere le zone di frequenza cardiaca',
    saveFailed: 'Impossibile salvare le impostazioni delle zone di frequenza cardiaca',
    zeroMinutes: '0 min',
    durationHours: (hours: number, minutes: number) => `${hours} h ${minutes} min`,
    durationMinutes: (minutes: number) => `${minutes} min`,
    kind: {
      max_hr: 'Riferimento FC max',
      resting_hr: 'Riferimento FC a riposo',
      threshold_hr: 'Riferimento FC di soglia',
    },
    model: {
      max_hr: { label: 'Zone basate sulla frequenza cardiaca massima', formula: 'Limite inferiore = FC max × percentuale' },
      hr_reserve: { label: 'Zone basate sulla frequenza cardiaca di riserva', formula: 'Limite inferiore = FC a riposo + (FC max − FC a riposo) × percentuale' },
      lactate_threshold: { label: 'Zone basate sulla soglia del lattato', formula: 'Limite inferiore = FC di soglia × percentuale' },
    },
    percentBands: ['Riscaldamento', 'Brucia grassi', 'Aerobica', 'Anaerobica', 'Massimale'],
    thresholdBands: ['Facile', 'Resistenza', 'Tempo', 'Soglia', 'Anaerobica'],
    basis: {
      observed_max: {
        label: 'Frequenza cardiaca massima registrata',
        note: 'La FC più alta rilevata localmente. Se non hai raggiunto il tuo vero limite, le zone calcolate risulteranno più strette.',
      },
      device_max: {
        label: 'Frequenza cardiaca massima segnalata dall’orologio',
        note: 'Il valore riportato dall’orologio nel messaggio PAI, in genere ricavato dal tuo profilo nell’app Zepp.',
      },
      device_resting: {
        label: 'Frequenza cardiaca a riposo segnalata dall’orologio',
        note: 'Il valore riportato dall’orologio nel messaggio PAI.',
      },
      lactate_threshold: {
        label: 'Frequenza cardiaca alla soglia del lattato',
        note: 'Misurata dall’orologio dopo una sessione di corsa impegnativa.',
      },
      computed_resting: {
        label: 'Frequenza cardiaca a riposo calcolata localmente',
        note: '' as string,
      },
    },
    computedRestingNote: (days: number) => `Media dei ${days} giorni con misurazioni negli ultimi 30 giorni.`,
    lead: 'Distribuzione della frequenza cardiaca durante gli allenamenti, in base al metodo e ai valori di riferimento scelti.',
    setupSummary: 'Metodo e valori di riferimento',
  },

  'components/HistoryArchivePanel': {
    archiveDisabled: 'Conservazione a termine: la prossima sincronizzazione riuscita eliminerà i dati più vecchi.',
    archiveEnabled: 'Conservazione illimitata: la sincronizzazione non eliminerà alcun dato.',
    confirmDisableArchive: 'Passando a un periodo di conservazione limitato, la prossima sincronizzazione riuscita eliminerà definitivamente i dati più vecchi.\nSe hai appena recuperato la cronologia, considera di creare prima un’istantanea del database.\nConfermare la modifica?',
    outOfRetention: 'Questo intervallo di recupero supera il periodo di conservazione locale: i dati recuperati verranno eliminati alla prossima sincronizzazione riuscita. Imposta «Conserva i dati» su «Sempre» o prolunga il periodo.',
    wouldBeCleanedUp: (requested: number, retention: number) =>
      `Questo recupero richiede ${requested} giorni di cronologia, ma questo computer conserva solo gli ultimi ${retention} giorni — i dati recuperati verranno eliminati alla prossima sincronizzazione riuscita. Imposta «Conserva i dati» su «Sempre» o prolunga il periodo.`,

    archiveSaveFailed: 'Impossibile salvare l’impostazione di archiviazione',

    startLabel: 'Recupera a partire da',
    startAria: 'Inizio del recupero della cronologia',
    range1y: '1 anno',
    range2y: 'Ultimi 2 anni',
    range3y: 'Ultimi 3 anni',
    rangeAll: (years: number) => `Tutta la cronologia disponibile (fino a ${years} anni)`,
    rangeCustom: 'Data di inizio personalizzata',
    customDateLabel: 'Data di inizio',
    customDateAria: 'Data di inizio del recupero',
    pickStartFirst: 'Seleziona prima una data di inizio per il recupero.',
    estimateTitle: 'Volume stimato',
    estimateRate: (days: number, perDay: string) => `${days} giorni di campioni locali · circa ${perDay}/giorno`,
    unmeasured: (streams: string) =>
      `Campioni locali insufficienti per la stima: ${streams}. Questi flussi non sono conteggiati nel totale sopra — preferiamo segnalare la mancanza di dati piuttosto che stimare un valore arbitrario e moltiplicarlo per anni.`,

    startBackfill: 'Avvia il recupero',
    backfilling: 'Recupero in corso…',
    stopBackfill: 'Interrompi',
    stopping: 'Interruzione in corso…',
    continueBackfill: 'Riprendi il recupero',
    autoContinue: 'Completa automaticamente',
    autoContinueHint: 'Ogni sessione avvia automaticamente la successiva fino al recupero dell’intero intervallo. Puoi interrompere in qualsiasi momento — i dati già scaricati non andranno persi.',
    roundProgress: (done: number, total: number) =>
      `Recupero: ${done} / ${total} blocchi mensili completati — puoi interrompere in qualsiasi momento.`,
    roundDone: (remaining: number) =>
      `Questa sessione è terminata; rimangono ${remaining} blocchi mensili. Fai clic su «Riprendi il recupero» per continuare — puoi interrompere quando vuoi.`,
    allChunksDone: 'Tutti i blocchi mensili nel registro sono stati elaborati.',
    stoppedByUser: (remaining: number) =>
      `Interrotto — rimangono ${remaining} blocchi mensili. Tutti i dati recuperati sono stati salvati; fai clic su «Riprendi il recupero» per continuare.`,
    stalled: (remaining: number) =>
      `Rimangono ${remaining} blocchi mensili, ma questo passaggio non ha fatto progressi, quindi il processo si è interrotto. Probabilmente continuano a fallire — consulta l’elenco degli errori sotto o fai clic su «Riprova mesi non riusciti».`,
    deferredRetry: 'Manutenzione locale in corso; il recupero riprenderà automaticamente',
    backfillFailed: 'Recupero della cronologia non riuscito',

    ledgerTitle: 'Registro di copertura',
    ledgerProgress: (done: number, total: number) => `${done} blocchi mensili su ${total} sono stati elaborati`,
    ledgerComplete: 'Ogni blocco mensile nel registro ha un esito: salvato localmente oppure il cloud ha confermato l’assenza di dati per tale periodo.',
    ledgerIncomplete: (remaining: number) =>
      `${remaining} blocchi senza esito definitivo. Fino al loro completamento, questa copia locale copre solo l’intervallo sincronizzato — non costituisce una copia completa.`,
    ledgerNothingWritten: 'Nessun mese salvato al momento',
    ledgerRange: (from: string, to: string, records: number) => `${from} ~ ${to} · ${records} record`,
    ledgerFrom: (from: string) => ` · intervallo richiesto a partire da ${from}`,
    resetLedger: 'Azzera il registro',
    confirmResetLedger: 'Azzera unicamente il registro di copertura: i dati già salvati localmente non verranno eliminati e potrai pianificare un nuovo recupero. Continuare?',
    ledgerReset: 'Il registro è stato azzerato. Ora puoi pianificare un nuovo intervallo di recupero.',
    ledgerResetFailed: 'Impossibile azzerare il registro',

    failedTitle: 'Mesi che non è stato possibile recuperare',
    failedIntro: 'Questi blocchi non sono riusciti; gli altri mesi sono stati recuperati normalmente.',
    failedRow: (stream: string, month: string) => `${stream} · ${month}`,
    failedAttempts: (attempts: number) => plural(attempts, { one: `${attempts} tentativo`, other: `${attempts} tentativi` }),
    failedExhausted: 'Tentativi automatici esauriti — fai clic su «Riprova mesi non riusciti» per riprovare',
    retryFailed: 'Riprova mesi non riusciti',
    retryFailedDone: 'I mesi non riusciti sono stati rimessi in coda; il recupero può riprendere.',
    retryFailedFailed: 'Impossibile rimettere in coda i mesi non riusciti',

    autoContinueTitle: 'Avvia automaticamente la sessione successiva',
    estimateDetails: 'Dettagli per flusso',
    statPersisted: 'Salvato',
    statEmpty: 'Vuoto nel cloud',
    statPending: 'In attesa',
    statFailed: 'Non riuscito',

    stream: {
      daily_summary: 'Riepiloghi giornalieri',
      heart_rate: 'Frequenza cardiaca',
      hrv: 'Variabilità della frequenza cardiaca (HRV)',
      sleep: 'Sonno',
      wellness: 'Stress / SpO₂ e simili',
      workouts: 'Allenamenti',
    },
    streamSeparator: ', ',
  },

  'components/InsightCard': {
    title: 'Analisi di questa corsa',
    reading: 'Lettura dei record locali in corso…',
    handoff: 'Fai analizzare all’IA',
    withRecovery: 'Includi i 7 giorni precedenti: sonno e recupero',
    withRecoveryHint: 'Dopo qualche giorno senza allenamenti, includere i dati precedenti su sonno, FC a riposo e HRV consente all’IA di distinguere tra un recupero insufficiente e una sessione sottotono.',
    baselineRun: 'Riferimento',
    currentRun: 'Questa corsa',
    comparedTo: (count: number) => `Confrontata con le tue ultime ${count} corse di distanza simile:`,
    metric: {
      'run.duration': 'Durata',
      'run.distance': 'Distanza',
      'run.pace': 'Passo medio',
      'run.avg_hr': 'FC media',
      'run.training_load': 'Carico di allenamento',
    },
    confidence: {
      high: 'Evidenza solida',
      medium: 'Evidenza moderata',
      low: 'Evidenza limitata',
      insufficient: 'Evidenza insufficiente',
    },
    noComparison: 'Cronologia comparabile non ancora sufficiente: i dati di questa corsa sono mostrati senza confronto.',
    unsupportedWorkoutType: 'L’analisi dettagliata non supporta ancora questo tipo di allenamento: la prima versione include solo la corsa, validata su dati reali. Gli altri allenamenti vengono visualizzati, modificati ed esportati normalmente.',
    footnote: 'Le valutazioni si basano esclusivamente sulla tua cronologia personale, mai su campioni di popolazione, e non costituiscono un parere medico. I dati mancanti sono indicati con «Non registrato», mai con uno 0 riempitivo.',
    notProvided: 'Non registrato',
    durationHours: (hours: number, minutes: number) => `${hours} h ${minutes} min`,
    durationMinutes: (minutes: number) => `${minutes} min`,
    driftTitle: 'Prima metà rispetto alla seconda',
    driftFirst: 'Prima metà',
    driftSecond: 'Seconda metà',
    driftPerBeat: (metres: string) => `${metres} m/battito`,
    driftHrSpeed: (hr: number, pace: string) => `${hr} bpm · ${pace}`,
  },

  'components/MetricInfo': {
    about: (label: string) => `Informazioni su «${label}»`,
    sectionWhat: 'Che cos’è',
    sectionChart: 'Cosa mostra questo grafico',
    sectionHow: 'Calcolo e provenienza',
  },

  'components/MetricTrendCard': {
    widened: (asked: string, shown: string) => `Misurazioni insufficienti per ${asked} · visualizzazione di ${shown}`,
    average: 'Media',
    maximum: 'Max',
    minimum: 'Min',
    latestTag: 'Ultimo',
    measuredOn: (date: string) => `misurato il ${date}`,
    onlyOneDay: 'Solo 1 giorno di dati in questo intervallo — impossibile tracciare un trend.',
    defaultEmpty: 'Questa metrica mostrerà il suo trend una volta sincronizzata.',
    trendAria: (label: string) => `Grafico del trend: ${label}`,
  },

  'components/MissingMetricsRow': {
    summary: (list: string) => `Nessuna misurazione negli ultimi 6 mesi: ${list}`,
    separator: ', ',
  },

  'components/OfficialOnlyNote': {
    text: 'È collegata solo l’autorizzazione ufficiale Zepp: frequenza cardiaca, sonno, passi, allenamenti, PAI e peso vengono sincronizzati. HRV, SpO₂, stress, prontezza e carico di allenamento non sono forniti dall’API ufficiale — connetti «Dati avanzati» per ottenerli.',
    action: 'Connetti',
  },

  'components/StageBar': {
    hypnogramAria: 'Ipnogramma delle fasi del sonno',
    summaryAria: 'Ripartizione delle fasi del sonno',
    notProvided: 'Non registrato',
    zeroMinutes: '0 min',
    cursorHint: 'Passa il cursore sul grafico per visualizzare un momento; fai clic per bloccarlo, quindi usa i tasti freccia per scorrere le fasi',
    cursorAt: (time: string) => `Alle ${time}`,
  },

  'components/TrendRangeBar': {
    label: 'Trend giornalieri',
    aria: 'Intervallo dei trend giornalieri',
  },

  'components/WeeklyReportCard': {
    title: 'Questa settimana',
    window: (recentStart: string, recentEnd: string, baseStart: string, baseEnd: string) =>
      `${recentStart} ~ ${recentEnd} · rispetto alla tua cronologia dal ${baseStart} ~ ${baseEnd}`,
    legendGood: 'Verde = miglioramento per questa metrica',
    legendBad: 'Rosso = peggioramento',
    legendNote: 'Confrontato esclusivamente con i tuoi 28 giorni precedenti, mai con medie di popolazione',
    barThisWeek: 'Questa settimana',
    barBaseline: '28 gg prec.',
    nextUp: 'Da monitorare',
    metric: {
      'weekly.resting_hr': 'FC a riposo',
      'weekly.hrv': 'HRV',
      'weekly.sleep_duration': 'Durata del sonno',
      'weekly.sleep_start_regularity': 'Dispersione dell’orario di sonno',
      'weekly.stress': 'Stress',
      'weekly.training_load': 'Carico di allenamento',
      'weekly.workout_count': 'Allenamenti',
    },
    unitWord: (unit: string) =>
      ({ score: 'punti', load: '', bpm: 'bpm' } as Record<string, string | undefined>)[unit] ?? unit,
    sleepDuration: (hours: number, minutes: number) => `${hours} h ${minutes} min`,
    regularity: (minutes: number) => `±${minutes} min`,
    workoutCount: (count: number) => plural(count, { one: `${count} allenamento`, other: `${count} allenamenti` }),
    zeroBaseline: 'Media di riferimento pari a 0: variazione relativa non calcolabile, mostrato solo il valore attuale.',
    baselineCountUnknown: 'Giorni di riferimento sconosciuti — mostrato solo il valore attuale senza confronto.',
    noBaseline: 'Cronologia precedente insufficiente — mostrato solo il valore attuale.',
    thinBaseline: (days: number, found: number, needed: number) =>
      `Solo ${found} degli ultimi ${days} giorni contengono questo dato (${needed} richiesti) — mostrato solo il valore attuale.`,
    nothingComparable: 'Nessun dato comparabile per questa settimana; sincronizza per visualizzarli.',
    noRecentData: 'Nessun dato locale per questa metrica negli ultimi 7 giorni.',
    notProvided: 'Non registrato',
    loadFailed: 'Impossibile generare il report settimanale locale',
    desktopOnly: 'Il report settimanale è disponibile nell’applicazione desktop ZeppBridge.',
    legendNeutral: '↑↓ = semplice variazione, senza giudizio di merito',
  },

  'components/WheelDatePicker': {
    day: 'Giorno',
    daySuffix: '' as string,
    month: 'Mese',
    year: 'Anno',
    yearSuffix: '' as string,
  },

  'components/activity/HourlyStepsCard': {
    title: 'Passi per ora',
    stepsUnit: 'passi',
    perDayUnit: 'passi / giorno',
    averageNote: (days: number) => `Media dei ${days} giorni con dati disponibili; fai clic su una riga per isolarla`,
    dayNote: (label: string) => `Solo ${label}`,
    weekNote: (label: string, days: number) => `${label}, media su ${days} giorni con dati`,
    weekOf: (label: string) => `Settimana del ${label}`,
    showAverage: 'Torna alla media',
    busiest: (hour: number, steps: string) => `Picco alle ore ${hour}: ${steps} passi`,
    busiestAverage: (hour: number, steps: string) => `Picco medio alle ore ${hour}: ${steps} passi`,
    barTitle: (hour: number, steps: string) => `Ore ${hour} — ${steps} passi`,
    averageBarTitle: (hour: number, steps: string) => `Ore ${hour} — media di ${steps} passi`,
    noRecord: (hour: number) => `Ore ${hour} — nessun dato registrato`,
    heatAria: 'Passi per ogni ora di ciascun giorno',
    pickRow: (label: string) => `Mostra solo ${label}`,
    noRow: (label: string) => `${label}: nessun dato registrato`,
    empty: 'Nessun dato sui passi orari per questo periodo.',
    failed: 'Impossibile leggere i passi orari al momento.',
    legend: (peak: string) => `Verde più intenso = più passi; l’intensità massima corrisponde a circa ${peak}`,
  },

  'components/ai/AiTaskHeader': {
    pageTitle: 'Passa all’IA',
    intro: 'Scegli un allenamento, seleziona i dati, scrivi cosa desideri sapere — esporta sul desktop e trascina tutto nell’IA.',
    titleLabel: 'Nome dell’attività',
    rename: 'Fai clic per rinominare',
    historyCount: (count: number) => `Attività salvate (${count})`,
    saved: 'Salvata',
    savedCount: (count: number) => `${count} salvata/e`,
  },

  'components/ai/CoverageDetails': {
    picked: (count: number) => `${count} giorno/i selezionato/i`,
    summary: (bytes: string) => `Copertura dettagliata (pacchetto ≈ ${bytes})`,
    category: 'Categoria',
    window: 'Intervallo',
    coverage: 'Con dati',
    sources: 'Origine',
    units: 'Unità',
    days: (have: number, total: number) => `${have}/${total} giorni`,
  },

  'components/ai/ExchangeList': {
    today: 'Oggi',
    yesterday: 'Ieri',
    rename: 'Rinomina',
    remove: 'Elimina',
    confirmRemove: 'Conferma eliminazione',
    cancel: 'Annulla',
    renameHint: 'Invio per salvare; lascia vuoto per usare la domanda originale',
    planDays: (n: number) => (n === 1 ? 'Piano di 1 giorno' : `Piano di ${n} giorni`),
  },

  'components/ai/HandoffDock': {
    more: 'Altro',
    planFreeShort: 'Gratuito',
    planPaidShort: 'A pagamento',
    checkHint: 'Da verificare prima dell’invio: dati inclusi, allegati e opzioni, testo completo',
    title: 'Passa all’IA',
    who: 'Destinatario IA',
    run: (label: string) => `Prepara il file e apri ${label}`,
    exportOnly: 'Esporta solo sul desktop',
    reveal: 'Mostra in Esplora file',
    outputAt: (path: string) => `File in: ${path}`,
    stale: 'L’attività è stata modificata dopo l’esportazione — i file sul desktop non sono più aggiornati. Esporta di nuovo.',
    desktopOnly: 'Connetti l’applicazione desktop per esportare',
    go: (label: string) => `Passa a ${label}`,
    goSubSyncing: 'Disponibile al termine della sincronizzazione',
    readiness: (categories: number, percent: number) =>
      `${categories} tipi di dati · ${percent}% dei giorni coperti`,
    readinessLoading: 'Conteggio dei dati in corso…',
    issueCount: (count: number) => (count === 1 ? '1 nota' : `${count} note`),
    repeat: (count: number) => `×${count}`,
    edited: 'Modificato da te',
    fixedTail: 'ZeppBridge aggiunge questa sezione in base alla copertura reale:',
    packageSize: (bytes: string) => `Pacchetto ≈ ${bytes}`,
    readinessWaiting: 'I dati più recenti sono ancora in fase di ricezione',
    readinessWaitingStep: (current: number, total: number) =>
      `Sincronizzazione ${current}/${total} · aggiornamento automatico al termine`,
    revealFile: 'Seleziona in Esplora file',
    dragFailed: 'Se il trascinamento non funziona, usa «Seleziona in Esplora file» e trascina il file da lì.',
    fileMeta: (size: string, tokens: string) => `${size} · circa ${tokens} token`,
    fileAria: (name: string) => `File per l’IA: ${name}, tieni premuto per trascinare`,
    tokensFree: (tokens: string) => `Circa ${tokens} token · supportato dal piano gratuito`,
    tokensNeedPaid: (tokens: string) => `Circa ${tokens} token · richiede abbonamento`,
    tokensPaid: (tokens: string) => `Circa ${tokens} token · supportato dal piano in abbonamento`,
    tooLong: 'Contenuto troppo esteso: riduci l’intervallo temporale o seleziona meno categorie',
    subscribedHint: 'La versione in abbonamento supporta circa 120.000 token, rispetto ai consueti 30.000 del piano gratuito. Seleziona questa opzione per includere grafici di allenamento più dettagliati.',
    planPaid: 'Abbonamento',
    planFree: 'Gratuito',
    planAll: 'Tutti',
    planTitle: (label: string) => `Quale piano ${label} stai utilizzando? Fai clic per cambiare.`,
  },

  'components/ai/HandoffSteps': {
    prepare: 'Prepara il file',
    copy: 'Copia il messaggio introduttivo',
    open: (label: string) => `Apri ${label}`,
    idle: 'Non ancora avviato',
    doing: 'In corso',
    done: 'Completato',
    failed: 'Non riuscito',
    blocked: 'Bloccato',
    skipped: 'L’anteprima web non può aprire il browser',
    retry: 'Riprova',
  },

  'components/ai/HandoffTray': {
    attachTitle: 'File di origine (PDF / immagini)',
    add: 'Aggiungi file',
    pickerTitle: 'Scegli i file da allegare all’attività per l’IA',
    filterName: 'PDF e immagini',
    skipped: (count: number) =>
      plural(count, { one: `${count} file ignorato — formato non supportato`, other: `${count} file ignorati — formato non supportato` }),
    pickFailed: 'Impossibile aggiungere i file',
    desktopOnly: 'È richiesta l’applicazione desktop per selezionare i file',
    remove: 'Rimuovi',
    reselect: 'Seleziona di nuovo',
    missing: 'non trovato',
    changed: 'modificato dopo l’aggiunta',
    advanced: 'Opzioni avanzate',
    preciseGps: 'Traccia precisa (coordinate GPS)',
    preciseGpsHint: 'Disattivato per impostazione predefinita; se attivo, i percorsi esportati manterranno le coordinate grezze.',
    detail: 'Livello di dettaglio',
    detailSummary: 'Riepilogo',
    detailStandard: 'Standard',
    detailDetailed: 'Dettagliato (serie punto per punto)',
    detailHint: 'Il riepilogo è più compatto. La modalità dettagliata aggiunge le serie punto per punto di ciascun allenamento per un’analisi approfondita, aumentando le dimensioni del file.',
    mcp: 'Consenti agli strumenti MCP locali di interrogare questa attività',
  },

  'components/ai/bridge/bridge': {
    unitMin: 'min',
    accept: 'Accetta questo piano',
    actual: 'Effettivo',
    bedtime: 'Ora di coricarsi',
    close: 'Riduci',
    composer: 'Di cosa vorresti parlare con l’IA questa volta?',
    days: (n: number) => `${n} giorni`,
    deleteDay: 'Elimina questo giorno',
    delivered: 'Inviato all’orologio',
    demoDelivered: 'Simulazione locale completata. Nessun dato inviato a un vero orologio.',
    demoHint: '90 giorni di dati, alimentazione e peso, piano di due settimane; nessun vero account o orologio collegato',
    detail: 'Visualizza questo giorno',
    discard: 'Scarta la bozza',
    done: 'Allenamento completato come da piano',
    emptyHistory: 'Il tuo primo scambio apparirà qui',
    excluded: 'Escluso dall’IA',
    exported: 'File pronto',
    extra: 'Allenamento extra-piano',
    fullDemo: 'Demo completa · dati interamente simulati',
    future: 'Il tuo prossimo passo',
    historical: 'Consultazione cronologia · sola lettura',
    history: 'Cronologia degli scambi',
    historyHint: 'I dati trasmessi e il prossimo passo ricevuto',
    hold: 'Tieni premuto · invia all’orologio',
    holdHint: 'Tieni premuto per 0,6 secondi per confermare; funzionano anche Spazio o Invio',
    included: 'Incluso per l’IA',
    inspect: 'Importa e verifica',
    lookback: 'Intervallo retrospettivo',
    mcp: 'Piano ricevuto tramite MCP',
    mean: 'Media dei giorni con registrazioni',
    missed: 'Nessun allenamento corrispondente',
    missing: 'Nessun dato',
    nextQuestion: 'Analizzando i miei allenamenti recenti, il sonno e il recupero, discutiamo prima di come organizzare la prossima settimana; proponi un piano dettagliato solo quando scriverò «versione definitiva».',
    noPlan: 'Nessun piano ancora ricevuto',
    nutrition: 'Registro alimentare',
    past: 'Il tuo passato',
    placeholder: 'Ad esempio: vorrei mantenere una sessione di ripetute la prossima settimana, ma mercoledì non sono disponibile. Come posso organizzare gli allenamenti?',
    planBack: 'Piano ricevuto',
    planned: 'Pianificato',
    previewPaste: 'Anteprima web: incolla qui la risposta finale',
    profile: 'Profilo personale',
    profileHint: 'Infortuni, obiettivi, stato recente. Salvato su questo computer e incluso automaticamente in ogni invio futuro.',
    profilePlaceholder: 'Ad esempio: obiettivo mezza maratona in autunno, 4 uscite a settimana; lieve fastidio al ginocchio destro, mercoledì non disponibile.',
    profileTitle: 'Fornisci il tuo contesto all’IA',
    receive: 'Importa piano definitivo',
    receiveEmpty: 'Gli appunti non contengono un piano definitivo. Copia la risposta finale contenente il JSON del piano.',
    received: 'Piano definitivo importato',
    receiving: 'Importazione in corso…',
    rejected: 'Rifiutato',
    rest: 'Riposo',
    retry: 'Rileggi',
    save: 'Salva profilo',
    saving: 'Salvataggio in corso…',
    pickDays: (label: string) => `Scegli i giorni di ${label} da inviare all’IA`,
    sleepIntentHint: 'Invia gli ultimi 14 giorni di sonno per chiedere all’IA come hai dormito e quali aspetti migliorare.',
    weekIntentHint: 'Invia gli ultimi 7 giorni per verificare se il carico di allenamento è adeguato e come sta evolvendo il recupero.',
    workoutIntentHint: 'Seleziona prima le sessioni in «Il tuo passato», quindi chiedi se l’intensità e il recupero sono stati calibrati correttamente.',
    nextIntentHint: 'Invia gli ultimi 30 giorni per pianificare insieme la prossima settimana; l’IA proporrà il piano solo quando scriverai «versione definitiva».',
    selected: (n: number) => `${n} allenamenti selezionati`,
    sleepQuestion: 'Come ho dormito ultimamente? C’è qualcosa che potrei migliorare?',
    sleepTarget: 'Obiettivo di sonno',
    today: 'Oggi',
    transcript: (n: number) => `${n} righe di testo → un piano`,
    undo: 'Annulla',
    undone: 'Annullato',
    unknown: 'Non confermato',
    weekQuestion: 'Il volume di allenamento di questa settimana è adeguato? Il mio recupero sta migliorando o peggiorando?',
    workoutQuestion: 'Analizza gli allenamenti che ho selezionato. L’intensità e il recupero sono stati programmati correttamente?',
  },

  'components/ai/hub/hub': {
    delivered: 'Inviato all’orologio',
    partial: 'Una settimana non inviata',
    unconfirmed: 'Invio non confermato',
    noPlan: 'Nessun piano ricevuto',
    rangeTitle: 'Intervallo retrospettivo',
    planEmpty: 'Nessun piano. Dopo esserti accordato con l’IA, copia la sua risposta finale e importala qui.',
    weekOf: (from: string, to: string) => `${from} – ${to}`,
    resync: (count: number) =>
      plural(count, {
        one: '1 modifica · tieni premuto per risincronizzare con l’orologio',
        other: `${count} modifiche · tieni premuto per risincronizzare con l’orologio`,
      }),
    prevDay: 'Giorno precedente',
    nextDay: 'Giorno successivo',
    checkTitle: 'Verifica prima dell’invio',
    checkIntro: 'Controlla esattamente cosa verrà trasmesso all’IA.',
    dataTitle: 'Dati inclusi',
    promptTitle: 'Prompt completo',
    promptHint: 'Fai clic in qualsiasi punto per modificare il tuo testo (identico al campo nella pagina principale); il resto viene aggiunto automaticamente ed è di sola lettura.',
    yourWords: 'Il tuo testo',
    warningsTitle: 'Da sapere',
    optionsTitle: 'Allegati e opzioni',
    subscriptionTitle: 'Il tuo piano',
    tasksTitle: 'Attività salvate',
    tasksIntro: 'Le attività inviate a un’IA rimangono qui. Aprine una per continuare.',
    newTask: 'Nuova attività',
    current: 'In uso',
    tasksEmpty: 'Nessuna attività salvata. Invia un’attività a un’IA per vederla apparire qui.',
    rename: 'Rinomina',
    pin: 'Fissa in alto',
    unpin: 'Rimuovi da in alto',
    remove: 'Elimina',
    removed: (title: string) => `«${title}» è stata eliminata`,
    removedMany: (count: number) =>
      plural(count, { one: '1 attività eliminata', other: `${count} attività eliminate` }),
    deleteMany: (count: number) => `Elimina (${count})`,
    selectEarlier: 'Seleziona tutte (precedenti)',
    doneSelecting: 'Fatto',
    selectHint: 'Tieni premuta una scheda per selezionarne diverse da eliminare; tieni premuto e trascina per selezionarne altre.',
    undo: 'Annulla',
    earlier: (count: number) => `Precedenti (${count})`,
    earlierHint: 'Le attività senza modifiche da 30 giorni e non fissate in alto sono archiviate qui, senza essere eliminate.',
    exchangeTitle: 'Questo scambio',
    exchangeMissing: 'Scambio non trovato; potrebbe essere stato ripulito.',
    sentTo: (provider: string, when: string) => `Trasmesso a ${provider} · ${when}`,
    question: 'La tua domanda',
    noQuestion: 'Nessuna domanda',
    dataSent: 'Dati trasmessi',
    daysBefore: (days: number) => `${days} giorni indietro`,
    workoutsSent: (count: number) =>
      plural(count, { one: '1 allenamento', other: `${count} allenamenti` }),
    planBack: 'Piano ricevuto',
    revealFile: 'Mostra il file in Esplora file',
  },

'components/ai/stage/stage': {
    stage: 'Invia all’IA: a sinistra i dati da trasmettere, al centro l’IA, a destra la domanda e il piano',
    recent: (days: number) => `Ultimi ${days} giorni`,
    picked: (days: number) => plural(days, { one: '1 giorno selezionato', other: `${days} giorni selezionati` }),
    haveOf: (have: number, total: number) => `${have} su ${total} giorni con dati`,
    extraWorkouts: (count: number) => plural(count, { one: '+1 allenamento selezionato', other: `+${count} allenamenti selezionati` }),
    noRecord: 'Nessuna registrazione',
    profileEmpty: 'Qualche riga su di te',
    profileFilled: 'Compilato',
    add: 'Aggiungi una categoria',
    addTitle: 'Altri dati per l’IA',
    addEmpty: 'Tutti i dati disponibili sono già a sinistra',
    rangeTitle: 'Periodo di analisi',
    pickDays: 'Scegli giorni specifici',
    pickWorkouts: 'Scegli allenamenti specifici',
    drop: 'Non includere',
    flickHint: 'Scorri verso l’alto per escludere questa categoria',
    nothing: 'Nessun dato da trasmettere per ora. Tocca «Aggiungi una categoria».',
    lock: (provider: string) => `Invia a ${provider}`,
    lockBusy: 'Preparazione del file…',
    freeIntent: 'Domanda libera',
    sleepShort: 'Sonno',
    weekShort: 'Questa settimana',
    workoutShort: 'Un allenamento',
    nextShort: 'Prossima settimana',
    receiptTitle: (provider: string) => `Inviato a ${provider}`,
    receiptLead: 'Trascina il file di questa scheda nella chat, incolla il messaggio introduttivo copiato e invia.',
    receiptPaste: (provider: string) => `File copiato: premi Ctrl+V nella chat di ${provider}, poi Invio.`,
    autoWaiting: (provider: string) => `In attesa dell’apertura di ${provider} per incollare e inviare automaticamente (Esc per fermare)`,
    autoFilling: 'Incollaggio nella chat…',
    autoFilled: 'Incollato nella chat — premi Invio per inviare',
    autoSent: (provider: string) => `Inviato a ${provider}`,
    autoStopped: 'Incollaggio automatico interrotto: il file è ancora negli appunti — premi Ctrl+V',
    copyAgain: 'Copia di nuovo l’introduzione',
    openAgain: (provider: string) => `Riapri ${provider}`,
    editQuestion: 'Modifica la domanda',
    notOpened: 'Azione annullata a metà; il sito non è stato aperto',
    exchanges: (count: number) => plural(count, { one: '1 scambio', other: `${count} scambi` }),
    resetCards: 'Riposiziona le schede',
    restoreAll: 'Ripristina',
    restoreAllHint: 'Ritorno all’inizio: tutti i dati, periodo predefinito, schede riposizionate; domanda e nome attività conservati. Annulla permette di ripristinare.',
    ringHint: 'Tieni premuto l’anello per caricare; un giro completo invia.',
    faceAsk: 'Chiedi',
    facePlan: 'Piano',
    tally: (train: number, rest: number) => `${train} allenamento · ${rest} riposo`,
    viewWeek: 'Vedi la settimana',
  },

  'components/ask/ask': {
    workoutHint: 'Scegli una domanda per iniziare: verrà creata una nuova attività con questo allenamento e i dati dei giorni circostanti, con la domanda precompilata. Potrai modificarla prima dell’invio.',
    workoutReview: (label: string) => `Come è andata questa sessione di ${label}?`,
    workoutRecovery: (label: string) => `Ho recuperato a sufficienza dopo questa sessione di ${label}?`,
    workoutNext: (label: string) => `Come organizzare il mio prossimo allenamento di ${label}?`,
    ask: 'Chiedi all’IA',
    askTitle: (label: string) => `Chiedi all’IA · ${label}`,
    askHint: 'Scegli una domanda per iniziare: verrà creata una nuova attività con i dati recenti di questa metrica e la domanda precompilata. Potrai modificarla prima dell’invio.',
    firstAbove: (label: string) => `${label} è più alto del solito ultimamente. Cosa potrebbe significare?`,
    firstBelow: (label: string) => `${label} è più basso del solito ultimamente. Cosa potrebbe significare?`,
    firstUsual: (label: string) => `La variazione recente di ${label} è normale?`,
    withTraining: (label: string) => `${label} è in linea con il mio carico di allenamento recente?`,
    withSleep: 'Controlla anche il sonno',
    sleepWithTraining: 'Controlla il sonno insieme all’allenamento',
    trainingNext: 'In questo stato, la prossima settimana conviene aumentare o ridurre il carico?',
    bodyFood: (label: string) => `La variazione di ${label} corrisponde alla mia alimentazione e all’allenamento?`,
    above: (delta: string) => `${delta} sopra la media`,
    below: (delta: string) => `${delta} sotto la media`,
    baselineHint: (median: string, days: number) => `Confronto con te stesso: mediana dei ${days} giorni precedenti, ${median}. Non è una diagnosi.`,
  },

  'components/cards/cards': {
    noWorkouts: 'Nessun allenamento in questo periodo',
    recentWorkouts: 'Ultimi 7 giorni',
    pick: 'Scegli giorni',
    pickTitle: (label: string) => `Scegli giorni da trasmettere all’IA · ${label}`,
    pickSubtitle: 'Scegli giorni da trasmettere all’IA',
    aroundDay: (date: string) => `Intorno al ${date}`,
    pickedHere: (count: number) => plural(count, { one: '1 giorno selezionato', other: `${count} giorni selezionati` }),
    tipDays: 'Tocca una carta per girarla, poi tocca il segno di spunta per metterla nella scatola. Puoi anche trascinarla direttamente nella scatola, oppure sovrapporla a un’altra per creare una pila e tenerla premuta per raccogliere tutto. Tocca uno spazio vuoto per riporre le carte.',
    hintGroups: 'Tocca una pila per aprirla; tieni premuto per mettere l’intera pila nella scatola; tocca uno spazio vuoto per tornare indietro.',
    keyboardTip: 'Spazio gira la carta; premi di nuovo Spazio per metterla nella scatola. Invio apre una pila; Maiusc+Invio ripone l’intero gruppo; Esc torna indietro.',
    inBox: 'Nella scatola',
    putBack: 'Rimetti a posto',
    confirmAria: (date: string) => `${date}, premi di nuovo per mettere nella scatola`,
    boxedAria: (date: string) => `${date} è nella scatola; premi per riprenderla`,
    boxEmptyLabel: 'Scatola di raccolta · vuota',
    boxDropHere: 'Rilascia qui',
    close: 'Riponi le carte',
    back: 'Torna al livello precedente',
    range7: '7 giorni',
    range30: '1 mese',
    range180: '6 mesi',
    rangeAria: 'Intervallo del tavolo',
    picked: 'Per l’IA',
    noRecord: 'Nessun dato',
    recorded: 'Registrato',
    recordedOf: (recorded: number, total: number) => `${recorded} su ${total} giorni registrati`,
    average: (value: string) => `media ${value}`,
    pickedOf: (picked: number, total: number) => `${picked}/${total} selezionati`,
    holdToPick: 'Tieni premuto per mettere l’intera pila nella scatola',
    holdToUnpick: 'Tieni premuto per rimuovere l’intera pila',
    holdPile: 'Tieni premuto',
    weekRange: (start: string, end: string) => `${start}–${end}`,
    dayAria: (date: string, value: string, picked: boolean) => `${date}, ${value}${picked ? ', selezionato' : ''}`,
    groupAria: (label: string, summary: string) => `${label}, ${summary}`,
    boxTitle: 'Scatola di raccolta',
    boxAria: (count: number) => plural(count, { one: 'Scatola di raccolta, 1 carta', other: `Scatola di raccolta, ${count} carte` }),
    boxGroup: (label: string, days: number) => plural(days, { one: `${label} · 1 giorno`, other: `${label} · ${days} giorni` }),
    boxWorkouts: (label: string, count: number) => plural(count, { one: `${label} · 1 allenamento`, other: `${label} · ${count} allenamenti` }),
    boxGo: 'Avvia un’attività con questi giorni',
    boxPour: 'Aggiungi a questa attività',
    boxClear: 'Svuota',
    boxClose: 'Chiudi',
    removeCard: (label: string, date: string) => `Rimuovi ${label} del ${date}`,
    more: (count: number) => `${count} in più`,
    monthDays: (days: number) => plural(days, { one: '1 giorno', other: `${days} giorni` }),
    monthAria: (month: string, label: string, days: number) => `${label}, ${days} giorni selezionati a ${month}. Premi per distribuire per settimana`,
  },

  'components/deck/CardDeck': {
    stackLabel: 'Gruppi di impostazioni',
    previous: 'Scheda precedente',
    next: 'Scheda successiva',
    close: 'Comprimi e mostra tutte le impostazioni',
    goTo: (index: number, total: number) => `Scheda ${index} di ${total}`,
    dragHint: 'Trascina l’intestazione della scheda a sinistra o a destra per passare a quella adiacente',
    unbox: 'Mostra tutto',
    collapse: 'Comprimi',
    listLabel: 'Tutti i gruppi di impostazioni',
  },

  'components/deck/DeckCoverflow': {
    label: 'Schede delle impostazioni: scorri lateralmente per sceglierne una',
    previous: 'Scheda precedente',
    next: 'Scheda successiva',
    open: (title: string) => `Apri «${title}»`,
    position: (index: number, total: number) => `${index} / ${total}`,
  },

  'components/overview/HeartRateCard': {
    hrTitle: 'Frequenza cardiaca recente',
    hrWindow: (hours: number) => `Ultime ${hours} ore`,
    hrPanelAria: 'Apri i dettagli della frequenza cardiaca per le 24 ore complete',
    hrChartAria: 'Curva della frequenza cardiaca nelle 24 ore',
    hrZonesAria: 'Zone di frequenza cardiaca (soglie assolute)',
    hrEmpty: 'Le variazioni reali della frequenza cardiaca appariranno qui dopo la sincronizzazione.',
    hrStale: (hours: number, when: string) =>
      `Nessun dato sulla frequenza cardiaca nel cloud nelle ultime ${hours} ore; ultima rilevazione: ${when}.`,
    cloudLag: 'I dati dell’orologio devono prima raggiungere il cloud tramite l’app Zepp affinché ZeppBridge possa recuperarli — l’orario di recupero non coincide con l’orario della misurazione.',
    latestAt: (when: string) => `Rilevazione più recente · ${when}`,
    hrMore: 'Tutte le 24 ore',
    latest: 'Ultima',
    bpm: 'bpm',
    zoneRest: 'Riposo 0–99',
    zoneFat: 'Brucia grassi 100–139',
    zoneAerobic: 'Aerobica 140–169',
    zoneAnaerobic: 'Anaerobica 170+',
  },

  'components/overview/PinnedMetrics': {
    title: 'Le mie metriche',
    edit: 'Modifica',
    emptyCta: 'Fissa le 3–4 metriche a cui tieni di più',
    emptySub: 'FC a riposo, HRV, peso… visibili subito a ogni apertura',
    today: 'Oggi',
    yesterday: 'Ieri',
    loadFailed: 'Impossibile leggere i dati al momento',
    measuredOn: (date: string) => `Rilevato il ${date}`,
    tileAria: (label: string, value: string) => `${label} ${value}, apri dettagli`,
    names: {
      resting_hr: 'Frequenza cardiaca a riposo',
      readiness: 'Prontezza',
      stress: 'Stress',
      spo2: 'SpO₂',
      weight: 'Peso',
      bmi: 'IMC',
      body_fat_rate: 'Massa grassa',
      steps: 'Passi',
      active_calories: 'Calorie attive',
      active_minutes: 'Minuti di attività',
      training_load: 'Carico di allenamento',
      pai_total: 'PAI',
      sleep_score: 'Punteggio del sonno',
      hrv: 'HRV (SDNN)',
      hrv_rmssd: 'HRV (RMSSD)',
      vo2max: 'VO₂max',
    },
    unitBpm: 'bpm',
    unitScore: 'pt',
    unitSteps: 'passi',
    unitKcal: 'kcal',
    unitMin: 'min',
    unitPai: 'PAI',
    pickerTitle: 'Quali metriche fissare',
    pickerHint: 'Fino a 4 metriche, in cima alla panoramica nell’ordine scelto',
    pickerFull: 'Ce ne sono già 4 — rimuovine prima una',
    pickerCount: (count: number, max: number) => `${count}/${max} selezionate`,
    slotEmpty: 'Vuoto',
    groupRecovery: 'Sonno e recupero',
    groupActivity: 'Attività e allenamento',
    groupBody: 'Corpo',
    remove: (label: string) => `Rimuovi ${label}`,
    clear: 'Svuota',
    done: 'Fine',
    close: 'Chiudi',
  },

  'components/overview/RecentCard': {
    recentTitle: 'Registrazioni recenti',
    recentSub: 'Sonno, corsa e forza',
    recentAria: 'Registrazioni recenti',
    recentEmpty: 'Nessun dato per ora — una sincronizzazione li mostrerà qui.',
    seeAll: 'Mostra tutto',
    newest: 'Più recente',
    sleepRecordTitle: 'Sonno',
    sleepScore: (score: number) => `Punteggio del sonno ${score}`,
    avgHr: (value: number) => `FC media ${value}`,
    timeUnknown: 'Ora sconosciuta',
  },

  'components/overview/SleepCard': {
    sleepTitle: 'La notte scorsa',
    sleepSub: 'Struttura del sonno a colpo d’occhio',
    sleepPanelAria: 'Apri i dettagli del sonno',
    sleepBarAria: 'Distribuzione delle fasi del sonno',
    sleepEmpty: 'Il sonno della notte scorsa apparirà qui dopo la sincronizzazione.',
    seeMore: 'Mostra altro',
    durationHours: (hours: number, minutes: number) => `${hours} h ${minutes} min`,
    durationMinutes: (minutes: number) => `${minutes} min`,
    sleepTitleOn: (day: string) => `Sonno · ${day}`,
    windowAsleep: 'Addormentato',
    windowWoke: 'Svegliato',
  },

  'components/overview/SourcesStrip': {
    sourcesAria: 'Origini dei dati e stato dell’account',
    dataSources: 'Origini dati',
    manage: 'Gestisci',
    identifyingDevices: 'Identificazione dei dispositivi in corso…',
    identifyFailed: (reason: string) => `Identificazione dei dispositivi non disponibile: ${reason}`,
    noDevicesYet: 'Nessun dispositivo identificato per ora',
    latestData: (when: string) => `Ultimi dati: ${when}`,
  },

  'components/overview/StepsCard': {
    stepsTitle: 'Passi di oggi',
    stepsUnit: 'passi',
    stepsPanelAria: 'Apri i dettagli dell’attività quotidiana',
    stepsGoalToday: 'Obiettivo di oggi',
    stepsGoalReference: 'Obiettivo di riferimento',
    stepsGoalLine: (goal: string, percent: number) => `Obiettivo ${goal} · ${percent}%`,
    stepsNotYet: 'I passi di oggi non sono ancora arrivati nel cloud',
    stepsLatest: (when: string) => `I dati più recenti nel cloud risalgono a ${when}`,
    seeMore: 'Mostra altro',
    factGoal: 'Obiettivo',
    factDone: 'Fatti',
    factLeft: 'Rimanenti',
    factReached: 'Raggiunto',
    weekAria: 'Passi di ciascuno degli ultimi 7 giorni; la linea tratteggiata rappresenta l’obiettivo',
    weekTitle: 'Ultimi 7 giorni',
  },

  'components/plan/easySwap': {
    readiness: (today: number, usual: number) => `Prontezza ${today}, di solito ${usual}`,
    swapRun: 'Passa a corsa facile',
    swapRide: 'Passa a pedalata facile',
    swapSwim: 'Passa a nuotata facile',
    notToday: 'Non oggi',
    nameRun: 'Corsa facile',
    nameRide: 'Pedalata facile',
    nameSwim: 'Nuotata facile',
    focus: 'Recupero',
    description: (original: string) => `Prontezza bassa: «${original}» sostituito con una sessione leggera`,
  },

  'components/plan/editor': {
    byTime: 'Per tempo',
    byDistance: 'Per distanza',
    targetHr: 'Frequenza cardiaca',
    targetPace: 'Passo',
    targetPower: 'Potenza',
    targetOpen: 'Nessuno',
    minutes: 'min',
    seconds: 's',
    km: 'km',
    hundredMeters: '×100 m',
    low: 'Min',
    high: 'Max',
    fast: 'Veloce',
    slow: 'Lento',
    roundsHint: 'Scorri lateralmente per modificare le ripetizioni; modificare una fase del blocco cambia tutti i giri',
    nameLabel: 'Nome',
    focusLabel: 'Obiettivo',
    focusPlaceholder: 'Una breve frase, ad esempio «Migliorare la resistenza»',
    descriptionLabel: 'Punti chiave',
    descriptionPlaceholder: 'I punti importanti della sessione, mostrati sull’orologio',
    required: 'Obbligatorio prima dell’invio',
    sportLabel: 'Sport',
    variantLabel: 'Da scegliere sull’orologio',
    held: 'Invio non possibile: compila i campi evidenziati in rosso sotto',
    addWarmup: 'Riscaldamento',
    addStep: 'Fase',
    addRepeat: 'Intervalli',
    addCooldown: 'Defaticamento',
    deleteStep: 'Elimina questa fase',
    more: 'Altro',
  },

  'components/plan/library': {
    saveTemplate: 'Salva come modello',
    saveTemplateNamed: (name: string) => `Salva come modello: ${name}`,
    addTitle: 'Aggiungi un allenamento',
    importFile: 'Importa un file (.zwo / .fit)',
    removeTemplate: (name: string) => `Elimina il modello «${name}»`,
    startFrom: 'Inizia con un modello o un file',
    saved: 'Salvato come modello; puoi aggiungerlo da «⋯» in qualsiasi giorno',
    saveFailed: 'Impossibile salvare: memoria locale non disponibile',
    added: (name: string) => `«${name}» aggiunto`,
    noteBand: 'Il file indicava un solo valore di intensità; è stato ampliato a un intervallo del ±3%',
    noteDropped: 'Gli obiettivi non supportati dall’orologio (cadenza, pendenza) sono stati rimossi',
    notePadded: 'Le fasi di durata inferiore a 10 secondi sono state impostate a 10 secondi',
    failUnreadable: 'Impossibile leggere questo file: sono supportati solo file .zwo e file .fit di allenamento',
    failNotWorkout: 'Questo file .fit non è un allenamento (è un’attività o un percorso)',
    failSport: 'I piani dell’orologio supportano solo corsa, ciclismo e nuoto',
    failZones: 'Questo file definisce i target tramite numero di zona e non può essere convertito: esportalo con valori effettivi e riprova',
    failStep: 'Contiene fasi incompatibili con un piano per orologio (fine basata su frequenza cardiaca, potenza o pressione del tasto giro, o serie nidificate)',
    failEmpty: 'Il file non contiene alcuna fase',
    needFtp: 'Questo file imposta l’intensità in percentuale della FTP. La tua FTP (watt)',
    needPace: 'Questo file imposta l’intensità in base al passo soglia. Il tuo passo soglia (al km)',
    needGo: 'Importa',
    needCancel: 'Annulla',
  },

  'components/plan/plan': {
    pasteEmpty: 'Ancora nessun contenuto. Incolla prima la risposta dell’IA.',
    pasteNoJson: 'Nessun piano trovato in questa risposta. Chiedi all’IA di rispondere di nuovo nel formato previsto per il piano.',
    pasteNotPlan: 'La risposta contiene JSON, ma non nel formato di un piano di allenamento.',
    recovery: 'Recupero',
    removed: (count: number) => plural(count, { one: '1 rimosso', other: `${count} rimossi` }),
    repeatTimes: (count: number) => plural(count, { one: 'Ripeti 1 volta', other: `Ripeti ${count} volte` }),
    replaced: (count: number) => plural(count, { one: '1 sostituito', other: `${count} sostituiti` }),
    rest: 'Riposo',
    restStep: 'Riposo',
    seconds: (count: number) => plural(count, { one: '1 secondo', other: `${count} secondi` }),
    send: 'Invia all’orologio',
    sending: 'Invio in corso…',
    sportCycling: 'Ciclismo',
    sportOpenWaterSwim: 'Nuoto in acque libere',
    sportPoolSwim: 'Nuoto in piscina',
    sportRunning: 'Corsa',
    stepNumber: (number: number) => `Fase ${number}`,
    stepsTitle: 'Fasi',
    targetHr: (low: number, high: number) => `FC ${low}–${high}`,
    targetOpen: 'Senza obiettivo',
    targetPace: (fast: string, slow: string) => `Passo ${fast}–${slow}`,
    targetPower: (low: number, high: number) => `Potenza ${low}–${high} W`,
    today: 'Oggi',
    totalAbout: (value: string) => `Circa ${value}`,
    dismiss: 'Ho capito',
    hoursMinutes: (hours: number, minutes: number) => `${hours} ${hours === 1 ? 'ora' : 'ore'} ${minutes} ${minutes === 1 ? 'minuto' : 'minuti'}`,
    interval: 'Intervallo',
    issueError: 'Da correggere',
    issueUnverified: 'Non verificato',
    issuesTitle: 'Da controllare',
    kilometers: (value: string) => `${value} ${value === '1' ? 'chilometro' : 'chilometri'}`,
    ledgerNote: 'Zepp non consente di leggere i piani. Questo è lo storico degli invii di ZeppBridge; le eliminazioni effettuate altrove non sono visibili qui.',
    clearAllTitle: 'Cancellare il piano sull’orologio?',
    clearDaysTitle: 'Rimuovere alcuni giorni dall’orologio?',
    clearDaysBody:
      'Questo piano trasforma in giorni di riposo alcuni giorni già presenti sull’orologio. L’invio eliminerà gli allenamenti di quei giorni dall’orologio. I piani provenienti da altre fonti (come RQrun) non saranno interessati. Puoi ripristinarli con «Annulla l’ultimo invio».',
    clearAllBody:
      'Rimuoverà dall’orologio tutti i piani inviati da ZeppBridge per oggi e per i giorni successivi. I piani provenienti da altre fonti (come RQrun) non saranno interessati. Puoi ripristinarli con «Annulla l’ultimo invio».',
    meters: (value: number) => plural(value, { one: '1 metro', other: `${value} metri` }),
    minuteUnit: 'minuto',
    minutes: (count: number) => plural(count, { one: '1 minuto', other: `${count} minuti` }),
    noPlanDay: 'Nessun allenamento in questo giorno',
    noticeError: 'Operazione non completata. Riprova tra poco.',
    noticeInvalid: 'Il piano contiene ancora elementi da correggere. Modificali prima dell’invio.',
    noticeNotNeeded: 'Questo piano è identico all’ultimo inviato; nulla da trasmettere.',
    noticeNothingToUndo: 'Nessun invio da annullare.',
    noticeRejected: 'Zepp non ha accettato questo piano; quello sull’orologio rimane invariato. La bozza è ancora disponibile: modificala e inviala di nuovo.',
    noticeSent: 'Inviato. Apri l’app Zepp e sincronizza l’orologio; il piano apparirà in «Piani di allenamento di terze parti».',
    noticeUnconfirmed: 'Invio non confermato (interruzione di rete o timeout). Il piano è registrato come inviato e verrà reinviato automaticamente alla prossima sincronizzazione.',
    noticeUndone: 'Annullato. L’orologio è tornato allo stato precedente all’ultimo invio.',
    noticeClearedAll: 'Il piano sull’orologio è stato cancellato.',
    outsideNote: 'Questo giorno è fuori dalla finestra di 7 giorni: non viene inviato adesso. Verrà trasmesso automaticamente non appena la finestra lo includerà.',
    unverifiedNote: '«Non verificato» non indica un errore di formato: il formato è valido, ma la visualizzazione in Zepp non è stata ancora verificata sul tuo orologio.',
    warmup: 'Riscaldamento',
    wasName: (name: string) => `Precedente: ${name}`,
    weekSessions: (count: number) => plural(count, { one: '1 allenamento', other: `${count} allenamenti` }),
    active: 'Principale',
    added: (count: number) => plural(count, { one: '1 aggiunto', other: `${count} aggiunti` }),
    cancel: 'Annulla',
    chartApprox: 'Fasi definite per distanza; la larghezza è indicativa',
    chartAria: 'Intervallo di frequenza cardiaca target nel tempo',
    chartNoHr: 'Questo allenamento non ha un target di frequenza cardiaca; viene rappresentata solo la durata',
    chartTitle: 'Andamento dell’intensità',
    clearConfirm: 'Cancella',
    cooldown: 'Defaticamento',
    discard: 'Scarta',
    activityWalking: 'Camminata',
    activityHiking: 'Escursionismo',
    activityStrength: 'Allenamento di forza',
    activityYoga: 'Yoga e allungamento',
    activityRowing: 'Canottaggio',
    activityElliptical: 'Ellittica',
    variantOutdoorRun: 'Corsa all’aperto',
    variantTreadmill: 'Tapis roulant',
    variantTrack: 'Corsa su pista',
    variantOutdoorRide: 'Ciclismo all’aperto',
    variantIndoorRide: 'Ciclismo indoor',
    variantPick: (name: string) => `L’orologio ti chiederà di nuovo il tipo: scegli «${name}».`,
    variantPickAny: 'L’orologio ti chiederà di nuovo il tipo esatto: i piani di terze parti indicano solo la categoria dello sport, una limitazione di Zepp.',
    heldBadge: 'Non inviabile all’orologio',
    heldNote: 'L’orologio supporta solo corsa, ciclismo e nuoto; questa attività non può essere inviata. Rimuovi questo giorno o cambialo in un tipo supportato:',
    retypeLabel: 'Cambia in',
    focusLabel: 'Obiettivo',
    issueWarning: 'Avviso',
    laterDelivered: 'Inviato a Zepp; verrà sincronizzato sull’orologio all’avvicinarsi del giorno',
    weekNotSent: 'Questa settimana non è stata recapitata',
    noticePartial: (weeks: string) => `Una parte del piano non è stata recapitata: la settimana con inizio il ${weeks}. Il resto è arrivato; la settimana mancante verrà reinviata alla prossima sincronizzazione.`,
    aiOriginal: 'Testo originale dell’IA',
    aiOriginalHint: 'Questo è il testo originale generato dall’IA; ZeppBridge non lo traduce. I prossimi piani richiesti verranno scritti nella lingua dell’interfaccia.',
  },

  'components/plan/status': {
    draft: 'Bozza non inviata',
    delivered: 'Recapitato',
    partial: 'Parzialmente recapitato',
    unconfirmed: 'Non confermato',
    rejected: 'Non recapitato',
    sending: 'Invio in corso…',
    title: 'Ultimo invio all’orologio',
    sentAt: (when: string) => `Inviato ${when}`,
    demo: 'Simulato',
    never: 'Nulla di inviato finora',
    undo: 'Annulla l’ultimo invio',
    clear: 'Cancella il piano dall’orologio',
  },

  'components/shell/AppTopBar': {
    today: 'Oggi',
    brandHome: 'ZeppBridge 3 · Panoramica',
    mainNav: 'Navigazione principale',
    connectionTitle: 'Stato della connessione cloud',
    lastSyncPrefix: 'Ultima sincronizzazione: ',
    localeLabel: 'Lingua dell’interfaccia',
    notFetchedYet: 'Non ancora recuperato',
    syncNow: 'Sincronizza ora',
    syncing: 'Sincronizzazione…',
    syncPartial: 'Parzialmente sincronizzato',
    syncFailed: 'Sincronizzazione non riuscita',
    verifyFirst: 'Completa prima la verifica della connessione',
    themeTitle: 'Cambia tema',
    themeLight: 'Chiaro',
    themeDark: 'Scuro',
    themeSystem: 'Sistema',
    timeUnknown: 'Ora sconosciuta',
    readyPill: 'Dati pronti · affida all’IA',
    readyTitle: 'Sincronizzazione completata, dati locali aggiornati. Fai clic per affidarli all’IA.',
    readyFirstPill: 'Primi dati ricevuti · vedi questa settimana',
    readyFirstTitle: 'Prima sincronizzazione completata. Fai clic per vedere nella panoramica come questa settimana si confronta con il solito.',
    connectPill: 'Collega account',
    syncingProgress: (current: number, total: number) => `Sincronizzazione ${current}/${total}`,
    syncWait: 'Attendi il completamento della sincronizzazione',
  },

  'components/shell/UpdateNotice': {
    title: (version: string) => `Aggiornato alla v${version}`,
    since: (version: string) => `In precedenza v${version}`,
    acknowledge: 'Ho capito',
    fullNotes: 'Visualizza le note di rilascio complete',
    empty: 'Nessuna nota di rilascio inclusa con questa versione. Consulta il rilascio completo per i dettagli.',
    added: 'Novità',
    improved: 'Miglioramenti',
    fixed: 'Risoluzioni',
    note: 'Aggiornamento',
  },

  'components/shell/update': {
    newVersion: (version: string) => `Versione ${version}`,
    ready: (version: string) => `La versione ${version} è pronta`,
    downloading: (percent: number | null) => (percent === null ? 'Download della nuova versione in corso' : `Download della nuova versione ${percent}%`),
    update: 'Aggiorna',
    waitingSync: 'In attesa del termine della sincronizzazione…',
    applying: 'Aggiornamento in corso…',
  },

  'components/tour/tour': {
    chapter: {
      whatsnew: 'Novità della V3',
      basics: 'Lingua e tema',
      connect: 'Connessione dell’account',
      overview: 'Panoramica',
      detail: 'Pagine di dettaglio',
      pick: 'Scegli giorni',
      handoff: 'Affida all’IA',
      plan: 'Piani di allenamento',
      settings: 'Impostazioni',
      cards: 'Tavolo delle carte',
      box: 'Scatola di raccolta',
      check: 'Verifica prima dell’invio',
      planFirst: 'Piani di allenamento',
    },
    steps: {
      whatsnew: {
        s1: 'La panoramica mostra solo i pochi indicatori che hai scelto e segnala quelli sopra o sotto il tuo solito.',
        s2: 'Trasmetti alcuni giorni di dati a un’IA, poi recupera il suo piano di allenamento.',
        s3: 'Il piano recuperato può essere inviato direttamente al tuo orologio.',
        s4: 'Strumenti come Claude Code o Codex possono leggere i tuoi dati direttamente tramite MCP.',
        s5: 'Nuova connessione ufficiale disponibile, utilizzabile in parallelo con quella originale.',
      },
      basics: {
        s1: 'Tema scuro, chiaro o conforme al sistema.',
        s2: 'Cambia lingua in qualsiasi momento.',
      },
      connect: {
        s1: 'Connettiti con il tuo account Zepp: autorizzazione ufficiale prioritaria, il canale precedente integra il resto (HRV, SpO₂, stress…).',
        s2: 'Trascina verso il basso per aggiornare nell’app mobile Zepp prima di sincronizzare: i dati dell’orologio devono raggiungere il cloud prima che questo computer possa recuperarli.',
      },
      overview: {
        s1: 'Tieni qui le 3 o 4 metriche che consulti più spesso; «Modifica» consente di cambiarle.',
        s2: 'Il confronto è con il tuo livello abituale recente, non con quello di altri.',
        s3: 'Organizza la panoramica secondo le tue priorità.',
      },
      detail: {
        s1: 'Scegli un intervallo di date una volta sola e tutte le pagine lo memorizzeranno.',
      },
      pick: {
        s1: 'Scegli da qui alcuni giorni da trasmettere all’IA.',
        s2: 'Sul tavolo, tocca una carta per girarla e selezionarla, o trascinala direttamente nella scatola; tocca una pila per espanderla, tocca uno spazio vuoto per riporre.',
      },
      handoff: {
        s1: 'I tuoi dati selezionati sono a sinistra: tocca una scheda per modificare il periodo, o scorrila via per escluderla.',
        s2: 'Scrivi la tua domanda a destra; verrà condensata in un unico file .md per l’IA.',
        s3: 'Tieni premuto il lucchetto al centro per trasmettere: il file va automaticamente negli appunti; premi Ctrl+V nella chat con l’IA per allegarlo.',
        s3Auto: 'Vuoi risparmiarti anche l’incollaggio e l’invio? Attiva «Affida all’IA automaticamente» nella scheda Strumenti IA delle Impostazioni.',
      },
      plan: {
        s1: 'Incolla qui la risposta finale dell’IA per generare un piano settimanale.',
        s2: 'Fai clic su un giorno per regolarlo singolarmente.',
        s3: 'Tieni premuto per inviare all’orologio. All’avvio sull’orologio, seleziona nuovamente il tipo di sport.',
      },
      settings: {
        s1: 'Backup e ripristino si trovano qui.',
        s2: 'MCP consente a strumenti di IA come Claude Code e Codex di leggere i tuoi dati direttamente su questo computer (sola lettura, nulla va online); la riga di comando e i plugin si trovano anch’essi qui.',
        s3: 'Torna su questa scheda per rivedere la guida.',
      },
      cards: {
        s1: 'Fai clic su una carta per girarla e selezionarla, o trascinala nella scatola; fai clic su una pila per espanderla, in uno spazio vuoto per riporre.',
      },
      box: {
        s1: 'Trascina una carta verso l’alto o fai clic su × per rimuoverla; fai clic sulla freccia per avviare un’attività con questi giorni.',
      },
      check: {
        s1: 'Verifica qui prima dell’invio: ogni elemento da trasmettere è elencato, deseleziona ciò che preferisci non condividere.',
      },
      planFirst: {
        s1: 'Fai clic su un giorno per modificarlo, tieni premuto «Invia all’orologio» per trasmettere. Sull’orologio, scegli lo sport all’avvio.',
      },
    },
    next: 'Avanti',
    prev: 'Indietro',
    done: 'Fine',
    skip: 'Salta la guida',
    gotIt: 'Ho capito',
    tryIt: 'Prova direttamente nel riquadro',
    progress: (index: number, total: number) => `${index} / ${total}`,
    sample: 'Dati di esempio',
    sampleHint: 'La guida utilizza dati di esempio; la tua libreria rimane intatta',
    welcomePick: 'Scegli una lingua',
    welcomeStart: 'Inizia la visita',
    welcomeSkip: 'Salta e inizia',
    inviteLater: 'Più tardi',
    toolsText: 'I tuoi strumenti di IA utilizzano ancora la versione precedente di ZeppBridge; riconnettili',
    toolsGo: 'Riconnetti',
    cardTitle: 'Guida introduttiva',
    cardSummary: (seen: number, total: number) => `${seen} su ${total} capitoli visualizzati`,
    fullTour: 'Dall’inizio',
    start: 'Inizia',
    look: 'Guarda',
    seenMark: 'Visto',
    resetTips: 'Mostra di nuovo i suggerimenti iniziali',
    resetDone: 'Fatto; verranno mostrati nuovamente la prossima volta',
  },

  'components/workout/TypePicker': {
    title: 'Cambia il tipo di allenamento',
    search: 'Cerca tipi di allenamento',
    recent: 'Usati di recente',
    all: 'Tutti i tipi',
    noMatch: 'Nessun tipo corrispondente',
    current: 'Attuale',
    close: 'Chiudi',
  },

  'components/workout/WorkoutClimbsCard': {
    eyebrow: 'Salite',
    title: 'Principali salite e discese',
    aria: 'Segmenti principali di salita e discesa',
    flat: 'Nessuna salita degna di nota: nessun dislivello o pendenza ha raggiunto le soglie sotto indicate.',
    climb: 'Salita',
    descent: 'Discesa',
    range: (from: string, to: string) => `${from}–${to}`,
    grade: 'Pendenza',
    vertical: 'Velocità vert.',
    heartRate: 'FC',
    pace: 'Passo',
    speed: 'Velocità',
    perHour: (unit: string) => `${unit}/h`,
    howTitle: 'Come viene calcolato',
    how: (window: number, reversal: number, change: number, grade: number, moving: number) =>
      `L’altitudine viene attenuata tramite una media mobile di ${window} secondi; un segmento termina non appena scende (o sale) di oltre ${reversal} m rispetto al punto più alto (o più basso). ` +
      `Vengono mostrati solo i segmenti con almeno ${change} m di dislivello e una pendenza media di almeno il ${grade}%. La distanza deriva dall’integrazione della velocità punto per punto, calibrata sulla distanza totale registrata; ` +
      `la velocità verticale e il passo utilizzano il tempo in movimento (il tempo trascorso a velocità inferiore a ${moving} m/s è escluso).`,
  },

  'composables/useAiHandoff': {
    clipboardUnsupported: 'Questo ambiente non supporta la scrittura negli appunti',
    copiedButCannotOpen: (label: string) => `Copiato, ma impossibile aprire ${label}`,
    handoffFailed: 'Passaggio all’IA non riuscito',
    targetNotAllowed: 'L’indirizzo dell’IA di destinazione non è tra quelli consentiti',
  },

  'composables/useAiTaskDraft': {
    deleteFailed: 'Impossibile eliminare l’attività',
    loadFailed: 'Impossibile caricare l’attività',
    saveFailed: 'Impossibile salvare l’attività',
    untitled: 'Attività senza titolo',
  },

// ========================================================
  // MODULE: 'composables/useAiTaskHandoff' (5 keys)
  // ========================================================
  'composables/useAiTaskHandoff': {
    copyFailed: 'Impossibile copiare il messaggio iniziale',
    openFailed: 'Impossibile aprire il sito dell’IA',
    prepareFailed: 'Impossibile preparare i file',
    saveFailed:
      'L’attività non è stata salvata: il file viene comunque preparato, ma queste scelte non saranno ricordate la prossima volta e l’accesso MCP all’attività rimane invariato.',
    kickoff:
      'Leggi il file allegato. Discutine prima con me; quando dico «versione finale», fornisci un piano JSON nel formato indicato alla fine del file.',
  },

  // ========================================================
  // MODULE: 'composables/useAiTaskLibrary' (1 keys)
  // ========================================================
  'composables/useAiTaskLibrary': {
    loadFailed: 'Impossibile caricare i dati dell’attività',
  },

  // ========================================================
  // MODULE: 'composables/useAiTaskPreview' (1 keys)
  // ========================================================
  'composables/useAiTaskPreview': {
    previewFailed: 'Impossibile generare l’anteprima',
  },

  // ========================================================
  // MODULE: 'composables/useDevices' (18 keys)
  // ========================================================
  'composables/useDevices': {
    stateAccount: 'Riconosciuto tramite l’account',
    stateCached: 'Dalla cache locale',
    stateRecentData: 'Dati recenti disponibili',
    stateUnknown: 'Non identificato',
    stateUserAssigned: 'Modello indicato da te',
    unidentifiedDevice: 'Dispositivo non identificato',
    notFetchedYet: 'Non ancora recuperato',
    notProvided: 'Non fornito',
    timeUnknown: 'Ora sconosciuta',
    cacheUnavailable: 'Cache dei dispositivi al momento non disponibile',
    identifyUnavailable: 'Identificazione del dispositivo al momento non disponibile',
    networkUnavailable: 'Rete non disponibile',
    noLocalIdentifier:
      'Questo dispositivo non ha un identificatore locale utilizzabile: impossibile salvare la selezione.',
    assignmentSaved:
      'Selezione salvata. Verrà mostrata come "Modello indicato da te", mai come corrispondenza automatica.',
    assignmentCleared: 'Selezione del modello rimossa; ripristinata la corrispondenza automatica.',
    assignmentFailed: 'Impossibile salvare il modello selezionato',
    assignmentContributed: (reportId: string) =>
      `Selezione salvata e codici modello inviati a ZeppBridge (segnalazione ${reportId}). La prossima versione del catalogo riconoscerà questo modello automaticamente.`,
    assignmentContributionFailed: (reason: string) =>
      `Selezione salvata solo su questo dispositivo. Invio al catalogo non riuscito: ${reason}`,
  },

  // ========================================================
  // MODULE: 'composables/useFocusAreas' (4 keys)
  // ========================================================
  'composables/useFocusAreas': {
    areaAll: 'Equilibrato',
    areaSleep: 'Sonno',
    areaDaily: 'Condizione quotidiana',
    areaTraining: 'Allenamento',
  },

  // ========================================================
  // MODULE: 'composables/useSyncController' (33 keys)
  // ========================================================
  'composables/useSyncController': {
    cleanupFailed: 'La pulizia dei vecchi dati non è riuscita; il database continuerà a crescere.',
    notSyncedYet: 'Non ancora sincronizzato',
    syncingRecent: (days: number) => `Sincronizzazione degli ultimi ${days} giorni in corso…`,
    syncingStream: (stream: string) => `Sincronizzazione: ${stream.toLowerCase()}`,
    backfilling: (days: number) => `Recupero storico degli ultimi ${days} giorni in corso…`,
    backfillingStream: (stream: string, month: string) =>
      `Recupero: ${stream.toLowerCase()} · ${month}`,
    alreadySyncing: 'Sincronizzazione già in corso, riprova al termine',
    cancelling: 'Annullamento della sincronizzazione in corso…',
    cancelled: 'Sincronizzazione annullata',
    cancelFailed: 'Impossibile annullare la sincronizzazione',
    deferred:
      'Ricostruzione dei dati derivati locali in corso; la sincronizzazione riproverà automaticamente',
    cloudStale: (clock: string) =>
      `I nuovi dati dell’orologio non sono ancora arrivati nel cloud (ultimi dati nel cloud: ${clock}). Apri Zepp sul telefono, scorri verso il basso per sincronizzare e tocca «Riprova».`,
    cloudStaleNoTime:
      'I nuovi dati dell’orologio non sono ancora arrivati nel cloud. Apri Zepp sul telefono, scorri verso il basso per sincronizzare e tocca «Riprova».',
    cloudStaleRetry: 'Riprova',
    cloudStaleDismiss: 'Ignora',
    updated: 'Nuovi dati sincronizzati',
    updatedWithLatest: (clock: string) =>
      `Nuovi dati sincronizzati · ultima frequenza cardiaca ${clock}`,
    noNewData: 'Sincronizzazione completata: nessun nuovo dato nel cloud',
    noNewDataWithLatest: (clock: string) =>
      `Nessun nuovo dato nel cloud · ultima frequenza cardiaca sempre ${clock}`,
    partial: 'Sincronizzazione completata, ma alcuni flussi hanno avuto esito negativo',
    partialWithStreams: (streams: string) => `Alcuni flussi non sono riusciti: ${streams}`,
    failed: 'Sincronizzazione non riuscita: controlla la connessione e riprova',
    connectFirst: 'Prima connetti Zepp',
    verifyFirst: 'Verifica prima la connessione',
    desktopOnly: 'È richiesta l’applicazione desktop',
    reauthNeeded: 'Sessione scaduta: riconnettiti a Zepp',
    statusUnavailable: 'Stato della connessione al momento non disponibile',
    lastCloudSync: (clock: string) => `Ultima sincronizzazione cloud ${clock}`,
    cloudSyncClock: (clock: string) => `Sincronizzazione cloud ${clock}`,
    cloudSyncClockUnknown: 'Sincronizzazione cloud —',
    syncDidNotFinish: 'La sincronizzazione cloud non è terminata',
    timeUnknown: 'Ora sconosciuta',
    streamSeparator: ', ',
  },

  // ========================================================
  // MODULE: 'demo/texts' (9 keys)
  // ========================================================
  'demo/texts': {
    easyRun: 'Corsa facile',
    intervals: 'Ripetute 5 × 3 min',
    lifeEvent: 'Inizio della preparazione per la mezza maratona',
    longRun: 'Corsa lunga a ritmo lento',
    nickname: 'Utente demo',
    recoveryRide: 'Ciclismo di recupero',
    taskFile: 'ultimi 14 giorni',
    taskTitle: (month: number, day: number) => `Ultimi 14 giorni · ${day}/${month}`,
    tempoRun: 'Corsa a ritmo',
  },

  // ========================================================
  // MODULE: 'lib/aiTask/brief' (21 keys)
  // ========================================================
  'lib/aiTask/brief': {
    defaultPlan: 'Non ho indicato una domanda specifica: fornisci un’analisi completa in questo ordine:',
    fileAttachments: (n: number) =>
      plural(n, {
        one: `- La cartella attachments/ contiene ${n} file originale aggiunto (ad es. referti medici, screenshot): tieni conto anche di questo.`,
        other: `- La cartella attachments/ contiene ${n} file originali aggiunti (ad es. referti medici, screenshot): tieni conto anche di questi.`,
      }),
    fileData: (file: string, labels: string) =>
      `- ${file}: tutti i dati. "context" elenca giorno per giorno metriche, sonno e allenamenti per categoria (${labels}); "coverage" indica le date che contengono effettivamente dati; "units" fornisce l’unità di misura di ciascun campo; "task.personal_note" è la mia nota di contesto personale.`,
    fileNote: '- Il mio contesto personale descrive la mia situazione: tienine conto.',
    fileWorkouts: (n: number) =>
      plural(n, {
        one: `- "workouts" contiene l'allenamento selezionato appositamente: è il punto focale dell'analisi.`,
        other: `- "workouts" contiene i ${n} allenamenti selezionati appositamente: sono il punto focale dell'analisi.`,
      }),
    followQuestion: 'Rispondi concentrandoti sulla "direzione di analisi" e sulla mia domanda seguente.',
    heading: '[Attività]',
    intro: (range: string) =>
      `In allegato trovi i miei dati sanitari personali esportati dal mio orologio Zepp (${range}, organizzati localmente da ZeppBridge; contengono esclusivamente i miei dati).`,
    range: (start: string, end: string) => (start === end ? start : `dal ${start} al ${end}`),
    rangeUnknown: 'un periodo recente',
    rules:
      'Requisiti di risposta: prima la conclusione e poi le prove; cita date e valori precisi; segnala chiaramente le lacune nei dati senza tirare a indovinare né inventare date mancanti; rispondi in italiano.',
    start: 'Inizia direttamente l’analisi, senza chiedermi prima cosa desidero fare.',
    step1: '1. Conclusione in una frase: il mio stato generale in questo periodo.',
    step2: (labels: string) =>
      `2. Categoria per categoria (${labels}): livello, tendenza e confronto con i miei valori abituali di riferimento.`,
    step3: '3. Relazioni tra categorie: ad es. come sonno, recupero e carico di allenamento si influenzano reciprocamente.',
    step4: '4. Anomalie e aspetti degni di nota: date o metriche che deviano chiaramente dalla norma e probabili cause.',
    step5: '5. Consigli pratici e attuabili per le prossime 1-2 settimane: cosa fare, quanto e quando.',
    introMd: (range: string) =>
      `Questo file contiene i miei dati sanitari personali esportati dal mio orologio Zepp (${range}, organizzati localmente da ZeppBridge; contiene esclusivamente i miei dati).`,
    fileDataMd: (labels: string) =>
      `- Tutti i dati (${labels}) si trovano dopo "# Data" qui sotto; la nota "Come leggere questo file" subito dopo spiega le tabelle.`,
    fileWorkoutsMd: (n: number) =>
      plural(n, {
        one: `- "Selected workouts" contiene l'allenamento selezionato appositamente (${n}): è la priorità dell'analisi.`,
        other: `- "Selected workouts" contiene i ${n} allenamenti selezionati appositamente: sono la priorità dell'analisi.`,
      }),
    fileAttachmentsMd: (n: number) =>
      plural(n, {
        one: `- Ho allegato anche ${n} file originale (ad es. un referto medico o uno screenshot); prendi in considerazione anche questo.`,
        other: `- Ho allegato anche ${n} file originali (ad es. referti medici o screenshot); prendi in considerazione anche questi.`,
      }),
  },

  // ========================================================
  // MODULE: 'lib/aiTask/copy' (33 keys)
  // ========================================================
  'lib/aiTask/copy': {
    'ui.ai_template.next_week.name': 'Pianifica la prossima settimana',
    'ui.ai_template.next_week.prompt':
      'Discuti con me l’organizzazione della prossima settimana partendo da allenamenti recenti, sonno, recupero e alimentazione. Consenti modifiche su più scambi; fornisci il piano finale nel formato indicato alla fine del file solo quando dirò "versione finale".',
    fallbackIssue: 'Impossibile riconoscere una nota di stato',
    'ui.ai_task.cat.workout': 'Allenamenti nel periodo',
    'ui.ai_task.cat.sleep': 'Sonno',
    'ui.ai_task.cat.recovery': 'Recupero',
    'ui.ai_task.cat.resting_hr': 'FC a riposo',
    'ui.ai_task.cat.heart_rate': 'FC dell’intera giornata',
    'ui.ai_task.cat.training': 'Carico di allenamento',
    'ui.ai_task.cat.body': 'Condizione corporea',
    'ui.ai_task.cat.personal_note': 'Nota personale',
    'ui.ai_task.cat.attachment': 'Allegati',
    'ui.ai_task.prompt.coverage_note':
      'Copertura effettiva misurata localmente da ZeppBridge. I giorni senza dati sono contrassegnati come mancanti: non dedurre né inventare nulla.',
    'ui.ai_task.blocked.attachment_missing':
      'File allegato originale non trovato. Selezionalo nuovamente o rimuovi il riferimento prima di procedere.',
    'ui.ai_task.blocked.no_workouts':
      'Nessun allenamento associato a questa attività. Torna indietro e seleziona almeno un allenamento prima della consegna.',
    'ui.ai_task.blocked.empty':
      'La selezione corrente non copre alcun dato. Modifica prima le categorie o gli allenamenti.',
    'ui.ai_task.warn.attachment_changed':
      'Le dimensioni dell’allegato sono cambiate dall’aggiunta: verifica che si tratti dello stesso file prima del passaggio all’IA.',
    'ui.ai_task.warn.category_missing':
      'Nessun dato per questa categoria nel periodo selezionato (verrà indicata come mancante nell’esportazione).',
    'ui.ai_task.warn.partial_coverage': 'Dati presenti solo per una parte del periodo selezionato.',
    'ui.ai_task.unknown': 'Nota di stato non riconosciuta',
    'ui.ai_task.attach.no_redaction':
      'I file originali vengono copiati senza anonimizzazione nella cartella di consegna sul desktop. Condividili solo se accetti di trasmetterli all’IA scelta.',
    'ui.ai_template.recovery_run.name': 'Corsa di recupero',
    'ui.ai_template.recovery_run.prompt':
      'Questa è stata una sessione in fase di recupero. Incrociando le due settimane precedenti di sonno, stato di recupero e frequenza cardiaca: l’intensità era adeguata al mio livello di recupero? Come impostare gli allenamenti per le prossime 48 ore?',
    'ui.ai_template.long_run_compare.name': 'Confronto corse lunghe',
    'ui.ai_template.long_run_compare.prompt':
      'Confronta queste corse lunghe: deriva ritmo/frequenza cardiaca, sensazioni percepite e contesto di recupero. Quale sessione è stata più efficiente rispetto al carico e come dosare l’intensità della prossima corsa lunga?',
    'ui.ai_template.hr_drift.name': 'Deriva della frequenza cardiaca',
    'ui.ai_template.hr_drift.prompt':
      'Analizza la deriva della frequenza cardiaca in questo allenamento: l’aumento di FC a ritmo costante, valutato con due settimane di sonno e carico di allenamento: affaticamento, meteo o variazione della condizione fisica?',
    'ui.ai_template.sleep_review.name': 'Sonno recente',
    'ui.ai_template.sleep_review.prompt':
      'Esamina le mie ultime due settimane di sonno: durata e regolarità degli orari in cui vado a dormire e mi sveglio, variazione della percentuale di sonno profondo e REM e andamento della frequenza cardiaca notturna e della HRV. Segnala le notti anomale e proponi probabili cause basandoti sugli allenamenti della giornata e sulle mie note.',
    'ui.ai_template.recovery_trend.name': 'Tendenza di recupero',
    'ui.ai_template.recovery_trend.prompt':
      'Nelle ultime quattro settimane, il mio recupero sta migliorando o peggiorando? Esamina la frequenza cardiaca a riposo, la HRV, il sonno e il carico di allenamento, verifica se concordano tra loro e distingui i trend reali dalle fluttuazioni giornaliere. Indica chiaramente dove mancano i dati.',
    'ui.ai_template.week_review.name': 'Questa settimana',
    'ui.ai_template.week_review.prompt':
      'Esamina questa settimana: come sonno, recupero, frequenza cardiaca e attività si confrontano con il solito, quali cambiamenti meritano attenzione e quali sono semplici variazioni ordinarie. Attieniti ai dati, senza fare diagnosi, e indica chiaramente dove mancano i dati.',
  },

  // ========================================================
  // MODULE: 'lib/aiTask/fileName' (13 keys)
  // ========================================================
  'lib/aiTask/fileName': {
    cat_attachment: 'file',
    cat_body: 'corpo',
    cat_heart_rate: 'cardio',
    cat_personal_note: 'note',
    cat_recovery: 'recupero',
    cat_resting_hr: 'FC a riposo',
    cat_sleep: 'sonno',
    cat_training: 'allenamento',
    cat_workout: 'allenamenti',
    manyCategories: (a: string, b: string, n: number) => `${a}, ${b} e altri ${n - 2}`,
    noData: 'nessun dato',
    promptSuffix: 'richiesta',
    twoCategories: (a: string, b: string) => `${a} e ${b}`,
  },

  // ========================================================
  // MODULE: 'lib/aiTask/markdownGuide' (1 keys)
  // ========================================================
  'lib/aiTask/markdownGuide': {
    guide: [
      'Come leggere questo file:',
      '- Tutte le tabelle sono blocchi di codice CSV; la prima riga contiene le intestazioni delle colonne, con le unità tra parentesi.',
      '- Una cella vuota indica assenza di dati per quel giorno o momento, non il valore 0. Non integrare né fare supposizioni.',
      '- Daily metrics: una riga al giorno. Sleep: una riga a notte. Workouts: una riga per allenamento. Coverage indica l’intervallo di date e quanti giorni hanno effettivamente dati per ciascuna categoria.',
      '- Le curve degli allenamenti (Samples) sono mediate sul numero di secondi indicato da curve_average_seconds in Summary; heart_rate_min / heart_rate_max rappresentano il minimo e il massimo di ciascun intervallo. Le statistiche dell’intera sessione sono calcolate a partire da tutti i dati secondo per secondo, nella sezione Curve statistics.',
      '- Gli allenamenti inclusi in workouts_summary_only mantengono solo la riga di riepilogo per garantire che il file rimanga completamente leggibile.',
    ].join('\n'),
  },

  // ========================================================
  // MODULE: 'lib/aiTask/metrics' (70 keys)
  // ========================================================
  'lib/aiTask/metrics': {
    resting_hr: 'FC a riposo',
    readiness: 'Recupero',
    physical_readiness: 'Recupero fisico',
    mental_readiness: 'Recupero mentale',
    hybrid_charge: 'Carica ibrida',
    physical_charge: 'Carica fisica',
    mental_charge: 'Carica mentale',
    stress: 'Livello di stress',
    respiratory_rate: 'Frequenza respiratoria',
    sleep_hrv: 'HRV nel sonno',
    sleep_rhr: 'FC a riposo nel sonno',
    hrv_baseline: 'HRV di riferimento',
    rhr_baseline: 'FC a riposo di riferimento',
    ahi_baseline: 'AHI di riferimento',
    spo2_odi: 'ODI di SpO₂',
    spo2_night_score: 'Punteggio SpO₂ notturno',
    spo2_measured_minutes: 'Durata misurazione SpO₂',
    hrv: 'HRV',
    hrv_rmssd: 'HRV (RMSSD)',
    spo2: 'SpO₂',
    heart_rate: 'FC dell’intera giornata',
    blood_pressure_systolic: 'Pressione sistolica (sperimentale)',
    blood_pressure_diastolic: 'Pressione diastolica (sperimentale)',
    blood_pressure_pulse: 'Pulsazioni durante misurazione pressione',
    training_load: 'Carico di allenamento',
    vo2max: 'VO₂ max',
    lactate_threshold_hr: 'FC alla soglia del lattato',
    lactate_threshold_pace: 'Passo alla soglia del lattato',
    pai_daily: 'PAI giornaliero',
    pai_total: 'PAI totale',
    steps: 'Passi',
    active_calories: 'Calorie attive',
    active_minutes: 'Minuti di attività',
    weight: 'Peso',
    bmi: 'IMC',
    height: 'Altezza',
    body_fat_rate: 'Massa grassa',
    body_water_rate: 'Acqua corporea',
    muscle_mass: 'Massa muscolare',
    bone_mass: 'Massa ossea',
    protein_rate: 'Proteine',
    visceral_fat: 'Grasso viscerale',
    bmr: 'Metabolismo basale',
    body_balance_score: 'Punteggio equilibrio corporeo',
    distance_meters: 'Distanza percorsa',
    moving_seconds: 'Tempo in movimento',
    calories: 'Calorie consumate',
    avg_hr: 'FC media',
    max_hr: 'FC max',
    min_hr: 'FC min',
    total_steps: 'Passi totali',
    elevation_gain_m: 'Dislivello positivo',
    elevation_loss_m: 'Dislivello negativo',
    duration_minutes: 'Durata del sonno',
    score: 'Punteggio del sonno',
    deep_minutes: 'Sonno profondo',
    light_minutes: 'Sonno leggero',
    rem_minutes: 'Sonno REM',
    awake_minutes: 'Veglia',
    wake_count: 'Risvegli',
    unit_min: 'minuti',
    unit_s: 'secondi',
    unit_score: 'punti',
    unit_count: 'volte',
    unit_kcal: 'chilocalorie',
    unit_m: 'metri',
    unit_load: 'carico',
    unit_steps: 'passi',
    unit_per_min: '/min',
    unit_s_per_km: 's/km',
  },

  // ========================================================
  // MODULE: 'lib/aiTask/planGuide' (10 keys)
  // ========================================================
  'lib/aiTask/planGuide': {
    guide: (example: string) =>
      [
        'Discuti prima del piano con me e consenti più serie di modifiche. Mostra il JSON finale del piano di allenamento solo quando dico esplicitamente "versione finale" o "invia il piano":',
        'Aggiungi alla tua risposta un blocco di codice ```json nel formato seguente. ZeppBridge lo leggerà; io lo verificherò prima dell’invio all’orologio.',
        '- date deve essere in formato YYYY-MM-DD, oggi o una data successiva, al massimo 56 giorni nel futuro. from / to delimitano l’intervallo coperto: i giorni senza allenamento in questo intervallo saranno considerati giorni di riposo e i piani esistenti verranno cancellati. Se questi campi vengono omessi, l’intervallo va dalla prima all’ultima data di allenamento.',
        '- L’orologio accetta solo questi 4 sport: running (variant: outdoor / treadmill / track), cycling (variant: outdoor / indoor), pool_swim e open_water_swim (senza variant per il nuoto). L’orologio mi chiederà nuovamente di scegliere il sottotipo: specifica il variant corretto.',
        '- Camminata, trekking, potenziamento muscolare, yoga e attività simili non possono essere inviati all’orologio (Zepp li ignora silenziosamente). Durante la discussione, indicami chiaramente che una tale sessione "non può essere inviata all’orologio", lasciando a me decidere se sostituirla con uno sport consentito o ometterla. Non nasconderla mai in una nota di riposo.',
        '- Ciascuna sessione deve includere focus (il suo obiettivo, una breve formula come "Sviluppare la resistenza" o "Soglia") e description (i punti chiave in una o due frasi; usa \\n per andare a capo). Entrambi appariranno sull’orologio, con "obiettivo · sottotipo" nella prima riga.',
        '- Limita name a circa 14 caratteri; i nomi più lunghi verranno troncati nell’elenco dell’orologio.',
        '- Il kind di ciascuna fase deve essere warmup, active, interval, recovery, rest o cooldown; duration indica una durata (20min, 90s, 1h) o una distanza (400m, 5km); target indica una frequenza cardiaca (hr 135-150), un passo (pace 5:00-5:30 al km), una potenza (power 200-220) o è omesso (nessun obiettivo).',
        '- Scrivi un gruppo di ripetizioni nel formato {"repeat": count, "steps": [...]}, con count compreso tra 1 e 50 e senza gruppi nidificati. Una sessione include al massimo 40 fasi e dura al massimo 8 ore. Sono possibili più sessioni nello stesso giorno.',
        '- format ha valore zeppbridge-plan/3; summary è una frase che riassume la motivazione del programma; rest è un array di consigli di riposo/sonno locali contenente date, bedtime (HH:MM), sleepTarget (8h30m) e note. I consigli di riposo restano su questo computer e non vengono mai inviati all’orologio; possono coesistere con le sessioni di allenamento.',
        'Esempio:',
        '```json',
        example,
        '```',
      ].join('\n'),
    example: {
      summary: 'Una sessione di qualità; il resto incentrato su lavoro aerobico e recupero',
      intervalName: 'Ripetute 3 × 1 km',
      intervalFocus: 'Resistenza alla velocità',
      intervalDescription:
        'Corri ogni ripetuta a ritmo costante, senza scattare nell’ultima\nCorri piano o cammina durante i recuperi',
      restNote: 'Andare a dormire presto prima della sessione di qualità',
      rideName: 'Lungo aerobico in bici',
      rideFocus: 'Costruzione della resistenza',
      rideDescription: 'Cadenza 85–95; non forzare la frequenza cardiaca in salita',
    },
    language: (lang: string) =>
      `- Scrivi name, focus, description, summary e note in ${lang}: verranno mostrati esattamente così in ZeppBridge e sull’orologio.`,
  },

  // ========================================================
  // MODULE: 'lib/aiTask/prompt' (1 keys)
  // ========================================================
  'lib/aiTask/prompt': {
    directionHeading: 'Direzione di analisi: ',
  },

  // ========================================================
  // MODULE: 'lib/aiTask/title' (3 keys)
  // ========================================================
  'lib/aiTask/title': {
    pickedDays: (days: number) =>
      plural(days, {
        one: `${days} giorno selezionato`,
        other: `${days} giorni selezionati`,
      }),
    recentDays: (days: number) =>
      plural(days, { one: 'Ultimo giorno', other: `Ultimi ${days} giorni` }),
    andMore: (count: number) => ` +altri ${count - 1}`,
  },

  // ========================================================
  // MODULE: 'lib/bridge/errors' (3 keys)
  // ========================================================
  'lib/bridge/errors': {
    desktopOnly: 'È richiesta l’applicazione desktop',
    genericFailure: 'Operazione non riuscita, riprova tra poco',
    timedOut: 'Richiesta scaduta: controlla la rete e la regione Zepp, poi riprova.',
  },

  // ========================================================
  // MODULE: 'lib/dateTime' (8 keys)
  // ========================================================
  'lib/dateTime': {
    '12h': '12 ore',
    '24h': '24 ore',
    date: 'Formato data',
    dmy: 'Giorno/mese/anno',
    mdy: 'Mese/giorno/anno',
    regional: 'Regione di sistema',
    time: 'Formato ora',
    ymd: 'Anno/mese/giorno',
  },

  // ========================================================
  // MODULE: 'lib/deviceCopy' (1 keys)
  // ========================================================
  'lib/deviceCopy': {
    notProvided: 'Non fornito',
  },

  // ========================================================
  // MODULE: 'lib/failedChunkText' (2 keys)
  // ========================================================
  'lib/failedChunkText': {
    noCanonical:
      'Il cloud ha restituito dati, ma non è stato possibile estrarre registrazioni utilizzabili',
    noReason: 'Nessun motivo registrato',
  },

  // ========================================================
  // MODULE: 'lib/format' (12 keys)
  // ========================================================
  'lib/format': {
    hourUnit: 'h',
    minuteUnit: 'min',
    minutesUnit: 'min',
    dateUnknown: 'Data sconosciuta',
    duration: (hours: number, minutes: number) =>
      hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`,
    durationUnknown: 'Durata sconosciuta',
    noRecords: 'Nessun dato registrato',
    noUpdates: 'Nessun aggiornamento',
    notRecorded: 'Non registrato',
    today: 'Oggi',
    yesterday: 'Ieri',
    timeUnknown: 'Ora sconosciuta',
  },

  // ========================================================
  // MODULE: 'lib/labels' (27 keys)
  // ========================================================
  'lib/labels': {
    fallback: {
      activity: 'Attività',
      badminton: 'Badminton',
      climb: 'Arrampicata',
      cycling: 'Ciclismo all’aperto',
      elliptical: 'Ellittica',
      hiking: 'Escursionismo',
      indoor_cycling: 'Ciclismo indoor',
      indoor_run: 'Corsa indoor',
      ride: 'Ciclismo all’aperto',
      rowing: 'Canottaggio',
      run: 'Corsa all’aperto',
      running: 'Corsa',
      strength: 'Allenamento di forza',
      swimming: 'Nuoto',
      trail: 'Trail running',
      treadmill: 'Tapis roulant',
      unknown: 'Allenamento non riconosciuto',
      walk: 'Camminata',
      walking: 'Camminata veloce',
      yoga: 'yoga e allungamento',
    },
    providerZeppCloud: 'Cloud Zepp',
    scopeDevice: 'Dispositivo singolo',
    scopeMixed: 'Origini multiple',
    scopeUnknown: 'Ambito non confermato',
    scopeUserFused: 'Fusione lato utente',
    unknownWithCode: (code: string) => `Allenamento non riconosciuto (codice ${code})`,
    workout: 'Allenamento',
  },

  // ========================================================
  // MODULE: 'lib/lifeEvents' (45 keys)
  // ========================================================
  'lib/lifeEvents': {
    title: 'Eventi di vita',
    intro: 'Registra gli eventi accaduti per dare contesto ai tuoi dati di salute.',
    local:
      'Salvati solo localmente e inclusi nei backup del database; selezionabili facoltativamente nella consegna all’IA.',
    empty:
      'Nessun evento di vita registrato. Inizia annotando un raffreddore, un viaggio o un cambio di allenamento.',
    search: 'Cerca eventi di vita',
    noMatch: 'Nessun evento corrispondente.',
    category: 'Categoria',
    categories: {
      health: 'Salute e recupero',
      routine: 'Ritmo e routine',
      training: 'Allenamento e gare',
      travel: 'Viaggi e spostamenti',
      other: 'Altro',
    },
    categoryShort: {
      health: 'Salute',
      travel: 'Viaggi',
      routine: 'Routine',
      training: 'Allenamento',
      other: 'Altro',
    },
    add: 'Aggiungi evento',
    edit: 'Modifica evento',
    name: 'Titolo',
    placeholder: 'Ad es.: raffreddore, qualche giorno di pausa dagli allenamenti',
    start: 'Data di inizio',
    end: 'Data di fine',
    notes: 'Note (facoltativo)',
    ongoing: 'Tuttora in corso',
    active: 'In corso',
    related: 'Eventi correlati',
    all: 'Tutti',
    showMore: (count: number) => `Mostra altri ${count}`,
    showLess: 'Mostra meno',
    save: 'Salva',
    cancel: 'Annulla',
    remove: 'Elimina',
    deleteTitle: 'Eliminare questo evento di vita?',
    deleteHint: 'Questa nota verrà rimossa dal database locale.',
    invalid:
      'Inserisci un titolo e date valide; la data di fine non può precedere quella di inizio.',
    loading: 'Caricamento degli eventi di vita in corso…',
    manage: 'Gestisci eventi di vita',
    failed: 'Operazione non riuscita, riprova.',
    retry: 'Riprova',
    since: (date: string) => `Dal ${date}`,
    chartKey: 'Eventi di vita',
    today: 'Oggi',
    yesterday: 'Ieri',
    sameAsStart: 'Stessa data di inizio',
  },

  // ========================================================
  // MODULE: 'lib/metricInfo/activity' (12 keys)
  // ========================================================
  'lib/metricInfo/activity': {
    stepsWhat: 'Passi: totale dei passi giornalieri calcolato dall’orologio.',
    stepsChart:
      'Un punto al giorno; i giorni senza registrazioni interrompono la linea anziché mostrare 0. La distribuzione oraria è indicata nella scheda in alto.',
    stepsHow:
      'Sia l’autorizzazione ufficiale che i Dati avanzati forniscono i passi giornalieri; la vista oraria si basa principalmente sui record minuto per minuto del canale precedente e colma le lacune con il riepilogo orario ufficiale.',
    distanceWhat: 'Distanza: distanza totale percorsa durante la giornata.',
    distanceChart:
      'Un punto al giorno; i giorni senza registrazioni interrompono la linea anziché mostrare 0.',
    distanceHow:
      'Fornita sia dall’autorizzazione ufficiale che dai Dati avanzati, sincronizzata con il riepilogo dell’attività giornaliera.',
    active_caloriesWhat:
      'Calorie attive: dispendio energetico legato esclusivamente all’attività del giorno, escluso il metabolismo basale.',
    active_caloriesChart:
      'Un punto al giorno; i giorni senza registrazioni interrompono la linea anziché mostrare 0.',
    active_caloriesHow:
      'Fornita dall’autorizzazione ufficiale e dai Dati avanzati, conteggiata separatamente dal dispendio calorico totale giornaliero.',
    active_minutesWhat: 'Minuti attivi: numero di minuti considerati come attività dall’orologio.',
    active_minutesChart:
      'Un punto al giorno; i giorni senza registrazioni interrompono la linea anziché mostrare 0.',
    active_minutesHow:
      'Proviene dai Dati avanzati: il riepilogo giornaliero ufficiale non include ancora i minuti attivi.',
  },

  // ========================================================
  // MODULE: 'lib/metricInfo/bloodPressure' (5 keys)
  // ========================================================
  'lib/metricInfo/bloodPressure': {
    systolic: 'Pressione sistolica durante la contrazione cardiaca, in mmHg.',
    diastolic: 'Pressione diastolica tra i battiti cardiaci, in mmHg.',
    pulse:
      'Pulsazioni rilevate durante la misurazione della pressione, in bpm. Registrate separatamente dalla frequenza cardiaca giornaliera.',
    chart:
      'Media misurata al giorno; minimo e massimo derivano dalle singole letture. I giorni senza misurazioni rimangono vuoti. Le esportazioni conservano l’ora e il valore di ciascuna misurazione.',
    how: 'Sincronizzazione sperimentale della pressione arteriosa: accetta coppie esplicite di valori. Gli endpoint candidati richiedono ancora verifiche con un account che effettua misurazioni. Metodo e metadati di calibrazione sono conservati nella risposta originale.',
  },

  // ========================================================
  // MODULE: 'lib/metricInfo/body' (39 keys)
  // ========================================================
  'lib/metricInfo/body': {
    weightWhat: 'Peso corporeo: un valore per ciascuna pesata.',
    weightChart:
      'In caso di più pesate nello stesso giorno viene calcolata la media giornaliera; l’area ombreggiata rappresenta l’intervallo misurato della giornata.',
    weightHow:
      'Le pesate provengono dal cloud Zepp: sia l’autorizzazione ufficiale che i Dati avanzati le sincronizzano; il peso registrato dall’orologio è incluso, ma non contiene dati sulla composizione corporea.',
    bmiWhat: 'IMC: indice di massa corporea rispetto all’altezza (kg/m²).',
    bmiChart: 'Aggiornato a ogni pesata.',
    bmiHow:
      'Fornito dal cloud insieme a ogni rilevazione del peso (autorizzazione ufficiale e Dati avanzati), non calcolato qui da altezza e peso.',
    body_fat_rateWhat: 'Massa grassa: percentuale di grasso rispetto al peso corporeo (%).',
    body_fat_rateChart:
      'Aggiornato a ogni pesata con bilancia impedenziometrica; in caso di pesate multiple nello stesso giorno viene calcolata la media giornaliera.',
    body_fat_rateHow:
      'Richiede una bilancia impedenziometrica: le pesate da orologio o inserite manualmente non la includono. Sincronizzato tramite i Dati avanzati; l’API ufficiale per la composizione corporea non è ancora disponibile.',
    muscle_massWhat: 'Massa muscolare, espressa secondo l’unità di misura selezionata.',
    muscle_massChart: 'Aggiornato a ogni pesata con bilancia impedenziometrica.',
    muscle_massHow:
      'Richiede una bilancia impedenziometrica, sincronizzato tramite i Dati avanzati; l’API ufficiale per la composizione corporea non è ancora disponibile.',
    body_water_rateWhat: 'Massa idrica: percentuale di acqua rispetto al peso corporeo (%).',
    body_water_rateChart: 'Aggiornato a ogni pesata con bilancia impedenziometrica.',
    body_water_rateHow:
      'Richiede una bilancia impedenziometrica, sincronizzato tramite i Dati avanzati; l’API ufficiale per la composizione corporea non è ancora disponibile.',
    bone_massWhat: 'Massa ossea, espressa secondo l’unità di misura selezionata.',
    bone_massChart: 'Aggiornato a ogni pesata con bilancia impedenziometrica.',
    bone_massHow:
      'Richiede una bilancia impedenziometrica, sincronizzato tramite i Dati avanzati; l’API ufficiale per la composizione corporea non è ancora disponibile.',
    visceral_fatWhat:
      'Grasso viscerale: livello di grasso attorno agli organi interni, non una percentuale.',
    visceral_fatChart: 'Aggiornato a ogni pesata con bilancia impedenziometrica.',
    visceral_fatHow:
      'Valutato su una scala da 1 a 30 da Zepp. Richiede una bilancia impedenziometrica, sincronizzato tramite i Dati avanzati.',
    bmrWhat:
      'Metabolismo basale: dispendio calorico giornaliero a riposo completo (kcal/giorno).',
    bmrChart: 'Aggiornato a ogni pesata con bilancia impedenziometrica.',
    bmrHow:
      'Richiede una bilancia impedenziometrica, sincronizzato tramite i Dati avanzati; l’API ufficiale per la composizione corporea non è ancora disponibile.',
    heightWhat: 'Altezza: dato del profilo utente, non una misurazione giornaliera.',
    heightChart: 'Trasmessa insieme a ogni pesata; varia raramente.',
    heightHow:
      'Dato del profilo restituito dal cloud con ogni rilevazione del peso (autorizzazione ufficiale e Dati avanzati).',
    intake_caloriesWhat: 'Calorie assunte: totale inserito manualmente per la giornata.',
    intake_caloriesChart:
      'Rappresentato da una barra per giorno; i giorni senza registrazioni non hanno barre e non vengono completati con 0.',
    intake_caloriesHow:
      'Registrato manualmente nell’app Zepp, sincronizzato tramite i Dati avanzati: l’API ufficiale per la nutrizione non è ancora disponibile.',
    intake_protein_gWhat:
      'Proteine: totale inserito manualmente per la giornata, in grammi.',
    intake_protein_gChart:
      'Rappresentato da una barra per giorno; i giorni senza registrazioni non hanno barre e non vengono completati con 0.',
    intake_protein_gHow:
      'Registrato manualmente nell’app Zepp, sincronizzato tramite i Dati avanzati: l’API ufficiale per la nutrizione non è ancora disponibile.',
    intake_fat_gWhat: 'Grassi: totale inserito manualmente per la giornata, in grammi.',
    intake_fat_gChart:
      'Rappresentato da una barra per giorno; i giorni senza registrazioni non hanno barre e non vengono completati con 0.',
    intake_fat_gHow:
      'Registrato manualmente nell’app Zepp, sincronizzato tramite i Dati avanzati: l’API ufficiale per la nutrizione non è ancora disponibile.',
    intake_carbs_gWhat: 'Carboidrati: totale inserito manualmente per la giornata, in grammi.',
    intake_carbs_gChart:
      'Rappresentato da una barra per giorno; i giorni senza registrazioni non hanno barre e non vengono completati con 0.',
    intake_carbs_gHow:
      'Registrato manualmente nell’app Zepp, sincronizzato tramite i Dati avanzati: l’API ufficiale per la nutrizione non è ancora disponibile.',
  },

  // ========================================================
  // MODULE: 'lib/metricInfo/heart' (6 keys)
  // ========================================================
  'lib/metricInfo/heart': {
    heart_rate_24hWhat: 'Frequenza cardiaca rilevazione per rilevazione nelle ultime 24 ore.',
    heart_rate_24hChart:
      'Il numero grande corrisponde all’ultima rilevazione; i periodi in cui l’orologio non è stato indossato interrompono la linea anziché mostrare 0.',
    heart_rate_24hHow:
      'I campioni provengono dall’autorizzazione ufficiale o dai Dati avanzati; i valori recente / medio / minimo / massimo di questa scheda sono calcolati localmente da ZeppBridge a partire dalle rilevazioni di queste 24 ore.',
    daily_max_hrWhat:
      'Frequenza cardiaca massima della giornata, calcolata localmente a partire dai campioni grezzi memorizzati su questo computer.',
    daily_max_hrChart:
      'Due curve: valore massimo e medio della giornata; i giorni con pochissimi campioni (meno di 60) sono disegnati con punti vuoti: il "massimo" è in tal caso solo il più alto tra quei pochi punti.',
    daily_max_hrHow:
      'Calcolato localmente da ZeppBridge a partire dai campioni senza applicare i filtri dell’app Zepp, è quindi normale che i valori differiscano. Sono considerati sia i campioni dell’autorizzazione ufficiale sia quelli dei Dati avanzati.',
  },

"lib/metricInfo/sleep": {
    sleep_durationWhat:
      "Tempo di sonno: durata effettiva del sonno durante la notte, esclusi i momenti di veglia a letto.",
    sleep_durationChart:
      "Il numero in grande indica il totale della notte; l’ora di addormentamento, di risveglio e il tempo trascorso a letto sono indicati nella riga sottostante.",
    sleep_durationHow:
      "Tratto dalla registrazione del sonno nel cloud: sia l’autorizzazione ufficiale che i Dati avanzati lo forniscono; se il cloud non invia la durata del sonno, viene calcolata a partire dall’inizio, dalla fine e dalla durata delle fasi.",
    sleep_scoreWhat:
      "Punteggio del sonno: valutazione complessiva assegnata alla notte dal dispositivo, su base 100.",
    sleep_scoreChart:
      "Mostrato così com’è: nessuna interpretazione qui né diagnosi medica.",
    sleep_scoreHow:
      "Fornito direttamente dal dispositivo con la registrazione del sonno della notte (disponibile sia con l’autorizzazione ufficiale che con i Dati avanzati); non è calcolato da ZeppBridge.",
    sleep_weeklyWhat:
      "Struttura del sonno nelle ultime 7 notti: durata di ciascuna fase per ogni notte.",
    sleep_weeklyChart:
      "Una barra per notte, impilata in sonno profondo / leggero / REM / veglia; la notte selezionata è evidenziata; una fase non fornita dal cloud è contrassegnata come «Non fornito».",
    sleep_weeklyHow:
      "La durata delle fasi accompagna ogni registrazione del sonno (sia l’autorizzazione ufficiale che i Dati avanzati la forniscono).",
    sleep_stagesChart:
      "Una cronologia dall’addormentamento al risveglio, con ogni segmento colorato in base alla fase; passa il cursore per vedere inizio, fine e durata.",
    sleep_stagesHow:
      "La suddivisione in fasi è fornita dal dispositivo e sincronizzata con la registrazione del sonno. Si tratta di definizioni descrittive, non di una diagnosi medica.",
    sleep_stagesWhat:
      "Profondo: la fase rigenerante. Leggero: la fase di transizione che occupa la maggior parte della notte. REM: sonno paradosso (REM), legato a memoria e sogni. Sveglio: risvegli o periodi di veglia durante la notte.",
  },

  "lib/metricInfo/training": {
    vo2maxWhat:
      "VO₂ max: quantità massima di ossigeno che l’organismo può utilizzare al minuto per chilogrammo di peso corporeo (ml/kg/min).",
    vo2maxChart:
      "Si aggiorna solo dopo una corsa all’aperto, poche volte all’anno; una singola misurazione è meno significativa dell’andamento a lungo termine, visibile nell’intervallo di 6 mesi.",
    vo2maxHow:
      "Stimato dall’orologio dopo le corse all’aperto, sincronizzato tramite i Dati avanzati; l’API ufficiale non include il VO₂ max.",
    training_loadWhat:
      "Carico di allenamento: il carico cumulativo a 7 giorni riportato da Zepp, adimensionale.",
    training_loadChart:
      "Un punto al giorno; il livello accanto all’ultima misurazione (basso / moderato / alto / molto alto) segue una scala di riferimento di 600 punti: una stima indicativa, non una classificazione fornita dall’orologio.",
    training_loadHow:
      "Fornito dall’orologio per ciascun giorno, sincronizzato tramite i Dati avanzati; l’API ufficiale non include il carico di allenamento giornaliero. Il livello è tracciato qui in base alla scala di riferimento.",
    pai_totalWhat:
      "Indice PAI: punteggio di attività fisica personale (Personal Activity Intelligence) calcolato su 7 giorni consecutivi.",
    pai_totalChart:
      "Un punto al giorno: il totale mobile degli ultimi 7 giorni a quella data; i punti guadagnati in quel singolo giorno non corrispondono a questo tracciato.",
    pai_totalHow:
      "Sia l’autorizzazione ufficiale che i Dati avanzati forniscono il PAI; Zepp gestisce il conteggio mobile.",
    lactate_thresholdWhat:
      "Soglia del lattato: l’intensità oltre la quale la fatica si accumula rapidamente, caratterizzata da una frequenza cardiaca e da un’andatura.",
    lactate_thresholdChart:
      "Due curve: frequenza cardiaca e andatura (l’asse dell’andatura è invertito, quindi una velocità maggiore punta verso l’alto); si aggiorna solo dopo una corsa intensa e prolungata.",
    lactate_thresholdHow:
      "Stimato dall’orologio dopo corse impegnative, sincronizzato tramite i Dati avanzati; l’API ufficiale non include la soglia del lattato.",
    training_balanceWhat:
      "Bilanciamento del carico di allenamento: rapporto tra il carico degli ultimi 7 giorni e la media settimanale su 28 giorni (rapporto carico acuto/cronico).",
    training_balanceChart:
      "Tre curve: carico a 7 giorni, media settimanale a 28 giorni e rapporto; dove la linea si interrompe, l’intervallo era incompleto: non calcolato, non zero.",
    training_balanceHow:
      "Calcolato qui sommando il carico dei singoli allenamenti in base alla data locale di inizio (non il carico mobile a 7 giorni di Zepp, che conterebbe ciascun allenamento due volte); acuto:cronico = somma a 7 giorni ÷ (somma a 28 giorni ÷ 4). Un giorno è considerato completo solo se l’elenco degli allenamenti è stato interamente sincronizzato tramite i Dati avanzati e ogni allenamento presenta un carico valido; solo i giorni confermati senza allenamenti valgono 0, mentre gli intervalli di 7 o 28 giorni incompleti rimangono vuoti. Gli allenamenti dell’API ufficiale non contengono il carico, quindi i giorni sincronizzati esclusivamente tramite essa sono esclusi.",
  },

  "lib/metricInfo/vitals": {
    readinessWhat:
      "Punteggio di preparazione calcolato dall’orologio in base al sonno, all’HRV e alla frequenza cardiaca a riposo della notte precedente.",
    readinessChart:
      "Un punto al giorno che traccia una tendenza; riflette le tue variazioni personali, senza alcun confronto con gli altri.",
    readinessHow:
      "Il punteggio viene calcolato direttamente sull’orologio e sincronizzato tramite i Dati avanzati; l’API ufficiale non include la preparazione.",
    stressWhat:
      "Livello di stress nell’arco della giornata: l’orologio misura ogni cinque minuti circa e riassume il dato giornaliero.",
    stressChart:
      "Questa scheda mostra la media giornaliera, con l’area ombreggiata che indica l’intervallo misurato nella giornata; il dettaglio misurazione per misurazione delle ultime 24 ore si trova nel grafico sopra.",
    stressHow:
      "Proviene dai Dati avanzati; l’API ufficiale non fornisce lo stress dell’intera giornata. I periodi senza misurazioni rimangono vuoti e non vengono riempiti con 0.",
    spo2What:
      "Saturazione di ossigeno (SpO₂): percentuale di emoglobina che trasporta ossigeno nel sangue, in %.",
    spo2Chart:
      "Singole misurazioni mediate in un punto al giorno; l’area ombreggiata rappresenta l’intervallo misurato nella giornata.",
    spo2How:
      "Ogni rilevazione corrisponde a una misurazione dell’orologio, tramite i Dati avanzati; l’API ufficiale non fornisce il valore di SpO₂ singola.",
    spo2_odiWhat:
      "ODI di SpO₂ notturno: numero medio di desaturazioni per ora; più è basso, migliore è il risultato.",
    spo2_odiChart:
      "Un punto al giorno basato sul monitoraggio notturno; le notti senza monitoraggio non hanno punti e non vengono mai riempite con 0.",
    spo2_odiHow:
      "Misura proprietaria dell’orologio ottenuta dal monitoraggio notturno dell’SpO₂, tramite i Dati avanzati; l’API ufficiale non la fornisce e non viene mai ricalcolata a partire da misurazioni sparse.",
    hrvWhat:
      "Variabilità della frequenza cardiaca (metrica SDNN): ampiezza della variazione degli intervalli tra i battiti cardiaci, in ms.",
    hrvChart:
      "Singole misurazioni mediate in un punto al giorno; l’area ombreggiata rappresenta l’intervallo misurato nella giornata.",
    hrvHow:
      "Proviene dai Dati avanzati. Anche l’API ufficiale restituisce un valore di HRV, ma algoritmo e unità non sono documentati: non sostituisce l’SDNN e non viene quindi acquisito qui.",
    hrv_rmssdWhat:
      "Altra metrica di variabilità della frequenza cardiaca (RMSSD): non corrisponde allo stesso valore di SDNN.",
    hrv_rmssdChart:
      "Misurazioni notturne mediate in un punto al giorno; l’area ombreggiata rappresenta l’intervallo misurato nella giornata.",
    hrv_rmssdHow:
      "Proviene dai Dati avanzati; neppure il valore di HRV dell’API ufficiale può sostituire l’RMSSD.",
    respiratory_rateWhat:
      "Frequenza respiratoria: numero di respiri al minuto durante il sonno.",
    respiratory_rateChart:
      "Mediata in un punto al giorno; l’area ombreggiata rappresenta l’intervallo misurato nella giornata.",
    respiratory_rateHow:
      "Misurata dall’orologio durante il sonno, tramite i Dati avanzati; l’API ufficiale non include la frequenza respiratoria.",
    resting_hrWhat:
      "Frequenza cardiaca a riposo: battiti al minuto in stato di riposo.",
    resting_hrChart:
      "Un valore al giorno fornito dall’orologio, collegato in una tendenza; separato dalla frequenza cardiaca istantanea delle ultime 24 ore.",
    resting_hrHow:
      "Riportata dall’orologio nel riassunto giornaliero e sincronizzata tramite i Dati avanzati; non viene ricalcolata qui.",
  },

  "lib/metricSeries": {
    coverage: (days: number, withData: number) =>
      `${withData} su ${days} giorni con dati`,
    dayRange: (low: string, high: string, unit: string) =>
      `Intervallo del giorno: ${low} – ${high}${unit}`,
    noRecordsInWindow: (days: number) =>
      `Nessun dato negli ultimi ${days} giorni`,
    noRecordsToShow: "Nessun dato da mostrare",
    samples: (count: number) => `${count} misurazioni`,
  },

  "lib/rangeOptions": {
    d7: "7 giorni",
    d30: "1 mese",
    d90: "3 mesi",
    d180: "6 mesi",
    d365: "1 anno",
  },

  "lib/sleepStages": {
    awake: "Sveglio",
    deep: "Profondo",
    light: "Leggero",
    rem: "REM",
    unknown: "Sconosciuto",
  },

  "lib/storageEstimateText": {
    builtinGuess: (days: number, add: string, free: string) =>
      `Campioni locali insufficienti: stima indicativa integrata di ${days} giorni ≈ ${add}; ${free} liberi su questo disco.`,
    diskTooSmall:
      "Meno di 300 MB liberi: non è possibile recuperare più di 90 giorni di cronologia.",
    diskUnknown:
      "Impossibile leggere lo spazio libero su disco. Verificare che ci sia spazio sufficiente prima del recupero.",
    measured: (days: number, add: string, free: string) =>
      `Al ritmo reale dei tuoi dati: ${days} giorni ≈ ${add}; ${free} liberi su questo disco.`,
    partial: (days: number, add: string, free: string) =>
      `Vengono conteggiati solo i flussi con campioni locali sufficienti: ${days} giorni ≈ ${add} (gli altri non sono inclusi); ${free} liberi su questo disco.`,
    stopNoSpace: (needed: string, free: string) =>
      `Questo recupero richiede circa ${needed} (margine di sicurezza incluso), ma rimangono solo ${free} liberi: il recupero non verrà avviato. Libera spazio o riduci l’intervallo.`,
    unknownEstimate:
      "Al momento non è possibile calcolare la dimensione di questo recupero.",
  },

  "lib/syncStreams": {
    blood_oxygen: "SpO₂",
    breathing_rate: "Frequenza respiratoria",
    daily_summary: "Riepiloghi giornalieri",
    heart_rate: "Frequenza cardiaca",
    hrv: "Variabilità della frequenza cardiaca",
    lactate_threshold_hr: "Frequenza cardiaca alla soglia del lattato",
    lactate_threshold_pace: "Andatura alla soglia del lattato",
    resting_heart_rate: "Frequenza cardiaca a riposo",
    skin_temperature: "Temperatura cutanea",
    sleep: "Sonno",
    training_load: "Carico di allenamento",
    vo2max: "VO₂ max",
    weight: "Peso e composizione corporea",
    wellness: "Stress, SpO₂ e altre metriche opzionali",
    workout_detail: "Dettagli e percorsi degli allenamenti",
    workouts: "Allenamenti",
  },

  "lib/trainingLoadTier": {
    low: "basso",
    medium: "moderato",
    high: "alto",
    veryHigh: "molto alto",
    reference: (band: string) => `${band} (riferimento)`,
  },

  "lib/trainingPlan/issues": {
    fallback: () => "Un elemento di questo piano non è stato riconosciuto",
    "ui.training_plan.issue.bad_date": (p: { value?: unknown }) =>
      `Scrivi le date nel formato anno-mese-giorno (ad esempio 2026-10-07); questa è «${String(p.value ?? "")}»`,
    "ui.training_plan.issue.bad_duration": (p: { value?: unknown }) =>
      `Durata non valida: «${String(p.value ?? "")}». Usa 20min, 90s, 1h, 400m o 5km`,
    "ui.training_plan.issue.bad_name": (p: { max?: unknown }) =>
      `Un allenamento deve avere un nome di massimo ${String(p.max ?? "")} caratteri`,
    "ui.training_plan.issue.bad_repeat": (p: { max?: unknown }) =>
      `Il numero di ripetizioni deve essere compreso tra 1 e ${String(p.max ?? "")}`,
    "ui.training_plan.issue.bad_target": (p: { value?: unknown }) =>
      `Obiettivo non valido: «${String(p.value ?? "")}». Usa hr 135-150, pace 5:30-5:50 o power 200-220`,
    "ui.training_plan.issue.description_too_long": (p: { max?: unknown }) =>
      `La descrizione dell’allenamento non può superare ${String(p.max ?? "")} caratteri`,
    "ui.training_plan.issue.distance_out_of_range": () =>
      "La distanza di ogni fase deve essere compresa tra 50 m e 100 km",
    "ui.training_plan.issue.distance_unverified": () =>
      "Le fasi basate sulla distanza non sono ancora state verificate sul tuo orologio; impostarle come tempo è più sicuro",
    "ui.training_plan.issue.duration_out_of_range": () =>
      "La durata di ciascuna fase deve essere compresa tra 10 secondi e 6 ore",
    "ui.training_plan.issue.empty": () =>
      "Il piano non contiene alcun allenamento. Per cancellare determinati giorni, specifica una data di inizio e una data di fine",
    "ui.training_plan.issue.hr_out_of_range": (p: {
      low?: unknown;
      high?: unknown;
      max?: unknown;
    }) =>
      `L’intervallo di frequenza cardiaca ${String(p.low ?? "")}–${String(p.high ?? "")} non è valido: resta al di sotto di ${String(p.max ?? "")} e scegli due valori diversi`,
    "ui.training_plan.issue.nested_repeat": () =>
      "Un gruppo di ripetizioni non può contenere un altro gruppo di ripetizioni",
    "ui.training_plan.issue.no_steps": () =>
      "Un allenamento deve contenere almeno una fase",
    "ui.training_plan.issue.note_too_long": (p: { max?: unknown }) =>
      `La nota di una fase non può superare ${String(p.max ?? "")} caratteri`,
    "ui.training_plan.issue.open_target_unverified": () =>
      "Le fasi senza obiettivo non sono ancora state verificate sul tuo orologio; imposta piuttosto un intervallo di frequenza cardiaca",
    "ui.training_plan.issue.outside_range": (p: { date?: unknown }) =>
      `L’allenamento del ${String(p.date ?? "")} non rientra nell’intervallo di date indicato nel piano`,
    "ui.training_plan.issue.pace_out_of_range": () =>
      "L’andatura deve essere compresa tra 2:00 e 20:00 min/km, con due valori diversi",
    "ui.training_plan.issue.pace_unverified": () =>
      "L’unità degli obiettivi di andatura non è ancora stata verificata sul tuo orologio; imposta piuttosto un intervallo di frequenza cardiaca",
    "ui.training_plan.issue.past_date": (p: { date?: unknown }) =>
      `${String(p.date ?? "")} è già passato; non puoi pianificare un allenamento nel passato`,
    "ui.training_plan.issue.power_out_of_range": (p: {
      low?: unknown;
      high?: unknown;
    }) =>
      `L’intervallo di potenza ${String(p.low ?? "")}–${String(p.high ?? "")} W non è valido; scegli valori ragionevoli e distinti tra loro`,
    "ui.training_plan.issue.range_reversed": (p: {
      from?: unknown;
      to?: unknown;
    }) =>
      `La data di inizio (${String(p.from ?? "")}) è successiva alla data di fine (${String(p.to ?? "")})`,
    "ui.training_plan.issue.same_day_unverified": (p: { date?: unknown }) =>
      `Ci sono due allenamenti previsti per il ${String(p.date ?? "")}; la loro visualizzazione sull’orologio non è ancora stata verificata`,
    "ui.training_plan.issue.too_far": (p: { date?: unknown; days?: unknown }) =>
      `${String(p.date ?? "")} è troppo lontano nel futuro; i piani possono coprire al massimo i successivi ${String(p.days ?? "")} giorni`,
    "ui.training_plan.issue.too_many_steps": (p: { max?: unknown }) =>
      `Un allenamento non può superare ${String(p.max ?? "")} fasi`,
    "ui.training_plan.issue.unknown_kind": (p: { value?: unknown }) =>
      `Tipo di fase sconosciuto: «${String(p.value ?? "")}». Usa warmup, active, interval, recovery, rest o cooldown`,
    "ui.training_plan.issue.unknown_sport": (p: { value?: unknown }) =>
      `Sport sconosciuto: «${String(p.value ?? "")}». Usa running, cycling, pool_swim o open_water_swim`,
    "ui.training_plan.issue.workout_too_long": (p: { hours?: unknown }) =>
      `Un allenamento non può durare più di ${String(p.hours ?? "")} ore`,
    activity: {
      walking: "camminata",
      hiking: "trekking",
      strength: "sollevamento pesi",
      yoga: "yoga e allungamento",
      rowing: "vogatore",
      elliptical: "ellittica",
    },
    "ui.training_plan.issue.sport_not_deliverable": (p: {
      activity?: unknown;
    }) =>
      `L’orologio accetta solo corsa, ciclismo, nuoto in piscina e in acque libere: «${String(p.activity ?? "")}» non può essergli inviato. Rimuovi questo giorno o scegli un’attività compatibile.`,
    "ui.training_plan.issue.bad_variant": (p: { value?: unknown }) =>
      `«${String(p.value ?? "")}» non è un sottotipo valido per questo sport (corsa: outdoor, treadmill, track; ciclismo: outdoor, indoor).`,
    "ui.training_plan.issue.missing_focus": () =>
      "Indica l’obiettivo dell’allenamento (ad esempio «Sviluppare la resistenza»); apparirà nella prima riga della descrizione sull’orologio.",
    "ui.training_plan.issue.focus_too_long": (p: { max?: unknown }) =>
      `L’obiettivo deve essere una breve frase su una sola riga, di massimo ${String(p.max ?? "")} caratteri.`,
    "ui.training_plan.issue.missing_description": () =>
      "Aggiungi i punti chiave dell’allenamento; appariranno nella descrizione sull’orologio.",
    "ui.training_plan.issue.name_truncated": (p: { max?: unknown }) =>
      `Il nome supera ${String(p.max ?? "")} caratteri e verrà troncato nell’elenco dell’orologio (rimarrà completo nei dettagli).`,
  },

  "lib/units": {
    big: "km",
    bigImperial: "mi",
    short: "m",
    shortImperial: "ft",
  },

  "lib/workoutNames": {
    activity: "Attività rilevata dall’IA",
    aerobic_combo: "Combinazione aerobica",
    aerobics: "Aerobica",
    air_walker: "Simulatore di camminata",
    archery: "Tiro con l’arco",
    artistic_swimming: "Nuoto artistico",
    badminton: "Badminton",
    ballet: "Danza classica",
    ballroom_dance: "Ballo da sala",
    baseball: "Baseball",
    basketball: "Pallacanestro",
    battle_rope: "Battle rope",
    beach_volleyball: "Beach volley",
    belly_dance: "Danza del ventre",
    billiards: "Biliardo",
    bmx: "BMX",
    board_game: "Giochi da tavolo",
    bocce: "Bocce",
    bouldering: "Bouldering",
    bowling: "Bowling",
    boxing: "Pugilato",
    breaking: "Breakdance",
    bridge: "Bridge",
    cardio_combat: "Cardio combat",
    checkers: "Dama",
    chess: "Scacchi",
    core_training: "Allenamento del core",
    cricket: "Cricket",
    cross_training: "Cross training",
    curling: "Curling",
    dance: "Danza",
    darts: "Freccette",
    dodgeball: 'Palla avvelenata',
    dragon_boat: "Dragon boat",
    driving: "Guida",
    e_bike: "Bici elettrica",
    elliptical: "Ellittica",
    esports: "E-sport",
    fencing: "Scherma",
    finswimming: "Nuoto pinnato",
    fishing: "Pesca",
    flexibility: "Flessibilità",
    floorball: "Floorball",
    flowriding: "Flowriding",
    folk_dance: "Danza popolare",
    free_training: "Allenamento libero",
    frisbee: "Frisbee",
    futsal: "Calcio a 5",
    gateball: "Gateball",
    gymnastics: "Ginnastica",
    hacky_sack: "Hacky sack",
    handball: "Pallamano",
    hiit: "HIIT",
    hiking: "Trekking",
    hip_hop: "Hip-hop",
    horizontal_bar: "Sbarra",
    horse_riding: "Equitazione",
    hula_hoop: "Hula hoop",
    ice_hockey: "Hockey su ghiaccio",
    ice_skating: "Pattinaggio su ghiaccio",
    indoor_cycling: "Ciclismo indoor",
    indoor_fitness: "Fitness indoor",
    indoor_ice_skating: "Pattinaggio su ghiaccio indoor",
    indoor_walking: "Camminata indoor",
    jai_alai: "Pelota basca",
    jazz_dance: "Danza jazz",
    judo: "Judo",
    jujitsu: "Jiu-jitsu",
    jump_rope: "Salto della corda",
    karate: "Karate",
    kayaking: "Kayak",
    kendo: "Kendo",
    kickboxing: "Kickboxing",
    kite_flying: "Volo con aquilone",
    latin_dance: "Ballo latino",
    martial_arts: "Arti marziali",
    mass_gymnastics: "Ginnastica di gruppo",
    modern_dance: "Danza moderna",
    muay_thai: "Muay Thai",
    open_water_swimming: "Nuoto in acque libere",
    parallel_bars: "Parallele",
    parkour: "Parkour",
    pilates: "Pilates",
    pole_dance: "Pole dance",
    pool_swimming: "Nuoto in piscina",
    race_walking: "Marcia atletica",
    ride: "Ciclismo all’aperto",
    road_cycling: "Ciclismo su strada",
    rock_climbing: "Arrampicata",
    roller_skating: "Pattinaggio a rotelle",
    rowing: "Vogatore",
    rucking: "Rucking",
    run: "Corsa all’aperto",
    sailing: "Vela",
    sepak_takraw: "Sepak takraw",
    shuffleboard: "Shuffleboard",
    shuttlecock: "Volano",
    skateboarding: "Skateboard",
    snorkeling: "Snorkeling",
    soccer: "Calcio",
    softball: "Softball",
    somatosensory_game: "Videogiochi interattivi",
    spinning: "Spinning",
    square_dance: "Ballo di gruppo",
    squash: "Squash",
    stair_climber: "Climber",
    stepper: "Stepper",
    street_dance: "Street dance",
    strength: "Sollevamento pesi",
    stretching: 'Allungamento',
    swinging: "Altalena",
    table_football: "Calcio balilla",
    table_tennis: "Tennistavolo",
    taekwondo: "Taekwondo",
    tai_chi: "Tai Chi",
    tennis: "Tennis",
    trail_running: "Trail running",
    treadmill: "Corsa su tapis roulant",
    tug_of_war: "Tiro alla fune",
    volleyball: "Pallavolo",
    walking: "Camminata",
    wall_ball: "Wall ball",
    water_polo: "Pallanuoto",
    water_rowing: "Canottaggio",
    weiqi: "Go",
    wrestling: "Lotta",
    yoga: "Yoga",
    zumba: "Zumba",
  },

  "views/ActivityDetail": {
    title: "Attività giornaliera",
    intro:
      "Passi, distanza, calorie attive e minuti di attività, giorno per giorno. Confrontati esclusivamente con i tuoi record precedenti; i giorni senza dati rimangono vuoti, senza zeri di riempimento.",
    loadingAria: "Caricamento dell’attività giornaliera in corso",
    loadFailed:
      "Dati dell’attività giornaliera momentaneamente non disponibili",
    retry: "Riprovare",
    noneInRange:
      "Nessun dato di attività in questo intervallo: seleziona un intervallo più ampio o esegui prima una sincronizzazione.",
    stepsLabel: "Passi",
    stepsUnit: "passi",
    distanceLabel: "Distanza",
    distanceUnit: "m",
    caloriesLabel: "Calorie attive",
    caloriesUnit: "kcal",
    minutesLabel: "Minuti attivi",
    minutesUnit: "min",
    desktopOnly:
      "L’anteprima nel browser non legge i dati dell’account; aprire l’applicazione desktop.",
  },

  "views/BodyStatus": {
    vitalsGroupTitle: "Preparazione e parametri vitali",
    title: "Stato del corpo",
    intro:
      "Tendenze locali di preparazione, stress, SpO₂, HRV, frequenza respiratoria, frequenza cardiaca a riposo, peso, composizione corporea e apporto nutrizionale: tutto proviene dai dati sincronizzati.",
    loadingAria: "Caricamento dello stato del corpo in corso",
    loadFailed: "Dati dello stato del corpo momentaneamente non disponibili",
    retry: "Riprovare",
    noneInRange:
      "Nessun dato sullo stato del corpo in questo intervallo: seleziona un intervallo più ampio o esegui prima una sincronizzazione.",
    desktopOnly:
      "L’anteprima nel browser non legge i dati dell’account; aprire l’applicazione desktop.",

    statLatest: "Ultimo",
    statAverage: "Media",
    statHighest: "Max",
    statLowest: "Min",
    unitScore: "pt",
    unitPerHour: "/h",
    unitBreathsPerMinute: "resp/min",
    unitGram: "g",
    unitKcal: "kcal",
    unitKcalPerDay: "kcal/giorno",
    unitGrade: "livello",
    gramsPerDay: (grams: number) => `${grams} g al giorno in media`,

    readinessLabel: "Preparazione",
    stressLabel: "Stress",
    stressTooltip: (clock: string, value: number) =>
      `${clock} <b>${value}</b> pt`,
    spo2Label: "SpO₂",
    spo2Empty: "Nessuna misurazione singola di SpO₂ in questo intervallo.",
    odiLabel: "ODI di SpO₂ notturno",
    respiratoryLabel: "Frequenza respiratoria",
    restingLabel: "Frequenza cardiaca a riposo",
    systolicLabel: "Pressione arteriosa · Sistolica",
    diastolicLabel: "Pressione arteriosa · Diastolica",
    bloodPressurePulseLabel:
      "Pulsazioni durante la misurazione della pressione",

    curveTitle: "Stress nelle ultime 24 ore",
    curveSub:
      "L’orologio misura ogni cinque minuti; rilevazioni individuali in ordine cronologico",
    curveCardAria: "Stress nelle 24 ore",
    curveChartAria: "Grafico dello stress nelle ultime 24 ore",
    curveNoSamples:
      "Nessuna misurazione dello stress nelle ultime 24 ore: nessun grafico da tracciare. Questo accade se l’orologio non è stato indossato o se il monitoraggio continuo è disattivato.",
    curveNote:
      "Gli intervalli (rilassato 1–39, normale 40–59, medio 60–79, alto 80–100) sono quelli definiti da Zepp, non da noi. In assenza di misurazioni non viene tracciata alcuna linea né inserito alcuno zero di riempimento.",

    bodyGroupTitle: "Peso e composizione corporea",
    bodyGroupEmpty:
      "Nessuna registrazione di peso o composizione corporea in questo intervallo. La composizione richiede una bilancia diagnostica per composizione corporea; i pesi rilevati dall’orologio o inseriti a mano non la includono.",
    weightLabel: "Peso",
    heightLabel: "Altezza",
    bmiLabel: "BMI",
    fatLabel: "Massa grassa",
    muscleLabel: "Massa muscolare",
    boneLabel: "Massa ossea",
    waterLabel: "Acqua corporea",
    visceralLabel: "Grasso viscerale",
    bmrLabel: "Metabolismo basale",
    scaleEmpty:
      "Nessuna pesata in questo intervallo: le misurazioni della bilancia compariranno qui dopo una sincronizzazione.",

    intakeGroupTitle: "Apporto nutrizionale",
    intakeGroupEmpty:
      "Nessun dato nutrizionale in questo intervallo. I pasti si registrano nell’app Zepp e compaiono qui dopo la sincronizzazione.",
    intakeCaloriesLabel: "Calorie assunte",
    macroTitle: "Equilibrio nutrizionale",
    macroSub:
      "Percentuale di calorie fornite da ciascun macronutriente in questo intervallo",
    macroNote:
      "Quote calcolate qui a partire dai grammi giornalieri con 4/9/4 kcal per grammo (proteine / grassi / carboidrati): non sono valori inviati dal cloud, è possibile una differenza di uno o due punti percentuali rispetto all’app Zepp. Se manca anche uno solo dei tre elementi, il grafico non viene disegnato.",
    proteinLabel: "Proteine",
    fatIntakeLabel: "Grassi",
    carbsLabel: "Carboidrati",
  },

  "views/DeviceDetail": {
    heroEyebrow: "Dispositivo",
    notFoundTitle: "Dispositivo non trovato",
    notFoundMessage:
      "Rimosso dall’account oppure non ancora identificato su questo computer.",
    factsAria: "Informazioni sul dispositivo",
    factDeviceId: "ID dispositivo",
    factFirmware: "Firmware",
    factLastData: "Ultimi dati",
    factHasLocal: "Dati locali presenti",
    factOrigin: "Origine del modello",
    hasLocalYes: "Sì",
    hasLocalNo: "Non ancora",
    factsNote:
      "L’ID del dispositivo rimane locale: vengono mostrati solo gli ultimi quattro caratteri e non compare mai nelle esportazioni né nelle segnalazioni di errore.",
    originCatalog: "Corrispondenza nel catalogo integrato",
    originExact: "Corrispondenza esatta nel catalogo integrato",
    originAlias: "Corrispondenza per alias nel catalogo integrato",
    originUserAssigned: "Scelto manualmente l’ultima volta",
    originNoMatch: "Nessuna corrispondenza",
    originNoMatchCloud:
      "Nessuna corrispondenza (il cloud non ha fornito un nome di prodotto riconoscibile)",
    originUnknown: "Sconosciuta",
    assignTitle: "È corretto?",
    assignSub:
      "Corrispondenza errata? — ad esempio se si tratta di un Balance 2 visualizzato con un altro nome — puoi impostare il modello corretto manualmente. La scelta rimane su questo computer, contrassegnata come «Modello scelto da te» senza apparire come automatica, e può essere annullata in qualsiasi momento per tornare al riconoscimento automatico.",
    assignAria: "Identificazione del modello",
    pickModel: "È sbagliato, lo indico io",
    changeModel: "Scegline un altro",
    clearAssignment: "Annullare la scelta e tornare all’automatico",
    noLocalIdentifier:
      "Nessun identificatore locale utilizzabile per questo dispositivo: impossibile salvare un’assegnazione.",
    reidentify: "Reidentificare i dispositivi",
  },

  "views/HealthCheck": {
    title: "Controllo dello stato dei dati",
    summaryAllGood:
      "Tutto regolare: recupero, analisi e scrittura sono stati completati",
    summaryFailed: (n: number) =>
      `${plural(n, { one: `${n} flusso presenta un problema`, other: `${n} flussi presentano un problema` })} — la sezione «\u00A0Fino a dove arriva ogni flusso\u00A0» qui sotto indica dove si blocca`,
    summaryPending: (n: number) =>
      `${n} endpoint o passaggi di analisi non sono ancora confermati. Ciò non dimostra che il dispositivo non li supporti.`,
    heartRateAlternate:
      "L’endpoint separato della frequenza cardiaca non ha restituito misurazioni. Altre fonti sincronizzate forniscono i dati locali.",
    heartRateEndpointEmpty:
      "L’endpoint separato della frequenza cardiaca non ha restituito misurazioni utilizzabili. Prova a sincronizzare i dettagli della smartband; una risposta vuota non prova che il dispositivo non rilevi la frequenza cardiaca.",
    summaryStreams: (ok: number, total: number) =>
      `${ok} / ${total} flussi di dati in buono stato`,
    intro:
      "Per ciascun flusso: a che punto si trova tra recupero dal cloud, analisi e scrittura locale; quali date copre; da dove proviene. I dati mancanti rimangono tali: nessun riempimento con 0.",
    loadingAria: "Lettura dello stato dei dati in corso",
    loadFailed: "Impossibile leggere lo stato dei dati",
    retry: "Riprovare",
    rangeAria: "Finestra di copertura",
    window30: "Ultimi 30 giorni",
    window90: "Ultimi 90 giorni",
    window365: "Ultimo anno",
    period: ".",
    noRecords: "Nessun dato per il momento",
    noRecordsYet: "Nessun dato ancora",
    notProvided: "Non fornito",
    timeUnknown: "Ora sconosciuta",

    actionsTitle: "Operazioni disponibili",
    actionRun: "Eseguire",
    actionRunning: "In corso…",
    actionFailed: (label: string) => `Operazione non riuscita: ${label}`,
    actionSynced: "Sincronizzazione completata, stato aggiornato.",
    actionReplayed: (count: string) =>
      `Messaggi locali rielaborati con il parser attuale (${count} record derivati) — data e ora della sincronizzazione cloud intatte.`,
    actionFolderOpened: "Cartella dei dati aperta.",
    actionIntegrityOk: "Il database ha superato il controllo di integrità.",
    actionIntegrityFailed: (detail: string) =>
      `Il database non ha superato il controllo di integrità: ${detail}`,
    actionIntegrityFallback:
      "Effettuare un backup della cartella dei dati, quindi risincronizzare",
    actionReconnect: "Riconnettere l’account Zepp nelle Impostazioni.",
    confirmDestructive: (label: string, reason: string) =>
      `${label}: ${reason}\nContinuare?`,
    action: {
      sync_first: {
        label: "Eseguire la prima sincronizzazione",
        reason: "Nessuna sincronizzazione cloud riuscita su questo computer.",
      },
      sync_retry: {
        label: "Risincronizzare",
        reason:
          "L’ultima volta alcuni flussi non sono stati recuperati dal cloud.",
      },
      reauth: {
        label: "Riconnettere l’account Zepp",
        reason:
          "Alcuni flussi non possono essere recuperati: sessione scaduta.",
      },
      reprocess: {
        label: "Rielaborare i dati grezzi locali con il parser attuale",
        reason:
          "Reinterpreta i messaggi salvati, senza usare la rete e senza modificare l’orario di sincronizzazione.",
      },
      integrity_check: {
        label: "Verificare l’integrità del database",
        reason:
          "Esegue un integrity_check SQLite sull’intero database: operazione lunga su archivi di grandi dimensioni.",
      },
      open_data_folder: {
        label: "Aprire la cartella dei dati",
        reason: "Qui risiedono il database locale, i backup e le esportazioni.",
      },
    },
    reprocessReason: (pending: number) =>
      `${pending} messaggi conservati senza record normalizzato. La rielaborazione non utilizza la rete e non modifica l’orario di sincronizzazione cloud.`,

    dbTitle: "Database locale",
    dbSchema: "Versione dello schema",
    dbSize: "Dimensioni del file",
    dbRaw: "Dati grezzi",
    dbCanonical: "Record normalizzati",
    dbPending: "In attesa di normalizzazione",
    dbNormalizer: "Revisione del parser",
    integrityLine: (verdict: string, checkedAt: string) =>
      `Controllo di integrità: ${verdict} · ${checkedAt}`,
    integrityPassed: "superato",
    integrityFailed: (detail: string) => `non superato (${detail})`,
    integrityDetailBelow: "dettagli sotto",
    integrityNeverRun:
      "Nessun controllo di integrità ancora eseguito: esamina l’intero database, operazione lenta su archivi grandi, quindi viene eseguito solo su richiesta.",
    replayInProgress:
      "Rielaborazione dei messaggi locali con il nuovo parser in corso — le sincronizzazioni cloud si sospendono e riprovano automaticamente; non si tratta di un errore.",

    timingsTitle: "Tre momenti di riferimento diversi",
    timingCloud: "Ultimo recupero dal cloud",
    timingCloudNote: "Nessun risultato ancora",
    timingNewest: "Campione di salute più recente",
    timingNewestNote:
      "Il momento esatto in cui la misurazione è avvenuta sull’orologio",
    timingReplay: "Ultima rielaborazione locale",
    timingReplayNote:
      "Rilegge i dati grezzi locali con il parser attuale. Nessun traffico di rete e nessun aggiornamento dell’orario sopra.",
    timingManual: "Ultima rielaborazione manuale",
    timingManualNote: "Quella avviata manualmente da te",

    streamsTitle: "Fino a dove arriva ogni flusso",
    streamsNote:
      "Recupero, analisi e scrittura possono fallire separatamente. Riducendoli a un singolo punto rosso, sarebbe impossibile capire se occorra riprovare, riconnettersi o se l’account semplicemente non disponga di quel flusso.",
    stageFetch: "Recupero",
    stageParse: "Analisi",
    stageWrite: "Scrittura",
    stageLine: (stage: string, state: string) => `${stage}: ${state}`,
    stage: {
      ok: "OK",
      failed: "non riuscito",
      never: "non ancora avvenuto",
    },
    errorKind: {
      network: "impossibile connettersi al cloud",
      auth: "l’account deve essere riconnesso",
      cloud_rejected: "il cloud ha ricevuto la richiesta ma l’ha rifiutata",
      storage: "scrittura nel database locale non riuscita",
      unrecognized_payload: "dati ricevuti ma illeggibili",
      not_available: "questo account non dispone di questo flusso",
      busy: "un’altra operazione stava scrivendo, questa si è fatta da parte",
      cancelled: "annullato",
      unknown: "errore non classificato",
    },
    cadence: {
      continuous: "più volte al giorno",
      daily: "una volta al giorno",
      nightly: "una volta a notte",
      occasional: "solo occasionalmente",
      per_event: "solo quando si verifica",
    },
    source: {
      device: "dispositivo singolo",
      user_fused: "aggregato lato utente",
      unknown: "fonte sconosciuta",
    },
    sourceSeparator: ", ",

    factCanonical: "Record normalizzati",
    factRaw: "Dati grezzi",
    factObservedDays: "Giorni osservati",
    factSources: "Fonti",
    coverageNoData:
      "Nessun dato locale disponibile per questo periodo; eseguire prima una sincronizzazione.",
    coverageNoGaps: "Nessuna interruzione osservata dal primo giorno con dati.",
    coverageGaps: (days: number) =>
      `${days} giorni senza dati osservati dal primo giorno con dati. Un orologio non indossato, una sincronizzazione non eseguita o un cloud che non restituisce dati generano interruzioni.`,
    gapExamples: (dates: string) => `Esempi di interruzioni: ${dates}`,
    gapMore: " e altri",
    days: (count: number) => `${count} giorni`,
    coverageOccasional:
      "L’orologio lo segnala solo occasionalmente; i giorni vuoti sono normali e non indicano alcuna perdita di dati.",
    coveragePerEvent:
      "Generato per evento: l’assenza di record significa che non vi sono state attività, non che manchino dati.",

    occasionalTitle: "Metriche generate solo occasionalmente",
    occasionalNote:
      "VO₂ max, soglia del lattato: l’orologio non li registra ogni giorno per loro natura. Qui vengono mostrati solo i giorni osservati e il valore più recente, senza contare interruzioni giornaliere: evidenziare una normale rarità in rosso sarebbe fuorviante.",
    occasionalLine: (records: string, days: number) =>
      `${records} record · osservato su ${days} giorni`,
    occasionalLatest: (date: string) => `ultimo: ${date}`,
    occasionalNone: "Nessun dato osservato in questo intervallo",
    latestObserved: (date: string) => `Più recente: ${date}.`,
  },

  "views/HeartRateDetail": {
    trendsTitle: "Tendenze di FC a riposo e HRV",
    title: "Frequenza cardiaca",
    intro:
      "Misurazioni della frequenza cardiaca delle ultime 24 ore, picchi giornalieri, frequenza cardiaca a riposo e HRV per giorno. Nessun tracciato per i periodi privi di misurazioni.",
    loadingAria: "Caricamento della frequenza cardiaca in corso",
    retry: "Riprovare",
    dayTitle: "Ultime 24 ore",
    daySub: "Misurazioni individuali in ordine cronologico",
    dayCardAria: "Frequenza cardiaca nelle 24 ore",
    chartAria: "Frequenza cardiaca nelle ultime 24 ore",
    bpmTooltip: (clock: string, value: number) =>
      `${clock} <b>${value}</b> bpm`,
    noSamples:
      "Nessun campione di frequenza cardiaca nelle ultime 24 ore: nessun grafico da tracciare.",
    dayFailed: "Frequenza cardiaca delle ultime 24 ore non disponibile",
    statLatest: "Ultimo",
    statAverage: "Media",
    statHighest: "Max",
    statLowest: "Min",
    dailyMaxTitle:
      "Picco giornaliero di frequenza cardiaca (campioni grezzi su questo computer)",
    dailyMaxAria: "Tendenza del picco giornaliero di frequenza cardiaca",
    dailyMaxLegendMax: "Picco",
    dailyMaxLegendAvg: "Media",
    dailyMaxNote: "" as string,
    dailyMaxSparse: (days: number) =>
      `${days} di questi giorni hanno pochissimi campioni (meno di 60): il loro «picco» è solo il valore più alto tra quei pochi punti, non il vero picco della giornata — contrassegnati con punti vuoti sul grafico.`,
    dailyMaxNone:
      "Nessun campione di frequenza cardiaca locale in questo intervallo: nessun picco da confrontare.",
    dailyMaxTooltip: (date: string, max: number, avg: number, samples: number) => `${date}<br/>Picco <b>${max}</b> bpm<br/>Media ${avg} bpm<br/>${samples} campioni`,
    dailyMaxFailed: "Picco giornaliero di frequenza cardiaca non disponibile",
    restingLabel: "Frequenza cardiaca a riposo",
    trendsFailed:
      "Tendenze di frequenza cardiaca a riposo e HRV non disponibili",
    desktopOnly:
      "L’anteprima nel browser non legge i dati dell’account; aprire l’applicazione desktop.",
  },

  "views/Overview": {
    overviewTitle: "Panoramica",
    loadingAria: "Caricamento della panoramica in corso",
    loadFailedTitle: "Impossibile leggere la panoramica dei dati",
    retry: "Riprovare",
    healthUnavailable: "Dati sulla salute momentaneamente non disponibili",
    partialUnavailable:
      "Alcuni flussi di dati non sono ancora stati recuperati",
    trainingTitle: "Stato di allenamento",
    trainingPanelAria: "Aprire lo stato di allenamento",
    trainingEmpty:
      "VO₂ max e carico di allenamento compariranno qui dopo la sincronizzazione",
    trainingThin:
      "Dati insufficienti negli ultimi 7 giorni per tracciare una tendenza",
    bodyTitle: "Stato del corpo",
    bodyPanelAria: "Aprire lo stato del corpo",
    bodyEmpty:
      "Preparazione, stress e SpO₂ compariranno qui dopo la sincronizzazione",
    factReadiness: "Preparazione",
    factLoad: "Carico",
    factStress: "Stress",
    factSpo2: "SpO₂",
    desktopOnly:
      "L’anteprima nel browser non legge i dati dell’account; aprire l’applicazione desktop.",
    deviceErrorPrefix: "Identificazione dei dispositivi: ",
    unrecognizedSuffix: " non ha ancora un modello identificato",
    unrecognizedCta: "Imposta il modello",
    focusQuestion: "A cosa sei più interessato?",
    focusDone: "Fatto",
    focusSkip: "Salta",
    showAllModules: "Mostra tutto",
    collapseModules: "Comprimi",
    entryWeek: "Ultimi 7 giorni",
    focusLabel: "I miei interessi",
  },

'views/RecentRecords': {
    title: 'Registrazioni recenti',
    introTimeline: 'Sonno e allenamenti sincronizzati di recente su una linea temporale, con il più recente in alto.',
    today: 'Oggi',
    yesterday: 'Ieri',
    filterAll: 'Tutti',
    filterSleep: (count: number) => `Sonno ${count}`,
    filterWorkouts: (count: number) => `Allenamenti ${count}`,
    workoutTypeAria: 'Tipo di allenamento',
    noSleep: 'Ancora nessuna registrazione del sonno',
    noWorkouts: 'Nessun allenamento da mostrare.',
    noWorkoutsOfType: 'Nessun elemento da mostrare per questo tipo di allenamento.',
    noRecords: 'Ancora nessuna registrazione di sonno o allenamento in questo periodo.',
    sleepTitle: 'Sonno',
    sleepScore: (score: number) => `Punteggio sonno ${score}`,
    avgHr: (bpm: number) => `FC media ${bpm}`,
    showMore: (count: number) => `Mostra altri ${count}`,
    hiddenIncomplete: (count: number) =>
      plural(count, {
        one: `${count} registrazione incompleta nascosta`,
        other: `${count} registrazioni incomplete nascoste`,
      }),
    partialUnavailable: 'Alcuni dati non sono al momento disponibili',
    notProvided: 'Non fornito',
    loadingLabel: 'Caricamento delle registrazioni recenti',
    loadFailedTitle: 'Impossibile caricare le registrazioni recenti',
    retry: 'Riprova',
    desktopOnly: 'L’anteprima del browser non legge i dati dell’account; apri l’applicazione desktop.',
  },

  'views/Settings': {
    title: 'Impostazioni',
    retry: 'Riprova',
    distanceUnitLabel: 'Unità di distanza',
    authWebTitle: 'Accesso a "Dati avanzati"',
    authWebSub: 'Email o telefono + password per aggiungere stress, SpO₂ e dati non presenti nell’API ufficiale (nessun accesso di terze parti)',
    officialTitle: 'Autorizzazione account Zepp',
    officialSub: 'Consigliato · autorizza nel browser; accesso con Google, Xiaomi, Facebook e Apple supportati',
    officialConnect: 'Autorizza',
    officialWaiting: 'Completa l’autorizzazione nel browser — la connessione avverrà automaticamente…',
    officialConnected: 'Autorizzato',
    officialReauth: 'Da riautorizzare',
    officialDisconnect: 'Disconnetti',
    officialDisconnectConfirm: 'Disconnettere l’autorizzazione Zepp? I dati sanitari su questo computer saranno conservati.',
    officialDisconnected: 'Autorizzazione Zepp disconnessa. I dati locali sono stati conservati.',
    officialFailed: 'Autorizzazione Zepp non riuscita',
    officialNote: 'Dati ufficiali connessi: sonno, frequenza cardiaca, passi, allenamenti, PAI e peso vengono sincronizzati; HRV, SpO₂ e stress provengono da "Dati avanzati".',
    copyAuthLink: 'Copia link di autorizzazione',
    copyAuthLinkHint: 'Un browser già connesso a Zepp andrà direttamente al consenso. Per cambiare account (ad esempio con Google o Xiaomi), apri il link in una finestra in incognito.',
    linkCopied: 'Link copiato',
    authCancelLogin: 'Annulla accesso',
    authInUse: 'In uso',
    authOpening: 'Apertura in corso…',
    authRetry: 'Riprova accesso',
    authUse: 'Usa',
    authManualTitle: 'Inserimento manuale',
    authManualSub: 'Inserisci appToken, user_id e host regionale',
    authCollapse: 'Comprimi',
    manualFormHint: 'Recuperali da un’acquisizione mitmproxy/Charles o dagli strumenti di sviluppo del browser. Tre campi necessari:',
    manualTokenPlaceholder: 'Da copiare dall’intestazione HTTP apptoken',
    manualUserIdPlaceholder: 'Da ricavare dal percorso URL /users/{user_id}/',
    manualSaving: 'Salvataggio in corso…',
    manualSave: 'Salva credenziali',
    cancel: 'Annulla',
    verifyAndSync: 'Verifica e sincronizza',
    identifying: 'Identificazione in corso…',
    identifyDevices: 'Riconosci dispositivi',
    deviceErrorPrefix: 'Identificazione dispositivi: ',
    noDevices: 'Nessun dispositivo fisico identificato; Zepp Cloud continua a sincronizzarsi come origine remota.',
    deviceFirmware: (firmware: string) => `Firmware ${firmware}`,
    unknownDeviceTitle: 'Dispositivo non identificato rilevato',
    unknownDeviceBodyA: 'Alcuni account Zepp restituiscono record di dispositivi ',
    unknownDeviceNoName: 'senza alcun campo con il nome del prodotto',
    unknownDeviceBodyB: ' — solo numeri interni, nessun modello deducibile. "Riconosci dispositivi" non cambierà il risultato. Assegna tu stesso il modello qui sopra: verrà contrassegnato come "Modello scelto da te", senza mai spacciarlo per riconoscimento automatico.',
    unknownDeviceReport: 'Inviando una segnalazione di errore, i codici di questo dispositivo verranno inclusi nel catalogo integrato: nessuno dovrà più indicarlo a mano. Solo campi inclusi in una lista consentita fissa, nessun account GitHub richiesto.',
    reportWhat: 'Cosa c’è che non va',
    reportWhatHint: ' (selezionarne uno consente l’invio anche senza rilevamento automatico)',
    reportCategoryAria: 'Tipo di problema da segnalare',
    reportNote: 'Note aggiuntive',
    reportNoteHint: ' (facoltativo, ma molto utile)',
    reportNotePlaceholder: 'Ad esempio: il mio orologio è un Amazfit Balance 2 ma appare come non identificato; oppure: un giro in bici all’aperto è stato riconosciuto come allenamento sconosciuto.',
    reportNoteCounter: (used: number, max: number) =>
      `${used} / ${max} · percorsi locali, email e identificatori lunghi vengono rimossi prima dell'invio`,
    reportSubmitting: 'Invio sicuro in corso…',
    reportSubmit: 'Invia segnalazione di errore',
    reportDoneTitle: 'Segnalazione ricevuta, grazie',
    reportDoneLine: (id: string, at: string) => `Segnalazione ${id}, inviata il ${at}.`,
    reportDoneNote: 'Dati inviati: esattamente i campi elencati sopra, più la tua nota. Niente altro.',
    reportConfirm: 'Verranno inviati solo: versione dell’applicazione, tipo di sistema, versione del parser, suggerimenti a livello di prodotto e struttura dei campi per dispositivi non riconosciuti, versione del firmware, numeri di modello (deviceSource / deviceType — numeri interi che identificano il modello, non il singolo dispositivo), codici e numero di allenamenti sconosciuti, codice di errore numerico dell’ultima richiesta rifiutata dal cloud (solo numero, flusso e timestamp — mai il testo restituito dal cloud) e la tua nota sopra riportata (percorsi locali, email e ID lunghi rimossi automaticamente). Mai l’account Zepp, token, numeri di serie, ID dispositivo, indirizzi MAC, coordinate GPS, dati sanitari o risposte grezze. Confermare l’invio?',
    reportFailed: 'Impossibile inviare la segnalazione di errore',
    lampOn: (count: number) => plural(count, { one: `${count} recuperato`, other: `${count} recuperati` }),
    lampPending: (count: number) => plural(count, { one: `Presente nel cloud, non in locale: ${count}`, other: `Presente nel cloud, non in locale: ${count}` }),
    lampOff: (count: number) => plural(count, { one: `${count} non recuperato`, other: `${count} non recuperati` }),
    capabilityEmptyTitle: 'Non ancora sincronizzato',
    capabilityEmptyBody: 'Una sincronizzazione e si illuminerà.',
    probeSummary: 'Diagnostica degli endpoint',
    probeNote: '«Non recuperato» non significa che il dispositivo non lo supporti: gli endpoint Zepp restituiscono risposte vuote per i flussi inesistenti, e solo un rifiuto esplicito viene segnalato come «il tuo dispositivo non lo fornisce».',
    probing: 'Rilevamento in corso…',
    probeRun: 'Rileva di nuovo',
    probedToday: 'verificato oggi',
    probedDaysAgo: (days: number) => plural(days, { one: 'verificato ieri', other: `verificato ${days} giorni fa` }),
    probeRecords: (records: number, latest: string) => `${plural(records, { one: `${records} registrazione`, other: `${records} registrazioni` })}${latest ? `, la più recente ${latest}` : ''}`,
    probeEmpty: 'nessun dato',
    probeRefused: 'endpoint rifiutato',
    probeFailed: 'richiesta non riuscita',
    probeUnrecognized: 'Formato di risposta non riconosciuto',
    codesUnnamed: (count: number) => `${count} ancora senza nome`,
    codesIntro: 'I modelli di allenamento personalizzati di Zepp forniscono solo un numero, senza nome, e non sono presenti nel catalogo integrato. Invece di tirare a indovinare, assegna un nome al codice: tutti i record con quel codice lo useranno, contrassegnato come definito da te nei dettagli dell’allenamento.',
    codeNumber: (code: number) => `Codice Zepp ${code}`,
    codeRecords: (count: number) => plural(count, { one: `${count} registrazione locale userà lo stesso nome`, other: `${count} registrazioni locali useranno lo stesso nome` }),
    codeShownAs: (label: string) => `Attualmente visualizzato come «${label}»`,
    codeShownAsUnknown: (code: number) => `Attualmente visualizzato come «Allenamento non riconosciuto (codice ${code})»`,
    codeInputAria: (code: number) => `Nome personalizzato per il codice ${code}`,
    codeInputPlaceholder: 'Assegna un nome, ad es. Mio allenamento core',
    codeSaving: 'Salvataggio in corso…',
    codeSave: 'Salva',
    codeFootnote: 'Il nome viene salvato solo su questo computer: non viene mai inviato a Zepp né sovrascritto da una nuova analisi. Salva lasciando il campo vuoto per rimuoverlo.',
    codeSaved: (code: number, label: string) => `Il codice ${code} verrà ora visualizzato come «${label}».`,
    codeCleared: (code: number) => `Nome personalizzato per il codice ${code} rimosso.`,
    codeSaveFailed: 'Impossibile salvare il nome personalizzato dell’allenamento',
    codeSuggestions: ['Allenamento della forza', 'Core training', 'HIIT', 'Stretching e defaticamento', 'Riabilitazione', 'Allenamento personalizzato'],
    privacyDbTitle: 'Il database locale non è crittografato',
    privacyDbBody: 'I dati sanitari sono memorizzati in chiaro in un database SQLite nella cartella data del programma; la protezione è affidata all’account di Windows / macOS e alla crittografia del disco. ZeppBridge non offre la crittografia dell’intero database — e non finge di farlo.',
    privacyTokenTitle: 'I token Zepp usano per impostazione predefinita l’archivio delle credenziali di sistema',
    privacyTokenBody: 'Predefinito: Gestione credenziali di Windows / Portachiavi di macOS / portachiavi Linux. macOS e Linux possono utilizzare esplicitamente un file di credenziali in chiaro leggibile e modificabile solo dal tuo utente; Linux supporta anche variabili di ambiente. auth.json contiene solo metadati dell’account e della regione. I token non vengono mai inseriti nei log, nelle esportazioni di dati o nelle segnalazioni di errore.',
    privacyTelemetryTitle: 'Nessuna telemetria, nessuna statistica d’uso',
    privacyTelemetryBody: 'L’applicazione non invia automaticamente alcuna informazione sulle tue abitudini d’uso. Invia i campi anonimizzati indicati sotto solo se premi esplicitamente «Invia segnalazione di errore».',
    starTitle: 'ZeppBridge ti è stato utile?',
    starBody: 'Una stella su GitHub aiuta altre persone a scoprirlo.',
    starAction: 'Lascia una stella',
    privacyReportTitle: 'Dispositivo o allenamento non riconosciuto?',
    privacyReportBody: 'Nessun account GitHub né duplicazione dei dati. Previa conferma, al repository privato delle segnalazioni di ZeppBridge vengono inviati solo: conformazione dei campi a livello di prodotto, versione del firmware, numeri di modello (interi che identificano solo il modello dell’orologio, non il singolo esemplare) e codici degli allenamenti sconosciuti con il relativo conteggio. Mai account, token, numeri di serie, ID dispositivo, indirizzi MAC, GPS, valori sanitari, risposte grezze o percorsi locali.',
    mcpBadge: 'Dati sanitari di sola lettura · nessuna porta in ascolto',
    mcpCopyPrompt: 'Copia per chiedere alla tua IA',
    mcpCopyConfig: 'Copia solo il frammento di configurazione',
    mcpPromptCopied: 'Copiato. Incollalo alla tua IA: ti fornirà i passaggi per il tuo computer.',
    mcpPromptCopyFailed: 'Copia non riuscita — seleziona manualmente il testo sopra.',
    mcpConfigCopied: 'Configurazione copiata. Sostituisci command con il percorso reale di zeppbridge-mcp.',
    mcpConfigCopyFailed: 'Copia non riuscita — seleziona manualmente la configurazione sopra.',
    mcpToolListWorkouts: 'Elenco degli allenamenti, i più recenti per primi',
    mcpToolWorkoutInsight: 'Un allenamento confrontato con la tua baseline',
    mcpToolMetricSeries: 'Serie di metriche giorno per giorno, ciascuna con la sua unità',
    mcpToolSleepDetail: 'Una notte di sonno, fase per fase',
    mcpToolDataHealth: 'Stato di recupero, analisi e scrittura di ciascun flusso',
    mcpToolWorkoutDetail: 'Tutti i campi di riepilogo memorizzati e le zone di frequenza cardiaca per un allenamento',
    mcpToolWorkoutSeries: 'Campionamenti punto per punto, traccia, intermedi e giri di un allenamento',
    mcpToolFoodData: 'Assunzione alimentare: totali giornalieri e registrazioni dettagliate',
    mcpToolAvailableMetrics: 'Quali metriche sono effettivamente presenti su questo computer',
    mcpToolMetricRecords: 'Letture dettagliate di qualsiasi metrica',
    mcpToolSleepSessions: 'Elenco delle sessioni di sonno',
    mcpToolLifeEvents: 'Eventi di vita che hai registrato',
    mcpSetupPrompt: `Uso un'applicazione desktop per Windows chiamata ZeppBridge che sincronizza i dati del mio orologio Amazfit / Zepp in un database SQLite locale.
Include un programma MCP (zeppbridge-mcp) e vorrei configurarlo con te, in modo che tu possa interrogare direttamente i miei allenamenti e i dati sanitari senza doverli esportare e incollare ogni volta.

Informazioni note:
- Il programma MCP proviene dall'archivio zeppbridge-tools scaricabile dalla pagina Releases su GitHub di ZeppBridge; una volta decompresso, l'eseguibile zeppbridge-mcp si trova all'interno. Potrei non averlo ancora scaricato.
- È un server MCP basato su stdio. I dati sanitari sono di sola lettura, non è in ascolto su alcuna porta e non richiede token né chiavi API; accede alla rete solo per pubblicare un piano di allenamento, e solo se lo autorizzo esplicitamente.
- La configurazione tipica ha questa forma: {"mcpServers": {"zeppbridge": {"command": "<percorso completo di zeppbridge-mcp>", "args": ["--scope", "task"]}}}
- Fornisce quindici strumenti di sola lettura: allenamenti (list_workouts, get_workout_detail, get_workout_series, get_workout_insight), metriche (list_available_metrics, get_metric_series, get_metric_records), sonno (list_sleep_sessions, get_sleep_detail), alimentazione (get_food_data), eventi di vita (list_life_events), integrità dei dati (get_data_health) e preparazione atletica (get_training_context, get_athlete_profile, get_training_plan); oltre a due strumenti per i piani di allenamento: draft_training_plan (salva solo una bozza) e publish_training_plan (invia all'orologio solo se autorizzato nelle impostazioni).

Dimmi:
1. Nello specifico per te (lo strumento con cui sto parlando adesso), in quale file inserire questa configurazione o quale comando usare per aggiungerla;
2. Come scrivere il percorso su Windows (se le barre rovesciate "\\" devono essere precedute da escape);
3. Come verificare che funzioni una volta configurato.

Se hai bisogno di ulteriori informazioni (quale client sto usando, dove si trova il file), chiedimelo pure.`,
    mcpConfigPathPlaceholder: '<percorso di zeppbridge-mcp>',
    retentionAria: 'Conservazione dei dati locali in giorni',
    retentionCutoff: (date: string) => `Dopo la prossima sincronizzazione riuscita, i dati antecedenti al ${date} verranno eliminati`,
    cleaningUp: 'Pulizia in corso…',
    cleanupNow: 'Pulisci ora',
    reprocessing: 'Nuova analisi in corso…',
    reprocessNow: 'Rianalizza ora',
    days: (days: number) => plural(days, { one: `${days} giorno`, other: `${days} giorni` }),
    defaultFormatLabel: 'Formato di esportazione predefinito',
    defaultFormatAria: 'Formato di esportazione predefinito',
    updateChecking: 'Controllo in corso…',
    updateCheck: 'Controlla aggiornamenti',
    updateVersion: (version: string) => `Versione ${version}`,
    buildStamp: (stamp: string) => `Build ${stamp}`,
    updateVersionLoading: 'caricamento in corso',
    updateStatusChecking: 'Controllo delle Release su GitHub in corso',
    updateStatusFailed: 'Aggiornamento non riuscito',
    updateStatusUpToDate: 'Già all’ultima versione',
    updateStatusUnmanaged: 'Gli aggiornamenti sono gestiti dal gestore di pacchetti',
    syncIntervalAria: 'Intervallo di sincronizzazione automatica',
    minutes: (minutes: number) => `${minutes} min`,
    syncing: 'Sincronizzazione in corso…',
    syncNow: 'Sincronizza ora',
    scaleLabel: 'Scala dell’interfaccia',
    openDataFolder: 'Apri cartella dati',
    clearAuth: 'Rimuovi credenziali',
    healthCheckLabel: 'Controllo integrità dei dati',
    healthCheckOpen: 'Apri controllo integrità dei dati',
    compactLabel: 'Compatta payload memorizzati',
    compactNoteA: 'I payload grezzi del cloud occupano la maggior parte dello spazio nel database. Sono testo JSON e, una volta compattati, si riducono a circa un quinto.',
    compactNoteStrong: 'Questa operazione avviene automaticamente',
    compactNoteB: ': al primo avvio di una nuova versione, i payload memorizzati vengono compressi in background; un banner lo segnala e scompare al termine. Questo pulsante serve solo a rieseguire l’operazione manualmente (se ad esempio è stata interrotta). Prima di sostituire i dati, decomprime ed esegue un confronto byte per byte, ignorando le discrepanze: il payload grezzo è l’unica base per una rilettura, quindi si preferisce non toccarlo. Segue un VACUUM, che riduce effettivamente le dimensioni del file su disco.',
    compacting: 'Compattazione in corso… (potrebbero essere necessari alcuni minuti su database grandi)',
    compactRun: 'Compatta payload memorizzati',
    backupLabel: 'Snapshot e ripristino del database',
    localApiLabel: 'API REST locale',
    localApiNote: 'Consente ad altri programmi su questo computer (script, dashboard, strumenti personali) di leggere le serie di allenamenti normalizzate in formato JSON. Lasciala disattivata se non ne hai bisogno.',
    syncDiagnostics: 'Diagnostica di sincronizzazione',
    noSyncDiagnostics: 'Ancora nessuna diagnostica di sincronizzazione.',
    apiListening: 'In ascolto',
    apiEnabledNotListening: 'Attiva ma non in ascolto',
    apiOff: 'Disattivata',
    apiToggleTitle: 'Attiva API locale',
    apiToggleSub: (address: string) => `Ha effetto immediato, senza riavvio. La disattivazione libera subito ${address}.`,
    apiToggleAria: 'Attiva API REST locale',
    apiCopyExample: 'Copia esempio autenticato',
    apiTokenLabel: 'Token di accesso',
    apiHide: 'Nascondi',
    apiShow: 'Mostra',
    apiCopy: 'Copia',
    apiRegenerate: 'Rigenera',
    apiAuthNoteA: 'Ogni richiesta deve includere ',
    apiAuthNoteB: ', altrimenti riceverà un errore 401. La rigenerazione invalida immediatamente il vecchio token.',
    apiBindNote: 'Associata esclusivamente a 127.0.0.1: di sola lettura, nessun accesso cross-origin dal browser, non restituisce alcuna credenziale. Si arresta alla chiusura di ZeppBridge.',
    apiTokenReadFailed: 'Impossibile leggere il token di accesso dell’API locale',
    apiEnabled: 'API locale attivata — nessun riavvio necessario.',
    apiDisabled: 'API locale disattivata e porta liberata.',
    apiToggleFailed: 'Impossibile attivare o disattivare l’API locale',
    apiTokenCopied: 'Token di accesso copiato.',
    apiTokenCopyFailed: 'Impossibile copiare negli appunti — clicca su «Mostra» e copia manualmente.',
    apiRegenerateConfirm: 'La rigenerazione invalida immediatamente il vecchio token; i programmi locali configurati dovranno essere aggiornati. Continuare?',
    apiTokenRegenerated: 'Nuovo token di accesso generato; il vecchio non è più valido.',
    apiRegenerateFailed: 'Impossibile rigenerare il token di accesso',
    apiExampleCopied: 'Esempio autenticato copiato (incluso il tuo token di accesso).',
    apiExampleCopyFailed: 'Impossibile copiare l’esempio — componi manualmente l’URL dell’endpoint e l’intestazione Authorization.',
    privacyModalTitle: 'Principi di privacy locale di ZeppBridge',
    privacyPoint1Title: '1. Prima di tutto locale: ',
    privacyPoint1: 'tutte le serie temporali di salute e allenamento risiedono solo nel database SQLite locale; analisi e de-identificazione avvengono interamente su questo computer.',
    privacyPoint2Title: '2. Credenziali rigorosamente isolate: ',
    privacyPoint2: 'App Token, User ID e le altre credenziali non sono condivisi con terzi; l’esportazione per l’IA li de-identifica in modo irreversibile.',
    privacyPoint3Title: '3. Posizione sotto controllo: ',
    privacyPoint3: 'le coordinate GPS non vengono mai inserite negli appunti per l’IA per impostazione predefinita, proteggendo la tua abitazione e i percorsi abituali.',
    privacyPoint4Title: '4. Le segnalazioni di errore sono una tua scelta: ',
    privacyPoint4: 'un insieme fisso di dati diagnostici in whitelist viene inviato solo dopo aver premuto «Invia segnalazione di errore» e aver confermato. Mai account, ID dispositivo, dettagli degli allenamenti o dati sanitari; nessun ticket GitHub viene mai aperto per te.',
    privacyPoint5Title: '5. Trasparenza open source: ',
    privacyPoint5: 'l’intero codice sorgente è aperto, senza alcuna logica nascosta di tracciamento remoto.',
    privacyModalOk: 'Ho capito',
    closeDialog: 'Chiudi finestra',
    connExtracting: 'Estrazione delle informazioni di accesso in corso',
    connVerifying: 'Verifica in corso',
    connWaiting: 'In attesa dell’accesso',
    connFailed: 'Accesso non riuscito',
    noRecords: 'Ancora nessuna registrazione',
    timeUnknown: 'Ora sconosciuta',
    refreshFailed: (reason: string) => `Identificazione non riuscita, ripristino della cache locale${reason}`,
    refreshFailedReason: (reason: string) => `: ${reason}`,
    refreshDone: (count: number) => `Identificazione completata; trovati ${plural(count, { one: `${count} dispositivo fisico`, other: `${count} dispositivi fisici` })}.`,
    refreshNoNewList: 'Il nuovo elenco dispositivi non è arrivato; viene mostrata la cache locale.',
    loginIncomplete: 'Accesso non completato',
    loginWindowFailed: 'Impossibile aprire la finestra di accesso',
    loginCancelFailed: 'Impossibile annullare l’accesso',
    fillAllFields: 'Compila tutti i campi obbligatori',
    manualAuthDone: 'Autenticazione manuale riuscita; credenziali salvate.',
    manualAuthFailed: 'Autenticazione manuale non riuscita',
    verifyFailed: 'Verifica non completata',
    clearAuthConfirm: 'Disconnettere questo account?\n\nVerranno rimosse solo le credenziali di accesso; tutti i dati già sincronizzati su questo computer saranno conservati.\n\nNota: il supporto multi-account non è ancora disponibile — l’accesso con un altro account scriverà i dati nello stesso database locale.',
    authCleared: 'Account disconnesso; la cronologia sincronizzata rimane su questo computer.',
    clearAuthFailed: 'Impossibile rimuovere le credenziali',
    reprocessed: (count: number) => `Dati locali rianalizzati in ${plural(count, { one: `${count} registrazione normalizzata`, other: `${count} registrazioni normalizzate` })}. L’orario di sincronizzazione cloud è invariato.`,
    reprocessFailed: 'Rianalisi dei dati locali non riuscita',
    cleanupConfirm: (days: number) => `Eliminare i dati locali anteriori a ${days} giorni fa? L’operazione non può essere annullata.`,
    cleanupDone: (days: number) => `Dati anteriori a ${days} giorni fa eliminati.`,
    cleanupFailed: 'Pulizia dei vecchi dati non riuscita',
    openFolderFailed: 'Impossibile aprire la cartella dei dati',
    nothingToCompact: 'Nulla da compattare: i payload memorizzati sono già compressi.',
    compactSkipped: (count: number) => `, ${count} ignorati (non più piccoli dopo la compressione o verifica non conforme)`,
    compactDone: (count: number, before: string, after: string, saved: string, skipped: string) =>
      `${count} payload compattati, ${before} → ${after}, ${saved} liberati${skipped}.`,
    compactFailed: 'Compattazione dei payload memorizzati non riuscita',
    retentionConfirm: (days: number) => `La prossima sincronizzazione riuscita eliminerà definitivamente i dati locali antecedenti a ${days} giorni fa. Continuare?`,
    prefsSavedNoEstimate: 'Impostazioni salvate; stima dello spazio su disco non disponibile al momento',
    prefsSaved: 'Impostazioni di conservazione e recupero cronologia salvate.',
    prefsSaveFailed: 'Impossibile salvare le impostazioni',
    stream: {
      heart_rate: 'Frequenza cardiaca',
      sleep: 'Sonno',
      workouts: 'Allenamenti',
      steps: 'Passi',
      daily_activity: 'Attività quotidiana',
      stress: 'Livello di stress',
      spo2: 'SpO₂ notturna',
      respiratory_rate: 'Frequenza respiratoria',
      hrv: 'HRV (SDNN)',
      hrv_rmssd: 'HRV (RMSSD)',
      recovery: 'Recupero ed energia',
      training_load: 'Carico di allenamento',
      vo2max: 'VO₂max',
      lactate_threshold: 'Soglia del lattato',
      pai: 'Indice PAI',
      blood_pressure: 'Pressione sanguigna (sperimentale)',
      weight: 'Peso',
      emotion: 'Umore',
      food: 'Diario alimentare (calorie e macronutrienti)',
      second_heart_rate: 'Indice frequenza cardiaca al secondo',
      spo2_files: 'Indice file grezzi SpO₂ per lettura',
    },
    unitDays: 'giorni',
    unitRecords: 'registrazioni',
    capabilityNoRecords: (days: number) => `Nessuna registrazione negli ultimi ${days} giorni`,
    capabilityNotIngested: 'Il cloud contiene registrazioni, ma questo computer non ha ancora dati utilizzabili. Sincronizza o recupera la cronologia; se continuano a mancare, il formato del messaggio potrebbe richiedere ulteriore supporto.',
    capabilityFoodHistoryHint: 'I pasti sono presenti nel cloud ma non ancora memorizzati in locale. Se precedono l’intervallo dell’ultima sincronizzazione incrementale, avvia una sincronizzazione della cronologia per quelle date; se continuano a non comparire, segnala il formato dei dati.',
    capabilityUnsupported: 'Non fornito dal tuo account o dal tuo dispositivo',
    capabilityNoneProbed: (days: number) =>
      `I candidati consultati non hanno restituito alcuna registrazione negli ultimi ${days} giorni; questo non consente di stabilire se il dispositivo abbia effettuato misurazioni.`,
    capabilityUnconfirmed:
      'Gli endpoint candidati non hanno potuto confermare questi dati. Il supporto da parte dell’account o del dispositivo rimane sconosciuto.',
    probeWindow: (days: number) => `Intervallo consultato: ${days} giorni`,
    capabilityNotProbed: 'Non ancora verificato',
    capabilityLocal: (records: number, unit: string, latest: string) =>
      `${records} ${unit}${latest ? ` · fino al ${latest}` : ''}`,
    capabilityCloud: (records: number, unit: string, latest: string) =>
      `${records} ${unit} nel cloud${latest ? ` · fino al ${latest}` : ''}`,
    reportCategory: {
      device: {
        label: 'Un dispositivo non è stato riconosciuto',
        hint: 'il modello è errato o viene mostrato come «Non identificato»',
      },
      workout: {
        label: 'Un tipo di allenamento non è stato riconosciuto',
        hint: 'viene mostrato come allenamento sconosciuto o con lo sport sbagliato',
      },
      data: {
        label: 'I dati non corrispondono',
        hint: 'un dato risulta sempre vuoto o differisce dall’app Zepp',
      },
      other: {
        label: 'Altro problema',
        hint: 'descrivilo qui sotto',
      },
    },
    refreshFailedPeriod: '.',
  },

  'views/SleepDetail': {
    title: 'Dettagli sonno',
    askLabel: 'Sonno',
    loadingDetail: 'Lettura della registrazione del sonno…',
    loadFailedTitle: 'Impossibile leggere questa registrazione del sonno',
    loadFailed: 'Dettagli del sonno non disponibili al momento',
    retry: 'Riprova',
    notFoundTitle: 'Registrazione del sonno non trovata',
    notFoundMessage: 'Potrebbe essere stata eliminata o non ancora sincronizzata su questo computer.',
    notProvided: 'Non fornito',

    heroAria: 'Durata e punteggio del sonno',
    durationKicker: 'Tempo di sonno',
    scoreKicker: 'Punteggio sonno',
    heroMeta: (fellAsleep: string, wokeUp: string, inBed: string) =>
      `Addormentato alle ${fellAsleep} · svegliato alle ${wokeUp} · a letto ${inBed}`,
    lastCloudSync: (clock: string) => `Ultima sincronizzazione cloud alle ${clock}`,
    metaAria: 'Origine e dispositivo',

    stagesTitle: 'Fasi del sonno',
    stagesAria: 'Fasi del sonno',
    footnote: 'Vengono mostrati solo i riepiloghi delle fasi ricevuti dal cloud. Senza dati REM, viene visualizzato «Non fornito» senza calcoli deduttivi, e non viene tracciata alcuna linea temporale.',

    weeklyTitle: 'Struttura del sonno, ultimi 7 giorni',
    weeklySub: 'Fasi impilate per notte',
    weeklyAria: 'Sonno negli ultimi 7 giorni',
    weeklyChartAria: 'Grafico a barre impilate della struttura del sonno negli ultimi 7 giorni',
    hoursAxis: 'ore',
    tooltipRow: (name: string, hours: number) => `${name}: ${hours} h<br/>`,
    tooltipRowMissing: (name: string) => `${name}: Non fornito<br/>`,
    tooltipTotal: (date: string, hours: string) => `<b>${date} — ${hours} h di sonno in totale</b><br/>`,

    sourceTitle: 'Origine',
    sourceProvider: 'Fornitore',
    providerOfficial: 'Autorizzazione ufficiale Zepp',
    sourceScope: 'Ambito',
    syncedAt: 'Sincronizzato',
    syncTimeMissing: 'Orario di sincronizzazione non fornito',
    timezone: 'Fuso orario',
    deviceTitle: 'Dispositivo',
    deviceName: 'Nome',
    deviceId: 'ID dispositivo',
    deviceFirmware: 'Firmware',
    deviceUndetermined: 'Dispositivo non determinato',
  },

  'views/SleepList': {
    title: 'Sonno',
    intro: 'Registrazioni del sonno sincronizzate su questo computer. Senza una sequenza temporale completa, viene mostrato solo il riepilogo.',
    scoreLabel: 'Punteggio',
    shown: (shown: number, total: number) => `${shown} visualizzati su ${total}`,
    footnote: (count: number, from: string) => `${count} registrazioni · a partire da ${from}`,
    loadMore: 'Carica altro',
    loadingMore: 'Caricamento in corso…',
    emptyTitle: 'Ancora nessuna registrazione del sonno',
    emptyMessage: 'Appariranno qui dopo la sincronizzazione. Nessuna fase reale viene inventata.',
    loadFailedTitle: 'Impossibile leggere le registrazioni del sonno',
    loadFailed: 'Elenco del sonno non disponibile al momento',
    retry: 'Riprova',
  },

  'views/TrainingStatus': {
    title: 'Stato di allenamento',
    intro: 'VO₂max, soglia del lattato, carico di allenamento e zone di frequenza cardiaca. Tutto viene letto dalle registrazioni sincronizzate; nessun consiglio di allenamento.',
    loadingAria: 'Caricamento dello stato di allenamento',
    loadFailed: 'Dati dello stato di allenamento non disponibili al momento',
    retry: 'Riprova',
    desktopOnly: 'L’anteprima del browser non legge i dati dell’account; apri l’applicazione desktop.',
    notProvided: 'Non fornito',

    loadLabel: 'Carico di allenamento',
    loadUnit: '' as string,
    loadEmpty: 'Nessuna registrazione del carico di allenamento in questo intervallo.',
    balanceLabel: 'Bilanciamento del carico di allenamento',
    balanceChartAria: 'Carico di allenamento su 7 e 28 giorni con rapporto acuto/cronico',
    balanceEmpty: 'Dati del carico di allenamento non ancora sufficienti per tracciare questa curva.',
    acute7d: 'Carico 7 giorni',
    chronicWeekly: 'Media settimanale 28 giorni',
    acuteChronic: 'Acuto/cronico',
    acuteTooltip: (value: string, days: number) => `Carico 7 giorni <b>${value}</b> (${days}/7 giorni con dati)`,
    chronicTooltip: (value: string) => `Media settimanale 28 giorni <b>${value}</b>`,
    ratioTooltip: (value: string) => `Acuto/cronico <b>${value}</b>`,
    ratioMissing: (days: number) => `— (solo ${days} giorni con dati nell'intervallo di 28)`,

    paiLabel: 'PAI',
    paiEmpty: 'Nessuna registrazione PAI in questo intervallo.',

    thresholdLabel: 'Soglia del lattato',
    latestTag: 'Ultimo',
    thresholdHr: 'FC di soglia',
    thresholdPace: 'Passo di soglia',
    thresholdChartAria: 'Frequenza cardiaca e passo alla soglia del lattato',
    thresholdEmpty: 'Nessuna misurazione della soglia del lattato in questo intervallo.',
    thresholdOnce: (date: string) => `Una sola misurazione della soglia in questo intervallo (${date}) — nessun trend da tracciare.`,
    thresholdHrTooltip: (value: number) => `FC di soglia <b>${value}</b> bpm`,
    thresholdPaceTooltip: (value: string, unit: string) => `Passo di soglia <b>${value}</b> ${unit}`,

    vo2Empty: 'Nessuna registrazione di VO₂max in questo intervallo; si aggiorna solo dopo una corsa all’aperto.',
  },

  'views/WorkoutDetail': {
    loadFailedTitle: 'Impossibile leggere questo allenamento',
    loadFailed: 'Dettagli dell’allenamento non disponibili al momento',
    retry: 'Riprova',
    notFoundTitle: 'Allenamento non trovato',
    notFoundMessage: 'Potrebbe essere stato eliminato o non ancora sincronizzato su questo computer.',
    notProvided: 'Non fornito',
    notFetchedYet: 'Non ancora recuperato',
    timeUnknown: 'Ora sconosciuta',
    pageFoot: 'Decodificato su questo computer. Il tracciato è disegnato su un canvas locale e non viene mai inviato a servizi di mappe.',
    heroAria: 'Panoramica dell’allenamento',
    unitKcal: 'kcal',

    metricListAria: 'Riepilogo delle prestazioni dell’allenamento',
    metricDistance: 'Distanza',
    metricDuration: 'Durata in movimento',
    metricMovingTime: 'Tempo in movimento',
    metricPausedTime: 'Tempo in pausa',
    metricAvgPace: 'Passo medio',
    metricMovingPace: 'Passo in movimento',
    metricElapsedPace: 'Passo trascorso',
    metricCalories: 'Calorie',
    metricAvgHr: 'FC media',
    metricMaxHr: 'FC max',
    metricAscent: 'Dislivello positivo',
    metricTrainingEffect: 'Effetto allenamento aerobico',
    metricAnaerobicEffect: 'Effetto allenamento anaerobico',
    metricTrainingLoad: 'Carico di allenamento',
    metricRpe: 'Sforzo percepito',

    eyebrowDecoded: 'Decodificato',
    decodedTitle: 'Valori decodificati',
    decodedAria: 'Valori decodificati',
    decodedLocally: 'Decodificato in locale',
    decodedNote: 'Riepilogo calcolato esclusivamente sui campioni validi di questa registrazione; i salti anomali vengono ignorati.',
    decodedSamples: 'Campioni della serie temporale',
    decodedRoutePoints: 'Punti traccia GPS',
    decodedPauses: 'Intervalli di pausa',
    decodedMaxHr: 'FC max',
    decodedAvgPower: 'Potenza media',
    decodedMaxPower: 'Potenza massima',
    decodedAvgCadence: 'Cadenza media',
    decodedMaxCadence: 'Cadenza massima',
    decodedAvgStride: 'Passo medio',
    decodedGroundContact: 'Tempo di contatto al suolo medio',
    decodedVerticalOscillation: 'Oscillazione verticale media',
    decodedVerticalRatio: 'Rapporto verticale',
    decodedBestEquivalentPace: 'Miglior passo equivalente',
    decodedDescent: 'Dislivello negativo',

    chartHeart: 'Frequenza cardiaca',
    chartPace: 'Passo',
    chartAltitude: 'Altitudine',
    chartCadence: 'Cadenza',
    chartAria: (title: string) => `${title} nel corso dell’allenamento`,
    chartsEmptyTitle: 'Nessun grafico punto per punto',
    chartsEmptyBody: 'Questo allenamento non ha sincronizzato serie di frequenza cardiaca, passo, altitudine o cadenza.',
    seriesFailedTitle: 'Impossibile caricare le serie punto per punto',
    seriesFailed: 'Lettura delle serie punto per punto non riuscita per questo allenamento',
    statMax: 'Max',
    statMin: 'Min',
    statAverage: 'Media',
    statFastest: 'Più veloce',
    statSlowest: 'Più lento',

    eyebrowRoute: 'Traccia',
    routeTitle: 'Traccia GPS',
    routeAria: 'Traccia GPS',
    routeSvgAria: 'Traccia GPS in locale, colorata in base al tempo e al campione di passo più vicino',
    routeLegendPace: (count: number) => `${count} punti di passo validi · P10–P90`,
    routeLegendNoPace: 'Meno di 3 punti di passo validi · nessuna colorazione per velocità',
    legendSlow: 'Lento',
    legendWarm: 'Moderato',
    legendSteady: 'Costante',
    legendFast: 'Veloce',
    routeNote: 'Tracciato in locale · senza rete',
    routeModeAria: 'Visualizzazione del tracciato',
    routeModeLocal: 'Locale',
    routeModeMap: 'Mappa',
    routeMapAria: 'Traccia GPS sulla mappa online',
    mapConsentTitle: 'Aprire la mappa online?',
    mapConsentBody: 'La mappa proviene da OpenStreetMap; caricarla indica loro approssimativamente dove si è svolto questo allenamento.',
    mapConsentOnce: 'Solo questa volta',
    mapConsentAlways: 'Sempre',
    mapConsentCancel: 'No, grazie',
    mapFailed: 'Impossibile caricare la mappa; ritorno al tracciato locale',

    eyebrowHrZones: 'Zone FC',
    hrZonesTitle: 'Zone di frequenza cardiaca',
    hrZonesAria: 'Zone di frequenza cardiaca',
    hrZoneBarAria: 'Quota di tempo trascorsa in ciascuna zona di frequenza cardiaca',
    hrZonesNote: 'Le soglie provengono dalle impostazioni dell’orologio, trasmesse da Zepp insieme all’allenamento; ZeppBridge non le ricalcola. La pagina Stato di allenamento utilizza un modello differente a scelta — le due cifre possono non coincidere.',
    hrZoneBelow: (upper: number) => `Sotto ${upper}`,
    hrZoneBetween: (low: number, high: number) => `${low}–${high}`,
    hrZoneShare: (percent: string) => `${percent}%`,
    hrZoneTotal: (duration: string) => `${duration} con frequenza cardiaca`,

    typeEvidenceAria: 'Come è stato determinato il tipo di allenamento',
    myCorrection: 'La mia correzione',
    correctionAria: 'La mia correzione del tipo di questo allenamento',
    noCorrection: 'Nessuna correzione',
    customName: (code: string, name: string) => `Il tuo nome per il codice ${code}: ${name}`,
    zeppBridgeMatch: (label: string) => `ZeppBridge lo identifica come: ${label}`,
    zeppRawCode: (code: string) => `Codice grezzo Zepp: ${code}`,
    overrideSaved: 'Correzione del tipo di allenamento salvata in locale.',
    overrideCleared: 'Correzione rimossa — ripristinata l’identificazione di ZeppBridge.',
    overrideFailed: 'Impossibile salvare la correzione del tipo di allenamento',
    deviceNameMissing: 'Nome del dispositivo non fornito',

    exportTitle: 'Esportazione e condivisione',
    exportAria: 'Esportazione e condivisione',
    exportSub: 'Copia in formato JSON, CSV o GPX, oppure scegli una cartella per salvare questo allenamento come file FIT.',
    exportFormatAria: 'Formato di esportazione',
    exportGo: (format: string) => `Copia dati ${format}`,
    exportNeedsSeries: 'Impossibile caricare le serie punto per punto — questa registrazione non può essere esportata.',
    exportFailed: 'Esportazione non riuscita',
    saveFit: 'Salva file FIT',
    savedFit: 'File FIT salvato',
    copied: (format: string) => `Dati ${format} copiati.`,

    needDesktop: 'Il passaggio all’IA richiede l’applicazione desktop: questa anteprima del browser non apre siti esterni.',
    preparing: 'Preparazione in corso…',
    insightFailed: 'Impossibile generare informazioni per questo allenamento',
    aiRecoveryTitle: (label: string, day: string) => `${day} ${label} · con recupero`,
    aiRecoveryPrompt: (label: string, gap: number | null) => `Ecco uno dei miei allenamenti di ${label}${gap === null ? ' (nessun allenamento precedente registrato)' : `, ${gap} giorni dopo il mio allenamento precedente`}. Il file contiene anche i dati su sonno, FC a riposo, HRV, stress e prontezza per i 30 giorni precedenti (inclusi se registrati; i dati mancanti indicano «non fornito»).\n\nRispondi in questo ordine:\n1. Valuta prima il mio stato di forma prima di questo allenamento: confronta la media degli ultimi 7 giorni con la baseline dei 30 giorni precedenti — il recupero è stato buono o scarso?\n2. Analizza poi l'intensità e le prestazioni di questo allenamento alla luce di tale stato, distinguendo un problema di recupero da una cattiva sessione.\n3. Infine, ${gap === null ? 'quale intensità puntare per la prossima volta' : `dopo un intervallo di ${gap} giorni, a quale intensità riprendere la prossima volta`}.\n\nRegole: confrontami solo con la mia cronologia personale, non con medie della popolazione; indica chiaramente i dati mancanti invece di stimarli; nessuna diagnosi medica.`,
    aiPrompt: (label: string) => `Sei un analista sportivo. Ecco la registrazione completa della mia sessione di ${label}, estratta dal database locale di ZeppBridge e anonimizzata.
Analizza questa sessione basandoti esclusivamente sui fatti contenuti nella registrazione: intensità, rapporto passo / frequenza cardiaca, eventuali cali di ritmo o segmenti anomali, e cosa cambiare concretamente la prossima volta.

Vincoli:
- Questi dati non hanno riferimenti di popolazione: non confrontarmi con «adulti sani» né con alcuna media.
- Se un dato manca, dichiara che manca. Non colmare mai i vuoti con 0 o stime.
- Nessuna diagnosi medica, nessuna valutazione del rischio di malattie, nessun consiglio terapeutico.

Rispondi in Markdown.`,

    eyebrowProvenance: 'Provenienza',
    provenanceTitle: 'Provenienza',
    provenanceAria: 'Provenienza',
    provenanceProvider: 'Fornitore',
    provenanceDevice: 'Dispositivo',
    provenanceScope: 'Ambito',
    provenanceRecordId: 'ID registrazione',
    provenanceSynced: 'Ultima sincronizzazione',
    evidenceSummary: 'Giustificazione del tipo e origini',
    missingMetrics: (list: string) => `Non fornito in questa registrazione: ${list}`,
    routeMissing: 'Nessun percorso: questa registrazione non contiene abbastanza punti GPS per tracciare un itinerario.',
  },

  'views/WorkoutList': {
    title: 'Allenamenti',
    intro: 'Allenamenti sincronizzati su questo computer. Senza traccia, nessuna mappa.',
    avgHr: (bpm: number) => `FC media ${bpm}`,
    notProvided: 'Non fornito',
    shown: (loaded: number, total: number) => `${loaded} caricati su ${total}`,
    footnote: (count: number) =>
      plural(count, {
        one: `${count} registrazione visualizzabile`,
        other: `${count} registrazioni visualizzabili`,
      }),
    loadMore: 'Carica altro',
    loadingMore: 'Caricamento in corso…',
    emptyTitle: 'Nulla da mostrare per ora',
    emptyMessage: 'Dopo una sincronizzazione, qui compaiono solo le registrazioni con un tipo, un orario e almeno una metrica reale. Senza GPS o campioni punto per punto, nessun grafico vuoto.',
    loadFailedTitle: 'Impossibile leggere gli allenamenti',
    loadFailed: 'Elenco degli allenamenti non disponibile al momento',
    retry: 'Riprova',
  },

  'views/settings/deck': {
    pageIntro: 'Apri una scheda per regolarla; una volta aperta, trascina l’intestazione lateralmente per passare alla successiva.',
    pageIntroDeck: 'Scorri lateralmente per scegliere una scheda e tocca quella al centro per aprirla — oppure «Mostra tutto» per vederle tutte insieme.',
    openCard: 'Apri',

    cardAccount: 'Account e dispositivi',
    cardArchive: 'Archiviazione e memoria',
    cardData: 'I tuoi dati',
    cardAi: 'Strumenti IA',
    cardDisplay: 'Schermo e lingua',
    cardPrivacy: 'Privacy e sicurezza',
    cardAdvanced: 'Avanzate e manutenzione',

    sumAccount: (state: string, devices: number) =>
      `${state} · ${plural(devices, { one: `${devices} dispositivo`, other: `${devices} dispositivi` })}`,
    sumAccountOff: 'Nessun account Zepp connesso',
    sumSyncOn: (minutes: number) => `Sincronizzazione automatica · ogni ${minutes} min`,
    sumSyncOff: 'Sincronizzazione automatica disattivata',
    sumArchiveOn: 'Conservazione a lungo termine · nessuna eliminazione automatica',
    sumArchiveOff: (days: number) =>
      plural(days, {
        one: `Conserva l'ultimo giorno (${days}) · elimina automaticamente i dati più vecchi`,
        other: `Conserva gli ultimi ${days} giorni · elimina automaticamente i dati più vecchi`,
      }),
    sumData: (available: number, total: number) => `${available} flussi di dati su ${total} in locale`,
    sumDataLoading: 'Lettura delle funzionalità in corso…',
    sumAi: (format: string) => `Accesso MCP · esportazione predefinita ${format}`,
    sumDisplay: (language: string, unit: string, scale: number) => `${language} · ${unit} · ${scale}%`,
    sumPrivacy: 'Dati memorizzati solo su questo computer',
    sumAdvanced: 'Backup e ripristino · API locale · integrità dei dati',
    autoSyncToggle: 'Sincronizzazione automatica',

    secAccount: 'Account Zepp',
    secDevices: 'Dispositivi',
    secLogin: 'Metodo di accesso',
    secLoginSub: 'Da aprire solo se devi cambiare metodo di accesso',
    secCapability: 'Dati recuperati',
    secCodes: 'Codici di allenamento sconosciuti',
    secMcp: 'Strumenti MCP',
    secExport: 'Esportazione predefinita',
    secFeedback: 'Segnala un problema',
    sumFeedback: 'Dispositivo non riconosciuto o dati errati? Inviaci una segnalazione anonimizzata',

    firstSyncing: (current: number, total: number) => `Connesso · recupero delle registrazioni recenti ${current}/${total}`,
    firstSyncingPlain: 'Connesso · recupero delle registrazioni recenti',
    firstReady: 'I tuoi primi dati sono qui: scopri questa settimana nella panoramica',
    goOverview: 'Vai alla panoramica',
    deviceOpen: 'Visualizza o cambia modello',

    mcpPreview: 'Anteprima della configurazione',
    exportFormatSub: 'Formato preselezionato durante l’esportazione',

    themeLabel: 'Tema',
    themeSystem: 'Di sistema',
    themeDark: 'Scuro',
    themeLight: 'Chiaro',
    scaleSub: 'Dimensione standard al 100% (Ctrl + / - supportati)',
  },

  'views/settings/sections/McpTaskScopes': {
    title: 'Autorizza attività per MCP',
    empty: 'Nessuna attività registrata. Inviane una a un’IA per vederla comparire qui.',
  },

  'views/settings/sections/account': {
    accountFallback: 'Account Zepp',
    official: (state: string) => `Ufficiale ${state}`,
    advanced: (state: string) => `Dati avanzati ${state}`,
    stOn: 'connesso',
    stOff: 'non connesso',
    stReauth: 'da riautorizzare',
    stWaiting: 'in attesa del browser',
    stUnverified: 'non verificato',
    stSigningIn: 'accesso in corso',
    stFailed: 'accesso non riuscito',
    connect: 'Connetti',
    reauth: 'Riautorizza',
    cancel: 'Annulla',
    verify: 'Verifica',
    connectAdvanced: 'Connetti Dati avanzati',
    logoutTitle: 'Disconnetti da Zepp',
    logoutSub: 'I dati locali rimangono; la sincronizzazione riprenderà al nuovo accesso',
    logoutShort: 'Disconnetti',
    deviceCheck: 'Modello errato? Clicca per cambiarlo',
    unknownShort: 'Un dispositivo non è stato riconosciuto: clicca per scegliere il modello o invia una segnalazione per aggiungerlo',
    learnMore: 'Ulteriori informazioni',
  },

  'views/settings/sections/advanced': {
    secPrefs: 'Altre preferenze',
    folderTitle: 'Cartella dei dati',
    folderSub: 'La cartella data accanto all’applicazione conserva tutti i tuoi dati sanitari',
    healthSub: 'Se il risultato di una sincronizzazione sembra anomalo, cercane la causa qui',
    compactSub: 'Viene eseguito automaticamente al primo avvio di una nuova versione; avvialo manualmente da qui',
    compactMore: 'Dettagli',
  },

  'views/settings/sections/ai': {
    lead: 'Consenti agli strumenti di IA su questo computer (Claude Code, Codex, ecc.) di interrogare direttamente i tuoi dati',
    toolsLabel: 'Strumenti accessibili dall’IA (passa il cursore per i dettagli)',
    scopesHint: 'Si applica solo a MCP avviato con --scope task',
    publishTitle: 'Consenti all’IA di pubblicare direttamente i piani di allenamento',
    publishOff: 'Disattivato: l’IA può solo creare bozze; confermi nella pagina «Invia all’IA» prima dell’invio all’orologio',
    publishOn: 'Attivato: con il tuo consenso, l’IA può inviare piani direttamente all’orologio; non cancella mai i piani esistenti',
    toolTrainingContext: 'Allenamento e recupero recenti in un’unica chiamata: tabella giornaliera, ogni allenamento, piano attivo',
    toolAthleteProfile: 'Zone di frequenza cardiaca, soglie, passi di corsa recenti e contesto scritto per l’IA',
    toolTrainingPlan: 'Registro dei piani di allenamento: piano attivo, stato di consegna, bozze',
    toolDraftPlan: 'Redige un piano di allenamento (salvato come bozza, non inviato all’orologio)',
    toolPublishPlan: 'Invia una bozza all’orologio (richiede l’attivazione dell’opzione sopra)',
    connectTitle: 'Connetti uno strumento di IA',
    connectSub: 'I primi due copiano comandi da incollare in un terminale; Claude Desktop salva un’estensione da installare con doppio clic',
    connectCopied: 'Comandi copiati; incollali in un terminale',
    bundleSaved: 'Estensione salvata; fai doppio clic su di essa per aggiungerla a Claude Desktop',
    bundlePick: 'Scegli una cartella per l’estensione',
    sidecarMissing: 'Questa versione non include il programma MCP; connettilo manualmente con il prompt o la configurazione qui sotto',
    sidecarAppImage: 'Un’AppImage viene eseguita da una posizione temporanea diversa a ogni avvio, quindi gli strumenti di IA non possono memorizzarne il percorso: scarica il pacchetto separato di strumenti CLI / MCP e connettilo con la configurazione qui sotto',
    staleClients: (names: string) => `${names} puntano ancora a un altro zeppbridge-mcp, probabilmente una vecchia versione incapace di leggere questa libreria: usa il pulsante corrispondente per riconnetterti`,
    otherClients: 'Altri client',
    configReady: 'Configurazione copiata con il percorso precompilato',
    autoTitle: 'Passa all’IA automaticamente',
    autoOff: 'Disattivato: il file va negli appunti; premi Ctrl+V nella chat con l’IA, poi Invio',
    autoOn: 'Attivato: all’apertura del sito dell’IA, il file e il messaggio iniziale vengono incollati e inviati al posto tuo; premi Esc per interrompere in qualsiasi momento',
  },

  'views/settings/sections/archive': {
    secKeep: 'Conservazione',
    keepTitle: 'Conserva i dati',
    year: '1 anno',
    forever: 'Sempre',
    keepForeverSub: 'Nessuna pulizia automatica; la libreria cresce nel tempo',
    sizeTitle: 'Su questo computer',
    sizeSince: (month: string) => `Da ${month}`,
    sizeEmpty: 'Ancora nessun dato',
    secHistory: 'Cronologia precedente',
    fillTitle: 'Recupera cronologia precedente',
    filledTo: (month: string) => `Recuperato fino a ${month}`,
    filledToLeft: (month: string, left: number) => `Recuperato fino a ${month} · ancora ${left} ${left === 1 ? 'blocco rimanente' : 'blocchi rimanenti'}`,
    neverFilled: 'Non ancora recuperato',
    details: 'Dettagli',
    backupTitle: 'Backup e ripristino',
    backupLatest: (when: string) => `Ultimo snapshot ${when}`,
    backupNone: 'Nessuno snapshot al momento',
    open: 'Apri',
  },

  'views/settings/sections/data': {
    intro: 'Aggiornato a ogni sincronizzazione; un elemento attenuato non indica che il dispositivo ne sia sprovvisto',
    codesHint: (count: number) => `${count} ${count === 1 ? 'tipo di attività non riconosciuto' : 'tipi di attività non riconosciuti'}`,
    codesFix: 'Assegna un nome',
  },

  'views/settings/sections/display': {
    focusTitle: 'Cosa mi interessa',
    focusSlideSub: 'La panoramica posiziona questo blocco per primo e raggruppa il resto sotto «Mostra tutto»; «Bilanciato» mantiene la disposizione iniziale',
  },

  'views/settings/sections/fileName': {
    example: 'ad es.',
    exampleTitle: 'Ultimi 14 giorni',
    nameSub: 'Ogni esportazione segue questa regola: il periodo e i dati sono indicati nel nome del file.',
    nameTitle: 'Denominazione dei file per l’IA',
    ruleApp: 'ZeppBridge + data' as string,
    ruleRange: 'Intervallo di date + contenuto',
    ruleTask: 'Nome attività + orario',
  },

  'views/settings/sections/maintenance': {
    secMaintenance: 'Manutenzione',
    cleanupTitle: 'Pulisci in base alla conservazione',
    cleanupSub: (date: string) => `Elimina i dati antecedenti al ${date}`,
    cleanupForever: 'Tutto viene conservato; niente da pulire',
    reparseTitle: 'Rianalizza i dati locali',
    reparseSub: 'Ricalcola con le regole attuali, offline',
    resetTitle: 'Cancella registro di copertura',
    resetSub: 'Cancella solo la cronologia di recupero; i dati salvati rimangono',
  },

  'views/settings/sections/privacy': {
    lead: 'I tuoi dati rimangono su questo computer: nessun caricamento online, nessuna statistica d’uso',
    learnMore: 'Ulteriori informazioni',
    apiOn: (url: string) => `Attivata · ${url}`,
    apiOff: 'Disattivata',
    apiOpen: 'Configura',
  },

  'views/settings/sections/sync': {
    cardTitle: 'Sincronizzazione',
    autoSub: 'Recupera nuovi dati a questo intervallo finché l’applicazione è aperta',
    off: 'Disattivato',
    lastSynced: (when: string) => `Ultima sincronizzazione ${when}`,
    neverSynced: 'Non ancora sincronizzato',
    newest: (when: string) => `Dato più recente ${when}`,
    cloudStale: (when: string) => `Il cloud ha dati solo fino a ${when} · trascina prima verso il basso per aggiornare nell’app Zepp sul telefono`,
    cloudStaleNoTime: 'Non ci sono ancora nuovi dati nel cloud · trascina prima verso il basso per aggiornare nell’app Zepp sul telefono',
  },
  },

  errors: {
/* —— core —— */
  'err.core.network':
    'Impossibile raggiungere la regione Zepp: controlla la rete e riprova',
  'err.core.needs_reauth': 'Sessione scaduta: riconnettiti a Zepp',
  'err.core.unavailable':
    'Questo account o questa regione non fornisce questi dati',
  'err.core.retry_exhausted':
    'Servizio Zepp momentaneamente non disponibile: riprova tra poco',
  'err.core.http_status':
    'Il servizio Zepp ha restituito un errore: riprova tra poco',
  'err.core.cloud_rejected':
    'Il cloud Zepp ha ricevuto la richiesta ma l’ha rifiutata. Se il problema persiste, riconnetti l’account Zepp nelle Impostazioni',
  'err.core.cancelled': 'Operazione annullata',
  'err.core.auth': 'Errore di autenticazione',
  'err.headless.no_credential_store':
    'Nessun gestore credenziali di sistema disponibile su questo computer (GNOME Keyring / KWallet); i server headless e i container di solito ne sono sprovvisti. Imposta ZEPPBRIDGE_CREDENTIAL_STORE=file per salvare il token con permessi 0600 nella cartella dei dati, oppure usa ZEPPBRIDGE_CREDENTIAL_STORE=env con ZEPPBRIDGE_APP_TOKEN.',
  'err.headless.schema_upgrade':
    'Il database locale è precedente a questa versione e una connessione di sola lettura non può aggiornarlo. Avvia una volta l’applicazione desktop oppure esegui zeppbridge-cli reprocess sull’ambiente headless; entrambe le opzioni effettuano un backup prima dell’aggiornamento.',
  'err.headless.token_not_in_store':
    'I dati dell’account sono presenti, ma nel gestore credenziali manca il relativo token. Il database può essere copiato da un computer all’altro, il token no: risiede nel gestore credenziali del computer originale. Effettua nuovamente l’accesso.',
  'err.core.credential_store':
    'Impossibile accedere all’archivio delle credenziali. Verifica che non sia bloccato, vietato dai criteri di sistema, configurato male o privo dei corretti permessi sui file. L’accesso web e l’inserimento manuale utilizzano lo stesso archivio: cambiare metodo non consente di aggirare un errore di archiviazione. Se il Portachiavi di macOS o il portachiavi di Linux non sono disponibili, segui la guida all’archiviazione delle credenziali nel README: avvia con ZEPPBRIDGE_CREDENTIAL_STORE=file ed effettua nuovamente l’accesso; in questo modo il token verrà salvato in testo normale in un file leggibile solo dal tuo utente.',
  'err.core.invalid_host': 'Indirizzo della regione Zepp non sicuro',
  'err.core.config': 'La configurazione presenta problemi e deve essere prima corretta',
  'err.core.timed_out':
    'Tempo scaduto per questa sincronizzazione; la parte rimanente proseguirà alla sincronizzazione successiva',
  'err.core.busy': 'È in corso un’altra operazione di scrittura: attendi che sia terminata',
  'err.core.account_mismatch':
    'Questo database contiene già i dati di un altro account Zepp, quindi non è stato registrato nulla per questo account. Per cambiare account, chiudi ZeppBridge, sposta o rinomina la cartella «data» e riconnettiti',
  'err.core.parse': 'Impossibile analizzare i dati restituiti da Zepp',
  'err.core.database': 'Database locale momentaneamente non disponibile',
  'err.core.io': 'Lettura o scrittura del file locale non riuscita',
  'err.core.unknown': 'Si è verificato un errore imprevisto',
  'err.app.starting':
    'I dati locali sono ancora in preparazione: la pagina si aggiornerà automaticamente a breve',

  /* —— connect & auth —— */
  'err.auth.sync_init_failed':
    'Impossibile inizializzare la sincronizzazione: controlla la regione dell’account e riprova',
  'err.auth.verify_network':
    'Verifica non riuscita: impossibile connettersi a Zepp, controlla la rete e riprova',
  'err.auth.verify_needs_reauth':
    'Verifica non riuscita: credenziali scadute, salvale nuovamente',
  'err.auth.verify_failed': 'Verifica delle credenziali non riuscita',

  /* —— web login —— */
  'err.login.waiting': 'Completa l’accesso a Zepp nella finestra a comparsa',
  'err.login.fallback_page': 'Apertura della pagina di accesso alternativa in corso',
  'err.login.extracting': 'Credenziali lette. Conferma della regione in corso',
  'err.login.verifying': 'Verifica dell’account in corso',
  'err.login.connected': 'Connesso all’account Zepp',
  'err.official.browser':
    'Impossibile aprire il browser di sistema: controlla il browser predefinito e riprova.',
  'err.official.denied':
    'Autorizzazione non concessa: ZeppBridge non ha ricevuto alcun dato.',
  'err.official.rejected': 'Zepp non ha accettato l’autorizzazione: riprova.',
  'err.official.expired': 'L’autorizzazione è scaduta: riavvia la procedura.',
  'err.official.timeout':
    'Tempo di attesa per l’autorizzazione scaduto: riavvia la procedura.',
  'err.official.not_enabled':
    'Il servizio di autorizzazione ufficiale Zepp non è ancora attivo: riprova più tardi.',
  'err.official.store':
    'Autorizzazione riuscita, ma il token non è stato salvato nell’archivio credenziali di sistema.',
  'err.official.failed':
    'L’autorizzazione ufficiale Zepp non è stata completata: riprova più tardi.',
  'err.login.timeout': 'Accesso scaduto: riprova',
  'err.login.credentials_unreadable':
    'Accesso effettuato, ma non è stato possibile leggere le credenziali dalla finestra di accesso. In alternativa inserisci un App Token manualmente.',
  'err.login.region_probe_failed':
    'Credenziali lette, ma impossibile confermare la regione dell’account. Effettua nuovamente l’accesso oppure inserisci un App Token manualmente.',
  'err.login.credentials_rejected':
    'Zepp ha rifiutato queste credenziali: esci dalla finestra di accesso e accedi di nuovo',
  'err.login.region_unreachable':
    'Impossibile raggiungere il servizio di regione Zepp: controlla la rete e riprova',
  'err.login.region_retrying':
    'Impossibile raggiungere il servizio di regione Zepp, nuovo tentativo in corso. Lascia aperta la finestra di accesso, non è necessario accedere nuovamente',
  'err.login.third_party_stalled':
    'L’accesso di terze parti sembra bloccato: le passkey di Google spesso si arrestano alla verifica all’interno della finestra dell’app. Chiudi la finestra di accesso e usa e-mail + password, oppure inserisci manualmente l’App Token nelle Impostazioni.',
  'err.login.bad_url': 'Indirizzo di accesso non valido',
  'err.login.window_failed': 'Impossibile aprire la finestra di accesso',
  'err.login.window_busy':
    'La finestra di accesso precedente si sta ancora chiudendo: attendi un attimo e riprova',
  'err.login.state_unavailable': 'Stato dell’applicazione non disponibile',
  'err.login.cancelled': 'Accesso annullato',
  'err.login.sync_init_failed':
    'Accesso riuscito, ma non è stato possibile inizializzare la sincronizzazione',

  /* —— sync & backfill —— */
  'err.sync.not_connected':
    'Non ancora connesso a Zepp: completa prima la connessione',
  'err.sync.not_verified':
    'Verifica prima la connessione, quindi sincronizza i dati recenti',
  'err.sync.not_verified_probe':
    'Verifica prima la connessione, quindi rileva le funzionalità',
  'err.sync.not_verified_backfill':
    'Verifica prima la connessione, quindi esegui il recupero dello storico',
  'err.sync.history_days_out_of_range':
    'Numero di giorni di sincronizzazione al di fuori dell’intervallo consentito',
  'err.sync.deferred_compaction':
    'Compressione dei pacchetti storici in corso per risparmiare spazio su disco; questa sincronizzazione riproverà automaticamente',
  'err.sync.deferred_replay':
    'Ricostruzione dei dati derivati dai pacchetti locali in corso; questa sincronizzazione riproverà automaticamente',
  'err.sync.deferred_busy':
    'Un’altra operazione di scrittura è in corso; questa sincronizzazione riproverà automaticamente',
  'err.backfill.bad_start_date':
    'Data iniziale per il recupero non valida: formato richiesto AAAA-MM-GG',
  'err.backfill.no_canonical_records':
    'Il cloud ha restituito dati, ma non è stato possibile estrarre registrazioni utilizzabili',
  'err.backfill.partial_window':
    'Questo intervallo è stato salvato solo parzialmente: è necessario riprovare',
  'err.backfill.start_in_future':
    'La data iniziale per il recupero non può essere successiva a oggi',
  'err.backup.restore_busy':
    'Ripristino non eseguito: è in corso un’altra operazione di scrittura. Database attuale invariato; nuovo tentativo al prossimo avvio',
  'err.backup.restore_failed':
    'Ripristino non completato: il database attuale è rimasto invariato; nuovo tentativo al prossimo avvio',
  'err.backup.not_found':
    'Il record di backup non esiste o è stato eliminato',

  /* —— capabilities —— */
  'err.capability.not_synced': 'Non ancora sincronizzato',
  'err.capability.needs_reauth': 'Nuova autenticazione richiesta',
  'err.capability.unverified': 'Funzionalità non ancora verificata',
  'err.capability.unavailable': 'Funzionalità non disponibile',
  'err.capability.unknown': 'Stato funzionalità sconosciuto',
  'err.capability.other': 'Stato funzionalità sconosciuto',

  /* —— export —— */
  'err.export.empty_range':
    'Nessun record da esportare in questo intervallo',
  'err.export.convert_failed':
    'Conversione nel formato richiesto non riuscita',
  'err.export.write_failed':
    'Scrittura del file di esportazione non riuscita',
  'err.mcp.sidecar_missing':
    'Questa versione non include il programma MCP; scarica zeppbridge-tools da GitHub',
  'err.mcp.bundle_failed':
    'Generazione dell’estensione Claude Desktop non riuscita',
  'err.export.path_required': 'Seleziona prima una posizione di salvataggio',
  'err.export.path_not_absolute':
    'La posizione di salvataggio deve essere un percorso assoluto',
  'err.export.not_a_directory':
    'L’esportazione FIT richiede una cartella: il percorso selezionato è un file',

  /* —— hand to AI —— */
  'err.handoff.prompt_required': 'Inserisci prima un prompt',
  'err.handoff.empty_range':
    'Nessun record disponibile per il passaggio all’IA in questo intervallo',
  'err.handoff.mkdir_failed':
    'Creazione della cartella di esportazione del pacchetto non riuscita',
  'err.handoff.write_failed':
    'Scrittura dei dati anonimizzati per l’IA non riuscita',
  'err.handoff.encode_failed':
    'Codifica dell’esportazione anonimizzata per l’IA non riuscita',

  /* —— feedback —— */
  'err.diagnostic.nothing_to_submit':
    'Questo dispositivo non possiede un codice modello utile per il catalogo: nessun dato da inviare',
  'err.diagnostic.empty_report':
    'Seleziona prima una tipologia di problema o scrivi una descrizione, altrimenti la segnalazione non conterrà informazioni utili',
  'err.diagnostic.client_init_failed':
    'Impossibile inizializzare la connessione per la segnalazione di errore',
  'err.diagnostic.send_failed':
    'Invio della segnalazione non riuscito: controlla la rete e riprova',
  'err.diagnostic.http_error':
    'Il servizio di segnalazione ha restituito un errore',
  'err.diagnostic.rate_limited':
    'Troppe segnalazioni inviate in poco tempo: riprova più tardi. Quelle già inviate sono state conservate, non è necessario reinviarle.',
  'err.diagnostic.bad_response':
    'Il servizio di segnalazione ha restituito una risposta non interpretabile',

  /* —— misc —— */
  'err.workout.not_found':
    'La registrazione dell’allenamento non esiste o è stata eliminata',
  'err.prefs.retention_out_of_range':
    'I giorni di conservazione devono essere compresi tra 1 e 365 giorni',
  'err.storage.write_busy':
    'È in corso un’altra operazione di scrittura di ZeppBridge: attendi che sia terminata',
  'err.storage.write_lock_unavailable':
    'Impossibile acquisire il blocco di scrittura: verifica i permessi della cartella dei dati',
  'err.storage.worker_failed':
    'L’attività del database in background è stata interrotta',
  'err.local_api.token_unavailable':
    'Impossibile leggere le credenziali dell’API locale',
  'err.local_api.token_rotate_failed':
    'Impossibile rigenerare le credenziali dell’API locale',
  'err.local_api.port_in_use':
    'La porta dell’API locale è già utilizzata da un altro programma',
  'err.local_api.bind_failed': 'Impossibile avviare l’API locale',
  'err.local_api.thread_failed':
    'Impossibile avviare il thread dell’API locale',
  'err.local_api.state_write_failed':
    'Impossibile salvare lo stato di attivazione dell’API locale',
  'err.data_folder.open_failed':
    'Apertura della cartella dei dati non riuscita',
  'err.data_folder.unsupported_os':
    'L’apertura della cartella dati è supportata solo su Windows e macOS',
  'err.update.localappdata_missing':
    'Percorso LOCALAPPDATA di Windows non disponibile',
  'err.update.launch_failed':
    'La nuova versione è pronta ma non si è avviata: aprila manualmente una volta',
  'err.update.unsafe_data_location':
    'Installazione interrotta: impossibile confermare la conservazione della cartella dati dopo l’aggiornamento. Chiudi ZeppBridge, copia l’intera cartella data interna all’app nella cartella Application Support dell’utente, correggi ZEPPBRIDGE_DATA_DIR e riprova. Non eliminare i dati precedenti.',
  'err.update.check_failed':
    'Controllo dei nuovi aggiornamenti non riuscito: verrà effettuato un nuovo tentativo al prossimo avvio',
  'err.update.download_failed':
    'Download della nuova versione non riuscito (o firma non valida): verrà riscaricata al prossimo avvio',
  'err.update.not_ready': 'La nuova versione non è ancora pronta',
  'err.update.apply_failed':
    'Impossibile avviare l’aggiornamento: riprova più tardi',
  'err.update.package_invalid':
    'Contenuto del pacchetto di aggiornamento non valido: aggiornamento annullato',
  'err.update.swap_failed':
    'Sostituzione dei file di programma non riuscita: lo stato iniziale è stato ripristinato',
  'err.update.install_failed':
    'Installazione della nuova versione non riuscita',

  /* —— ai_tasks —— */
  'err.ai_task.invalid':
    'I dati dell’attività non sono validi: controlla i campi inseriti',
  'err.ai_task.not_found':
    'L’attività di analisi non esiste o è stata eliminata',
  'err.ai_task.workout_not_found':
    'Gli allenamenti selezionati non esistono su questo computer',
  'err.ai_task.write_failed':
    'Scrittura dei file di consegna all’IA non riuscita',
  'err.ai_task.attachment_missing':
    'Il file allegato non si trova più nella sua posizione originale',
  'err.ai_handoff.file': 'Impossibile trovare il file da consegnare',
  'err.ai_handoff.provider':
    'L’IA selezionata non è inclusa nell’elenco di quelle consentite',
  'err.ai_handoff.unsupported':
    'La copia dei file negli appunti non è ancora supportata su questo sistema',
  'err.ai_handoff.clipboard':
    'Gli appunti sono utilizzati da un’altra applicazione: riprova tra un istante',
  'err.ai_template.invalid':
    'I dati del modello non sono validi: controlla i campi inseriti',
  'err.ai_template.not_found': 'Il modello non esiste o è stato eliminato',
  'err.ai_template.builtin_readonly':
    'I modelli predefiniti sono di sola lettura: salvali come modello personalizzato',

  /* —— MCP access scope —— */
  'err.mcp.scope_denied':
    'Questa richiesta supera l’ambito delle attività condivise con MCP',
  'err.mcp.scope_no_grants':
    'Nessuna attività è ancora aperta a MCP. Contrassegna un’attività come "aperta a MCP" nella relativa pagina e riprova',

  /* —— training plans —— */
  'err.training_plan.draft_not_found':
    'Questa bozza di piano non esiste più',
  'err.training_plan.rest_unparsable':
    'Impossibile leggere la data di riposo, l’orario per andare a dormire o l’obiettivo di sonno',
  'err.training_plan.rest_outside_range':
    'La data di riposo è al di fuori del periodo del piano',
  'err.training_plan.draft_closed':
    'Questa bozza di piano è già stata inviata o eliminata',
  'err.training_plan.publish_not_found': 'Nessuna traccia di questo invio',
  'err.training_plan.rejected':
    'Zepp non ha accettato questo piano: il piano sull’orologio è rimasto invariato',
  'err.training_plan.format':
    'La struttura del piano di allenamento non è valida e non è stato salvato',
  'err.training_plan.invalid':
    'Questo piano non ha superato la convalida e non è stato inviato',
  'err.training_plan.ai_publish_disabled':
    'L’IA non è autorizzata a pubblicare direttamente i piani di allenamento',
  'err.training_plan.needs_clear_confirmation':
    'Questa pubblicazione cancellerebbe parte del piano sull’orologio: conferma l’operazione in ZeppBridge',
  },

  backendText: {
'ui.backup.file_missing': 'Il file di backup non si trova più nella cartella di backup',
  'ui.backup.integrity_failed': 'Il file di backup non ha superato il controllo di integrità SQLite',
  'ui.backup.sha256_mismatch': 'Il codice SHA-256 del file di backup non corrisponde al manifest: potrebbe essere danneggiato o modificato',
  'ui.backup.size_mismatch': 'La dimensione del file di backup non corrisponde al manifest: potrebbe essere danneggiato',
  'ui.estimate.builtin_guess': 'Stima approssimativa integrata (campioni locali non ancora sufficienti)',
  'ui.estimate.disk_too_small': 'Meno di 300 MB liberi: impossibile recuperare una cronologia superiore a 90 giorni',
  'ui.estimate.disk_unknown': 'Impossibile leggere lo spazio libero su disco',
  'ui.estimate.measured': 'Stima basata sul ritmo effettivo di accumulo dei tuoi dati',
  'ui.estimate.partial': 'Stima parziale: calcolata solo sui flussi con campioni sufficienti',
  'ui.estimate.stop_no_space': 'Spazio su disco insufficiente per questo recupero',
  },
} satisfies LocalePack;
