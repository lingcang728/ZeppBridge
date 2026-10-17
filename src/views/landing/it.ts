import type { LandingPack } from '../../composables/useLandingLocale';

const pack: LandingPack = {
  meta: {
    title: 'ZeppBridge · I dati del tuo orologio. Il tuo archivio personale.',
    description: 'Conserva in locale frequenza cardiaca, sonno e allenamenti di Amazfit e Zepp. Esplora l’esempio sintetico v3 o scarica la versione pubblica stabile. Gratuito e open source.',
    ogTitle: 'ZeppBridge · I dati del tuo orologio. Il tuo archivio personale.',
    ogDescription: 'Conserva in locale frequenza cardiaca, sonno e allenamenti di Amazfit e Zepp. Esplora l’esempio sintetico v3 o scarica la versione pubblica stabile. Gratuito e open source.',
  },
  copy: {
    nav: {
      home: 'Home di ZeppBridge',
      site: 'Navigazione del sito',
      demo: 'Demo',
      ai: 'Invia all’IA',
      privacy: 'Privacy',
      download: 'Scarica la versione pubblica',
      github: 'GitHub',
      language: 'Lingua',
      toDark: 'Passa al tema scuro',
      toLight: 'Passa al tema chiaro',
      connect: 'Connetti',
      faq: 'Domande frequenti',
    },
    downloads: {
      windows: {
        label: 'Scarica per Windows',
        hint: 'Programma di installazione x64',
        msi: 'MSI per installazioni gestite',
      },
      macos: {
        label: 'Scarica per macOS',
        hint: 'Apple Silicon',
      },
      linux: {
        label: 'Linux',
        previewBadge: 'Sperimentale',
        note: 'deb, rpm, AppImage e Flatpak vengono compilati dalla CI, ma nessuno ha ancora testato l’accesso e il portachiavi da cima a fondo su un desktop Linux reale. Riscontri un problema? Apri una segnalazione.',
      },
      status: {
        loading: 'Ricerca dell’installer più recente in corso',
        ready: 'Fai clic per scaricare direttamente',
        fallback: 'Apre GitHub Releases, dove puoi scegliere l’installer',
      },
    },
    sample: 'Esempio',
    hero: {
      eyebrow: 'Gratuito · Open source · Archivio sanitario locale',
      titleLead: 'I dati del tuo orologio.',
      titleAccent: 'Sul tuo computer.',
      lead: 'Salva frequenza cardiaca, sonno e allenamenti di Amazfit dal cloud Zepp direttamente sul tuo computer. Consulta la cronologia, preserva i dati mancanti ed esporta ciò che desideri.',
      github: 'Guarda il codice sorgente su GitHub',
      meta: 'Gratuito · Windows 10 / 11 · macOS (Apple Silicon) · Linux',
      devices: 'Dispositivi Amazfit; le metriche variano a seconda del modello',
      stage: {
        hint: 'Accedi all’esempio',
        note: 'La vera applicazione con dati sintetici. Non si connette al tuo account.',
        loading: 'Apertura dell’app in corso…',
        exit: 'Esci dalla demo',
        unavailable: 'La demo non è disponibile in questo browser. Consulta le sezioni sottostanti o esplora il codice sorgente.',
      },
      demo: 'Visualizza l’esempio',
      edition: "ZeppBridge 3 · Dati di esempio sintetici. Scarica la versione stabile più recente per usare i tuoi dati.",
    },
    handoff: {
      chat: 'Chat con l’IA',
      you: 'Tu',
      file: 'ZeppBridge ultimi 14 giorni.md',
      prompt: 'Organizza i record in questo esempio sintetico. Elenca origini, date e campi mancanti senza formulare giudizi sullo stato di salute.',
      answer: 'Il file di esempio organizza i dati su sonno e allenamento per data. I periodi non misurati rimangono vuoti. Prima di confrontare periodi diversi, verifica che le origini e la copertura corrispondano; questi dati non possono spiegare il motivo delle variazioni.',
      note: 'Conversazione di esempio sintetica. Questa pagina non invia alcun file e non si connette a nessuna IA. Nell’uso reale, decidi tu se trasmettere contenuti a un servizio esterno.',
      close: 'Chiudi',
    },
    privacy: {
      kicker: 'Dati e privacy',
      heading: 'Il tuo archivio è locale. I percorsi sono chiari ed espliciti.',
      lead: 'La sincronizzazione normale legge i dati sanitari da Zepp e li salva sul tuo computer. L’IA esterna è un percorso separato che scegli esplicitamente tu.',
      nodes: {
        watch: 'Orologio e app Zepp',
        cloud: 'Cloud Zepp',
        computer: 'Archivio sanitario locale',
        export: 'L’IA esterna di tua scelta',
      },
      flowNote: 'L’orologio esegue il caricamento tramite l’app per smartphone Zepp prima della sincronizzazione con ZeppBridge. Il sito web non archivia i dati sanitari.',
      exportNote: 'Esportazione facoltativa · Revisione e invio manuali',
      services: {
        title: 'Servizi web con ruoli limitati',
        copy: 'I callback di autorizzazione ufficiale e il rinnovo dei token utilizzano i servizi del sito web; la verifica degli aggiornamenti legge le informazioni sui rilasci. I report sugli errori inviano diagnostica limitata solo dopo la tua conferma, senza alcuna lettura sanitaria.',
      },
      docs: 'Consulta i confini completi dei dati',
      points: [
        {
          title: 'Credenziali custodite nel sistema operativo per impostazione predefinita',
          copy: 'Per impostazione predefinita viene utilizzato il portachiavi del sistema operativo. Alcune piattaforme offrono un’opzione esplicita di archiviazione su file con livelli di protezione differenti.',
        },
        {
          title: 'Locale non significa crittografato',
          copy: 'Il database sanitario non è crittografato per impostazione predefinita. Usa account di sistema separati su un computer condiviso e proteggi i tuoi backup.',
        },
        {
          title: 'Sei tu a dare inizio all’esportazione',
          copy: 'I pacchetti per l’IA vengono preparati e anonimizzati localmente. Una volta inviati, si applicano le regole sulla privacy del destinatario. Le normali esportazioni differiscono dai backup completi.',
        },
      ],
    },
    connect: {
      kicker: 'Collega i tuoi dati',
      heading: 'Inizia con l’autorizzazione ufficiale',
      lead: 'Un unico percorso per l’uso quotidiano. Esplora le connessioni avanzate solo quando hai bisogno di campi aggiuntivi.',
      recommended: 'Inizio consigliato',
      advanced: 'Alternative avanzate',
      edition: 'Questi sono i percorsi di connessione di ZeppBridge 3. Consulta le note di rilascio per le funzionalità e le modifiche di ogni versione.',
      docs: 'Leggi la guida alla connessione',
      paths: [
        {
          title: 'Autorizzazione ufficiale Zepp',
          copy: 'Apri la pagina di autorizzazione di Zepp nel tuo browser e usa il tuo metodo di accesso consueto.',
          detail: 'Legge sonno, frequenza cardiaca, passi, allenamenti, PAI e peso ufficialmente disponibili, a seconda dei dati già presenti nel tuo account.',
        },
        {
          title: 'Connessione dati avanzata',
          copy: 'Aggiungi questo percorso per HRV, ossigeno nel sangue, stress o prontezza.',
          detail: 'Utilizza l’accesso tramite email o telefono. Offre campi differenti; non tutti i dispositivi misurano o restituiscono tutti i valori.',
        },
        {
          title: 'Credenziali manuali',
          copy: 'Per chi ha familiarità con le API e ha già ottenuto le credenziali attraverso una via legittima sotto il proprio controllo.',
          detail: 'Inserisci token, ID utente e indirizzo regionale. Non importare mai un token di origine sconosciuta né condividerlo pubblicamente.',
        },
      ],
      note: 'Il dispositivo, i record nel cloud e il percorso di connessione determinano i campi disponibili. Una risposta vuota non dimostra un’incompatibilità. Sono percorsi alternativi, non tre passaggi obbligatori.',
    },
    final: {
      kicker: 'Download · Versione pubblica stabile',
      heading: 'Conserva una copia sul tuo computer',
      lead: 'Gratuito e open source. La sincronizzazione utilizza il tuo account Zepp esistente; non è richiesto un account ZeppBridge separato.',
      docs: 'Note di installazione e di rilascio',
      facts: {
        channel: "I download offrono la versione stabile più recente di ZeppBridge 3. La demo usa dati sintetici; consulta le note di rilascio per le modifiche di ogni versione.",
        systems: 'Windows 10 / 11 x64 · macOS Apple Silicon · Linux x86_64',
        ai: 'Consultazione ed esportazione non richiedono alcuna IA. Un’eventuale IA esterna utilizzerà il servizio e l’account di tua scelta.',
        windows: 'Windows: i programmi di installazione non dispongono ancora di una firma digitale attendibile. Potrebbero comparire avvisi di editore sconosciuto o SmartScreen. Verifica sempre l’origine ufficiale.',
        macos: 'macOS: le build non sono firmate né autenticate. Il primo avvio potrebbe essere bloccato; segui le istruzioni di installazione del progetto.',
      },
    },
    footer: {
      tagline: 'Un ponte locale per i dati Amazfit e Zepp.',
      disclaimer: 'ZeppBridge è un progetto open source indipendente che partecipa al programma Zepp Developer Partner, non un prodotto ufficiale Zepp. I marchi Zepp e Amazfit appartengono ai rispettivi proprietari.',
      source: 'Codice sorgente',
    },
    faq: {
      heading: 'Alcuni chiarimenti prima di iniziare',
      lead: 'Sei domande frequenti. La documentazione del progetto copre impostazioni dettagliate e differenze tra le versioni.',
      docs: 'Documentazione del progetto',
      items: [
        {
          question: 'Di quali account ho bisogno?',
          answer: 'La sincronizzazione richiede il tuo account Zepp esistente e l’app per smartphone Zepp. Non esiste alcun account ZeppBridge aggiuntivo. La demo di esempio non richiede alcun accesso.',
        },
        {
          question: 'Supporta il mio dispositivo e le mie metriche?',
          answer: 'I dati provengono dal tuo account cloud Zepp. I campi disponibili dipendono da ciò che l’orologio ha misurato, da quanto conservato nel cloud e dal percorso di connessione. Non è garantito che ogni modello offra tutte le metriche.',
        },
        {
          question: 'Posso usarlo offline?',
          answer: 'I dati salvati in precedenza possono essere visualizzati ed esportati offline. L’accesso, le nuove sincronizzazioni e la ricerca di aggiornamenti richiedono una connessione di rete. L’orologio continua a sincronizzarsi tramite l’app Zepp.',
        },
        {
          question: 'Uno spazio vuoto nel grafico equivale a zero?',
          answer: 'No. Non campionato, non ancora sincronizzato e non decodificato sono stati distinti. I valori mancanti non vengono mai riempiti con zero, con letture precedenti o con stime.',
        },
        {
          question: 'È obbligatorio usare un’IA?',
          answer: 'No. Le esportazioni vengono preparate localmente. Un’IA esterna riceve contenuti solo quando sei tu a incollarli o caricarli. Verifica ambito, anonimizzazione e informativa sulla privacy del servizio.',
        },
        {
          question: 'Il download corrisponde all’esempio mostrato?',
          answer: "La demo mostra ZeppBridge 3 con dati sintetici. I download offrono la versione stabile più recente. Consulta le note di rilascio per le modifiche di ogni versione e verifica la compatibilità del tuo dispositivo prima di inviare un piano.",
        },
      ],
    },
    rebuild: {
      featuresHeading: 'Riscopri il tuo tempo nei dati che conservi.',
      featuresLead: 'Sonno, battito cardiaco, allenamenti e piani. Scopri come ogni elemento dell’archivio si compone.',
      demoHeading: 'Provalo prima di scaricarlo',
      demoLead: 'La vera interfaccia V3 con campioni sintetici. Nessun accesso, nessun contatto con i tuoi dati personali.',
      mobileHint: 'Questa è un’applicazione desktop. Su smartphone puoi visualizzarla a schermo intero; usa un computer per interagire.',
      fullscreen: 'Visualizza la demo desktop a schermo intero',
      retry: 'Ricarica la demo',
      play: 'Riproduci demo',
      pause: 'Sospendi demo',
      mediaNote: 'V3 · Esempio sintetico · Registrato in modalità scura',
      moreConnections: 'Altri modi per connettersi',
      partner: 'Programma Zepp Developer Partner',
      disclaimer: 'ZeppBridge è un progetto open source indipendente che partecipa al programma Zepp Developer Partner, non un prodotto ufficiale Zepp. I marchi Zepp e Amazfit appartengono ai rispettivi proprietari.',
      docsHeading: 'Un punto di partenza.',
      guide: 'Configurazione e guida all’uso',
      versions: 'Versioni e note di rilascio',
      community: 'Codice sorgente e community',
      privacyDoc: 'Dati e privacy',
      star: 'Lo trovi utile? Una stella su GitHub aiuta altri a scoprirlo.',
      dismiss: 'Chiudi',
      nav: [
        'Funzionalità',
        'Dati e privacy',
        'Prova l’app',
        'Guida',
      ],
      title: [
        'I dati del tuo orologio.',
        'Sul tuo computer.',
      ],
      stories: [
        {
          eyebrow: 'Archivio locale',
          title: 'Crea una copia locale dei tuoi dati',
          body: 'Collega il tuo account Zepp e conserva sul computer i dati di battito cardiaco, sonno e allenamento presenti nel cloud. I record sincronizzati sono accessibili anche offline.',
          bullets: [
            'Dati sincronizzati disponibili offline',
            'Verifica origini e copertura',
          ],
        },
        {
          eyebrow: 'Cronologia del sonno',
          title: 'Uno spazio dedicato a ogni notte',
          body: 'Esplora la cronologia del sonno e consulta durata e fasi di ciascuna notte. Le notti senza orologio rimangono non registrate; i dati non sostituiscono il parere medico.',
          bullets: [
            'Cronologia notte per notte e fasi',
            'Le notti senza misurazione restano vuote',
          ],
        },
        {
          eyebrow: 'Battito cardiaco e intervalli',
          title: 'Nessuna misurazione, nessun valore',
          body: 'I campioni assenti restano mancanti. Non vengono mai integrati con zero, valori precedenti o stime. Non ancora sincronizzato e non misurato sono stati distinti.',
          bullets: [
            'Gli intervalli vuoti restano nella curva',
            'Nessuna lettura viene sostituita con zeri',
          ],
        },
        {
          eyebrow: 'Allenamenti e attività',
          title: 'Conserva la storia di ogni allenamento',
          body: 'Rivedi sessioni, dettagli e trend di allenamento. Le metriche disponibili dipendono dal tuo dispositivo e dai dati sincronizzati; verifica la copertura prima di fare confronti.',
          bullets: [
            'Dettagli delle sessioni e trend di allenamento',
            'Utilizza i dati già disponibili',
          ],
        },
        {
          eyebrow: 'Invia all’IA',
          title: 'Scegli l’ambito, poi il destinatario',
          body: 'Nella demo v3 selezioni dati e date ed esamini l’esportazione. Il pacchetto viene generato in locale; un’IA esterna riceve contenuti solo quando decidi di inviarli.',
          bullets: [
            'Scegli date e dati',
            'Verifica prima di inviare manualmente',
          ],
        },
        {
          eyebrow: 'Revisione del piano',
          title: 'Rivedi prima del prossimo passo',
          body: "Importa e rivedi i piani di allenamento in ZeppBridge 3. L’invio all’orologio dipende dal supporto del dispositivo e dai controlli di compatibilità.",
          bullets: [
            'Visualizzazione settimanale e controllo giornaliero',
            'L’invio dipende dalla compatibilità del dispositivo',
          ],
        },
        {
          eyebrow: 'Impostazioni dell’archivio',
          title: 'Imposta il ritmo del tuo archivio',
          body: 'Esplora sincronizzazione, conservazione e interfacce locali. Le opzioni possono differire tra le versioni; verificane lo scopo prima di attivarle.',
          bullets: [
            'Controlli su sincronizzazione e conservazione',
            'Attiva le interfacce locali in autonomia',
          ],
        },
      ],
      learnFeatures: 'Esplora le funzionalità',
      languageFallback: 'Impossibile caricare questa lingua. Viene mostrato l’inglese; seleziona nuovamente la lingua per riprovare.',
    },
  },
};

export default pack;
