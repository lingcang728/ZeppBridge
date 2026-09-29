import type { LandingPack } from '../../composables/useLandingLocale';

const pack: LandingPack = {
  meta: {
    title: 'ZeppBridge · Die lokale Datenbrücke',
    description: 'ZeppBridge ist ein lokales, offenes Werkzeug, das deine Amazfit- und Zepp-Daten synchronisiert und visualisiert. Läuft auf deinem eigenen Windows-PC, Mac oder Linux-Rechner.',
    ogTitle: 'ZeppBridge · Deine Zepp-Daten, zurück in deiner Hand',
    ogDescription: 'Amazfit-Daten auf deinem Windows-, macOS- oder Linux-Rechner verbinden, ordnen und visualisieren; Herkunft bleibt sichtbar, die Übergabe an die KI erfolgt nur, wenn du willst.',
  },
  copy: {
    nav: { home: 'ZeppBridge Startseite', site: 'Website-Navigation', connect: 'Verbinden', motion: 'Oberfläche', handoff: 'An die KI', privacy: 'Datenschutz', star: 'GitHub', language: 'Sprache' },
    downloads: {
      windows: { label: 'Für Windows herunterladen', hint: 'x64-Installer', msi: 'Größere Rollouts: MSI herunterladen' },
      macos: { label: 'Für macOS herunterladen', hint: 'Apple Silicon' },
      linux: { label: 'Linux', previewBadge: 'Experimentell', note: 'deb, rpm, AppImage und Flatpak kommen aus der CI, aber Anmeldung und Schlüsselbund hat noch niemand auf einem echten Linux-Desktop getestet. Problem? Issue öffnen.' },
      status: { loading: 'Neuesten Installer wird gesucht', ready: 'Klicken lädt direkt herunter', fallback: 'Kein Direktlink, öffnet das GitHub-Release' },
    },
    hero: {
      headlineLead: 'Deine Zepp-Daten,',
      headlineAccent: 'zurück in deiner Hand.',
      lead: 'Synchronisiere, durchsuche und ordne deine Amazfit-Daten auf deinem Rechner. Für die KI ein Klick.',
      github: 'Auf GitHub ansehen',
      starNudge: { title: 'Download gestartet', copy: 'Hilft dir ZeppBridge? Ein GitHub-Stern hilft anderen Amazfit-Nutzern, es zu finden.', action: 'Stern geben', dismiss: 'Jetzt nicht' },
    },
    demo: {
      label: 'Interaktive Demo der ZeppBridge-Übersicht',
      sample: 'Beispieldaten',
      hint: 'Karte anklicken',
      back: 'Zurück',
      greeting: 'Übersicht',
      heart: { title: 'Aktuelle Herzfrequenz', unit: 'bpm', detail: 'Minütlich, den ganzen Tag. Minuten ohne Uhr bleiben leer, nie mit Nullen gefüllt.' },
      steps: { title: 'Schritte heute', unit: 'Schritte', detail: 'Stündliche Schritte aus der offiziellen Zepp-Autorisierung, nur mit deiner eigenen Historie verglichen.' },
      sleep: { title: 'Letzte Nacht', hours: 'Std.', minutes: 'Min.', detail: 'Tief-, Leichtschlaf, REM und Wachphasen geordnet; offiziell gemessenes REM hat Vorrang.' },
    },
    devicesLabel: 'Unterstützte Amazfit-Geräte',
    connect: {
      heading: 'Drei Wege hinein. Nimm den bequemsten.',
      lead: 'Starte mit der offiziellen Autorisierung und ergänze erweiterte Daten für mehr Metriken. Klappt beides nicht, gibt es die manuelle Eingabe.',
      recommended: 'Empfohlen',
      paths: [
        { icon: 'verified', title: 'Offizielle Zepp-Autorisierung', copy: 'Im gewohnten Browser bei Zepp anmelden und zustimmen.', detail: 'Google-, Xiaomi- und Apple-Konten funktionieren. Schlaf, Herzfrequenz, Schritte, Trainings, PAI und Gewicht werden synchronisiert.' },
        { icon: 'zepp-cloud', title: 'Erweiterte Daten', copy: 'Ergänzt HRV, Blutsauerstoff, Stress und Bereitschaft, die die offizielle API nicht liefert.', detail: 'Anmeldung per E-Mail oder Telefon. Das Token liegt nur im System-Anmeldespeicher.' },
        { icon: 'manual-entry', title: 'Manuelle Eingabe', copy: 'Die Notlösung, wenn die anderen beiden nicht gehen.', detail: 'Token selbst einfügen. Für Leute, die die API kennen.' },
      ],
    },
    deck: {
      heading: 'Einstellungen als Kartenstapel, nicht als Formularwand',
      lead: 'Fährst du mit der Maus darüber, fächern sie sich auf. Ein Klick zieht eine heraus.',
      hint: 'Darüberfahren zum Auffächern, klicken zum Herausziehen',
      close: 'Zurücklegen',
      cards: [
        { icon: 'profile', title: 'Konto und Geräte', copy: 'Offizielle Autorisierung und erweiterte Daten haben je eine eigene Zeile, so ist immer klar, welches Konto verbunden ist.' },
        { icon: 'auto-sync', title: 'Synchronisierung und Updates', copy: 'Synchronisiert beim Start und danach still im gewählten Abstand.' },
        { icon: 'database', title: 'Archiv und Speicher', copy: 'Du bestimmst, wie lange Daten bleiben. Snapshots lassen sich jederzeit zurückspielen.' },
        { icon: 'structured-data', title: 'Datenzustand', copy: 'Ob jeder Datenstrom abgerufen, gelesen und geschrieben wurde, getrennt sichtbar.' },
        { icon: 'secure', title: 'Datenschutz und Sicherheit', copy: 'Die lokale Nur-Lese-API ist standardmäßig aus und bindet nur an 127.0.0.1.' },
      ],
    },
    handoff: {
      heading: 'Zieh zur KI, wonach du fragen willst',
      lead: 'Zieh eine Metrik, und ihre Nachbarn weichen aus. In der Mitte loslassen, und sie landet im Paket für die KI.',
      hint: 'Einen Knoten in die Mitte ziehen',
      center: 'An die KI',
      nodes: ['Herzfrequenz', 'Schlaf', 'HRV', 'Schritte', 'Trainingsbelastung', 'PAI', 'Gewicht', 'Stress'],
      picked: '{n} ausgewählt',
      reset: 'Zurücksetzen',
    },
    privacy: {
      heading: 'Deine Daten bleiben auf deinem Rechner',
      lead: 'ZeppBridge hat keinen eigenen Server, der deine Gesundheitsdaten speichert.',
      points: [
        { icon: 'secure', title: 'Token im Anmeldespeicher', copy: 'Standardmäßig in der Windows-Anmeldeinformationsverwaltung oder im macOS-Schlüsselbund, nicht im Datenordner.' },
        { icon: 'private', title: 'Keine Telemetrie', copy: 'Keine Nutzungsberichte, keine Erfassung von Gesundheitsdaten.' },
        { icon: 'database', title: 'Klare Herkunft', copy: 'Jeder Eintrag weiß, ob er aus der offiziellen Autorisierung oder aus den erweiterten Daten stammt.' },
        { icon: 'ai-ready', title: 'Du bestimmst, was die KI sieht', copy: 'Was, wie viel und wann: alles entscheidest du.' },
      ],
    },
    footer: {
      heading: 'Kostenlos, Open Source, sofort einsatzbereit',
      tagline: 'Eine Local-First-Brücke für Amazfit- und Zepp-Daten.',
      disclaimer: 'ZeppBridge ist ein unabhängiges Open-Source-Projekt ohne Verbindung zu Zepp Health oder Amazfit.',
      download: 'Herunterladen',
    },
  },
};

export default pack;
