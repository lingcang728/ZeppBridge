import type { LocalePack } from '../index';

/**
 * Nederlands (nl) language pack.
 *
 * Overrides the inline zh/en/es copy per moduleId; missing keys fall back
 * to en (then zh) and stay listed in `nl.pending.txt` until translated.
 * Only modules whose `defineMessages` call declares a moduleId can be
 * overridden here — currently `views/Explore`, `views/Settings` and the
 * `i18n/errors` pack (`errors:` section), plus the flat `backendText:`
 * fallback map for backend-declared `ui.*` prose codes.
 */
export default {
  modules: {
    'views/Explore': {
      approxMinutes: (minutes: number) => `(ongeveer ${minutes} min)`,
      attachmentNotOpened: (notice: string, provider: string) =>
        `${notice} Open ${provider} in een browser om het te analyseren.`,
      attachmentNotice:
        'Het gegevenspakket is naar je bureaublad geschreven (zeppbridge-ai-handoff.json) — sleep het in de AI-chat. De prompt staat op je klembord.',
      attachmentOpened: (notice: string, provider: string) => `${notice} ${provider} is geopend.`,
      backToDateRange: 'Terug naar een datumbereik',
      categoryAll: 'Alle sjablonen',
      categoryAria: 'Sjablooncategorieën',
      categoryRecovery: 'Herstel',
      categorySleep: 'Slaap',
      categorySummary: 'Samenvatting',
      categoryTitle: 'Categorieën',
      categoryTraining: 'Trainingen',
      cellCount: 'Aantal records',
      cellCountSub: 'gesynchroniseerde records',
      cellRange: 'Tijdsperiode',
      cellSize: 'Grootte',
      cellSizeSub: 'geschat',
      cellTypes: 'Gegevenstypen',
      cellTypesSub: 'in het pakket',
      cellTypesValue: (count: number) => `${count}`,
      copiedAndOpened: (provider: string) =>
        `Geanonimiseerde gegevens gekopieerd en ${provider} geopend. Plak het erin om te beginnen.`,
      copiedOnly: (provider: string) =>
        `Geanonimiseerde gegevens gekopieerd. Open ${provider} zelf en plak het erin.`,
      copyFailed: 'Kopiëren is mislukt. Probeer het opnieuw.',
      copyPrompt: 'Prompt kopiëren',
      copyPromptOnly: 'Alleen prompt kopiëren',
      copyPromptTitle: 'Kopieer de prompttekst naar het klembord',
      currentTemplate: 'Huidig sjabloon',
      datePickerAria: 'Datumkiezer',
      detailAria: 'Detailniveau',
      detailGroup: 'Detailniveau',
      endDate: 'Einddatum',
      estimatedSize: 'Geschatte pakketgrootte',
      exportFile: (format: string) => `Exporteer ${format}-bestand`,
      formatAria: 'Exportformaat',
      formatCsvSub: 'Samenvattingstabel (geen reeksen per punt)',
      formatFitSub: 'Eén bestand per training, opgeslagen in de map die je kiest',
      formatGpxSub: 'Alleen trainingen met een GPS-track',
      formatGroup: 'Exportformaat',
      formatJsonSub: 'Volledige gestructureerde gegevens',
      handTo: (provider: string) => `Doorgeven aan ${provider}`,
      injected: (count: number) => `${count} gegevensstromen bijgevoegd`,
      intro:
        'Kies een sjabloon, controleer wat het pakket echt bevat, en stuur je draagbare gegevens naar de AI-tool van je keuze.',
      needDataTypes: 'Kies minstens één gegevenstype.',
      needDesktop:
        'De AI-overdracht heeft de desktop-app nodig; deze browserpreview opent geen externe sites.',
      needValidDates: 'Kies eerst een geldige datumperiode.',
      noTemplates: 'Geen passend sjabloon.',
      noTypesSelected: 'Geen gegevenstype geselecteerd, dus de export wordt geweigerd.',
      nothingInScope: 'Niets gesynchroniseerd in deze periode om over te dragen.',
      onlyThisWorkout: 'alleen deze training',
      packContentsExcluded:
        'Niet inbegrepen: .tcx, accountgegevens, tokens of apparaatserienummers. GPS-tracks verschijnen in de GPX- en FIT-formaten, en alleen voor trainingen die een track hebben. FIT schrijft één bestand per training naar een map die je kiest.',
      packContentsIncluded:
        'Inbegrepen: trainingssamenvattingen (type, begin en einde, afstand, calorieën, gemiddelde en piekhartslag, trainingsbelasting), dagelijkse metrieken (stappen, rusthartslag, HRV, SpO2, stress, ademhalingsfrequentie, PAI, VO2max) en slaapsessies met hun stadiumtijdlijn. "Volledig" voegt trainingsreeksen per seconde en afzonderlijke hartslagmetingen toe.',
      packContentsTitle: 'Wat de export bevat',
      packSub: 'Kies het exportformaat en de AI-tool.',
      packTitle: 'Verpakken en versturen',
      preparing: 'Voorbereiden…',
      previewDesktopOnly: 'Open dit in de ZeppBridge-desktop-app; de preview leest lokale gegevens.',
      previewFailed: 'De lokale exportpreview kon niet worden gelezen',
      previewRetry: 'Opnieuw proberen',
      promptCopied: 'Prompt gekopieerd (zonder gegevens).',
      promptEditor: 'Prompteditor',
      promptEditorAria: 'Promptbewerker',
      promptEditorHint: ' (gegevens worden automatisch uitgelijnd)',
      providerIconAlt: (provider: string) => `${provider}-icoon`,
      quickRange: 'Snelle periode:',
      range30: '30 dagen',
      range7: '7 dagen',
      rangeDays: (days: number) => `(${days} dagen)`,
      reopened: (provider: string) => `${provider} is geopend. Plak de gegevens daar.`,
      retryOpen: (provider: string) => `Open ${provider} opnieuw`,
      secureNote:
        'Alles wordt lokaal opgebouwd: de gestructureerde gegevens en de prompt worden op deze machine gegenereerd.',
      secureOk: 'Alleen lokaal',
      selectAll: 'Alles',
      selectNone: 'Niets',
      selectedCount: (selected: number, total: number) => `${selected} van ${total} geselecteerd`,
      sendHint:
        'Tot 2 MiB gaat automatisch mee op het klembord met de prompt. Daarboven wordt de JSON naar je bureaublad geschreven om in de chat te slepen.',
      startDate: 'Startdatum',
      stillReading: 'Lokale gegevens worden nog gelezen. Probeer het zo opnieuw.',
      streamsGroup: 'Gegevensstromen',
      summaryHint: 'Alleen wat je aanvinkt',
      summaryTitle: 'Wat het pakket bevat',
      targetAria: 'AI-tool van bestemming',
      targetGroup: 'AI-tool van bestemming',
      templateListTitle: 'Sjablonen',
      templateSearchAria: 'Sjablonen zoeken',
      templateSearchPlaceholder: 'Sjablonen zoeken…',
      templates: {
        activity: {
          name: 'Activiteitsoverzicht',
          prompt: `Je bent een adviseur voor een gezonde levensstijl.
Analyseer aan de hand van de ZeppBridge-gegevens over stappen, trainingen en hartslag hieronder
mijn dagelijkse activiteitsniveau en hoe dat zich ontwikkelt,
en geef daarna praktische manieren om meer te bewegen.

Antwoord in Markdown.`,
          sub: 'Dagelijkse beweging en de trend daarin',
        },
        performance: {
          name: 'Prestatiesamenvatting',
          prompt: `Je bent een sport- en gezondheidsanalist die gegevens van draagbare apparaten omzet in helder, bruikbaar inzicht.
Schrijf aan de hand van de ZeppBridge-gegevens hieronder (al in chronologische volgorde)
een duidelijke, goed gestructureerde samenvatting van mijn algehele prestaties.
Behandel het totaalbeeld, de trends die ertoe doen, wat opvalt, waar ik op moet letten en waar ik iets aan kan doen.
Waar de gegevens dun zijn, zeg dat ronduit en vertel wat ik moet verzamelen in plaats van te gokken.

Antwoord in Markdown, met tabellen, lijsten en opsommingen waar die helpen.
Houd de toon professioneel, beknopt en constructief.`,
          sub: 'Een heldere lezing van hoe het gaat',
        },
        recovery: {
          name: 'Herstel en gereedheid',
          prompt: `Je bent een fysioloog gespecialiseerd in herstel.
Beoordeel aan de hand van de ZeppBridge-gegevens over HRV, rusthartslag, slaap en stress hieronder
hoe hersteld ik ben en hoe klaar ik ben om te trainen,
noem de signalen van opeenhoppende vermoeidheid en vertel wat zou helpen.

Antwoord in Markdown.`,
          sub: 'Herstel, HRV en trainingsgereedheid',
        },
        sleep: {
          name: 'Slaapanalyse',
          prompt: `Je bent een slaapgezondheidsadviseur.
Analyseer aan de hand van de ZeppBridge-gegevens over slaapstadia, -duren en hartslag hieronder
de kwaliteit en regelmaat van mijn slaap en wat die lijkt te beïnvloeden,
en geef me daarna concrete, uitvoerbare manieren om die te verbeteren.

Antwoord in Markdown.`,
          sub: 'Slaapkwaliteit en regelmaat',
        },
        training: {
          name: 'Trainingsinzicht',
          prompt: `Je bent een ervaren duurtrainer.
Analyseer aan de hand van de ZeppBridge-trainingsgegevens hieronder (hartslag, trainingsbelasting en VO₂max)
de structuur van mijn training, hoe de intensiteit is verdeeld en waarheen de belasting gaat.
Wijs aan wat er mis is met hoe de sessies zijn gerangschikt, en vertel wat ik volgende cyclus moet veranderen.

Antwoord in Markdown. Wees direct.`,
          sub: 'Trainingsbelasting en waar die heen gaat',
        },
        weekly: {
          name: 'Weekterugblik',
          prompt: `Je bent mijn persoonlijke gezondheidscoach en bekijkt mijn gegevens een keer per week.
Vergelijk me aan de hand van de ZeppBridge-gegevens van deze week hieronder alleen met mijn eigen eerdere gegevens.
Vat samen wat er deze week veranderde, noem wat goed ging en wat aandacht verdient, en geef me een korte lijst met dingen om volgende week te doen.

Randvoorwaarden:
- Deze gegevens bevatten geen populatiebasislijn. Vergelijk me niet met "gezonde volwassenen" of met een gemiddelde.
- Waar iets ontbreekt, zeg dat het ontbreekt. Vul het gat nooit met een nul of een schatting.
- Geen medische diagnose, geen oordeel over ziekterisico, geen behandeladvies.

Antwoord in Markdown.`,
          sub: 'Een wekelijkse terugblik met details',
        },
      },
      thisWorkout: 'Deze training',
      title: 'Doorgeven aan AI',
      workoutScopeBanner: (workoutId: string) =>
        `Er wordt alleen training ${workoutId} geëxporteerd: de training zelf plus de per-punt-metingen die tijdens het lopen zijn vastgelegd. Stromen per dag zoals slaap en stappen blijven erbuiten. Het datumbereik is niet actief.`,
    },
    'views/Settings': {
      accountLine: (region: string, lastSync: string) =>
        `Regio ${region} · laatste sync ${lastSync}`,
      accountTitle: '2. Account en regio',
      advancedSub:
        'Schaling, de gegevensmap en het wissen van inloggegevens. Alleen als je ze nodig hebt.',
      advancedTitle: 'Geavanceerd en onderhoud',
      apiAuthNoteA: 'Elk verzoek moet ',
      apiAuthNoteB:
        ' meedragen, anders krijgt het een 401. Opnieuw genereren maakt het oude token direct ongeldig.',
      apiBindNote:
        'Alleen gebonden aan 127.0.0.1: alleen-lezen, geen cross-origin-toegang voor browsers, en het geeft geen inloggegevens terug. Het stopt zodra je ZeppBridge afsluit.',
      apiCopy: 'Kopiëren',
      apiCopyExample: 'Een voorbeeld met authenticatie kopiëren',
      apiDisabled: 'De lokale API is uit en de poort is vrijgegeven.',
      apiEnabled: 'De lokale API is aan. Herstarten is niet nodig.',
      apiEnabledNotListening: 'Ingeschakeld maar luistert niet',
      apiExampleCopied:
        'Het voorbeeld met authenticatie is gekopieerd (het bevat je toegangstoken).',
      apiExampleCopyFailed:
        'Het voorbeeld kon niet worden gekopieerd. Zet de endpoint-URL en de Authorization-header zelf bij elkaar.',
      apiHide: 'Verbergen',
      apiListening: 'Luistert',
      apiOff: 'Uit',
      apiRegenerate: 'Opnieuw genereren',
      apiRegenerateConfirm:
        'Opnieuw genereren maakt het oude token direct ongeldig, en elk lokaal programma dat ermee is geconfigureerd moet worden bijgewerkt. Doorgaan?',
      apiRegenerateFailed: 'Het toegangstoken kon niet opnieuw worden gegenereerd',
      apiShow: 'Tonen',
      apiSub:
        "Laat andere programma's op deze machine genormaliseerde trainingsreeksen als JSON lezen. Standaard uit; je zet het zelf expliciet aan.",
      apiTitle: 'Lokale REST-API',
      apiToggleAria: 'De lokale REST-API inschakelen',
      apiToggleFailed: 'De lokale API kon niet worden omgeschakeld',
      apiToggleSub: (address: string) =>
        `Werkt direct, geen herstart nodig. Uitschakelen geeft ${address} meteen vrij.`,
      apiToggleTitle: 'De lokale API inschakelen',
      apiTokenCopied: 'Toegangstoken naar het klembord gekopieerd.',
      apiTokenCopyFailed:
        'Kon niet naar het klembord schrijven. Druk op "Tonen" en kopieer het handmatig.',
      apiTokenLabel: 'Toegangstoken',
      apiTokenReadFailed: 'Het toegangstoken van de lokale API kon niet worden gelezen',
      apiTokenRegenerated: 'Er is een nieuw toegangstoken gegenereerd. Het oude is ongeldig.',
      authCancelLogin: 'Inloggen annuleren',
      authCleared:
        'Uitgelogd. Alles wat al naar deze machine is gesynchroniseerd is er nog.',
      authCollapse: 'Inklappen',
      authHarSub: 'Voor gevorderden en debugging: een HAR-bestand importeren',
      authHarTitle: 'HAR-import',
      authInUse: 'In gebruik',
      authManualSub: 'Voer appToken, user_id en regio-host in',
      authManualTitle: 'Zelf invoeren',
      authOpening: 'Openen…',
      authRetry: 'Opnieuw proberen te koppelen',
      authTitle: '1. Inloggen',
      authUse: 'Gebruiken',
      authWebSub: 'Log in op de officiële pagina; het appToken wordt voor je opgepikt',
      authWebTitle: 'Officiële web-login',
      backfillConfirm: (days: number, low: number, high: number, extra: string) =>
        `${days} dagen ophalen duurt grofweg ${low}–${high} minuten (geschat). Houd de app open; annuleren kan altijd.${extra}`,
      backfillTightSpace: (message: string, days: number) =>
        `${message}\nToch ${days} dagen ophalen? Overweeg eerst 30 dagen.`,
      backfillYearCap:
        '\nEén jaar is de limiet; oudere cloudgegevens komen niet naar deze machine.',
      backupLabel: 'Databasemomentopnamen en herstel',
      backupNote:
        'Een kopie van de hele database voor noodherstel, alleen door ZeppBridge terug te lezen. Voor een database-upgrade wordt er automatisch een gemaakt; handmatig hoeft het zelden.',
      buildStamp: (stamp: string) => `Build ${stamp}`,
      cancel: 'Annuleren',
      capabilityCloud: (records: number, unit: string, latest: string) =>
        `${records} ${unit} in de cloud${latest ? ` · t/m ${latest}` : ''}`,
      capabilityEmptyBody: 'Deze lichten op na één synchronisatie.',
      capabilityEmptyTitle: 'Nog niet gesynchroniseerd',
      capabilityIntro:
        'Wat ZeppBridge nu uit je account kan lezen. Deze lijst werkt zichzelf bij tijdens een synchronisatie; er is niets om in te drukken.',
      capabilityLocal: (records: number, unit: string, latest: string) =>
        `${records} ${unit}${latest ? ` · t/m ${latest}` : ''}`,
      capabilityNoRecords: (days: number) => `Niets vastgelegd in de afgelopen ${days} dagen`,
      capabilityNoneProbed: (days: number) => `Geen meting in de afgelopen ${days} dagen`,
      capabilityNotIngested:
        'De cloud heeft records, maar er is nog geen bruikbare data lokaal opgeslagen. Probeer te synchroniseren of op te halen; als records dan nog niet verschijnen, heeft hun payloadformaat mogelijk extra ondersteuning nodig.',
      capabilityNotProbed: 'Nog niet getest',
      capabilityTitle: 'Wat je apparaten kunnen leveren',
      capabilityUnsupported: 'Je account of apparaat levert dit niet',
      cleaningUp: 'Opschonen…',
      cleanupConfirm: (days: number) =>
        `Lokale gegevens ouder dan ${days} dagen opschonen? Dit kan niet ongedaan worden.`,
      cleanupDone: (days: number) => `Gegevens ouder dan ${days} dagen zijn opgeschoond.`,
      cleanupFailed: 'Opschonen van oude gegevens is mislukt',
      cleanupNow: 'Nu opschonen',
      clearAuth: 'Inloggegevens wissen',
      clearAuthConfirm:
        'Uitloggen van dit account?\n\nAlleen de inloggegevens worden gewist; alles wat al naar deze machine is gesynchroniseerd blijft bewaard.\n\nLet op: wisselen tussen accounts wordt nog niet ondersteund — inloggen met een ander account schrijft beide accounts in dezelfde lokale database.',
      clearAuthFailed: 'De inloggegevens konden niet worden gewist',
      closeDialog: 'Dialoog sluiten',
      cloudService: 'Clouddienst',
      codeCleared: (code: number) => `De eigen naam voor code ${code} is gewist.`,
      codeFootnote:
        'De naam blijft op deze machine, wordt nooit teruggestuurd naar Zepp, en blijft bestaan bij opnieuw parseren. Sla leeg op om hem te wissen.',
      codeInputAria: (code: number) => `Eigen naam voor code ${code}`,
      codeInputPlaceholder: 'Geef het een naam, bijv. Mijn coresessie',
      codeNumber: (code: number) => `Zepp-code ${code}`,
      codeRecords: (count: number) => `${count} lokale records krijgen die naam mee`,
      codeSave: 'Opslaan',
      codeSaveFailed: 'De eigen trainingsnaam kon niet worden opgeslagen',
      codeSaved: (code: number, label: string) => `Code ${code} wordt nu getoond als "${label}".`,
      codeSaving: 'Opslaan…',
      codeShownAs: (label: string) => `Wordt nu getoond als "${label}"`,
      codeShownAsUnknown: (code: number) =>
        `Wordt nu getoond als "Niet-herkende training (code ${code})"`,
      codeSuggestions: ['Krachttraining', 'Core', 'HIIT', 'Rekken', 'Revalidatie', 'Eigen sessie'],
      codesIntro:
        'De aangepaste trainingssjablonen van Zepp geven een nummer en geen naam, en de ingebouwde catalogus heeft er ook niets voor. In plaats van een sport te gokken en aan je voor te schotelen, geef je de code eenmalig zelf een naam — elk record met die code gebruikt dan jouw naam, en de trainingspagina zegt er eerlijk bij dat die van jou is.',
      codesTitle: 'Niet-herkende trainingscodes',
      codesUnnamed: (count: number) => `${count} nog zonder naam`,
      compactDone: (count: number, before: string, after: string, saved: string, skipped: string) =>
        `${count} payloads gecomprimeerd, ${before} → ${after}, ${saved} bespaard${skipped}.`,
      compactFailed: 'Comprimeren van de opgeslagen payloads is mislukt',
      compactLabel: 'Opgeslagen payloads comprimeren',
      compactNoteA:
        'Ruwe cloudpayloads nemen het meeste van deze database in. Het is JSON-tekst en comprimeert meestal tot ongeveer een vijfde.',
      compactNoteB:
        ': de eerste keer dat een nieuwe versie start comprimeert de achtergrond wat er is opgeslagen, een banner meldt dat, en hij verdwijnt als het klaar is. Deze knop draait het alleen nog eens handmatig (bijvoorbeeld als het was onderbroken). Voordat iets wordt vervangen wordt het eerst gedecomprimeerd en byte voor byte vergeleken; een payload die niet klopt wordt overgeslagen — de ruwe payload is de enige basis voor een herverwerking, dus liever ongemoeid laten. Daarna draait een VACUUM, en dat is wat het bestand op schijf echt kleiner maakt.',
      compactNoteStrong: 'Dit gebeurt automatisch',
      compactRun: 'Opgeslagen payloads comprimeren',
      compactSkipped: (count: number) =>
        `, ${count} overgeslagen (niet kleiner na comprimeren, of de controle kwam niet overeen)`,
      compacting: 'Comprimeren… (een paar minuten op een grote database)',
      connExtracting: 'De inloggegevens worden uitgepakt',
      connFailed: 'Inloggen mislukt',
      connVerifying: 'Verifiëren',
      connWaiting: 'Wachten op inloggen',
      dataAuthLabel: 'Gegevens en inloggegevens',
      dataAuthNote: (days: number) =>
        `Gegevens staan in de gegevensmap van de app; er worden nu ${days} dagen bewaard.`,
      days: (days: number) => `${days} dagen`,
      defaultFormatAria: 'Standaard exportformaat',
      defaultFormatLabel: 'Standaard exportformaat',
      deviceErrorPrefix: 'Apparaatherkenning: ',
      deviceFirmware: (firmware: string) => `Firmware ${firmware}`,
      deviceIdLine: (masked: string) => `Apparaat-id ${masked}`,
      deviceLatestData: 'Laatste gegevens',
      devicesTitle: '3. Verbonden apparaten / gegevensbronnen',
      displayPrefsTitle: 'Taal en notaties',
      distanceUnitLabel: 'Afstandseenheid',
      exportNote:
        'Stelt het standaardformaat op de pagina "Doorgeven aan AI" en het venster voor ophalen uit de cloud in.',
      exportTitle: '7. Export- en ophaalvoorkeuren',
      filePickerFailed: 'De bestandskiezer kon niet worden geopend',
      fillAllFields: 'Vul elk verplicht veld in',
      formatCsvHint: 'Tabelgegevens',
      formatGpxHint: 'Trainingstracks',
      formatJsonHint: 'Gestructureerde gegevens',
      harFilter: 'HAR-bestand',
      harImportFailed: 'De HAR-import is mislukt',
      harImported: 'HAR-bestand geïmporteerd; de inloggegevens zijn opgeslagen.',
      healthCheckLabel: 'Gegevensgezondheidscontrole',
      healthCheckNote:
        'Hoe ver elke gegevensstroom kwam met ophalen uit de cloud, parsen en lokaal schrijven; welke datums het dekt; waar het vandaan kwam. Niet om dagelijks te bekijken — kom hier als een synchronisatieresultaat niet klopt met wat je verwachtte.',
      healthCheckOpen: 'De gegevensgezondheidscontrole openen',
      historyRangeAria: 'Aantal dagen historie ophalen',
      historyRangeLabel: 'Bereik voor ophalen van historie',
      identifyDevices: 'Apparaten opnieuw herkennen',
      identifying: 'Herkennen…',
      intro: 'Inloggen, synchronisatiegedrag, privacy en de exportvoorkeuren — alles op één plek.',
      lampOff: (count: number) => `Niet opgehaald ${count}`,
      lampOn: (count: number) => `Opgehaald ${count}`,
      lampPending: (count: number) => `In de cloud, niet lokaal opgeslagen ${count}`,
      lastDays: (days: number) => `Afgelopen ${days} dagen`,
      localApiLabel: 'Lokale REST-API',
      localApiNote:
        "Voor andere programma's op deze machine — scripts, dashboards, je eigen tools — om genormaliseerde trainingsreeksen als JSON te lezen. Heb je dat niet nodig, laat het dan uit.",
      loginCancelFailed: 'Het inloggen kon niet worden geannuleerd',
      loginIncomplete: 'Inloggen is niet afgerond',
      loginWindowFailed: 'Het inlogvenster kon niet worden geopend',
      logout: 'Uitloggen',
      logoutHint:
        'Logt alleen uit van het account. Alles wat al naar deze machine is gesynchroniseerd blijft bewaard, en synchroniseren hervat zodra je weer inlogt.',
      logoutNoMultiAccount:
        'Wisselen tussen accounts wordt nog niet ondersteund: log je daarna met een ander account in, dan schrijven beide accounts in dezelfde lokale database.',
      manualAuthDone: 'Handmatig inloggen gelukt; de inloggegevens zijn opgeslagen.',
      manualAuthFailed: 'Handmatig inloggen mislukt',
      manualFormHint:
        'Haal ze uit een mitmproxy/Charles-opname of de devtools van je browser. Drie velden:',
      manualFormTitle: 'De inloggegevens invoeren',
      manualSave: 'Inloggegevens opslaan',
      manualSaving: 'Opslaan…',
      manualTokenPlaceholder: 'Kopiëren uit de apptoken-HTTP-header',
      manualUserIdPlaceholder: 'Halen uit het URL-pad /users/{user_id}/',
      mcpAskA: 'De setup verschilt per tool, dus in plaats van hier een essay te schrijven: ',
      mcpAskB: ' en laat die je op je eigen machine erdoorheen lopen.',
      mcpAskStrong: 'kopieer de tekst hieronder naar de AI die je echt gebruikt',
      mcpBadge: 'Alleen-lezen · luistert op geen poort',
      mcpCompareA:
        'In één zin: "Doorgeven aan AI" is dat jij exporteert en plakt; MCP is ',
      mcpCompareB:
        ' — eenmaal geconfigureerd zeg jij "hoe heb ik deze maand geslapen" en het bevraagt je lokale database. Alleen nuttig voor AI-codetools die op je computer zijn geïnstalleerd (Claude Code, Codex, Grok e.d.).',
      mcpCompareStrong: 'de AI die zelf vraagt',
      mcpConfigCopied:
        'Config gekopieerd. Vervang command door het echte pad naar zeppbridge-mcp op je machine.',
      mcpConfigCopyFailed: 'Kopiëren mislukt. Selecteer de config hierboven handmatig.',
      mcpConfigPathPlaceholder: '<pad naar zeppbridge-mcp>',
      mcpCopyConfig: 'Alleen het config-fragment kopiëren',
      mcpCopyPrompt: 'Kopieer dit en vraag het je AI',
      mcpFootA:
        ' wordt meegeleverd in het tools-archief bij elke release, in dezelfde versie als de desktop-app. Het leest dezelfde lokale database, dus wat het ziet is precies wat jij hier ziet.',
      mcpPromptCopied:
        'Gekopieerd. Plak het bij de AI die je gebruikt en hij geeft je de stappen voor jouw machine.',
      mcpPromptCopyFailed: 'Kopiëren mislukt. Selecteer de tekst hierboven handmatig.',
      mcpSetupPrompt: `Ik gebruik een Windows-desktop-app genaamd ZeppBridge die de gegevens van mijn Amazfit- / Zepp-horloge naar een lokale SQLite-database synchroniseert.
Er wordt een MCP-programma meegeleverd (zeppbridge-mcp) en ik wil het bij jou configureren, zodat je mijn trainingen en gezondheidsgegevens direct kunt bevragen in plaats van dat ik elke keer exporteer en plak.

Wat ik ervan weet:
- Het MCP-programma komt uit het zeppbridge-tools-archief op de GitHub Releases-pagina van ZeppBridge; pak het uit en zeppbridge-mcp zit erin. Ik heb het mogelijk nog niet gedownload.
- Het is een stdio-MCP-server. Het leest de lokale database, gebruikt geen netwerk, luistert op geen poort en heeft geen token of API-key nodig.
- De gebruikelijke configvorm is: {"mcpServers": {"zeppbridge": {"command": "<volledig pad naar zeppbridge-mcp>", "args": []}}}
- Het biedt vijf alleen-lezen-tools: list_workouts, get_workout_insight (één training tegenover mijn eigen basislijn), get_metric_series (metriekreeksen per dag), get_sleep_detail (één nacht, stadium voor stadium) en get_data_health (status van ophalen/parsen/schrijven per stroom).

Vertel me:
1. Voor jou specifiek — de tool waarmee ik nu praat — in welk bestand de config gaat, of met welk commando ik die toevoeg;
2. Hoe ik een Windows-pad schrijf (moeten backslashes worden ge-escaped);
3. Hoe ik controleer dat het werkt zodra het is geconfigureerd.

Als je iets van me nodig hebt (welke client ik gebruik, waar het bestand staat), vraag het gewoon.`,
      mcpSkip:
        'Zegt MCP je niets, sla dit deel dan over — het raakt geen enkele functie van ZeppBridge.',
      mcpTitle: '5. MCP (laat AI-tools je lokale gegevens bevragen)',
      mcpToolDataHealth: 'Status van ophalen/parsen/schrijven per stroom',
      mcpToolListWorkouts: 'Trainingslijst, nieuwste eerst',
      mcpToolMetricSeries: 'Metriekreeksen per dag, elk met zijn eenheid',
      mcpToolSleepDetail: 'Eén nacht slaap, stadium voor stadium',
      mcpToolWorkoutInsight: 'Eén training tegenover je eigen basislijn',
      mcpToolsLead: 'Eenmaal geconfigureerd kan de AI naar deze vijf dingen vragen:',
      minutes: (minutes: number) => `${minutes} min`,
      noDevices:
        'Nog geen fysiek apparaat herkend; Zepp-cloud synchroniseert nog steeds als cloudbron.',
      noRecords: 'Nog geen records',
      noSyncDiagnostics: 'Nog geen synchronisatiediagnostiek.',
      notProvided: 'Niet verstrekt',
      nothingToCompact:
        'Niets te comprimeren — de opgeslagen payloads zijn al gecomprimeerd.',
      openDataFolder: 'De gegevensmap openen',
      openFolderFailed: 'De gegevensmap kon niet worden geopend',
      prefsSaveFailed: 'De instellingen konden niet worden opgeslagen',
      prefsSaved: 'Bewaar- en ophaalinstellingen opgeslagen.',
      prefsSavedNoEstimate:
        'Instellingen opgeslagen, maar de schijfruimteschatting is nu niet beschikbaar',
      privacyDbBody:
        'Gezondheidsgegevens worden als gewone SQLite opgeslagen in de gegevensmap van de app, beschermd door je Windows- / macOS-account en schijfversleuteling. ZeppBridge versleutelt de hele database niet, en doet niet alsof.',
      privacyDbTitle: 'De lokale database is niet versleuteld',
      privacyModalLink: 'Lees de lokale privacyprincipes',
      privacyModalOk: 'Begrepen',
      privacyModalTitle: 'Lokale privacyprincipes van ZeppBridge',
      privacyPoint1:
        'alle gezondheids- en trainingstijdreeksen leven alleen in de lokale SQLite-database; parsen en anonimiseren gebeuren volledig op deze machine.',
      privacyPoint1Title: '1. Lokaal eerst: ',
      privacyPoint2:
        'het App Token en de User ID worden met geen derde gedeeld, en een AI-export anonimiseert ze onomkeerbaar.',
      privacyPoint2Title: '2. Inloggegevens blijven gescheiden: ',
      privacyPoint3:
        'GPS-coördinaten gaan standaard nooit naar het AI-klembord, waardoor je huis en vaste routes privé blijven.',
      privacyPoint3Title: '3. Locatie onder controle: ',
      privacyPoint4:
        'pas nadat jij "Een foutrapport versturen" indrukt en bevestigt verstuurt het een vaste whitelist van diagnostiek op productniveau. Het verstuurt nooit je account, apparaat-id\'s, trainingsdetails of gezondheidsgegevens, en opent nooit een GitHub-issue voor je.',
      privacyPoint4Title: '4. Foutrapporten zijn jouw keuze: ',
      privacyPoint5:
        'de hele codebase is open, zonder verborgen naar-huis-bel-logica.',
      privacyPoint5Title: '5. Overal open source: ',
      privacyReportBody:
        'Geen GitHub-account, geen gekopieerde gegevens. Bij bevestiging verstuurt het alleen veldvormen op productniveau, firmwareversie, nummers op modelniveau (gehele getallen, die alleen zeggen welk model het is), en onbekende trainingscodes met hun aantallen, naar de private foutrapportopslag van ZeppBridge. Het verstuurt nooit je account, tokens, serienummers, apparaat-id\'s, MAC-adressen, GPS, gezondheidswaarden, ruwe antwoorden of lokale paden.',
      privacyReportTitle: 'Een apparaat of training niet herkend?',
      privacyTelemetryBody:
        'De app meldt zelf geen gebruiksgedrag. Alleen als jij zelf "Een foutrapport versturen" indrukt, verstuurt het de geanonimiseerde velden die hieronder staan.',
      privacyTelemetryTitle: 'Geen telemetrie, geen gebruiksstatistieken',
      privacyTitle: '4. Privacy en beveiliging',
      privacyTokenBody:
        'De standaard is Windows Credential Manager / macOS Keychain / Linux-sleutelring. macOS en Linux kunnen expliciet een gewoon-tekst-inlogbestand gebruiken dat alleen door jouw gebruiker lees- en schrijfbaar is; Linux ondersteunt ook omgevingsvariabelen. auth.json bevat alleen account- en regio-metadata. Tokens komen nooit in logs, data-exports of foutrapporten terecht.',
      privacyTokenTitle:
        'Zepp-tokens gebruiken standaard de systeemopslag voor inloggegevens',
      probeEmpty: 'geen gegevens',
      probeFailed: 'verzoek mislukt',
      probeNote:
        '"Niet opgehaald" betekent niet dat het apparaat het mist: de endpoints van Zepp geven een leeg antwoord voor stromen die niet bestaan, en alleen een regelrechte weigering wordt gerapporteerd als "je apparaat levert dit niet".',
      probeRecords: (records: number, latest: string) =>
        `${records} records${latest ? `, laatste ${latest}` : ''}`,
      probeRefused: 'endpoint geweigerd',
      probeRun: 'Nu opnieuw testen',
      probeSummary: 'Endpointdiagnostiek',
      probedDaysAgo: (days: number) => `${days} dagen geleden getest`,
      probedToday: 'vandaag getest',
      probing: 'Testen…',
      reauthenticate: 'Opnieuw inloggen',
      refreshDone: (count: number) => `Herkenning klaar; ${count} fysieke apparaten gevonden.`,
      refreshFailed: (reason: string) =>
        `Herkenning mislukt; teruggevallen op de lokale cache${reason}`,
      refreshFailedReason: (reason: string) => `: ${reason}`,
      refreshFailedPeriod: '. ',
      refreshNoNewList: 'Er kwam geen nieuwe apparatenlijst terug; de lokale cache wordt getoond.',
      releaseNotesEmpty: 'Deze release heeft geen notities.',
      reportCategory: {
        data: {
          hint: 'iets is altijd leeg, of wijkt af van de Zepp-app',
          label: 'De cijfers kloppen niet',
        },
        device: {
          hint: 'het model klopt niet, of het toont "Niet herkend"',
          label: 'Een apparaat is niet herkend',
        },
        other: { hint: 'beschrijf het hieronder', label: 'Iets anders' },
        workout: {
          hint: 'het toont als een onbekende training, of als de verkeerde sport',
          label: 'Een trainingstype is niet herkend',
        },
      },
      reportCategoryAria: 'Type probleem om te melden',
      reportCategoryPlaceholder: 'Niet gespecificeerd (verstuur alleen wat automatisch is gedetecteerd)',
      reportConfirm:
        'Dit verstuurt de app-versie, het type OS, de parserrevisie, hints op productniveau en veldvormen voor niet-herkende apparaten, firmwareversie, nummers op modelniveau (deviceSource / deviceType — gehele getallen die beschrijven welk model, niet welk exemplaar), onbekende trainingscodes en hun aantallen, de numerieke foutcode van het laatste verzoek dat de cloud weigerde (alleen het nummer, welke gegevensstroom, en wanneer — nooit tekst die de cloud teruggaf), en de notitie die je hierboven schreef (met lokale paden, e-mailadressen en lange identificaties weggestript). Het verstuurt nooit je Zepp-account, tokens, serienummers, apparaat-id\'s, MAC-adressen, GPS, gezondheidswaarden of ruwe antwoorden. Versturen?',
      reportDoneLine: (id: string, at: string) => `Rapport ${id}, verstuurd op ${at}.`,
      reportDoneNote:
        'Wat er uitging is precies de hierboven genoemde veldtypen plus de notitie die je schreef. Niets anders.',
      reportDoneTitle: 'Ontvangen, bedankt',
      reportFailed: 'Het foutrapport kon niet worden verstuurd',
      reportNote: 'Iets toe te voegen',
      reportNoteCounter: (used: number, max: number) =>
        `${used} / ${max} · lokale paden, e-mailadressen en lange identificaties worden voor het versturen weggestript`,
      reportNoteHint: ' (optioneel, maar heel nuttig)',
      reportNotePlaceholder:
        'Bijvoorbeeld: mijn horloge is een Amazfit Balance 2 maar het toont als niet herkend; of: buiten fietsen werd gelezen als een onbekende training.',
      reportSubmit: 'Een foutrapport versturen',
      reportSubmitting: 'Versturen…',
      reportWhat: 'Wat is er mis',
      reportWhatHint: ' (kies er een en je kunt versturen, ook als niets automatisch is gedetecteerd)',
      reprocessFailed: 'Opnieuw parseren van de lokale gegevens is mislukt',
      reprocessNow: 'Opnieuw parseren',
      reprocessed: (count: number) =>
        `Lokale gegevens opnieuw geparseerd tot ${count} genormaliseerde records. Het cloudsynchronisatietijdstip is ongewijzigd.`,
      reprocessing: 'Opnieuw parseren…',
      retentionAria: 'Lokale gegevensbewaring in dagen',
      retentionConfirm: (days: number) =>
        `De volgende geslaagde synchronisatie verwijdert lokale gegevens ouder dan ${days} dagen, definitief. Doorgaan?`,
      retentionCutoff: (date: string) =>
        `Na de volgende geslaagde synchronisatie worden gegevens ouder dan ${date} gesnoeid`,
      retentionLabel: 'Bewaren voor',
      retentionNote: (days: number) =>
        `Bewaart de laatste ${days} dagen lokaal. Snoeien gebeurt `,
      retentionNoteStrong: 'na een geslaagde synchronisatie',
      retentionNoteTail: ', nooit zelfstandig op de achtergrond.',
      retentionTitle: '6. Lokale gegevensbewaring',
      retry: 'Opnieuw proberen',
      scaleLabel: 'Interface-schaling',
      scaleNote: '100% is de ontwerpbasislijn. Ctrl + / Ctrl - werken ook.',
      startBackfill: 'Begin met ophalen van historie',
      stream: {
        blood_pressure: 'Bloeddruk',
        daily_activity: 'Dagelijkse activiteit',
        emotion: 'Stemming',
        food: "Voedingslog (calorieën en macro's)",
        heart_rate: 'Hartslag',
        hrv: 'HRV – SDNN',
        hrv_rmssd: 'HRV – RMSSD',
        lactate_threshold: 'Lactaatdrempel',
        pai: 'PAI-activiteitsindex',
        recovery: 'Gereedheid en energie',
        respiratory_rate: 'Ademhalingsfrequentie',
        second_heart_rate: 'Hartslagindex per seconde',
        sleep: 'Slaap',
        spo2: 'Nachtelijke SpO2-metrieken',
        spo2_files: 'Index van ruwe SpO2-bestanden per meting',
        steps: 'Stappen',
        stress: 'Stressniveau',
        training_load: 'Trainingsbelasting',
        vo2max: 'VO₂-max',
        weight: 'Gewicht',
        workouts: 'Trainingen',
      },
      syncDescA: (minutes: number) =>
        `Synchroniseert cloudgegevens elke ${minutes} minuten terwijl de app open is`,
      syncDescB: 'Aan laten staan houdt de tijdreeksen doorlopend.',
      syncDiagnostics: 'Synchronisatiediagnostiek',
      syncInProgress: 'Er loopt een synchronisatie. Haal op zodra die klaar is',
      syncIntervalAria: 'Interval voor automatisch synchroniseren',
      syncNow: 'Nu synchroniseren',
      syncOff: 'Synchroniseren is uit',
      syncOn: 'Synchroniseren is aan',
      syncTitle: '9. Automatisch synchroniseren',
      syncing: 'Synchroniseren…',
      timeUnknown: 'Tijd onbekend',
      title: 'Instellingen',
      unidentified: 'Niet herkend',
      unidentifiedInitial: 'N',
      unitDays: 'dagen',
      unitRecords: 'items',
      unknownDeviceBodyA: 'Sommige Zepp-accounts geven apparaatgegevens terug met ',
      unknownDeviceBodyB:
        ' — alleen interne nummers, waaruit geen model valt af te leiden. Op "Apparaten opnieuw herkennen" drukken verandert dat nooit. Je kunt hierboven zelf het model aanwijzen: het krijgt het label "Door jou gekozen model" en wordt nooit als automatische match voorgedaan.',
      unknownDeviceNoName: 'helemaal geen productnaamveld',
      unknownDeviceReport:
        'Een foutrapport versturen helpt de nummers van dit apparaat in de ingebouwde catalogus te krijgen, zodat niemand het later handmatig hoeft aan te wijzen. Het rapport bevat een vaste whitelist van velden en vereist geen GitHub-account.',
      unknownDeviceTitle: 'Een niet-herkend apparaat',
      updateBackground: 'Op de achtergrond doorgaan',
      updateCheck: 'Controleren op updates',
      updateChecking: 'Controleren…',
      updateCurrent: (version: string) => `Nu ${version}`,
      updateDownloadNote:
        'Het installeert vanzelf als het klaar is; je kunt de notities hierboven blijven lezen.',
      updateDownloadNoteTail:
        ' · het installeert vanzelf als het klaar is; je kunt de notities hierboven blijven lezen',
      updateDownloading: 'De update wordt gedownload',
      updateFailedPrefix: (reason: string) => `Update mislukt: ${reason}`,
      updateInstall: 'Downloaden en installeren',
      updateInstallNote:
        'De app herstart zichzelf zodra het is geïnstalleerd. Lokale gezondheidsgegevens worden niet verwijderd.',
      updateInstalling: 'Installeren…',
      updateLater: 'Nu niet',
      updateModalCurrent: (version: string) => `Je bent op ${version}`,
      updateModalReleased: (date: string) => ` · uitgebracht ${date}`,
      updateModalTitle: (version: string) => `Wat is er nieuw in ZeppBridge ${version}`,
      updateModalUnknownVersion: 'een onbekende versie',
      updateRestartNote:
        'De app herstart tijdens de installatie. Lokale gezondheidsgegevens worden niet verwijderd.',
      updateRetry: 'Opnieuw proberen',
      updateSeeNotes: 'Bekijk wat er is veranderd',
      updateStatusAvailable: (version: string) => `Versie ${version} is beschikbaar`,
      updateStatusChecking: 'GitHub Releases wordt gecontroleerd',
      updateStatusDownloading: 'De update wordt gedownload',
      updateStatusDownloadingPercent: (percent: number) => `${percent}% gedownload`,
      updateStatusFailed: 'De update is mislukt',
      updateStatusIdle: 'Nog niet gecontroleerd',
      updateStatusInstalling: 'Installeren; de app herstart als het klaar is',
      updateStatusUnmanaged: 'Updates komen van je pakketbeheerder',
      updateStatusUpToDate: 'Je hebt de nieuwste versie',
      updateSub: 'Controleert stilletjes maximaal een keer per dag; je kunt ook zelf controleren.',
      updateTitle: '8. Software-updates',
      updateUnmanagedHint: (version: string) =>
        `Op ${version}. Deze build wordt bijgewerkt via Flatpak of de pakketbeheerder van je distributie: voer flatpak update com.zeppbridge.app uit, of werk het pakket bij.`,
      updateVersion: (version: string) => `Versie ${version}`,
      updateVersionLoading: 'laden',
      verifyAndSync: 'Verifiëren en synchroniseren',
      verifyFailed: 'Verificatie is niet afgerond',
      viewOrChange: 'Bekijk / wijzig model',
    },
  },
  errors: {
    'err.auth.sync_init_failed':
      'Synchroniseren kon niet worden ingesteld. Controleer de accountregio en probeer het opnieuw',
    'err.auth.verify_failed': 'Verificatie mislukt',
    'err.auth.verify_needs_reauth':
      'Verificatie mislukt: de inloggegevens zijn niet meer geldig. Sla ze opnieuw op',
    'err.auth.verify_network':
      'Verificatie mislukt: Zepp was niet bereikbaar. Controleer je netwerk en probeer het opnieuw',
    'err.backfill.bad_start_date': 'Ongeldige startdatum voor ophalen — gebruik JJJJ-MM-DD',
    'err.backfill.no_canonical_records':
      'De cloud heeft een payload teruggegeven, maar er waren geen bruikbare records uit te lezen',
    'err.backfill.partial_window':
      'Slechts een deel van deze datumperiode is geschreven. Er moet opnieuw worden geprobeerd',
    'err.backfill.start_in_future': 'Het startpunt voor ophalen kan niet later dan vandaag liggen',
    'err.backup.restore_busy':
      'Herstel is niet uitgevoerd: er loopt een andere schrijfbewerking. De huidige database is ongewijzigd en het wordt bij de volgende start opnieuw geprobeerd',
    'err.backup.restore_failed':
      'Herstel is niet afgerond. De huidige database is ongewijzigd gebleven; bij de volgende start wordt opnieuw geprobeerd',
    'err.capability.needs_reauth': 'Opnieuw aanmelden vereist',
    'err.capability.not_synced': 'Nog niet gesynchroniseerd',
    'err.capability.other': 'Status onbekend',
    'err.capability.unavailable': 'Niet beschikbaar',
    'err.capability.unknown': 'Status onbekend',
    'err.capability.unverified': 'Nog niet geverifieerd',
    'err.core.auth': 'Er is iets misgegaan met de authenticatie',
    'err.core.busy': 'Er loopt een andere schrijfbewerking. Wacht tot die klaar is',
    'err.core.cancelled': 'Geannuleerd',
    'err.core.cloud_rejected':
      'Zepp heeft het verzoek ontvangen maar geweigerd. Als dit blijft gebeuren, koppel het Zepp-account dan opnieuw in Instellingen',
    'err.core.config': 'Er moet eerst iets in de configuratie worden aangepast',
    'err.core.credential_store':
      'De opslag voor inloggegevens was niet toegankelijk. Controleer of die vergrendeld is, door systeembeleid wordt geblokkeerd, verkeerd is geconfigureerd of foutieve bestandsrechten heeft. Inloggen via web, HAR-import en handmatige invoer gebruiken allemaal dezelfde opslag, dus een andere inlogmethode omzeilt een opslagfout niet. Als macOS Keychain of de Linux-sleutelring niet beschikbaar is, volg dan de handleiding voor opslag van inloggegevens in de README: start met ZEPPBRIDGE_CREDENTIAL_STORE=file en meld daarna opnieuw aan. Hierbij worden tokens in een gewoon tekstbestand opgeslagen dat alleen door jouw gebruiker lees- en schrijfbaar is.',
    'err.core.database': 'De lokale database is tijdelijk niet beschikbaar',
    'err.core.http_status': 'Zepp heeft een fout teruggegeven. Probeer het zo opnieuw',
    'err.core.invalid_host': 'Onveilig Zepp-regioadres',
    'err.core.io': 'Lezen of schrijven van een lokaal bestand is mislukt',
    'err.core.needs_reauth': 'Je aanmelding is verlopen. Koppel opnieuw met Zepp',
    'err.core.network':
      'De Zepp-regio was niet bereikbaar. Controleer je netwerk en probeer het opnieuw',
    'err.core.parse': 'Het antwoord van Zepp kon niet worden gelezen',
    'err.core.retry_exhausted': 'Zepp is tijdelijk niet beschikbaar. Probeer het zo opnieuw',
    'err.core.unavailable': 'Dit account of deze regio levert die gegevens niet',
    'err.core.unknown': 'Er is iets misgegaan',
    'err.data_folder.open_failed': 'De gegevensmap kon niet worden geopend',
    'err.data_folder.unsupported_os':
      'De gegevensmap openen wordt alleen op Windows en macOS ondersteund',
    'err.diagnostic.bad_response': 'De rapportdienst gaf iets terug dat we niet konden lezen',
    'err.diagnostic.client_init_failed': 'Er kon geen verbinding voor het rapport worden opgezet',
    'err.diagnostic.empty_report':
      'Kies eerst een probleemtype of schrijf een zin — anders bevat het rapport niets waar iemand iets mee kan',
    'err.diagnostic.http_error': 'De rapportdienst heeft een fout teruggegeven',
    'err.diagnostic.nothing_to_submit':
      'Dit apparaat heeft geen modelnummer dat de catalogus helpt, dus er valt niets in te sturen',
    'err.diagnostic.rate_limited':
      'Te veel rapporten in korte tijd. Probeer het over een tijdje opnieuw — de al verstuurde blijven bewaard en hoeven niet opnieuw te worden verzonden.',
    'err.diagnostic.send_failed':
      'Het rapport kon niet worden verzonden. Controleer je netwerk en probeer het opnieuw',
    'err.export.bad_extension': 'Het exportbestand heeft de verkeerde extensie',
    'err.export.convert_failed': 'Converteren naar het gevraagde formaat is mislukt',
    'err.export.empty_range': 'Geen records in deze periode om te exporteren',
    'err.export.mkdir_failed': 'De exportmap kon niet worden aangemaakt',
    'err.export.not_a_directory':
      'Een FIT-export heeft een map nodig, maar het gekozen pad is een bestand',
    'err.export.parent_missing': 'De gekozen map bestaat niet',
    'err.export.path_no_parent': 'De opslaglocatie heeft geen geldige map',
    'err.export.path_not_absolute': 'De opslaglocatie moet een absoluut pad zijn',
    'err.export.path_required': 'Kies eerst waar het bestand moet worden opgeslagen',
    'err.export.read_failed': 'De exportgegevens konden niet worden gelezen',
    'err.export.write_failed': 'Het exportbestand kon niet worden geschreven',
    'err.export.write_json_failed': 'De JSON-export kon niet worden geschreven',
    'err.handoff.empty_range': 'Geen records in deze periode om over te dragen',
    'err.handoff.encode_failed': 'De geanonimiseerde AI-export kon niet worden gecodeerd',
    'err.handoff.mkdir_failed': 'De map voor de overdracht kon niet worden aangemaakt',
    'err.handoff.parse_failed': 'De AI-export-JSON kon niet worden gelezen',
    'err.handoff.prompt_required': 'Schrijf eerst een prompt',
    'err.handoff.write_failed': 'De geanonimiseerde AI-gegevens konden niet worden geschreven',
    'err.har.invalid_file':
      'Kan geen geldige HAR lezen. Kies een HAR-bestand dat door je browser is geëxporteerd.',
    'err.har.missing_token':
      'Geen inlogtoken in de HAR gevonden. Schakel exporteren met gevoelige gegevens in.',
    'err.har.missing_user':
      'Geen gebruikers-id in de HAR gevonden. Exporteer het netwerkverkeer opnieuw na het inloggen.',
    'err.har.too_large':
      'Het HAR-bestand is te groot. Exporteer een kleinere opname en probeer het opnieuw.',
    'err.har.unverified':
      'De inloggegevens in de HAR zijn niet door de Zepp-verificatie gekomen, dus er is niets opgeslagen. Meld opnieuw aan en exporteer opnieuw, of voer handmatig een App Token in.',
    'err.headless.no_credential_store':
      'Op deze machine is geen systeemopslag voor inloggegevens beschikbaar (GNOME Keyring / KWallet). Headless servers en containers hebben die meestal niet. Stel ZEPPBRIDGE_CREDENTIAL_STORE=file in om het token met 0600 in de gegevensmap te schrijven, of ZEPPBRIDGE_CREDENTIAL_STORE=env samen met ZEPPBRIDGE_APP_TOKEN.',
    'err.headless.schema_upgrade':
      'Deze database is ouder dan de build die hem leest, en een alleen-lezen verbinding kan hem niet bijwerken. Start de desktop-app een keer, of draai zeppbridge-cli reprocess op een headless machine. Beide maken voor het bijwerken een back-up.',
    'err.headless.token_not_in_store':
      'De accountgegevens zijn er, maar de opslag voor inloggegevens heeft er geen token voor. Een database kun je tussen machines kopiëren; een token niet — die blijft in de referentieopslag van de machine waar hij is gemaakt. Meld opnieuw aan.',
    'err.local_api.bind_failed': 'De lokale API kon niet worden gestart',
    'err.local_api.port_in_use': 'De poort van de lokale API is al door een ander programma in gebruik',
    'err.local_api.state_write_failed':
      'De aan/uit-status van de lokale API kon niet worden opgeslagen',
    'err.local_api.thread_failed': 'De thread van de lokale API kon niet worden gestart',
    'err.local_api.token_rotate_failed':
      'De inloggegevens van de lokale API konden niet opnieuw worden gegenereerd',
    'err.local_api.token_unavailable': 'De inloggegevens van de lokale API konden niet worden gelezen',
    'err.login.bad_url': 'Ongeldig inlogadres',
    'err.login.cancelled': 'Inloggen geannuleerd',
    'err.login.connected': 'Verbonden met je Zepp-account',
    'err.login.credentials_rejected':
      'Zepp heeft deze inloggegevens geweigerd. Log uit in het inlogvenster en meld daarna opnieuw aan',
    'err.login.credentials_unreadable':
      'Je bent ingelogd, maar de inloggegevens konden niet uit het inlogvenster worden gelezen. Probeer de HAR-import of voer handmatig een App Token in.',
    'err.login.extracting': 'Inloggegevens gelezen. Je regio wordt bevestigd',
    'err.login.fallback_page': 'De alternatieve inlogpagina wordt geopend',
    'err.login.region_probe_failed':
      'De inloggegevens zijn gelezen, maar de accountregio kon niet worden bevestigd. Meld opnieuw aan of importeer een HAR-bestand.',
    'err.login.region_retrying':
      'De Zepp-regiodienst is nu niet bereikbaar — er wordt opnieuw geprobeerd. Het inlogvenster blijft open, dus opnieuw inloggen is niet nodig',
    'err.login.region_unreachable':
      'De Zepp-regiodienst was niet bereikbaar. Controleer je netwerk en probeer het opnieuw',
    'err.login.state_unavailable': 'De toestand van de app is niet beschikbaar',
    'err.login.sync_init_failed': 'Ingelogd, maar synchroniseren kon niet worden geïnitialiseerd',
    'err.login.third_party_stalled':
      'Deze externe login lijkt vast te lopen. Google-passkeys blijven in een in-app-venster vaak hangen op de verificatiestap. Sluit het inlogvenster en gebruik e-mail + wachtwoord, of voer handmatig een App Token in via Instellingen.',
    'err.login.timeout': 'Inloggen is verlopen. Probeer het opnieuw',
    'err.login.verifying': 'Het account wordt geverifieerd',
    'err.login.waiting': 'Rond het inloggen bij Zepp af in het pop-upvenster',
    'err.login.window_busy':
      'Het vorige inlogvenster is nog aan het sluiten. Wacht even en probeer het opnieuw',
    'err.login.window_failed': 'Het inlogvenster kon niet worden geopend',
    'err.prefs.retention_out_of_range': 'De bewaartermijn moet tussen 1 en 365 dagen liggen',
    'err.storage.worker_failed': 'De achtergrondtaak voor de database is onderbroken',
    'err.storage.write_busy':
      'Er loopt een andere ZeppBridge-schrijfbewerking. Wacht tot die klaar is',
    'err.storage.write_lock_unavailable':
      'De schrijfvergrendeling kon niet worden gemaakt. Controleer de rechten op de gegevensmap',
    'err.sync.deferred_busy':
      'Er loopt een andere schrijfbewerking. Deze synchronisatie probeert het vanzelf opnieuw',
    'err.sync.deferred_compaction':
      'Opgeslagen payloads worden gecomprimeerd om schijfruimte te besparen. Deze synchronisatie probeert het vanzelf opnieuw',
    'err.sync.deferred_replay':
      'Afgeleide gegevens worden opgebouwd uit lokale payloads. Deze synchronisatie probeert het vanzelf opnieuw',
    'err.sync.history_days_out_of_range': 'Dat aantal dagen valt buiten het toegestane bereik',
    'err.sync.not_connected': 'Nog niet met Zepp verbonden. Koppel eerst',
    'err.sync.not_verified':
      'Voltooi eerst de verificatie van de verbinding voordat je recente gegevens synchroniseert',
    'err.sync.not_verified_backfill':
      'Voltooi eerst de verificatie van de verbinding voordat je historie ophaalt',
    'err.sync.not_verified_probe':
      'Voltooi eerst de verificatie van de verbinding voordat je mogelijkheden test',
    'err.update.installed_build_missing':
      'Na de installatie is geen nieuwe geïnstalleerde ZeppBridge-build gevonden',
    'err.update.launch_failed': 'De bijgewerkte geïnstalleerde build kon niet worden gestart',
    'err.update.localappdata_missing': 'Het Windows-LOCALAPPDATA-pad is niet beschikbaar',
    'err.update.portable_windows_only':
      'Migratie van portable naar geïnstalleerd is alleen voor Windows',
    'err.update.unsafe_data_location':
      'Installatie gestopt omdat niet kon worden vastgesteld dat de gegevenslocatie veilig is voor updates. Sluit ZeppBridge, kopieer een eventuele data-map uit de bundel naar de Application Support-map van je gebruiker, corrigeer ZEPPBRIDGE_DATA_DIR en probeer opnieuw. Behoud de originele gegevens.',
    'err.workout.not_found': 'Die training bestaat niet meer',
  },
  backendText: {
    'ui.backup.file_missing': 'Het back-upbestand is niet gevonden',
    'ui.backup.integrity_failed': 'De back-up is niet door de integriteitscontrole gekomen',
    'ui.backup.sha256_mismatch': 'De SHA-256-controlesom van de back-up komt niet overeen',
    'ui.backup.size_mismatch': 'De grootte van de back-up komt niet overeen',
    'ui.estimate.builtin_guess': 'geschat op ingebouwde basis',
    'ui.estimate.disk_too_small': 'De vrije schijfruimte is onvoldoende voor dit bereik',
    'ui.estimate.disk_unknown': 'De vrije schijfruimte kan niet worden vastgesteld',
    'ui.estimate.measured': 'geschat op je eigen gegevens',
    'ui.estimate.partial': 'deels gebaseerd op ingebouwde schattingen',
    'ui.estimate.stop_no_space': 'De schatting is gestopt omdat er te weinig schijfruimte is',
  },
} satisfies LocalePack;
