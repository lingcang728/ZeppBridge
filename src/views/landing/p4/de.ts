/** Deutsche P4-Landingpage-Texte. Identische Struktur wie zh / en in p4Copy.ts. */
import type { P4Copy } from '../p4Copy';

const pack: P4Copy = {
  chapters: [
    { id: 'motion', name: 'Design', title: 'Liebe auf den ersten Blick.', lead: 'Navigation aus Glas, Karten, die zu Seiten werden, und Tage, die du wie Spielkarten auffächerst.', points: [
      { id: 'glass', title: 'Glas', text: 'Gedrückt halten, langsam über die Navigation ziehen und loslassen. Lichtbrechungen folgen deinem Finger.', scene: 'glass' },
      { id: 'morph', title: 'Verwandlung', text: 'Eine Karte öffnet sich zur ganzen Seite und kehrt beim Zurückgehen an ihren Platz zurück.', scene: 'morph' },
      { id: 'poker', title: 'Kartentisch', text: 'Blättere durch Tageskarten, breite ganze Wochen und Monate aus. Die besten kommen in die Sammlung.', scene: 'poker' },
      { id: 'theme', title: 'Tag und Nacht', text: 'Helles und dunkles Design. Ein Fingertipp, und es wird Nacht.', scene: 'theme' },
    ] },
    { id: 'connection', name: 'Verbindung', title: 'Deine Daten aus der Cloud. Zurück auf deinem Schreibtisch.', lead: 'Verbinde dein Zepp-Konto und deine Daten landen auf diesem Rechner. Intervall wählen, den Rest erledigt die automatische Synchronisierung.', points: [
      { id: 'account', title: 'Offizieller Login', text: 'Melde dich im System-Browser bei Zepp an – auch mit Drittanbieter-Konten. Autorisierungsstatus jederzeit einsehbar.', scene: 'account' },
      { id: 'sync', title: 'Automatische Synchronisierung', text: 'Aus, 15, 30 oder 60 Minuten. Du schläfst, die Daten synchronisieren sich.', scene: 'sync' },
      { id: 'devices', title: 'Kennt deine Uhr', text: 'Automatische Modell-Erkennung. Falls mal etwas nicht stimmt, bestimmst du das Modell selbst.', scene: 'devices' },
      { id: 'local', title: 'Bleibt auf deinem Rechner', text: 'Von Zepp synchronisierte Gesundheitsdaten bleiben lokal und berühren nie unsere Server. Was an die KI geht, entscheidest du.', scene: 'local' },
    ] },
    { id: 'records', name: 'Überblick', title: 'Dutzende Messwerte auf einen Blick.', lead: 'Alle Trends auf einer Seite, damit du deine Verfassung sofort verstehst. Öffne jeden Wert für den vollständigen Verlauf.', points: [
      { id: 'overview', title: 'Nach deinen Wünschen', text: 'Schlaf oder Training zuerst: Die Startseite richtet sich nach deinen Prioritäten. Scrollen, dann Details öffnen.', scene: 'overview' },
      { id: 'hourly', title: 'Stunde für Stunde', text: 'Schritte, Distanz und Kalorien für jede Stunde des Tages.', scene: 'hourly' },
      { id: 'workouts', title: 'Jeder Lauf hallt nach', text: 'Vergleiche deine Einheiten mit ähnlichen Distanzen aus der Vergangenheit: Puls, Tempo und GPS-Strecke.', scene: 'workouts' },
      { id: 'gaps', title: 'Nichts erfunden', text: 'Was nicht gemessen wurde, bleibt leer. Keine erfundenen Nullen, vorherigen Werte oder Schätzungen.', scene: 'gaps' },
    ] },
    { id: 'ai', name: 'An KI geben', title: 'Nutze Abos, die du schon hast. Ohne Extrakosten.', lead: 'Wähle den Zeitraum: Deine Einträge werden zu einer Datei. Gib sie deiner gewohnten KI, sprich weiter und bring den Planentwurf zurück.', points: [
      { id: 'providers', title: 'Sieben Modelle zur Wahl', text: 'ChatGPT, Claude, Gemini, Kimi, DeepSeek, Doubao und Grok. Mit deinem bestehenden Konto und Kontingent.', scene: 'ai' },
      { id: 'prompt', title: 'Frag, wie du willst', text: 'Passe die vorbereitete Frage an oder formuliere deine eigene.', scene: 'prompt' },
      { id: 'events', title: 'Kontext zählt', text: 'Notiere Erkältung, Reisen oder stressige Wochen, damit die KI das Auf und Ab richtig einordnet.', scene: 'events' },
      { id: 'autopaste', title: 'Vollautomatisch · Windows', text: 'Fügt ein und sendet automatisch nach vorheriger Fensterprüfung. Standardmäßig deaktiviert.', scene: 'autopaste' },
    ] },
    { id: 'ai-plan', name: 'Trainingsplan', title: 'Am Computer vollenden. Am Handgelenk trainieren.', lead: 'Teile der KI deine Verfassung mit und sie plant die Woche. Zurückkopieren, feinjustieren und direkt an die Uhr senden.', points: [
      { id: 'receive', title: 'Mit einem Klick zurück', text: 'Vom Chat zum Entwurf: Einmal einfügen und der Wochenplan steht.', scene: 'receive' },
      { id: 'edit', title: 'Dein Plan', text: 'Ziehe Tage hin und her, öffne jede Einheit und passe Dauer und Intensität Schritt für Schritt an.', scene: 'plan-edit' },
      { id: 'templates', title: 'Vorlagen und Import', text: 'Als Vorlage speichern und wieder trainieren. Unterstützt auch .zwo- und Workout-.fit-Dateien.', scene: 'templates' },
      { id: 'easy', title: 'Heute erschöpft', text: 'Sind Intervalle geplant, aber die Erholung ist gering, wechselst du mit einem Klick auf lockeres Training. Vor dem Absenden bestätigst du.', scene: 'easy' },
    ] },
  ],
  records: {
    sleep: { title: 'Schlaf', text: 'Von den Phasen einer einzelnen Nacht bis zu den letzten sieben Tagen. Öffnen und vertiefen.' },
    workouts: { title: 'Training', text: 'Die ganze Einheit im Detail – und wie sie sich von früheren unterscheidet.' },
  },
  settings: {
    title: 'Einstellungen',
    lead: 'Große Karten einzeln durchblättern, kleine als Kartenstapel. Konto, Synchronisierung, Anzeige und Datenverwaltung mit einem Tipp.',
    summaryTitle: 'Die Details stecken in den Einstellungen.',
    summaryLead: 'Vierzehn alltägliche Optionen, zusammengefasst in einem Stapel.',
    items: [
      { id: 'sync', title: 'Automatische Synchronisierung', text: 'Aus, 15, 30 oder 60 Minuten. Eine Stufe genügt.', icon: 'auto-sync' },
      { id: 'retention', title: 'Aufbewahrungsdauer', text: 'Cloud-Daten landen lokal auf diesem Rechner. Wie lange sie bleiben, bestimmst du.', icon: 'database' },
      { id: 'data', title: 'Datenumfang', text: 'Welche Werte synchronisiert werden können und welche nicht – auf einen Blick.', icon: 'overview' },
      { id: 'mcp', title: 'MCP', text: 'Lokale Werkzeuge wie Claude Code und Codex fragen direkt ab. Pläne senden erfordert gesonderte Erlaubnis.', icon: 'structured-data' },
      { id: 'formats', title: 'Vier Formate', text: 'JSON · CSV · GPX und auf der Trainingsseite zusätzlich FIT.', icon: 'document' },
      { id: 'units', title: 'Einheiten', text: 'Kilometer oder Meilen. Distanz und Tempo wechseln gemeinsam.', icon: 'settings' },
      { id: 'time', title: 'Uhrzeit', text: 'Nach Region oder im 12-/24-Stunden-Format.', icon: 'auto-sync' },
      { id: 'date', title: 'Datumsformat', text: 'Tag, Monat und Jahr in deiner gewohnten Reihenfolge.', icon: 'document' },
      { id: 'scale', title: 'Oberflächenskalierung', text: 'Fenstergröße ganz nach deinen Wünschen anpassen.', icon: 'overview' },
      { id: 'backup', title: 'Schnappschuss und Wiederherstellung', text: 'Erstelle Backups der Datenbank und stelle sie bei Bedarf wieder her.', icon: 'database' },
      { id: 'api', title: 'Lokale API', text: 'Nur an 127.0.0.1 gebunden. Schreibgeschützt, geschützt durch Token.', icon: 'structured-data' },
      { id: 'privacy', title: 'Datenschutz und Sicherheit', text: 'Zugangsdaten schützt das Betriebssystem. Tokens tauchen nie in Logs auf.', icon: 'browser-login' },
      { id: 'filename', title: 'Dateinamen', text: 'Bestimme selbst, wie die Exportdateien für die KI heißen.', icon: 'document' },
      { id: 'folder', title: 'Datenordner', text: 'Finde den Speicherort auf diesem Rechner für einfache Backups und Migrationen.', icon: 'database' },
    ],
  },
  nav: [
    { label: 'ZeppBridge entdecken', links: [{ id: 'motion', label: 'Design' }, { id: 'connection', label: 'Verbindung' }, { id: 'records', label: 'Überblick' }] },
    { label: 'Von Daten zur Tat', links: [{ id: 'ai', label: 'An KI geben' }, { id: 'ai-plan', label: 'Trainingsplan' }, { id: 'record-sleep', label: 'Schlaf und Training' }] },
    { label: 'Nach deinen Regeln', links: [{ id: 'connect', label: 'Einstellungen' }, { id: 'set-mcp', label: 'MCP' }, { id: 'set-api', label: 'Lokale API' }] },
  ],
  demoPrompt: 'Nächsten Mittwoch keine Zeit. Ein Intervall beibehalten, den Rest locker planen.',
};

export default pack;
