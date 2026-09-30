import type { LandingPack } from '../../composables/useLandingLocale';

const pack: LandingPack = {
  meta: {
    title: 'ZeppBridge · Die lokale Datenbrücke',
    description: 'ZeppBridge ist ein lokales, quelloffenes Werkzeug, das deine Amazfit- und Zepp-Daten synchronisiert und visualisiert. Läuft auf deinem eigenen Windows-PC, Mac oder Linux-Rechner.',
    ogTitle: 'ZeppBridge · Deine Zepp-Daten, vollständig zurück bei dir',
    ogDescription: 'Amazfit-Daten auf deinem Windows-, macOS- oder Linux-Rechner verbinden, ordnen und visualisieren; die Herkunft bleibt sichtbar, an die KI geht nur, was du selbst übergibst.',
  },
  copy: {
    nav: { home: 'ZeppBridge Startseite', site: 'Website-Navigation', connect: 'Verbinden', motion: 'Interface', handoff: 'An die KI', privacy: 'Datenschutz', star: 'GitHub', language: 'Sprache' },
    downloads: {
      windows: { label: 'Für Windows herunterladen', hint: 'x64-Installer', msi: 'Rollout im größeren Stil: MSI herunterladen' },
      macos: { label: 'Für macOS herunterladen', hint: 'Apple Silicon' },
      linux: { label: 'Linux', previewBadge: 'Experimentell', note: 'deb, rpm, AppImage und Flatpak kommen aus der CI, aber Anmeldung und Schlüsselbund hat noch niemand auf einem echten Linux-Desktop komplett durchgespielt. Problem? Issue aufmachen.' },
      status: { loading: 'Das neueste Installationspaket wird gesucht', ready: 'Klicken lädt direkt herunter', fallback: 'Kein Direktlink, öffnet das GitHub-Release' },
    },
    hero: {
      headlineLead: 'Deine Zepp-Daten,',
      headlineAccent: 'zurück in deiner Hand.',
      lead: 'Synchronisiere, durchsuche und ordne deine Amazfit-Daten auf deinem Rechner. Für die KI per Klick gepackt.',
      github: 'Auf GitHub ansehen',
      starNudge: { title: 'Download gestartet', copy: 'Hilft dir ZeppBridge? Ein GitHub-Stern hilft anderen Amazfit-Nutzern, es zu finden.', action: 'Stern geben', dismiss: 'Jetzt nicht' },
    },
    demo: {
      label: 'Interaktive Demo der ZeppBridge-Übersicht',
      sample: 'Beispieldaten',
      hint: 'Eine Karte anklicken',
      back: 'Zurück',
      greeting: 'Übersicht',
      heart: { title: 'Aktuelle Herzfrequenz', unit: 'bpm', detail: 'Minütlich, den ganzen Tag. Minuten ohne Uhr bleiben leer, nie mit 0 gefüllt.' },
      steps: { title: 'Schritte heute', unit: 'Schritte', detail: 'Stündliche Schritte aus der offiziellen Zepp-Autorisierung, nur mit deiner eigenen Historie verglichen.' },
      sleep: { title: 'Letzte Nacht', hours: 'Std.', minutes: 'Min.', detail: 'Tiefschlaf, Leichtschlaf, REM und Wachphasen der Reihe nach; offiziell gemessenes REM hat Vorrang.' },
    },
    devicesLabel: 'Unterstützte Amazfit-Geräte',
    connect: {
      heading: 'Drei Wege hinein. Nimm den bequemsten.',
      lead: 'Starte mit der offiziellen Autorisierung und ergänze erweiterte Daten für mehr Metriken. Geht beides nicht, gibt es die manuelle Eingabe.',
      recommended: 'Empfohlen',
      paths: [
        { icon: 'verified', title: 'Offizielle Zepp-Autorisierung', copy: 'Im gewohnten Browser bei Zepp anmelden und zustimmen.', detail: 'Google-, Xiaomi- und Apple-Konten funktionieren. Schlaf, Herzfrequenz, Schritte, Trainings, PAI und Gewicht werden synchronisiert.' },
        { icon: 'zepp-cloud', title: 'Erweiterte Daten', copy: 'Ergänzt HRV, Blutsauerstoff, Stress und Bereitschaft, die die offizielle API nicht anbietet.', detail: 'Anmeldung per E-Mail oder Telefon. Das Token liegt nur im System-Anmeldespeicher.' },
        { icon: 'manual-entry', title: 'Manuelle Eingabe', copy: 'Der Plan B, wenn die beiden anderen nicht gehen.', detail: 'Token selbst einfügen. Für Leute, die die API kennen.' },
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
        { icon: 'structured-data', title: 'Datenzustand', copy: 'Ob jeder Datenstrom abgerufen, verstanden und geschrieben wurde, einzeln sichtbar.' },
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
      lead: 'ZeppBridge hat keinen Server, der deine Gesundheitsdaten speichert.',
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
