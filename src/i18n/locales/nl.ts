import { plural, type LocalePack } from '../index';

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
    'components/ai/WorkoutPicker': { previous: 'Vorige', next: 'Volgende' },
    App: {
      quickReturn: (page: string) => `Terug naar ${page}`,
      navRecent: 'recente records',
      skipToContent: 'Naar de hoofdinhoud',
      mainNav: 'Hoofdnavigatie',
      bottomNav: 'Mobiele hoofdnavigatie',
      navOverview: 'Overzicht',
      navHandoff: 'Doorgeven aan AI',
      navSettings: 'Instellingen',
      preparingData:
        'Je lokale database wordt geopend — de eerste start na een update kan een paar seconden duren…',
      compacting: (pending: number) =>
        `Opgeslagen payloads worden gecomprimeerd (nog ${pending} te gaan). Dit ruimt zichzelf op; synchroniseren wacht zijn beurt af.`,
      compacted: (saved: string) =>
        `Opgeslagen payloads gecomprimeerd, ongeveer ${saved} schijfruimte vrijgemaakt.`,
      trayHint:
        'Het venster sluiten houdt ZeppBridge in het systeemvak, dus automatisch synchroniseren loopt door.',
      browserPreview:
        'Gebruik de desktop-app. Deze browserpreview leest geen accountgegevens.',
      routeNotFound: 'Die pagina bestaat niet, dus je bent terug op het overzicht.',
    },
    'components/BackupPanel': {
      title: 'Databasemomentopnamen en herstel',
      intro1a: 'Een momentopname is een complete kopie van het hele ',
      intro1b:
        '-bestand. Het blijft op deze machine en wordt nergens geüpload. Er wordt er automatisch een gemaakt vóór een database-upgrade, en je kunt er altijd zelf een maken.',
      compareLead: 'Drie dingen heten hier "export", en ze zijn niet hetzelfde: ',
      compareExchange:
        ' is gegevensuitwisseling voor andere tools en bevat alleen de periode die je koos;',
      compareSnapshotName: 'een databasemomentopname',
      compareSnapshot:
        ' is een kopie van de hele database voor noodherstel, die alleen ZeppBridge kan teruglezen;',
      comparePackName: 'een AI-pakket',
      comparePack:
        ' is materiaal dat je bewust uitkiest en anonimiseert voor een extern model. Alleen een momentopname kan de database terugzetten zoals hij was.',
      pendingTitle: 'Er staat een herstel in de wachtrij',
      pendingBodyA: (stagedAt: string) =>
        `In de wachtrij gezet op ${stagedAt}. De database wordt vervangen bij de `,
      pendingNextStart: 'volgende start',
      pendingBodyB:
        '. De huidige database is al als terugvalpunt bewaard, dus je kunt ernaartoe terugkeren.',
      cancelRestore: 'Herstel annuleren',
      creating: 'Maken…',
      createSnapshot: 'Een momentopname maken',
      refreshList: 'Vernieuwen',
      noSnapshots: 'Nog geen momentopnamen.',
      pinned: 'Bewaard',
      metaLine: (size: string, appVersion: string, schemaVersion: number) =>
        `${size} · app ${appVersion} · schema ${schemaVersion}`,
      coverage: (from: string, to: string) => ` · metingen ${from} ~ ${to}`,
      noSamples: ' · geen gezondheidsmetingen in deze momentopname',
      verifyFailed: (problem: string) => `Verificatie mislukt: ${problem}`,
      problemFileMissing: 'Het back-upbestand staat niet meer in de back-upmap',
      problemSizeMismatch:
        'De grootte van het back-upbestand komt niet overeen met het manifest — het kan beschadigd zijn',
      problemSha256Mismatch:
        'De SHA-256 van het back-upbestand komt niet overeen met het manifest — het kan beschadigd of gewijzigd zijn',
      problemIntegrityFailed:
        'Het back-upbestand is niet door de SQLite-integriteitscontrole gekomen',
      problemUnknown:
        'Deze momentopname is niet door de verificatie gekomen, en er is geen reden vastgelegd.',
      blockerFutureSchema: (backup: number, current: number) =>
        `Deze back-up komt uit een nieuwere ZeppBridge (schema ${backup}, deze app is ${current}). Hem hier openen zou velden laten vervallen, dus hij wordt niet hersteld en de huidige bibliotheek blijft ongemoeid. Werk ZeppBridge eerst bij.`,
      blockerUnknown:
        'Deze momentopname kan nu niet worden hersteld, en er is geen reden vastgelegd.',
      verifyPassed:
        'Zojuist opnieuw geverifieerd: bestand, grootte, SHA-256 en integriteit kloppen allemaal.',
      integrityOk: (sha: string) =>
        `Integriteitscontrole bij het maken geslaagd · SHA-256 ${sha}…`,
      integrityBad:
        'De integriteitscontrole is bij het maken al mislukt. Herstel hier niet vanuit.',
      verifyAgain: 'Opnieuw verifiëren',
      unpin: 'Niet meer bewaren',
      pin: 'Bewaren',
      restoreToThis: 'Naar deze herstellen',
      previewTitle: 'Herstelpreview',
      compatibilityUnknown: 'Compatibiliteit onbekend.',
      colContent: 'Inhoud',
      colBackup: 'In momentopname',
      colCurrent: 'Huidig',
      colDelta: 'Verschil',
      previewNote:
        'Rijen met een negatief verschil bevatten na het herstel zoveel records minder. Een herstel haalt nooit opnieuw uit de cloud, dus als je die gegevens nog nodig hebt, synchroniseer dan zodra het klaar is opnieuw.',
      staging: 'In de wachtrij zetten…',
      stageRestore: 'Herstel in de wachtrij zetten (gaat in bij de volgende start)',
      cancel: 'Annuleren',
      listFailed: 'De lijst met momentopnamen kon niet worden gelezen',
      created: (size: string) =>
        `Momentopname gemaakt: ${size}, integriteitscontrole geslaagd.`,
      createFailed: 'De momentopname kon niet worden gemaakt',
      verifyError: 'Verificatie mislukt',
      pinFailed: 'De bewaarmarkering kon niet worden gewijzigd',
      previewFailed: 'De herstelpreview kon niet worden opgebouwd',
      staged:
        'Het herstel staat in de wachtrij. In deze sessie verandert er niets; de database wordt vervangen zodra ZeppBridge opnieuw start.',
      stageFailed: 'Het herstel kon niet in de wachtrij worden gezet',
      cancelled: 'Het geplande herstel is geannuleerd. De database is ongewijzigd.',
      cancelFailed: 'Het herstel kon niet worden geannuleerd',
      kind: {
        manual: 'handmatig',
        pre_migration: 'vóór upgrade',
        pre_restore: 'terugvalpunt',
      },
      compatibility: {
        same_schema:
          'De momentopname heeft dezelfde schemaversie als deze app en herstelt daarom direct.',
        older_schema_will_migrate:
          'De momentopname komt uit een oudere schemaversie. Na het herstellen werkt hij zichzelf bij bij de volgende start.',
        future_schema_refused:
          'De momentopname komt uit een nieuwere app-versie met een structuur die deze app niet kan lezen, dus hij kan niet worden hersteld.',
      },
      table: {
        raw_records: 'Ruwe payloads',
        life_events: 'Levensgebeurtenissen',
        workouts: 'Trainingen',
        daily_metrics: 'Dagmetrieken',
        workout_samples: 'Trainingsmetingen',
        metric_samples: 'Metriekmetingen',
        sleep_sessions: 'Slaap',
      },
    },
    'components/CoverageNotice': {
      empty:
        'Nog niets op deze machine. Synchroniseer een keer en de grafieken hebben iets om te tekenen.',
      emptyAfterSync:
        'De synchronisatie is gelukt maar bracht niets terug. Of dit account heeft voor deze periode geen gegevens in Zepp, of het horloge heeft nog niet naar de Zepp-app geüpload. Kijk eerst in de Zepp-app op je telefoon en synchroniseer hier daarna opnieuw.',
      emptyUnconfirmedRegion:
        'De synchronisatie is gelukt maar bracht niets terug. Bij het inloggen kon niet worden bevestigd tot welke Zepp-regio je account hoort, dus ZeppBridge gebruikt zijn beste gok — en een synchronisatie naar de verkeerde regio gedraagt zich precies zo: hij slaagt en levert niets. Probeer je account opnieuw te koppelen.',
      reconnect: 'Account opnieuw koppelen',
      short: (covered: number, earliest: string) =>
        `Deze machine bevat ${covered} dagen (vroegste ${earliest}). Alles daarvoor is leeg omdat het nog niet uit de cloud is opgehaald — niet omdat je toen niets hebt vastgelegd.`,
      backfill: 'Meer historie ophalen',
      backfilling: 'Historie ophalen…',
      syncNow: 'Nu synchroniseren',
    },
    'components/DatePicker': {
      placeholder: 'Kies een datum',
      aria: 'Kies een datum',
      prev: 'Vorige maand',
      next: 'Volgende maand',
    },
    'components/DeviceMarquee': {
      marqueeAria: 'Amazfit-apparaten die nu in de catalogus staan',
    },
    'components/DevicePicker': {
      pickerAria: 'Kies je apparaatmodel met de hand',
      searchAria: 'Zoeken op modelnaam',
      searchPlaceholder: 'Zoek een model, bijv. Balance 2',
      empty:
        'Geen model komt overeen. Probeer een ander trefwoord, of zet het filter terug op Alles.',
      prev: 'Vorig model',
      next: 'Volgend model',
      alreadyAssigned: 'Is al dit model',
      confirm: 'Dit is mijn apparaat',
      clear: 'Keuze intrekken',
      later: 'Niet nu',
      contributeTitle: 'Help de volgende release dit apparaat zelf te herkennen',
      contributeBody:
        'Stuurt naar ZeppBridge het model dat jij koos plus de modelnummers van dit apparaat (deviceSource / deviceType, alleen gehele getallen). Beide zeggen welk horloge het is en verder niets: geen account, geen serienummer, geen MAC, geen gezondheidsgegevens. Huami publiceert geen opzoektabel voor die nummers, dus dit is de enige manier waarop de ingebouwde catalogus groeit. Zodra een paar mensen naar een model hebben gewezen, wordt het voor iedereen automatisch herkend.',
      note: 'Jouw keuze verschijnt als "Door jou gekozen model" en wordt nooit als automatische match voorgedaan. Afbeeldingen en modelnamen komen uit de meegeleverde catalogus; erin bladeren raakt geen netwerk.',
      filterAll: 'Alles',
      filterWatch: 'Horloges',
      filterBand: 'Bands',
      filterStrap: 'Bandjes',
      filterRing: 'Ringen',
      filterEarbuds: 'Oordopjes',
    },
    'components/DeviceVisual': {
      watch: 'Horloge',
      strap: 'Bandje',
      ring: 'Ring',
      band: 'Band',
      earbuds: 'Oordopjes',
      scale: 'Weegschaal',
      unknown: 'Apparaat',
    },
    'components/HeartRateZonePicker': {
      title: 'Hartslagzones',
      intro:
        'De drie modellen tekenen verschillende zones, en alleen jij weet welk model voor jou iets betekent — dus ZeppBridge kiest geen standaard en schat nooit uit een formule als 220 min je leeftijd. Elke basis hieronder draagt zijn bron en de datum waarop hij is gemeten.',
      clearChoice: 'Selectie wissen',
      desktopOnly:
        'Open dit in de ZeppBridge-desktop-app; hartslagzones lezen lokale records.',
      noBases:
        'Nog geen hartslagbasis op deze machine. Na één gesynchroniseerde training verschijnen gemeten waarden hier, zoals je hoogste gemeten hartslag.',
      modelGroup: 'Model',
      modelAria: 'Hartslagzonemodel',
      pickModelFirst:
        'Kies een model, dan worden de zones berekend uit de basissen die je kiest.',
      pickBasesNext:
        'Kies hierboven de resterende basissen om de zones en de tijd per zone te krijgen.',
      window: (days: number, total: string) =>
        `Hartslag per seconde tijdens trainingen over ${days} dagen · ${total} in totaal`,
      outside: (below: string, above: string) =>
        `Buiten de zones: onder Z1 ${below} · boven Z5 ${above}`,
      formulaNote: (formula: string, bases: string) =>
        `${formula}. Grenzen worden naar beneden afgerond, net als op het horloge. Basissen: ${bases}`,
      missingBases: (list: string) => `Nog niet op deze machine: ${list}`,
      basesSeparator: ', ',
      zonesUnavailable: 'Hartslagzones zijn nu niet beschikbaar',
      saveFailed: 'De hartslagzone-instellingen konden niet worden opgeslagen',
      zeroMinutes: '0 min',
      durationHours: (hours: number, minutes: number) => `${hours} uur ${minutes} min`,
      durationMinutes: (minutes: number) => `${minutes} min`,
      kind: {
        max_hr: 'Basis max. hartslag',
        resting_hr: 'Basis rusthartslag',
        threshold_hr: 'Basis drempelhartslag',
      },
      model: {
        max_hr: {
          label: 'Zones op maximale hartslag',
          formula: 'Zone-ondergrens = maximale hartslag × percentage',
        },
        hr_reserve: {
          label: 'Hartslagreservezones',
          formula: 'Zone-ondergrens = rusthartslag + (max. hartslag − rusthartslag) × percentage',
        },
        lactate_threshold: {
          label: 'Lactaatdrempelzones',
          formula: 'Zone-ondergrens = drempelhartslag × percentage',
        },
      },
      percentBands: ['Opwarmen', 'Vetverbranding', 'Aeroob', 'Anaeroob', 'Maximaal'],
      thresholdBands: ['Rustig', 'Duur', 'Tempo', 'Drempel', 'Anaeroob'],
      basis: {
        observed_max: {
          label: 'Hoogste gemeten hartslag',
          note: 'De hoogste lokaal vastgelegde hartslag. Ben je nooit tot een echte limiet gegaan, dan vallen de zones smal uit.',
        },
        device_max: {
          label: 'Maximale hartslag volgens het horloge',
          note: 'Wat het horloge in zijn PAI-payload meldt, meestal uit je Zepp-app-profiel overgenomen.',
        },
        device_resting: {
          label: 'Rusthartslag volgens het horloge',
          note: 'Wat het horloge in zijn PAI-payload meldt.',
        },
        lactate_threshold: {
          label: 'Lactaatdrempelhartslag',
          note: 'Door het horloge gemeten na een zware run.',
        },
        computed_resting: {
          label: 'Lokaal berekende rusthartslag',
          note: '' as string,
        },
      },
      computedRestingNote: (days: number) =>
        `Gemiddelde over de ${days} dagen met gegevens in de laatste 30.`,
    },
    'components/HistoryArchivePanel': {
      title: 'Langetermijnarchief en volledige historie',
      intro:
        'Het archief dekt "vanaf vandaag niet meer verwijderen"; het ophalen dekt "ga halen wat ervoor kwam". Pas met beide is de lokale kopie echt compleet.',
      archiveTitle: 'Langetermijnarchief',
      archiveBody:
        'Met dit aan snoeit een geslaagde synchronisatie de historie niet meer volgens de bewaarperiode. De database blijft groeien; je kunt het op elk moment uitzetten, en uitzetten vertelt je wat de volgende synchronisatie zou snoeien.',
      archiveAria: 'Langetermijnarchief',
      startLabel: 'Ophalen vanaf',
      startAria: 'Start van het ophalen van historie',
      customDateLabel: 'Startdatum',
      customDateAria: 'Startdatum voor ophalen',
      estimateTitle: 'Geschatte groei',
      estimateRate: (days: number, perDay: string) =>
        `${days} dagen lokale metingen · ongeveer ${perDay}/dag`,
      unmeasured: (streams: string) =>
        `Te weinig lokale metingen om te schatten: ${streams}. Die zijn buiten het totaal hierboven gelaten — liever zeggen dat we het niet weten dan een tempo verzinnen en het met jaren vermenigvuldigen.`,
      wouldBeCleanedUp: (requested: number, retention: number) =>
        `Dit ophalen zou ${requested} dagen historie binnenhalen, maar deze machine bewaart alleen de laatste ${retention} dagen — wat terugkomt zou bij de volgende geslaagde synchronisatie worden verwijderd. Zet eerst het langetermijnarchief aan, of vergroot de bewaarperiode.`,
      backfilling: 'Historie ophalen…',
      continueBackfill: 'Doorgaan met ophalen',
      startBackfill: 'Begin met ophalen',
      autoContinue: 'Tot het einde doorlopen',
      autoContinueHint:
        'Elke ronde start automatisch de volgende tot de hele periode is opgehaald. Stop wanneer je wilt — wat al is binnengehaald gaat niet verloren.',
      stopBackfill: 'Stoppen',
      stopping: 'Stoppen…',
      roundProgress: (done: number, total: number) =>
        `Ophalen: ${done} van ${total} maandblokken klaar. Je kunt op elk moment stoppen.`,
      stoppedByUser: (remaining: number) =>
        `Gestopt met nog ${remaining} maandblokken te gaan. Alles wat al is opgehaald blijft bewaard — druk op "Doorgaan met ophalen" om verder te gaan.`,
      stalled: (remaining: number) =>
        `Er blijven ${remaining} maandblokken over, maar deze ronde heeft er geen verplaatst, dus hij is gestopt. Ze mislukken hoogstwaarschijnlijk telkens — zie de mislukte lijst hieronder, of druk op "Mislukte items opnieuw proberen".`,
      deferredRetry:
        'Er loopt lokaal onderhoud. Het ophalen gaat vanzelf verder',
      resetLedger: 'Het logboek wissen',
      ledgerTitle: 'Dekkingslogboek',
      ledgerProgress: (done: number, total: number) =>
        `${done} van ${total} maandblokken afgehandeld`,
      ledgerFrom: (from: string) => ` · aangevraagd vanaf ${from}`,
      ledgerComplete:
        'Elk maandblok in het logboek is afgehandeld: ofwel lokaal geschreven, ofwel de cloud zei ronduit dat er niets voor die periode is.',
      ledgerIncomplete: (remaining: number) =>
        `Er zijn nog ${remaining} blokken onafgehandeld. Tot die allemaal klaar zijn is deze lokale kopie een kopie van de met succes gesynchroniseerde periode — geen complete.`,
      ledgerStats: (persisted: number, empty: number, pending: number) =>
        `${persisted} geschreven · ${empty} leeg uit de cloud · ${pending} te doen`,
      ledgerFailed: (failed: number) => `${failed} mislukt`,
      ledgerRange: (from: string, to: string, records: number) =>
        `${from} ~ ${to} · ${records} records`,
      ledgerNothingWritten: 'Nog geen maand geschreven',
      range1y: 'Afgelopen 1 jaar',
      range2y: 'Afgelopen 2 jaar',
      range3y: 'Afgelopen 3 jaar',
      rangeAll: (years: number) => `Alle beschikbare historie (tot ${years} jaar)`,
      rangeCustom: 'Eigen startpunt',
      confirmDisableArchive:
        'Met het langetermijnarchief uit snoeit de volgende geslaagde synchronisatie oudere gegevens volgens de bewaarperiode, en dat is niet ongedaan te maken.\nHeb je net historie opgehaald, maak dan eerst een databasemomentopname.\nUitzetten?',
      archiveEnabled:
        'Langetermijnarchief aan: geslaagde synchronisaties snoeien de historie niet meer.',
      archiveDisabled:
        'Langetermijnarchief uit: de volgende geslaagde synchronisatie snoeit volgens de bewaarperiode.',
      archiveSaveFailed: 'De archiefinstelling kon niet worden opgeslagen',
      pickStartFirst: 'Kies eerst waar het ophalen begint.',
      outOfRetention:
        'Dit ophalen reikt voorbij de lokale bewaarperiode, dus wat terugkomt zou bij de volgende geslaagde synchronisatie worden gesnoeid. Zet eerst het langetermijnarchief aan, of vergroot de bewaarperiode.',
      roundDone: (remaining: number) =>
        `Deze ronde is klaar; er blijven ${remaining} maandblokken over. Druk op "Doorgaan met ophalen" om verder te gaan — je kunt stoppen wanneer je wilt.`,
      allChunksDone: 'Elk maandblok in het logboek is afgehandeld.',
      backfillFailed: 'Het ophalen van historie is mislukt',
      confirmResetLedger:
        'Dit wist alleen het dekkingslogboek. Niets dat al lokaal is geschreven wordt verwijderd, en je kunt daarna een nieuw ophaalbereik plannen. Doorgaan?',
      ledgerReset: 'Het logboek is gewist. Je kunt een nieuwe ophaalperiode plannen.',
      ledgerResetFailed: 'Het logboek kon niet worden gewist',
      failedTitle: 'Maanden die niet konden worden opgehaald',
      failedIntro:
        'Deze blokken zijn mislukt. Elke andere maand was onaangetast en is zoals gebruikelijk opgehaald.',
      failedRow: (stream: string, month: string) => `${stream} · ${month}`,
      failedAttempts: (attempts: number) =>
        plural(attempts, { one: `${attempts} poging`, other: `${attempts} pogingen` }),
      failedExhausted:
        'De automatische nieuwe pogingen zijn op. Gebruik "Mislukte maanden opnieuw proberen" om het nog eens te proberen',
      failedNoReason: 'Geen reden vastgelegd',
      retryFailed: 'Mislukte maanden opnieuw proberen',
      retryFailedDone:
        'De mislukte maanden staan weer in de wachtrij. Je kunt het ophalen voortzetten.',
      retryFailedFailed:
        'De mislukte maanden konden niet opnieuw in de wachtrij worden gezet',
      streamSeparator: ', ',
      stream: {
        heart_rate: 'Hartslag',
        daily_summary: 'Dagsamenvattingen',
        workouts: 'Trainingen',
        sleep: 'Slaap',
        hrv: 'Hartslagvariabiliteit',
        wellness: 'Stress / SpO2 en dergelijke',
      },
    },
    'components/InsightCard': {
      title: 'Hoe de run ging',
      unsupportedWorkoutType:
        'Inzichten voor dit trainingstype worden nog niet ondersteund. De eerste versie dekt alleen hardlopen, omdat dat is wat met echte gegevens is geverifieerd. Elke andere training toont, corrigeert en exporteert gewoon.',
      handoff: 'Laat AI erin graven',
      currentRun: 'Deze run',
      baselineRun: 'Basislijn',
      reading: 'Lokale records worden gelezen…',
      comparedTo: (count: number) =>
        `Tegenover je eigen ${count} meest recente runs van vergelijkbare afstand:`,
      noComparison:
        'Nog niet genoeg vergelijkbare historie, dus deze run meldt zijn cijfers zonder ze te vergelijken.',
      baselinePrefix: (value: string, delta: string) => `basislijn ${value} · ${delta}`,
      driftTitle: 'Eerste helft tegenover tweede',
      driftSub:
        'Splitst deze training in tweeën op tijd en vergelijkt hoeveel slagen dezelfde snelheid kostte.',
      driftFirst: 'Eerste helft',
      driftSecond: 'Tweede helft',
      driftPerBeat: (metres: string) => `${metres} m/slag`,
      driftHrSpeed: (hr: number, pace: string) => `${hr} bpm · ${pace}`,
      driftDelta: (percent: string) => `${percent}%`,
      driftRising:
        'Dezelfde snelheid vasthouden kostte in de tweede helft meer slagen.',
      driftFlat: 'De twee helften zijn in wezen gelijk.',
      driftFalling: 'Elke slag droeg je in de tweede helft verder.',
      driftNote:
        'Dit vergelijkt de training alleen met zichzelf, nooit met iemand anders. Verkeerslichten, heuvels, intervallen en GPS-drift vervuilen het allemaal, dus er wordt geen getal gegeven als het tempo niet constant was.',
      driftUnavailable: (code: string) => ({
        too_short:
          'Te kort om te splitsen. De eerste tien minuten is de hartslag meestal nog aan het stijgen, dus ze met de tweede helft vergelijken meet de warming-up, niet de drift.',
        pace_too_variable:
          'Het tempo varieerde te veel (intervallen, verkeerslichten of heuvels zien er allemaal zo uit), dus de twee helften zijn niet vergelijkbaar en er wordt geen getal gegeven.',
        not_enough_samples:
          'Te weinig hartslag- en snelheidsmetingen per punt in deze training om hem te splitsen.',
        unsupported_workout_type:
          'De vergelijking eerste/tweede helft dekt voorlopig alleen hardlopen. Wandelen en fietsen dragen ook genoeg metingen, maar de drempels zijn niet tegen echte gegevens geverifieerd.',
      } as Record<string, string | undefined>)[code] ?? 'Deze training kan niet worden gesplitst.',
      baselineSummary: 'Waar de basislijn vandaan komt',
      baselineRule: (days: number, tolerance: number | null | undefined, min: number, max: number) =>
        `De regel: runs van hetzelfde type uit de laatste ${days} dagen waarvan de afstand binnen ±${tolerance ?? '—'}% van deze ligt, minstens ${min} en hoogstens ${max} ervan.`,
      excludedPrefix: 'Uitgesloten: ',
      excludedItem: (label: string, count: number) => `${label} ×${count} `,
      footnote:
        'Elke conclusie hier vergelijkt je met je eigen historie — nooit met een populatiebasislijn — en niets ervan is een medisch oordeel. Ontbrekende gegevens lezen "Niet verstrekt" in plaats van met een nul te worden gevuld.',
      notProvided: 'Niet verstrekt',
      durationHours: (hours: number, minutes: number) => `${hours} uur ${minutes} min`,
      durationMinutes: (minutes: number) => `${minutes} min`,
      metric: {
        'run.distance': 'Afstand',
        'run.duration': 'Tijd',
        'run.pace': 'Gem. tempo',
        'run.avg_hr': 'Gem. hartslag',
        'run.training_load': 'Trainingsbelasting',
      },
      confidence: {
        high: 'Goed onderbouwd',
        medium: 'Enig bewijs',
        low: 'Dun bewijs',
        insufficient: 'Onvoldoende bewijs',
      },
      exclusion: {
        distance_out_of_tolerance: 'afstand te verschillend',
        missing_distance: 'geen afstand',
        missing_duration: 'geen duur',
        implausible_pace: 'onaannemelijk tempo',
        beyond_max_samples: 'boven het steekproefmaximum',
      },
    },
    'components/MetricTrendCard': {
      latestTag: 'Laatste',
      measuredOn: (date: string) => `gemeten ${date}`,
      trendAria: (label: string) => `${label}-trendlijn`,
      onlyOneDay:
        'Slechts één dag met gegevens in deze periode, dus er is nog geen trend om te tekenen.',
      defaultEmpty: 'Deze metriek toont zijn trend zodra hij is gesynchroniseerd.',
      average: 'Gem.',
      minimum: 'Min',
      maximum: 'Max',
    },
    'components/SelectMenu': {
      placeholder: 'Selecteer…',
    },
    'components/StageBar': {
      notProvided: 'Niet verstrekt',
      zeroMinutes: '0 min',
      hypnogramAria: 'Hypnogram van slaapstadia',
      summaryAria: 'Aandeel per slaapstadium',
    },
    'components/WeeklyReportCard': {
      title: 'Deze week',
      window: (recentStart: string, recentEnd: string, baseStart: string, baseEnd: string) =>
        `${recentStart} ~ ${recentEnd} · tegenover je eigen ${baseStart} ~ ${baseEnd}`,
      legendGood: 'Groen = beter voor deze metriek',
      legendBad: 'Rood = slechter',
      legendNote:
        'Alleen vergeleken met je eigen afgelopen 28 dagen, nooit met een populatiebasislijn',
      desktopOnly: 'Het weekrapport heeft de ZeppBridge-desktop-app nodig.',
      nothingComparable:
        'Deze week is nog niets vergelijkbaars. Kom terug na een synchronisatie.',
      loadFailed: 'Het lokale weekrapport kon niet worden opgebouwd',
      barsAria: (recent: string, baseline: string) =>
        `Deze week ${recent}, afgelopen 28 dagen ${baseline}`,
      barThisWeek: 'Deze week',
      barBaseline: 'Afgelopen 28 dagen',
      noBaseline:
        'Niet genoeg historie erachter, dus dit is alleen het huidige cijfer',
      baselineCountUnknown:
        'Basislijndagen onbekend, dus dit is het huidige cijfer zonder vergelijking.',
      thinBaseline: (days: number, found: number, needed: number) =>
        `Slechts ${found} van de afgelopen ${days} dagen dragen deze metriek, minder dan de benodigde ${needed}, dus dit is het huidige cijfer zonder vergelijking.`,
      noRecentData:
        'Niets lokaal vastgelegd voor deze metriek in de afgelopen 7 dagen.',
      zeroBaseline:
        'De vorige basislijn was gemiddeld 0, dus er is geen relatieve verandering te berekenen — dit is alleen het huidige cijfer.',
      notProvided: 'Niet verstrekt',
      sleepDuration: (hours: number, minutes: number) => `${hours} uur ${minutes} min`,
      regularity: (minutes: number) => `±${minutes} min`,
      workoutCount: (count: number) => `${count} sessies`,
      unitWord: (unit: string) => unit,
      metric: {
        'weekly.resting_hr': 'Rusthartslag',
        'weekly.hrv': 'HRV',
        'weekly.stress': 'Stress',
        'weekly.sleep_duration': 'Slaapduur',
        'weekly.sleep_start_regularity': 'Spreiding van bedtijd',
        'weekly.workout_count': 'Trainingen',
        'weekly.training_load': 'Trainingsbelasting',
      },
    },
    'components/overview/HeartRateCard': {
      hrPanelAria: 'Open het hartslagdetail voor de volle 24 uur',
      hrTitle: 'Recente hartslag',
      hrWindow: (hours: number) => `Afgelopen ${hours} uur`,
      latest: 'Laatste',
      bpm: 'bpm',
      hrChartAria: 'Hartslagcurve over 24 uur',
      hrZonesAria: 'Hartslagzones (absolute grenzen)',
      hrEmpty: 'Echte hartslagbeweging verschijnt hier na een synchronisatie.',
      hrMore: 'Volle 24 uur',
      hrTooltip: (clock: string, value: number) => `${clock} <b>${value}</b> bpm`,
      zoneRest: 'Rust 0–99',
      zoneFat: 'Vetverbranding 100–139',
      zoneAerobic: 'Aeroob 140–169',
      zoneAnaerobic: 'Anaeroob 170+',
    },
    'components/overview/RecentCard': {
      recentAria: 'Recente records',
      recentTitle: 'Recente records',
      recentSub: 'Slaap, runs en krachtwerk',
      seeAll: 'Alles zien',
      recentEmpty:
        'Nog niets vastgelegd. Voer een synchronisatie uit en het verschijnt hier.',
      sleepRecordTitle: 'Slaap',
      sleepScore: (score: number) => `Slaapscore ${score}`,
      avgHr: (value: number) => `Gem. hartslag ${value}`,
      timeUnknown: 'Tijd onbekend',
    },
    'components/overview/SleepCard': {
      sleepPanelAria: 'Slaapdetail openen',
      sleepTitle: 'Afgelopen nacht',
      sleepSub: 'Slaapstructuur in één oogopslag',
      sleepBarAria: 'Aandeel per slaapstadium',
      sleepEmpty: 'De slaap van afgelopen nacht verschijnt hier na een synchronisatie.',
      seeMore: 'Meer zien',
      durationHours: (hours: number, minutes: number) => `${hours} uur ${minutes} min`,
      durationMinutes: (minutes: number) => `${minutes} min`,
    },
    'components/overview/SourcesStrip': {
      dataSources: 'Gegevensbronnen',
      identifyingDevices: 'Je apparaten worden herkend…',
      identifyFailed: (reason: string) =>
        `Apparaatherkenning is niet beschikbaar: ${reason}`,
      noDevicesYet: 'Nog geen apparaat herkend.',
      manage: 'Beheren',
      sourcesAria: 'Gegevensbronnen en accountstatus',
    },
    'components/overview/StepsCard': {
      stepsPanelAria: 'Detail van dagelijkse activiteit openen',
      stepsTitle: 'Stappen van vandaag',
      stepsGoalReference: 'Referentiedoel',
      stepsGoalToday: 'Doel van vandaag',
      stepsUnit: 'stappen',
      stepsGoalLine: (goal: string, percent: number) => `Doel ${goal} · ${percent}%`,
      seeMore: 'Meer zien',
    },
    'components/shell/AppTopBar': {
      mainNav: 'Hoofdnavigatie',
      brandHome: 'ZeppBridge 3 · Overzicht',
      connectionTitle: 'Status van de cloudverbinding',
      lastSyncPrefix: 'Laatste sync: ',
      notFetchedYet: 'Nog niet opgehaald',
      timeUnknown: 'Tijd onbekend',
      syncNow: 'Nu synchroniseren',
      verifyFirst: 'Verifieer eerst de verbinding',
      syncing: 'Synchroniseren…',
      syncFailed: 'Synchronisatie mislukt',
      syncPartial: 'Deels gesynchroniseerd',
      cancel: 'Annuleren',
      themeTitle: 'Thema wisselen',
      themeLight: 'Licht',
      themeDark: 'Donker',
      themeSystem: 'Systeem',
      localeLabel: 'Interfacetaal',
    },
    'composables/useAiHandoff': {
      clipboardUnsupported: 'Deze omgeving kan niet naar het klembord schrijven',
      targetNotAllowed: 'Dat AI-adres staat niet op de toelatingslijst',
      handoffFailed: 'De AI-overdracht is niet gelukt',
      copiedButCannotOpen: (label: string) =>
        `Gekopieerd, maar ${label} kon niet worden geopend`,
      nothingToRetry: 'Er is geen AI-overdracht om opnieuw te proberen',
    },
    'composables/useAiTaskDraft': {
      loadFailed: 'De taak kon niet worden geladen',
      saveFailed: 'De taak kon niet worden opgeslagen',
      deleteFailed: 'De taak kon niet worden verwijderd',
      untitled: 'Taak zonder naam',
    },
    'composables/useAiTaskHandoff': {
      prepareFailed: 'De bestanden konden niet worden voorbereid',
      copyFailed: 'De prompt kon niet worden gekopieerd',
      openFailed: 'De AI-site kon niet worden geopend',
    },
    'composables/useDevices': {
      stateAccount: 'Bekend vanuit account',
      stateUserAssigned: 'Door jou gekozen model',
      stateRecentData: 'Heeft recente gegevens',
      stateCached: 'Uit cache',
      stateUnknown: 'Niet herkend',
      notFetchedYet: 'Nog niet opgehaald',
      timeUnknown: 'Tijd onbekend',
      unidentifiedDevice: 'Niet-herkend apparaat',
      notProvided: 'Niet verstrekt',
      identifyUnavailable: 'Apparaatherkenning is nu niet beschikbaar',
      cacheUnavailable: 'De apparaatcache is nu niet beschikbaar',
      noLocalIdentifier:
        'Dit apparaat draagt geen lokale identificatie, dus de keuze kan niet worden opgeslagen.',
      assignmentCleared: 'Keuze ingetrokken. Terug naar de automatische match.',
      assignmentSaved:
        'Je keuze is opgeslagen. Hij verschijnt als "Door jou gekozen model" — nooit als automatische match voorgedaan.',
      assignmentContributed: (reportId: string) =>
        `Je keuze is opgeslagen en de modelnummers gingen naar ZeppBridge (rapport ${reportId}). De volgende catalogusrelease herkent dit model vanzelf.`,
      assignmentContributionFailed: (reason: string) =>
        `Je keuze is op deze machine opgeslagen. Het versturen van de catalogusbijdrage is mislukt: ${reason}`,
      networkUnavailable: 'Netwerk niet beschikbaar',
      assignmentFailed: 'De modelkeuze kon niet worden opgeslagen',
    },
    'composables/useExport': {
      typeSteps: 'Stappen',
      typeLifeEvents: 'Levensgebeurtenissen',
      groupContext: 'Context',
      typeDailyActivity: 'Dagelijkse activiteit',
      typeWorkouts: 'Trainingen',
      typeSleep: 'Slaap',
      typeHeartRate: 'Hartslag',
      typeSpo2: 'Bloedzuurstof',
      typeStress: 'Stress',
      typeRespiratoryRate: 'Ademhalingsfrequentie',
      typeRecovery: 'Gereedheid',
      typeTrainingLoad: 'Trainingsbelasting',
      typeLactateThreshold: 'Lactaatdrempel',
      typePai: 'PAI',
      groupActivity: 'Activiteit',
      groupSleep: 'Slaap',
      groupBody: 'Lichaamsstatus',
      groupTraining: 'Training',
      detailSummary: 'Samenvatting',
      detailSummaryHint:
        'Hartslag per uur samengevoegd, reeksen per seconde van trainingen weggelaten. Gestructureerde metrieken blijven compleet, en de grootte past bij doorgeven aan een AI.',
      detailFull: 'Volledig',
      detailFullHint:
        'Behoudt reeksen per seconde van trainingen en individuele hartslagmetingen. Groot, en bedoeld om te archiveren.',
      scopeConflict:
        'Een datumbereik en één enkele training sluiten elkaar uit als bereik. Kies er een.',
      noDataTypes: 'Kies minstens één gegevenstype.',
      invalidDates: 'Kies een geldige begin- en einddatum.',
      endBeforeStart: 'De einddatum kan niet eerder liggen dan de begindatum.',
      rangeTooLong: (days: number) =>
        `Eén export dekt maximaal ${days} dagen. Gebruik voor langere historie de databasemomentopname in Instellingen.`,
      nothingToExport: 'Niets te exporteren in deze periode.',
      jsonTooLarge: 'De JSON is groter dan 1 MB. Gebruik in plaats daarvan "Bestand opslaan".',
      copied: (count: number) => `${count} genormaliseerde records gekopieerd.`,
      copyFailed: 'De JSON kon niet worden gekopieerd',
      saveJsonTitle: 'ZeppBridge-JSON opslaan',
      saveCsvTitle: 'ZeppBridge-CSV opslaan (samenvattingstabel)',
      saveGpxTitle: 'ZeppBridge-GPX opslaan (GPS-track)',
      saveFitTitle: 'Kies een map voor de FIT-export (één bestand per training)',
      jsonFilter: 'JSON-bestand',
      csvFilter: 'CSV-tabel',
      gpxFilter: 'GPX-track',
      fitFilter: 'FIT-activiteitsbestanden',
      unitRecords: 'records',
      unitRows: 'rijen',
      unitTrackPoints: 'trackpunten',
      unitSamplePoints: 'meetpunten',
      saved: (count: number, unit: string) => `${count} ${unit} opgeslagen.`,
      savedFiles: (files: number, count: number, unit: string) =>
        `${files} FIT-bestanden opgeslagen, ${count} ${unit} in totaal.`,
      saveFailed: (format: string) => `De ${format} kon niet worden opgeslagen`,
      feedUpdated: (count: number) =>
        `De lokale AI-feed bevat nu ${count} records.`,
      feedFailed: 'De lokale AI-feed kon niet worden bijgewerkt',
    },
    'composables/useSyncController': {
      notSyncedYet: 'Nog niet gesynchroniseerd',
      timeUnknown: 'Tijd onbekend',
      updatedWithLatest: (clock: string) =>
        `Nieuwe gegevens binnengehaald · laatste hartslag ${clock}`,
      updated: 'Nieuwe gegevens binnengehaald',
      noNewDataWithLatest: (clock: string) =>
        `Niets nieuws in de cloud · laatste hartslag nog ${clock}`,
      noNewData: 'Synchronisatie klaar. De cloud had niets nieuws',
      partialWithStreams: (streams: string) => `Sommige stromen zijn mislukt: ${streams}`,
      partial: 'Synchronisatie klaar, maar sommige gegevensstromen zijn mislukt',
      cancelled: 'Synchronisatie geannuleerd',
      deferred:
        'Lokale afgeleide gegevens worden opgebouwd. De synchronisatie probeert het vanzelf opnieuw',
      failed: 'Synchronisatie mislukt. Controleer de verbinding en probeer het opnieuw',
      lastCloudSync: (clock: string) => `Laatste cloudsynchronisatie ${clock}`,
      cloudSyncClock: (clock: string) => `Cloudsync ${clock}`,
      cloudSyncClockUnknown: 'Cloudsync —',
      statusUnavailable: 'Verbindingsstatus is nu niet beschikbaar',
      alreadySyncing:
        'Er loopt al een synchronisatie. Probeer het zodra die klaar is opnieuw',
      desktopOnly: 'Gebruik de desktop-app',
      reauthNeeded: 'Je Zepp-sessie is verlopen. Koppel opnieuw',
      verifyFirst: 'Verifieer eerst de verbinding',
      connectFirst: 'Verbind eerst met Zepp',
      syncingRecent: (days: number) => `De afgelopen ${days} dagen worden gesynchroniseerd…`,
      backfilling: (days: number) => `De afgelopen ${days} dagen worden opgehaald…`,
      syncDidNotFinish: 'De cloudsynchronisatie is niet afgerond',
      cancelling: 'Synchronisatie wordt geannuleerd…',
      cancelFailed: 'De synchronisatie kon niet worden geannuleerd',
      streamSeparator: ', ',
      syncingStream: (stream: string) => `${stream.toLowerCase()} synchroniseren`,
      backfillingStream: (stream: string, month: string) =>
        `${stream.toLowerCase()} ophalen · ${month}`,
    },
    'lib/aiTask/copy': {
      'ui.ai_task.cat.workout': 'Trainingen',
      'ui.ai_task.cat.sleep': 'Slaap',
      'ui.ai_task.cat.recovery': 'Gereedheid',
      'ui.ai_task.cat.heart_rate': 'Hartslag',
      'ui.ai_task.cat.training': 'Trainingsbelasting',
      'ui.ai_task.cat.body': 'Lichaamsstatus',
      'ui.ai_task.cat.personal_note': 'Persoonlijke notitie',
      'ui.ai_task.cat.attachment': 'Bijlagen',
      'ui.ai_task.prompt.coverage_note':
        'De dekking hieronder is op het apparaat gemeten door ZeppBridge. Dagen zonder gegevens zijn als ontbrekend gemarkeerd — leid ze niet af en verzin ze niet.',
      'ui.ai_task.blocked.attachment_missing':
        'Een originele bijlage kan niet meer worden gevonden. Kies het bestand opnieuw of verwijder eerst de verwijzing.',
      'ui.ai_task.blocked.no_workouts':
        'Er is nog geen training aan deze taak gekoppeld. Ga terug en kies er minstens één.',
      'ui.ai_task.blocked.empty':
        'De huidige selectie dekt geen gegevens. Pas eerst categorieën of trainingen aan.',
      'ui.ai_task.warn.attachment_changed':
        'De grootte van een bijlage wijkt af van toen hij werd toegevoegd — bevestig dat het nog hetzelfde origineel is voordat je overdraagt.',
      'ui.ai_task.warn.category_missing':
        'Deze categorie heeft geen gegevens in het gekozen venster; de export markeert hem als ontbrekend.',
      'ui.ai_task.warn.partial_coverage':
        'Slechts een deel van het venster heeft gegevens. Zie de dekkingstabel hieronder.',
      'ui.ai_task.unknown': 'Niet-herkende statusnotitie',
      'ui.ai_task.attach.no_redaction':
        'Originalen worden ongewijzigd gerefereerd en niet geanonimiseerd. Bevestig dat je dit bestand zelf aan de gekozen AI wilt toevoegen.',
      'ui.ai_template.recovery_run.name': 'Herstelrun',
      'ui.ai_template.recovery_run.prompt':
        'Dit was een training in de herstelfase. Beoordeel aan de hand van de twee weken slaap-, gereedheids- en hartslagcontext ervoor of de intensiteit bij mijn herstelniveau paste, en stel training voor de komende 48 uur voor.',
      'ui.ai_template.long_run_compare.name': 'Vergelijking lange runs',
      'ui.ai_template.long_run_compare.prompt':
        'Vergelijk deze lange runs: tempo-/hartslagdrift, ervaren inspanning en herstelcontext. Welke sessie was het efficiëntst, en hoe stel ik de intensiteit voor de volgende in?',
      'ui.ai_template.hr_drift.name': 'Hartslagdrift',
      'ui.ai_template.hr_drift.prompt':
        'Analyseer de hartslagdrift in deze training: de stijging bij constant tempo, beoordeeld tegen twee weken slaap en trainingsbelasting — vermoeidheid, weer, of een verandering in conditie?',
      fallbackIssue: 'Een statusnotitie kon niet worden herkend',
    },
    'lib/bridge/errors': {
      desktopOnly: 'Gebruik de desktop-app',
      genericFailure: 'Dat is niet gelukt. Probeer het zo opnieuw',
      timedOut:
        'Het verzoek is verlopen. Controleer je netwerk en de Zepp-regio en probeer het opnieuw.',
    },
    'lib/dateTime': {
      time: 'Tijdnotatie',
      date: 'Datumnotatie',
      regional: 'Systeemregio',
      '12h': '12-uurs',
      '24h': '24-uurs',
      ymd: 'Jaar/maand/dag',
      dmy: 'Dag/maand/jaar',
      mdy: 'Maand/dag/jaar',
    },
    'lib/deviceCopy': {
      introNoDevice:
        'Lokaal eerst, bronnen intact: je wearable-records, georganiseerd in een gezondheidsbestand dat je echt kunt lezen.',
      introOne: (name: string) =>
        `Lokaal eerst, bronnen intact: ${name}-records, georganiseerd in een gezondheidsbestand dat je echt kunt lezen.`,
      introTwo: (first: string, second: string) =>
        `Lokaal eerst, bronnen intact: ${first}- en ${second}-records, georganiseerd in een gezondheidsbestand dat je echt kunt lezen.`,
      introMany: (first: string, second: string, count: number) =>
        `Lokaal eerst, bronnen intact: records van ${first}, ${second} en ${count} apparaten in totaal, georganiseerd in een gezondheidsbestand dat je echt kunt lezen.`,
      notProvided: 'Niet verstrekt',
    },
    'lib/failedChunkText': {
      noCanonical:
        'De cloud gaf een payload terug, maar er waren geen bruikbare records uit te parsen',
      noReason: 'Geen reden vastgelegd',
    },
    'lib/format': {
      noUpdates: 'Nog geen updates',
      noRecords: 'Nog geen records',
      timeUnknown: 'Tijd onbekend',
      dateUnknown: 'Datum onbekend',
      durationUnknown: 'Duur onbekend',
      notRecorded: 'Niet vastgelegd',
      duration: (hours: number, minutes: number) =>
        (hours > 0 ? `${hours} uur ${minutes} min` : `${minutes} min`),
    },
    'lib/labels': {
      unknownWithCode: (code: string) => `Niet-herkende training (code ${code})`,
      unknownWorkout: 'Niet-herkende training',
      workout: 'Training',
      fallback: {
        run: 'Buiten hardlopen',
        running: 'Hardlopen',
        walking: 'Wandelen',
        walk: 'Wandeling',
        ride: 'Buiten fietsen',
        cycling: 'Buiten fietsen',
        indoor_cycling: 'Binnen fietsen',
        swimming: 'Zwemmen',
        treadmill: 'Loopband',
        indoor_run: 'Binnen hardlopen',
        trail: 'Trailrunning',
        hiking: 'Hiken',
        strength: 'Krachttraining',
        elliptical: 'Crosstrainer',
        rowing: 'Roeien',
        yoga: 'Yoga',
        climb: 'Klimmen',
        badminton: 'Badminton',
        activity: 'Activiteit',
        unknown: 'Niet-herkende training',
      },
      providerZeppCloud: 'Zepp Cloud',
      scopeUserFused: 'Door gebruiker samengevoegd',
      scopeDevice: 'Eén apparaat',
      scopeMixed: 'Meerdere bronnen',
      scopeUnknown: 'Bereik niet bevestigd',
    },
    'lib/lifeEvents': {
      title: 'Levensgebeurtenissen',
      intro: 'Leg vast wat er naast je gezondheidsgegevens gebeurde.',
      add: 'Gebeurtenis toevoegen',
      edit: 'Gebeurtenis bewerken',
      empty:
        'Nog geen levensgebeurtenissen. Begin met een ziekte, een reis, of een verandering in training.',
      name: 'Titel',
      category: 'Categorie',
      start: 'Begindatum',
      end: 'Einddatum',
      ongoing: 'Loopt nog',
      notes: 'Notities (optioneel)',
      placeholder: 'Bijvoorbeeld: verkouden, een paar dagen geen training',
      save: 'Opslaan',
      cancel: 'Annuleren',
      remove: 'Verwijderen',
      deleteTitle: 'Deze levensgebeurtenis verwijderen?',
      deleteHint: 'Deze notitie wordt uit de lokale database verwijderd.',
      invalid:
        'Voer een titel en geldige datums in. De einddatum kan niet voor de begindatum liggen.',
      failed: 'De actie kon niet worden voltooid. Probeer het opnieuw.',
      saved: 'Levensgebeurtenis opgeslagen.',
      deleted: 'Levensgebeurtenis verwijderd.',
      loading: 'Levensgebeurtenissen laden…',
      retry: 'Opnieuw proberen',
      all: 'Allemaal',
      active: 'Lopend',
      search: 'Levensgebeurtenissen zoeken',
      noMatch: 'Geen passende gebeurtenissen.',
      previous: 'Vorige',
      next: 'Volgende',
      manage: 'Levensgebeurtenissen beheren',
      related: 'Gerelateerde gebeurtenissen',
      local:
        'Lokaal opgeslagen en meegenomen in databaseback-ups. Je kunt levensgebeurtenissen meesturen bij het doorgeven van gegevens aan AI.',
      categories: {
        health: 'Gezondheid en herstel',
        travel: 'Reizen',
        routine: 'Routine en levensstijl',
        training: 'Training en wedstrijden',
        other: 'Overig',
      },
    },
    'lib/metricSeries': {
      noRecordsToShow: 'Geen records om te tonen',
      noRecordsInWindow: (days: number) => `Geen records in de afgelopen ${days} dagen`,
      coverage: (days: number, withData: number) =>
        `${withData} van ${days} dagen hebben records`,
      dayRange: (low: string, high: string, unit: string) =>
        `Die dag liep het van ${low} tot ${high}${unit}`,
      samples: (count: number) =>
        plural(count, { one: `${count} meting`, other: `${count} metingen` }),
    },
    'lib/rangeOptions': {
      d7: '7 dagen',
      d30: '1 maand',
      d90: '3 maanden',
      d180: '6 maanden',
      d365: '1 jaar',
    },
    'lib/sleepStages': {
      deep: 'Diep',
      light: 'Licht',
      rem: 'REM',
      awake: 'Wakend',
      unknown: 'Onbekend',
    },
    'lib/storageEstimateText': {
      stopNoSpace: (needed: string, free: string) =>
        `Dit ophalen heeft ongeveer ${needed} nodig (inclusief een veiligheidsmarge) maar er is maar ${free} vrij, dus het start niet. Maak ruimte vrij of kies een kortere periode.`,
      diskUnknown:
        'De vrije schijfruimte kon niet worden gelezen. Zorg dat er genoeg ruimte is voordat je historie ophaalt.',
      diskTooSmall:
        'Minder dan 300 MB vrij — historie langer dan 90 dagen kan niet worden opgehaald.',
      builtinGuess: (days: number, add: string, free: string) =>
        `Nog te weinig lokale metingen, dus dit is een ruwe ingebouwde schatting: ${days} dagen neemt ongeveer ${add}, en er is ${free} vrij op deze schijf.`,
      measured: (days: number, add: string, free: string) =>
        `Gebaseerd op het tempo waarin je eigen gegevens echt aangroeien neemt ${days} dagen ongeveer ${add}, en er is ${free} vrij op deze schijf.`,
      partial: (days: number, add: string, free: string) =>
        `Alleen gebaseerd op de stromen met genoeg lokale metingen neemt ${days} dagen ongeveer ${add} (de rest telt niet mee), en er is ${free} vrij op deze schijf.`,
      unknownEstimate: 'De grootte van dit ophaalbereik kan nu niet worden geschat.',
    },
    'lib/syncStreams': {
      heart_rate: 'Hartslag',
      daily_summary: 'Dagsamenvattingen',
      sleep: 'Slaap',
      hrv: 'Hartslagvariabiliteit',
      wellness: 'Stress, SpO2 en andere optionele metrieken',
      workouts: 'Trainingen',
      workout_detail: 'Trainingsdetail en tracks',
      weight: 'Gewicht en lichaamssamenstelling',
      vo2max: 'VO₂max',
      lactate_threshold_hr: 'Lactaatdrempelhartslag',
      lactate_threshold_pace: 'Lactaatdrempeltempo',
      resting_heart_rate: 'Rusthartslag',
      training_load: 'Trainingsbelasting',
      blood_oxygen: 'Bloedzuurstof',
      breathing_rate: 'Ademhalingsfrequentie',
      skin_temperature: 'Huidtemperatuur',
    },
    'lib/units': {
      big: 'km',
      short: 'm',
      bigImperial: 'mi',
      shortImperial: 'ft',
    },
    'services/updateService': {
      nothingToInstall: 'Er is geen update om te installeren. Controleer opnieuw.',
    },
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
      capabilityFoodHistoryHint: 'Er staan voedingsrecords in de cloud, maar nog niet lokaal. Zijn ze ouder dan het venster voor incrementele synchronisatie, synchroniseer dan de geschiedenis voor die datums. Verschijnen ze daarna nog niet, meld dan het gegevensformaat.',
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
    'views/ActivityDetail': {
      backToOverview: 'Terug naar overzicht',
      eyebrow: 'Dagelijkse activiteit',
      title: 'Dagelijkse activiteit',
      intro:
        'Stappen, afstand, actieve verbranding en actieve minuten per dag. Alleen vergeleken met je eigen eerdere records; dagen zonder gegevens blijven leeg in plaats van met een nul te worden gevuld.',
      rangeAria: 'Tijdsbereik',
      desktopOnly:
        'Gebruik de desktop-app. Deze browserpreview leest geen accountgegevens.',
      loadFailed: 'Activiteitsgegevens zijn nu niet beschikbaar',
      retry: 'Opnieuw proberen',
      loadingAria: 'Dagelijkse activiteit laden',
      noneInRange:
        'Geen activiteitsrecords in deze periode. Probeer een langere periode, of voer eerst een synchronisatie uit.',
      emptyCard: 'Niets vastgelegd in deze periode.',
      stepsLabel: 'Stappen',
      stepsHint: 'Dagtotaal aan stappen van het horloge',
      stepsUnit: 'stappen',
      distanceLabel: 'Afstand',
      distanceHint: 'Die dag afgelegde afstand',
      distanceUnit: 'm',
      caloriesLabel: 'Actieve verbranding',
      caloriesHint: 'Alleen activiteit, basale stofwisseling uitgesloten',
      caloriesUnit: 'kcal',
      minutesLabel: 'Actieve minuten',
      minutesHint: 'Minuten die het horloge als actief telde',
      minutesUnit: 'min',
    },
    'views/AiComposer': {
      daysOption: (days: number) => `${days} dagen`,
    },
    'views/BodyStatus': {
      backToOverview: 'Terug naar overzicht',
      eyebrow: 'Lichaamsstatus',
      title: 'Lichaamsstatus',
      intro:
        'Lokale trends voor gereedheid, stress, bloedzuurstof, HRV, ademhalingsfrequentie, rusthartslag, lichaamssamenstelling en voedselinname. Alles gelezen uit gesynchroniseerde records.',
      rangeAria: 'Tijdsbereik',
      trendRangeLabel: 'Trendbereik',
      desktopOnly:
        'Gebruik de desktop-app. Deze browserpreview leest geen accountgegevens.',
      loadFailed: 'Lichaamsstatusgegevens zijn nu niet beschikbaar',
      retry: 'Opnieuw proberen',
      loadingAria: 'Lichaamsstatus laden',
      noneInRange:
        'Geen lichaamsstatusrecords in deze periode. Probeer een langere periode, of voer eerst een synchronisatie uit.',
      emptyCard: 'Niets vastgelegd in deze periode.',
      readinessLabel: 'Gereedheid',
      readinessHint: 'Het horloge weegt slaap, HRV en rusthartslag samen tot één score',
      stressLabel: 'Stress',
      stressHint: 'Daggemiddelde; de gearceerde band is het gemeten bereik van die dag',
      curveCardAria: 'Stress over 24 uur',
      curveTitle: 'Afgelopen 24 uur stress',
      curveSub: 'Het horloge meet elke vijf minuten; individuele metingen in tijdvolgorde',
      curveChartAria: 'Stress over de afgelopen 24 uur',
      curveNoSamples:
        'Geen stressmetingen in de afgelopen 24 uur, dus er is geen curve om te tekenen. Zo ziet een niet-gedragen horloge eruit, of een uitgeschakelde heledag-monitoring.',
      curveNote:
        'De banden (ontspannen 1-39, normaal 40-59, gemiddeld 60-79, hoog 80-100) zijn van Zepp zelf, niet van ons. Tijd zonder metingen blijft leeg in plaats van met nullen gevuld.',
      statLatest: 'Laatste',
      statAverage: 'Gemiddelde',
      statLowest: 'Laagste',
      statHighest: 'Hoogste',
      stressTooltip: (clock: string, value: number) => `${clock} <b>${value}</b>`,
      spo2Label: 'Bloedzuurstof',
      spo2Hint:
        'Individuele SpO2-metingen per dag gemiddeld; de band is het gemeten bereik van die dag',
      spo2Empty: 'Geen individuele SpO2-metingen in deze periode.',
      odiLabel: 'Nachtelijke SpO2-ODI',
      odiHint: 'Desaturaties per uur; lager is beter',
      hrvHint: 'Hartslagvariabiliteit, individuele metingen per dag gemiddeld',
      rmssdHint: 'Nachtelijke hoogfrequente variabiliteit, per dag gemiddeld',
      respiratoryLabel: 'Ademhalingsfrequentie',
      respiratoryHint:
        'Ademhalingstempo tijdens de slaap; de band is het gemeten bereik van die dag',
      restingLabel: 'Rusthartslag',
      restingHint: 'Rusthartslag zoals ZeppBridge die per dag berekent',
      unitScore: 'pt',
      unitPerHour: '/uur',
      unitBreathsPerMinute: 'br/min',
      weightLabel: 'Gewicht',
      weightHint:
        'Elke weging, per dag gemiddeld; de band is het gemeten bereik van die dag',
      bmiLabel: 'BMI',
      bmiHint: 'Body mass index, door de cloud meegestuurd bij het gewicht',
      fatLabel: 'Lichaamsvet',
      fatHint:
        'Vereist een weegschaal met lichaamssamenstelling. Horloge- en handmatig ingevoerde gewichten dragen geen vetmeting',
      muscleLabel: 'Spiermassa',
      muscleHint: 'Vereist een weegschaal met lichaamssamenstelling',
      waterLabel: 'Lichaamsvocht',
      waterHint: 'Vereist een weegschaal met lichaamssamenstelling',
      boneLabel: 'Botmassa',
      boneHint: 'Vereist een weegschaal met lichaamssamenstelling',
      visceralLabel: 'Visceraal vet',
      visceralHint: 'Een graad, geen percentage. Zepp scoort het 1-30',
      bmrLabel: 'Basale stofwisseling',
      bmrHint: 'Vereist een weegschaal met lichaamssamenstelling',
      heightLabel: 'Lengte',
      heightHint:
        'Profielgegevens die bij elke weging worden meegeëchood, geen meting van de dag',
      unitGrade: 'graad',
      unitKcalPerDay: 'kcal/dag',
      scaleEmpty:
        'Geen wegingen in deze periode. Weegschaalmetingen verschijnen hier na een synchronisatie.',
      bodyGroupTitle: 'Gewicht en lichaamssamenstelling',
      bodyGroupEmpty:
        'Geen gewichts- of lichaamssamenstellingsrecords in deze periode. Samenstellingsmetingen vereisen een weegschaal met lichaamssamenstelling; horloge- en handmatig ingevoerde gewichten dragen er geen.',
      intakeGroupTitle: 'Inname',
      intakeGroupEmpty:
        'Geen voedselrecords in deze periode. Maaltijden worden met de hand gelogd in de Zepp-app; eenmaal gelogd verschijnen ze hier na een synchronisatie.',
      intakeCaloriesLabel: 'Gegeten calorieën',
      intakeCaloriesHint:
        'Totaal gelogd voor de dag. Dagen zonder log krijgen geen balk en worden nooit met 0 gevuld',
      proteinLabel: 'Eiwit',
      fatIntakeLabel: 'Vet',
      carbsLabel: 'Koolhydraten',
      macroHint: 'Totaal gelogd voor de dag',
      unitKcal: 'kcal',
      unitGram: 'g',
      macroTitle: 'Voedingsbalans',
      macroSub:
        'Aandeel calorieën dat elke macronutriënt over deze periode bijdroeg',
      macroNote:
        'De aandelen zijn hier afgeleid uit de dagelijkse grammen met 4/9/4 kcal per gram (eiwit / vet / koolhydraten). Ze worden niet door de cloud gestuurd en kunnen een punt of twee afwijken van de percentages in de Zepp-app. Er wordt niets getekend tenzij alle drie aanwezig zijn.',
      gramsPerDay: (grams: number) => `${grams} g per dag gemiddeld`,
    },
    'views/DeviceDetail': {
      backToSettings: 'Terug naar instellingen',
      notFoundTitle: 'Dit apparaat is hier niet',
      notFoundMessage:
        'Het kan uit het account zijn verwijderd, of deze machine heeft het nog niet herkend.',
      reidentify: 'Apparaten opnieuw herkennen',
      factsAria: 'Apparaatinformatie',
      factOrigin: 'Waar het model vandaan kwam',
      factFirmware: 'Firmware',
      factLastData: 'Laatste gegevens',
      factHasLocal: 'Lokale gegevens ervoor',
      factDeviceId: 'Apparaat-id',
      hasLocalYes: 'Ja',
      hasLocalNo: 'Nog geen',
      factsNote:
        'De apparaat-id wordt alleen op deze machine gebruikt, alleen de laatste vier tekens verschijnen ooit op het scherm, en hij bereikt nooit een export of een foutrapport.',
      assignAria: 'Modelidentificatie',
      assignTitle: 'Klopt dit?',
      assignSub:
        'Als de match niet klopt — stel dat het echt een Balance 2 is en dit zegt iets anders — kun je zelf het juiste model aanwijzen. Je keuze blijft op deze machine, verschijnt als "Door jou gekozen model" in plaats van zich als automatische match voor te doen, en kan op elk moment worden ingetrokken.',
      changeModel: 'Kies een ander',
      pickModel: 'Dat klopt niet, laat me kiezen',
      clearAssignment: 'Keuze intrekken en terug naar automatisch',
      noLocalIdentifier:
        'Dit apparaat draagt geen lokale identificatie, dus er kan geen keuze voor worden opgeslagen.',
      originUnknown: 'Onbekend',
      originUserAssigned: 'Vorige keer door jou gekozen',
      originExact: 'Exacte match in de ingebouwde catalogus',
      originAlias: 'Aliasmatch in de ingebouwde catalogus',
      originNoMatchCloud: 'Geen match (de cloud gaf geen herkenbare productnaam)',
      originCatalog: 'Gematcht in de ingebouwde catalogus',
      originNoMatch: 'Geen match',
    },
    'views/HealthCheck': {
      window30: 'Afgelopen 30 dagen',
      window90: 'Afgelopen 90 dagen',
      window365: 'Afgelopen jaar',
      loadFailed: 'De gegevensgezondheidsstatus kon niet worden gelezen',
      retry: 'Opnieuw proberen',
      noRecords: 'Nog geen records',
      timeUnknown: 'Tijd onbekend',
      notProvided: 'Niet verstrekt',
      backToSettings: 'Terug naar instellingen',
      eyebrow: 'Gegevensgezondheid',
      title: 'Gegevensgezondheidscontrole',
      intro:
        'Per gegevensstroom: hoe ver hij kwam met ophalen uit de cloud, parsen en lokaal schrijven; welke datums hij dekt; en waar hij vandaan kwam. Ontbrekend is ontbrekend — nooit opgevuld met een nul.',
      rangeAria: 'Dekkingsvenster',
      loadingAria: 'De gegevensgezondheidsstatus wordt gelezen',
      replayInProgress:
        'Lokale payloads worden opnieuw door de nieuwe parser gehaald. Cloudsynchronisaties wijken hier tijdens uit en proberen zichzelf opnieuw; dat is geen mislukking.',
      timingsTitle: 'Drie verschillende "laatste keren"',
      timingCloud: 'Laatst uit de cloud opgehaald',
      timingCloudNote: 'Nog geen resultaat',
      timingReplay: 'Laatste lokale replay',
      timingReplayNote:
        'Leest lokale payloads opnieuw met de huidige parser. Geen netwerk, en het herschrijft de tijd hierboven niet.',
      timingManual: 'Laatste handmatige herverwerking',
      timingManualNote: 'Die waar je zelf op klikte',
      timingNewest: 'Nieuwste gezondheidsmeting',
      timingNewestNote: 'Wanneer het record zelf op het horloge gebeurde',
      dbTitle: 'Lokale database',
      dbSize: 'Bestandsgrootte',
      dbRaw: 'Ruwe payloads',
      dbCanonical: 'Genormaliseerde records',
      dbPending: 'Wachtend op normalisatie',
      dbSchema: 'Schemaversie',
      dbNormalizer: 'Parserrevisie',
      integrityPassed: 'geslaagd',
      integrityFailed: (detail: string) => `mislukt (${detail})`,
      integrityDetailBelow: 'details hieronder',
      integrityLine: (verdict: string, checkedAt: string) =>
        `Integriteitscontrole: ${verdict} · ${checkedAt}`,
      integrityNeverRun:
        'Er is geen integriteitscontrole uitgevoerd. Hij scant de hele database, wat op een grote even duurt, dus hij draait alleen als je erom vraagt.',
      streamsTitle: 'Hoe ver elke stroom kwam',
      streamsNote:
        "Ophalen, parsen en schrijven zijn drie dingen die afzonderlijk falen. Samengevouwen tot één rode stip zou je niet kunnen zien of je moet opnieuw proberen, opnieuw koppelen, of dat dit account zo'n stroom simpelweg niet heeft.",
      stageFetch: 'Ophalen',
      stageParse: 'Parsen',
      stageWrite: 'Schrijven',
      stageLine: (stage: string, state: string) => `${stage}: ${state}`,
      factRaw: 'Ruwe payloads',
      factCanonical: 'Genormaliseerde records',
      factSources: 'Bronnen',
      factObservedDays: 'Waargenomen dagen',
      days: (count: number) =>
        plural(count, { one: `${count} dag`, other: `${count} dagen` }),
      gapExamples: (dates: string) => `Gaten zijn onder andere: ${dates}`,
      gapMore: ' en meer',
      period: '.',
      latestObserved: (date: string) => `Meest recente ${date}.`,
      noRecordsYet: 'Nog geen records',
      sourceSeparator: ', ',
      occasionalTitle: 'Metrieken die maar af en toe opduiken',
      occasionalNote:
        'Metrieken als VO₂max en lactaatdrempel worden by design niet dagelijks gerapporteerd. Deze sectie meldt de waargenomen dagen en de meest recente, en telt nooit dagelijkse gaten — normale schaarste rood schilderen zou juist misleidend zijn.',
      occasionalLine: (records: string, days: number) =>
        `${records} records · waargenomen op ${days} dagen`,
      occasionalLatest: (date: string) => `meest recente ${date}`,
      occasionalNone: 'Niets waargenomen in deze periode',
      actionsTitle: 'Wat je kunt doen',
      actionRunning: 'Bezig…',
      actionRun: 'Uitvoeren',
      confirmDestructive: (label: string, reason: string) =>
        `${label}: ${reason}\nDoorgaan?`,
      actionSynced: 'Synchronisatie gedraaid en de status is ververst.',
      actionReplayed: (count: string) =>
        `Lokale payloads opnieuw afgespeeld met de huidige parser (${count} afgeleide records). De cloud-synchronisatietijd is niet herschreven.`,
      actionIntegrityOk: 'De database is door de integriteitscontrole gekomen.',
      actionIntegrityFailed: (detail: string) =>
        `De database is niet door de integriteitscontrole gekomen: ${detail}`,
      actionIntegrityFallback:
        'Maak een back-up van de gegevensmap en synchroniseer opnieuw',
      actionFolderOpened: 'Gegevensmap geopend.',
      actionReconnect: 'Ga naar Instellingen en koppel het Zepp-account opnieuw.',
      actionFailed: (label: string) => `${label} mislukt`,
      coveragePerEvent:
        'Per gebeurtenis geproduceerd: geen record betekent dat er toen niets gebeurde, niet dat iets ontbreekt.',
      coverageOccasional:
        'Het horloge meldt dit maar af en toe; lege dagen zijn normaal en betekenen dat niets verloren ging.',
      coverageNoData:
        'Nog geen lokale gegevens voor deze periode. Voer eerst een synchronisatie uit.',
      coverageNoGaps: 'Geen gaten waargenomen sinds de eerste dag met gegevens.',
      coverageGaps: (days: number) =>
        `${days} dagen zonder waargenomen gegevens sinds de eerste dag met gegevens. Het horloge niet dragen, niet synchroniseren, of een cloud die niets teruggeeft veroorzaken allemaal gaten.`,
      action: {
        reauth: {
          label: 'Het Zepp-account opnieuw koppelen',
          reason: 'Sommige stromen kunnen niet ophalen omdat de inloggegevens zijn verlopen.',
        },
        reprocess: {
          label: 'Lokale payloads opnieuw afspelen met de huidige parser',
          reason: '' as string,
        },
        sync_retry: {
          label: 'Opnieuw synchroniseren',
          reason: 'Sommige stromen zijn de vorige keer niet uit de cloud opgehaald.',
        },
        sync_first: {
          label: 'De eerste synchronisatie uitvoeren',
          reason: 'Deze machine heeft nog geen geslaagde cloudsynchronisatie op record.',
        },
        integrity_check: {
          label: 'Database-integriteit controleren',
          reason: 'Draait één SQLite integrity_check over de hele database; op een grote duurt dat even.',
        },
        open_data_folder: {
          label: 'De gegevensmap openen',
          reason: 'De lokale database, back-ups en exports staan hier allemaal.',
        },
      },
      reprocessReason: (pending: number) =>
        `${pending} opgeslagen payloads hebben nog geen genormaliseerd record opgeleverd. Een replay raakt geen netwerk en herschrijft de cloud-synchronisatietijd niet.`,
      cadence: {
        continuous: 'meerdere keren per dag',
        daily: 'eenmaal per dag',
        nightly: 'eenmaal per nacht',
        per_event: 'alleen als het gebeurt',
        occasional: 'alleen af en toe',
      },
      stage: { ok: 'OK', failed: 'mislukt', never: 'nooit gebeurd' },
      errorKind: {
        network: 'de cloud was niet bereikbaar',
        auth: 'het account moet opnieuw worden gekoppeld',
        not_available: "dit account heeft zo'n stroom niet",
        unrecognized_payload: 'er kwam een payload aan die niet te lezen was',
        cloud_rejected: 'de cloud ontving het verzoek en weigerde het',
        storage: 'schrijven naar de lokale database is mislukt',
        busy: 'een andere bewerking was aan het schrijven, dus deze week uit',
        cancelled: 'geannuleerd',
        unknown: 'ongeclassificeerde fout',
      },
      source: {
        device: 'één apparaat',
        user_fused: 'door gebruiker samengevoegd',
        unknown: 'bron onbekend',
      },
    },
    'views/HeartRateDetail': {
      backToOverview: 'Terug naar overzicht',
      eyebrow: 'Hartslag',
      title: 'Hartslag',
      intro:
        'De heledag-curve hierboven is altijd de afgelopen 24 uur; 7 dagen / 1 maand / 6 maanden veranderen alleen de trends per dag hieronder. Stukken zonder metingen blijven leeg, niet gevuld met een nul.',
      rangeAria: 'Trendbereik',
      trendRangeLabel: 'Trendbereik',
      desktopOnly:
        'Gebruik de desktop-app. Deze browserpreview leest geen accountgegevens.',
      loadFailed: 'Hartslaggegevens zijn nu niet beschikbaar',
      dayFailed: 'De afgelopen 24 uur hartslag konden niet worden gelezen.',
      dailyMaxFailed: 'De dagelijkse piekhartslag kon niet worden gelezen.',
      trendsFailed: 'Rusthartslag- en HRV-trends konden niet worden gelezen.',
      retry: 'Opnieuw proberen',
      loadingAria: 'Hartslag laden',
      dayCardAria: 'Hartslag over 24 uur',
      dayTitle: 'Afgelopen 24 uur',
      daySub: 'Individuele metingen, in tijdvolgorde',
      statLatest: 'Laatste',
      statAverage: 'Gem.',
      statLowest: 'Min',
      statHighest: 'Max',
      chartAria: 'Hartslag over de afgelopen 24 uur',
      noSamples:
        'Geen hartslagmetingen in de afgelopen 24 uur, dus er is geen curve om te tekenen.',
      bpmTooltip: (clock: string, value: number) => `${clock} <b>${value}</b> bpm`,
      restingLabel: 'Rusthartslag',
      restingHint: 'Het horloge meldt er een per dag; constanter is beter',
      hrvHint: 'Individuele HRV-metingen, per dag gemiddeld',
      rmssdHint: 'Een andere HRV-maat, niet hetzelfde getal als hierboven',
      emptyCard: 'Niets vastgelegd in deze periode.',
      dailyMaxTitle: 'Dagelijkse piekhartslag (ruwe metingen op deze machine)',
      dailyMaxSub:
        'De Zepp-app filtert zijn dagelijkse piek; deze niet. Dat de twee getallen verschillen is verwacht.',
      dailyMaxAria: 'Trend van dagelijkse piekhartslag',
      dailyMaxNone:
        'Geen hartslagmetingen op deze machine voor deze periode, dus er is geen piek om te vergelijken.',
      dailyMaxSparse: (days: number) =>
        `${days} van deze dagen hebben heel weinig metingen (minder dan 60). Op die dagen is de piek het hoogste van alleen die punten, niet de echte piek van die dag — ze worden als holle markeringen getekend.`,
      dailyMaxLegendMax: 'Piek',
      dailyMaxLegendAvg: 'Gemiddelde',
      dailyMaxTooltip: (date: string, max: number, avg: number, samples: number) =>
        `${date}<br/>Piek <b>${max}</b> bpm<br/>Gemiddelde ${avg} bpm<br/>${samples} metingen`,
      dailyMaxNote:
        'Dit gebruikt alleen de ruwe per-meting-samples die op deze machine zijn opgeslagen. De dagelijkse piek van Zepp wordt ons nooit gestuurd (de device_max_hr in de bibliotheek is het geconfigureerde maximum voor zonegrenzen, geen gemeten piek), dus er is hier niets om ernaast te leggen — open de Zepp-app om dat dagcijfer te vergelijken.',
    },
    'views/Overview': {
      overviewTitle: 'Overzicht',
      unrecognizedSuffix: ' heeft nog geen herkend model',
      unrecognizedCta: 'Wijs het met de hand aan',
      deviceErrorPrefix: 'Apparaatherkenning: ',
      loadingAria: 'Het overzicht wordt geladen',
      loadFailedTitle: 'Het gegevensoverzicht kon niet worden gelezen',
      retry: 'Opnieuw proberen',
      healthUnavailable: 'Gezondheidsgegevens zijn nu niet beschikbaar',
      partialUnavailable: 'Sommige gegevensstromen zijn nog niet opgehaald',
      bodyPanelAria: 'Lichaamsstatus openen',
      bodyTitle: 'Lichaamsstatus',
      factRecovery: 'Gereedheid',
      factStress: 'Stress',
      factSpo2: 'SpO2',
      bodySparkLabel: 'Gereedheid over de afgelopen 7 dagen',
      bodyThin: 'Te weinig records in de afgelopen 7 dagen om een trend te tekenen',
      bodyEmpty:
        'Gereedheid, stress en bloedzuurstof verschijnen hier na een synchronisatie',
      trainingPanelAria: 'Trainingsstatus openen',
      trainingTitle: 'Trainingsstatus',
      factLoad: 'Belasting',
      trainingSparkLabel: 'Trainingsbelasting over de afgelopen 7 dagen',
      trainingThin:
        'Te weinig records in de afgelopen 7 dagen om een trend te tekenen',
      trainingEmpty:
        'VO₂max en trainingsbelasting verschijnen hier na een synchronisatie',
      loadLow: 'laag',
      loadMedium: 'matig',
      loadHigh: 'hoog',
      loadVeryHigh: 'zeer hoog',
      loadBandReference: (band: string) => `${band} (referentie)`,
    },
    'views/RecentRecords': {
      backToOverview: 'Terug naar overzicht',
      title: 'Recente records',
      intro: 'Recent gesynchroniseerde slaap en trainingen, naast elkaar.',
      loadingLabel: 'Recente records laden',
      loadFailedTitle: 'De recente records konden niet worden geladen',
      desktopOnly:
        'Gebruik de desktop-app. Deze browserpreview leest geen accountgegevens.',
      retry: 'Opnieuw proberen',
      partialUnavailable: 'Sommige gegevens zijn nu niet beschikbaar',
      filterAll: 'Allemaal',
      recentSleep: 'Recente slaap',
      recentWorkouts: 'Recente trainingen',
      countBadge: (count: number) => `${count} in totaal`,
      seeAll: 'Alles zien',
      noSleep: 'Nog geen slaaprecords',
      noWorkouts: 'Niets om hier te tonen.',
      noWorkoutsOfType: 'Niets om te tonen voor dit trainingstype.',
      hiddenIncomplete: (count: number) =>
        plural(count, {
          one: `${count} incompleet record verborgen`,
          other: `${count} incomplete records verborgen`,
        }),
      notProvided: 'Niet verstrekt',
      dateUnknown: 'Datum onbekend',
      today: 'Vandaag',
      yesterday: 'Gisteren',
      listDate: (month: number, day: number, weekday: string) =>
        `${weekday} ${day}/${month}`,
    },
    'views/SleepDetail': {
      backToRecent: 'Terug naar recente records',
      title: 'Slaaprecord',
      loadingDetail: 'Het slaaprecord wordt gelezen…',
      loadFailedTitle: 'Dit slaaprecord kon niet worden gelezen',
      loadFailed: 'Slaapdetail is nu niet beschikbaar',
      retry: 'Opnieuw proberen',
      notFoundTitle: 'Dit slaaprecord is hier niet',
      notFoundMessage:
        'Het kan zijn opgeschoond, of het is nog niet naar deze machine gesynchroniseerd.',
      heroAria: 'Slaapduur en -score',
      durationKicker: 'Tijd in slaap',
      heroMeta: (fellAsleep: string, wokeUp: string, inBed: string) =>
        `In slaap ${fellAsleep} · wakker ${wokeUp} · in bed ${inBed}`,
      scoreKicker: 'Slaapscore',
      scoreNote: 'Door het apparaat gerapporteerd; getoond zoals vastgelegd, niets meer.',
      stagesAria: 'Slaapstadia',
      stagesTitle: 'Slaapstadia',
      stageHelpButton: 'Wat de stadia betekenen',
      stageHelp:
        'Diep: de herstellende fase. Licht: het overgangsstadium dat het grootste deel van de nacht inneemt. REM: rapid eye movement, verbonden met geheugen en dromen. Wakker: wakker worden of in de nacht wakker liggen. Dit zijn definities, geen gezondheidsdiagnose.',
      weeklyAria: 'Slaap over de afgelopen 7 dagen',
      weeklyTitle: 'Slaapstructuur, afgelopen 7 dagen',
      weeklySub: 'Stadia gestapeld per nacht',
      weeklyChartAria:
        'Gestapeld staafdiagram van slaapstructuur over de afgelopen 7 dagen',
      metaAria: 'Bron en apparaat',
      sourceTitle: 'Bron',
      sourceProvider: 'Aanbieder',
      sourceScope: 'Bereik',
      syncedAt: 'Gesynchroniseerd',
      timezone: 'Tijdzone',
      deviceTitle: 'Apparaat',
      deviceName: 'Naam',
      deviceFirmware: 'Firmware',
      deviceId: 'Apparaat-id',
      footnote:
        'Alleen de stadsamenvatting die de cloud echt gaf. Als er geen REM-veld is leest het "Niet verstrekt" — nooit teruggerekend door aftrekking — en een tijdlijn die niet is verstrekt wordt nooit getekend.',
      notProvided: 'Niet verstrekt',
      syncTimeMissing: 'Synchronisatietijd niet verstrekt',
      lastCloudSync: (clock: string) => `Laatste cloudsynchronisatie ${clock}`,
      deviceUndetermined: 'Apparaat onbepaald',
      hoursAxis: 'uur',
      tooltipTotal: (date: string, hours: string) =>
        `<b>${date} — ${hours} u in totaal in slaap</b><br/>`,
      tooltipRow: (name: string, hours: number) => `${name}: ${hours} u<br/>`,
      tooltipRowMissing: (name: string) => `${name}: Niet verstrekt<br/>`,
    },
    'views/SleepList': {
      backToRecent: 'Terug naar recente records',
      backToOverview: 'Terug naar overzicht',
      title: 'Slaap',
      intro:
        'Slaaprecords gesynchroniseerd naar deze machine. Zonder volledige tijdlijn wordt alleen de samenvatting getoond.',
      loadFailedTitle: 'De slaaprecords konden niet worden gelezen',
      loadFailed: 'De slaaplijst is nu niet beschikbaar',
      retry: 'Opnieuw proberen',
      emptyTitle: 'Nog geen slaaprecords',
      emptyMessage:
        'Ze verschijnen hier na een synchronisatie. Stadia worden nooit verzonnen.',
      scoreLabel: 'Score',
      footnote: (count: number, from: string) =>
        plural(count, {
          one: `${count} record · sinds ${from}`,
          other: `${count} records · sinds ${from}`,
        }),
      shown: (shown: number, total: number) => `${shown} van ${total} getoond`,
      loadMore: 'Meer laden',
      loadingMore: 'Laden…',
    },
    'views/TrainingStatus': {
      backToOverview: 'Terug naar overzicht',
      eyebrow: 'Trainingsstatus',
      title: 'Trainingsstatus',
      intro:
        'VO₂max, lactaatdrempel, trainingsbelasting en hartslagzones. Alles gelezen uit gesynchroniseerde records; geen trainingsadvies.',
      rangeAria: 'Tijdsbereik',
      desktopOnly:
        'Gebruik de desktop-app. Deze browserpreview leest geen accountgegevens.',
      loadFailed: 'Trainingsstatusgegevens zijn nu niet beschikbaar',
      retry: 'Opnieuw proberen',
      loadingAria: 'Trainingsstatus laden',
      vo2Hint: 'Maximale zuurstofopname, door het horloge geschat na buitenruns',
      vo2Empty:
        'Geen VO₂max-records in deze periode; hij werkt alleen bij na een buitenrun.',
      loadLabel: 'Trainingsbelasting',
      loadHint: 'Dagelijkse trainingsbelastingscore',
      loadEmpty: 'Geen trainingsbelastingsrecords in deze periode.',
      paiLabel: 'PAI',
      paiHint: 'Personal Activity Intelligence over een schuivende 7 dagen',
      paiEmpty: 'Geen PAI-records in deze periode.',
      thresholdLabel: 'Lactaatdrempel',
      thresholdHint: 'Hartslag en tempo; werkt alleen bij na een zware run',
      thresholdHr: 'Drempelhartslag',
      thresholdPace: 'Drempeltempo',
      thresholdChartAria: 'Lactaatdrempelhartslag en -tempo',
      thresholdOnce: (date: string) =>
        `Slechts één drempelmeting in deze periode (${date}), dus er is geen trend om te tekenen.`,
      thresholdEmpty: 'Geen lactaatdrempelmetingen in deze periode.',
      thresholdPaceTooltip: (value: string, unit: string) =>
        `Drempeltempo <b>${value}</b> ${unit}`,
      loadUnit: 'belasting',
      thresholdHrTooltip: (value: number) => `Drempelhartslag <b>${value}</b> bpm`,
      balanceLabel: 'Balans van trainingsbelasting',
      balanceHint:
        '7-daagse belasting tegenover het 28-daagse weekgemiddelde, d.w.z. de acuut-chronisch-ratio',
      balanceChartAria:
        '7-daagse en 28-daagse trainingsbelasting met de acuut-chronisch-ratio',
      balanceEmpty:
        'Nog te weinig trainingsbelastingsrecords om deze lijn te tekenen.',
      balanceNote:
        'Acuut:chronisch = som van de laatste 7 dagen ÷ (som van de laatste 28 dagen ÷ 4). Als het 28-daagse venster minder dan 21 dagen dekt wordt geen ratio gegeven en breekt de lijn daar. Dat is onberekend, geen nul.',
      acute7d: '7-daagse belasting',
      chronicWeekly: '28-daags weekgem.',
      acuteChronic: 'Acuut:chronisch',
      ratioMissing: (days: number) =>
        `— (slechts ${days} dagen gegevens in het 28-daagse venster)`,
      notProvided: 'Niet verstrekt',
      acuteTooltip: (value: string, days: number) =>
        `7-daagse belasting <b>${value}</b> (${days}/7 dagen met gegevens)`,
      chronicTooltip: (value: string) => `28-daags weekgem. <b>${value}</b>`,
      ratioTooltip: (value: string) => `Acuut:chronisch <b>${value}</b>`,
    },
    'views/WorkoutDetail': {
      notProvided: 'Niet verstrekt',
      backToRecent: 'Terug naar recente records',
      loadFailedTitle: 'Deze training kon niet worden gelezen',
      loadFailed: 'Trainingsdetail is nu niet beschikbaar',
      retry: 'Opnieuw proberen',
      notFoundTitle: 'Deze training is hier niet',
      notFoundMessage:
        'Hij kan zijn opgeschoond, of hij is nog niet naar deze machine gesynchroniseerd.',
      insightFailed: 'Er kon geen inzicht voor deze training worden opgebouwd',
      seriesFailed: 'De reeksen per punt voor deze training konden niet worden gelezen',
      seriesFailedTitle: 'De reeksen per punt konden niet worden geladen',
      exportNeedsSeries:
        'De reeksen per punt konden niet worden geladen, dus dit record kan niet worden geëxporteerd.',
      thisWorkout: 'training',
      aiPrompt: (label: string) => `Je bent een sportanalist. Hieronder staat het complete record van één ${label} van mij, uit de lokale ZeppBridge-database en geanonimiseerd.
Analyseer deze sessie alleen aan de hand van de feiten in dit record: de intensiteit, hoe tempo zich verhoudt tot hartslag, of er een duidelijke vertraging of een afwijkend stuk is, en wat er volgende keer concreet anders moet.

Randvoorwaarden:
- Deze gegevens bevatten geen populatiebasislijn. Vergelijk me niet met "gezonde volwassenen" of met een gemiddelde.
- Waar iets ontbreekt, zeg dat het ontbreekt. Vul het gat nooit met een nul of een schatting.
- Geen medische diagnose, geen oordeel over ziekterisico, geen behandeladvies.

Antwoord in Markdown.`,
      needDesktop:
        'De AI-overdracht heeft de desktop-app nodig; deze browserpreview opent geen externe sites.',
      attachmentOpened: (provider: string) =>
        `Het gegevenspakket is naar je bureaublad geschreven (zeppbridge-ai-handoff.json) — sleep het in ${provider}. De prompt staat op je klembord.`,
      attachmentNotOpened: (provider: string) =>
        `Het gegevenspakket is naar je bureaublad geschreven (zeppbridge-ai-handoff.json). De prompt staat op je klembord; open ${provider} zelf.`,
      copiedAndOpened: (provider: string) =>
        `Geanonimiseerde gegevens voor deze training gekopieerd en ${provider} geopend. Plak het erin.`,
      copiedOnly: (provider: string) =>
        `Geanonimiseerde gegevens voor deze training gekopieerd. Open ${provider} zelf en plak het erin.`,
      noCorrection: 'Geen correctie',
      deviceNameMissing: 'Apparaatnaam niet verstrekt',
      notFetchedYet: 'Nog niet opgehaald',
      timeUnknown: 'Tijd onbekend',
      overrideSaved: 'De correctie van het trainingstype is lokaal opgeslagen.',
      overrideCleared: 'Correctie gewist. Terug naar de eigen match van ZeppBridge.',
      overrideFailed: 'De correctie van het trainingstype kon niet worden opgeslagen',
      copied: (format: string) => `${format}-gegevens naar het klembord gekopieerd.`,
      copyFailed: 'Dit record kon niet worden gekopieerd',
      metricDistance: 'Afstand',
      metricDuration: 'Bewegingstijd',
      metricAvgHr: 'Gem. hartslag',
      metricAvgPace: 'Gem. tempo',
      metricMovingTime: 'Bewegingstijd',
      metricPausedTime: 'Pauzetijd',
      metricMovingPace: 'Tempo in beweging',
      metricElapsedPace: 'Tempo over verstreken tijd',
      metricAscent: 'Stijging',
      metricTrainingLoad: 'Trainingsbelasting',
      metricTrainingEffect: 'Aeroob effect',
      metricAnaerobicEffect: 'Anaeroob effect',
      metricRpe: 'Ervaren inspanning',
      metricMaxHr: 'Max. hartslag',
      metricCalories: 'Calorieën',
      unitKcal: 'kcal',
      statFastest: 'Snelste',
      statAverage: 'Gem.',
      statSlowest: 'Langzaamste',
      statMin: 'Min',
      statMax: 'Max',
      chartHeart: 'Hartslag',
      chartPace: 'Tempo',
      chartAltitude: 'Hoogte',
      chartCadence: 'Cadans',
      chartAria: (title: string) => `${title} over de sessie`,
      decodedRoutePoints: 'GPS-trackpunten',
      decodedSamples: 'Tijdreeksmetingen',
      decodedPauses: 'Pauze-intervallen',
      decodedAvgCadence: 'Gem. cadans',
      decodedMaxCadence: 'Max. cadans',
      decodedAvgStride: 'Gem. paslengte',
      decodedDescent: 'Daling',
      decodedMaxHr: 'Max. hartslag',
      decodedAvgPower: 'Gem. vermogen',
      decodedMaxPower: 'Max. vermogen',
      decodedGroundContact: 'Gem. grondcontact',
      decodedVerticalOscillation: 'Gem. verticale oscillatie',
      decodedVerticalRatio: 'Verticale ratio',
      decodedBestEquivalentPace: 'Beste equivalente tempo',
      heroAria: 'Trainingsoverzicht',
      decodedLocally: 'Lokaal gedecodeerd',
      typeEvidenceAria: 'Hoe het trainingstype is bepaald',
      zeppRawCode: (code: string) => `Zepp-ruwe code: ${code}`,
      zeppBridgeMatch: (label: string) => `ZeppBridge leest het als: ${label}`,
      customName: (code: string, name: string) =>
        `Jouw naam voor code ${code}: ${name}`,
      myCorrection: 'Mijn correctie',
      correctionAria: 'Mijn correctie voor dit trainingstype',
      metricListAria: 'Samenvatting van trainingsprestatie',
      routeAria: 'Volledige GPS-track',
      eyebrowRoute: 'Route',
      routeTitle: 'Volledige GPS-track',
      routeNote: 'Lokaal getekend · geen kaarttegels opgevraagd',
      routeSvgAria:
        'Lokale GPS-track gekleurd naar tijd en het dichtstbijzijnde tempomeetpunt',
      routeLegendPace: (count: number) =>
        plural(count, {
          one: `${count} geldig tempopunt · P10–P90`,
          other: `${count} geldige tempopunten · P10–P90`,
        }),
      routeLegendNoPace: 'Minder dan 3 geldige tempopunten · niet gekleurd naar snelheid',
      legendFast: 'Snel',
      legendSteady: 'Constant',
      legendWarm: 'Langzamer',
      legendSlow: 'Langzaam',
      routeEmptyTitle: 'Geen bruikbare track',
      routeEmptyBody:
        'Dit record draagt te weinig GPS-punten, dus er wordt geen route getekend.',
      chartsEmptyTitle: 'Geen per-punt-curves',
      chartsEmptyBody:
        'Voor deze sessie is geen hartslag-, tempo-, hoogte- of cadansreeks gesynchroniseerd.',
      hrZonesAria: 'Hartslagzones',
      eyebrowHrZones: 'Hartslagzones',
      hrZonesTitle: 'Hartslagzones',
      hrZonesNote:
        'De zonegrenzen komen uit je eigen instellingen op het horloge en worden door Zepp met deze training meegestuurd; ZeppBridge snijdt ze niet opnieuw. De pagina Trainingsstatus gebruikt een apart model dat je zelf kiest, dus de twee sets cijfers zullen niet overeenkomen.',
      hrZoneBelow: (upper: number) => `Onder ${upper}`,
      hrZoneBetween: (low: number, high: number) => `${low}-${high}`,
      hrZoneShare: (percent: string) => `${percent}%`,
      hrZoneTotal: (duration: string) => `${duration} met hartslag`,
      hrZoneBarAria: 'Aandeel tijd in elke hartslagzone',
      decodedAria: 'Gedecodeerde waarden',
      eyebrowDecoded: 'Gedecodeerd',
      decodedTitle: 'Gedecodeerde waarden',
      decodedNote:
        'De samenvatting is alleen berekend uit geldige metingen in dit record; afwijkende sprongen worden genegeerd.',
      exportAria: 'Exporteren en delen',
      eyebrowExport: 'Export',
      exportTitle: 'Exporteren en delen',
      exportSub:
        'Kopieer JSON, CSV of GPX, of kies een map om deze training als FIT op te slaan.',
      exportFormatAria: 'Exportformaat',
      exportGo: (format: string) => `${format}-gegevens kopiëren`,
      saveFit: 'FIT-bestand opslaan',
      savedFit: 'FIT-bestand opgeslagen',
      exportFailed: 'Export mislukt',
      handoffAria: 'Doorgeven aan AI',
      eyebrowHandoff: 'Overdracht',
      handoffTitle: 'Doorgeven aan AI',
      handoffSub:
        'Kopieert de geanonimiseerde gegevens voor alleen deze training, plus de prompt, en opent de AI-site die je kiest. Stromen per dag zoals slaap en stappen blijven erbuiten.',
      handoffTarget: 'Doeltool',
      handoffTargetAria: 'Aan welke AI-tool het wordt doorgegeven',
      preparing: 'Voorbereiden…',
      handTo: (provider: string) => `Doorgeven aan ${provider}`,
      provenanceAria: 'Herkomst',
      eyebrowProvenance: 'Herkomst',
      provenanceTitle: 'Herkomst',
      provenanceProvider: 'Aanbieder',
      provenanceScope: 'Bereik',
      provenanceSynced: 'Laatst gesynchroniseerd',
      provenanceRecordId: 'Record-id',
      provenanceDevice: 'Apparaat',
      pageFoot:
        'Gedecodeerd op deze machine. De track is op een lokaal canvas getekend en nooit naar een kaartdienst gestuurd.',
    },
    'views/WorkoutList': {
      backToRecent: 'Terug naar recente records',
      backToOverview: 'Terug naar overzicht',
      title: 'Trainingen',
      intro: 'Trainingen gesynchroniseerd naar deze machine. Geen track, geen kaart.',
      loadFailedTitle: 'De trainingen konden niet worden gelezen',
      loadFailed: 'De trainingslijst is nu niet beschikbaar',
      retry: 'Opnieuw proberen',
      emptyTitle: 'Nog niets om te tonen',
      emptyMessage:
        'Na een synchronisatie verschijnen hier alleen records met een type, een tijd en minstens één echte metriek. Zonder GPS of metingen per punt wordt geen lege grafiek getekend.',
      labelDistance: 'Afstand',
      labelBurn: 'Verbranding',
      labelDuration: 'Duur',
      notProvided: 'Niet verstrekt',
      footnote: (count: number) =>
        plural(count, { one: `${count} record getoond`, other: `${count} records getoond` }),
      shown: (loaded: number, total: number) => `${loaded} van ${total} geladen`,
      loadMore: 'Meer laden',
      loadingMore: 'Laden…',
    },
  },
  errors: {
    'err.ai_task.attachment_missing':
      'Een bijlagebestand staat niet meer op zijn oorspronkelijke plek',
    'err.ai_task.invalid': 'De invoer van de taak is niet geldig. Controleer de velden',
    'err.ai_task.not_found': 'De analysetaak bestaat niet of is verwijderd',
    'err.ai_task.workout_not_found':
      'Sommige gekozen trainingen bestaan niet op dit apparaat',
    'err.ai_task.write_failed': 'De overdrachtsbestanden konden niet worden geschreven',
    'err.ai_template.builtin_readonly':
      'Ingebouwde sjablonen zijn alleen-lezen. Sla een kopie op als eigen sjabloon',
    'err.ai_template.invalid':
      'De invoer van het sjabloon is niet geldig. Controleer de velden',
    'err.ai_template.not_found': 'Het sjabloon bestaat niet of is verwijderd',
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
    'err.mcp.scope_denied': 'Dat verzoek valt buiten de taken die met MCP zijn gedeeld',
    'err.mcp.scope_no_grants':
      'Nog geen taak is met MCP gedeeld. Markeer een taak als gedeeld op de takenpagina en probeer het opnieuw',
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
