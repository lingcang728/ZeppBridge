import type { LocalePack } from '../index';

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
    // ── views/Explore ──
    // cellTypesValue / categoryTraining bleiben in pending: identisch mit en
    // (nackte Zahl bzw. das Lehnwort „Training").
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
    // Bleiben in pending (identisch mit en / bewusst unübersetzt):
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
      notProvided: 'Keine Daten',
      noRecords: 'Noch keine Einträge',
      timeUnknown: 'Zeit unbekannt',
      cloudService: 'Cloud-Dienst',
      refreshFailed: (reason: string) => `Erkennung fehlgeschlagen; auf den lokalen Cache zurückgefallen${reason}`,
      refreshFailedReason: (reason: string) => `: ${reason}`,
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
        spo2: 'Nächtliche SpO₂-Werte',
        respiratory_rate: 'Atemfrequenz',
        recovery: 'Bereitschaft und Energie',
        training_load: 'Trainingsbelastung',
        lactate_threshold: 'Laktatschwelle',
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
  },
} satisfies LocalePack;
