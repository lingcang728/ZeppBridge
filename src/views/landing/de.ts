import type { LandingPack } from '../../composables/useLandingLocale';

const pack: LandingPack = {
  meta: {
    title: 'ZeppBridge · Deine Zepp-Daten auf deinem Rechner',
    description: 'ZeppBridge ist eine lokale Open-Source-Brücke für Amazfit- und Zepp-Daten. Läuft auf deinem eigenen Windows, Mac oder Linux.',
    ogTitle: 'ZeppBridge · Deine Zepp-Daten, zurück in deiner Hand',
    ogDescription: 'Synchronisiere, durchsuche und ordne deine Amazfit-Daten auf deinem eigenen Rechner. Mit einem Klick an eine KI übergeben.',
  },
  copy: {
    nav: { home: 'ZeppBridge Startseite', site: 'Seitennavigation', connect: 'Verbinden', motion: 'Oberfläche', handoff: 'An die KI', privacy: 'Datenschutz', star: 'GitHub', language: 'Sprache' },
    downloads: {
      windows: { label: 'Für Windows laden', hint: 'x64-Installer', msi: 'Für die Verteilung: MSI laden' },
      macos: { label: 'Für macOS laden', hint: 'Apple Silicon' },
      linux: { label: 'Linux', previewBadge: 'Experimentell', note: 'deb, rpm, AppImage und Flatpak entstehen in der CI, aber Anmeldung und Schlüsselbund hat noch niemand auf einem echten Linux-Desktop vollständig durchgespielt. Wenn etwas nicht klappt, eröffne bitte ein Issue.' },
      status: { loading: 'Neuester Installer wird gesucht', ready: 'Zum direkten Download klicken', fallback: 'Gerade kein Direktlink, es öffnet sich das Release auf GitHub' },
    },
    hero: {
      headlineLead: 'Deine Zepp-Daten,',
      headlineAccent: 'zurück in deiner Hand.',
      lead: 'Synchronisiere, durchsuche und ordne deine Amazfit-Daten auf deinem Rechner. Mit einem Klick an eine KI übergeben.',
      github: 'Auf GitHub ansehen',
      starNudge: { title: 'Der Download läuft', copy: 'Wenn dir ZeppBridge hilft, hilft ein Stern auf GitHub anderen Amazfit-Nutzern, es zu finden.', action: 'Stern vergeben', dismiss: 'Später' },
    },
    demo: {
      label: 'Interaktive Demo der ZeppBridge-Übersicht',
      sample: 'Beispieldaten',
      hint: 'Tippe auf eine Karte',
      back: 'Zurück',
      greeting: 'Übersicht',
      heart: { title: 'Herzfrequenz', unit: 'S/min', detail: 'Minütlich, den ganzen Tag. Minuten ohne Uhr bleiben leer und werden nicht zu Nullen.' },
      steps: { title: 'Schritte heute', unit: 'Schritte', detail: 'Die Schritte pro Stunde kommen aus der offiziellen Zepp-Autorisierung und werden nur mit deiner eigenen Historie verglichen.' },
      sleep: { title: 'Letzte Nacht', hours: 'Std', minutes: 'Min', detail: 'Tief, leicht, REM und wach der Reihe nach. Das von Zepp gemessene REM hat Vorrang.' },
    },
    devicesLabel: 'Unterstützte Amazfit-Geräte',
    connect: {
      heading: 'Drei Wege hinein. Nimm den einfachen.',
      lead: 'Starte mit der offiziellen Autorisierung und ergänze erweiterte Daten für mehr Werte. Klappt beides nicht, gibt es die manuelle Eingabe.',
      recommended: 'Empfohlen',
      paths: [
        { icon: 'verified', title: 'Offizielle Zepp-Autorisierung', copy: 'Im gewohnten Browser bei Zepp anmelden und zustimmen.', detail: 'Google-, Xiaomi- und Apple-Konten funktionieren. Schlaf, Herzfrequenz, Schritte, Trainings, PAI und Gewicht werden synchronisiert.' },
        { icon: 'zepp-cloud', title: 'Erweiterte Daten', copy: 'Ergänzt HRV, Blutsauerstoff, Stress und Bereitschaft, die die offizielle API nicht liefert.', detail: 'Anmeldung per E-Mail oder Telefon. Das Token liegt nur im Anmeldespeicher des Systems.' },
        { icon: 'manual-entry', title: 'Manuelle Eingabe', copy: 'Die Rückfalloption, wenn die anderen beiden nicht gehen.', detail: 'Token selbst einfügen. Für Leute, die die API kennen.' },
      ],
    },
    deck: {
      heading: 'Einstellungen als Kartenstapel statt Formularwand',
      lead: 'Mit der Maus darüber fächern sie sich auf. Ein Klick zieht eine heraus.',
      hint: 'Darüberfahren zum Auffächern, klicken zum Herausziehen',
      close: 'Zurücklegen',
      cards: [
        { icon: 'profile', title: 'Konto und Geräte', copy: 'Offizielle Autorisierung und erweiterte Daten haben je eine eigene Zeile, so ist immer klar, welches Konto verbunden ist.' },
        { icon: 'auto-sync', title: 'Synchronisierung und Updates', copy: 'Synchronisiert beim Start und danach still im gewählten Abstand.' },
        { icon: 'database', title: 'Archiv und Speicher', copy: 'Du bestimmst, wie lange Daten bleiben. Snapshots lassen sich jederzeit zurückspielen.' },
        { icon: 'structured-data', title: 'Datenzustand', copy: 'Ob jeder Datenstrom geladen, verstanden und geschrieben wurde, getrennt angezeigt.' },
        { icon: 'secure', title: 'Datenschutz und Sicherheit', copy: 'Die lokale Nur-Lese-API ist standardmäßig aus und bindet nur an 127.0.0.1.' },
      ],
    },
    handoff: {
      heading: 'Zieh zur KI, wonach du fragen willst',
      lead: 'Zieh einen Wert und seine Nachbarn weichen aus. In der Mitte loslassen, und er landet im Paket für die KI.',
      hint: 'Einen Knoten in die Mitte ziehen',
      center: 'An die KI',
      nodes: ['Puls', 'Schlaf', 'HRV', 'Schritte', 'Belastung', 'PAI', 'Gewicht', 'Stress'],
      picked: '{n} gewählt',
      reset: 'Zurücksetzen',
    },
    privacy: {
      heading: 'Deine Daten bleiben auf deinem Rechner',
      lead: 'ZeppBridge hat keinen eigenen Server, der deine Gesundheitsdaten speichert.',
      points: [
        { icon: 'secure', title: 'Tokens im Systemschlüsselbund', copy: 'Standardmäßig in der Windows-Anmeldeinformationsverwaltung oder im macOS-Schlüsselbund, nicht im Datenordner.' },
        { icon: 'private', title: 'Keine Telemetrie', copy: 'Keine Nutzungsberichte. Es werden keine Gesundheitsdaten gesammelt.' },
        { icon: 'database', title: 'Klare Herkunft', copy: 'Jeder Eintrag weiß, ob er aus der offiziellen Autorisierung oder aus den erweiterten Daten stammt.' },
        { icon: 'ai-ready', title: 'Du bestimmst, was die KI sieht', copy: 'Was, wie viel und wann. Alles liegt bei dir.' },
      ],
    },
    footer: {
      heading: 'Kostenlos, Open Source, sofort installierbar',
      tagline: 'Eine lokale Brücke für Amazfit- und Zepp-Daten.',
      disclaimer: 'ZeppBridge ist ein unabhängiges Open-Source-Projekt ohne Verbindung zu Zepp Health oder Amazfit.',
      download: 'Laden',
    },
  },
};

export default pack;
