import type { LandingPack } from '../../composables/useLandingLocale';

const pack: LandingPack = {
  meta: {
    title: 'ZeppBridge · Vom Handgelenk auf deinen Rechner, vom Rechner zur KI',
    description: 'ZeppBridge holt deine Amazfit- und Zepp-Daten aus der Zepp-Cloud auf deinen eigenen Rechner und gibt sie dir als eine Datei für deine KI mit. Kostenlos und quelloffen.',
    ogTitle: 'ZeppBridge · Vom Handgelenk auf den Schreibtisch. Vom Schreibtisch zur KI.',
    ogDescription: 'Herzfrequenz, Schlaf und Training lokal synchronisieren, ansehen und mit einem Klick an die KI deiner Wahl übergeben.',
  },
  copy: {
    nav: {
      home: 'ZeppBridge Startseite',
      site: 'Website-Navigation',
      demo: 'Demo',
      ai: 'An die KI',
      privacy: 'Datenschutz',
      download: 'Download',
      github: 'GitHub',
      language: 'Sprache',
      toDark: 'Zum dunklen Design',
      toLight: 'Zum hellen Design',
    },
    downloads: {
      windows: { label: 'Für Windows laden', hint: 'x64-Installer', msi: 'MSI für verwaltete Installationen' },
      macos: { label: 'Für macOS laden', hint: 'Apple Silicon' },
      linux: {
        label: 'Linux',
        previewBadge: 'Experimentell',
        note: 'deb, rpm, AppImage und Flatpak baut die CI, aber Anmeldung und Schlüsselbund hat noch niemand auf einem echten Linux-Desktop komplett getestet. Probleme? Mach ein Issue auf.',
      },
      status: {
        loading: 'Neuestes Installationspaket wird gesucht',
        ready: 'Klick lädt direkt herunter',
        fallback: 'Öffnet GitHub Releases, dort wählst du das Paket',
      },
    },
    sample: 'Beispiel',
    hero: {
      eyebrow: 'Kostenlos · Open Source · Deine Daten bleiben auf deinem Rechner',
      titleLead: 'Was deine Uhr aufzeichnet,',
      titleAccent: 'liegt auf deinem Rechner.',
      lead: 'ZeppBridge holt Herzfrequenz, Schlaf und Training, die deine Amazfit aufgezeichnet hat, aus der Zepp-Cloud auf deinen eigenen Rechner und legt sie als Archiv ab, das du lesen und mitnehmen kannst. Hast du eine Frage an die KI, wählst du einen Zeitraum und gibst eine einzige Datei weiter.',
      github: 'Quellcode auf GitHub ansehen',
      meta: 'Kostenlos · Windows 10 / 11 · macOS (Apple Silicon) · Linux experimentell',
      devices: 'Diese Amazfit-Geräte kennt es schon',
      stage: {
        hint: 'Klick drauf und probier es aus',
        note: 'Rechts siehst du das echte ZeppBridge, mit Beispieldaten.',
        loading: 'App wird geöffnet…',
        exit: 'Demo verlassen',
        unavailable: 'Dieser Browser kann die Demo nicht öffnen. Lade die App herunter, dann siehst du es selbst.',
      },
      starNudge: {
        title: 'Dein Download läuft',
        copy: 'Hilft dir ZeppBridge? Ein Stern auf GitHub hilft anderen Amazfit-Nutzern, es zu finden.',
        action: 'Stern vergeben',
        dismiss: 'Später',
      },
    },
    beats: [
      {
        kicker: '01 · Synchronisieren',
        title: 'Hol auf deinen Rechner, was dein Handgelenk aufzeichnet',
        body: 'Melde dich mit deinem eigenen Zepp-Konto an, und Herzfrequenz, Schlaf und Training landen Tag für Tag in einer Datenbank auf diesem Gerät. Lesbar, mitnehmbar und auch ohne Netz da.',
      },
      {
        kicker: '02 · Ehrlich',
        title: 'Nicht gemessen heißt nicht gemessen',
        body: 'Sieh dir das Diagramm rechts an: Gestern Nachmittag ist eine Lücke, weil die Uhr nicht am Arm war. ZeppBridge füllt keine 0 ein und zeichnet keine erfundene Linie. Fehlende Tage erscheinen als graue Striche um jeden Datenblock.',
      },
      {
        kicker: '03 · An die KI',
        title: 'Eine Frage an die KI? Wähl zuerst aus, was sie sehen darf',
        body: 'Was im Kreis liegt, wird weitergegeben, was draußen liegt, nicht. Die kleinen Striche um jeden Knoten zeigen, an welchen Tagen Daten da sind. Drück auf den Senden-Knopf, dann liegt die gepackte .md-Datei bereit und du ziehst sie in den Chat.',
      },
      {
        kicker: '04 · Plan',
        title: 'Ein Trainingsplan der KI, der erst nach deiner Prüfung auf die Uhr geht',
        body: 'Füge die Antwort der KI komplett wieder ein: Du siehst Tag für Tag, was sich ändert, und den Herzfrequenzbereich jedes Schritts als Diagramm. Schreibweisen, die noch nicht auf deiner Uhr geprüft sind, werden markiert. Erst nach deiner Bestätigung geht es an Zepp, und du kannst es jederzeit zurücknehmen.',
      },
      {
        kicker: '05 · Deine Entscheidung',
        title: 'Die Schalter, die du brauchst, sind da. Mehr nicht.',
        body: 'Die Einstellungen sind ein Stapel Karten: Öffne eine und zieh ihre Kopfzeile zur Seite, dann blätterst du zur nächsten. Wie lange Daten bleiben, wie oft synchronisiert wird und ob die lokale Schnittstelle an ist, bestimmst du.',
      },
    ],
    flap: {
      tiles: [
        { value: '1.096', label: 'Nächte Schlaf' },
        { value: '742', label: 'Trainings mit Strecke' },
        { value: '1,5M', label: 'Minuten Herzfrequenz' },
        { value: '9,8M', label: 'Schritte' },
      ],
    },
    handoff: {
      chat: 'KI-Chat',
      you: 'Du',
      file: 'ZeppBridge letzte 14 Tage.md',
      prompt: 'Habe ich diese Woche schlechter geschlafen als letzte? Woran könnte es liegen?',
      answer: 'Etwas schlechter: im Schnitt 38 Minuten weniger, vor allem Tiefschlaf. Dienstag und Donnerstag hattest du abends Training, und in diesen Nächten kam dein Puls langsamer herunter. Probier eine Woche lang, am Nachmittag zu trainieren.',
      note: 'Keine eingebaute KI und kein zusätzliches Konto. Was rausgeht, wie viel und wann, passiert erst, wenn du klickst.',
      close: 'Schließen',
    },
    privacy: {
      heading: 'Deine Gesundheitsdaten gibt es an zwei Orten',
      lead: 'In der Zepp-Cloud und auf deinem Rechner. Einen dritten gibt es nicht.',
      nodes: { watch: 'Uhr', cloud: 'Zepp-Cloud', computer: 'Dein Rechner', server: 'ZeppBridge-Server', none: 'gibt es nicht' },
      points: [
        {
          title: 'Token im Systemtresor',
          copy: 'In der Windows-Anmeldeinformationsverwaltung oder im macOS-Schlüsselbund, nie im Datenordner.',
        },
        {
          title: 'Keine Telemetrie',
          copy: 'Kein Nutzungstracking, keine Gesundheitsdaten werden gesammelt.',
        },
        {
          title: 'Klare Herkunft',
          copy: 'Jeder Eintrag weiß, ob er aus der offiziellen Autorisierung oder den erweiterten Daten stammt.',
        },
      ],
    },
    connect: {
      heading: 'Drei Wege zum Verbinden. Nimm den bequemsten.',
      lead: 'Starte mit der offiziellen Autorisierung. Nimm die erweiterten Daten dazu, wenn du mehr Metriken willst.',
      recommended: 'Empfohlen',
      paths: [
        {
          title: 'Offizielle Zepp-Autorisierung',
          copy: 'Melde dich in deinem gewohnten Browser bei Zepp an und stimm zu.',
          detail: 'Google-, Xiaomi- und Apple-Konten funktionieren. Schlaf, Herzfrequenz, Schritte, Trainings, PAI und Gewicht werden synchronisiert.',
        },
        {
          title: 'Erweiterte Daten',
          copy: 'Ergänzt HRV, Blutsauerstoff, Stress und Bereitschaft, die die offizielle API nicht bietet.',
          detail: 'Anmeldung mit E-Mail oder Telefonnummer. Der Token liegt nur in deinem Systemtresor.',
        },
        {
          title: 'Manuelle Eingabe',
          copy: 'Der Rückfall, wenn beides andere nicht geht.',
          detail: 'Du fügst selbst einen Token ein. Gedacht für Leute, die die API kennen.',
        },
      ],
      note: 'Was synchronisiert wird, hängt davon ab, was dein Konto in der Zepp-Cloud hat. Welche Metriken du siehst, hängt von deinem Gerät und deiner Verbindungsart ab.',
    },
    final: {
      heading: 'Installier es und sieh, woran sich deine Uhr erinnert',
      lead: 'Kostenlos, Open Source, ohne Registrierung.',
      facts: {
        channel: 'Stabiler Kanal, Installer von GitHub Releases',
        systems: 'Windows 10 / 11 (x64) und macOS (Apple Silicon). Linux ist experimentell.',
        ai: 'Kein zusätzliches Konto nötig. Für KI-Fragen nimmst du die, die du schon hast.',
        windows: 'Windows: Der Installer ist noch nicht signiert. Siehst du "Unbekannter Herausgeber", wähl "Weitere Informationen" und dann "Trotzdem ausführen".',
        macos: 'macOS: ein unsignierter Build, der erste Start wird blockiert. Wie du ihn erlaubst, steht im GitHub-Readme.',
      },
    },
    footer: {
      tagline: 'Eine lokale Brücke für Amazfit- und Zepp-Daten.',
      disclaimer: 'ZeppBridge ist ein unabhängiges Open-Source-Projekt und nicht mit Zepp Health oder Amazfit verbunden.',
      source: 'Quellcode',
    },
  },
};

export default pack;
