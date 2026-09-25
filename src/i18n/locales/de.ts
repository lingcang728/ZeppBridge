import { plural, type LocalePack } from '../index';

/**
 * Deutsch（de）语言包。
 *
 * 已覆盖的键写在下面三个表里；还没覆盖的键仍登记在同目录的
 * `de.pending.txt` 里（`moduleId.键路径` 一行一条），`npm run i18n:check` 会核对
 * 「翻了的必须出 pending、pending 里必须没翻」。没绑 moduleId 的模块整体留在
 * pending——语言包按 moduleId 覆盖，没绑的模块写了也够不着。
 *
 * 形状：
 *   modules: { '<moduleId>': { <键路径>: '键译' | (参数) => `...` } }
 *   errors: { 'err.x.y': '译文' }        // 等价 modules['i18n/errors']
 *   backendText: { 'ui.x.y': '译文' }    // 后端散文码的兜底表
 */
export default {
  // ── i18n/errors ──
  errors: {
    'err.core.network': 'Die Zepp-Region war nicht erreichbar. Prüfe dein Netzwerk und versuche es erneut',
    'err.core.needs_reauth': 'Deine Anmeldung ist abgelaufen. Verbinde dich erneut mit Zepp',
    'err.core.unavailable': 'Dieses Konto oder diese Region liefert diese Daten nicht',
    'err.core.retry_exhausted': 'Zepp ist vorübergehend nicht verfügbar. Versuche es in Kürze erneut',
    'err.core.http_status': 'Zepp hat einen Fehler zurückgegeben. Versuche es in Kürze erneut',
    'err.core.cloud_rejected':
      'Zepp hat die Anfrage erhalten und abgelehnt. Wenn das weiterhin passiert, verbinde das Zepp-Konto in den Einstellungen erneut',
    'err.core.cancelled': 'Abgebrochen',
    'err.core.auth': 'Bei der Anmeldung ist etwas schiefgelaufen',
    'err.headless.no_credential_store':
      'Auf diesem Rechner ist kein systemseitiger Anmeldespeicher verfügbar (GNOME Keyring / KWallet). Headless-Server und Container haben meist keinen. Setze ZEPPBRIDGE_CREDENTIAL_STORE=file, um das Token mit 0600 ins Datenverzeichnis zu schreiben, oder ZEPPBRIDGE_CREDENTIAL_STORE=env zusammen mit ZEPPBRIDGE_APP_TOKEN.',
    'err.headless.schema_upgrade':
      'Diese Bibliothek ist älter als der Build, der sie liest, und eine Nur-Lesen-Verbindung kann sie nicht aktualisieren. Starte einmal die Desktop-App oder führe auf einem Headless-Rechner zeppbridge-cli reprocess aus. Beide legen vor dem Upgrade eine Sicherung an.',
    'err.headless.token_not_in_store':
      'Die Kontodaten sind da, aber der Anmeldespeicher hat kein Token dafür. Eine Datenbank lässt sich zwischen Rechnern kopieren; ein Token nicht – er bleibt im Anmeldespeicher des Rechners, auf dem er erstellt wurde. Melde dich erneut an.',
    'err.core.credential_store':
      'Der Anmeldespeicher war nicht zugänglich. Prüfe, ob er gesperrt ist, von einer Systemrichtlinie blockiert wird, falsch konfiguriert ist oder falsche Dateiberechtigungen hat. Web-Anmeldung, HAR-Import und manuelle Eingabe nutzen denselben Speicher; ein Wechsel der Anmeldemethode umgeht einen Speicherfehler nicht. Wenn der macOS-Schlüsselbund oder der Linux-Schlüsselring nicht verfügbar ist, folge der im README verlinkten Anleitung zur Anmeldespeicherung: Starte mit ZEPPBRIDGE_CREDENTIAL_STORE=file und melde dich erneut an. Dabei werden Token in einer Klartextdatei gespeichert, die nur dein Benutzer lesen und schreiben kann.',
    'err.core.invalid_host': 'Unsichere Zepp-Regions-Adresse',
    'err.core.config': 'An der Konfiguration muss zuerst etwas geändert werden',
    'err.har.missing_user': 'Im HAR wurde keine User-ID gefunden. Exportiere den Netzwerkverkehr nach der Anmeldung erneut.',
    'err.har.missing_token': 'Im HAR wurde kein Anmeldetoken gefunden. Aktiviere den Export mit sensiblen Daten.',
    'err.har.invalid_file': 'Es kann kein gültiges HAR gelesen werden. Wähle eine von deinem Browser exportierte HAR-Datei.',
    'err.har.too_large': 'Die HAR-Datei ist zu groß. Exportiere einen kleineren Mitschnitt und versuche es erneut.',
    'err.har.unverified':
      'Die Anmeldedaten im HAR haben die Zepp-Prüfung nicht bestanden, es wurde nichts gespeichert. Melde dich erneut an und exportiere wieder, oder gib ein App-Token von Hand ein.',
    'err.core.busy': 'Ein anderer Schreibvorgang läuft. Warte, bis er fertig ist',
    'err.core.parse': 'Die Antwort von Zepp konnte nicht gelesen werden',
    'err.core.database': 'Die lokale Datenbank ist vorübergehend nicht verfügbar',
    'err.core.io': 'Das Lesen oder Schreiben einer lokalen Datei ist fehlgeschlagen',
    'err.core.unknown': 'Etwas ist schiefgelaufen',
    'err.auth.sync_init_failed': 'Die Synchronisierung konnte nicht eingerichtet werden. Prüfe die Konto-Region und versuche es erneut',
    'err.auth.verify_network': 'Verifizierung fehlgeschlagen: Zepp war nicht erreichbar. Prüfe dein Netzwerk und versuche es erneut',
    'err.auth.verify_needs_reauth': 'Verifizierung fehlgeschlagen: Die Anmeldedaten sind nicht mehr gültig. Speichere sie erneut',
    'err.auth.verify_failed': 'Verifizierung fehlgeschlagen',
    'err.login.waiting': 'Schließe die Zepp-Anmeldung im Popup-Fenster ab',
    'err.login.fallback_page': 'Die alternative Anmeldeseite wird geöffnet',
    'err.login.extracting': 'Anmeldedaten gelesen. Deine Region wird bestätigt',
    'err.login.verifying': 'Das Konto wird verifiziert',
    'err.login.connected': 'Mit deinem Zepp-Konto verbunden',
    'err.login.timeout': 'Die Anmeldung ist abgelaufen. Versuche es erneut',
    'err.login.credentials_unreadable':
      'Du bist angemeldet, aber die Anmeldedaten konnten nicht aus dem Anmeldefenster gelesen werden. Versuche den HAR-Import oder gib ein App-Token von Hand ein.',
    'err.login.region_probe_failed':
      'Die Anmeldedaten wurden gelesen, aber die Konto-Region konnte nicht bestätigt werden. Melde dich erneut an oder importiere eine HAR-Datei.',
    'err.login.credentials_rejected':
      'Zepp hat diese Anmeldedaten abgelehnt. Melde dich im Anmeldefenster ab und dann erneut an',
    'err.login.region_unreachable': 'Der Zepp-Regionsdienst war nicht erreichbar. Prüfe dein Netzwerk und versuche es erneut',
    'err.login.region_retrying':
      'Der Zepp-Regionsdienst ist gerade nicht erreichbar – es wird erneut versucht. Das Anmeldefenster bleibt offen, eine neue Anmeldung ist nicht nötig',
    'err.login.third_party_stalled':
      'Diese Drittanbieter-Anmeldung scheint zu hängen. Google-Passkeys bleiben im In-App-Fenster oft am Verifizierungsschritt hängen. Schließe das Anmeldefenster und nutze stattdessen E-Mail + Passwort, oder gib in den Einstellungen ein App-Token von Hand ein.',
    'err.login.bad_url': 'Ungültige Anmeldeadresse',
    'err.login.window_failed': 'Das Anmeldefenster konnte nicht geöffnet werden',
    'err.login.window_busy': 'Das vorherige Anmeldefenster schließt noch. Warte einen Moment und versuche es erneut',
    'err.login.state_unavailable': 'Der Anwendungszustand ist nicht verfügbar',
    'err.login.cancelled': 'Anmeldung abgebrochen',
    'err.login.sync_init_failed': 'Angemeldet, aber die Synchronisierung konnte nicht initialisiert werden',
    'err.sync.not_connected': 'Noch nicht mit Zepp verbunden. Verbinde dich zuerst',
    'err.sync.not_verified': 'Schließe die Verifizierung der Verbindung ab, bevor du aktuelle Daten synchronisierst',
    'err.sync.not_verified_probe': 'Schließe die Verifizierung der Verbindung ab, bevor du die Fähigkeiten prüfst',
    'err.sync.not_verified_backfill': 'Schließe die Verifizierung der Verbindung ab, bevor du Historie nachlädst',
    'err.sync.history_days_out_of_range': 'Diese Anzahl von Tagen liegt außerhalb des erlaubten Bereichs',
    'err.sync.deferred_compaction':
      'Gespeicherte Rohdaten werden komprimiert, um Platz zu sparen. Diese Synchronisierung versucht es automatisch erneut',
    'err.sync.deferred_replay':
      'Abgeleitete Daten werden aus lokalen Rohdaten neu aufgebaut. Diese Synchronisierung versucht es automatisch erneut',
    'err.sync.deferred_busy': 'Ein anderer Schreibvorgang läuft. Diese Synchronisierung versucht es automatisch erneut',
    'err.backfill.bad_start_date': 'Ungültiges Startdatum für das Nachladen – nutze JJJJ-MM-TT',
    'err.backfill.no_canonical_records': 'Die Cloud hat Daten geliefert, aber es konnten keine verwertbaren Einträge daraus gelesen werden',
    'err.backfill.partial_window': 'Nur ein Teil dieses Zeitraums wurde geschrieben. Es braucht noch einen erneuten Versuch',
    'err.backfill.start_in_future': 'Der Start des Nachladens kann nicht nach heute liegen',
    'err.backup.restore_busy':
      'Die Wiederherstellung lief nicht: Ein anderer Schreibvorgang läuft. Die aktuelle Bibliothek ist unverändert; es wird beim nächsten Start erneut versucht',
    'err.backup.restore_failed':
      'Die Wiederherstellung ist nicht fertig geworden. Die aktuelle Bibliothek ist unverändert; es wird beim nächsten Start erneut versucht',
    'err.capability.not_synced': 'Noch nicht synchronisiert',
    'err.capability.needs_reauth': 'Erneute Anmeldung nötig',
    'err.capability.unverified': 'Noch nicht verifiziert',
    'err.capability.unavailable': 'Nicht verfügbar',
    'err.capability.unknown': 'Status unbekannt',
    'err.capability.other': 'Status unbekannt',
    'err.export.empty_range': 'In diesem Zeitraum gibt es keine Einträge zum Exportieren',
    'err.export.read_failed': 'Die Exportdaten konnten nicht gelesen werden',
    'err.export.convert_failed': 'Die Umwandlung in das gewünschte Format ist fehlgeschlagen',
    'err.export.write_failed': 'Die Exportdatei konnte nicht geschrieben werden',
    'err.export.write_json_failed': 'Der JSON-Export konnte nicht geschrieben werden',
    'err.export.mkdir_failed': 'Der Exportordner konnte nicht erstellt werden',
    'err.export.path_required': 'Wähle zuerst, wo die Datei gespeichert wird',
    'err.export.path_not_absolute': 'Der Speicherort muss ein absoluter Pfad sein',
    'err.export.not_a_directory': 'Ein FIT-Export braucht einen Ordner, aber der gewählte Pfad ist eine Datei',
    'err.export.bad_extension': 'Die Exportdatei hat die falsche Erweiterung',
    'err.export.path_no_parent': 'Der Speicherort hat keinen gültigen Ordner',
    'err.export.parent_missing': 'Der gewählte Ordner existiert nicht',
    'err.handoff.prompt_required': 'Schreibe zuerst einen Prompt',
    'err.handoff.empty_range': 'In diesem Zeitraum gibt es keine Einträge zum Übergeben',
    'err.handoff.mkdir_failed': 'Der Übergabeordner konnte nicht erstellt werden',
    'err.handoff.write_failed': 'Die anonymisierten KI-Daten konnten nicht geschrieben werden',
    'err.handoff.parse_failed': 'Das KI-Export-JSON konnte nicht gelesen werden',
    'err.handoff.encode_failed': 'Der anonymisierte KI-Export konnte nicht kodiert werden',
    'err.diagnostic.nothing_to_submit': 'Dieses Gerät hat keine Modellnummer, die dem Katalog helfen würde – es gibt nichts zu senden',
    'err.diagnostic.empty_report':
      'Wähle zuerst eine Problemart oder schreibe einen Satz – sonst enthält der Bericht nichts, womit jemand etwas anfangen kann',
    'err.diagnostic.client_init_failed': 'Es konnte keine Verbindung für den Bericht geöffnet werden',
    'err.diagnostic.send_failed': 'Der Bericht konnte nicht gesendet werden. Prüfe dein Netzwerk und versuche es erneut',
    'err.diagnostic.http_error': 'Der Berichtsdienst hat einen Fehler zurückgegeben',
    'err.diagnostic.rate_limited':
      'Zu viele Berichte in kurzer Zeit. Versuche es in einer Weile erneut – die bereits gesendeten bleiben erhalten und müssen nicht erneut geschickt werden.',
    'err.diagnostic.bad_response': 'Der Berichtsdienst hat etwas zurückgegeben, das wir nicht lesen konnten',
    'err.workout.not_found': 'Dieses Training existiert nicht mehr',
    'err.prefs.retention_out_of_range': 'Die Aufbewahrung muss zwischen 1 und 365 Tagen liegen',
    'err.storage.write_busy': 'Ein anderer ZeppBridge-Schreibvorgang läuft. Warte, bis er fertig ist',
    'err.storage.write_lock_unavailable': 'Die Schreibsperre konnte nicht erstellt werden. Prüfe die Berechtigungen des Datenordners',
    'err.storage.worker_failed': 'Die Hintergrund-Datenbankaufgabe wurde unterbrochen',
    'err.local_api.token_unavailable': 'Die Anmeldedaten der lokalen API konnten nicht gelesen werden',
    'err.local_api.token_rotate_failed': 'Die Anmeldedaten der lokalen API konnten nicht neu erzeugt werden',
    'err.local_api.port_in_use': 'Der Port der lokalen API wird bereits von einem anderen Programm genutzt',
    'err.local_api.bind_failed': 'Die lokale API konnte nicht gestartet werden',
    'err.local_api.thread_failed': 'Der Thread der lokalen API konnte nicht gestartet werden',
    'err.local_api.state_write_failed': 'Der An/Aus-Zustand der lokalen API konnte nicht gespeichert werden',
    'err.data_folder.open_failed': 'Der Datenordner konnte nicht geöffnet werden',
    'err.data_folder.unsupported_os': 'Das Öffnen des Datenordners wird nur auf Windows und macOS unterstützt',
    'err.update.localappdata_missing': 'Der Windows-Pfad LOCALAPPDATA ist nicht verfügbar',
    'err.update.launch_failed': 'Der aktualisierte installierte Build konnte nicht gestartet werden',
    'err.update.installed_build_missing': 'Nach der Installation wurde kein neuer installierter ZeppBridge-Build gefunden',
    'err.update.portable_windows_only': 'Die Migration von portabel zu installiert gibt es nur unter Windows',
    'err.update.unsafe_data_location':
      'Die Installation wurde gestoppt, weil der Datenort nicht als sicher für Updates verifiziert werden konnte. Beende ZeppBridge, kopiere einen im Paket enthaltenen data-Ordner in deinen Benutzer-Ordner „Application Support" und korrigiere ZEPPBRIDGE_DATA_DIR, bevor du es erneut versuchst. Behalte die Originaldaten.',
    'err.ai_task.attachment_missing': 'Eine Anhangsdatei liegt nicht mehr an ihrem ursprünglichen Ort',
    'err.ai_task.invalid': 'Die Aufgaben-Eingabe ist ungültig. Prüfe die Felder',
    'err.ai_task.not_found': 'Die Analyseaufgabe existiert nicht oder wurde gelöscht',
    'err.ai_task.workout_not_found': 'Manche gewählten Trainings existieren auf diesem Gerät nicht',
    'err.ai_task.write_failed': 'Die Übergabedateien konnten nicht geschrieben werden',
    'err.ai_template.builtin_readonly':
      'Eingebaute Vorlagen sind schreibgeschützt. Speichere eine Kopie als eigene Vorlage',
    'err.ai_template.invalid': 'Die Vorlagen-Eingabe ist ungültig. Prüfe die Felder',
    'err.ai_template.not_found': 'Die Vorlage existiert nicht oder wurde gelöscht',
    'err.mcp.scope_denied': 'Diese Anfrage liegt außerhalb der für MCP freigegebenen Aufgaben',
    'err.mcp.scope_no_grants':
      'Noch ist keine Aufgabe für MCP freigegeben. Markiere eine Aufgabe auf der Aufgabenseite als freigegeben und versuche es erneut',
  },

  // ── 后端 ui.* 散文码的兜底表 ──
  backendText: {
    'ui.backup.file_missing': 'Die Sicherungsdatei ist nicht mehr im Sicherungsordner',
    'ui.backup.size_mismatch': 'Die Größe der Sicherungsdatei stimmt nicht mit dem Manifest überein – sie könnte beschädigt sein',
    'ui.backup.sha256_mismatch':
      'Der SHA-256 der Sicherungsdatei stimmt nicht mit dem Manifest überein – sie könnte beschädigt oder verändert sein',
    'ui.backup.integrity_failed': 'Die Sicherungsdatei hat die SQLite-Integritätsprüfung nicht bestanden',
    'ui.estimate.stop_no_space':
      'Das Nachladen braucht mehr Platz, als auf diesem Laufwerk frei ist, und startet nicht. Gib Platz frei oder verkürze den Zeitraum.',
    'ui.estimate.disk_unknown': 'Der freie Speicherplatz konnte nicht gelesen werden. Stelle vor dem Nachladen sicher, dass genug Platz da ist.',
    'ui.estimate.disk_too_small': 'Weniger als 300 MB frei – Historie über mehr als 90 Tage kann nicht nachgeladen werden.',
    'ui.estimate.builtin_guess': 'Noch zu wenige lokale Daten, deshalb ist das eine grobe eingebaute Schätzung des Platzbedarfs.',
    'ui.estimate.measured': 'Geschätzt anhand des Tempos, in dem sich deine eigenen Daten tatsächlich ansammeln.',
    'ui.estimate.partial': 'Geschätzt nur anhand der Datenströme mit genügend lokalen Daten; der Rest zählt nicht mit.',
  },

  modules: {
    'components/ai/WorkoutPicker': { previous: 'Zurück', next: 'Weiter' },
    // ── views/Explore ──
    // cellTypesValue / categoryTraining: mit en identisch und in allowlist-en.txt
    // eingetragen (nackte Zahl bzw. das Lehnwort „Training").
    'views/Explore': {
      title: 'An KI übergeben',
      intro:
        'Wähle eine Vorlage, prüfe, was das Paket wirklich enthält, und sende deine Wearable-Daten an das KI-Werkzeug deiner Wahl.',
      workoutScopeBanner: (workoutId: string) =>
        `Es wird nur Training ${workoutId} exportiert: das Training selbst plus die Punkt-für-Punkt-Metriken, die währenddessen aufgezeichnet wurden. Tagesbasierte Datenströme wie Schlaf und Schritte bleiben draußen. Der Zeitraum ist inaktiv.`,
      backToDateRange: 'Zurück zum Zeitraum',
      categoryTitle: 'Kategorien',
      categoryAria: 'Vorlagenkategorien',
      categoryAll: 'Alle Vorlagen',
      categorySummary: 'Zusammenfassung',
      categoryRecovery: 'Erholung',
      categorySleep: 'Schlaf',
      categoryTraining: 'Training',
      cellTypesValue: (count: number) => `${count}`,
      templateListTitle: 'Vorlagen',
      templateSearchPlaceholder: 'Vorlagen suchen…',
      templateSearchAria: 'Vorlagen suchen',
      noTemplates: 'Keine passende Vorlage.',
      currentTemplate: 'Aktuelle Vorlage',
      copyPromptTitle: 'Prompt-Text in die Zwischenablage kopieren',
      copyPrompt: 'Prompt kopieren',
      promptEditor: 'Prompttext',
      promptEditorHint: ' (Daten werden automatisch angehängt)',
      injected: (count: number) => `${count} Datenströme angehängt`,
      promptEditorAria: 'Prompt-Editor',
      summaryTitle: 'Was das Paket enthält',
      summaryHint: 'Nur was du anhakst',
      cellRange: 'Zeitraum',
      cellCount: 'Einträge',
      cellCountSub: 'synchronisierte Einträge',
      cellTypes: 'Datentypen',
      cellTypesSub: 'im Paket',
      cellSize: 'Größe',
      cellSizeSub: 'geschätzt',
      thisWorkout: 'Dieses Training',
      onlyThisWorkout: 'nur dieses Training',
      approxMinutes: (minutes: number) => `(ca. ${minutes} Min.)`,
      rangeDays: (days: number) => `(${days} Tage)`,
      quickRange: 'Schnellauswahl:',
      range7: '7 Tage',
      range30: '30 Tage',
      startDate: 'Startdatum',
      endDate: 'Enddatum',
      datePickerAria: 'Datumsauswahl',
      secureNote:
        'Alles entsteht lokal: Die strukturierten Daten und der Prompt werden auf diesem Rechner erzeugt.',
      secureOk: 'Nur lokal',
      exportFile: (format: string) => `${format}-Datei exportieren`,
      copyPromptOnly: 'Nur den Prompt kopieren',
      preparing: 'Wird vorbereitet…',
      handTo: (provider: string) => `An ${provider} übergeben`,
      promptCopied: 'Prompt kopiert (keine Daten enthalten).',
      copyFailed: 'Kopieren fehlgeschlagen. Versuche es erneut.',
      retryOpen: (provider: string) => `${provider} erneut öffnen`,
      packTitle: 'Paket erstellen und senden',
      packSub: 'Exportformat und KI-Werkzeug wählen.',
      packContentsTitle: 'Was der Export enthält',
      packContentsIncluded:
        'Enthalten: Trainings-Zusammenfassungen (Art, Beginn und Ende, Distanz, Kalorien, durchschnittliche und maximale Herzfrequenz, Trainingsbelastung), Tagesmetriken (Schritte, Ruheherzfrequenz, HRV, SpO₂, Stress, Atemfrequenz, PAI, VO₂max) und Schlafsitzungen mit ihrem Phasen-Zeitverlauf. Die Option „Full" fügt die Sekunden-Serien der Trainings und einzelne Herzfrequenz-Messungen hinzu.',
      packContentsExcluded:
        'Nicht enthalten: .tcx, Kontodaten, Token oder Geräte-Seriennummern. GPS-Tracks erscheinen in den Formaten GPX und FIT, und nur bei Trainings mit aufgezeichneter Strecke. FIT schreibt pro Training eine Datei in den Ordner, den du wählst.',
      formatGroup: 'Exportformat',
      formatAria: 'Exportformat',
      formatJsonSub: 'Vollständige strukturierte Daten',
      formatCsvSub: 'Zusammenfassungstabelle (keine Punkt-für-Punkt-Serien)',
      formatGpxSub: 'Nur Trainings mit GPS-Track',
      formatFitSub: 'Eine Datei pro Training, gespeichert in den Ordner, den du wählst',
      detailGroup: 'Detailgrad',
      detailAria: 'Detailgrad',
      streamsGroup: 'Datenströme',
      selectedCount: (selected: number, total: number) => `${selected} von ${total} ausgewählt`,
      selectNone: 'Keine',
      selectAll: 'Alle',
      noTypesSelected: 'Kein Datentyp ausgewählt – der Export wird abgelehnt.',
      estimatedSize: 'Geschätzte Paketgröße',
      targetGroup: 'Ziel-KI-Werkzeug',
      targetAria: 'Ziel-KI-Werkzeug',
      providerIconAlt: (provider: string) => `${provider}-Icon`,
      sendHint:
        'Bis zu 2 MiB reisen mit dem Prompt in der Zwischenablage mit. Darüber wird das JSON auf deinen Desktop geschrieben, damit du es in den Chat ziehst.',
      needDesktop:
        'Die KI-Übergabe braucht die Desktop-App; diese Browser-Vorschau öffnet keine externen Seiten.',
      needValidDates: 'Wähle zuerst einen gültigen Zeitraum.',
      needDataTypes: 'Wähle mindestens einen Datentyp.',
      stillReading: 'Die lokalen Einträge werden noch gelesen. Versuche es gleich noch einmal.',
      nothingInScope: 'In diesem Zeitraum ist nichts Synchronisiertes zum Übergeben da.',
      previewDesktopOnly:
        'Öffne dies in der ZeppBridge-Desktop-App; die Vorschau liest lokale Einträge.',
      previewFailed: 'Die lokale Export-Vorschau konnte nicht gelesen werden',
      previewRetry: 'Erneut versuchen',
      attachmentNotice:
        'Das Datenpaket wurde auf deinen Desktop geschrieben (zeppbridge-ai-handoff.json) – ziehe es in den KI-Chat. Der Prompt liegt in deiner Zwischenablage.',
      attachmentOpened: (notice: string, provider: string) => `${notice} ${provider} ist geöffnet.`,
      attachmentNotOpened: (notice: string, provider: string) =>
        `${notice} Öffne ${provider} im Browser, um es zu analysieren.`,
      copiedAndOpened: (provider: string) =>
        `Anonymisierte Daten kopiert und ${provider} geöffnet. Einfügen, dann kann es losgehen.`,
      copiedOnly: (provider: string) =>
        `Anonymisierte Daten kopiert. Öffne ${provider} selbst und füge sie ein.`,
      reopened: (provider: string) => `${provider} ist geöffnet. Füge die Daten dort ein.`,
      templates: {
        performance: {
          name: 'Leistungs-Überblick',
          sub: 'Ein klarer Blick darauf, wie es läuft',
          prompt: `Du bist ein Sport- und Gesundheitsanalyst, der Wearable-Daten in klare, nutzbare Erkenntnisse übersetzt.
Schreib mir aus den untenstehenden ZeppBridge-Daten (schon chronologisch geordnet)
eine klare, gut strukturierte Zusammenfassung meiner Gesamtleistung.
Behandle das Gesamtbild, die wichtigen Trends, was heraussticht, was im Blick zu behalten ist und was ich tun kann.
Wo die Daten dünn sind, sag es offen und nenne, was ich stattdessen sammeln soll, statt zu raten.

Antworte auf Deutsch in Markdown, mit Tabellen, Listen und Aufzählungen, wo sie helfen.
Ton: professionell, knapp, konstruktiv.`,
        },
        training: {
          name: 'Trainings-Einblick',
          sub: 'Trainingsbelastung und ihre Richtung',
          prompt: `Du bist ein erfahrener Ausdauertrainer.
Analysiere anhand der untenstehenden ZeppBridge-Trainingsdaten (Herzfrequenz, Trainingsbelastung und VO₂max)
die Struktur meines Trainings, wie die Intensität verteilt ist und wohin die Belastung geht.
Zeig, was an der Anordnung der Einheiten nicht stimmt, und sag mir, was ich im nächsten Zyklus ändern soll.

Antworte auf Deutsch in Markdown. Sei direkt.`,
        },
        recovery: {
          name: 'Erholung und Bereitschaft',
          sub: 'Erholung, HRV und Trainingsbereitschaft',
          prompt: `Du bist ein auf Erholung spezialisierter Physiologe.
Bewerte anhand der untenstehenden ZeppBridge-Daten zu HRV, Ruheherzfrequenz, Schlaf und Stress,
wie erholt ich bin und wie bereit ich für Training bin,
nenne die Zeichen sich aufbauender Ermüdung und sag mir, was helfen würde.

Antworte auf Deutsch in Markdown.`,
        },
        sleep: {
          name: 'Schlaf-Analyse',
          sub: 'Schlafqualität und Regelmäßigkeit',
          prompt: `Du bist ein Berater für Schlafgesundheit.
Analysiere anhand der untenstehenden ZeppBridge-Daten zu Schlafphasen, Dauer und Herzfrequenz
die Qualität und Regelmäßigkeit meines Schlafs und was ihn offenbar beeinflusst,
und gib mir konkrete, umsetzbare Wege, ihn zu verbessern.

Antworte auf Deutsch in Markdown.`,
        },
        activity: {
          name: 'Aktivitäts-Überblick',
          sub: 'Tägliche Bewegung und ihre Tendenz',
          prompt: `Du bist ein Berater für einen gesunden Lebensstil.
Gib mir anhand der untenstehenden ZeppBridge-Daten zu Schritten, Trainings und Herzfrequenz
einen Überblick über mein tägliches Aktivitätsniveau und seine Tendenz,
und schlage praktische Wege vor, mich mehr zu bewegen.

Antworte auf Deutsch in Markdown.`,
        },
        weekly: {
          name: 'Wochen-Rückblick',
          sub: 'Ein wöchentlicher Rückblick mit konkreten Punkten',
          prompt: `Du bist mein persönlicher Gesundheitscoach und siehst meine Daten einmal pro Woche durch.
Vergleiche mich anhand der untenstehenden ZeppBridge-Daten dieser Woche nur mit meinen eigenen früheren Werten.
Fass zusammen, was sich diese Woche geändert hat, nenne, was gut lief und was Beachtung verdient, und gib mir eine kurze Liste für die nächste Woche.

Regeln:
- Es gibt keine Vergleichsgruppe in diesen Daten. Vergleiche mich nicht mit „gesunden Erwachsenen" oder irgendeinem Durchschnitt.
- Wo etwas fehlt, sag, dass es fehlt. Fülle die Lücke nie mit einer Null oder einer Schätzung.
- Keine medizinische Diagnose, keine Krankheitsrisiko-Einschätzung, keine Behandlungsempfehlung.

Antworte auf Deutsch in Markdown.`,
        },
      },
    },
    // ── views/Settings ──
    // Mit en identisch und in allowlist-en.txt eingetragen:
    // unidentifiedInitial („?"), refreshFailedPeriod („."),
    // stream.pai / hrv / hrv_rmssd / vo2max / stress (Kurzformen wie „PAI", „Stress").
    'views/Settings': {
      title: 'Einstellungen',
      intro:
        'Anmeldung, Synchronisierungsverhalten, Datenschutz und Export-Standards – alles an einem Ort.',
      retry: 'Erneut versuchen',
      distanceUnitLabel: 'Entfernungseinheit',
      displayPrefsTitle: 'Sprache und Formate',

      // ── 1. Anmeldung ──
      authTitle: '1. Anmeldung',
      authWebTitle: 'Offizielle Web-Anmeldung',
      authWebSub: 'Auf der offiziellen Seite anmelden; das appToken wird automatisch übernommen',
      authCancelLogin: 'Anmeldung abbrechen',
      authInUse: 'In Verwendung',
      authOpening: 'Wird geöffnet…',
      authRetry: 'Verbindung erneut versuchen',
      authUse: 'Verwenden',
      authHarTitle: 'HAR-Import',
      authHarSub: 'Für Fortgeschrittene und zur Fehlersuche: eine HAR-Datei importieren',
      authManualTitle: 'Manuell eingeben',
      authManualSub: 'appToken, user_id und Regions-Host von Hand eintragen',
      authCollapse: 'Einklappen',
      manualFormTitle: 'Anmeldedaten eingeben',
      manualFormHint:
        'Aus einem Mitschnitt von mitmproxy/Charles oder den Browser-Entwicklerwerkzeugen übernehmen. Drei Felder:',
      manualTokenPlaceholder: 'Aus dem HTTP-Header „apptoken" kopieren',
      manualUserIdPlaceholder: 'Aus dem URL-Pfad /users/{user_id}/ übernehmen',
      manualSaving: 'Wird gespeichert…',
      manualSave: 'Anmeldedaten speichern',
      cancel: 'Abbrechen',

      // ── 2. Konto und Region ──
      accountTitle: '2. Konto und Region',
      accountLine: (region: string, lastSync: string) => `Region ${region} · letzte Synchronisierung ${lastSync}`,
      verifyAndSync: 'Verifizieren und synchronisieren',
      reauthenticate: 'Erneut anmelden',

      // ── 3. Geräte ──
      devicesTitle: '3. Verbundene Geräte / Datenquellen',
      identifying: 'Wird erkannt…',
      identifyDevices: 'Geräte erneut erkennen',
      deviceErrorPrefix: 'Geräteerkennung: ',
      noDevices: 'Noch kein physisches Gerät erkannt; Zepp Cloud synchronisiert weiterhin als Cloud-Quelle.',
      deviceFirmware: (firmware: string) => `Firmware ${firmware}`,
      deviceLatestData: 'Neueste Daten',
      deviceIdLine: (masked: string) => `Geräte-ID ${masked}`,
      viewOrChange: 'Modell ansehen / ändern',
      unknownDeviceTitle: 'Ein nicht erkanntes Gerät',
      unknownDeviceBodyA: 'Manche Zepp-Konten liefern Geräteeinträge mit ',
      unknownDeviceNoName: 'gar keinem Produktnamen-Feld',
      unknownDeviceBodyB:
        ' – nur interne Nummern, aus denen sich kein Modell ableiten lässt. „Geräte erneut erkennen" zu drücken ändert daran nie etwas. Du kannst oben selbst das Modell auswählen: Es wird als „Von dir gewähltes Modell" gekennzeichnet und nie als automatische Zuordnung ausgegeben.',
      unknownDeviceReport:
        'Einen Fehlerbericht zu senden hilft, die Nummern dieses Geräts in den eingebauten Katalog zu bekommen, sodass es danach niemand mehr von Hand auswählen muss. Der Bericht enthält eine feste Whitelist von Feldern und braucht kein GitHub-Konto.',
      reportWhat: 'Was ist nicht in Ordnung',
      reportWhatHint: ' (eine Option wählen – dann lässt es sich auch senden, wenn nichts automatisch erkannt wurde)',
      reportCategoryPlaceholder: 'Nichts Genaues (nur das automatisch Erkannte senden)',
      reportCategoryAria: 'Art des Problems für den Bericht',
      reportNote: 'Etwas hinzuzufügen',
      reportNoteHint: ' (optional, aber sehr hilfreich)',
      reportNotePlaceholder:
        'Zum Beispiel: Meine Uhr ist eine Amazfit Balance 2, wird aber als nicht erkannt angezeigt; oder: Radfahren im Freien wurde als unbekanntes Training gelesen.',
      reportNoteCounter: (used: number, max: number) =>
        `${used} / ${max} · lokale Pfade, E-Mail-Adressen und lange Kennungen werden vor dem Senden entfernt`,
      reportSubmitting: 'Wird gesendet…',
      reportSubmit: 'Fehlerbericht senden',
      reportDoneTitle: 'Angekommen, danke',
      reportDoneLine: (id: string, at: string) => `Bericht ${id}, gesendet ${at}.`,
      reportDoneNote:
        'Herausgegangen ist genau das, was oben an Feldtypen aufgelistet ist, plus deine Notiz. Nichts weiter.',
      reportConfirm:
        'Dies sendet die App-Version, den OS-Typ, die Parser-Revision, produktbezogene Hinweise und Feldstrukturen nicht erkannter Geräte, die Firmware-Version, modellbezogene Nummern (deviceSource / deviceType – Ganzzahlen, die nur sagen, welches Modell, nicht welches Exemplar), unbekannte Trainings-Codes mit ihren Anzahlen, den numerischen Fehlercode der letzten von der Cloud abgelehnten Anfrage (nur die Nummer, welcher Datenstrom und wann – nie Text, den die Cloud zurückgegeben hat) und deine Notiz von oben (ohne lokale Pfade, E-Mail-Adressen und lange Kennungen). Nie gesendet werden dein Zepp-Konto, Token, Seriennummern, Geräte-IDs, MAC-Adressen, GPS, Gesundheitswerte oder Rohantworten. Senden?',
      reportFailed: 'Der Fehlerbericht konnte nicht gesendet werden',
      capabilityTitle: 'Was deine Geräte liefern können',
      capabilityIntro:
        'Was ZeppBridge derzeit aus deinem Konto lesen kann. Diese Liste aktualisiert sich bei jeder Synchronisierung von selbst; es gibt nichts zu drücken.',
      lampOn: (count: number) => `Abgerufen: ${count}`,
      lampPending: (count: number) => `In der Cloud, lokal nicht gespeichert: ${count}`,
      lampOff: (count: number) => `Nicht abgerufen: ${count}`,
      capabilityEmptyTitle: 'Noch nicht synchronisiert',
      capabilityEmptyBody: 'Nach einer Synchronisierung leuchten sie auf.',
      probeSummary: 'Endpunkt-Diagnose',
      probeNote:
        '„Nicht abgerufen" heißt nicht, dass das Gerät es nicht hat: Zepps Endpunkte antworten auf nicht vorhandene Datenströme einfach leer; nur eine klare Weigerung wird als „dein Gerät liefert das nicht" gemeldet.',
      probing: 'Prüfung läuft…',
      probeRun: 'Jetzt erneut prüfen',
      probedToday: 'heute geprüft',
      probedDaysAgo: (days: number) => `vor ${days} ${days === 1 ? 'Tag' : 'Tagen'} geprüft`,
      probeRecords: (records: number, latest: string) =>
        `${records} ${records === 1 ? 'Eintrag' : 'Einträge'}${latest ? `, zuletzt ${latest}` : ''}`,
      probeEmpty: 'keine Daten',
      probeRefused: 'Endpunkt verweigert',
      probeFailed: 'Anfrage fehlgeschlagen',
      codesTitle: 'Nicht erkannte Trainings-Codes',
      codesUnnamed: (count: number) => `${count} noch ohne Namen`,
      codesIntro:
        'Zepps eigene Trainingsvorlagen liefern nur eine Nummer ohne Namen, und auch der eingebaute Katalog kennt sie nicht. Statt eine Sportart zu raten und dir vorzusetzen, gib dem Code einmal selbst einen Namen – jeder Eintrag mit diesem Code nutzt ihn danach, und die Trainingsseite sagt offen, dass er von dir stammt.',
      codeNumber: (code: number) => `Zepp-Code ${code}`,
      codeRecords: (count: number) =>
        `${count} ${count === 1 ? 'lokaler Eintrag bekommt' : 'lokale Einträge bekommen'} diesen Namen`,
      codeShownAs: (label: string) => `Wird derzeit als „${label}" angezeigt`,
      codeShownAsUnknown: (code: number) => `Wird derzeit als „Nicht erkanntes Training (Code ${code})" angezeigt`,
      codeInputAria: (code: number) => `Eigener Name für Code ${code}`,
      codeInputPlaceholder: 'Gib ihm einen Namen, z. B. „Meine Core-Einheit"',
      codeSaving: 'Wird gespeichert…',
      codeSave: 'Speichern',
      codeFootnote:
        'Der Name bleibt auf diesem Rechner, wird nie zu Zepp zurückgeschickt und überlebt ein Neueinlesen. Leer speichern löscht ihn.',
      codeSaved: (code: number, label: string) => `Code ${code} wird jetzt als „${label}" angezeigt.`,
      codeCleared: (code: number) => `Der eigene Name für Code ${code} wurde gelöscht.`,
      codeSaveFailed: 'Der eigene Trainingsname konnte nicht gespeichert werden',
      codeSuggestions: ['Kraft', 'Core', 'HIIT', 'Dehnen', 'Reha', 'Eigene Einheit'],

      // ── 4. Datenschutz ──
      privacyTitle: '4. Datenschutz und Sicherheit',
      privacyDbTitle: 'Die lokale Datenbank ist nicht verschlüsselt',
      privacyDbBody:
        'Gesundheitsdaten liegen als reine SQLite im Datenordner der App, geschützt durch dein Windows-/macOS-Konto und die Festplattenverschlüsselung. ZeppBridge verschlüsselt die Datenbank nicht als Ganzes – und tut nicht so.',
      privacyTokenTitle: 'Zepp-Token nutzen standardmäßig den Anmeldespeicher des Systems',
      privacyTokenBody:
        'Standard sind Windows-Anmeldeinformationsverwaltung / macOS-Schlüsselbund / Linux-Schlüsselring. macOS und Linux können ausdrücklich eine Klartext-Anmeldedatei nutzen, die nur dein Benutzer lesen und schreiben darf; Linux unterstützt zusätzlich Umgebungsvariablen. auth.json enthält nur Konto- und Regions-Metadaten. Token landen nie in Logs, Datenexporten oder Fehlerberichten.',
      privacyTelemetryTitle: 'Keine Telemetrie, keine Nutzungsstatistik',
      privacyTelemetryBody:
        'Die App meldet von sich aus kein Nutzungsverhalten. Nur wenn du selbst „Fehlerbericht senden" drückst, gehen die unten aufgeführten anonymisierten Felder raus.',
      privacyModalLink: 'Die lokalen Datenschutz-Prinzipien lesen',
      privacyReportTitle: 'Ein Gerät oder Training nicht erkannt?',
      privacyReportBody:
        'Ohne GitHub-Konto, ohne Daten zu kopieren. Nach deiner Bestätigung gehen nur produktbezogene Feldstrukturen, die Firmware-Version, Modellnummern (Ganzzahlen, die nur sagen, welches Modell) und unbekannte Trainings-Codes mit ihren Anzahlen an ZeppBridges privaten Fehlerbericht-Speicher. Nie gehen dein Konto, Token, Seriennummern, Geräte-IDs, MAC-Adressen, GPS, Gesundheitswerte, Rohantworten oder lokale Pfade raus.',

      // ── 5. MCP ──
      mcpTitle: '5. MCP (KI-Werkzeuge fragen direkt deine lokalen Daten)',
      mcpBadge: 'Nur lesend · hört auf keinem Port',
      mcpSkip: 'Wenn dir MCP nichts sagt, überspringe diesen Abschnitt – er ändert nichts an ZeppBridges Funktionen.',
      mcpCompareA: 'Kurz gesagt: „An KI übergeben" heißt, du exportierst und fügst ein; MCP heißt, ',
      mcpCompareStrong: 'die KI fragt selbst nach',
      mcpCompareB:
        ' – einmal eingerichtet sagst du „wie habe ich diesen Monat geschlafen", und sie fragt deine lokale Datenbank. Nützlich nur für KI-Programmierwerkzeuge auf deinem Rechner (Claude Code, Codex, Grok und Ähnliche).',
      mcpAskA: 'Die Einrichtung ist je nach Werkzeug verschieden; statt hier einen Aufsatz zu schreiben, ',
      mcpAskStrong: 'kopiere den Text unten in die KI, die du wirklich benutzt',
      mcpAskB: ', und lass dich von ihr auf deinem Rechner durch die Einrichtung führen.',
      mcpCopyPrompt: 'Kopieren und deine KI fragen',
      mcpCopyConfig: 'Nur das Config-Snippet kopieren',
      mcpToolsLead: 'Einmal eingerichtet kann die KI nach diesen fünf Dingen fragen:',
      mcpFootA:
        ' kommt im Tools-Archiv jeder Release mit, in derselben Version wie die Desktop-App. Es liest dieselbe lokale Datenbank, sieht also exakt das, was du hier siehst.',
      mcpPromptCopied:
        'Kopiert. Füge es bei der KI ein, die du nutzt – sie gibt dir die Einrichtungsschritte für deinen Rechner.',
      mcpPromptCopyFailed: 'Kopieren fehlgeschlagen. Markiere den Text oben von Hand.',
      mcpConfigCopied: 'Config kopiert. Ersetze command durch den echten Pfad zu zeppbridge-mcp auf deinem Rechner.',
      mcpConfigCopyFailed: 'Kopieren fehlgeschlagen. Markiere die Config oben von Hand.',
      mcpToolListWorkouts: 'Trainingsliste, neueste zuerst',
      mcpToolWorkoutInsight: 'Ein Training gegen deine eigene Referenz',
      mcpToolMetricSeries: 'Tägliche Metrikreihen, jede mit ihrer Einheit',
      mcpToolSleepDetail: 'Eine Nacht Schlaf, Phase für Phase',
      mcpToolDataHealth: 'Abruf-/Parse-/Schreib-Status je Datenstrom',
      mcpSetupPrompt: `Ich benutze eine Windows-Desktop-App namens ZeppBridge, die die Daten meiner Amazfit-/Zepp-Uhr in eine lokale SQLite-Datenbank synchronisiert.
Sie bringt ein MCP-Programm (zeppbridge-mcp) mit, das ich bei dir einrichten möchte, damit du meine Trainings und Gesundheitsdaten direkt abfragen kannst, statt dass ich jedes Mal exportiere und einfüge.

Was ich darüber weiß:
- Das MCP-Programm kommt aus dem zeppbridge-tools-Archiv auf ZeppBridges GitHub-Releases-Seite; entpacken und zeppbridge-mcp liegt darin. Ich habe es eventuell noch nicht heruntergeladen.
- Es ist ein stdio-MCP-Server. Er liest die lokale Datenbank, nutzt kein Netzwerk, hört auf keinem Port und braucht kein Token und keinen API-Key.
- Die typische Config-Form ist: {"mcpServers": {"zeppbridge": {"command": "<voller Pfad zu zeppbridge-mcp>", "args": []}}}
- Er stellt fünf nur-lesende Werkzeuge bereit: list_workouts, get_workout_insight (ein Training gegen meine eigene Referenz), get_metric_series (tägliche Metrikreihen), get_sleep_detail (eine Nacht, Phase für Phase) und get_data_health (Abruf-/Parse-/Schreib-Status je Datenstrom).

Bitte sag mir:
1. Konkret für dich – das Werkzeug, mit dem ich gerade spreche – in welche Datei die Config gehört oder welcher Befehl sie hinzufügt;
2. Wie man einen Windows-Pfad schreibt (müssen Backslashes escaped werden);
3. Wie ich nach der Einrichtung prüfe, dass es funktioniert.

Wenn du etwas von mir brauchst (welchen Client ich nutze, wo die Datei liegt), frag einfach.`,
      mcpConfigPathPlaceholder: '<Pfad zu zeppbridge-mcp>',

      // ── 6. Aufbewahrung ──
      retentionTitle: '6. Lokale Aufbewahrung von Daten',
      retentionLabel: 'Aufbewahren für',
      retentionAria: 'Aufbewahrungsdauer lokaler Daten in Tagen',
      retentionNote: (days: number) => `Es werden die letzten ${days} Tage lokal behalten. Die Bereinigung läuft `,
      retentionNoteStrong: 'nach einer erfolgreichen Synchronisierung',
      retentionNoteTail: ', nie von allein im Hintergrund.',
      retentionCutoff: (date: string) =>
        `Nach der nächsten erfolgreichen Synchronisierung werden Daten vor dem ${date} gelöscht`,
      cleaningUp: 'Bereinigung läuft…',
      cleanupNow: 'Jetzt bereinigen',
      reprocessing: 'Neueinlesen läuft…',
      reprocessNow: 'Neu einlesen',
      days: (days: number) => `${days} ${days === 1 ? 'Tag' : 'Tage'}`,
      lastDays: (days: number) => `Letzte ${days} Tage`,

      // ── 7. Export / Nachladen ──
      exportTitle: '7. Standards für Export und Nachladen',
      defaultFormatLabel: 'Standard-Exportformat',
      defaultFormatAria: 'Standard-Exportformat',
      historyRangeLabel: 'Zeitraum des Historie-Nachladens',
      historyRangeAria: 'Tage für das Historie-Nachladen',
      exportNote: 'Legt das Standardformat auf der Seite „An KI übergeben" und das Fenster des Cloud-Nachladens fest.',
      startBackfill: 'Ein Historie-Nachladen starten',
      formatJsonHint: 'Strukturierte Daten',
      formatCsvHint: 'Tabellendaten',
      formatGpxHint: 'Trainingsstrecken',

      // ── 8. Updates ──
      updateTitle: '8. Software-Updates',
      updateSub: 'Prüft höchstens einmal am Tag unauffällig; du kannst auch von Hand prüfen.',
      updateChecking: 'Prüfung läuft…',
      updateCheck: 'Nach Updates suchen',
      updateCurrent: (version: string) => `Aktuell ${version}`,
      updateVersion: (version: string) => `Version ${version}`,
      buildStamp: (stamp: string) => `Build ${stamp}`,
      updateVersionLoading: 'wird geladen',
      updateSeeNotes: 'Was sich geändert hat',
      updateStatusIdle: 'Noch nicht geprüft',
      updateStatusChecking: 'GitHub Releases werden geprüft',
      updateStatusAvailable: (version: string) => `Version ${version} ist verfügbar`,
      updateStatusDownloading: 'Das Update wird geladen',
      updateStatusDownloadingPercent: (percent: number) => `Wird geladen: ${percent} %`,
      updateStatusInstalling: 'Wird installiert; die App startet danach neu',
      updateStatusFailed: 'Das Update ist fehlgeschlagen',
      updateStatusUpToDate: 'Du bist auf dem neuesten Stand',
      updateStatusUnmanaged: 'Updates kommen von deinem Paketmanager',
      updateUnmanagedHint: (version: string) =>
        `Aktuell ${version}. Dieser Build wird über Flatpak oder den Paketmanager deiner Distribution aktualisiert: flatpak update com.zeppbridge.app ausführen oder das Paket aktualisieren.`,
      releaseNotesEmpty: 'Diese Version kommt ohne Anmerkungen.',
      updateModalTitle: (version: string) => `Was sich in ZeppBridge ${version} geändert hat`,
      updateModalCurrent: (version: string) => `Du bist auf ${version}`,
      updateModalUnknownVersion: 'einer unbekannten Version',
      updateModalReleased: (date: string) => ` · erschienen am ${date}`,
      updateInstalling: 'Wird installiert…',
      updateDownloading: 'Das Update wird geladen',
      updateInstallNote: 'Die App startet nach der Installation selbst neu. Lokale Gesundheitsdaten werden nicht gelöscht.',
      updateDownloadNoteTail: ' · nach dem Laden installiert sie sich automatisch; du kannst oben weiterlesen',
      updateDownloadNote: 'Nach dem Laden installiert sie sich automatisch; du kannst oben weiterlesen.',
      updateFailedPrefix: (reason: string) => `Update fehlgeschlagen: ${reason}`,
      updateRestartNote: 'Die App startet während der Installation neu. Lokale Gesundheitsdaten werden nicht gelöscht.',
      updateBackground: 'Im Hintergrund weiter',
      updateLater: 'Nicht jetzt',
      updateRetry: 'Erneut versuchen',
      updateInstall: 'Laden und installieren',

      // ── 9. Automatische Synchronisierung ──
      syncTitle: '9. Automatische Synchronisierung',
      syncDescA: (minutes: number) =>
        `Cloud-Daten werden alle ${minutes} Minuten synchronisiert, solange die App offen ist`,
      syncDescB: 'Wenn sie an bleibt, bleiben die Zeitreihen lückenlos.',
      syncIntervalAria: 'Intervall der automatischen Synchronisierung',
      minutes: (minutes: number) => `${minutes} Min.`,
      syncOn: 'Synchronisierung an',
      syncOff: 'Synchronisierung aus',
      syncing: 'Synchronisierung läuft…',
      syncNow: 'Jetzt synchronisieren',

      // ── Erweitert ──
      advancedTitle: 'Erweitert und Wartung',
      advancedSub: 'Skalierung, Datenordner und Löschen der Anmeldedaten. Nur wenn du sie brauchst.',
      scaleLabel: 'Oberflächen-Skalierung',
      scaleNote: '100 % ist die Designbasis. Strg + / Strg - gehen auch.',
      dataAuthLabel: 'Daten und Anmeldedaten',
      dataAuthNote: (days: number) =>
        `Die Daten liegen im Datenordner der App; derzeit werden ${days} Tage behalten.`,
      openDataFolder: 'Datenordner öffnen',
      clearAuth: 'Anmeldedaten löschen',
      logout: 'Abmelden',
      logoutHint:
        'Meldet nur das Konto ab. Alles bereits auf diesen Rechner Synchronisierte bleibt, und die Synchronisierung geht nach der nächsten Anmeldung weiter.',
      logoutNoMultiAccount:
        'Kontenwechsel wird noch nicht unterstützt: Wenn du dich danach mit einem anderen Konto anmeldest, schreiben beide Konten in dieselbe lokale Bibliothek.',
      healthCheckLabel: 'Prüfung des Datenzustands',
      healthCheckNote:
        'Wie weit jeder Datenstrom beim Abrufen aus der Cloud, Parsen und lokalen Schreiben gekommen ist; welche Daten er abdeckt; woher er kommt. Nichts zum täglichen Anschauen – hierher kommst du, wenn ein Sync-Ergebnis nicht dem entspricht, was du erwartet hast.',
      healthCheckOpen: 'Datenzustandsprüfung öffnen',
      compactLabel: 'Gespeicherte Rohdaten komprimieren',
      compactNoteA:
        'Die rohen Cloud-Antworten belegen den meisten Platz in dieser Datenbank. Es ist JSON-Text und lässt sich meist auf etwa ein Fünftel komprimieren.',
      compactNoteStrong: 'Das passiert automatisch',
      compactNoteB:
        ': Beim ersten Start einer neuen Version komprimiert der Hintergrund den Bestand, ein Banner zeigt es an und verschwindet danach. Dieser Knopf startet es nur von Hand erneut (etwa wenn es unterbrochen wurde). Vor dem Ersetzen wird entpackt und Byte für Byte verglichen; was nicht passt, bleibt unangetastet – die Rohdaten sind die einzige Grundlage fürs Neueinlesen, also wird lieber nichts angerührt. Danach läuft ein VACUUM; erst das verkleinert die Datei auf der Platte wirklich.',
      compacting: 'Komprimierung läuft… (bei einer großen Datenbank einige Minuten)',
      compactRun: 'Gespeicherte Rohdaten komprimieren',
      backupLabel: 'Datenbank-Snapshots und Wiederherstellung',
      backupNote:
        'Eine Kopie der ganzen Datenbank für den Notfall, die nur ZeppBridge zurücklesen kann. Vor einem Datenbank-Upgrade wird automatisch eine erstellt; von Hand brauchst du das selten.',
      localApiLabel: 'Lokale REST-API',
      localApiNote:
        'Damit andere Programme auf diesem Rechner – Skripte, Dashboards, eigene Werkzeuge – normalisierte Trainingsreihen als JSON lesen können. Wenn du so etwas nicht brauchst, lass sie aus.',
      syncDiagnostics: 'Sync-Diagnose',
      noSyncDiagnostics: 'Noch keine Sync-Diagnose.',

      // ── Lokale API ──
      apiTitle: 'Lokale REST-API',
      apiSub:
        'Lässt andere Programme auf diesem Rechner normalisierte Trainingsreihen als JSON lesen. Standardmäßig aus; du schaltest sie ausdrücklich ein.',
      apiListening: 'Hört',
      apiEnabledNotListening: 'An, hört aber nicht',
      apiOff: 'Aus',
      apiToggleTitle: 'Lokale API aktivieren',
      apiToggleSub: (address: string) =>
        `Wirkt sofort, kein Neustart nötig. Beim Ausschalten wird ${address} sofort freigegeben.`,
      apiToggleAria: 'Lokale REST-API aktivieren',
      apiCopyExample: 'Ein authentifiziertes Beispiel kopieren',
      apiTokenLabel: 'Zugriffstoken',
      apiHide: 'Verbergen',
      apiShow: 'Anzeigen',
      apiCopy: 'Kopieren',
      apiRegenerate: 'Neu erzeugen',
      apiAuthNoteA: 'Jede Anfrage muss ',
      apiAuthNoteB: ' mittragen, sonst gibt es einen 401. Neu erzeugen macht den alten Token sofort ungültig.',
      apiBindNote:
        'Nur an 127.0.0.1 gebunden: nur lesend, kein browser-übergreifender Zugriff, und sie gibt keine Anmeldedaten zurück. Sie stoppt, wenn du ZeppBridge beendest.',
      apiTokenReadFailed: 'Der Zugriffstoken der lokalen API konnte nicht gelesen werden',
      apiEnabled: 'Die lokale API ist an. Kein Neustart nötig.',
      apiDisabled: 'Die lokale API ist aus, der Port ist frei.',
      apiToggleFailed: 'Die lokale API konnte nicht umgeschaltet werden',
      apiTokenCopied: 'Zugriffstoken in die Zwischenablage kopiert.',
      apiTokenCopyFailed: 'Konnte nicht in die Zwischenablage schreiben. Drücke „Anzeigen" und kopiere ihn von Hand.',
      apiRegenerateConfirm:
        'Neu erzeugen macht den alten Token sofort ungültig, und jedes lokale Programm, das ihn nutzt, muss aktualisiert werden. Fortfahren?',
      apiTokenRegenerated: 'Ein neuer Zugriffstoken wurde erzeugt. Der alte ist ungültig.',
      apiRegenerateFailed: 'Der Zugriffstoken konnte nicht neu erzeugt werden',
      apiExampleCopied: 'Das authentifizierte Beispiel wurde kopiert (es enthält deinen Zugriffstoken).',
      apiExampleCopyFailed:
        'Das Beispiel konnte nicht kopiert werden. Setze Endpunkt-URL und Authorization-Header von Hand zusammen.',

      // ── Datenschutz-Modal ──
      privacyModalTitle: 'ZeppBridges lokale Datenschutz-Prinzipien',
      privacyPoint1Title: '1. Lokal zuerst: ',
      privacyPoint1:
        'alle Gesundheits- und Trainingszeitreihen leben nur in der lokalen SQLite-Datenbank; Parsen und Anonymisieren passieren vollständig auf diesem Rechner.',
      privacyPoint2Title: '2. Anmeldedaten bleiben isoliert: ',
      privacyPoint2:
        'App-Token und User-ID werden mit keinem Dritten geteilt, und ein KI-Export anonymisiert sie unumkehrbar.',
      privacyPoint3Title: '3. Ort unter Kontrolle: ',
      privacyPoint3:
        'GPS-Koordinaten gehen standardmäßig nie in die KI-Zwischenablage – dein Zuhause und deine üblichen Strecken bleiben privat.',
      privacyPoint4Title: '4. Fehlerberichte entscheidest du: ',
      privacyPoint4:
        'erst nachdem du „Fehlerbericht senden" gedrückt und bestätigt hast, geht eine feste Whitelist produktbezogener Diagnosen raus. Nie gehen dein Konto, Geräte-IDs, Trainingsdetails oder Gesundheitsdaten raus, und es wird nie ein GitHub-Issue für dich geöffnet.',
      privacyPoint5Title: '5. Durchgehend Open Source: ',
      privacyPoint5: 'die gesamte Codebasis ist offen, ohne versteckte Logik, die nach Hause funkt.',
      privacyModalOk: 'Verstanden',
      closeDialog: 'Dialog schließen',

      // ── Verbindungs-/Gerätezustand ──
      connExtracting: 'Anmeldedaten werden gelesen',
      connVerifying: 'Wird verifiziert',
      connWaiting: 'Warten auf Anmeldung',
      connFailed: 'Anmeldung fehlgeschlagen',
      unidentified: 'Nicht erkannt',
      unidentifiedInitial: '?',
      notProvided: 'Keine Daten',
      noRecords: 'Noch keine Einträge',
      timeUnknown: 'Zeit unbekannt',
      cloudService: 'Cloud-Dienst',
      refreshFailed: (reason: string) => `Erkennung fehlgeschlagen; auf den lokalen Cache zurückgefallen${reason}`,
      refreshFailedReason: (reason: string) => `: ${reason}`,
      refreshFailedPeriod: '.',
      refreshDone: (count: number) =>
        `Erkennung abgeschlossen; ${count} ${count === 1 ? 'physisches Gerät' : 'physische Geräte'} gefunden.`,
      refreshNoNewList: 'Es kam keine neue Geräteliste zurück; der lokale Cache wird gezeigt.',
      loginIncomplete: 'Anmeldung nicht abgeschlossen',
      loginWindowFailed: 'Das Anmeldefenster ließ sich nicht öffnen',
      loginCancelFailed: 'Die Anmeldung konnte nicht abgebrochen werden',
      harFilter: 'HAR-Datei',
      harImported: 'HAR-Datei importiert; die Anmeldedaten sind gespeichert.',
      harImportFailed: 'Der HAR-Import ist fehlgeschlagen',
      filePickerFailed: 'Die Dateiauswahl ließ sich nicht öffnen',
      fillAllFields: 'Alle Pflichtfelder ausfüllen',
      manualAuthDone: 'Manuelle Anmeldung erfolgreich; die Anmeldedaten sind gespeichert.',
      manualAuthFailed: 'Manuelle Anmeldung fehlgeschlagen',
      verifyFailed: 'Die Verifizierung kam nicht durch',
      clearAuthConfirm:
        'Von diesem Konto abmelden?\n\nNur die Anmeldedaten werden gelöscht; alles bereits Synchronisierte auf diesem Rechner bleibt.\n\nHinweis: Kontenwechsel wird noch nicht unterstützt – eine Anmeldung mit einem anderen Konto schreibt beide Konten in dieselbe lokale Bibliothek.',
      authCleared: 'Abgemeldet. Alles bereits auf diesen Rechner Synchronisierte ist noch da.',
      clearAuthFailed: 'Die Anmeldedaten konnten nicht gelöscht werden',
      reprocessed: (count: number) =>
        `Lokale Daten neu eingelesen: ${count} ${count === 1 ? 'normalisierter Eintrag' : 'normalisierte Einträge'}. Die Zeit der Cloud-Synchronisierung bleibt unverändert.`,
      reprocessFailed: 'Das Neueinlesen der lokalen Daten ist fehlgeschlagen',
      cleanupConfirm: (days: number) =>
        `Lokale Daten löschen, die älter als ${days} Tage sind? Das lässt sich nicht rückgängig machen.`,
      cleanupDone: (days: number) => `Daten älter als ${days} Tage wurden gelöscht.`,
      cleanupFailed: 'Das Löschen alter Daten ist fehlgeschlagen',
      openFolderFailed: 'Der Datenordner ließ sich nicht öffnen',
      nothingToCompact: 'Nichts zu komprimieren – die gespeicherten Rohdaten sind bereits komprimiert.',
      compactSkipped: (count: number) =>
        `, ${count} übersprungen (nach dem Komprimieren nicht kleiner oder der Abgleich stimmte nicht)`,
      compactDone: (count: number, before: string, after: string, saved: string, skipped: string) =>
        `${count} ${count === 1 ? 'Rohdatensatz' : 'Rohdatensätze'} komprimiert, ${before} → ${after}, ${saved} eingespart${skipped}.`,
      compactFailed: 'Das Komprimieren der gespeicherten Rohdaten ist fehlgeschlagen',
      retentionConfirm: (days: number) =>
        `Die nächste erfolgreiche Synchronisierung löscht lokale Daten älter als ${days} Tage, endgültig. Fortfahren?`,
      prefsSavedNoEstimate: 'Einstellungen gespeichert, aber die Speicherplatzschätzung ist derzeit nicht verfügbar',
      prefsSaved: 'Aufbewahrungs- und Nachlade-Einstellungen gespeichert.',
      prefsSaveFailed: 'Die Einstellungen konnten nicht gespeichert werden',
      syncInProgress: 'Eine Synchronisierung läuft. Nachladen, sobald sie fertig ist',
      backfillYearCap: '\nEin Jahr ist die Obergrenze; ältere Cloud-Daten kommen nicht auf diesen Rechner.',
      backfillConfirm: (days: number, low: number, high: number, extra: string) =>
        `Das Nachladen von ${days} Tagen dauert etwa ${low}–${high} Minuten (Schätzung). Lass die App offen; du kannst jederzeit abbrechen.${extra}`,
      backfillTightSpace: (message: string, days: number) =>
        `${message}\nTrotzdem ${days} Tage nachladen? Besser erst 30 Tage wählen.`,

      // ── Datenströme ──
      stream: {
        heart_rate: 'Herzfrequenz',
        sleep: 'Schlaf',
        workouts: 'Trainings',
        steps: 'Schritte',
        daily_activity: 'Tägliche Aktivität',
        stress: 'Stress',
        spo2: 'Nächtliche SpO₂-Werte',
        respiratory_rate: 'Atemfrequenz',
        hrv: 'HRV (SDNN)',
        hrv_rmssd: 'HRV (RMSSD)',
        recovery: 'Bereitschaft und Energie',
        training_load: 'Trainingsbelastung',
        vo2max: 'VO₂max',
        lactate_threshold: 'Laktatschwelle',
        pai: 'PAI',
        blood_pressure: 'Blutdruck',
        weight: 'Gewicht',
        emotion: 'Stimmung',
        food: 'Essensprotokoll (Kalorien und Makros)',
        second_heart_rate: 'Index der Herzfrequenz pro Sekunde',
        spo2_files: 'Index der SpO₂-Rohdateien pro Messung',
      },

      // ── Einheiten / Fähigkeiten ──
      unitDays: 'Tage',
      unitRecords: 'Einträge',
      capabilityNoRecords: (days: number) => `In den letzten ${days} Tagen nichts aufgezeichnet`,
      capabilityNotIngested:
        'Die Cloud hat Daten, aber lokal ist noch nichts Verwertbares gespeichert. Versuche zu synchronisieren oder nachzuladen; wenn weiterhin nichts auftaucht, braucht ihr Datenformat eventuell zusätzliche Unterstützung.',
      capabilityFoodHistoryHint: 'In der Cloud sind Ernährungseinträge vorhanden, lokal aber noch nicht. Liegen sie vor dem Zeitraum der inkrementellen Synchronisierung, synchronisiere den Verlauf für diese Daten. Falls sie dann weiter fehlen, melde das Datenformat.',
      capabilityUnsupported: 'Dein Konto oder Gerät liefert das nicht',
      capabilityNoneProbed: (days: number) => `Keine Messung in den letzten ${days} Tagen`,
      capabilityNotProbed: 'Noch nicht geprüft',
      capabilityLocal: (records: number, unit: string, latest: string) =>
        `${records} ${unit}${latest ? ` · bis ${latest}` : ''}`,
      capabilityCloud: (records: number, unit: string, latest: string) =>
        `${records} ${unit} in der Cloud${latest ? ` · bis ${latest}` : ''}`,

      // ── Fehlerbericht-Kategorien ──
      reportCategory: {
        device: {
          label: 'Ein Gerät wurde nicht erkannt',
          hint: 'das Modell ist falsch, oder es zeigt „Nicht erkannt"',
        },
        workout: {
          label: 'Ein Trainingstyp wurde nicht erkannt',
          hint: 'es erscheint als unbekanntes Training oder als falsche Sportart',
        },
        data: {
          label: 'Die Zahlen stimmen nicht',
          hint: 'etwas ist immer leer, oder weicht von der Zepp-App ab',
        },
        other: {
          label: 'Etwas anderes',
          hint: 'beschreibe es unten',
        },
      },
    },

    'App': {
      quickReturn: (page: string) => `Zurück zu ${page}`,
      navRecent: 'letzten Einträgen',
      bottomNav: 'Mobile Hauptnavigation',
      browserPreview:
        'Bitte nutze die Desktop-App. Diese Browser-Vorschau liest keine Kontodaten.',
      compacted: (saved: string) =>
        `Gespeicherte Rohdaten wurden komprimiert, rund ${saved} Plattenplatz frei.`,
      compacting: (pending: number) =>
        `Gespeicherte Rohdaten werden komprimiert (${pending} ausstehend). Das erledigt sich von selbst; die Synchronisierung wartet kurz.`,
      mainNav: 'Hauptnavigation',
      navHandoff: 'An KI übergeben',
      navOverview: 'Übersicht',
      navSettings: 'Einstellungen',
      preparingData:
        'Die lokale Datenbank wird geöffnet – der erste Start nach einem Update kann ein paar Sekunden dauern…',
      routeNotFound: 'Diese Seite existiert nicht – du bist wieder auf der Übersicht.',
      skipToContent: 'Zum Hauptinhalt springen',
      trayHint:
        'Nach dem Schließen des Fensters läuft ZeppBridge im Infobereich weiter, die automatische Synchronisierung geht also weiter.',
    },
    'components/BackupPanel': {
      blockerFutureSchema: (backup: number, current: number) =>
        `Dieses Backup stammt aus einem neueren ZeppBridge (Schema ${backup}, diese App hat ${current}). Es hier zu öffnen würde Felder verlieren, also wird es nicht wiederhergestellt und die aktuelle Bibliothek bleibt unangetastet. Aktualisiere zuerst ZeppBridge.`,
      blockerUnknown:
        'Dieser Snapshot kann gerade nicht wiederhergestellt werden; ein Grund wurde nicht aufgezeichnet.',
      cancel: 'Abbrechen',
      cancelFailed: 'Die Wiederherstellung ließ sich nicht abbrechen',
      cancelRestore: 'Wiederherstellung abbrechen',
      cancelled:
        'Die vorgemerkte Wiederherstellung wurde abgebrochen. Die Datenbank bleibt unverändert.',
      colBackup: 'Im Snapshot',
      colContent: 'Inhalt',
      colCurrent: 'Aktuell',
      colDelta: 'Differenz',
      compareExchange:
        ' ist Datenaustausch für andere Werkzeuge und enthält nur den gewählten Zeitraum; ',
      compareLead:
        'Drei Dinge heißen hier „Export" und sind nicht dasselbe: ',
      comparePack:
        ' ist Material, das du bewusst auswählst und für ein externes Modell anonymisierst. Nur ein Snapshot versetzt die Datenbank in den früheren Zustand zurück.',
      comparePackName: 'ein KI-Paket',
      compareSnapshot:
        ' ist eine Komplettkopie der Datenbank für den Notfall, die nur ZeppBridge zurücklesen kann; ',
      compareSnapshotName: 'ein Datenbank-Snapshot',
      compatibility: {
        future_schema_refused:
          'Der Snapshot stammt aus einer neueren App-Version, deren Aufbau diese App nicht lesen kann – keine Wiederherstellung möglich.',
        older_schema_will_migrate:
          'Der Snapshot stammt aus einer älteren Schema-Version. Nach der Wiederherstellung aktualisiert er sich beim nächsten Start selbst.',
        same_schema:
          'Der Snapshot hat dieselbe Schema-Version wie diese App und lässt sich direkt wiederherstellen.',
      },
      compatibilityUnknown: 'Kompatibilität unbekannt.',
      coverage: (from: string, to: string) => ` · Messwerte ${from} ~ ${to}`,
      createFailed: 'Der Snapshot konnte nicht erstellt werden',
      createSnapshot: 'Snapshot erstellen',
      created: (size: string) =>
        `Snapshot erstellt: ${size}, Integritätsprüfung bestanden.`,
      creating: 'Wird erstellt…',
      integrityBad:
        'Die Integritätsprüfung ist bei der Erstellung fehlgeschlagen – nicht zum Wiederherstellen verwenden.',
      integrityOk: (sha: string) =>
        `Integritätsprüfung bei der Erstellung bestanden · SHA-256 ${sha}…`,
      intro1a: 'Ein Snapshot ist eine vollständige Kopie der gesamten ',
      intro1b:
        '-Datei. Sie bleibt auf diesem Rechner und wird nirgendwo hochgeladen. Vor einem Datenbank-Upgrade wird automatisch einer angelegt, und du kannst jederzeit selbst einen erstellen.',
      kind: {
        manual: 'manuell',
        pre_migration: 'vor dem Upgrade',
        pre_restore: 'Rollback-Punkt',
      },
      listFailed: 'Die Snapshot-Liste konnte nicht gelesen werden',
      metaLine: (size: string, appVersion: string, schemaVersion: number) =>
        `${size} · App ${appVersion} · Schema ${schemaVersion}`,
      noSamples: ' · keine Gesundheitsmesswerte in diesem Snapshot',
      noSnapshots: 'Noch keine Snapshots.',
      pendingBodyA: (stagedAt: string) =>
        `Vorgemerkt am ${stagedAt}. Die Datenbank wird beim `,
      pendingBodyB:
        ' ersetzt. Die aktuelle Datenbank liegt bereits als Rollback-Punkt bereit, sodass du dahin zurückkehren kannst.',
      pendingNextStart: 'nächsten Start',
      pendingTitle: 'Eine Wiederherstellung ist vorgemerkt',
      pin: 'Behalten',
      pinFailed: 'Die Behalten-Markierung ließ sich nicht ändern',
      pinned: 'Behalten',
      previewFailed: 'Die Wiederherstellungs-Vorschau konnte nicht erstellt werden',
      previewNote:
        'Zeilen mit negativer Differenz enthalten nach der Wiederherstellung entsprechend weniger Einträge. Eine Wiederherstellung holt nichts erneut aus der Cloud – brauchst du diese Daten noch, synchronisiere danach einmal.',
      previewTitle: 'Wiederherstellungs-Vorschau',
      problemFileMissing: 'Die Sicherungsdatei ist nicht mehr im Sicherungsordner',
      problemIntegrityFailed:
        'Die Sicherungsdatei hat die SQLite-Integritätsprüfung nicht bestanden',
      problemSha256Mismatch:
        'Der SHA-256 der Sicherungsdatei stimmt nicht mit dem Manifest überein – sie könnte beschädigt oder verändert sein',
      problemSizeMismatch:
        'Die Größe der Sicherungsdatei stimmt nicht mit dem Manifest überein – sie könnte beschädigt sein',
      problemUnknown:
        'Dieser Snapshot hat die Prüfung nicht bestanden; ein Grund wurde nicht aufgezeichnet.',
      refreshList: 'Aktualisieren',
      restoreToThis: 'Auf diesen zurücksetzen',
      stageFailed: 'Die Wiederherstellung ließ sich nicht vormerken',
      stageRestore: 'Wiederherstellung vormerken (wirkt beim nächsten Start)',
      staged:
        'Die Wiederherstellung ist vorgemerkt. In diesem Lauf ändert sich nichts; die Datenbank wird beim nächsten Start von ZeppBridge ersetzt.',
      staging: 'Wird vorgemerkt…',
      table: {
        daily_metrics: 'Tagesmetriken',
        life_events: 'Lebensereignisse',
        metric_samples: 'Metrik-Messwerte',
        raw_records: 'Rohdatensätze',
        sleep_sessions: 'Schlaf',
        workout_samples: 'Trainings-Messpunkte',
        workouts: 'Trainings',
      },
      title: 'Datenbank-Snapshots und Wiederherstellung',
      unpin: 'Nicht mehr behalten',
      verifyAgain: 'Erneut prüfen',
      verifyError: 'Die Prüfung ist fehlgeschlagen',
      verifyFailed: (problem: string) => `Prüfung nicht bestanden: ${problem}`,
      verifyPassed:
        'Gerade erneut geprüft: Datei, Größe, SHA-256 und Integrität stimmen überein.',
    },
    'components/CoverageNotice': {
      backfill: 'Mehr Historie nachladen',
      backfilling: 'Nachladen läuft…',
      empty:
        'Auf diesem Rechner ist noch nichts. Einmal synchronisieren, dann haben die Diagramme etwas zum Zeichnen.',
      emptyAfterSync:
        'Die Synchronisierung lief durch, brachte aber nichts zurück. Entweder hat dieses Konto für diesen Zeitraum keine Daten bei Zepp, oder die Uhr hat noch nicht in die Zepp-App hochgeladen. Prüfe zuerst in der Zepp-App auf dem Telefon, ob dort Daten sind, und synchronisiere dann hier erneut.',
      emptyUnconfirmedRegion:
        'Die Synchronisierung lief durch, brachte aber nichts zurück. Bei der Anmeldung konnte nicht bestätigt werden, zu welcher Zepp-Region dein Konto gehört – ZeppBridge nutzt gerade die beste Schätzung, und eine Synchronisierung gegen die falsche Region sieht genau so aus: sie läuft erfolgreich und liefert nichts. Verbinde das Konto erneut und versuche es noch einmal.',
      reconnect: 'Konto erneut verbinden',
      short: (covered: number, earliest: string) =>
        `Dieser Rechner hat ${covered} Tage Daten (früheste ${earliest}). Alles davor ist leer, weil es noch nicht aus der Cloud geholt wurde – nicht weil du damals nichts aufgezeichnet hast.`,
      syncNow: 'Jetzt synchronisieren',
    },
    'components/DatePicker': {
      aria: 'Wähle ein Datum',
      next: 'Nächster Monat',
      placeholder: 'Datum wählen',
      prev: 'Voriger Monat',
    },
    'components/DeviceMarquee': {
      marqueeAria: 'Derzeit im Katalog geführte Amazfit-Geräte',
    },
    'components/DevicePicker': {
      alreadyAssigned: 'Bereits dieses',
      clear: 'Auswahl zurücknehmen',
      confirm: 'Das ist mein Gerät',
      contributeBody:
        'Sendet an ZeppBridge das von dir gewählte Modell plus die Modellnummern dieses Geräts (deviceSource / deviceType, nur Ganzzahlen). Beides sagt nur, welche Uhr es ist – nichts weiter: kein Konto, keine Seriennummer, keine MAC, keine Gesundheitsdaten. Huami veröffentlicht keine Zuordnungstabelle für diese Nummern, deshalb wächst der eingebaute Katalog nur so. Sobald ein paar Leute auf ein Modell gezeigt haben, wird es für alle automatisch erkannt.',
      contributeTitle: 'Hilf der nächsten Version, dieses Gerät selbst zu erkennen',
      empty:
        'Kein Modell passt. Versuche ein anderes Stichwort oder stelle den Filter zurück auf „Alle".',
      filterAll: 'Alle',
      filterBand: 'Fitnessbänder',
      filterEarbuds: 'Ohrhörer',
      filterRing: 'Ringe',
      filterStrap: 'Gurte',
      filterWatch: 'Uhren',
      later: 'Nicht jetzt',
      next: 'Nächstes Modell',
      note:
        'Deine Auswahl erscheint als „Von dir gewähltes Modell" und wird nie als automatische Zuordnung ausgegeben. Bilder und Modellnamen kommen aus dem mitgelieferten Katalog; das Blättern braucht kein Netz.',
      pickerAria: 'Gerätemodell von Hand auswählen',
      prev: 'Voriges Modell',
      searchAria: 'Nach Modellname suchen',
      searchPlaceholder: 'Modell suchen, z. B. Balance 2',
    },
    'components/DeviceVisual': {
      band: 'Fitnessband',
      earbuds: 'Ohrhörer',
      ring: 'Ring',
      scale: 'Waage',
      strap: 'Gurt',
      unknown: 'Gerät',
      watch: 'Uhr',
    },
    'components/HeartRateZonePicker': {
      basesSeparator: ', ',
      basis: {
        computed_resting: {
          label: 'Lokal berechnete Ruheherzfrequenz',
          note: '' as string,
        },
        device_max: {
          label: 'Von der Uhr gemeldete maximale Herzfrequenz',
          note: 'Was die Uhr in ihren PAI-Daten meldet – meist aus deinem Zepp-App-Profil übernommen.',
        },
        device_resting: {
          label: 'Von der Uhr gemeldete Ruheherzfrequenz',
          note: 'Was die Uhr in ihren PAI-Daten meldet.',
        },
        lactate_threshold: {
          label: 'Laktatschwellen-Herzfrequenz',
          note: 'Von der Uhr nach einem harten Lauf gemessen.',
        },
        observed_max: {
          label: 'Höchste aufgezeichnete Herzfrequenz',
          note: 'Die höchste lokal aufgezeichnete Herzfrequenz. Warst du nie an einem echten Limit, fallen die Zonen schmal aus.',
        },
      },
      clearChoice: 'Auswahl aufheben',
      computedRestingNote: (days: number) =>
        `Durchschnitt der ${days} Tage mit Daten aus den letzten 30.`,
      desktopOnly:
        'Öffne dies in der ZeppBridge-Desktop-App; Herzfrequenzzonen lesen lokale Einträge.',
      durationHours: (hours: number, minutes: number) => `${hours} Std. ${minutes} Min.`,
      durationMinutes: (minutes: number) => `${minutes} Min.`,
      formulaNote: (formula: string, bases: string) =>
        `${formula}. Grenzen werden abgerundet, wie auf der Uhr. Basen: ${bases}`,
      intro:
        'Die drei Modelle zeichnen unterschiedliche Zonen, und nur du weißt, welches für dich etwas bedeutet – darum wählt ZeppBridge keinen Standard und schätzt nie mit einer Formel wie 220 minus Alter. Jede Basis unten trägt ihre Quelle und das Datum ihrer Messung.',
      kind: {
        max_hr: 'Basis max. Herzfrequenz',
        resting_hr: 'Basis Ruheherzfrequenz',
        threshold_hr: 'Basis Schwellen-Herzfrequenz',
      },
      missingBases: (list: string) => `Noch nicht auf diesem Rechner: ${list}`,
      model: {
        hr_reserve: {
          formula: 'Zonenuntergrenze = Ruheherzfrequenz + (max. Herzfrequenz − Ruheherzfrequenz) × Prozentsatz',
          label: 'Herzfrequenzreserve-Zonen',
        },
        lactate_threshold: {
          formula: 'Zonenuntergrenze = Schwellen-Herzfrequenz × Prozentsatz',
          label: 'Laktatschwellen-Zonen',
        },
        max_hr: {
          formula: 'Zonenuntergrenze = max. Herzfrequenz × Prozentsatz',
          label: 'Zonen nach maximaler Herzfrequenz',
        },
      },
      modelAria: 'Herzfrequenzzonen-Modell',
      modelGroup: 'Modell',
      noBases:
        'Noch keine Herzfrequenz-Basis auf diesem Rechner. Nach einer Trainingssynchronisierung erscheinen hier Messwerte wie deine höchste aufgezeichnete Herzfrequenz.',
      outside: (below: string, above: string) =>
        `Außerhalb der Zonen: unter Z1 ${below} · über Z5 ${above}`,
      percentBands: ['Aufwärmen', 'Fettverbrennung', 'Aerob', 'Anaerob', 'Maximum'],
      pickBasesNext:
        'Wähle oben die restlichen Basen, um die Zonen und die Zeit in jeder Zone zu bekommen.',
      pickModelFirst:
        'Wähle ein Modell, und die Zonen werden aus den von dir gewählten Basen berechnet.',
      saveFailed: 'Die Herzfrequenzzonen-Einstellungen konnten nicht gespeichert werden',
      thresholdBands: ['Leicht', 'Ausdauer', 'Tempo', 'Schwelle', 'Anaerob'],
      title: 'Herzfrequenzzonen',
      window: (days: number, total: string) =>
        `Sekundengenaue Trainings-Herzfrequenz über ${days} Tage · ${total} insgesamt`,
      zeroMinutes: '0 Min.',
      zonesUnavailable: 'Herzfrequenzzonen sind gerade nicht verfügbar',
    },
    'components/HistoryArchivePanel': {
      allChunksDone: 'Jeder Monatsblock im Abdeckungsprotokoll ist erledigt.',
      archiveAria: 'Langzeitarchiv',
      archiveBody:
        'Ist es an, räumt eine erfolgreiche Synchronisierung die Historie nicht mehr nach der Aufbewahrungsfrist ab. Die Datenbank wächst weiter; du kannst es jederzeit ausschalten – beim Ausschalten erfährst du, was die nächste Synchronisierung aufräumen würde.',
      archiveDisabled:
        'Langzeitarchiv aus: Die nächste erfolgreiche Synchronisierung räumt nach der Aufbewahrungsfrist auf.',
      archiveEnabled:
        'Langzeitarchiv an: Erfolgreiche Synchronisierungen räumen die Historie nicht mehr auf.',
      archiveSaveFailed: 'Die Archiv-Einstellung konnte nicht gespeichert werden',
      archiveTitle: 'Langzeitarchiv',
      autoContinue: 'Bis zum Ende durchlaufen',
      autoContinueHint:
        'Jede Runde startet automatisch die nächste, bis der ganze Zeitraum nachgeladen ist. Stoppe, wann du willst – bereits Geholtes geht nicht verloren.',
      backfillFailed: 'Das Nachladen der Historie ist fehlgeschlagen',
      backfilling: 'Nachladen läuft…',
      confirmDisableArchive:
        'Mit ausgeschaltetem Langzeitarchiv räumt die nächste erfolgreiche Synchronisierung ältere Daten nach der Aufbewahrungsfrist ab – das lässt sich nicht rückgängig machen.\nHast du gerade Historie nachgeladen, lege zuerst einen Datenbank-Snapshot an.\nAusschalten?',
      confirmResetLedger:
        'Das löscht nur das Abdeckungsprotokoll. Lokal Geschriebenes wird nicht gelöscht, und danach kannst du ein neues Nachladen planen. Fortfahren?',
      continueBackfill: 'Weiter nachladen',
      customDateAria: 'Startdatum des Nachladens',
      customDateLabel: 'Startdatum',
      deferredRetry: 'Lokale Wartung läuft. Das Nachladen geht von selbst weiter',
      estimateRate: (days: number, perDay: string) =>
        `${days} Tage lokale Messwerte · ca. ${perDay}/Tag`,
      estimateTitle: 'Geschätzter Zuwachs',
      failedAttempts: (attempts: number) =>
        plural(attempts, {
          one: `${attempts} Versuch`,
          other: `${attempts} Versuche`,
        }),
      failedExhausted:
        'Die automatischen Wiederholungen sind aufgebraucht. Nutze „Fehlgeschlagene Monate erneut versuchen"',
      failedIntro:
        'Diese Blöcke sind fehlgeschlagen. Alle anderen Monate waren unbetroffen und wurden wie üblich nachgeladen.',
      failedNoReason: 'Kein Grund aufgezeichnet',
      failedRow: (stream: string, month: string) => `${stream} · ${month}`,
      failedTitle: 'Monate, die nicht geholt werden konnten',
      intro:
        'Das Archiv deckt „ab heute nichts mehr löschen" ab, das Nachladen deckt „hole, was früher war". Erst mit beidem ist die lokale Kopie wirklich vollständig.',
      ledgerComplete:
        'Jeder Monatsblock im Protokoll ist erledigt: entweder lokal geschrieben, oder die Cloud hat klar gesagt, dass sie für diesen Zeitraum nichts hat.',
      ledgerFailed: (failed: number) => `${failed} fehlgeschlagen`,
      ledgerFrom: (from: string) => ` · angefragt ab ${from}`,
      ledgerIncomplete: (remaining: number) =>
        `${remaining} Blöcke sind noch ungeklärt. Bis alle fertig sind, ist diese lokale Kopie eine Kopie des erfolgreich synchronisierten Bereichs – keine vollständige.`,
      ledgerNothingWritten: 'Noch kein Monat geschrieben',
      ledgerProgress: (done: number, total: number) =>
        `${done} von ${total} Monatsblöcken erledigt`,
      ledgerRange: (from: string, to: string, records: number) =>
        `${from} ~ ${to} · ${records} Einträge`,
      ledgerReset:
        'Das Protokoll ist geleert. Du kannst einen neuen Nachlade-Zeitraum planen.',
      ledgerResetFailed: 'Das Protokoll ließ sich nicht leeren',
      ledgerStats: (persisted: number, empty: number, pending: number) =>
        `${persisted} geschrieben · ${empty} leer aus der Cloud · ${pending} ausstehend`,
      ledgerTitle: 'Abdeckungsprotokoll',
      outOfRetention:
        'Dieses Nachladen reicht über die lokale Aufbewahrungsfrist hinaus – was zurückkommt, würde bei der nächsten erfolgreichen Synchronisierung aufgeräumt. Schalte zuerst das Langzeitarchiv ein oder verlängere die Aufbewahrungsfrist.',
      pickStartFirst: 'Wähle zuerst, wo das Nachladen beginnt.',
      range1y: 'Letztes Jahr',
      range2y: 'Letzte 2 Jahre',
      range3y: 'Letzte 3 Jahre',
      rangeAll: (years: number) =>
        `Gesamte verfügbare Historie (bis zu ${years} Jahre)`,
      rangeCustom: 'Eigener Start',
      resetLedger: 'Protokoll leeren',
      retryFailed: 'Fehlgeschlagene Monate erneut versuchen',
      retryFailedDone:
        'Die fehlgeschlagenen Monate sind wieder eingereiht. Du kannst weiter nachladen.',
      retryFailedFailed: 'Die fehlgeschlagenen Monate ließen sich nicht wieder einreihen',
      roundDone: (remaining: number) =>
        `Diese Runde ist fertig; ${remaining} Monatsblöcke bleiben. Drücke „Weiter nachladen", um fortzufahren – du kannst jederzeit stoppen.`,
      roundProgress: (done: number, total: number) =>
        `Nachladen: ${done} von ${total} Monatsblöcken fertig. Du kannst jederzeit stoppen.`,
      stalled: (remaining: number) =>
        `${remaining} Monatsblöcke bleiben, aber diese Runde hat keinen vorangebracht und wurde gestoppt. Vermutlich scheitern diese Blöcke wiederholt – sieh dir die Fehlerliste unten an oder drücke „Fehlgeschlagene Monate erneut versuchen".`,
      startAria: 'Start des Historie-Nachladens',
      startBackfill: 'Nachladen starten',
      startLabel: 'Nachladen ab',
      stopBackfill: 'Stopp',
      stoppedByUser: (remaining: number) =>
        `Gestoppt, ${remaining} Monatsblöcke bleiben. Alles bereits Geholte bleibt – drücke „Weiter nachladen", um fortzufahren.`,
      stopping: 'Wird gestoppt…',
      stream: {
        daily_summary: 'Tagesübersichten',
        heart_rate: 'Herzfrequenz',
        hrv: 'Herzfrequenzvariabilität',
        sleep: 'Schlaf',
        wellness: 'Stress / SpO₂ und Ähnliches',
        workouts: 'Trainings',
      },
      streamSeparator: ', ',
      title: 'Langzeitarchiv und vollständige Historie',
      unmeasured: (streams: string) =>
        `Zu wenig lokale Messwerte für eine Schätzung: ${streams}. Diese zählen nicht in die Summe oben – lieber „wir wissen es nicht" sagen als eine Rate zu erfinden und sie über Jahre zu multiplizieren.`,
      wouldBeCleanedUp: (requested: number, retention: number) =>
        `Dieses Nachladen würde ${requested} Tage Historie holen, aber dieser Rechner behält nur die letzten ${retention} Tage – was zurückkommt, würde bei der nächsten erfolgreichen Synchronisierung gelöscht. Schalte zuerst das Langzeitarchiv ein oder verlängere die Aufbewahrungsfrist.`,
    },
    'components/InsightCard': {
      baselinePrefix: (value: string, delta: string) => `Baseline ${value} · ${delta}`,
      baselineRule: (days: number, tolerance: number | undefined, min: number, max: number) =>
        `Die Regel: Läufe derselben Art aus den letzten ${days} Tagen, deren Distanz um höchstens ±${tolerance ?? '—'} % von dieser abweicht, mindestens ${min}, höchstens ${max} davon.`,
      baselineRun: 'Baseline',
      baselineSummary: 'Woher die Baseline kommt',
      comparedTo: (count: number) =>
        `Verglichen mit deinen ${count} letzten Läufen ähnlicher Distanz:`,
      confidence: {
        high: 'Gut belegt',
        insufficient: 'Zu wenig Belege',
        low: 'Dünne Belege',
        medium: 'Etwas belegt',
      },
      currentRun: 'Dieser Lauf',
      driftDelta: (percent: string) => `${percent} %`,
      driftFalling: 'Jeder Schlag hat dich in der zweiten Hälfte weiter getragen.',
      driftFirst: 'Erste Hälfte',
      driftFlat: 'Beide Hälften sind praktisch gleich.',
      driftHrSpeed: (hr: number, pace: string) => `${hr} bpm · ${pace}`,
      driftNote:
        'Das vergleicht das Training nur mit sich selbst, nie mit anderen. Ampeln, Steigungen, Intervalle und GPS-Drift verfälschen es, deshalb gibt es keine Zahl, wenn das Tempo nicht ruhig war.',
      driftPerBeat: (metres: string) => `${metres} m/Schlag`,
      driftRising: 'In der zweiten Hälfte kostete dasselbe Tempo mehr Schläge.',
      driftSecond: 'Zweite Hälfte',
      driftSub:
        'Teilt dieses Training zeitlich in zwei Hälften und vergleicht, wie viele Schläge dasselbe Tempo jeweils kostete.',
      driftTitle: 'Erste vs. zweite Hälfte',
      driftUnavailable: (code: string) =>
        (({
          too_short:
            'Zu kurz zum Halbieren. In den ersten zehn Minuten klettert die Herzfrequenz noch – sie mit der zweiten Hälfte zu vergleichen misst das Aufwärmen, nicht die Drift.',
          pace_too_variable:
            'Das Tempo schwankte zu stark (Intervalle, Ampeln oder Steigungen sehen alle so aus), also sind die beiden Hälften nicht vergleichbar und es gibt keine Zahl.',
          not_enough_samples:
            'Zu wenige Herzfrequenz- und Tempo-Messpunkte in diesem Training, um es zu halbieren.',
          unsupported_workout_type:
            'Der Vergleich erster/zweiter Hälfte deckt vorerst nur Laufen ab. Gehen und Radfahren liefern genug Messpunkte, aber die Schwellen wurden noch nicht an echten Daten geprüft.',
        }) as Record<string, string | undefined>)[code] ?? 'Dieses Training lässt sich nicht halbieren.',
      durationHours: (hours: number, minutes: number) => `${hours} Std. ${minutes} Min.`,
      durationMinutes: (minutes: number) => `${minutes} Min.`,
      excludedItem: (label: string, count: number) => `${label} ×${count} `,
      excludedPrefix: 'Ausgenommen: ',
      exclusion: {
        beyond_max_samples: 'über der Messpunkt-Obergrenze',
        distance_out_of_tolerance: 'Distanz zu unterschiedlich',
        implausible_pace: 'unplausibles Tempo',
        missing_distance: 'keine Distanz',
        missing_duration: 'keine Dauer',
      },
      footnote:
        'Alle Schlüsse hier vergleichen dich mit deiner eigenen Historie – nie mit einem Bevölkerungsmaßstab – und nichts davon ist eine medizinische Beurteilung. Fehlende Daten stehen als „Nicht angegeben" da, statt mit einer Null gefüllt zu werden.',
      handoff: 'KI vertiefen lassen',
      metric: {
        'run.avg_hr': 'Ø HF',
        'run.distance': 'Distanz',
        'run.duration': 'Zeit',
        'run.pace': 'Ø Tempo',
        'run.training_load': 'Trainingsbelastung',
      },
      noComparison:
        'Noch nicht genug vergleichbare Historie – dieser Lauf meldet seine Zahlen ohne Vergleich.',
      notProvided: 'Nicht angegeben',
      reading: 'Lokale Einträge werden gelesen…',
      title: 'Wie der Lauf lief',
      unsupportedWorkoutType:
        'Einblicke für diese Trainingsart werden noch nicht unterstützt. Die erste Version deckt nur Laufen ab, weil nur das an echten Daten geprüft wurde. Jedes andere Training lässt sich trotzdem normal ansehen, korrigieren und exportieren.',
    },
    'components/MetricTrendCard': {
      average: 'Ø',
      defaultEmpty:
        'Diese Metrik zeigt ihren Trend, sobald sie synchronisiert wurde.',
      latestTag: 'Neueste',
      maximum: 'Max.',
      measuredOn: (date: string) => `gemessen am ${date}`,
      minimum: 'Min.',
      onlyOneDay:
        'Nur ein Tag mit Daten in diesem Zeitraum – es gibt noch keinen Trend zu zeichnen.',
      trendAria: (label: string) => `${label}-Trendlinie`,
    },
    'components/SelectMenu': {
      placeholder: 'Auswählen…',
    },
    'components/StageBar': {
      hypnogramAria: 'Hypnogramm der Schlafphasen',
      notProvided: 'Nicht angegeben',
      summaryAria: 'Anteil der Schlafphasen',
      zeroMinutes: '0 Min.',
    },
    'components/WeeklyReportCard': {
      barBaseline: '28 Tage davor',
      barThisWeek: 'Diese Woche',
      barsAria: (recent: string, baseline: string) =>
        `Diese Woche ${recent}, 28 Tage davor ${baseline}`,
      baselineCountUnknown:
        'Baseline-Tage unbekannt – dies ist der aktuelle Wert ohne Vergleich.',
      desktopOnly: 'Der Wochenbericht braucht die ZeppBridge-Desktop-App.',
      legendBad: 'Rot = schlechter',
      legendGood: 'Grün = besser für diese Metrik',
      legendNote:
        'Nur mit deinen eigenen 28 Tagen davor verglichen, nie mit einem Bevölkerungsmaßstab',
      loadFailed: 'Der lokale Wochenbericht konnte nicht erstellt werden',
      metric: {
        'weekly.hrv': 'HRV',
        'weekly.resting_hr': 'Ruheherzfrequenz',
        'weekly.sleep_duration': 'Schlafdauer',
        'weekly.sleep_start_regularity': 'Einschlafzeit-Streuung',
        'weekly.stress': 'Stress',
        'weekly.training_load': 'Trainingsbelastung',
        'weekly.workout_count': 'Trainings',
      },
      noBaseline: 'Zu wenig Historie – dies ist nur der aktuelle Wert',
      noRecentData: 'In den letzten 7 Tagen lokal nichts zu dieser Metrik aufgezeichnet.',
      notProvided: 'Nicht angegeben',
      nothingComparable:
        'Diese Woche noch nichts Vergleichbares. Schau nach einer Synchronisierung wieder vorbei.',
      regularity: (minutes: number) => `±${minutes} Min.`,
      sleepDuration: (hours: number, minutes: number) => `${hours} Std. ${minutes} Min.`,
      thinBaseline: (days: number, found: number, needed: number) =>
        `Nur ${found} der letzten ${days} Tage tragen diese Metrik – weniger als die nötigen ${needed} – also nur der aktuelle Wert ohne Vergleich.`,
      title: 'Diese Woche',
      unitWord: (unit: string) =>
        (({
          score: 'Pkt.',
          load: '',
          bpm: 'bpm',
        }) as Record<string, string | undefined>)[unit] ?? unit,
      window: (recentStart: string, recentEnd: string, baseStart: string, baseEnd: string) =>
        `${recentStart} ~ ${recentEnd} · gegen deine eigenen ${baseStart} ~ ${baseEnd}`,
      workoutCount: (count: number) =>
        plural(count, {
          one: `${count} Einheit`,
          other: `${count} Einheiten`,
        }),
      zeroBaseline:
        'Die frühere Baseline lag im Schnitt bei 0 – keine relative Änderung berechenbar, also nur der aktuelle Wert.',
    },
    'components/overview/HeartRateCard': {
      bpm: 'bpm',
      hrChartAria: '24-Stunden-Herzfrequenzkurve',
      hrEmpty: 'Nach einer Synchronisierung zeigt sich hier der echte Herzfrequenzverlauf.',
      hrMore: 'Volle 24 Stunden',
      hrPanelAria: 'Herzfrequenz-Details für die vollen 24 Stunden öffnen',
      hrTitle: 'Aktuelle Herzfrequenz',
      hrTooltip: (clock: string, value: number) => `${clock}　<b>${value}</b> bpm`,
      hrWindow: (hours: number) => `Letzte ${hours} Stunden`,
      hrZonesAria: 'Herzfrequenzzonen (absolute Schwellen)',
      latest: 'Neueste',
      zoneAerobic: 'Aerob 140–169',
      zoneAnaerobic: 'Anaerob 170+',
      zoneFat: 'Fettverbrennung 100–139',
      zoneRest: 'Ruhe 0–99',
    },
    'components/overview/RecentCard': {
      avgHr: (value: number) => `Ø HF ${value}`,
      recentAria: 'Letzte Einträge',
      recentEmpty:
        'Noch nichts aufgezeichnet. Führe eine Synchronisierung aus, dann erscheint es hier.',
      recentSub: 'Schlaf, Läufe und Krafttraining',
      recentTitle: 'Letzte Einträge',
      seeAll: 'Alle ansehen',
      sleepRecordTitle: 'Schlaf',
      sleepScore: (score: number) => `Schlafscore ${score}`,
      timeUnknown: 'Zeit unbekannt',
    },
    'components/overview/SleepCard': {
      durationHours: (hours: number, minutes: number) => `${hours} Std. ${minutes} Min.`,
      durationMinutes: (minutes: number) => `${minutes} Min.`,
      seeMore: 'Mehr anzeigen',
      sleepBarAria: 'Anteil der Schlafphasen',
      sleepEmpty:
        'Der Schlaf der letzten Nacht erscheint hier nach einer Synchronisierung.',
      sleepPanelAria: 'Schlafdetails öffnen',
      sleepSub: 'Schlafstruktur im Überblick',
      sleepTitle: 'Letzte Nacht',
    },
    'components/overview/SourcesStrip': {
      dataSources: 'Datenquellen',
      identifyFailed: (reason: string) => `Geräteerkennung ist nicht verfügbar: ${reason}`,
      identifyingDevices: 'Deine Geräte werden erkannt…',
      manage: 'Verwalten',
      noDevicesYet: 'Noch kein Gerät erkannt.',
      sourcesAria: 'Datenquellen und Kontostatus',
    },
    'components/overview/StepsCard': {
      seeMore: 'Mehr anzeigen',
      stepsGoalLine: (goal: string, percent: string) => `Ziel ${goal} · ${percent} %`,
      stepsGoalReference: 'Referenzziel',
      stepsGoalToday: 'Heutiges Ziel',
      stepsPanelAria: 'Details zur täglichen Aktivität öffnen',
      stepsTitle: 'Schritte heute',
      stepsUnit: 'Schritte',
    },
    'components/shell/AppTopBar': {
      brandHome: 'ZeppBridge 3 · Übersicht',
      cancel: 'Abbrechen',
      connectionTitle: 'Cloud-Verbindungsstatus',
      lastSyncPrefix: 'Letzte Synchronisierung: ',
      localeLabel: 'Oberflächensprache',
      mainNav: 'Hauptnavigation',
      notFetchedYet: 'Noch nicht abgerufen',
      syncFailed: 'Synchronisierung fehlgeschlagen',
      syncNow: 'Jetzt synchronisieren',
      syncPartial: 'Teilweise synchronisiert',
      syncing: 'Synchronisierung läuft…',
      themeDark: 'Dunkel',
      themeLight: 'Hell',
      themeSystem: 'System',
      themeTitle: 'Theme wechseln',
      timeUnknown: 'Zeit unbekannt',
      verifyFirst: 'Verifiziere zuerst die Verbindung',
    },
    'composables/useAiHandoff': {
      clipboardUnsupported: 'Diese Umgebung kann nicht in die Zwischenablage schreiben',
      copiedButCannotOpen: (label: string) => `Kopiert, aber ${label} ließ sich nicht öffnen`,
      handoffFailed: 'Die KI-Übergabe ist nicht durchgekommen',
      nothingToRetry: 'Es gibt keine KI-Übergabe zu wiederholen',
      targetNotAllowed: 'Diese KI-Adresse steht nicht auf der Freigabeliste',
    },
    'composables/useAiTaskDraft': {
      deleteFailed: 'Die Aufgabe konnte nicht gelöscht werden',
      loadFailed: 'Die Aufgabe konnte nicht geladen werden',
      saveFailed: 'Die Aufgabe konnte nicht gespeichert werden',
      untitled: 'Unbenannte Aufgabe',
    },
    'composables/useAiTaskHandoff': {
      copyFailed: 'Der Prompt konnte nicht kopiert werden',
      openFailed: 'Die KI-Seite ließ sich nicht öffnen',
      prepareFailed: 'Die Dateien konnten nicht vorbereitet werden',
    },
    'composables/useDevices': {
      assignmentCleared: 'Auswahl zurückgenommen. Wieder die automatische Zuordnung.',
      assignmentContributed: (reportId: string) =>
        `Deine Modellauswahl ist gespeichert, und die Modellnummern gingen an ZeppBridge (Bericht ${reportId}). Die nächste Katalogversion erkennt dieses Modell von selbst.`,
      assignmentContributionFailed: (reason: string) =>
        `Deine Modellauswahl ist auf diesem Rechner gespeichert. Der Katalogbeitrag konnte nicht gesendet werden: ${reason}`,
      assignmentFailed: 'Die Modellauswahl konnte nicht gespeichert werden',
      assignmentSaved:
        'Deine Auswahl ist gespeichert. Sie erscheint als „Von dir gewähltes Modell" – nie als automatische Zuordnung.',
      cacheUnavailable: 'Der Geräte-Cache ist gerade nicht verfügbar',
      identifyUnavailable: 'Die Geräteerkennung ist gerade nicht verfügbar',
      networkUnavailable: 'Netzwerk nicht verfügbar',
      noLocalIdentifier:
        'Dieses Gerät trägt keine lokale Kennung, die Auswahl lässt sich nicht speichern.',
      notFetchedYet: 'Noch nicht abgerufen',
      notProvided: 'Nicht angegeben',
      stateAccount: 'Aus dem Konto bekannt',
      stateCached: 'Aus dem Cache',
      stateRecentData: 'Hat aktuelle Daten',
      stateUnknown: 'Nicht erkannt',
      stateUserAssigned: 'Von dir gewähltes Modell',
      timeUnknown: 'Zeit unbekannt',
      unidentifiedDevice: 'Nicht erkanntes Gerät',
    },
    'composables/useExport': {
      copied: (count: number) =>
        plural(count, {
          one: `${count} normalisierter Eintrag kopiert.`,
          other: `${count} normalisierte Einträge kopiert.`,
        }),
      copyFailed: 'Das JSON konnte nicht kopiert werden',
      csvFilter: 'CSV-Tabelle',
      detailFull: 'Vollständig',
      detailFullHint:
        'Behält Sekunden-Serien der Trainings und einzelne Herzfrequenz-Messungen. Groß und zum Archivieren gedacht.',
      detailSummary: 'Zusammenfassung',
      detailSummaryHint:
        'Herzfrequenz stündlich aggregiert, Sekunden-Serien der Trainings weggelassen. Strukturierte Metriken bleiben vollständig, und die Größe passt zur Übergabe an eine KI.',
      endBeforeStart: 'Das Enddatum kann nicht vor dem Startdatum liegen.',
      feedFailed: 'Der lokale KI-Datenfeed konnte nicht aktualisiert werden',
      feedUpdated: (count: number) =>
        plural(count, {
          one: `Der lokale KI-Datenfeed enthält jetzt ${count} Eintrag.`,
          other: `Der lokale KI-Datenfeed enthält jetzt ${count} Einträge.`,
        }),
      fitFilter: 'FIT-Trainingsdateien',
      gpxFilter: 'GPX-Track',
      groupActivity: 'Aktivität',
      groupBody: 'Körperstatus',
      groupContext: 'Kontext',
      groupSleep: 'Schlaf',
      groupTraining: 'Training',
      invalidDates: 'Wähle ein gültiges Start- und Enddatum.',
      jsonFilter: 'JSON-Datei',
      jsonTooLarge: 'Das JSON ist über 1 MB. Nutze stattdessen „Datei speichern".',
      noDataTypes: 'Wähle mindestens einen Datentyp.',
      nothingToExport: 'In diesem Zeitraum gibt es nichts zu exportieren.',
      rangeTooLong: (days: number) =>
        `Ein Export deckt höchstens ${days} Tage ab. Für längere Historie nutze den Datenbank-Snapshot in den Einstellungen.`,
      saveCsvTitle: 'ZeppBridge-CSV speichern (Zusammenfassungstabelle)',
      saveFailed: (format: string) => `${format} konnte nicht gespeichert werden`,
      saveFitTitle: 'Ordner für den FIT-Export wählen (eine Datei pro Training)',
      saveGpxTitle: 'ZeppBridge-GPX speichern (GPS-Track)',
      saveJsonTitle: 'ZeppBridge-JSON speichern',
      saved: (count: number, unit: string) => `${count} ${unit} gespeichert.`,
      savedFiles: (files: number, count: number, unit: string) =>
        `${plural(files, {
          one: `${files} FIT-Datei`,
          other: `${files} FIT-Dateien`,
        })} gespeichert, insgesamt ${count} ${unit}.`,
      scopeConflict:
        'Ein Zeitraum und ein einzelnes Training schließen sich als Export-Umfang aus. Wähle eines.',
      typeDailyActivity: 'Tägliche Aktivität',
      typeHeartRate: 'Herzfrequenz',
      typeLactateThreshold: 'Laktatschwelle',
      typeLifeEvents: 'Lebensereignisse',
      typePai: 'PAI',
      typeRecovery: 'Bereitschaft',
      typeRespiratoryRate: 'Atemfrequenz',
      typeSleep: 'Schlaf',
      typeSpo2: 'Blutsauerstoff',
      typeSteps: 'Schritte',
      typeStress: 'Stress',
      typeTrainingLoad: 'Trainingsbelastung',
      typeWorkouts: 'Trainings',
      unitRecords: 'Einträge',
      unitRows: 'Zeilen',
      unitSamplePoints: 'Messpunkte',
      unitTrackPoints: 'Trackpunkte',
    },
    'composables/useSyncController': {
      alreadySyncing:
        'Eine Synchronisierung läuft bereits. Versuche es erneut, wenn sie fertig ist',
      backfilling: (days: number) => `Die letzten ${days} Tage werden nachgeladen…`,
      backfillingStream: (stream: string, month: string) =>
        `${stream} wird nachgeladen · ${month}`,
      cancelFailed: 'Die Synchronisierung ließ sich nicht abbrechen',
      cancelled: 'Synchronisierung abgebrochen',
      cancelling: 'Synchronisierung wird abgebrochen…',
      cloudSyncClock: (clock: string) => `Cloud-Synchronisierung ${clock}`,
      cloudSyncClockUnknown: 'Cloud-Synchronisierung —',
      connectFirst: 'Verbinde dich zuerst mit Zepp',
      deferred:
        'Lokale abgeleitete Daten werden neu aufgebaut. Die Synchronisierung versucht es von selbst erneut',
      desktopOnly: 'Nutze die Desktop-App',
      failed:
        'Synchronisierung fehlgeschlagen. Prüfe die Verbindung und versuche es erneut',
      lastCloudSync: (clock: string) => `Letzte Cloud-Synchronisierung ${clock}`,
      noNewData: 'Synchronisierung fertig. Die Cloud hatte nichts Neues',
      noNewDataWithLatest: (clock: string) =>
        `Nichts Neues in der Cloud · die neueste Herzfrequenz bleibt ${clock}`,
      notSyncedYet: 'Noch nicht synchronisiert',
      partial: 'Synchronisierung fertig, aber einige Datenströme sind fehlgeschlagen',
      partialWithStreams: (streams: string) => `Einige Datenströme sind fehlgeschlagen: ${streams}`,
      reauthNeeded: 'Deine Zepp-Sitzung ist abgelaufen. Verbinde dich erneut',
      statusUnavailable: 'Der Verbindungsstatus ist gerade nicht verfügbar',
      streamSeparator: ', ',
      syncDidNotFinish: 'Die Cloud-Synchronisierung ist nicht zu Ende gekommen',
      syncingRecent: (days: number) => `Die letzten ${days} Tage werden synchronisiert…`,
      syncingStream: (stream: string) => `${stream} wird synchronisiert`,
      timeUnknown: 'Zeit unbekannt',
      updated: 'Neue Daten abgeholt',
      updatedWithLatest: (clock: string) => `Neue Daten abgeholt · neueste Herzfrequenz ${clock}`,
      verifyFirst: 'Verifiziere zuerst die Verbindung',
    },
    'lib/aiTask/copy': {
      fallbackIssue: 'Eine Statusnotiz konnte nicht erkannt werden',
      'ui.ai_task.attach.no_redaction':
        'Originale werden unverändert referenziert und nicht anonymisiert. Bestätige, dass du diese Datei selbst an die gewählte KI anhängen willst.',
      'ui.ai_task.blocked.attachment_missing':
        'Ein Original-Anhang wird nicht mehr gefunden. Wähle die Datei neu oder entferne die Referenz zuerst.',
      'ui.ai_task.blocked.empty':
        'Die aktuelle Auswahl deckt keine Daten ab. Passe zuerst Kategorien oder Trainings an.',
      'ui.ai_task.blocked.no_workouts':
        'Mit dieser Aufgabe ist noch kein Training verknüpft. Geh zurück und wähle mindestens eines.',
      'ui.ai_task.cat.attachment': 'Anhänge',
      'ui.ai_task.cat.body': 'Körperstatus',
      'ui.ai_task.cat.heart_rate': 'Herzfrequenz',
      'ui.ai_task.cat.personal_note': 'Persönliche Notiz',
      'ui.ai_task.cat.recovery': 'Bereitschaft',
      'ui.ai_task.cat.sleep': 'Schlaf',
      'ui.ai_task.cat.training': 'Trainingsbelastung',
      'ui.ai_task.cat.workout': 'Trainings',
      'ui.ai_task.prompt.coverage_note':
        'Die Abdeckung unten wurde von ZeppBridge auf dem Gerät gemessen. Tage ohne Daten sind als fehlend markiert – nicht ableiten oder erfinden.',
      'ui.ai_task.unknown': 'Nicht erkannte Statusnotiz',
      'ui.ai_task.warn.attachment_changed':
        'Die Größe eines Anhangs weicht vom Hinzufügen ab – vergewissere dich vor der Übergabe, dass es noch dasselbe Original ist.',
      'ui.ai_task.warn.category_missing':
        'Diese Kategorie hat im gewählten Zeitfenster keine Daten; der Export markiert sie als fehlend.',
      'ui.ai_task.warn.partial_coverage':
        'Nur ein Teil des Zeitfensters hat Daten. Details siehe Abdeckungstabelle unten.',
      'ui.ai_template.hr_drift.name': 'Herzfrequenzdrift',
      'ui.ai_template.hr_drift.prompt':
        'Analysiere die Herzfrequenzdrift in diesem Training: den Anstieg bei konstantem Tempo, beurteilt gegen zwei Wochen Schlaf und Trainingsbelastung – Ermüdung, Wetter oder Formveränderung?',
      'ui.ai_template.long_run_compare.name': 'Vergleich langer Läufe',
      'ui.ai_template.long_run_compare.prompt':
        'Vergleiche diese langen Läufe: Tempo-/Herzfrequenzdrift, gefühlte Anstrengung und Erholungskontext. Welche Einheit war am effizientesten, und wie soll ich die Intensität für den nächsten setzen?',
      'ui.ai_template.recovery_run.name': 'Erholungslauf',
      'ui.ai_template.recovery_run.prompt':
        'Das war ein Training in der Erholungsphase. Beurteile anhand der zwei Wochen Schlaf, Bereitschaft und Herzfrequenz-Kontext davor, ob die Intensität zu meinem Erholungsstand passte, und schlage das Training für die nächsten 48 Stunden vor.',
    },
    'lib/bridge/errors': {
      desktopOnly: 'Nutze die Desktop-App',
      genericFailure: 'Das ist nicht durchgekommen. Versuche es gleich erneut',
      timedOut:
        'Die Anfrage lief in eine Zeitüberschreitung. Prüfe dein Netzwerk und die Zepp-Region, dann versuche es erneut.',
    },
    'lib/dateTime': {
      '12h': '12-Stunden',
      '24h': '24-Stunden',
      date: 'Datumsformat',
      dmy: 'Tag/Monat/Jahr',
      mdy: 'Monat/Tag/Jahr',
      regional: 'Systemregion',
      time: 'Zeitformat',
      ymd: 'Jahr/Monat/Tag',
    },
    'lib/deviceCopy': {
      introMany: (first: string, second: string, count: number) =>
        `Lokal zuerst, Quellen erhalten: Aufzeichnungen von ${first}, ${second} und ${count} Geräten insgesamt, zu einem wirklich lesbaren Gesundheitsarchiv geordnet.`,
      introNoDevice:
        'Lokal zuerst, Quellen erhalten: deine Wearable-Aufzeichnungen, zu einem wirklich lesbaren Gesundheitsarchiv geordnet.',
      introOne: (name: string) =>
        `Lokal zuerst, Quellen erhalten: Aufzeichnungen von ${name}, zu einem wirklich lesbaren Gesundheitsarchiv geordnet.`,
      introTwo: (first: string, second: string) =>
        `Lokal zuerst, Quellen erhalten: Aufzeichnungen von ${first} und ${second}, zu einem wirklich lesbaren Gesundheitsarchiv geordnet.`,
      notProvided: 'Nicht angegeben',
    },
    'lib/failedChunkText': {
      noCanonical:
        'Die Cloud hat Daten geliefert, aber es ließen sich keine verwertbaren Einträge daraus lesen',
      noReason: 'Kein Grund aufgezeichnet',
    },
    'lib/format': {
      dateUnknown: 'Datum unbekannt',
      duration: (hours: number, minutes: number) =>
        hours > 0 ? `${hours} Std. ${minutes} Min.` : `${minutes} Min.`,
      durationUnknown: 'Dauer unbekannt',
      noRecords: 'Noch keine Einträge',
      noUpdates: 'Noch keine Updates',
      notRecorded: 'Nicht aufgezeichnet',
      timeUnknown: 'Zeit unbekannt',
    },
    'lib/labels': {
      fallback: {
        activity: 'Aktivität',
        badminton: 'Badminton',
        climb: 'Klettern',
        cycling: 'Radfahren',
        elliptical: 'Crosstrainer',
        hiking: 'Wandern',
        indoor_cycling: 'Indoor-Cycling',
        indoor_run: 'Indoor-Laufen',
        ride: 'Radfahren',
        rowing: 'Rudern',
        run: 'Laufen (Outdoor)',
        running: 'Laufen',
        strength: 'Krafttraining',
        swimming: 'Schwimmen',
        trail: 'Traillauf',
        treadmill: 'Laufband',
        unknown: 'Nicht erkanntes Training',
        walk: 'Gehen',
        walking: 'Walking',
        yoga: 'Yoga',
      },
      providerZeppCloud: 'Zepp Cloud',
      scopeDevice: 'Einzelnes Gerät',
      scopeMixed: 'Mehrere Quellen',
      scopeUnknown: 'Umfang unbestätigt',
      scopeUserFused: 'Vom Nutzer zusammengeführt',
      unknownWithCode: (code: string) => `Nicht erkanntes Training (Code ${code})`,
      unknownWorkout: 'Nicht erkanntes Training',
      workout: 'Training',
    },
    'lib/lifeEvents': {
      active: 'Laufend',
      add: 'Ereignis hinzufügen',
      all: 'Alle',
      cancel: 'Abbrechen',
      categories: {
        health: 'Gesundheit & Erholung',
        other: 'Sonstiges',
        routine: 'Alltag & Routine',
        training: 'Training & Wettkämpfe',
        travel: 'Reisen',
      },
      category: 'Kategorie',
      deleteHint: 'Diese Notiz wird aus der lokalen Datenbank entfernt.',
      deleteTitle: 'Dieses Lebensereignis löschen?',
      deleted: 'Lebensereignis gelöscht.',
      edit: 'Ereignis bearbeiten',
      empty:
        'Noch keine Lebensereignisse. Fang mit einer Erkältung, einer Reise oder einer Trainingsänderung an.',
      end: 'Enddatum',
      failed: 'Die Aktion konnte nicht abgeschlossen werden. Bitte erneut versuchen.',
      intro: 'Halte fest, was neben deinen Gesundheitsdaten passiert ist.',
      invalid:
        'Gib einen Titel und gültige Daten ein. Das Enddatum kann nicht vor dem Startdatum liegen.',
      loading: 'Lebensereignisse werden geladen…',
      local:
        'Lokal gespeichert und in Datenbank-Backups enthalten. Bei der Übergabe an eine KI kannst du Lebensereignisse einschließen.',
      manage: 'Lebensereignisse verwalten',
      name: 'Titel',
      next: 'Weiter',
      noMatch: 'Keine passenden Ereignisse.',
      notes: 'Notizen (optional)',
      ongoing: 'Noch laufend',
      placeholder: 'Zum Beispiel: eine Erkältung, ein paar Tage Trainingspause',
      previous: 'Zurück',
      related: 'Verwandte Ereignisse',
      remove: 'Löschen',
      retry: 'Erneut versuchen',
      save: 'Speichern',
      saved: 'Lebensereignis gespeichert.',
      search: 'Lebensereignisse suchen',
      start: 'Startdatum',
      title: 'Lebensereignisse',
    },
    'lib/metricSeries': {
      coverage: (days: number, withData: number) =>
        `${withData} von ${days} Tagen haben Einträge`,
      dayRange: (low: string, high: string, unit: string) =>
        `An diesem Tag ${low} – ${high}${unit}`,
      noRecordsInWindow: (days: number) => `Keine Einträge in den letzten ${days} Tagen`,
      noRecordsToShow: 'Keine Einträge zum Anzeigen',
      samples: (count: number) =>
        plural(count, {
          one: `${count} Messwert`,
          other: `${count} Messwerte`,
        }),
    },
    'lib/rangeOptions': {
      d180: '6 Monate',
      d30: '1 Monat',
      d365: '1 Jahr',
      d7: '7 Tage',
      d90: '3 Monate',
    },
    'lib/sleepStages': {
      awake: 'Wach',
      deep: 'Tiefschlaf',
      light: 'Leichtschlaf',
      rem: 'REM',
      unknown: 'Unbekannt',
    },
    'lib/storageEstimateText': {
      builtinGuess: (days: number, add: string, free: string) =>
        `Noch zu wenig lokale Messwerte, deshalb eine grobe eingebaute Schätzung: ${days} Tage brauchen etwa ${add}, und ${free} sind auf diesem Laufwerk frei.`,
      diskTooSmall:
        'Weniger als 300 MB frei – Historie über mehr als 90 Tage kann nicht nachgeladen werden.',
      diskUnknown:
        'Der freie Speicherplatz konnte nicht gelesen werden. Stelle vor dem Nachladen sicher, dass genug Platz da ist.',
      measured: (days: number, add: string, free: string) =>
        `Nach dem Tempo, in dem sich deine eigenen Daten tatsächlich ansammeln, brauchen ${days} Tage etwa ${add}, und ${free} sind auf diesem Laufwerk frei.`,
      partial: (days: number, add: string, free: string) =>
        `Nur anhand der Datenströme mit genug lokalen Messwerten geschätzt brauchen ${days} Tage etwa ${add} (der Rest zählt nicht mit), und ${free} sind auf diesem Laufwerk frei.`,
      stopNoSpace: (needed: string, free: string) =>
        `Dieses Nachladen braucht etwa ${needed} (inklusive Sicherheitspuffer), aber nur ${free} sind frei – es startet nicht. Gib Platz frei oder verkürze den Zeitraum.`,
      unknownEstimate: 'Die Größe dieses Nachladens lässt sich gerade nicht schätzen.',
    },
    'lib/syncStreams': {
      blood_oxygen: 'Blutsauerstoff',
      breathing_rate: 'Atemfrequenz',
      daily_summary: 'Tagesübersichten',
      heart_rate: 'Herzfrequenz',
      hrv: 'Herzfrequenzvariabilität',
      lactate_threshold_hr: 'Laktatschwellen-Herzfrequenz',
      lactate_threshold_pace: 'Laktatschwellen-Tempo',
      resting_heart_rate: 'Ruheherzfrequenz',
      skin_temperature: 'Hauttemperatur',
      sleep: 'Schlaf',
      training_load: 'Trainingsbelastung',
      vo2max: 'VO₂max',
      weight: 'Gewicht und Körperzusammensetzung',
      wellness: 'Stress, SpO₂ und andere optionale Metriken',
      workout_detail: 'Trainingsdetails und Tracks',
      workouts: 'Trainings',
    },
    'lib/units': {
      big: 'km',
      bigImperial: 'mi',
      short: 'm',
      shortImperial: 'ft',
    },
    'services/updateService': {
      nothingToInstall: 'Es gibt kein Update zu installieren. Prüfe erneut.',
    },
    'views/ActivityDetail': {
      backToOverview: 'Zurück zur Übersicht',
      caloriesHint: 'Nur Aktivität, Grundumsatz ausgenommen',
      caloriesLabel: 'Aktivitätskalorien',
      caloriesUnit: 'kcal',
      desktopOnly:
        'Nutze die Desktop-App. Diese Browser-Vorschau liest keine Kontodaten.',
      distanceHint: 'An diesem Tag zurückgelegte Distanz',
      distanceLabel: 'Distanz',
      distanceUnit: 'm',
      emptyCard: 'In diesem Zeitraum nichts aufgezeichnet.',
      eyebrow: 'Tägliche Aktivität',
      intro:
        'Tägliche Schritte, Distanz, Aktivitätskalorien und aktive Minuten Tag für Tag. Nur mit deinen eigenen früheren Einträgen verglichen; Tage ohne Daten bleiben leer statt mit einer Null gefüllt.',
      loadFailed: 'Aktivitätsdaten sind gerade nicht verfügbar',
      loadingAria: 'Tägliche Aktivität wird geladen',
      minutesHint: 'Minuten, die die Uhr als aktiv zählte',
      minutesLabel: 'Aktive Minuten',
      minutesUnit: 'Min.',
      noneInRange:
        'Keine Aktivitätseinträge in diesem Zeitraum. Versuche einen längeren Zeitraum oder führe zuerst eine Synchronisierung aus.',
      rangeAria: 'Zeitraum',
      retry: 'Erneut versuchen',
      stepsHint: 'Tägliche Schrittzahl der Uhr',
      stepsLabel: 'Schritte',
      stepsUnit: 'Schritte',
      title: 'Tägliche Aktivität',
    },
    'views/AiComposer': {
      daysOption: (days: number) =>
        plural(days, {
          one: `${days} Tag`,
          other: `${days} Tage`,
        }),
    },
    'views/BodyStatus': {
      backToOverview: 'Zurück zur Übersicht',
      bmiHint: 'Body-Mass-Index, von der Cloud zusammen mit dem Gewicht geliefert',
      bmiLabel: 'BMI',
      bmrHint: 'Braucht eine Körperanalysewaage',
      bmrLabel: 'Grundumsatz',
      bodyGroupEmpty:
        'Keine Gewichts- oder Körperzusammensetzungs-Einträge in diesem Zeitraum. Körperzusammensetzung braucht eine Analysewaage; Uhr und von Hand eingetragene Gewichte bringen sie nicht mit.',
      bodyGroupTitle: 'Gewicht und Körperzusammensetzung',
      boneHint: 'Braucht eine Körperanalysewaage',
      boneLabel: 'Knochenmasse',
      carbsLabel: 'Kohlenhydrate',
      curveCardAria: '24-Stunden-Stress',
      curveChartAria: 'Stress der letzten 24 Stunden',
      curveNoSamples:
        'Keine Stressmesswerte in den letzten 24 Stunden, also keine Kurve. So sieht eine nicht getragene Uhr oder abgeschaltetes Ganztags-Monitoring aus.',
      curveNote:
        'Die Bänder (ruhig 1–39, normal 40–59, mittel 60–79, hoch 80–100) sind Zepps eigene, nicht unsere. Zeiten ohne Messwerte bleiben leer statt mit Nullen gefüllt.',
      curveSub: 'Die Uhr misst alle fünf Minuten; Einzelmesswerte in Zeitfolge',
      curveTitle: 'Stress der letzten 24 Stunden',
      desktopOnly:
        'Nutze die Desktop-App. Diese Browser-Vorschau liest keine Kontodaten.',
      emptyCard: 'In diesem Zeitraum nichts aufgezeichnet.',
      eyebrow: 'Körperstatus',
      fatHint:
        'Braucht eine Körperanalysewaage. Uhr und von Hand eingetragene Gewichte bringen keinen Fettwert mit',
      fatIntakeLabel: 'Fett',
      fatLabel: 'Körperfett',
      gramsPerDay: (grams: string) => `${grams} g pro Tag im Schnitt`,
      heightHint: 'Profilwert, mit jeder Messung zurückgespiegelt – keine Messung des Tages',
      heightLabel: 'Größe',
      hrvHint: 'Herzfrequenzvariabilität, Einzelmessungen pro Tag gemittelt',
      intakeCaloriesHint:
        'Summe des protokollierten Tages. Tage ohne Protokoll bekommen keinen Balken und werden nie mit 0 gefüllt',
      intakeCaloriesLabel: 'Gegessene Kalorien',
      intakeGroupEmpty:
        'Keine Essensprotokolle in diesem Zeitraum. Mahlzeiten werden in der Zepp-App von Hand erfasst; einmal erfasst, erscheinen sie hier nach einer Synchronisierung.',
      intakeGroupTitle: 'Aufnahme',
      intro:
        'Lokale Trends für Bereitschaft, Stress, Blutsauerstoff, HRV, Atemfrequenz, Ruheherzfrequenz, Körperzusammensetzung und Nahrungsaufnahme. Alle aus synchronisierten Einträgen gelesen.',
      loadFailed: 'Körperstatus-Daten sind gerade nicht verfügbar',
      loadingAria: 'Körperstatus wird geladen',
      macroHint: 'Summe des protokollierten Tages',
      macroNote:
        'Die Anteile werden hier aus den Tagesgramm-Zahlen mit 4/9/4 kcal pro Gramm abgeleitet (Eiweiß / Fett / Kohlenhydrate). Sie kommen nicht aus der Cloud und können um ein, zwei Punkte von den Prozenten in der Zepp-App abweichen. Fehlt einer der drei, wird nichts gezeichnet.',
      macroSub: 'Anteil der Kalorien, den jeder Makronährstoff in diesem Zeitraum beisteuerte',
      macroTitle: 'Ernährungsbilanz',
      muscleHint: 'Braucht eine Körperanalysewaage',
      muscleLabel: 'Muskelmasse',
      noneInRange:
        'Keine Körperstatus-Einträge in diesem Zeitraum. Versuche einen längeren Zeitraum oder führe zuerst eine Synchronisierung aus.',
      odiHint: 'Desaturierungen pro Stunde; niedriger ist besser',
      odiLabel: 'Nächtlicher SpO₂-ODI',
      proteinLabel: 'Eiweiß',
      rangeAria: 'Zeitraum',
      readinessHint: 'Die Uhr verrechnet Schlaf, HRV und Ruheherzfrequenz zu einem Score',
      readinessLabel: 'Bereitschaft',
      respiratoryHint: 'Atemfrequenz im Schlaf; das Band ist der gemessene Bereich des Tages',
      respiratoryLabel: 'Atemfrequenz',
      restingHint: 'Ruheherzfrequenz, wie ZeppBridge sie pro Tag berechnet',
      restingLabel: 'Ruheherzfrequenz',
      retry: 'Erneut versuchen',
      rmssdHint: 'Nächtliche hochfrequente Variabilität, pro Tag gemittelt',
      scaleEmpty:
        'Keine Wägungen in diesem Zeitraum. Waagen-Messwerte erscheinen hier nach einer Synchronisierung.',
      spo2Empty: 'Keine einzelnen SpO₂-Messwerte in diesem Zeitraum.',
      spo2Hint:
        'Einzelne SpO₂-Messwerte pro Tag gemittelt; das Band ist der gemessene Bereich des Tages',
      spo2Label: 'Blutsauerstoff',
      statAverage: 'Durchschnitt',
      statHighest: 'Höchster',
      statLatest: 'Neuester',
      statLowest: 'Niedrigster',
      stressHint: 'Ganztags-Durchschnitt; das schattierte Band ist der gemessene Bereich des Tages',
      stressLabel: 'Stress',
      stressTooltip: (clock: string, value: number) => `${clock}　<b>${value}</b>`,
      title: 'Körperstatus',
      trendRangeLabel: 'Trendzeitraum',
      unitBreathsPerMinute: 'Atemzüge/Min.',
      unitGrade: 'Stufe',
      unitGram: 'g',
      unitKcal: 'kcal',
      unitKcalPerDay: 'kcal/Tag',
      unitPerHour: '/Std.',
      unitScore: 'Pkt.',
      visceralHint: 'Eine Stufe, kein Prozentsatz. Zepp vergibt 1–30',
      visceralLabel: 'Viszerales Fett',
      waterHint: 'Braucht eine Körperanalysewaage',
      waterLabel: 'Körperwasser',
      weightHint: 'Jede Wägung, pro Tag gemittelt; das Band ist der gemessene Bereich des Tages',
      weightLabel: 'Gewicht',
    },
    'views/DeviceDetail': {
      assignAria: 'Modellerkennung',
      assignSub:
        'Wenn die Zuordnung falsch ist – etwa ist es wirklich eine Balance 2 und hier steht ein anderes Modell –, kannst du selbst auf das richtige Modell zeigen. Deine Auswahl bleibt auf diesem Rechner, erscheint als „Von dir gewähltes Modell" statt sich als automatische Zuordnung auszugeben, und lässt sich jederzeit zurücknehmen.',
      assignTitle: 'Stimmt das?',
      backToSettings: 'Zurück zu den Einstellungen',
      changeModel: 'Anderes wählen',
      clearAssignment: 'Auswahl zurücknehmen und zur automatischen zurückkehren',
      factDeviceId: 'Geräte-ID',
      factFirmware: 'Firmware',
      factHasLocal: 'Lokale Daten dazu',
      factLastData: 'Neueste Daten',
      factOrigin: 'Woher das Modell kommt',
      factsAria: 'Geräteinformationen',
      factsNote:
        'Die Geräte-ID wird nur auf diesem Rechner genutzt, nur ihre letzten vier Zeichen erscheinen je auf dem Bildschirm, und sie gelangt nie in einen Export oder Fehlerbericht.',
      hasLocalNo: 'Noch keine',
      hasLocalYes: 'Ja',
      noLocalIdentifier:
        'Dieses Gerät trägt keine lokale Kennung, eine Auswahl lässt sich nicht speichern.',
      notFoundMessage:
        'Es wurde vielleicht aus dem Konto entfernt, oder dieser Rechner hat es noch nicht erkannt.',
      notFoundTitle: 'Dieses Gerät ist nicht da',
      originAlias: 'Alias-Treffer im eingebauten Katalog',
      originCatalog: 'Treffer im eingebauten Katalog',
      originExact: 'Exakter Treffer im eingebauten Katalog',
      originNoMatch: 'Kein Treffer',
      originNoMatchCloud:
        'Kein Treffer (die Cloud gab keinen erkennbaren Produktnamen)',
      originUnknown: 'Unbekannt',
      originUserAssigned: 'Von dir beim letzten Mal gewählt',
      pickModel: 'Falsch – ich wähle selbst',
      reidentify: 'Geräte erneut erkennen',
    },
    'views/HealthCheck': {
      action: {
        integrity_check: {
          label: 'Datenbank-Integrität prüfen',
          reason:
            'Führt ein SQLite integrity_check über die ganze Datenbank aus; bei einer großen dauert es eine Weile.',
        },
        open_data_folder: {
          label: 'Datenordner öffnen',
          reason: 'Lokale Datenbank, Backups und Exporte liegen alle hier.',
        },
        reauth: {
          label: 'Zepp-Konto erneut verbinden',
          reason: 'Manche Datenströme können nicht abrufen, weil die Anmeldedaten abgelaufen sind.',
        },
        reprocess: {
          label: 'Lokale Rohdaten mit dem aktuellen Parser neu einlesen',
          reason: '' as string,
        },
        sync_first: {
          label: 'Die erste Synchronisierung ausführen',
          reason: 'Dieser Rechner hat noch keine erfolgreiche Cloud-Synchronisierung verbucht.',
        },
        sync_retry: {
          label: 'Noch einmal synchronisieren',
          reason: 'Beim letzten Mal konnten manche Datenströme nichts aus der Cloud holen.',
        },
      },
      actionFailed: (label: string) => `${label} ist fehlgeschlagen`,
      actionFolderOpened: 'Datenordner geöffnet.',
      actionIntegrityFailed: (detail: string) =>
        `Die Datenbank hat die Integritätsprüfung nicht bestanden: ${detail}`,
      actionIntegrityFallback: 'Sichere den Datenordner und synchronisiere erneut',
      actionIntegrityOk: 'Die Datenbank hat die Integritätsprüfung bestanden.',
      actionReconnect: 'Geh zu den Einstellungen und verbinde das Zepp-Konto erneut.',
      actionReplayed: (count: string) =>
        `Lokale Rohdaten mit dem aktuellen Parser neu eingelesen (${count} abgeleitete Einträge). Die Cloud-Synchronisierungszeit wurde nicht überschrieben.`,
      actionRun: 'Ausführen',
      actionRunning: 'Läuft…',
      actionSynced: 'Die Synchronisierung lief, der Status ist aktualisiert.',
      actionsTitle: 'Was du tun kannst',
      backToSettings: 'Zurück zu den Einstellungen',
      cadence: {
        continuous: 'mehrmals am Tag',
        daily: 'einmal am Tag',
        nightly: 'einmal pro Nacht',
        occasional: 'nur gelegentlich',
        per_event: 'nur wenn es passiert',
      },
      confirmDestructive: (label: string, reason: string) => `${label}: ${reason}\nFortfahren?`,
      coverageGaps: (days: number) =>
        `${days} Tage ohne beobachtete Daten seit dem ersten Tag mit Daten. Uhr nicht getragen, nicht synchronisiert oder Cloud ohne Antwort verursachen alle Lücken.`,
      coverageNoData:
        'Für diesen Zeitraum noch keine lokalen Daten. Führe zuerst eine Synchronisierung aus.',
      coverageNoGaps: 'Seit dem ersten Tag mit Daten keine Lücken beobachtet.',
      coverageOccasional:
        'Die Uhr meldet das nur gelegentlich; leere Tage sind normal und bedeuten keinen Verlust.',
      coveragePerEvent:
        'Pro Ereignis erzeugt: kein Eintrag heißt, damals ist nichts passiert – nicht, dass etwas fehlt.',
      days: (count: number) =>
        plural(count, {
          one: `${count} Tag`,
          other: `${count} Tage`,
        }),
      dbCanonical: 'Normalisierte Einträge',
      dbNormalizer: 'Parser-Revision',
      dbPending: 'Normalisierung ausstehend',
      dbRaw: 'Rohdatensätze',
      dbSchema: 'Schema-Version',
      dbSize: 'Dateigröße',
      dbTitle: 'Lokale Datenbank',
      errorKind: {
        auth: 'das Konto muss neu verbunden werden',
        busy: 'eine andere Operation schrieb gerade, diese wich aus',
        cancelled: 'abgebrochen',
        cloud_rejected: 'die Cloud hat die Anfrage erhalten und abgelehnt',
        network: 'die Cloud war nicht erreichbar',
        not_available: 'dieses Konto hat keinen solchen Datenstrom',
        storage: 'das Schreiben in die lokale Datenbank ist fehlgeschlagen',
        unknown: 'nicht eingestufter Fehler',
        unrecognized_payload: 'ein Datensatz kam an, war aber nicht lesbar',
      },
      eyebrow: 'Datenzustand',
      factCanonical: 'Normalisierte Einträge',
      factObservedDays: 'Beobachtete Tage',
      factRaw: 'Rohdatensätze',
      factSources: 'Quellen',
      gapExamples: (dates: string) => `Lücken, z. B.: ${dates}`,
      gapMore: ' und weitere',
      integrityDetailBelow: 'Details unten',
      integrityFailed: (detail: string) => `nicht bestanden (${detail})`,
      integrityLine: (verdict: string, checkedAt: string) =>
        `Integritätsprüfung: ${verdict} · ${checkedAt}`,
      integrityNeverRun:
        'Noch keine Integritätsprüfung gelaufen. Sie scannt die ganze Datenbank, was bei einer großen eine Weile dauert, also läuft sie nur, wenn du es anforderst.',
      integrityPassed: 'bestanden',
      intro:
        'Für jeden Datenstrom: wie weit er beim Abrufen aus der Cloud, Parsen und lokalen Schreiben kam; welche Tage er abdeckt; und woher er kommt. Fehlend ist fehlend – nie mit einer Null aufgefüllt.',
      latestObserved: (date: string) => `Zuletzt ${date}.`,
      loadFailed: 'Der Datenzustand konnte nicht gelesen werden',
      loadingAria: 'Der Datenzustand wird gelesen',
      noRecords: 'Noch keine Einträge',
      noRecordsYet: 'Noch keine Einträge',
      notProvided: 'Nicht angegeben',
      occasionalLatest: (date: string) => `zuletzt ${date}`,
      occasionalLine: (records: string, days: number) =>
        `${records} Einträge · an ${days} Tagen beobachtet`,
      occasionalNone: 'In diesem Zeitraum nichts beobachtet',
      occasionalNote:
        'Metriken wie VO₂max und Laktatschwelle meldet die Uhr von sich aus nicht täglich. Dieser Abschnitt meldet die beobachteten Tage und den jüngsten und zählt nie Tageslücken – normale Spärlichkeit rot zu malen wäre irreführend.',
      occasionalTitle: 'Metriken, die nur gelegentlich auftauchen',
      period: '.',
      rangeAria: 'Abdeckungszeitraum',
      replayInProgress:
        'Lokale Rohdaten werden mit dem neuen Parser neu eingelesen. Cloud-Synchronisierungen weichen in dieser Zeit aus und versuchen es selbst erneut – das ist kein Fehler.',
      reprocessReason: (pending: number) =>
        `${plural(pending, {
          one: `${pending} gespeicherter Rohdatensatz hat`,
          other: `${pending} gespeicherte Rohdatensätze haben`,
        })} noch keinen normalisierten Eintrag erzeugt. Ein Neueinlesen berührt kein Netz und überschreibt nicht die Cloud-Synchronisierungszeit.`,
      retry: 'Erneut versuchen',
      source: {
        device: 'einzelnes Gerät',
        unknown: 'Quelle unbekannt',
        user_fused: 'vom Nutzer zusammengeführt',
      },
      sourceSeparator: ', ',
      stage: {
        failed: 'fehlgeschlagen',
        never: 'nie passiert',
        ok: 'OK',
      },
      stageFetch: 'Abruf',
      stageLine: (stage: string, state: string) => `${stage}: ${state}`,
      stageParse: 'Parse',
      stageWrite: 'Schreiben',
      streamsNote:
        'Abrufen, Parsen und Schreiben sind drei Dinge, die einzeln fehlschlagen. Zu einem roten Punkt zusammengefaltet, könntest du nicht sagen, ob du es erneut versuchen, neu verbinden sollst oder ob dieses Konto diesen Datenstrom schlicht nicht hat.',
      streamsTitle: 'Wie weit jeder Datenstrom kam',
      timeUnknown: 'Zeit unbekannt',
      timingCloud: 'Zuletzt aus der Cloud abgerufen',
      timingCloudNote: 'Noch kein Ergebnis',
      timingManual: 'Letztes manuelles Neueinlesen',
      timingManualNote: 'Das, das du selbst angeklickt hast',
      timingNewest: 'Neuester Gesundheitsmesswert',
      timingNewestNote: 'Wann der Eintrag selbst auf der Uhr passierte',
      timingReplay: 'Letztes lokales Neueinlesen',
      timingReplayNote:
        'Liest lokale Rohdaten mit dem aktuellen Parser neu. Kein Netz, und es überschreibt nicht die Zeit oben.',
      timingsTitle: 'Drei verschiedene „letzten Male"',
      title: 'Datenzustandsprüfung',
      window30: 'Letzte 30 Tage',
      window365: 'Letztes Jahr',
      window90: 'Letzte 90 Tage',
    },
    'views/HeartRateDetail': {
      backToOverview: 'Zurück zur Übersicht',
      bpmTooltip: (clock: string, value: number) => `${clock}　<b>${value}</b> bpm`,
      chartAria: 'Herzfrequenz der letzten 24 Stunden',
      dailyMaxAria: 'Tageshöchstwerte der Herzfrequenz als Trend',
      dailyMaxFailed: 'Die täglichen Herzfrequenz-Spitzen sind gerade nicht lesbar.',
      dailyMaxLegendAvg: 'Durchschnitt',
      dailyMaxLegendMax: 'Spitze',
      dailyMaxNone:
        'Keine Herzfrequenz-Messwerte auf diesem Rechner in diesem Zeitraum – es gibt keine Spitze zum Vergleichen.',
      dailyMaxNote:
        'Hier zählen nur die rohen Einzelmesswerte auf diesem Rechner. Zepps Tageshöchstwert wird uns nie gesendet (das device_max_hr in der Bibliothek ist das eingestellte Maximum für die Zonengrenzen, keine gemessene Spitze), also gibt es hier nichts danebenzustellen – öffne die Zepp-App, um den Wert des Tages zu vergleichen.',
      dailyMaxSparse: (days: number) =>
        `${days} dieser Tage haben sehr wenige Messwerte (unter 60). An diesen Tagen ist die „Spitze" nur der höchste dieser wenigen Punkte, nicht die echte Tages-Spitze – sie sind als hohle Markierungen gezeichnet.`,
      dailyMaxSub:
        'Die Zepp-App filtert ihre Tages-Spitze; hier wird nicht gefiltert. Dass die Zahlen abweichen, ist erwartbar.',
      dailyMaxTitle: 'Tägliche Herzfrequenz-Spitze (Roh-Messwerte dieses Rechners)',
      dailyMaxTooltip: (date: string, max: number, avg: number, samples: number) =>
        `${date}<br/>Spitze <b>${max}</b> bpm<br/>Durchschnitt ${avg} bpm<br/>${samples} Messwerte`,
      dayCardAria: '24-Stunden-Herzfrequenz',
      dayFailed: 'Die Herzfrequenz der letzten 24 Stunden ist gerade nicht lesbar.',
      daySub: 'Einzelmesswerte in Zeitfolge',
      dayTitle: 'Letzte 24 Stunden',
      desktopOnly:
        'Nutze die Desktop-App. Diese Browser-Vorschau liest keine Kontodaten.',
      emptyCard: 'In diesem Zeitraum nichts aufgezeichnet.',
      eyebrow: 'Herzfrequenz',
      hrvHint: 'Einzelne HRV-Messwerte, pro Tag gemittelt',
      intro:
        'Die Ganztags-Kurve oben ist immer die letzten 24 Stunden; 7 Tage / 1 Monat / 6 Monate ändern nur die Tag-für-Tag-Trends unten. Abschnitte ohne Messwerte bleiben leer statt mit einer Null gefüllt.',
      loadFailed: 'Herzfrequenzdaten sind gerade nicht verfügbar',
      loadingAria: 'Herzfrequenz wird geladen',
      noSamples:
        'Keine Herzfrequenz-Messwerte in den letzten 24 Stunden, also keine Kurve zu zeichnen.',
      rangeAria: 'Trendzeitraum',
      restingHint: 'Die Uhr meldet einen pro Tag; ruhiger ist besser',
      restingLabel: 'Ruheherzfrequenz',
      retry: 'Erneut versuchen',
      rmssdHint: 'Ein anderes HRV-Maß, nicht dieselbe Zahl wie oben',
      statAverage: 'Ø',
      statHighest: 'Max.',
      statLatest: 'Neueste',
      statLowest: 'Min.',
      title: 'Herzfrequenz',
      trendRangeLabel: 'Trendzeitraum',
      trendsFailed: 'Ruheherzfrequenz- und HRV-Trends sind gerade nicht lesbar.',
    },
    'views/Overview': {
      bodyEmpty:
        'Bereitschaft, Stress und Blutsauerstoff erscheinen hier nach einer Synchronisierung',
      bodyPanelAria: 'Körperstatus öffnen',
      bodySparkLabel: 'Bereitschaft der letzten 7 Tage',
      bodyThin: 'Zu wenig Einträge in den letzten 7 Tagen für einen Trend',
      bodyTitle: 'Körperstatus',
      desktopOnly:
        'Nutze die Desktop-App. Diese Browser-Vorschau liest keine Kontodaten.',
      deviceErrorPrefix: 'Geräteerkennung: ',
      factLoad: 'Belastung',
      factRecovery: 'Bereitschaft',
      factSpo2: 'SpO₂',
      factStress: 'Stress',
      healthUnavailable: 'Gesundheitsdaten sind gerade nicht verfügbar',
      loadBandReference: (band: string) => `${band} (Referenz)`,
      loadFailedTitle: 'Die Datenübersicht konnte nicht gelesen werden',
      loadHigh: 'hoch',
      loadLow: 'niedrig',
      loadMedium: 'mittel',
      loadVeryHigh: 'sehr hoch',
      loadingAria: 'Übersicht wird geladen',
      overviewTitle: 'Übersicht',
      partialUnavailable: 'Manche Datenströme wurden noch nicht abgerufen',
      retry: 'Erneut versuchen',
      trainingEmpty:
        'VO₂max und Trainingsbelastung erscheinen hier nach einer Synchronisierung',
      trainingPanelAria: 'Trainingsstatus öffnen',
      trainingSparkLabel: 'Trainingsbelastung der letzten 7 Tage',
      trainingThin: 'Zu wenig Einträge in den letzten 7 Tagen für einen Trend',
      trainingTitle: 'Trainingsstatus',
      unrecognizedCta: 'Von Hand zuordnen',
      unrecognizedSuffix: ' hat noch kein erkanntes Modell',
    },
    'views/RecentRecords': {
      backToOverview: 'Zurück zur Übersicht',
      countBadge: (count: number) => `${count} insgesamt`,
      dateUnknown: 'Datum unbekannt',
      desktopOnly:
        'Nutze die Desktop-App. Diese Browser-Vorschau liest keine Kontodaten.',
      filterAll: 'Alle',
      hiddenIncomplete: (count: number) =>
        plural(count, {
          one: `${count} unvollständiger Eintrag ausgeblendet`,
          other: `${count} unvollständige Einträge ausgeblendet`,
        }),
      intro: 'Zuletzt synchronisierter Schlaf und Trainings, nebeneinander.',
      listDate: (month: number, day: number, weekday: string) =>
        `${weekday}, ${day}.${month}.`,
      loadFailedTitle: 'Die letzten Einträge konnten nicht geladen werden',
      loadingLabel: 'Letzte Einträge werden geladen',
      noSleep: 'Noch keine Schlafeinträge',
      noWorkouts: 'Hier gibt es nichts anzuzeigen.',
      noWorkoutsOfType: 'Für diese Trainingsart gibt es nichts anzuzeigen.',
      notProvided: 'Nicht angegeben',
      partialUnavailable: 'Manche Daten sind gerade nicht verfügbar',
      recentSleep: 'Letzter Schlaf',
      recentWorkouts: 'Letzte Trainings',
      retry: 'Erneut versuchen',
      seeAll: 'Alle ansehen',
      title: 'Letzte Einträge',
      today: 'Heute',
      yesterday: 'Gestern',
    },
    'views/SleepDetail': {
      backToRecent: 'Zurück zu den letzten Einträgen',
      deviceFirmware: 'Firmware',
      deviceId: 'Geräte-ID',
      deviceName: 'Name',
      deviceTitle: 'Gerät',
      deviceUndetermined: 'Gerät unbestimmt',
      durationKicker: 'Schlafdauer',
      footnote:
        'Nur die Phasen-Zusammenfassung, die die Cloud wirklich geliefert hat. Gibt es kein REM-Feld, steht „Nicht angegeben" – nie per Subtraktion errechnet – und eine nicht gelieferte Zeitachse wird nie gezeichnet.',
      heroAria: 'Schlafdauer und Score',
      heroMeta: (fellAsleep: string, wokeUp: string, inBed: string) =>
        `Eingeschlafen ${fellAsleep} · aufgewacht ${wokeUp} · im Bett ${inBed}`,
      hoursAxis: 'Stunden',
      lastCloudSync: (clock: string) => `Letzte Cloud-Synchronisierung ${clock}`,
      loadFailed: 'Schlafdetails sind gerade nicht verfügbar',
      loadFailedTitle: 'Dieser Schlafeintrag konnte nicht gelesen werden',
      loadingDetail: 'Der Schlafeintrag wird gelesen…',
      metaAria: 'Quelle und Gerät',
      notFoundMessage:
        'Er wurde vielleicht aufgeräumt oder ist noch nicht auf diesem Rechner synchronisiert.',
      notFoundTitle: 'Dieser Schlafeintrag ist nicht da',
      notProvided: 'Nicht angegeben',
      retry: 'Erneut versuchen',
      scoreKicker: 'Schlafscore',
      scoreNote: 'Vom Gerät gemeldet; so gezeigt, wie aufgezeichnet – nicht mehr.',
      sourceProvider: 'Anbieter',
      sourceScope: 'Datenbereich',
      sourceTitle: 'Quelle',
      stageHelp:
        'Tiefschlaf: die erholsame Phase. Leichtschlaf: die Übergangsphase, die den Großteil der Nacht einnimmt. REM: Rapid Eye Movement, mit Gedächtnis und Träumen verbunden. Wach: Aufwachen oder wach liegen in der Nacht. Das sind Begriffsklärungen, keine Gesundheitsdiagnose.',
      stageHelpButton: 'Was die Phasen bedeuten',
      stagesAria: 'Schlafphasen',
      stagesTitle: 'Schlafphasen',
      syncTimeMissing: 'Synchronisierungszeit nicht angegeben',
      syncedAt: 'Synchronisiert',
      timezone: 'Zeitzone',
      title: 'Schlafeintrag',
      tooltipRow: (name: string, hours: string) => `${name}: ${hours} Std.<br/>`,
      tooltipRowMissing: (name: string) => `${name}: nicht angegeben<br/>`,
      tooltipTotal: (date: string, hours: string) =>
        `<b>${date} – insgesamt ${hours} Std. geschlafen</b><br/>`,
      weeklyAria: 'Schlaf der letzten 7 Tage',
      weeklyChartAria: 'Gestapeltes Balkendiagramm der Schlafstruktur der letzten 7 Tage',
      weeklySub: 'Phasen pro Nacht gestapelt',
      weeklyTitle: 'Schlafstruktur, letzte 7 Tage',
    },
    'views/SleepList': {
      backToOverview: 'Zurück zur Übersicht',
      backToRecent: 'Zurück zu den letzten Einträgen',
      emptyMessage:
        'Nach einer Synchronisierung erscheinen sie hier. Phasen werden nie erfunden.',
      emptyTitle: 'Noch keine Schlafeinträge',
      footnote: (count: number, from: string) =>
        plural(count, {
          one: `${count} Eintrag · seit ${from}`,
          other: `${count} Einträge · seit ${from}`,
        }),
      intro:
        'Auf diesen Rechner synchronisierte Schlafeinträge. Ohne vollständige Zeitachse wird nur die Zusammenfassung gezeigt.',
      loadFailed: 'Die Schlafliste ist gerade nicht verfügbar',
      loadFailedTitle: 'Die Schlafeinträge konnten nicht gelesen werden',
      loadMore: 'Mehr laden',
      loadingMore: 'Wird geladen…',
      retry: 'Erneut versuchen',
      scoreLabel: 'Score',
      shown: (shown: number, total: number) => `${shown} von ${total} angezeigt`,
      title: 'Schlaf',
    },
    'views/TrainingStatus': {
      acute7d: '7-Tage-Belastung',
      acuteChronic: 'Akut:Chronisch',
      acuteTooltip: (value: string, days: number) =>
        `7-Tage-Belastung <b>${value}</b> (${days}/7 Tage mit Daten)`,
      backToOverview: 'Zurück zur Übersicht',
      balanceChartAria: '7-Tage- und 28-Tage-Trainingsbelastung mit dem Akut-Chronisch-Verhältnis',
      balanceEmpty: 'Noch zu wenig Trainingsbelastungs-Einträge, um diese Linie zu zeichnen.',
      balanceHint: '7-Tage-Belastung gegen den 28-Tage-Wochenschnitt, d. h. das Akut-Chronisch-Verhältnis',
      balanceLabel: 'Trainingsbelastungs-Balance',
      balanceNote:
        'Akut:Chronisch = Summe der letzten 7 Tage ÷ (Summe der letzten 28 Tage ÷ 4). Deckt das 28-Tage-Fenster weniger als 21 Tage ab, gibt es keinen Quotienten und die Linie bricht dort – das ist unberechnet, nicht null.',
      chronicTooltip: (value: string) => `28-Tage-Wochenschnitt <b>${value}</b>`,
      chronicWeekly: '28-Tage-Wochenschnitt',
      desktopOnly:
        'Nutze die Desktop-App. Diese Browser-Vorschau liest keine Kontodaten.',
      eyebrow: 'Trainingsstatus',
      intro:
        'VO₂max, Laktatschwelle, Trainingsbelastung und Herzfrequenzzonen. Alle aus synchronisierten Einträgen gelesen; keine Trainingsratschläge.',
      loadEmpty: 'Keine Trainingsbelastungs-Einträge in diesem Zeitraum.',
      loadFailed: 'Trainingsstatus-Daten sind gerade nicht verfügbar',
      loadHint: 'Täglicher Trainingsbelastungs-Score',
      loadLabel: 'Trainingsbelastung',
      loadUnit: '' as string,
      loadingAria: 'Trainingsstatus wird geladen',
      notProvided: 'Nicht angegeben',
      paiEmpty: 'Keine PAI-Einträge in diesem Zeitraum.',
      paiHint: 'Personal Activity Intelligence über rollende 7 Tage',
      paiLabel: 'PAI',
      rangeAria: 'Zeitraum',
      ratioMissing: (days: number) =>
        `— (nur ${days} Tage mit Daten im 28-Tage-Fenster)`,
      ratioTooltip: (value: string) => `Akut:Chronisch <b>${value}</b>`,
      retry: 'Erneut versuchen',
      thresholdChartAria: 'Laktatschwellen-Herzfrequenz und -Tempo',
      thresholdEmpty: 'Keine Laktatschwellen-Messungen in diesem Zeitraum.',
      thresholdHint: 'Herzfrequenz und Tempo; aktualisiert sich nur nach einem harten Lauf',
      thresholdHr: 'Schwellen-HF',
      thresholdHrTooltip: (value: string) => `Schwellen-HF <b>${value}</b> bpm`,
      thresholdLabel: 'Laktatschwelle',
      thresholdOnce: (date: string) =>
        `Nur eine Schwellenmessung in diesem Zeitraum (${date}) – es gibt keinen Trend zu zeichnen.`,
      thresholdPace: 'Schwellen-Tempo',
      thresholdPaceTooltip: (value: string, unit: string) =>
        `Schwellen-Tempo <b>${value}</b> ${unit}`,
      title: 'Trainingsstatus',
      vo2Empty:
        'Keine VO₂max-Einträge in diesem Zeitraum; er aktualisiert sich nur nach einem Lauf im Freien.',
      vo2Hint: 'Maximale Sauerstoffaufnahme, von der Uhr nach Läufen im Freien geschätzt',
    },
    'views/WorkoutDetail': {
      aiPrompt: (label: string) => `Du bist ein Sportanalyst. Unten steht der vollständige Eintrag einer Trainingseinheit von mir (${label}), aus der lokalen ZeppBridge-Datenbank und anonymisiert.
Analysiere diese Einheit nur anhand der Fakten in diesem Eintrag: die Intensität, wie Tempo und Herzfrequenz zusammenhängen, ob es einen deutlichen Einbruch oder einen auffälligen Abschnitt gibt, und was ich beim nächsten Mal konkret anders machen soll.

Regeln:
- Diese Daten enthalten keinen Bevölkerungsmaßstab. Vergleiche mich nicht mit „gesunden Erwachsenen" oder einem Durchschnitt.
- Wo etwas fehlt, sag, dass es fehlt. Fülle die Lücke nie mit einer Null oder einer Schätzung.
- Keine medizinische Diagnose, keine Krankheitsrisiko-Einschätzung, keine Behandlungsempfehlung.

Antworte in Markdown.`,
      attachmentNotOpened: (provider: string) =>
        `Das Datenpaket wurde auf deinen Desktop geschrieben (zeppbridge-ai-handoff.json). Der Prompt liegt in deiner Zwischenablage; öffne ${provider} selbst.`,
      attachmentOpened: (provider: string) =>
        `Das Datenpaket wurde auf deinen Desktop geschrieben (zeppbridge-ai-handoff.json) – ziehe es in ${provider}. Der Prompt liegt in deiner Zwischenablage.`,
      backToRecent: 'Zurück zu den letzten Einträgen',
      chartAltitude: 'Höhe',
      chartAria: (title: string) => `${title} im Verlauf`,
      chartCadence: 'Schrittfrequenz',
      chartHeart: 'Herzfrequenz',
      chartPace: 'Tempo',
      chartsEmptyBody:
        'Für diese Einheit wurden keine Herzfrequenz-, Tempo-, Höhen- oder Schrittfrequenz-Serien synchronisiert.',
      chartsEmptyTitle: 'Keine Messpunkt-Kurven',
      copied: (format: string) => `${format}-Daten in die Zwischenablage kopiert.`,
      copiedAndOpened: (provider: string) =>
        `Anonymisierte Daten dieses Trainings kopiert und ${provider} geöffnet. Einfügen genügt.`,
      copiedOnly: (provider: string) =>
        `Anonymisierte Daten dieses Trainings kopiert. Öffne ${provider} selbst und füge sie ein.`,
      copyFailed: 'Dieser Eintrag konnte nicht kopiert werden',
      correctionAria: 'Meine Korrektur dieser Trainingsart',
      customName: (code: string, name: string) => `Dein Name für Code ${code}: ${name}`,
      decodedAria: 'Dekodierte Werte',
      decodedAvgCadence: 'Ø Schrittfrequenz',
      decodedAvgPower: 'Ø Leistung',
      decodedAvgStride: 'Ø Schrittlänge',
      decodedBestEquivalentPace: 'Bestes äquivalentes Tempo',
      decodedDescent: 'Gesamtabstieg',
      decodedGroundContact: 'Ø Bodenkontaktzeit',
      decodedLocally: 'Lokal dekodiert',
      decodedMaxCadence: 'Max. Schrittfrequenz',
      decodedMaxHr: 'Maximale Herzfrequenz',
      decodedMaxPower: 'Max. Leistung',
      decodedNote:
        'Die Zusammenfassung wird nur aus gültigen Messwerten dieses Eintrags berechnet; Ausreißer-Sprünge werden ignoriert.',
      decodedPauses: 'Pausenabschnitte',
      decodedRoutePoints: 'GPS-Trackpunkte',
      decodedSamples: 'Zeitreihen-Messwerte',
      decodedTitle: 'Dekodierte Werte',
      decodedVerticalOscillation: 'Ø Vertikaloszillation',
      decodedVerticalRatio: 'Vertikalratio',
      deviceNameMissing: 'Gerätename nicht angegeben',
      exportAria: 'Exportieren und teilen',
      exportFailed: 'Export fehlgeschlagen',
      exportFormatAria: 'Exportformat',
      exportGo: (format: string) => `${format}-Daten kopieren`,
      exportNeedsSeries:
        'Die Messpunkt-Serien ließen sich nicht laden – dieser Eintrag kann nicht exportiert werden.',
      exportSub:
        'JSON, CSV oder GPX kopieren, oder einen Ordner wählen, um dieses Training als FIT zu speichern.',
      exportTitle: 'Exportieren und teilen',
      eyebrowDecoded: 'Dekodiert',
      eyebrowExport: 'Export',
      eyebrowHandoff: 'Übergabe',
      eyebrowHrZones: 'HF-Zonen',
      eyebrowProvenance: 'Herkunft',
      eyebrowRoute: 'Route',
      handTo: (provider: string) => `An ${provider} übergeben`,
      handoffAria: 'An KI übergeben',
      handoffSub:
        'Kopiert die anonymisierten Daten genau dieses einen Trainings plus den Prompt und öffnet die von dir gewählte KI-Seite. Tagesbasierte Datenströme wie Schlaf und Schritte bleiben draußen.',
      handoffTarget: 'Zielwerkzeug',
      handoffTargetAria: 'An welches KI-Werkzeug übergeben',
      handoffTitle: 'An KI übergeben',
      heroAria: 'Trainingsübersicht',
      hrZoneBarAria: 'Zeitanteil in jeder Herzfrequenzzone',
      hrZoneBelow: (upper: number) => `Unter ${upper}`,
      hrZoneBetween: (low: number, high: number) => `${low}–${high}`,
      hrZoneShare: (percent: string) => `${percent} %`,
      hrZoneTotal: (duration: string) => `${duration} mit Herzfrequenz`,
      hrZonesAria: 'Herzfrequenzzonen',
      hrZonesNote:
        'Die Zonengrenzen kommen aus deinen eigenen Einstellungen auf der Uhr und werden von Zepp mit diesem Training mitgeliefert; ZeppBridge schneidet sie nicht neu. Die Trainingsstatus-Seite nutzt ein eigenes, von dir gewähltes Modell – dass die Zahlen nicht übereinstimmen, ist normal.',
      hrZonesTitle: 'Herzfrequenzzonen',
      insightFailed: 'Für dieses Training konnte kein Einblick erstellt werden',
      legendFast: 'Schnell',
      legendSlow: 'Langsam',
      legendSteady: 'Ruhig',
      legendWarm: 'Etwas langsamer',
      loadFailed: 'Trainingsdetails sind gerade nicht verfügbar',
      loadFailedTitle: 'Dieses Training konnte nicht gelesen werden',
      metricAnaerobicEffect: 'Anaerober Trainingseffekt',
      metricAscent: 'Gesamtanstieg',
      metricAvgHr: 'Ø Herzfrequenz',
      metricAvgPace: 'Ø Tempo',
      metricCalories: 'Kalorien',
      metricDistance: 'Distanz',
      metricDuration: 'Trainingsdauer',
      metricElapsedPace: 'Tempo (inkl. Pausen)',
      metricListAria: 'Trainingsleistung im Überblick',
      metricMaxHr: 'Maximale Herzfrequenz',
      metricMovingPace: 'Tempo (in Bewegung)',
      metricMovingTime: 'Zeit in Bewegung',
      metricPausedTime: 'Pausenzeit',
      metricRpe: 'Gefühlte Anstrengung',
      metricTrainingEffect: 'Aerober Trainingseffekt',
      metricTrainingLoad: 'Trainingsbelastung',
      myCorrection: 'Meine Korrektur',
      needDesktop:
        'Die KI-Übergabe braucht die Desktop-App; diese Browser-Vorschau öffnet keine externen Seiten.',
      noCorrection: 'Keine Korrektur',
      notFetchedYet: 'Noch nicht abgerufen',
      notFoundMessage:
        'Es wurde vielleicht aufgeräumt oder ist noch nicht auf diesem Rechner synchronisiert.',
      notFoundTitle: 'Dieses Training ist nicht da',
      notProvided: 'Nicht angegeben',
      overrideCleared: 'Korrektur entfernt. Wieder ZeppBridges eigene Zuordnung.',
      overrideFailed: 'Die Trainingsart-Korrektur konnte nicht gespeichert werden',
      overrideSaved: 'Lokale Trainingsart-Korrektur gespeichert.',
      pageFoot:
        'Auf diesem Rechner dekodiert. Der Track wird auf einer lokalen Leinwand gezeichnet und nie an einen Kartendienst gesendet.',
      preparing: 'Wird vorbereitet…',
      provenanceAria: 'Herkunft',
      provenanceDevice: 'Gerät',
      provenanceProvider: 'Anbieter',
      provenanceRecordId: 'Eintrags-ID',
      provenanceScope: 'Datenbereich',
      provenanceSynced: 'Zuletzt synchronisiert',
      provenanceTitle: 'Herkunft',
      retry: 'Erneut versuchen',
      routeAria: 'Voller GPS-Track',
      routeEmptyBody:
        'Dieser Eintrag bringt nicht genug GPS-Punkte mit, also wird keine Route gezeichnet.',
      routeEmptyTitle: 'Kein nutzbarer Track',
      routeLegendNoPace: 'Weniger als 3 gültige Tempo-Punkte · nicht nach Geschwindigkeit gefärbt',
      routeLegendPace: (count: number) =>
        plural(count, {
          one: `${count} gültiger Tempo-Punkt · P10–P90`,
          other: `${count} gültige Tempo-Punkte · P10–P90`,
        }),
      routeNote: 'Lokal gezeichnet · keine Kartenkacheln angefragt',
      routeSvgAria: 'Lokaler GPS-Track, nach Zeit und nächstem Tempo-Messwert gefärbt',
      routeTitle: 'Voller GPS-Track',
      saveFit: 'FIT-Datei speichern',
      savedFit: 'FIT-Datei gespeichert',
      seriesFailed: 'Die Messpunkt-Serien dieses Trainings konnten nicht gelesen werden',
      seriesFailedTitle: 'Messpunkt-Serien ließen sich nicht laden',
      statAverage: 'Ø',
      statFastest: 'Schnellste',
      statMax: 'Max.',
      statMin: 'Min.',
      statSlowest: 'Langsamste',
      thisWorkout: 'Training',
      timeUnknown: 'Zeit unbekannt',
      typeEvidenceAria: 'Wie die Trainingsart bestimmt wurde',
      unitKcal: 'kcal',
      zeppBridgeMatch: (label: string) => `ZeppBridge liest es als: ${label}`,
      zeppRawCode: (code: string) => `Zepp-Rohcode: ${code}`,
    },
    'views/WorkoutList': {
      backToOverview: 'Zurück zur Übersicht',
      backToRecent: 'Zurück zu den letzten Einträgen',
      emptyMessage:
        'Nach einer Synchronisierung erscheinen hier nur Einträge mit Typ, Zeit und mindestens einer echten Metrik. Ohne GPS oder Messpunkt-Serien wird kein leeres Diagramm gezeichnet.',
      emptyTitle: 'Noch nichts anzuzeigen',
      footnote: (count: number) =>
        plural(count, {
          one: `${count} Eintrag angezeigt`,
          other: `${count} Einträge angezeigt`,
        }),
      intro: 'Auf diesen Rechner synchronisierte Trainings. Kein Track, keine Karte.',
      labelBurn: 'Verbrauch',
      labelDistance: 'Distanz',
      labelDuration: 'Dauer',
      loadFailed: 'Die Trainingsliste ist gerade nicht verfügbar',
      loadFailedTitle: 'Die Trainings konnten nicht gelesen werden',
      loadMore: 'Mehr laden',
      loadingMore: 'Wird geladen…',
      notProvided: 'Nicht angegeben',
      retry: 'Erneut versuchen',
      shown: (loaded: number, total: number) => `${loaded} von ${total} geladen`,
      title: 'Trainings',
    },
  },
} satisfies LocalePack;
