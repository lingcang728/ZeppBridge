import type { LandingPack } from '../../composables/useLandingLocale';

/**
 * Deutsch (de) landing pack.
 *
 * Informal du throughout, Swiss orthography (ss, never ß) — matching the app's
 * German pack. Product terms (ZeppBridge, HAR, appToken, MCP, SQLite, EXE/MSI,
 * Apple Silicon, AI-ready) stay untranslated. Decorative overlines stay in
 * English, matching zh/en.
 */
const pack: LandingPack = {
  copy: {
    nav: {
      home: 'ZeppBridge-Startseite',
      site: 'Seitennavigation',
      features: 'Was es ausliest',
      local: 'Lokale Ausgänge',
      connect: 'Verbinden',
      privacy: 'Datenschutz',
      star: 'Star auf GitHub',
      language: 'Sprache',
    },
    downloads: {
      windows: { label: 'Für Windows herunterladen', hint: 'Empfohlen · x64-EXE-Installer', msi: 'Verwaltete Bereitstellung: MSI herunterladen' },
      macos: { label: 'Für macOS herunterladen', hint: 'Apple Silicon · DMG-Installer' },
      linux: {
        label: 'Linux',
        previewBadge: 'Vorschau',
        note: 'deb / rpm / AppImage / Flatpak bauen alle in CI, aber noch hat niemand die Anmeldung plus Schlüsselbund (Secret Service / KWallet) auf einem echten Linux-Desktop komplett durchgespielt. Probier es gern aus — und öffne ein Issue, wenn etwas bricht. Genau das braucht es gerade.',
      },
      status: {
        loading: 'Das neueste GitHub-Release wird abgerufen…',
        ready: 'Lädt direkt herunter — keine GitHub-Seite dazwischen',
        fallback: 'Direkte Links sind vorübergehend nicht verfügbar; stattdessen öffnet sich die Release-Seite',
      },
    },
    hero: {
      headlineLead: 'Deine Zepp-Daten,',
      headlineAccent: 'vollständig zurück an dich.',
      lead: 'ZeppBridge verbindet, ordnet und visualisiert deine Amazfit-Wearable-Daten auf deinem eigenen Windows-, Mac- oder Linux-Rechner. Jedes Feld behält seine Quelle — lies es selbst oder gib es an eine KI weiter, zu deinen Bedingungen.',
      starNudge: {
        title: 'Dein Download hat begonnen',
        copy: 'Wenn ZeppBridge sich einen Platz auf deinem Rechner verdient, hilft ein GitHub-Star, dass mehr Amazfit-Nutzer es finden.',
        action: 'ZeppBridge auf GitHub einen Star geben',
        dismiss: 'Vielleicht später',
      },
      trust: [
        { icon: 'secure', label: 'Local-first' },
        { icon: 'private', label: 'Standardmässig privat' },
        { icon: 'structured-data', label: 'Strukturierte Daten' },
      ],
      stageLabel: 'Aktuelle Amazfit-Geräte speisen ZeppBridge und kommen als strukturierte Daten heraus',
      coreCaption: 'Decodieren · Ordnen · Visualisieren',
      outputs: [
        { title: 'Strukturierte Datensätze', copy: 'Quelle und Zeitstempel bleiben erhalten' },
        { title: 'AI-ready', copy: 'Es geht raus, wenn du es sagst' },
      ],
      status: { title: 'Lokale Pipeline bereit', copy: 'Nichts läuft über einen ZeppBridge-Server' },
    },
    principlesLabel: 'Produktprinzipien',
    principles: [
      { icon: 'secure', title: 'Sicher', copy: 'Bleibt auf deinem Rechner' },
      { icon: 'private', title: 'Privat', copy: 'Nichts hochgeladen, nichts durchgesickert' },
      { icon: 'database', title: 'Herkunft', copy: 'Quellen vermischen sich nie' },
      { icon: 'ai-ready', title: 'AI-ready', copy: 'Klare Struktur, auf Anfrage genutzt' },
    ],
    features: {
      overline: 'WHAT YOU CAN READ',
      heading: 'Von den heutigen Zahlen zu jeder einzelnen Einheit.',
      lead: 'Die Oberfläche zeigt nur Felder, die wirklich angekommen sind. Was fehlt, wird als fehlend markiert — keine erfundenen Zahlen, um ein Dashboard vollzumachen.',
      items: [
        { icon: 'heart-rate', title: 'Kontinuierliche Herzfrequenz', copy: 'Zeitstempel und Quelle bleiben erhalten, du siehst die echte Kurve.', tone: 'red' },
        { icon: 'sleep-waves', title: 'Schlafstruktur', copy: 'Tief-, Leicht-, REM- und Wachphasen, lokal ausgewertet.', tone: 'purple' },
        { icon: 'outdoor-run', title: 'Trainingsdetails', copy: 'Strecke, Pace, Kadenz, Höhe und Trainingslast.', tone: 'green' },
        { icon: 'vo2-max', title: 'Erholungsmetriken', copy: 'VO₂ Max, HRV und Erholungswerte, je Quelle gezeigt.', tone: 'blue' },
      ],
    },
    local: {
      overline: 'NOT ONLY A WINDOW',
      heading: 'Du musst es nicht einmal öffnen.',
      lead: 'Desktop-App, Kommandozeile, MCP und die lokale Read-only-API teilen sich einen Kern — Einheiten, Zeitzonen, Quellen und fehlende Werte erzählen nur eine Geschichte. Fehlend ist fehlend: Kein Ausgang füllt die Lücke mit einer Null.',
      items: [
        {
          icon: 'structured-data',
          title: 'Kompletter Verlauf & Snapshots',
          copy: 'Hol die Cloud-Historie Monat für Monat zurück, mit einem Kassenbuch pro Chunk. Snapshots der ganzen Datenbank sind mit Prüfsumme versehen, und vor dem Wiederherstellen siehst du die Differenz der Zeilenzahl.',
          tag: 'Lokal',
        },
        {
          icon: 'document',
          title: 'Kommandozeile',
          copy: 'status / sync / export. Keine Rückfragen, stabile Exit-Codes — sicher an den Aufgabenplaner oder cron zu hängen.',
          tag: 'CLI',
        },
        {
          icon: 'ai-ready',
          title: 'Read-only-MCP',
          copy: 'Lass eine KI deine lokalen Daten selbst abfragen. stdio-Transport: kein Port, der lauscht, kein Netzwerkzugriff.',
          tag: 'MCP',
        },
      ],
    },
    connect: {
      overline: 'THREE PATHS, ONE LOCAL VAULT',
      heading: 'Wähle den Weg, der zu dir passt.',
      lead: 'Vom schlichten offiziellen Web-Login bis zur vollständig prüfbaren manuellen Übergabe. Verbindungsstatus und Fehlerursachen werden immer ausgeschrieben.',
      items: [
        { icon: 'browser-login', title: 'Offizieller Web-Login', copy: 'Autorisiere dich im offiziellen Ablauf. Zugangsdaten bleiben auf deinem Rechner.', tag: 'Empfohlen' },
        { icon: 'document', title: 'HAR-Import', copy: 'Für Debugging und Fortgeschrittene: Nutze eine autorisierte Anfrage wieder, die du bereits aufgezeichnet hast.', tag: 'Fortgeschritten' },
        { icon: 'manual-entry', title: 'Manuelle Eingabe', copy: 'Gib appToken und User-ID selbst ein, in voller Sicht.', tag: 'Hands-on' },
      ],
    },
    privacy: {
      overline: 'PRIVACY BY ARCHITECTURE',
      heading: 'Deine Wearable-Daten sollten nicht zum Cloud-Vermögen von jemand anderem werden.',
      lead: 'Lokale Datenbank, maskierte Kennungen und isolierte Quellen sind der Standard. Willst du eine KI einbinden, wählst du, was rausgeht und wo es landet.',
      points: [
        { icon: 'database', label: 'Lokale SQLite-Speicherung' },
        { icon: 'profile', label: 'Konto-IDs standardmässig maskiert' },
        { icon: 'cloud-output', label: 'Export nur, wenn du ihn auslöst' },
      ],
      vault: 'Es gibt kein ZeppBridge-Backend, das deine Gesundheitsdaten weiterreicht.',
    },
    footer: {
      tagline: 'Open-Source-Amazfit-Datenbrücke · Windows und Mac (Apple Silicon)',
      disclaimer: 'Ein unabhängiges, inoffizielles Open-Source-Projekt, nicht verbunden mit oder unterstützt von Zepp Health, Huami oder Amazfit. Nur für Konten und Daten, auf die du Zugriff hast.',
      download: 'Herunterladen',
    },
  },
  meta: {
    title: 'ZeppBridge · Lokale Datenbrücke',
    description:
      'ZeppBridge ist eine local-first, quelloffene Brücke und Ansicht für Amazfit-/Zepp-Wearable-Daten. Läuft auf deinem eigenen Windows-, Mac- oder Linux-Rechner.',
    ogTitle: 'ZeppBridge · Deine Zepp-Daten, vollständig zurückgegeben',
    ogDescription:
      'Verbinde, ordne und visualisiere Amazfit-Wearable-Daten auf deinem eigenen Rechner. Quellen bleiben intakt, und nichts geht raus, bevor du es sendest.',
  },
};

export default pack;
