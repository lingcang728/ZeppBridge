import { plural, type LocalePack } from '../index';

/**
 * Nederlands (nl) language pack.
 *
 * Overrides the inline zh/en/es copy per moduleId; missing keys fall back
 * to en (then zh) and stay listed in `nl.pending.txt` until translated.
 * Only modules whose `defineMessages` call declares a moduleId can be
 * overridden here — for example `views/Settings` and the
 * `i18n/errors` pack (`errors:` section), plus the flat `backendText:`
 * fallback map for backend-declared `ui.*` prose codes.
 */
export default {
  modules: {
    'components/activity/HourlyStepsCard': {
      title: 'Stappen per uur',
      stepsUnit: 'stappen',
      perDayUnit: 'stappen / dag',
      averageNote: (days: number) => `Gemiddelde over ${days} dagen met gegevens; klik op een rij om alleen die dag te zien`,
      dayNote: (label: string) => `Alleen ${label}`,
      weekNote: (label: string, days: number) => `${label}, gemiddeld over ${days} dagen met gegevens`,
      weekOf: (label: string) => `Week van ${label}`,
      showAverage: 'Terug naar het gemiddelde',
      busiest: (hour: number, steps: string) => `Meeste om ${hour}:00 — ${steps} stappen`,
      busiestAverage: (hour: number, steps: string) => `Meest actief om ${hour}:00 — gem. ${steps} stappen`,
      barTitle: (hour: number, steps: string) => `${hour}:00 — ${steps} stappen`,
      averageBarTitle: (hour: number, steps: string) => `${hour}:00 — gemiddeld ${steps} stappen`,
      noRecord: (hour: number) => `${hour}:00 — niets vastgelegd`,
      heatAria: 'Stappen per uur voor elke dag',
      pickRow: (label: string) => `Alleen ${label} tonen`,
      noRow: (label: string) => `${label}: niets vastgelegd`,
      empty: 'Nog geen stappen per uur in deze periode.',
      failed: 'Stappen per uur nu niet beschikbaar.',
      legend: (peak: string) => `Feller groen betekent meer stappen; het felst is ongeveer ${peak}`,
    },
    'components/OfficialOnlyNote': {
      text: 'Alleen officiële Zepp-autorisatie verbonden: hartslag, slaap, stappen, trainingen, PAI en gewicht synchroniseren. HRV, bloedzuurstof, stress, gereedheid en trainingsbelasting biedt de officiële koppeling niet aan — daarvoor koppel je ‘Geavanceerde gegevens’.',
      action: 'Verbinden',
    },
    'components/ai/WorkoutPicker': {
      title: 'Welke training',
      hint: 'Kies er een of meer, of geen',
      empty: 'Nog geen trainingen op deze machine',
      selectedCount: (count: number) => `${count} geselecteerd`,
      noneSelected: (days: number) =>
        `Geen training gekozen: analyseert de afgelopen ${days} dagen t/m vandaag.`,
      avgHr: (bpm: number) => `gem. hartslag ${bpm}`,
      remove: 'Selectie opheffen',
      showLess: 'Minder tonen',
      showMore: (count: number) => `Nog ${count} tonen`,
    },
    App: {
      quickReturn: (page: string) => `Terug naar ${page}`,
      previousPage: 'Vorige pagina',
      skipToContent: 'Naar de hoofdinhoud',
      mainNav: 'Hoofdnavigatie',
      bottomNav: 'Mobiele hoofdnavigatie',
      navOverview: 'Overzicht',
      navHandoff: 'Naar de AI',
      navSettings: 'Instellingen',
      preparingData:
        'Lokale database openen… de eerste start na een update kan ruim tien seconden duren…',
      compacting: (pending: number) =>
        `Payloads comprimeren (nog ${pending} over)… de melding verdwijnt vanzelf zodra het klaar is; synchronisatie wacht even.`,
      compacted: (saved: string) =>
        `Payloads gecomprimeerd; ca. ${saved} schijfruimte vrijgemaakt.`,
      trayHint:
        'ZeppBridge blijft actief in het systeemvak; automatisch synchroniseren loopt door.',
      browserPreview:
        'Deze browserpreview leest geen accountgegevens — open de desktop-app.',
      routeNotFound: 'Pagina niet gevonden, terug naar het overzicht.',
    },
    'components/BackupPanel': {
      title: 'Databasemomentopnamen en herstel',
      intro1a: 'Een momentopname is een complete kopie van het ',
      intro1b:
        '-bestand. Blijft op deze computer en wordt nergens geüpload. Wordt automatisch gemaakt vóór database-upgrades, of handmatig op elk gewenst moment.',
      compareLead: 'Drie verschillende soorten ‘export’: ',
      compareExchange:
        ' is gegevensuitwisseling voor externe tools (alleen de gekozen periode);',
      compareSnapshotName: 'een databasemomentopname',
      compareSnapshot:
        ' is een volledige databasekopie voor noodherstel in ZeppBridge;',
      comparePackName: 'een AI-pakket',
      comparePack:
        ' bevat handmatig gekozen, geanonimiseerde data voor AI-modellen. Alleen een momentopname zet de database volledig terug.',
      pendingTitle: 'Herstel staat in de wachtrij',
      pendingBodyA: (stagedAt: string) =>
        `In wachtrij geplaatst op ${stagedAt}. De database wordt vervangen bij de `,
      pendingNextStart: 'volgende start',
      pendingBodyB:
        '. De huidige database wordt eerst als herstelpunt bewaard, zodat je bij problemen kunt terugkeren.',
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
      problemFileMissing: 'Het back-upbestand is niet meer in de back-upmap',
      problemSizeMismatch:
        'De grootte van het back-upbestand komt niet overeen met het manifest — het kan beschadigd zijn',
      problemSha256Mismatch:
        'De SHA-256 van het back-upbestand komt niet overeen met het manifest — het kan beschadigd of gewijzigd zijn',
      problemIntegrityFailed:
        'Het back-upbestand is niet door de SQLite-integriteitscontrole gekomen',
      problemUnknown:
        'Deze momentopname is niet door de verificatie gekomen, en er is geen reden vastgelegd.',
      blockerFutureSchema: (backup: number, current: number) =>
        `Deze back-up komt uit een nieuwere ZeppBridge (schema ${backup}, deze app is ${current}). Hem hier openen zou velden laten vervallen, dus hij wordt niet hersteld en de huidige database blijft ongemoeid. Werk ZeppBridge eerst bij.`,
      blockerUnknown:
        'Deze momentopname kan nu niet worden hersteld, en er is geen reden vastgelegd.',
      verifyPassed:
        'Opnieuw verifiëren geslaagd: bestand, grootte, SHA-256 en integriteit kloppen.',
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
        'Rijen met een negatief verschil bevatten na herstel minder gegevens. Herstel haalt niets uit de cloud; synchroniseer opnieuw om eventueel ontbrekende gegevens aan te vullen.',
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
        'Herstel staat in de wachtrij. Deze sessie verandert niets; de database wordt vervangen bij de volgende start van ZeppBridge.',
      stageFailed: 'Het herstel kon niet in de wachtrij worden gezet',
      cancelled: 'Het geplande herstel is geannuleerd; de database is ongewijzigd.',
      cancelFailed: 'Het herstel kon niet worden geannuleerd',
      kind: {
        manual: 'handmatig',
        pre_migration: 'vóór upgrade',
        pre_restore: 'terugvalpunt',
      },
      compatibility: {
        same_schema:
          'De momentopname heeft dezelfde schemaversie als deze app en kan direct worden hersteld.',
        older_schema_will_migrate:
          'De momentopname komt uit een oudere schemaversie; na herstel wordt hij bij de volgende start automatisch bijgewerkt.',
        future_schema_refused:
          'De momentopname komt uit een nieuwere app-versie met een structuur die deze app niet kan lezen; herstellen kan niet.',
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
        'Nog geen gegevens op deze computer. Synchroniseer een keer om de grafieken te vullen.',
      emptyAfterSync:
        'Synchronisatie geslaagd, maar er is niets ontvangen. Misschien heeft dit account voor die periode niets in Zepp, of het horloge heeft nog niet naar de Zepp-app geüpload. Controleer eerst in de Zepp-app op je telefoon of er gegevens zijn en synchroniseer dan opnieuw.',
      emptyUnconfirmedRegion:
        'Synchronisatie geslaagd, maar er is niets ontvangen. Bij het inloggen kon je Zepp-regio niet worden vastgesteld en wordt er nu gegokt — zo ziet een sync naar de verkeerde regio eruit: alles lukt, niets komt terug. Koppel het account opnieuw.',
      reconnect: 'Account opnieuw koppelen',
      short: (covered: number, earliest: string) =>
        `Lokaal ${covered} dagen beschikbaar (vanaf ${earliest}). Eerdere gaten bestaan doordat die periode nog niet uit de cloud is gehaald — niet doordat er toen geen gegevens waren.`,
      backfill: 'Meer historie ophalen',
      backfilling: 'Historie ophalen…',
      syncNow: 'Nu synchroniseren',
      connect: 'Zepp-account koppelen',
      emptyNotConnected: 'Nog niets op deze computer. Koppel eerst je Zepp-account en synchroniseer daarna één keer.',
      keepAllHint:
        'Standaard bewaart deze machine alle records voor lange tijd; synchroniseren ruimt niet vanzelf op.',
      keepAllChange: 'Alleen de recentste periode bewaren',
    },
    'components/DeviceMarquee': {
      marqueeAria: 'Amazfit-apparaten die nu in de catalogus staan',
    },
    'components/DevicePicker': {
      pickerAria: 'Kies je apparaatmodel met de hand',
      searchAria: 'Zoeken op modelnaam',
      searchPlaceholder: 'Zoek een model, bijv. Balance 2',
      empty:
        'Geen passend model gevonden. Probeer een andere zoekterm of filter.',
      prev: 'Vorig model',
      next: 'Volgend model',
      alreadyAssigned: 'Is al dit model',
      confirm: 'Dit is mijn apparaat',
      clear: 'Keuze intrekken',
      later: 'Niet nu',
      contributeTitle: 'Help de volgende release dit apparaat zelf te herkennen',
      contributeBody:
        'Stuurt naar ZeppBridge het door jou gekozen model plus de modelnummers van dit apparaat (deviceSource / deviceType, alleen gehele getallen). Beide zeggen alleen welk model het is — geen account, serienummer, MAC of gezondheidsgegevens. Huami publiceert geen nummertabel; dit is de enige manier waarop de ingebouwde catalogus groeit. Wijzen een paar mensen hetzelfde model aan, dan wordt het voor iedereen automatisch herkend.',
      note: 'Jouw keuze verschijnt als ‘Door jou gekozen model’ en wordt nooit als automatische match voorgedaan. Afbeeldingen en modelnamen komen uit de meegeleverde catalogus; erin bladeren raakt geen netwerk.',
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
        'Elk model berekent zones op zijn eigen manier. ZeppBridge kiest geen willekeurige standaarden en schat nooit via vuistregels (zoals 220 minus leeftijd). Elke onderstaande basis toont meetbron en meetdatum.',
      clearChoice: 'Selectie wissen',
      desktopOnly:
        'De zones zijn te zien in de desktop-app. Deze browserpreview leest geen accountgegevens.',
      noBases:
        'Nog geen bruikbare hartslagbasis lokaal. Synchroniseer een training; daarna verschijnen gemeten waarden zoals je hoogste hartslag.',
      modelGroup: 'Model',
      modelAria: 'Hartslagzonemodel',
      pickModelFirst:
        'Kies eerst een model — de zones hieronder volgen uit de door jou gekozen basissen.',
      pickBasesNext:
        'Kies hierboven de resterende basissen voor de zones en de tijd per zone.',
      window: (days: number, total: string) =>
        `Hartslag per seconde tijdens trainingen over ${days} dagen · ${total} in totaal`,
      outside: (below: string, above: string) =>
        `Buiten de zones: onder Z1 ${below} · boven Z5 ${above}`,
      formulaNote: (formula: string, bases: string) =>
        `${formula}. Grenzen worden naar beneden afgerond, net als op het horloge. Basissen: ${bases}`,
      missingBases: (list: string) => `Nog niet op deze machine: ${list}`,
      basesSeparator: ', ',
      zonesUnavailable: 'Hartslagzones nu niet beschikbaar',
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
          note: 'De hoogste lokaal vastgelegde hartslag. Nooit een echte limiet bereikt, dan vallen de zones smal uit.',
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
        `Gemiddelde van de ${days} dagen met gegevens in de laatste 30.`,
    },
    'components/HistoryArchivePanel': {
      title: 'Langetermijnarchief en volledige historie',
      intro:
        'Het archief bewaart gegevens vanaf vandaag; met ophalen haal je eerdere historie binnen. Samen maken ze je lokale kopie compleet.',
      archiveTitle: 'Langetermijnarchief',
      archiveBody:
        'Aan: een geslaagde synchronisatie snoeit de historie niet meer volgens de bewaarperiode. De database groeit door; altijd weer uit te zetten, en uitzetten toont wat de volgende synchronisatie zou snoeien.',
      recommended: 'Aanbevolen',
      archiveAria: 'Langetermijnarchief',
      startLabel: 'Ophalen vanaf',
      startAria: 'Start van het ophalen van historie',
      customDateLabel: 'Startdatum',
      customDateAria: 'Startdatum voor ophalen',
      estimateTitle: 'Geschatte groei',
      estimateRate: (days: number, perDay: string) =>
        `${days} dagen lokale metingen · ca. ${perDay}/dag`,
      unmeasured: (streams: string) =>
        `Te weinig lokale metingen om groei te schatten: ${streams}. Buiten berekening gehouden om giswerk te vermijden.`,
      wouldBeCleanedUp: (requested: number, retention: number) =>
        `Dit haalt ${requested} dagen historie op, maar deze computer bewaart alleen de laatste ${retention} dagen. Opgehaalde gegevens worden na de volgende geslaagde synchronisatie gewist. Zet eerst het langetermijnarchief aan of verleng de bewaartermijn.`,
      backfilling: 'Historie ophalen…',
      continueBackfill: 'Doorgaan met ophalen',
      startBackfill: 'Begin met ophalen',
      autoContinue: 'Tot het einde doorlopen',
      autoContinueHint:
        'Start opeenvolgende rondes automatisch tot alles binnen is. Eerder stoppen kan altijd; opgeslagen data blijft bewaard.',
      stopBackfill: 'Stoppen',
      stopping: 'Stoppen…',
      roundProgress: (done: number, total: number) =>
        `Ophalen: ${done}/${total} maandblokken klaar, stoppen kan altijd.`,
      stoppedByUser: (remaining: number) =>
        `Gestopt met nog ${remaining} maandblokken te gaan. Reeds opgehaalde data blijft bewaard; klik op ‘Doorgaan met ophalen’ om te hervatten.`,
      stalled: (remaining: number) =>
        `Nog ${remaining} maandblokken. Deze ronde heeft er geen opgehaald en is gestopt; waarschijnlijk blijven ze mislukken. Bekijk de foutenlijst hieronder of klik op ‘Mislukte maanden opnieuw proberen’.`,
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
        `Er zijn nog ${remaining} blokken onafgehandeld. Tot die klaar zijn, is deze lokale kopie alleen een kopie van het gesynchroniseerde bereik — geen volledige kopie.`,
      ledgerRange: (from: string, to: string, records: number) =>
        `${from} ~ ${to} · ${records} items`,
      ledgerNothingWritten: 'Nog geen maand geschreven',
      range1y: 'Afgelopen 1 jaar',
      range2y: 'Afgelopen 2 jaar',
      range3y: 'Afgelopen 3 jaar',
      rangeAll: (years: number) => `Alle beschikbare historie (tot ${years} jaar)`,
      rangeCustom: 'Eigen startpunt',
      confirmDisableArchive:
        'Met het langetermijnarchief uit snoeit de volgende geslaagde synchronisatie oudere gegevens volgens de bewaarperiode — onomkeerbaar.\nHeb je net historie opgehaald, maak dan eerst een databasemomentopname.\nUitzetten?',
      archiveEnabled:
        'Langetermijnarchief aan: geslaagde synchronisaties snoeien de historie niet meer.',
      archiveDisabled:
        'Langetermijnarchief uit: de volgende geslaagde synchronisatie snoeit volgens de bewaarperiode.',
      archiveSaveFailed: 'De archiefinstelling kon niet worden opgeslagen',
      pickStartFirst: 'Kies eerst een startpunt voor het ophalen.',
      outOfRetention:
        'Dit ophalen reikt voorbij de lokale bewaarperiode; wat terugkomt wordt bij de volgende geslaagde synchronisatie gesnoeid. Zet eerst het langetermijnarchief aan of vergroot de bewaarperiode.',
      roundDone: (remaining: number) =>
        `Deze ronde is klaar; er blijven ${remaining} maandblokken over. Druk op ‘Doorgaan met ophalen’ om verder te gaan — je kunt stoppen wanneer je wilt.`,
      allChunksDone: 'Elk maandblok in het logboek is afgehandeld.',
      backfillFailed: 'Het ophalen van historie is mislukt',
      confirmResetLedger:
        'Wist alleen het dekkingslogboek; niets dat al lokaal is geschreven wordt verwijderd. Daarna kun je opnieuw ophalen plannen. Doorgaan?',
      ledgerReset: 'Het logboek is gewist. Je kunt een nieuwe ophaalperiode plannen.',
      ledgerResetFailed: 'Het logboek kon niet worden gewist',
      failedTitle: 'Maanden die niet konden worden opgehaald',
      failedIntro:
        'Deze blokken zijn mislukt. De overige maanden zijn niet aangetast en worden zoals gebruikelijk opgehaald.',
      failedRow: (stream: string, month: string) => `${stream} · ${month}`,
      failedAttempts: (attempts: number) =>
        plural(attempts, { one: `${attempts} poging`, other: `${attempts} pogingen` }),
      failedExhausted:
        'De automatische nieuwe pogingen zijn op. Gebruik ‘Mislukte maanden opnieuw proberen’ om het nog eens te proberen',
      retryFailed: 'Mislukte maanden opnieuw proberen',
      retryFailedDone:
        'Mislukte maanden staan weer in de wachtrij — je kunt verder ophalen.',
      retryFailedFailed:
        'De mislukte maanden konden niet opnieuw in de wachtrij worden gezet',
      archiveRowTitle: 'Historie na elke synchronisatie niet meer snoeien',
      backfillTitle: 'Eerdere historie ophalen',
      autoContinueTitle: 'Na een ronde automatisch de volgende starten',
      estimateDetails: 'Uitsplitsing per stroom',
      statPersisted: 'Geschreven',
      statEmpty: 'Leeg in de cloud',
      statPending: 'Te doen',
      statFailed: 'Mislukt',
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
        'Inzichten zijn nu alleen beschikbaar voor hardlopen (geverifieerd met echte data). Andere trainingstypen kun je gewoon bekijken, corrigeren en exporteren.',
      handoff: 'Onderzoek met AI',
      currentRun: 'Deze run',
      baselineRun: 'Basislijn',
      reading: 'Lokale gegevens worden gelezen…',
      comparedTo: (count: number) =>
        `Tegenover je eigen ${count} meest recente runs van vergelijkbare afstand:`,
      noComparison:
        'Nog onvoldoende vergelijkbare historie; deze run toont absolute cijfers zonder vergelijking.',
      driftTitle: 'Eerste helft tegenover tweede',
      driftSub:
        'Splitst de training in twee helften van gelijke tijd en vergelijkt hoeveel slagen dezelfde snelheid in elke helft kostte.',
      driftFirst: 'Eerste helft',
      driftSecond: 'Tweede helft',
      driftPerBeat: (metres: string) => `${metres} m/slag`,
      driftHrSpeed: (hr: number, pace: string) => `${hr} bpm · ${pace}`,
      driftDelta: (percent: string) => `${percent}%`,
      driftRising:
        'Dezelfde snelheid vasthouden kostte in de tweede helft meer slagen.',
      driftFlat: 'De twee helften zijn vrijwel gelijk.',
      driftFalling: 'Elke slag droeg je in de tweede helft verder.',
      driftNote:
        'Vergelijkt alleen de eerste en tweede helft van deze training, nooit met anderen. Stoplichten, heuvels, intervallen en GPS-drift verstoren dit; bij onregelmatig tempo komt er geen getal.',
      driftUnavailable: (code: string) => ({ too_short: "Te kort: in de eerste tien minuten stijgt de hartslag nog; een vergelijking meet de warming-up, geen drift.", pace_too_variable: "Het tempo varieerde te sterk (intervallen, stoplichten of heuvels); de helften zijn niet vergelijkbaar, dus geen getal.", not_enough_samples: "Te weinig meetpunten voor hartslag en snelheid om de helften te vergelijken.", unsupported_workout_type: "Voorlopig alleen hardlopen. Wandelen en fietsen hebben genoeg meetpunten, maar hun drempels zijn nog niet met echte gegevens geverifieerd." } as Record<string, string | undefined>)[code] ?? "De helften van deze training zijn niet vergelijkbaar.",
      baselineSummary: 'Waar de basislijn vandaan komt',
      baselineRule: (days: number, tolerance: number | null | undefined, min: number, max: number) =>
        `De regel: runs van hetzelfde type uit de laatste ${days} dagen waarvan de afstand binnen ±${tolerance ?? '—'}% van deze ligt, minstens ${min} en hoogstens ${max} ervan.`,
      excludedPrefix: 'Uitgesloten: ',
      excludedItem: (label: string, count: number) => `${label} ×${count} `,
      footnote:
        'Vergelijkingen zijn uitsluitend gebaseerd op je eigen historie, nooit op algemene populatiecijfers, en zijn geen medisch advies. Ontbrekende data toont ‘Niet verstrekt’ in plaats van een 0-waarde.',
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
        'Slechts 1 dag met gegevens in deze periode — geen trend te tekenen.',
      defaultEmpty: 'De trend verschijnt hier na een synchronisatie.',
      average: 'Gem.',
      minimum: 'Min',
      maximum: 'Max',
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
      desktopOnly: 'Het weekrapport open je met de ZeppBridge desktop-app.',
      nothingComparable:
        'Nog geen vergelijkbare gegevens voor deze week; synchroniseer opnieuw.',
      loadFailed: 'Het lokale weekrapport kon niet worden opgebouwd',
      barThisWeek: 'Deze week',
      barBaseline: 'Afgelopen 28 dagen',
      noBaseline:
        'Onvoldoende eerdere gegevens, toont alleen het huidige cijfer.',
      baselineCountUnknown:
        'Onbekende basislijndagen, toont alleen het huidige cijfer zonder vergelijking.',
      thinBaseline: (days: number, found: number, needed: number) =>
        `Slechts ${found} van de afgelopen ${days} dagen hebben deze metriek (minimaal ${needed} vereist); toont alleen het huidige cijfer.`,
      noRecentData:
        'Geen lokale gegevens voor deze metriek in de afgelopen 7 dagen.',
      zeroBaseline:
        'De basislijn is gemiddeld 0 — geen relatieve verandering te berekenen; alleen het huidige cijfer.',
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
      legendNeutral: '↑↓ = alleen een verandering, geen oordeel',
    },
    'components/WheelDatePicker': {
      day: 'Dag',
      daySuffix: '' as string,
      month: 'Maand',
      year: 'Jaar',
      yearSuffix: '' as string,
    },
    'components/overview/DataReadyCapsule': {
      cta: 'Naar de AI',
      dismiss: 'Niet nu',
      readyFresh: (clock: string) => `Al bijgewerkt · tot ${clock}`,
      readyNew: (records: string, clock: string) =>
        `${records} nieuwe items · tot ${clock}`,
      readyPartial: (streams: string, clock: string) =>
        `${streams} niet binnengekomen, de rest is bijgewerkt · tot ${clock}`,
      readyTitle: 'Je gegevens staan klaar',
      step: (current: number, total: number) => `${current}/${total}`,
      streamSeparator: ', ',
      waitingEyebrow: 'Gegevens worden uit de cloud opgehaald',
      waitingHint: 'Je krijgt hier een seintje; kijk ondertussen gerust rond.',
    },
    'components/overview/HeartRateCard': {
      hrPanelAria: 'Open het hartslagdetail voor de volle 24 uur',
      hrTitle: 'Recente hartslag',
      hrWindow: (hours: number) => `Afgelopen ${hours} uur`,
      latest: 'Laatste',
      bpm: 'bpm',
      cloudLag:
        'Gegevens van het horloge moeten eerst via de Zepp-app naar de cloud voordat ZeppBridge ze kan ophalen — het ophaalmoment is niet het moment van de gegevens.',
      hrStale: (hours: number, when: string) =>
        `Nog geen hartslag in de cloud in de afgelopen ${hours} uur; de nieuwste meting is van ${when}.`,
      latestAt: (when: string) => `Nieuwste meting · ${when}`,
      hrChartAria: 'Hartslagcurve over 24 uur',
      hrZonesAria: 'Hartslagzones (absolute grenzen)',
      hrEmpty: 'Echte hartslagbeweging verschijnt hier na een synchronisatie.',
      hrMore: 'Volle 24 uur',
      zoneRest: 'Rust 0–99',
      zoneFat: 'Vetverbranding 100–139',
      zoneAerobic: 'Aeroob 140–169',
      zoneAnaerobic: 'Anaeroob 170+',
    },
    'components/overview/RecentCard': {
      recentAria: 'Recente activiteiten',
      recentTitle: 'Recente activiteiten',
      recentSub: 'Slaap, hardlopen en krachttraining',
      newest: 'Nieuwste',
      seeAll: 'Alles zien',
      recentEmpty:
        'Nog niets vastgelegd. Synchroniseer een keer om gegevens te tonen.',
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
      sleepTitleOn: (day: string) => `Slaap · ${day}`,
    },
    'components/overview/PinnedMetrics': {
      title: 'Mijn metrieken',
      edit: 'Aanpassen',
      emptyCta: 'Zet de 3–4 metrieken vast die jij het belangrijkst vindt',
      emptySub: 'Rusthartslag, HRV, gewicht… meteen zichtbaar bij elke start',
      today: 'Vandaag',
      yesterday: 'Gisteren',
      measuredOn: (date: string) => `Gemeten op ${date}`,
      tileAria: (label: string, value: string) => `${label} ${value}, details openen`,
      sleepScore: 'Slaapscore',
      unitBpm: 'bpm',
      unitScore: 'pt',
      unitSteps: 'stappen',
      unitKcal: 'kcal',
      unitMin: 'min',
      pickerTitle: 'Welke metrieken vastzetten',
      pickerHint:
        'Maximaal 4 stuks, bovenaan het overzicht in de volgorde waarin je ze kiest',
      pickerFull: 'Het zijn er al 4 — haal er eerst een weg om te wisselen',
      pickerCount: (count: number, max: number) => `${count}/${max} gekozen`,
      slotEmpty: 'Vrij',
      groupRecovery: 'Slaap en herstel',
      groupActivity: 'Activiteit en training',
      groupBody: 'Lichaam',
      remove: (label: string) => `${label} weghalen`,
      clear: 'Alles wissen',
      done: 'Klaar',
      close: 'Sluiten',
    },
    'components/overview/SourcesStrip': {
      dataSources: 'Gegevensbronnen',
      identifyingDevices: 'Je apparaten worden herkend…',
      identifyFailed: (reason: string) =>
        `Apparaatherkenning is niet beschikbaar: ${reason}`,
      noDevicesYet: 'Nog geen apparaat herkend',
      manage: 'Beheren',
      sourcesAria: 'Gegevensbronnen en accountstatus',
      latestData: (when: string) => `Nieuwste gegevens ${when}`,
    },
    'components/overview/StepsCard': {
      stepsPanelAria: 'Detail van dagelijkse activiteit openen',
      stepsTitle: 'Stappen van vandaag',
      stepsGoalReference: 'Referentiedoel',
      stepsGoalToday: 'Doel van vandaag',
      stepsUnit: 'stappen',
      stepsGoalLine: (goal: string, percent: number) => `Doel ${goal} · ${percent}%`,
      stepsLatest: (when: string) =>
        `De nieuwste gegevens in de cloud zijn van ${when}`,
      stepsNotYet: 'De stappen van vandaag hebben de cloud nog niet bereikt',
      seeMore: 'Meer zien',
      factGoal: 'Doel',
      factDone: 'Gedaan',
      factLeft: 'Resterend',
      factReached: 'Gehaald',
    },
    'components/shell/AppTopBar': {
      today: 'Vandaag',
      readyPill: 'Gegevens klaar · naar de AI',
      readyTitle:
        'Synchronisatie voltooid en je lokale gegevens zijn bijgewerkt. Klik om ze naar de AI te sturen.',
      mainNav: 'Hoofdnavigatie',
      brandHome: 'ZeppBridge 3 · Overzicht',
      connectionTitle: 'Status van de cloudverbinding',
      lastSyncPrefix: 'Laatste sync: ',
      notFetchedYet: 'Nog niet opgehaald',
      timeUnknown: 'Tijd onbekend',
      syncNow: 'Nu synchroniseren',
      verifyFirst: 'Controleer eerst de verbinding',
      syncing: 'Synchroniseren…',
      syncFailed: 'Synchronisatie mislukt',
      syncPartial: 'Deels gesynchroniseerd',
      cancel: 'Annuleren',
      themeTitle: 'Thema wisselen',
      themeLight: 'Licht',
      themeDark: 'Donker',
      themeSystem: 'Systeem',
      localeLabel: 'Interfacetaal',
      connectPill: 'Account koppelen',
    },
    'composables/useAiHandoff': {
      clipboardUnsupported: 'Deze omgeving kan niet naar het klembord schrijven',
      targetNotAllowed: 'Dat AI-adres staat niet in de toelatingslijst',
      handoffFailed: 'De AI-overdracht is niet gelukt',
      copiedButCannotOpen: (label: string) =>
        `Gekopieerd, maar ${label} opent niet`,
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
      stateCached: 'Lokale cache',
      stateUnknown: 'Niet herkend',
      notFetchedYet: 'Nog niet opgehaald',
      timeUnknown: 'Tijd onbekend',
      unidentifiedDevice: 'Niet-herkend apparaat',
      notProvided: 'Niet verstrekt',
      identifyUnavailable: 'Apparaatherkenning nu niet beschikbaar',
      cacheUnavailable: 'Apparaatcache nu niet beschikbaar',
      noLocalIdentifier:
        'Dit apparaat heeft geen bruikbare lokale identificatie — de aanwijzing kan niet worden opgeslagen.',
      assignmentCleared: 'Modelaanwijzing ingetrokken; terug naar automatische herkenning.',
      assignmentSaved:
        'Je keuze is opgeslagen. Hij verschijnt als ‘Door jou gekozen model’ — nooit als automatische match voorgedaan.',
      assignmentContributed: (reportId: string) =>
        `Modelaanwijzing opgeslagen; de modelnummers gingen naar ZeppBridge (${reportId}). De volgende catalogus herkent dit model vanzelf.`,
      assignmentContributionFailed: (reason: string) =>
        `Modelaanwijzing opgeslagen (alleen lokaal). De catalogusbijdrage is niet verstuurd: ${reason}`,
      networkUnavailable: 'Netwerk niet beschikbaar',
      assignmentFailed: 'De modelkeuze kon niet worden opgeslagen',
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
      failed: 'Synchroniseren mislukt — controleer de verbinding en probeer opnieuw',
      lastCloudSync: (clock: string) => `Laatste cloudsynchronisatie ${clock}`,
      cloudSyncClock: (clock: string) => `Cloudsync ${clock}`,
      cloudSyncClockUnknown: 'Cloudsync —',
      statusUnavailable: 'Verbindingsstatus nu niet beschikbaar',
      alreadySyncing:
        'Er loopt al een synchronisatie — probeer het later opnieuw',
      desktopOnly: 'Vereist de desktop-app',
      reauthNeeded: 'Sessie verlopen, koppel opnieuw met Zepp',
      verifyFirst: 'Controleer eerst de verbinding',
      connectFirst: 'Verbind eerst Zepp',
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
    'lib/aiTask/brief': {
      defaultPlan:
        'Geen specifieke vraag opgegeven. Analyseer volgens deze vaste opzet:',
      fileAttachments: (n: number) =>
        `- attachments/ bevat ${n} originele bestanden die ik zelf toevoegde (bijv. medische rapporten, screenshots); neem ze ook mee.`,
      fileData: (file: string, labels: string) =>
        `- ${file}: alle gegevens. ‘context’ bevat metrieken, slaap en trainingen (${labels}) per dag; ‘coverage’ toont datums met echte data; ‘units’ vermeldt eenheden; ‘task.personal_note’ is mijn toelichting.`,
      fileNote:
        '- Mijn situatie staat in de persoonlijke achtergrond; gebruik die in je beoordeling.',
      fileWorkouts: (n: number) =>
        `- ‘workouts’ bevat de ${n} training(en) die ik bewust heb uitgekozen — die zijn de focus.`,
      followQuestion:
        'Richt je op de gekozen focus en mijn onderstaande vraag.',
      heading: '[Taak]',
      intro: (range: string) =>
        `In de bijlage staan mijn persoonlijke gezondheidsgegevens, geëxporteerd uit mijn Zepp-horloge (${range}, door ZeppBridge lokaal samengesteld — alleen mijn eigen gegevens).`,
      range: (start: string, end: string) =>
        (start === end ? start : `${start} tot ${end}`),
      rangeUnknown: 'een recente periode',
      rules:
        'Antwoordstijl: eerst conclusie, dan bewijs; citeer concrete datums en waarden; wijs gaten in de gegevens gewoon aan — ontbrekende datums nooit gissen of aanvullen; antwoord in het Nederlands.',
      start: 'Begin direct met de analyse, vraag niet eerst wat ik wil.',
      step1:
        '1. Conclusie in één zin: hoe het me deze periode in het algemeen afging.',
      step2: (labels: string) =>
        `2. Per categorie (${labels}): niveau, trend, en hoe het zich verhoudt tot mijn eerdere normaal.`,
      step3:
        '3. Verbanden tussen categorieën — bijv. of slaap, herstel en trainingsbelasting elkaar beïnvloeden.',
      step4:
        '4. Afwijkingen en opvallende punten: welke datums of metrieken duidelijk van de norm afwijken, met mogelijke oorzaken.',
      step5:
        '5. Uitvoerbaar advies voor de komende 1–2 weken: concreet wat, hoeveel en wanneer.',
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
        'Hieronder de werkelijke dekking en tijdvensters zoals ZeppBridge ze lokaal telde; datums zonder gegevens staan als zodanig gemarkeerd — niet gissen, niet verzinnen.',
      'ui.ai_task.blocked.attachment_missing':
        'Een bijlage-origineel is zoek. Kies het bestand opnieuw of verwijder deze verwijzing.',
      'ui.ai_task.blocked.no_workouts':
        'Nog geen training aan deze taak gekoppeld. Ga terug naar bewerken en kies er minstens één voor het overdragen.',
      'ui.ai_task.blocked.empty':
        'De huidige selectie dekt geen gegevens — pas eerst categorieën of trainingsbereik aan.',
      'ui.ai_task.warn.attachment_changed':
        'De bijlagegrootte wijkt af van bij het toevoegen — bevestig vóór het overdragen dat het nog hetzelfde origineel is.',
      'ui.ai_task.warn.category_missing':
        'Deze categorie heeft geen gegevens in de gekozen periode; de export meldt dat eerlijk als ontbrekend.',
      'ui.ai_task.warn.partial_coverage':
        'Slechts een deel van het venster heeft gegevens. Zie de dekkingstabel hieronder.',
      'ui.ai_task.unknown': 'Niet-herkende statusnotitie',
      'ui.ai_task.attach.no_redaction':
        'De export kopieert het origineel naar de overdrachtsmap op je bureaublad (niet geanonimiseerd). Bevestig dat je het aan de gekozen AI wilt geven.',
      'ui.ai_template.recovery_run.name': 'Herstelrun',
      'ui.ai_template.recovery_run.prompt':
        'Dit was een training in de herstelfase. Beoordeel met de slaap-, herstel- en hartslagcontext van de twee weken ervoor: paste de intensiteit bij mijn herstelniveau? Hoe plan ik de komende 48 uur training?',
      'ui.ai_template.long_run_compare.name': 'Vergelijking lange runs',
      'ui.ai_template.long_run_compare.prompt':
        'Vergelijk deze lange runs: tempo-/hartslagdrift, ervaren inspanning en herstelachtergrond. Welke sessie had de hoogste belastingsefficiëntie? Hoe leg ik de intensiteit van de volgende lange run vast?',
      'ui.ai_template.hr_drift.name': 'Hartslagdrift',
      'ui.ai_template.hr_drift.prompt':
        'Analyseer de hartslagdrift van deze training: hoeveel de hartslag bij gelijk tempo steeg, afgezet tegen twee weken slaap en trainingsbelasting — vermoeidheid, weer of conditieverandering?',
      fallbackIssue: 'Een statusnotitie kon niet worden herkend',
      'ui.ai_template.sleep_review.name': 'Recente slaap',
      'ui.ai_template.sleep_review.prompt':
        'Bekijk mijn slaap van de afgelopen twee weken: duur en hoe regelmatig bedtijd en opstaantijd waren, of het aandeel diepe en REM-slaap veranderde, en hoe hartslag en HRV zich ’s nachts ontwikkelden. Wijs de nachten aan die opvallen en noem waarschijnlijke oorzaken op basis van de trainingen van die dag en mijn notities.',
      'ui.ai_template.recovery_trend.name': 'Hersteltrend',
      'ui.ai_template.recovery_trend.prompt':
        'Wordt mijn herstel de afgelopen vier weken beter of slechter? Kijk naar rusthartslag, HRV, slaap en trainingsbelasting, of die met elkaar kloppen, en scheid echte trends van gewone dagelijkse schommelingen. Zeg duidelijk waar gegevens ontbreken.',
      'ui.ai_template.week_review.name': 'Deze week',
      'ui.ai_template.week_review.prompt':
        'Blik terug op deze week: hoe slaap, herstel, hartslag en activiteit zich verhouden tot normaal, welke veranderingen opvallen en welke gewone schommelingen zijn. Blijf bij de gegevens, geen diagnose, en zeg duidelijk waar gegevens ontbreken.',
    },
    'lib/aiTask/fileName': {
      cat_attachment: 'bestanden',
      cat_body: 'lichaam',
      cat_heart_rate: 'hartslag',
      cat_personal_note: 'notities',
      cat_recovery: 'herstel',
      cat_sleep: 'slaap',
      cat_training: 'training' as string,
      cat_workout: 'trainingen',
      manyCategories: (a: string, _b: string, n: number) =>
        `${a} en nog ${n - 1} meer`,
      noData: 'geen gegevens',
      promptSuffix: 'prompt' as string,
      twoCategories: (a: string, b: string) => `${a} en ${b}`,
    },
    'lib/bridge/errors': {
      desktopOnly: 'Vereist de desktop-app',
      genericFailure: 'Mislukt. Probeer het zo opnieuw',
      timedOut:
        'Verzoek verlopen. Controleer netwerk en Zepp-regio en probeer opnieuw.',
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
      notProvided: 'Niet verstrekt',
    },
    'lib/failedChunkText': {
      noCanonical:
        'Cloudpayload ontvangen, maar geen bruikbare gegevens gevonden',
      noReason: 'Geen reden vastgelegd',
    },
    'lib/format': {
      today: 'Vandaag',
      yesterday: 'Gisteren',
      noUpdates: 'Nog geen updates',
      noRecords: 'Nog geen gegevens',
      timeUnknown: 'Tijd onbekend',
      dateUnknown: 'Datum onbekend',
      durationUnknown: 'Duur onbekend',
      notRecorded: 'Niet vastgelegd',
      duration: (hours: number, minutes: number) =>
        (hours > 0 ? `${hours} uur ${minutes} min` : `${minutes} min`),
    },
    'lib/labels': {
      unknownWithCode: (code: string) => `Niet-herkende training (code ${code})`,
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
        'Nog geen levensgebeurtenissen. Begin bij een verkoudheid, een reis of een trainingswijziging.',
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
      deleteHint: 'Deze notitie verdwijnt uit de lokale database.',
      invalid:
        'Titel en geldige datums vereist; de einddatum kan niet vóór de begindatum liggen.',
      failed: 'Actie mislukt — probeer het nog eens.',
      loading: 'Levensgebeurtenissen laden…',
      retry: 'Opnieuw proberen',
      active: 'Lopend',
      search: 'Levensgebeurtenissen zoeken',
      noMatch: 'Geen passende gebeurtenissen.',
      manage: 'Levensgebeurtenissen beheren',
      related: 'Gerelateerde gebeurtenissen',
      local:
        'Alleen op deze machine opgeslagen, mee in de databaseback-up; bij overdracht aan AI aan te vinken.',
      all: 'Alles',
      showLess: 'Minder tonen',
      showMore: (count: number) => `Nog ${count} tonen`,
      categories: {
        health: 'Gezondheid en herstel',
        travel: 'Reizen',
        routine: 'Routine en levensstijl',
        training: 'Training en wedstrijden',
        other: 'Overig',
      },
    },
    'lib/metricSeries': {
      noRecordsToShow: 'Geen gegevens om te tonen',
      noRecordsInWindow: (days: number) => `Geen gegevens in de afgelopen ${days} dagen`,
      coverage: (days: number, withData: number) =>
        `${withData} van de ${days} dagen hebben gegevens`,
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
        `Ophalen vereist ca. ${needed}, maar er is slechts ${free} vrij. Maak schijfruimte vrij of kies een kortere periode.`,
      diskUnknown:
        'Vrije schijfruimte kon niet worden gelezen. Zorg voor voldoende ruimte voor je historie ophaalt.',
      diskTooSmall:
        'Minder dan 300 MB vrij — historie langer dan 90 dagen kan niet worden opgehaald.',
      builtinGuess: (days: number, add: string, free: string) =>
        `Te weinig lokale metingen, dus ingebouwde groffe schatting: ${days} dagen ≈ ${add}, nog ${free} vrij op deze schijf.`,
      measured: (days: number, add: string, free: string) =>
        `Afgeleid uit de werkelijke groeisnelheid van je lokale gegevens: ${days} dagen ≈ ${add}, nog ${free} vrij op deze schijf.`,
      partial: (days: number, add: string, free: string) =>
        `Alleen uit stromen met genoeg lokale metingen: ${days} dagen ≈ ${add} (de rest telt niet mee — te weinig metingen), nog ${free} vrij op deze schijf.`,
      unknownEstimate: 'De omvang van dit ophalen kan nu niet worden geschat.',
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
      nothingToInstall: 'Geen update om te installeren — controleer opnieuw.',
    },
    'views/Settings': {
      accountLine: (region: string, lastSync: string) =>
        `Regio ${region} · laatste sync ${lastSync}`,
      apiAuthNoteA: 'Elk verzoek moet ',
      apiAuthNoteB:
        ' meedragen, anders krijgt het een 401. Opnieuw genereren maakt het oude token direct ongeldig.',
      apiBindNote:
        'Alleen gebonden aan 127.0.0.1: alleen-lezen, geen cross-origin-toegang voor browsers, en het geeft geen inloggegevens terug. Het stopt zodra je ZeppBridge afsluit.',
      apiCopy: 'Kopiëren',
      apiCopyExample: 'Een voorbeeld met authenticatie kopiëren',
      apiDisabled: 'De lokale API is uit en de poort is vrijgegeven.',
      apiEnabled: 'De lokale API staat aan — geen herstart nodig.',
      apiEnabledNotListening: 'Ingeschakeld maar luistert niet',
      apiExampleCopied:
        'Voorbeeldaanroep met authenticatie gekopieerd (bevat je toegangstoken).',
      apiExampleCopyFailed:
        'Voorbeeld niet gekopieerd — zet de endpoint-URL en Authorization-header zelf bij elkaar.',
      apiHide: 'Verbergen',
      apiListening: 'Luistert',
      apiOff: 'Uit',
      apiRegenerate: 'Opnieuw genereren',
      apiRegenerateConfirm:
        'Na opnieuw genereren is het oude token meteen ongeldig; elk lokaal programma dat ermee is geconfigureerd moet worden bijgewerkt. Doorgaan?',
      apiRegenerateFailed: 'Het toegangstoken kon niet opnieuw worden gegenereerd',
      apiShow: 'Tonen',
      apiToggleAria: 'De lokale REST-API inschakelen',
      apiToggleFailed: 'De lokale API kon niet worden omgeschakeld',
      apiToggleSub: (address: string) =>
        `Werkt direct, geen herstart nodig. Uitschakelen geeft ${address} meteen vrij.`,
      apiToggleTitle: 'De lokale API inschakelen',
      apiTokenCopied: 'Toegangstoken gekopieerd.',
      apiTokenCopyFailed:
        'Schrijven naar het klembord mislukt — druk op ‘Tonen’ en kopieer zelf.',
      apiTokenLabel: 'Toegangstoken',
      apiTokenReadFailed: 'Het toegangstoken van de lokale API kon niet worden gelezen',
      apiTokenRegenerated: 'Nieuw toegangstoken gegenereerd — het oude is ongeldig.',
      authCancelLogin: 'Inloggen annuleren',
      authCleared:
        'Uitgelogd — alles wat al naar deze machine is gesynchroniseerd blijft.',
      authCollapse: 'Inklappen',
      authInUse: 'In gebruik',
      authManualSub: 'Voer appToken, user_id en regio-host in',
      authManualTitle: 'Zelf invoeren',
      authOpening: 'Openen…',
      authRetry: 'Opnieuw proberen te koppelen',
      authUse: 'Gebruiken',
      authWebSub: 'Log in met e-mail of telefoonnummer + wachtwoord; vult stress, bloedzuurstof e.a. aan die de officiële API niet heeft (geen inlog via derden)',
      officialTitle: 'Autorisatie met Zepp-account',
      officialSub: 'Aanbevolen · autoriseer in je browser; inloggen met Google, Xiaomi, Facebook en Apple werkt',
      officialConnect: 'Autoriseren',
      officialWaiting: 'Rond de autorisatie in je browser af; daarna verbindt het vanzelf…',
      officialConnected: 'Geautoriseerd',
      officialReauth: 'Opnieuw autoriseren nodig',
      officialDisconnect: 'Ontkoppelen',
      officialDisconnectConfirm: 'Zepp-autorisatie ontkoppelen? De gezondheidsgegevens op deze computer blijven.',
      officialDisconnected: 'Autorisatie ontkoppeld — je lokale gegevens zijn er nog.',
      officialFailed: 'De Zepp-autorisatie is niet voltooid',
      officialNote: 'Officiële gegevens zijn aangesloten: slaap, hartslag, stappen, trainingen, PAI en gewicht worden gesynchroniseerd; HRV, bloedzuurstof, stress en gereedheid komen via ‘Geavanceerde gegevens’.',
      officialAccountLine: (id: string, since: string) => `Zepp-autorisatie · ${id} · sinds ${since}`,
      officialAccountEmpty: 'Nog niet geautoriseerd met een Zepp-account',
      officialNotConnected: 'Niet geautoriseerd',
      cloudAdvancedTitle: 'Zepp Cloud · geavanceerde gegevens',
      copyAuthLink: 'Autorisatielink kopiëren',
      copyAuthLinkHint: 'Is je browser al bij Zepp ingelogd, dan spring je meteen naar ‘Autorisatie toestaan’. Wil je van account wisselen (bijv. via Google of Xiaomi), plak de link dan in een privévenster.',
      linkCopied: 'Link gekopieerd',
      authWebTitle: 'Geavanceerde gegevensverbinding',
      backupLabel: 'Databasemomentopnamen en herstel',
      buildStamp: (stamp: string) => `Build ${stamp}`,
      cancel: 'Annuleren',
      capabilityCloud: (records: number, unit: string, latest: string) =>
        `${records} ${unit} in de cloud${latest ? ` · t/m ${latest}` : ''}`,
      capabilityEmptyBody: 'Na één synchronisatie licht dit op.',
      capabilityEmptyTitle: 'Nog niet gesynchroniseerd',
      capabilityIntro:
        'Wat ZeppBridge op dit moment uit je account kan lezen. De lijst werkt zichzelf bij tijdens synchroniseren — jij hoeft niets te doen.',
      capabilityLocal: (records: number, unit: string, latest: string) =>
        `${records} ${unit}${latest ? ` · t/m ${latest}` : ''}`,
      capabilityNoRecords: (days: number) => `Niets vastgelegd in de afgelopen ${days} dagen`,
      capabilityNoneProbed: (days: number) => `Geen meting in de afgelopen ${days} dagen`,
      capabilityNotIngested:
        'De cloud bevat gegevens, maar er is nog niets lokaal opgeslagen. Synchroniseer eerst; blijven gegevens uit, dan wijkt het payloadformaat mogelijk af.',
      capabilityFoodHistoryHint: 'Voedingsrecords staan in de cloud, maar zijn nog niet lokaal opgenomen. Zijn ze ouder dan de laatste incrementele synchronisatie, haal dan de historie voor die datums op. Ontbreken ze nog, meld dan het payloadformaat.',
      capabilityNotProbed: 'Nog niet getest',
      capabilityUnsupported: 'Je account of apparaat levert dit niet',
      cleaningUp: 'Opschonen…',
      cleanupConfirm: (days: number) =>
        `Lokale gegevens ouder dan ${days} dagen opschonen? Onomkeerbaar.`,
      cleanupDone: (days: number) => `Gegevens ouder dan ${days} dagen zijn opgeschoond.`,
      cleanupFailed: 'Opschonen van oude gegevens is mislukt',
      cleanupNow: 'Nu opschonen',
      clearAuth: 'Inloggegevens wissen',
      clearAuthConfirm:
        'Uitloggen bij dit account?\n\nAlleen de inloggegevens worden gewist; alles wat al naar deze machine is gesynchroniseerd blijft.\n\nLet op: meerdere accounts worden nog niet ondersteund — inloggen met een ander account schrijft beide accounts in dezelfde lokale database.',
      clearAuthFailed: 'De inloggegevens konden niet worden gewist',
      closeDialog: 'Dialoog sluiten',
      codeCleared: (code: number) => `De eigen naam voor code ${code} is gewist.`,
      codeFootnote:
        'De naam leeft alleen op deze machine, gaat niet terug naar Zepp en wordt niet overschreven door opnieuw parseren. Leeg opslaan wist hem.',
      codeInputAria: (code: number) => `Eigen naam voor code ${code}`,
      codeInputPlaceholder: 'Geef het een naam, bijv. Mijn coresessie',
      codeNumber: (code: number) => `Zepp-code ${code}`,
      codeRecords: (count: number) => `${count} lokale trainingen krijgen deze naam`,
      codeSave: 'Opslaan',
      codeSaveFailed: 'De eigen trainingsnaam kon niet worden opgeslagen',
      codeSaved: (code: number, label: string) => `Code ${code} wordt nu getoond als ‘${label}’.`,
      codeSaving: 'Opslaan…',
      codeShownAs: (label: string) => `Wordt nu getoond als ‘${label}’`,
      codeShownAsUnknown: (code: number) =>
        `Wordt nu getoond als ‘Niet-herkende training (code ${code})’`,
      codeSuggestions: ['Krachttraining', 'Core', 'HIIT', 'Rekken', 'Revalidatie', 'Eigen sessie'],
      codesIntro:
        'Aangepaste Zepp-trainingssjablonen geven soms alleen een nummer zonder naam. In plaats van te gokken, kun je de code zelf eenmalig benoemen. Elke training met die code gebruikt dan jouw benaming, duidelijk aangeduid als eigen invoer.',
      codesUnnamed: (count: number) => `${count} nog zonder naam`,
      compactDone: (count: number, before: string, after: string, saved: string, skipped: string) =>
        `${count} payloads gecomprimeerd, ${before} → ${after}, ${saved} bespaard${skipped}.`,
      compactFailed: 'Comprimeren van de opgeslagen payloads is mislukt',
      compactLabel: 'Opgeslagen payloads comprimeren',
      compactNoteA:
        'Ruwe cloudpayloads zijn het zwaarste deel van deze database. Het is JSON-tekst, meestal comprimeerbaar tot ongeveer een vijfde.',
      compactNoteB:
        ': bij de eerste start van een nieuwe versie comprimeert de achtergrond de bestaande payloads; bovenin staat ‘Bezig met comprimeren’ tot het klaar is. Deze knop draait het alleen handmatig nog eens (bijvoorbeeld na een onderbreking). Voor het vervangen wordt elke payload eerst gedecomprimeerd en byte voor byte vergeleken; wat niet klopt wordt ongemoeid overgeslagen — de ruwe payload is de enige basis voor opnieuw verwerken. Daarna volgt een VACUUM, en pas dan wordt het bestand op schijf echt kleiner.',
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
        `Gegevens staan in de datamap naast het programma; nu worden ${days} dagen bewaard.`,
      days: (days: number) => `${days} dagen`,
      defaultFormatAria: 'Standaard exportformaat',
      defaultFormatLabel: 'Standaard exportformaat',
      deviceErrorPrefix: 'Apparaatherkenning: ',
      deviceFirmware: (firmware: string) => `Firmware ${firmware}`,
      distanceUnitLabel: 'Afstandseenheid',
      fillAllFields: 'Vul alle verplichte velden in',
      formatCsvHint: 'Tabelgegevens',
      formatGpxHint: 'Trainingstracks',
      formatJsonHint: 'Gestructureerde gegevens',
      healthCheckLabel: 'Gegevensgezondheidscontrole',
      healthCheckNote:
        'Tot hoever elke gegevensstroom kwam met ophalen uit de cloud, parsen en lokaal schrijven; welke datums het dekt en waar het vandaan kwam. Normaal niet nodig — kom hier als een synchronisatieresultaat anders is dan verwacht.',
      healthCheckOpen: 'De gegevensgezondheidscontrole openen',
      identifyDevices: 'Apparaten opnieuw herkennen',
      identifying: 'Herkennen…',
      lampOff: (count: number) => `Niet opgehaald ${count}`,
      lampOn: (count: number) => `Opgehaald ${count}`,
      lampPending: (count: number) => `In de cloud, niet lokaal opgeslagen ${count}`,
      localApiLabel: 'Lokale REST-API',
      localApiNote:
        "Voor andere programma's op deze machine — scripts, dashboards, eigen tools — om genormaliseerde trainingsreeksen als JSON te lezen. Niet nodig? Laat het uit.",
      loginCancelFailed: 'Het inloggen kon niet worden geannuleerd',
      loginIncomplete: 'Inloggen is niet afgerond',
      loginWindowFailed: 'Het inlogvenster kon niet worden geopend',
      logout: 'Uitloggen',
      logoutHint:
        'Logt alleen uit bij het account — alles wat al naar deze machine is gesynchroniseerd blijft, en na opnieuw inloggen gaat synchroniseren verder.',
      logoutNoMultiAccount:
        'Meerdere accounts worden nog niet ondersteund: log je daarna met een ander account in, dan belanden beide accounts in dezelfde lokale database.',
      manualAuthDone: 'Handmatig inloggen gelukt; de inloggegevens zijn opgeslagen.',
      manualAuthFailed: 'Handmatig inloggen mislukt',
      manualFormHint:
        'Haal ze uit een mitmproxy/Charles-opname of de devtools van je browser. Drie velden:',
      manualSave: 'Inloggegevens opslaan',
      manualSaving: 'Opslaan…',
      manualTokenPlaceholder: 'Kopiëren uit de apptoken-HTTP-header',
      manualUserIdPlaceholder: 'Halen uit het URL-pad /users/{user_id}/',
      mcpBadge: 'Alleen-lezen · luistert op geen poort',
      mcpConfigCopied:
        'Config gekopieerd. Vervang command door het echte pad naar zeppbridge-mcp op je machine.',
      mcpConfigCopyFailed: 'Kopiëren mislukt — selecteer de config hierboven zelf.',
      mcpConfigPathPlaceholder: '<pad naar zeppbridge-mcp>',
      mcpCopyConfig: 'Alleen het config-fragment kopiëren',
      mcpCopyPrompt: 'Kopieer dit en vraag het je AI',
      mcpPromptCopied:
        'Gekopieerd. Plak het bij je AI — die geeft de configuratiestappen voor jouw machine.',
      mcpPromptCopyFailed: 'Kopiëren mislukt — selecteer de tekst hierboven zelf.',
      mcpSetupPrompt: `Ik gebruik een Windows-desktop-app genaamd ZeppBridge die gegevens van mijn Amazfit- / Zepp-horloge naar een lokale SQLite-database synchroniseert.
Er wordt een MCP-programma meegeleverd (zeppbridge-mcp) dat ik bij jou wil configureren, zodat je mijn trainingen en gezondheidsgegevens direct kunt bevragen in plaats van dat ik telkens exporteer en plak.

Wat ik ervan weet:
- Het MCP-programma komt uit het zeppbridge-tools-archief op de GitHub Releases-pagina van ZeppBridge; na uitpakken zit zeppbridge-mcp erin. Mogelijk heb ik het nog niet gedownload.
- Het is een stdio-MCP-server: leest alleen de lokale database, gebruikt geen netwerk, luistert op geen poort en heeft geen token of API-key nodig.
- De gebruikelijke configvorm: {"mcpServers": {"zeppbridge": {"command": "<volledig pad naar zeppbridge-mcp>", "args": ["--scope", "task"]}}}
- Het biedt vijf alleen-lezen-tools: list_workouts (trainingslijst), get_workout_insight (één training tegenover mijn eigen basislijn), get_metric_series (metriekreeksen per dag), get_sleep_detail (één nacht, stadium voor stadium) en get_data_health (status van ophalen/parsen/schrijven per stroom).

Vertel me:
1. Voor jou specifiek — de tool waarmee ik nu praat — naar welk bestand de config gaat, of met welk commando ik hem toevoeg;
2. Hoe ik een Windows-pad schrijf (moeten backslashes worden ge-escaped);
3. Hoe ik na het configureren controleer dat het werkt.

Heb je iets van me nodig (welke client ik gebruik, waar het bestand staat), vraag het gewoon.`,
      mcpToolDataHealth: 'Status van ophalen/parsen/schrijven per stroom',
      mcpToolListWorkouts: 'Trainingslijst, nieuwste eerst',
      mcpToolMetricSeries: 'Metriekreeksen per dag, elk met zijn eenheid',
      mcpToolSleepDetail: 'Eén nacht slaap, stadium voor stadium',
      mcpToolWorkoutInsight: 'Eén training tegenover je eigen basislijn',
      minutes: (minutes: number) => `${minutes} min`,
      noDevices:
        'Nog geen fysiek apparaat herkend; Zepp-cloud synchroniseert nog steeds als cloudbron.',
      noRecords: 'Nog geen gegevens',
      noSyncDiagnostics: 'Nog geen synchronisatiediagnostiek.',
      notProvided: 'Niet verstrekt',
      nothingToCompact:
        'Niets om te comprimeren — de opgeslagen payloads zijn al gecomprimeerd.',
      openDataFolder: 'De gegevensmap openen',
      openFolderFailed: 'De gegevensmap kon niet worden geopend',
      prefsSaveFailed: 'De instellingen konden niet worden opgeslagen',
      prefsSaved: 'Bewaar- en ophaalinstellingen opgeslagen.',
      prefsSavedNoEstimate:
        'Instellingen opgeslagen — de schijfruimteschatting is nu niet beschikbaar.',
      privacyDbBody:
        'Gezondheidsgegevens staan als gewone SQLite in de datamap naast het programma; de bescherming komt van je Windows- / macOS-account en schijfversleuteling. ZeppBridge biedt geen versleutelde database en doet ook niet alsof.',
      privacyDbTitle: 'De lokale database is niet versleuteld',
      privacyModalLink: 'Lees de lokale privacyprincipes',
      privacyModalOk: 'Begrepen',
      privacyModalTitle: 'Lokale privacyprincipes van ZeppBridge',
      privacyPoint1:
        'alle gezondheids- en trainingstijdreeksen staan alleen in de lokale SQLite-database; parsen en anonimiseren gebeuren volledig op deze machine.',
      privacyPoint1Title: '1. Lokaal eerst: ',
      privacyPoint2:
        'inloggegevens zoals App Token en User ID worden met geen derde gedeeld; een AI-export anonimiseert ze automatisch onomkeerbaar.',
      privacyPoint2Title: '2. Inloggegevens blijven gescheiden: ',
      privacyPoint3:
        'GPS-coördinaten gaan standaard niet naar het AI-klembord — je huis en vaste routes blijven privé.',
      privacyPoint3Title: '3. Locatie onder controle: ',
      privacyPoint4:
        'pas nadat jij ‘Een foutrapport versturen’ indrukt en bevestigt verstuurt het een vaste whitelist van diagnostiek op productniveau. Het verstuurt nooit je account, apparaat-id\'s, trainingsdetails of gezondheidsgegevens, en opent nooit een GitHub-issue voor je.',
      privacyPoint4Title: '4. Foutrapporten zijn jouw keuze: ',
      privacyPoint5:
        'de hele codebase is open, zonder verborgen naar-huis-bel-logica.',
      privacyPoint5Title: '5. Overal open source: ',
      privacyReportBody:
        'Geen GitHub-account of gekopieerde gegevens nodig. Na bevestiging gaan alleen de veldstructuur op productniveau, firmwareversie, modelnummers (gehele getallen — alleen welk model), onbekende trainingscodes en hun aantallen naar de private foutrapportopslag van ZeppBridge; nooit account, tokens, serienummers, apparaat-id\'s, MAC, GPS, gezondheidswaarden, ruwe antwoorden of lokale paden.',
      privacyReportTitle: 'Een apparaat of training niet herkend?',
      privacyTelemetryBody:
        'De app meldt zelf geen gebruiksgedrag. Alleen als jij zelf ‘Een foutrapport versturen’ indrukt, verstuurt het de geanonimiseerde velden die hieronder staan.',
      privacyTelemetryTitle: 'Geen telemetrie, geen gebruiksstatistieken',
      privacyTokenBody:
        'Standaard: Windows Credential Manager / macOS Keychain / Linux-sleutelring. Op macOS en Linux kies je expliciet voor een gewoon-tekst-inlogbestand dat alleen jouw gebruiker kan lezen en schrijven; Linux ondersteunt ook omgevingsvariabelen. auth.json bevat alleen metadata zoals account en regio — tokens belanden nooit in logs, exports of foutrapporten.',
      privacyTokenTitle:
        'Zepp-tokens gebruiken standaard de systeemopslag voor inloggegevens',
      probeEmpty: 'geen gegevens',
      probeFailed: 'verzoek mislukt',
      probeNote:
        '‘Niet opgehaald’ betekent niet dat het apparaat het mist: de endpoints van Zepp geven een leeg antwoord voor stromen die niet bestaan, en alleen een regelrechte weigering wordt gerapporteerd als ‘je apparaat levert dit niet’.',
      probeRecords: (records: number, latest: string) =>
        `${records} items${latest ? `, laatste ${latest}` : ''}`,
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
      refreshNoNewList: 'Geen nieuwe apparatenlijst ontvangen — de lokale cache wordt getoond.',
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
      reportConfirm:
        'Dit verstuurt alleen de app-versie, het type OS, de parserrevisie, hints op productniveau en de veldstructuur van niet-herkende apparaten, firmwareversie, modelnummers (deviceSource / deviceType — alleen gehele getallen, die beschrijven welk model, niet welk exemplaar), onbekende trainingscodes en hun aantallen, de numerieke foutcode van het laatste door de cloud geweigerde verzoek (alleen nummer, welke stroom en wanneer — zonder de tekst die de cloud teruggaf), plus de notitie die je schreef (lokale paden, e-mailadressen en lange identificaties worden automatisch weggestript). Nooit verstuurd: je Zepp-account, tokens, serienummers, apparaat-id\'s, MAC-adressen, GPS, gezondheidswaarden of ruwe antwoorden. Versturen?',
      reportDoneLine: (id: string, at: string) => `Rapport ${id}, verstuurd op ${at}.`,
      reportDoneNote:
        'Verstuurd zijn precies de veldtypen hierboven plus je notitie — verder niets.',
      reportDoneTitle: 'Ontvangen, bedankt',
      reportFailed: 'Het foutrapport kon niet worden verstuurd',
      reportNote: 'Extra toelichting',
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
        `Lokale gegevens opnieuw geparseerd tot ${count} genormaliseerde items. Het cloudsynchronisatietijdstip is ongewijzigd.`,
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
      retry: 'Opnieuw proberen',
      scaleLabel: 'Interface-schaling',
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
      syncIntervalAria: 'Interval voor automatisch synchroniseren',
      syncNow: 'Nu synchroniseren',
      syncing: 'Synchroniseren…',
      timeUnknown: 'Tijd onbekend',
      title: 'Instellingen',
      unidentified: 'Niet herkend',
      unidentifiedInitial: 'N',
      unitDays: 'dagen',
      unitRecords: 'vermeldingen',
      unknownDeviceBodyA: 'Sommige Zepp-accounts geven apparaatgegevens terug met ',
      unknownDeviceBodyB:
        ' — alleen interne nummers, waaruit geen model valt af te leiden. Op ‘Apparaten opnieuw herkennen’ drukken verandert dat nooit. Je kunt hierboven zelf het model aanwijzen: het krijgt het label ‘Door jou gekozen model’ en wordt nooit als automatische match voorgedaan.',
      unknownDeviceNoName: 'helemaal geen productnaamveld',
      unknownDeviceReport:
        'Een foutrapport voegt de nummers van dit apparaat toe aan de ingebouwde catalogus — daarna hoeft niemand het meer handmatig aan te wijzen. Het bevat alleen de vaste whitelist-velden; geen GitHub-account nodig.',
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
      updateModalReleased: (date: string) => ` · verschenen op ${date}`,
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
      updateUnmanagedHint: (version: string) =>
        `Op ${version}. Deze build wordt bijgewerkt via Flatpak of de pakketbeheerder van je distributie: voer flatpak update com.zeppbridge.app uit, of werk het pakket bij.`,
      updateVersion: (version: string) => `Versie ${version}`,
      updateVersionLoading: 'laden',
      verifyAndSync: 'Verifiëren en synchroniseren',
      verifyFailed: 'Verificatie is niet afgerond',
    },
    'views/ActivityDetail': {
      title: 'Dagelijkse activiteit',
      intro:
        'Stappen, afstand, actieve verbranding en actieve minuten per dag. Alleen vergeleken met je eigen eerdere metingen; dagen zonder gegevens blijven leeg, geen 0 erbij gezet.',
      desktopOnly:
        'Deze browserpreview leest geen accountgegevens — open de desktop-app.',
      loadFailed: 'Dagelijkse activiteitsgegevens nu niet beschikbaar',
      retry: 'Opnieuw proberen',
      loadingAria: 'Dagelijkse activiteit laden',
      noneInRange:
        'Geen activiteitsgegevens in deze periode. Synchroniseer eerst of kies een langere periode.',
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
      recentDays: (days: number) => `Laatste ${days} dagen`,
      andMore: (count: number) => `en nog ${count - 1}`,
      stepTarget: 'Wat te analyseren',
      stepAsk: 'Wat te vragen',
      stepExtras: 'Bijlagen en opties',
      targetRecent: (days: number) =>
        `Geen training gekozen · de laatste ${days} dagen`,
      askEmpty: 'Nog geen vraag · alleen een richting kan ook',
      askTemplate: (name: string) => `Richting: ${name}`,
      extrasNone: 'Geen bijlagen · standaardopties',
      extrasFiles: (count: number) =>
        plural(count, { one: `${count} bijlage`, other: `${count} bijlagen` }),
      undoPicked: (name: string) => `‘${name}’ gekozen`,
      undoUnpicked: (name: string) => `‘${name}’ gedeselecteerd`,
      undoAdded: (name: string) => `‘${name}’ toegevoegd`,
      undoRemoved: (name: string) => `‘${name}’ verwijderd`,
      undoKept: (name: string) => `‘${name}’ behouden`,
      undoExcluded: (name: string) => `‘${name}’ uitgesloten`,
      undoDirection: 'Analyserichting gewijzigd',
    },
    'views/BodyStatus': {
      vitalsGroupTitle: 'Herstel en vitale waarden',
      title: 'Lichaamsstatus',
      intro:
        'Lokale trends voor gereedheid, stress, bloedzuurstof, HRV, ademhalingsfrequentie, rusthartslag, lichaamssamenstelling en voeding. Volledig berekend uit gesynchroniseerde gegevens.',
      desktopOnly:
        'Deze browserpreview leest geen accountgegevens — open de desktop-app.',
      loadFailed: 'Lichaamsstatus nu niet beschikbaar',
      retry: 'Opnieuw proberen',
      loadingAria: 'Lichaamsstatus laden',
      noneInRange:
        'Geen lichaamsstatusgegevens in deze periode. Probeer een langere periode of synchroniseer eerst.',
      readinessLabel: 'Gereedheid',
      readinessHint: 'Het horloge weegt slaap, HRV en rusthartslag samen tot één score',
      stressLabel: 'Stress',
      stressHint: 'Daggemiddelde; de gearceerde band is het gemeten bereik van die dag',
      curveCardAria: 'Stress over 24 uur',
      curveTitle: 'Afgelopen 24 uur stress',
      curveSub: 'Het horloge meet elke vijf minuten; individuele metingen in tijdvolgorde',
      curveChartAria: 'Stress over de afgelopen 24 uur',
      curveNoSamples:
        'Geen stressmetingen in de afgelopen 24 uur — geen curve. Zo ziet het eruit als het horloge niet werd gedragen of de heledag-stressmeting uitstaat.',
      curveNote:
        'De banden (ontspannen 1–39, normaal 40–59, gemiddeld 60–79, hoog 80–100) zijn van Zepp, niet van ons. Tijd zonder metingen krijgt geen lijn en geen 0-waarden.',
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
        'Geen wegingen in deze periode — ze verschijnen hier na een synchronisatie.',
      bodyGroupTitle: 'Gewicht en lichaamssamenstelling',
      bodyGroupEmpty:
        'Geen gewichts- of lichaamssamenstellingsgegevens in deze periode. Samenstellingsmetingen vereisen een geschikte weegschaal; handmatige of horlogegewichten bevatten deze niet.',
      intakeGroupTitle: 'Inname',
      intakeGroupEmpty:
        'Geen voedingsgegevens in deze periode. Maaltijden die je in de Zepp-app logt, verschijnen hier na een synchronisatie.',
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
        'Aandelen afgeleid uit dagelijkse grammen met 4/9/4 kcal per gram (eiwit / vet / koolhydraten); geen cloudgetallen, dus een punt of twee verschil met de Zepp-app kan. Ontbreekt één van de drie, dan geen grafiek.',
      gramsPerDay: (grams: number) => `${grams} g per dag gemiddeld`,
    },
    'views/DeviceDetail': {
      notFoundTitle: 'Dit apparaat is hier niet',
      notFoundMessage:
        'Kan uit het account zijn verwijderd, of deze machine heeft het nog niet herkend.',
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
        'De apparaat-id wordt alleen op deze machine gebruikt; de interface toont alleen de laatste vier tekens; hij belandt nooit in een export of foutrapport.',
      assignAria: 'Modelidentificatie',
      assignTitle: 'Klopt dit?',
      assignSub:
        'Als de match niet klopt — stel dat het echt een Balance 2 is en dit zegt iets anders — kun je zelf het juiste model aanwijzen. Je keuze blijft op deze machine, verschijnt als ‘Door jou gekozen model’ in plaats van zich als automatische match voor te doen, en kan op elk moment worden ingetrokken.',
      changeModel: 'Kies een ander',
      pickModel: 'Dat klopt niet, laat me kiezen',
      clearAssignment: 'Keuze intrekken en terug naar automatisch',
      noLocalIdentifier:
        'Dit apparaat heeft geen bruikbare lokale identificatie — de aanwijzing kan niet worden opgeslagen.',
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
      noRecords: 'Nog geen gegevens',
      timeUnknown: 'Tijd onbekend',
      notProvided: 'Niet verstrekt',
      title: 'Gegevensgezondheidscontrole',
      summaryStreams: (ok: number, total: number) =>
        `${ok} / ${total} gegevensstromen gezond`,
      summaryFailed: (n: number) =>
        plural(n, {
          one: `${n} stroom heeft een probleem — hieronder bij ‘Hoe ver elke stroom kwam’ zie je welke stap`,
          other: `${n} stromen hebben een probleem — hieronder bij ‘Hoe ver elke stroom kwam’ zie je welke stap`,
        }),
      summaryPending: (n: number) =>
        plural(n, {
          one: `${n} stroom heeft nog geen gegevens — meestal produceert dit apparaat die gewoon niet`,
          other: `${n} stromen hebben nog geen gegevens — meestal produceert dit apparaat ze gewoon niet`,
        }),
      summaryAllGood:
        'Alles oké: ophalen, parsen en schrijven zijn afgerond',
      intro:
        'Per gegevensstroom: de status van ophalen uit de cloud, parsen en lokaal schrijven; welke datums gedekt zijn en waar het vandaan kwam. Ontbrekend is ontbrekend — nooit een 0 ervoor gezet.',
      rangeAria: 'Dekkingsvenster',
      loadingAria: 'De gegevensgezondheidsstatus wordt gelezen',
      replayInProgress:
        'Lokale payloads worden met de nieuwe parser opnieuw afgespeeld; cloudsynchronisatie wijkt uit en probeert vanzelf opnieuw — geen mislukking.',
      timingsTitle: 'Drie verschillende tijdstippen',
      timingCloud: 'Laatst uit de cloud opgehaald',
      timingCloudNote: 'Nog geen resultaat',
      timingReplay: 'Laatste lokale replay',
      timingReplayNote:
        'Leest lokale payloads opnieuw met de huidige parser. Geen netwerk, en het herschrijft de tijd hierboven niet.',
      timingManual: 'Laatste handmatige herverwerking',
      timingManualNote: 'Die waar je zelf op klikte',
      timingNewest: 'Nieuwste gezondheidsmeting',
      timingNewestNote: 'Wanneer de meting zelf op het horloge plaatsvond',
      dbTitle: 'Lokale database',
      dbSize: 'Bestandsgrootte',
      dbRaw: 'Ruwe payloads',
      dbCanonical: 'Genormaliseerde items',
      dbPending: 'Wachtend op normalisatie',
      dbSchema: 'Schemaversie',
      dbNormalizer: 'Parserrevisie',
      integrityPassed: 'geslaagd',
      integrityFailed: (detail: string) => `mislukt (${detail})`,
      integrityDetailBelow: 'details hieronder',
      integrityLine: (verdict: string, checkedAt: string) =>
        `Integriteitscontrole: ${verdict} · ${checkedAt}`,
      integrityNeverRun:
        'Nog geen integriteitscontrole gedraaid. Hij scant de hele database — duurt even bij een grote — dus hij draait alleen als je erom vraagt.',
      streamsTitle: 'Hoe ver elke stroom kwam',
      streamsNote:
        "Ophalen, parsen en schrijven kunnen elk afzonderlijk falen. Eén rode stip en je weet niet of je moet opnieuw proberen, opnieuw koppelen, of dat dit account zo'n stroom niet heeft.",
      stageFetch: 'Ophalen',
      stageParse: 'Parsen',
      stageWrite: 'Schrijven',
      stageLine: (stage: string, state: string) => `${stage}: ${state}`,
      factRaw: 'Ruwe payloads',
      factCanonical: 'Genormaliseerde items',
      factSources: 'Bronnen',
      factObservedDays: 'Waargenomen dagen',
      days: (count: number) =>
        plural(count, { one: `${count} dag`, other: `${count} dagen` }),
      gapExamples: (dates: string) => `Gaten zijn onder andere: ${dates}`,
      gapMore: ' en meer',
      period: '.',
      latestObserved: (date: string) => `Meest recente ${date}.`,
      noRecordsYet: 'Nog geen metingen',
      sourceSeparator: ', ',
      occasionalTitle: 'Metrieken die maar af en toe opduiken',
      occasionalNote:
        'Metrieken als VO₂max en lactaatdrempel geeft het horloge nu eenmaal niet dagelijks. Hier staan alleen de waargenomen datums en de meest recente — geen dagelijkse gatentelling; normale schaarste rood kleuren zou misleiden.',
      occasionalLine: (records: string, days: number) =>
        `${records} items · waargenomen op ${days} dagen`,
      occasionalLatest: (date: string) => `meest recente ${date}`,
      occasionalNone: 'Niets waargenomen in deze periode',
      actionsTitle: 'Wat je kunt doen',
      actionRunning: 'Bezig…',
      actionRun: 'Uitvoeren',
      confirmDestructive: (label: string, reason: string) =>
        `${label}: ${reason}\nDoorgaan?`,
      actionSynced: 'Gesynchroniseerd — status ververst.',
      actionReplayed: (count: string) =>
        `Lokale payloads opnieuw afgespeeld met de huidige parser (${count} afgeleide items). De cloud-synchronisatietijd is niet herschreven.`,
      actionIntegrityOk: 'De database is door de integriteitscontrole gekomen.',
      actionIntegrityFailed: (detail: string) =>
        `De database is niet door de integriteitscontrole gekomen: ${detail}`,
      actionIntegrityFallback:
        'Back-up de gegevensmap en synchroniseer opnieuw',
      actionFolderOpened: 'Gegevensmap geopend.',
      actionReconnect: 'Koppel het Zepp-account opnieuw via Instellingen.',
      actionFailed: (label: string) => `${label} mislukt`,
      coveragePerEvent:
        'Per gebeurtenis geproduceerd: geen gegevens betekent dat er toen niets gebeurde, niet dat er iets ontbreekt.',
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
          reason: 'Sommige stromen halen niets op doordat de inloggegevens verlopen zijn.',
        },
        reprocess: {
          label: 'Lokale payloads opnieuw afspelen met de huidige parser',
          reason: '' as string,
        },
        sync_retry: {
          label: 'Opnieuw synchroniseren',
          reason: 'De vorige keer haalden sommige stromen niets uit de cloud.',
        },
        sync_first: {
          label: 'De eerste synchronisatie uitvoeren',
          reason: 'Deze machine heeft nog geen geslaagde cloudsynchronisatie uitgevoerd.',
        },
        integrity_check: {
          label: 'Database-integriteit controleren',
          reason: 'Draait een SQLite integrity_check over de hele database — bij een grote duurt dat even.',
        },
        open_data_folder: {
          label: 'De gegevensmap openen',
          reason: 'De lokale database, back-ups en exports staan hier allemaal.',
        },
      },
      reprocessReason: (pending: number) =>
        `${pending} opgeslagen payloads hebben nog geen genormaliseerd item opgeleverd. Een replay raakt geen netwerk en past de cloud-synchronisatietijd niet aan.`,
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
      trendsTitle: 'Rusthartslag- en HRV-trends',
      title: 'Hartslag',
      intro:
        'Hierboven de heledag-curve van de afgelopen 24 uur; 7 dagen / 1 maand / 6 maanden veranderen alleen de dagtrends hieronder. Tijd zonder metingen krijgt geen lijn en geen 0-waarden.',
      desktopOnly:
        'Deze browserpreview leest geen accountgegevens — open de desktop-app.',
      dayFailed: 'De hartslag van de afgelopen 24 uur is niet te lezen.',
      dailyMaxFailed: 'De dagelijkse piekhartslag is niet te lezen.',
      trendsFailed: 'Rusthartslag- en HRV-trends zijn niet te lezen.',
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
        'Geen hartslagmetingen in de afgelopen 24 uur — geen curve.',
      bpmTooltip: (clock: string, value: number) => `${clock} <b>${value}</b> bpm`,
      restingLabel: 'Rusthartslag',
      restingHint: 'Het horloge meldt er één per dag; constanter is beter',
      hrvHint: 'Individuele HRV-metingen, per dag gemiddeld',
      rmssdHint: 'Een andere HRV-maat, niet hetzelfde getal als hierboven',
      dailyMaxTitle: 'Dagelijkse piekhartslag (ruwe metingen op deze machine)',
      dailyMaxSub:
        'De Zepp-app filtert zijn dagelijkse piek; hier niet — dat de twee getallen verschillen is normaal.',
      dailyMaxAria: 'Trend van dagelijkse piekhartslag',
      dailyMaxNone:
        'Geen lokale hartslagmetingen in deze periode — geen piek om mee te vergelijken.',
      dailyMaxSparse: (days: number) =>
        `${days} van deze dagen hebben heel weinig metingen (minder dan 60). Daar is de ‘piek’ alleen de hoogste van die punten, niet de echte piek van de dag — getekend als holle markeringen.`,
      dailyMaxLegendMax: 'Piek',
      dailyMaxLegendAvg: 'Gemiddelde',
      dailyMaxTooltip: (date: string, max: number, avg: number, samples: number) =>
        `${date}<br/>Piek <b>${max}</b> bpm<br/>Gemiddelde ${avg} bpm<br/>${samples} metingen`,
      dailyMaxNote: '' as string,
    },
    'views/Overview': {
      overviewTitle: 'Overzicht',
      unrecognizedSuffix: ' heeft nog geen herkend model',
      unrecognizedCta: 'Hier aanwijzen',
      desktopOnly:
        'Deze browserpreview leest geen accountgegevens — open de desktop-app.',
      deviceErrorPrefix: 'Apparaatherkenning: ',
      loadingAria: 'Het overzicht wordt geladen',
      loadFailedTitle: 'Het gegevensoverzicht kon niet worden gelezen',
      retry: 'Opnieuw proberen',
      healthUnavailable: 'Gezondheidsgegevens nu niet beschikbaar',
      partialUnavailable: 'Sommige gegevensstromen zijn nog niet opgehaald',
      bodyPanelAria: 'Lichaamsstatus openen',
      bodyTitle: 'Lichaamsstatus',
      factRecovery: 'Gereedheid',
      factStress: 'Stress',
      factSpo2: 'Bloedzuurstof',
      bodySparkLabel: 'Gereedheid over de afgelopen 7 dagen',
      bodyThin: 'Te weinig gegevens in de afgelopen 7 dagen voor een trend',
      bodyEmpty:
        'Gereedheid, stress en bloedzuurstof verschijnen hier na een synchronisatie',
      trainingPanelAria: 'Trainingsstatus openen',
      trainingTitle: 'Trainingsstatus',
      factLoad: 'Belasting',
      trainingSparkLabel: 'Trainingsbelasting over de afgelopen 7 dagen',
      trainingThin: 'Te weinig gegevens in de afgelopen 7 dagen voor een trend',
      trainingEmpty:
        'VO₂max en trainingsbelasting verschijnen hier na een synchronisatie',
      loadLow: 'laag',
      loadMedium: 'matig',
      loadHigh: 'hoog',
      loadVeryHigh: 'zeer hoog',
      loadBandReference: (band: string) => `${band} (referentie)`,
    },
    'views/RecentRecords': {
      title: 'Recente activiteiten',
      loadingLabel: 'Recente activiteiten laden',
      loadFailedTitle: 'De recente activiteiten konden niet worden geladen',
      desktopOnly:
        'Deze browserpreview leest geen accountgegevens — open de desktop-app.',
      retry: 'Opnieuw proberen',
      partialUnavailable: 'Deels nu niet beschikbaar',
      filterAll: 'Alles',
      noSleep: 'Nog geen slaapgegevens',
      noWorkouts: 'Niets om hier te tonen.',
      noWorkoutsOfType: 'Niets om te tonen voor dit trainingstype.',
      hiddenIncomplete: (count: number) =>
        plural(count, {
          one: `${count} onvolledig item verborgen`,
          other: `${count} onvolledige items verborgen`,
        }),
      notProvided: 'Niet verstrekt',
      today: 'Vandaag',
      yesterday: 'Gisteren',
      introTimeline:
        'Recent gesynchroniseerde slaap en trainingen op tijdvolgorde — nieuwste bovenaan.',
      filterSleep: (count: number) => `Slaap ${count}`,
      filterWorkouts: (count: number) => `Trainingen ${count}`,
      noRecords: 'In deze periode is nog geen slaap of training vastgelegd.',
      sleepTitle: 'Slaap',
      sleepScore: (score: number) => `Slaapscore ${score}`,
      workoutTypeAria: 'Trainingstype',
      avgHr: (bpm: number) => `Gem. hartslag ${bpm}`,
      showMore: (count: number) => `Nog ${count} tonen`,
    },
    'views/SleepDetail': {
      title: 'Slaapoverzicht',
      loadingDetail: 'Slaapgegevens laden…',
      loadFailedTitle: 'Slaapgegevens konden niet worden gelezen',
      loadFailed: 'Slaapdetail nu niet beschikbaar',
      retry: 'Opnieuw proberen',
      notFoundTitle: 'Geen slaapgegevens gevonden',
      notFoundMessage:
        'Kan zijn opgeschoond, of nog niet naar deze machine gesynchroniseerd.',
      heroAria: 'Slaapduur en -score',
      durationKicker: 'Tijd in slaap',
      heroMeta: (fellAsleep: string, wokeUp: string, inBed: string) =>
        `In slaap ${fellAsleep} · wakker ${wokeUp} · in bed ${inBed}`,
      scoreKicker: 'Slaapscore',
      scoreNote: 'Score van het apparaat — alleen ter weergave.',
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
      providerOfficial: 'Officiële Zepp-autorisatie',
      sourceScope: 'Bereik',
      syncedAt: 'Gesynchroniseerd',
      timezone: 'Tijdzone',
      deviceTitle: 'Apparaat',
      deviceName: 'Naam',
      deviceFirmware: 'Firmware',
      deviceId: 'Apparaat-id',
      footnote:
        'Alleen de stadia die de cloud daadwerkelijk gaf. Ontbrekende REM toont ‘Niet verstrekt’ in plaats van een gok, en niet-verstrekte tijdlijnen blijven leeg.',
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
      title: 'Slaap',
      intro:
        'Slaapgegevens gesynchroniseerd naar deze machine. Zonder tijdlijn wordt alleen de samenvatting getoond.',
      loadFailedTitle: 'De slaapgegevens konden niet worden gelezen',
      loadFailed: 'Slaaplijst nu niet beschikbaar',
      retry: 'Opnieuw proberen',
      emptyTitle: 'Nog geen slaapgegevens',
      emptyMessage:
        'Verschijnt hier na een synchronisatie. Zonder echte stadia wordt niets verzonnen.',
      scoreLabel: 'Score',
      footnote: (count: number, from: string) =>
        plural(count, {
          one: `${count} nacht · sinds ${from}`,
          other: `${count} nachten · sinds ${from}`,
        }),
      shown: (shown: number, total: number) => `${shown} van ${total} getoond`,
      loadMore: 'Meer laden',
      loadingMore: 'Laden…',
    },
    'views/TrainingStatus': {
      title: 'Trainingsstatus',
      intro:
        'VO₂max, lactaatdrempel, trainingsbelasting en hartslagzones. Volledig berekend uit gesynchroniseerde gegevens; geen medisch advies.',
      desktopOnly:
        'Deze browserpreview leest geen accountgegevens — open de desktop-app.',
      loadFailed: 'Trainingsstatus nu niet beschikbaar',
      retry: 'Opnieuw proberen',
      loadingAria: 'Trainingsstatus laden',
      vo2Hint: 'Maximale zuurstofopname, door het horloge geschat na buitenruns',
      vo2Empty:
        'Geen VO₂max-metingen in deze periode; wordt alleen bijgewerkt na een hardloopsessie buiten.',
      loadLabel: 'Trainingsbelasting',
      loadHint: 'Dagelijkse trainingsbelastingscore',
      loadEmpty: 'Geen trainingsbelastingsgegevens in deze periode.',
      paiLabel: 'PAI',
      paiHint: 'Personal Activity Intelligence over een schuivende 7 dagen',
      paiEmpty: 'Geen PAI-gegevens in deze periode.',
      thresholdLabel: 'Lactaatdrempel',
      latestTag: 'Nieuwste',
      thresholdHint: 'Hartslag en tempo; werkt alleen bij na een zware run',
      thresholdHr: 'Drempelhartslag',
      thresholdPace: 'Drempeltempo',
      thresholdChartAria: 'Lactaatdrempelhartslag en -tempo',
      thresholdOnce: (date: string) =>
        `Slechts 1 drempelmeting in deze periode (${date}), dus er is geen trend om te tekenen.`,
      thresholdEmpty: 'Geen lactaatdrempelmetingen in deze periode.',
      thresholdPaceTooltip: (value: string, unit: string) =>
        `Drempeltempo <b>${value}</b> ${unit}`,
      loadUnit: '' as string,
      thresholdHrTooltip: (value: number) => `Drempelhartslag <b>${value}</b> bpm`,
      balanceLabel: 'Balans van trainingsbelasting',
      balanceHint:
        '7-daagse belasting tegenover het 28-daagse weekgemiddelde, d.w.z. de acuut-chronisch-ratio',
      balanceChartAria:
        '7-daagse en 28-daagse trainingsbelasting met de acuut-chronisch-ratio',
      balanceEmpty:
        'Nog te weinig gegevens om de belastingbalans te tonen.',
      balanceNote:
        'Acuut:chronisch = som van 7 dagen belasting ÷ (som van 28 dagen ÷ 4). Dekt het 28-daagse venster minder dan 21 dagen, dan geen ratio en breekt de curve daar — onberekend, geen nul.',
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
      loadFailedTitle: 'Deze training kon niet worden gelezen',
      loadFailed: 'Trainingsdetail nu niet beschikbaar',
      retry: 'Opnieuw proberen',
      notFoundTitle: 'Deze training is hier niet',
      notFoundMessage:
        'Kan zijn opgeschoond, of nog niet naar deze machine gesynchroniseerd.',
      insightFailed: 'Er kon geen inzicht voor deze training worden opgebouwd',
      seriesFailed: 'De reeksen per punt voor deze training konden niet worden gelezen',
      seriesFailedTitle: 'De reeksen per punt konden niet worden geladen',
      exportNeedsSeries:
        'Reeksen per punt ontbreken, waardoor deze training niet kan worden geëxporteerd.',
      aiPrompt: (label: string) => `Je bent een sportanalist. Hieronder staat het complete overzicht van één ${label} van mij, uit de lokale ZeppBridge-database en geanonimiseerd.
Analyseer deze sessie alleen aan de hand van de feiten in dit overzicht: de intensiteit, hoe tempo zich verhoudt tot hartslag, of er een duidelijke vertraging of een afwijkend stuk is, en wat er volgende keer concreet anders moet.

Randvoorwaarden:
- Deze gegevens bevatten geen populatiebasislijn. Vergelijk me niet met ‘gezonde volwassenen’ of met een gemiddelde.
- Waar iets ontbreekt, zeg dat het ontbreekt. Vul het gat nooit met een 0 of een schatting.
- Geen medische diagnose, geen oordeel over ziekterisico, geen behandeladvies.

Antwoord in Markdown.`,
      needDesktop:
        'De AI-overdracht vereist de desktop-app; deze webpreview opent geen externe sites.',
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
      copied: (format: string) => `${format}-gegevens gekopieerd.`,
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
      chartsEmptyTitle: 'Geen per-punt-curves',
      chartsEmptyBody:
        'Voor deze sessie is geen hartslag-, tempo-, hoogte- of cadansreeks gesynchroniseerd.',
      hrZonesAria: 'Hartslagzones',
      eyebrowHrZones: 'Hartslagzones',
      hrZonesTitle: 'Hartslagzones',
      hrZonesNote:
        'De zonegrenzen komen uit jouw instellingen op het horloge en stuurt Zepp met deze training mee; ZeppBridge verdeelt ze niet opnieuw. De trainingsstatuspagina gebruikt een apart zonemodel dat je zelf kiest — dat de getallen niet overeenkomen is normaal.',
      hrZoneBelow: (upper: number) => `Onder ${upper}`,
      hrZoneBetween: (low: number, high: number) => `${low}-${high}`,
      hrZoneShare: (percent: string) => `${percent}%`,
      hrZoneTotal: (duration: string) => `${duration} met hartslag`,
      hrZoneBarAria: 'Aandeel tijd in elke hartslagzone',
      decodedAria: 'Gedecodeerde waarden',
      eyebrowDecoded: 'Gedecodeerd',
      decodedTitle: 'Gedecodeerde waarden',
      decodedNote:
        'De samenvatting is alleen berekend uit geldige metingen in deze training; uitschieters worden genegeerd.',
      exportAria: 'Exporteren en delen',
      exportTitle: 'Exporteren en delen',
      exportSub:
        'Kopieer JSON, CSV of GPX, of kies een map om deze training als FIT op te slaan.',
      exportFormatAria: 'Exportformaat',
      exportGo: (format: string) => `${format}-gegevens kopiëren`,
      saveFit: 'FIT-bestand opslaan',
      savedFit: 'FIT-bestand opgeslagen',
      exportFailed: 'Export mislukt',
      handoffAria: 'Naar de AI',
      handoffTitle: 'Naar de AI',
      handoffSub:
        'Kopieert de geanonimiseerde trainingsgegevens met prompt en opent de gekozen AI. Dagelijkse stromen zoals slaap en stappen blijven erbuiten.',
      handoffTarget: 'Doeltool',
      handoffTargetAria: 'Aan welke AI-tool het wordt doorgegeven',
      preparing: 'Voorbereiden…',
      handWaitSync: 'Draag over aan AI zodra synchroniseren klaar is',
      handTo: (provider: string) => `Openen in ${provider}`,
      provenanceAria: 'Herkomst',
      eyebrowProvenance: 'Herkomst',
      provenanceTitle: 'Herkomst',
      provenanceProvider: 'Aanbieder',
      provenanceScope: 'Bereik',
      provenanceSynced: 'Laatst gesynchroniseerd',
      provenanceRecordId: 'Item-id',
      provenanceDevice: 'Apparaat',
      pageFoot:
        'Gedecodeerd op deze machine. De track is op een lokaal canvas getekend en nooit naar een kaartdienst gestuurd.',
    },
    'components/workout/TypePicker': {
      title: 'Trainingstype wijzigen',
      search: 'Trainingstypen zoeken',
      recent: 'Recent gebruikt',
      all: 'Alle typen',
      noMatch: 'Geen passend type',
      current: 'Huidig',
      close: 'Sluiten',
    },
    'views/WorkoutList': {
      title: 'Trainingen',
      intro: 'Trainingen gesynchroniseerd naar deze machine. Geen track, geen kaart.',
      loadFailedTitle: 'De trainingen konden niet worden gelezen',
      loadFailed: 'Trainingslijst nu niet beschikbaar',
      retry: 'Opnieuw proberen',
      emptyTitle: 'Nog geen trainingen',
      emptyMessage:
        'Na synchronisatie verschijnen hier trainingen met een type, tijdstip en minstens één geldige metriek. Zonder GPS of metingen per punt wordt geen lege grafiek getekend.',
      avgHr: (bpm: number) => `Gem. hartslag ${bpm}`,
      notProvided: 'Niet verstrekt',
      footnote: (count: number) =>
        plural(count, { one: `${count} training getoond`, other: `${count} trainingen getoond` }),
      shown: (loaded: number, total: number) => `${loaded} van ${total} geladen`,
      loadMore: 'Meer laden',
      loadingMore: 'Laden…',
    },
    'components/ai/AiTaskHeader': {
      pageTitle: 'Naar de AI',
      intro:
        'Kies een training, selecteer de gewenste gegevens en vraag wat je wilt weten. Exporteer naar je bureaublad en sleep het bestand in de AI-chat.',
      titleLabel: 'Taaknaam',
      newTask: 'Nieuw',
      saved: 'Opgeslagen',
      days: (n: number) =>
        plural(n, { one: `${n} dag`, other: `${n} dagen` }),
      history: 'Opgeslagen taken',
      historyCount: (count: number) => `Opgeslagen taken (${count})`,
      historyEmpty: 'Nog geen opgeslagen taken',
      rangeLabel: 'Terugkijkperiode',
      rename: 'Klik om te hernoemen',
    },
    'components/ai/CoverageDetails': {
      summary: (bytes: string) => `Dekkingsdetails (pakket ≈ ${bytes})`,
      window: 'Tijdvenster',
      coverage: 'Met gegevens',
      days: (have: number, total: number) => `${have}/${total} dagen`,
      category: 'Categorie',
      units: 'Eenheden',
      sources: 'Bronnen',
    },
    'components/ai/DirectionPanel': {
      title: 'Richting en vraag',
      hint: 'De richting bepaalt het kader, de vraag de focus. Beide gaan mee naar de AI',
      directionLabel: 'Analyserichting (sjabloon)',
      directionHint:
        'Een richting kiezen past ook het aanbevolen gegevensbereik aan — zichtbaar in de graaf, ongedaan te maken.',
      noDirection: 'Geen',
      questionLabel: 'Je vraag',
      questionPlaceholder:
        'Waar wil je dit keer op focussen? Bijvoorbeeld: had de herstelrun van woensdag de juiste intensiteit?',
      noteLabel: 'Persoonlijke achtergrond (optioneel)',
      notePlaceholder: 'Blessures, doelen, recente vorm… gaat mee in de export voor de AI.',
      counter: (used: number, max: number) => `${used}/${max}`,
      example1: 'Hoe heb ik de laatste tijd geslapen, en wat kan ik verbeteren?',
      example2: 'Was de trainingsbelasting van deze week passend voor mij?',
      example3: 'Wordt mijn herstel beter of slechter?',
      examplesLabel: 'Probeer bijvoorbeeld',
      groupDaily: 'Dagelijks',
      groupRun: 'Hardlopen',
      groupOther: 'Meer',
    },
    'components/ai/GraphNodePopover': {
      close: 'Sluiten',
      days: 'Terugkijkdagen',
      daysOption: (days: number) => `${days} dagen`,
      includeDay: 'De trainingsdag meenemen',
      coverage: (have: number, total: number) => `${have}/${total} dagen met gegevens`,
      noData: 'Geen gegevens in deze periode',
      attachments: (count: number) =>
        plural(count, { one: `${count} origineel bestand`, other: `${count} originele bestanden` }),
      expand: 'Metrieken tonen',
      collapse: 'Metrieken verbergen',
      keep: 'Deze metriek behouden',
      drop: 'Deze metriek uitsluiten',
      include: 'Meenemen',
      exclude: 'Niet meenemen',
      noteHint: 'In stap ② rechts schrijven.',
    },
    'components/ai/HandoffPanel': {
      title: 'Naar de AI',
      who: 'Aan wie',
      run: (label: string) => `Naar het bureaublad exporteren en ${label} openen`,
      exportOnly: 'Alleen naar het bureaublad exporteren',
      reveal: 'In Verkenner weergeven',
      lastExport: 'Laatste export · Map openen',
      outputAt: (path: string) => `Bestanden staan in: ${path}`,
      copiedFiles: (count: number) =>
        plural(count, {
          one: `bevat ${count} originele bijlage`,
          other: `bevat ${count} originele bijlagen`,
        }),
      stale:
        'De taak is na het exporteren veranderd; de bestanden op het bureaublad zijn verouderd. Exporteer opnieuw.',
      finalPrompt: 'Definitieve prompt (dit wordt gekopieerd)',
      desktopOnly: 'Verbind de desktop-app om te exporteren',
      go: (label: string) => `Overdragen aan ${label}`,
      goSub: 'Exporteren · prompt kopiëren · site openen',
      goSubSyncing: 'Draag over aan AI zodra synchroniseren klaar is',
      closePanel: 'Sluiten',
      packageSize: (bytes: string) => `Pakket ≈ ${bytes}`,
      issueCount: (count: number) =>
        plural(count, { one: `${count} aandachtspunt`, other: `${count} aandachtspunten` }),
      repeat: (count: number) => `×${count}`,
      readiness: (categories: number, percent: number) =>
        `${categories} gegevenstypen · ${percent}% van de dagen met gegevens`,
      readinessLoading: 'Je gegevens worden geteld…',
      readinessWaiting: 'De nieuwste gegevens zijn nog onderweg',
      readinessWaitingStep: (current: number, total: number) =>
        `Sync ${current}/${total} · dit ververst zodra het binnen is`,
      readinessWaitingSub:
        'Dit ververst vanzelf zodra de synchronisatie binnen is',
      editHint: 'Klik om aan te passen',
      edited: 'Door jou aangepast',
      fixedTail:
        'Dit deel voegt ZeppBridge automatisch toe op basis van de werkelijke dekking:',
      resetPrompt: 'Automatisch gegenereerde tekst herstellen',
    },
    'components/ai/HandoffSteps': {
      prepare: 'Naar het bureaublad exporteren',
      copy: 'De prompt kopiëren',
      open: (label: string) => `${label} openen`,
      idle: 'Niet gestart',
      doing: 'Bezig',
      done: 'Klaar',
      failed: 'Mislukt',
      blocked: 'Geblokkeerd',
      skipped: 'De browserpreview kan geen browser openen',
      retry: 'Opnieuw proberen',
    },
    'components/ai/TaskExtras': {
      advanced: 'Geavanceerde opties',
      detail: 'Detailniveau',
      detailSummary: 'Samenvatting',
      detailStandard: 'Standaard',
      detailDetailed: 'Gedetailleerd (reeksen per punt)',
      preciseGps: 'Nauwkeurige route (GPS-coördinaten)',
      preciseGpsHint:
        'Standaard uit; aan behoudt de geëxporteerde track de ruwe coördinaten.',
      mcp: 'Lokale MCP-tools deze taak laten bevragen',
      mcpHint: 'Voor lokale tools zoals Claude Desktop — ziet alleen wat deze taak dekt.',
      attachTitle: 'Originele bestanden (PDF / afbeeldingen)',
      add: 'Bestanden toevoegen',
      pickerTitle: 'Kies bestanden om met de taak mee te geven',
      filterName: 'PDF en afbeeldingen',
      desktopOnly: 'Bestanden kiezen kan alleen in de desktop-app',
      missing: 'niet gevonden',
      changed: 'gewijzigd sinds toevoegen',
      remove: 'Verwijderen',
      reselect: 'Opnieuw kiezen',
      pickFailed: 'Bijlage toevoegen mislukt',
      skipped: (count: number) =>
        plural(count, {
          one: `${count} bestand overgeslagen — type wordt niet ondersteund`,
          other: `${count} bestanden overgeslagen — type wordt niet ondersteund`,
        }),
    },
    'components/ai/TaskGraph': {
      label: 'Gegevensgraaf van de taak',
      hint: 'Sleep in de cirkel om te gebruiken, eruit om te verwijderen · Klik op een knoop voor opties · Sleep de lege ruimte om te pannen',
      zone: 'Naar de AI',
      fit: 'Inpassen',
      undo: 'Ongedaan maken',
      zoomIn: 'Inzoomen',
      zoomOut: 'Uitzoomen',
      zoomLevel: (percent: number) =>
        `Zoom ${percent}% — klik om alles in beeld te passen`,
      backToAll: 'Alle categorieën',
      dismissHint: 'Begrepen',
    },
    'components/deck/CardDeck': {
      stackLabel: 'Instellingsgroepen',
      close: 'Sluiten en alle instellingen tonen',
      previous: 'Vorige kaart',
      next: 'Volgende kaart',
      goTo: (index: number, total: number) => `Kaart ${index} van ${total}`,
      dragHint: 'Sleep de kaartkop zijwaarts voor de aangrenzende kaart',
      unbox: 'Alles tonen',
      collapse: 'Inklappen',
      listLabel: 'Alle instellingsgroepen',
    },
    'components/deck/DeckCoverflow': {
      label: 'Instellingskaarten — veeg zijwaarts om er een te kiezen',
      previous: 'Vorige kaart',
      next: 'Volgende kaart',
      open: (title: string) => `Open ‘${title}’`,
      position: (index: number, total: number) => `${index} / ${total}`,
    },
    'composables/useAiTaskLibrary': {
      loadFailed: 'De taakgegevens konden niet worden geladen',
    },
    'composables/useAiTaskPreview': {
      previewFailed: 'De preview kon niet worden opgebouwd',
    },
    'lib/aiTask/metrics': {
      resting_hr: 'Rusthartslag',
      readiness: 'Gereedheid',
      physical_readiness: 'Fysieke gereedheid',
      mental_readiness: 'Mentale gereedheid',
      hybrid_charge: 'Hybride Charge',
      physical_charge: 'Fysieke Charge',
      mental_charge: 'Mentale Charge',
      stress: 'Stressniveau',
      respiratory_rate: 'Ademhalingsfrequentie',
      sleep_hrv: 'Slaap-HRV',
      sleep_rhr: 'Rusthartslag tijdens slaap',
      hrv_baseline: 'HRV-basislijn',
      rhr_baseline: 'Rusthartslag-basislijn',
      ahi_baseline: 'AHI-basislijn',
      spo2_odi: 'SpO2-ODI',
      spo2_night_score: 'Nachtelijke SpO2-score',
      spo2_measured_minutes: 'SpO2-meetduur',
      hrv: 'Hartslagvariabiliteit (HRV)',
      hrv_rmssd: 'HRV – RMSSD',
      spo2: 'SpO2',
      heart_rate: 'Hartslag (hele dag)',
      training_load: 'Trainingsbelasting',
      vo2max: 'VO₂-max',
      lactate_threshold_hr: 'Lactaatdrempelhartslag',
      lactate_threshold_pace: 'Lactaatdrempeltempo',
      pai_daily: 'Dagelijkse PAI',
      pai_total: 'Totale PAI',
      steps: 'Stappen',
      active_calories: 'Actieve verbranding',
      active_minutes: 'Actieve minuten',
      weight: 'Gewicht',
      bmi: 'BMI-index',
      height: 'Lengte',
      body_fat_rate: 'Lichaamsvet',
      body_water_rate: 'Lichaamsvocht',
      muscle_mass: 'Spiermassa',
      bone_mass: 'Botmassa',
      protein_rate: 'Eiwit',
      visceral_fat: 'Visceraal vet',
      bmr: 'Basale stofwisseling',
      body_balance_score: 'Lichaamsbalansscore',
      distance_meters: 'Afstand',
      moving_seconds: 'Bewegingstijd',
      calories: 'Calorieën',
      avg_hr: 'Gem. hartslag',
      max_hr: 'Max. hartslag',
      min_hr: 'Min. hartslag',
      total_steps: 'Stappen',
      elevation_gain_m: 'Stijging',
      elevation_loss_m: 'Daling',
      duration_minutes: 'Slaapduur',
      score: 'Slaapscore',
      deep_minutes: 'Diep',
      light_minutes: 'Licht',
      rem_minutes: 'REM-slaap',
      awake_minutes: 'Wakend',
      wake_count: 'Ontwakingen',
      unit_min: 'minuten',
      unit_s: 'seconden',
      unit_score: 'pt',
      unit_count: 'keer',
      unit_kcal: 'kilocalorieën',
      unit_m: 'meter',
      unit_load: 'belasting',
      unit_steps: 'stappen',
    },
    'lib/aiTask/prompt': {
      directionHeading: 'Analyserichting: ',
    },
    'lib/aiTask/title': {
      recentDays: (days: number) => `Laatste ${days} dagen`,
      andMore: (count: number) => ` +${count - 1} meer`,
    },
    'views/settings/deck': {
      pageIntro:
        'Open een kaart om hem aan te passen; sleep daarna de kaartkop zijwaarts om naar de volgende te bladeren.',
      pageIntroDeck:
        'Veeg zijwaarts om een kaart te kiezen en klik op de middelste om hem te openen — of "Alles tonen" om alle kaarten tegelijk te zien.',
      openCard: 'Openen',
      cardAccount: 'Account en apparaten',
      cardData: 'Je gegevens',
      cardDisplay: 'Weergave en taal',
      cardSync: 'Synchronisatie en updates',
      cardArchive: 'Archief en opslag',
      cardAi: 'AI-tools',
      cardPrivacy: 'Privacy en beveiliging',
      cardAdvanced: 'Geavanceerd en onderhoud',
      sumAccount: (state: string, devices: number) =>
        `${state} · ${plural(devices, { one: `${devices} apparaat`, other: `${devices} apparaten` })}`,
      sumAccountOff: 'Nog geen Zepp-account gekoppeld',
      sumData: (available: number, total: number) =>
        `${available} van ${total} gegevensstromen lokaal opgeslagen`,
      sumDataLoading: 'Lezen welke gegevens beschikbaar zijn…',
      sumDisplay: (language: string, unit: string, scale: number) =>
        `${language} · ${unit} · ${scale}%`,
      sumSyncOn: (minutes: number) => `Automatisch synchroniseren · elke ${minutes} min`,
      sumSyncOff: 'Automatisch synchroniseren staat uit',
      sumArchiveOn: 'Langetermijnarchief aan · er wordt niets gesnoeid',
      sumArchiveOff: (days: number) => `De laatste ${days} dagen worden bewaard`,
      sumAi: (format: string) => `Alleen-lezen MCP-toegang · standaardexport ${format}`,
      sumAdvanced: 'Databasemomentopnamen · lokale API · gegevensgezondheid',
      sumPrivacy: 'Je gegevens blijven op deze computer',
      secAccount: 'Zepp-account',
      secDevices: 'Apparaten',
      secCapability: 'Binnengehaalde gegevens',
      secLocalData: 'Je gegevens op deze computer',
      secFormat: 'Taal en notaties',
      secAppearance: 'Uiterlijk',
      secAutoSync: 'Automatisch synchroniseren',
      secUpdate: 'Software-update',
      secRetention: 'Lokale bewaring',
      secExport: 'Standaardexport',
      secCodes: 'Niet-herkende trainingscodes',
      secLogin: 'Inlogmethode',
      secLoginSub: 'Alleen openen als je op een andere manier wilt inloggen',
      secMcp: 'MCP-tools',
      secFeedback: 'Een probleem melden',
      cloudSourceSub: 'Waar de gegevens van dit account vandaan komen',
      deviceFirmware: (firmware: string) => `Firmware ${firmware}`,
      deviceLatest: (time: string) => `Laatste gegevens ${time}`,
      deviceId: (id: string) => `ID ${id}`,
      deviceOpen: 'Model bekijken of wijzigen',
      autoSyncToggle: 'Automatisch synchroniseren',
      syncIntervalLabel: 'Synchronisatie-interval',
      syncNowLabel: 'Nu eenmaal synchroniseren',
      syncNowSub: 'Haalt alleen de laatste paar dagen op',
      exportFormatSub:
        'Vooraf geselecteerd bij export vanuit ‘Naar de AI’ of een training',
      retentionSub:
        'Alleen de meest recente dagen worden bewaard; genegeerd zolang het langetermijnarchief aan staat',
      scaleSub: '100% is de ontwerpmaat; Ctrl + en Ctrl - werken ook',
      themeLabel: 'Thema',
      themeLight: 'Licht',
      themeDark: 'Donker',
      themeSystem: 'Systeem',
      mcpLead:
        'Laat AI-tools die op je computer zijn geïnstalleerd — Claude Code, Codex en dergelijke — je lokale gegevens direct bevragen. Alleen-lezen, offline, geen open poort.',
      mcpToolsLabel: 'Tools die de AI kan gebruiken',
      mcpTools:
        'Na de configuratie kan de AI deze vijf dingen opvragen. Hou de muis erop voor uitleg.',
      mcpPreview: 'Bekijk wat er gekopieerd wordt',
    },
    'views/settings/sections/ExportDefaultsSection': {
      example: 'bijv.',
      exampleTitle: 'Afgelopen 14 dagen',
      nameSub:
        'Elke export krijgt zijn naam via deze regel — aan de bestandsnaam ziet de AI welke periode en welke gegevens erin zitten.',
      nameTitle: 'Bestandsnamen voor de AI-overdracht',
      ruleApp: 'ZeppBridge + datum',
      ruleRange: 'Datumbereik + inhoud',
      ruleTask: 'Taaknaam + tijdstip',
    },
  },
  errors: {
    'err.ai_task.attachment_missing':
      'Een bijlagebestand staat niet meer op zijn oorspronkelijke plek',
    'err.ai_task.invalid': 'Taakinhoud voldoet niet — controleer de invoer',
    'err.ai_task.not_found': 'De analysetaak bestaat niet of is verwijderd',
    'err.ai_task.workout_not_found':
      'De gekozen training bestaat niet op deze machine',
    'err.ai_task.write_failed': 'De overdrachtsbestanden konden niet worden geschreven',
    'err.ai_template.builtin_readonly':
      'Ingebouwde sjablonen zijn alleen-lezen — sla op als eigen sjabloon',
    'err.ai_template.invalid':
      'Sjablooninhoud voldoet niet — controleer de invoer',
    'err.ai_template.not_found': 'Het sjabloon bestaat niet of is verwijderd',
    'err.auth.sync_init_failed':
      'Synchroniseren kon niet worden gestart — controleer de accountregio en probeer opnieuw',
    'err.auth.verify_failed': 'Verificatie mislukt',
    'err.auth.verify_needs_reauth':
      'Verificatie mislukt: de inloggegevens zijn verlopen — sla ze opnieuw op',
    'err.auth.verify_network':
      'Verificatie mislukt: Zepp onbereikbaar — controleer je netwerk en probeer opnieuw',
    'err.backfill.bad_start_date': 'Ongeldige startdatum voor ophalen — gebruik JJJJ-MM-DD',
    'err.backfill.no_canonical_records':
      'Cloudpayload ontvangen, maar geen bruikbare gegevens gevonden',
    'err.backfill.partial_window':
      'Van dit blok is maar een deel geschreven — nogmaals proberen nodig',
    'err.backfill.start_in_future': 'Het startpunt voor ophalen kan niet later dan vandaag liggen',
    'err.backup.restore_busy':
      'Herstel niet uitgevoerd: er loopt een andere schrijfbewerking. De huidige database is ongewijzigd; bij de volgende start opnieuw proberen',
    'err.backup.restore_failed':
      'Herstel niet afgerond — de huidige database is ongewijzigd; bij de volgende start opnieuw proberen',
    'err.capability.needs_reauth': 'Opnieuw aanmelden vereist',
    'err.capability.not_synced': 'Nog niet gesynchroniseerd',
    'err.capability.other': 'Status onbekend',
    'err.capability.unavailable': 'Niet beschikbaar',
    'err.capability.unknown': 'Status onbekend',
    'err.capability.unverified': 'Nog niet geverifieerd',
    'err.core.auth': 'Authenticatiefout',
    'err.core.busy': 'Er loopt een andere schrijfbewerking — wacht tot die klaar is',
    'err.core.cancelled': 'Geannuleerd',
    'err.core.cloud_rejected':
      'Zepp ontving het verzoek maar weigerde het. Komt het vaker voor, koppel het Zepp-account dan opnieuw via Instellingen',
    'err.core.config': 'Er moet eerst iets in de configuratie worden aangepast',
    'err.core.credential_store':
      'De opslag voor inloggegevens is niet toegankelijk. Controleer of hij vergrendeld is, door systeembeleid wordt geblokkeerd, verkeerd is geconfigureerd of dat de bestandsrechten niet kloppen. Weblogin en handmatig ingevoerde tokens gebruiken dezelfde opslag; een andere inlogmethode omzeilt een opslagfout niet. Zijn macOS Keychain of de Linux-sleutelring niet beschikbaar, volg dan de gids voor opslag van inloggegevens in de README: start met ZEPPBRIDGE_CREDENTIAL_STORE=file en log opnieuw in. Daarbij wordt het token in gewone tekst opgeslagen in een bestand dat alleen jouw gebruiker kan lezen en schrijven.',
    'err.core.database': 'Lokale database nu niet beschikbaar',
    'err.core.http_status': 'Zepp gaf een fout terug — probeer het later opnieuw',
    'err.core.invalid_host': 'Onveilig Zepp-regioadres',
    'err.core.io': 'Lezen of schrijven van een lokaal bestand is mislukt',
    'err.core.needs_reauth': 'Sessie verlopen, koppel opnieuw met Zepp',
    'err.core.network':
      'Kan Zepp-regio niet bereiken; controleer je netwerk en probeer het opnieuw',
    'err.core.parse': 'Het antwoord van Zepp kon niet worden gelezen',
    'err.core.retry_exhausted': 'Zepp nu niet beschikbaar — probeer het later opnieuw',
    'err.core.unavailable': 'Dit account of deze regio levert die gegevens niet',
    'err.core.unknown': 'Er is iets misgegaan',
    'err.data_folder.open_failed': 'De gegevensmap kon niet worden geopend',
    'err.data_folder.unsupported_os':
      'De gegevensmap openen wordt alleen op Windows en macOS ondersteund',
    'err.diagnostic.bad_response': 'De rapportdienst gaf iets terug dat we niet konden lezen',
    'err.diagnostic.client_init_failed': 'Er kon geen verbinding voor het rapport worden opgezet',
    'err.diagnostic.empty_report':
      'Kies eerst een probleemtype of schrijf een toelichting — anders bevat dit rapport niets om mee te werken',
    'err.diagnostic.http_error': 'De rapportdienst gaf een fout terug',
    'err.diagnostic.nothing_to_submit':
      'Dit apparaat heeft geen modelnummer dat de catalogus aanvult — nu niets in te sturen',
    'err.diagnostic.rate_limited':
      'Te veel rapporten in korte tijd — probeer het later opnieuw. Al verstuurde blijven bewaard; opnieuw insturen hoeft niet.',
    'err.diagnostic.send_failed':
      'Rapport versturen mislukt — controleer je netwerk en probeer opnieuw',
    'err.export.convert_failed': 'Converteren naar het gevraagde formaat is mislukt',
    'err.export.empty_range': 'Geen gegevens in deze periode om te exporteren',
    'err.export.not_a_directory':
      'FIT-export vereist een map, maar het gekozen pad is een bestand',
    'err.export.path_not_absolute': 'De opslaglocatie moet een absoluut pad zijn',
    'err.export.path_required': 'Kies eerst een opslaglocatie',
    'err.export.write_failed': 'Het exportbestand kon niet worden geschreven',
    'err.handoff.empty_range': 'Geen gegevens in deze periode voor AI-overdracht',
    'err.handoff.encode_failed': 'De geanonimiseerde AI-export kon niet worden gecodeerd',
    'err.handoff.mkdir_failed': 'De map voor de overdracht kon niet worden aangemaakt',
    'err.handoff.prompt_required': 'Vul eerst een prompt in',
    'err.handoff.write_failed': 'De geanonimiseerde AI-gegevens konden niet worden geschreven',
    'err.headless.no_credential_store':
      'Op deze machine is geen systeemopslag voor inloggegevens beschikbaar (GNOME Keyring / KWallet). Headless servers en containers hebben die meestal niet. Stel ZEPPBRIDGE_CREDENTIAL_STORE=file in om het token met rechten 0600 in de gegevensmap te schrijven, of ZEPPBRIDGE_CREDENTIAL_STORE=env samen met ZEPPBRIDGE_APP_TOKEN.',
    'err.headless.schema_upgrade':
      'Deze database is ouder dan de build die hem leest, en een alleen-lezen verbinding kan hem niet bijwerken. Start de desktop-app een keer, of draai zeppbridge-cli reprocess op een headless machine. Beide maken voor het bijwerken een back-up.',
    'err.headless.token_not_in_store':
      'De accountgegevens zijn er, maar de opslag voor inloggegevens heeft er geen token voor. Een database kun je tussen machines kopiëren; een token niet — die blijft in de referentieopslag van de machine waar hij is gemaakt. Meld je opnieuw aan.',
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
      'Zepp weigerde deze inloggegevens — sluit het inlogvenster en log opnieuw in',
    'err.login.credentials_unreadable':
      'Je bent ingelogd, maar de inloggegevens konden niet uit het inlogvenster worden gelezen. Voer in plaats daarvan handmatig een App Token in.',
    'err.login.extracting': 'Inloggegevens gelezen. Je regio wordt bevestigd',
    'err.login.fallback_page': 'De alternatieve inlogpagina wordt geopend',
    'err.login.region_probe_failed':
      'Inloggegevens gelezen, maar de accountregio kon niet worden bevestigd. Log opnieuw in of voer handmatig een App Token in.',
    'err.login.region_retrying':
      'De Zepp-regiodienst is nu niet bereikbaar — er wordt opnieuw geprobeerd. Het inlogvenster blijft open, dus opnieuw inloggen is niet nodig',
    'err.login.region_unreachable':
      'De Zepp-regiodienst is nu onbereikbaar — controleer je netwerk en probeer opnieuw',
    'err.login.state_unavailable': 'De toestand van de app is niet beschikbaar',
    'err.login.sync_init_failed': 'Ingelogd, maar synchroniseren kon niet worden geïnitialiseerd',
    'err.login.third_party_stalled':
      'De login via een derde lijkt vast te lopen. Google-passkeys blijven in een in-app-venster vaak op de verificatiestap hangen. Sluit het inlogvenster en gebruik e-mail + wachtwoord, of voer via Instellingen handmatig een App Token in.',
    'err.official.browser': 'De systeembrowser opende niet — controleer de standaardbrowserinstellingen en probeer opnieuw',
    'err.official.denied': 'Je hebt geen toegang gegeven, dus ZeppBridge heeft niets ontvangen.',
    'err.official.rejected': 'Zepp heeft deze autorisatie niet geaccepteerd — probeer opnieuw',
    'err.official.expired': 'Deze autorisatie is verlopen — klik opnieuw op autoriseren',
    'err.official.timeout': 'Wachten op autorisatie duurde te lang — klik opnieuw op autoriseren',
    'err.official.not_enabled': 'De officiële autorisatiedienst is nog niet actief — probeer het later opnieuw',
    'err.official.store': 'Geautoriseerd, maar het token kon niet in de systeemopslag voor inloggegevens worden bewaard.',
    'err.official.failed': 'De officiële autorisatie is niet afgerond — probeer het later opnieuw',
    'err.login.timeout': 'Inloggen duurde te lang — probeer opnieuw',
    'err.login.verifying': 'Het account wordt geverifieerd',
    'err.login.waiting': 'Rond de Zepp-login af in het pop-upvenster',
    'err.login.window_busy':
      'Het vorige inlogvenster is nog niet dicht — wacht even en probeer opnieuw',
    'err.login.window_failed': 'Het inlogvenster kon niet worden geopend',
    'err.mcp.scope_denied': 'Dat verzoek valt buiten de taken die met MCP zijn gedeeld',
    'err.mcp.scope_no_grants':
      'Nog geen taak is voor MCP opengesteld. Markeer op de takenpagina een taak als ‘open voor MCP’ en probeer opnieuw',
    'err.prefs.retention_out_of_range': 'De bewaartermijn moet tussen 1 en 365 dagen liggen',
    'err.storage.worker_failed': 'De achtergrondtaak voor de database is onderbroken',
    'err.storage.write_busy':
      'Er loopt een andere ZeppBridge-schrijfbewerking — wacht tot die klaar is',
    'err.storage.write_lock_unavailable':
      'Schrijfvergrendeling kon niet worden gemaakt — controleer de rechten op de gegevensmap',
    'err.sync.deferred_busy':
      'Er loopt een andere schrijfbewerking. Deze synchronisatie probeert het vanzelf opnieuw',
    'err.sync.deferred_compaction':
      'Opgeslagen payloads worden gecomprimeerd voor schijfruimte; deze cloudsynchronisatie probeert het later vanzelf opnieuw',
    'err.sync.deferred_replay':
      'Afgeleide gegevens worden opgebouwd uit lokale payloads. Deze synchronisatie probeert het vanzelf opnieuw',
    'err.sync.history_days_out_of_range': 'Dat aantal dagen valt buiten het toegestane bereik',
    'err.sync.not_connected': 'Nog niet met Zepp verbonden — maak eerst de verbinding',
    'err.sync.not_verified':
      'Controleer eerst de verbinding voordat je recente gegevens synchroniseert',
    'err.sync.not_verified_backfill':
      'Controleer eerst de verbinding voordat je historie ophaalt',
    'err.sync.not_verified_probe':
      'Controleer eerst de verbinding voordat je mogelijkheden test',
    'err.update.installed_build_missing':
      'Na de installatie is geen nieuwe geïnstalleerde ZeppBridge-build gevonden',
    'err.update.launch_failed': 'De bijgewerkte geïnstalleerde build kon niet worden gestart',
    'err.update.localappdata_missing': 'Het Windows-LOCALAPPDATA-pad is niet beschikbaar',
    'err.update.portable_windows_only':
      'Migratie van portable naar geïnstalleerd is alleen voor Windows',
    'err.update.unsafe_data_location':
      'Installatie gestopt: niet te bevestigen dat de gegevensmap een update overleeft. Sluit ZeppBridge, kopieer een eventuele data-map in de app-bundel volledig naar de Application Support-map van je gebruiker, corrigeer ZEPPBRIDGE_DATA_DIR en probeer opnieuw. Verwijder de oude gegevens niet.',
    'err.workout.not_found': 'Die training bestaat niet',
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
