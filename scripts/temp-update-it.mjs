import { readFileSync, writeFileSync } from 'node:fs';

const itPath = 'src/i18n/locales/it.ts';
let content = readFileSync(itPath, 'utf8');

const target = '    approxMinutes: (value: number) => `~${value} min`,\r\n  },\r\n  },';

const addition = `    approxMinutes: (value: number) => \`~\${value} min\`,
  },

  'components/journal/body': {
    front: 'Fronte',
    back: 'Retro',
    clear: 'Cancella',
    none: 'Nessuna selezione',
    figure: 'Figura corporea: seleziona le zone',
    sided: (base: string, side: 'l' | 'r', key: string) => {
      const feminine = ['shin', 'knee', 'it_band', 'shoulder', 'ankle'].includes(key);
      return \`\${base} \${side === 'l' ? (feminine ? 'sinistra' : 'sinistro') : (feminine ? 'destra' : 'destro')}\`;
    },
    parts: {
      neck: 'Collo',
      shoulder: 'Spalla',
      upper_back: 'Parte superiore della schiena',
      lower_back: 'Zona lombare',
      chest: 'Petto',
      abdomen: 'Addome',
      hip: 'Flessore dell’anca',
      glute: 'Gluteo',
      quad: 'Quadricipite',
      hamstring: 'Bicipite femorale',
      knee: 'Ginocchio',
      shin: 'Tibia',
      calf: 'Polpaccio',
      achilles: 'Tendine d’Achille',
      ankle: 'Caviglia',
      foot: 'Piede',
      it_band: 'Benderella ileotibiale',
    },
  },

  'components/workout/feel': {
    title: 'Le tue sensazioni',
    eyebrow: 'Solo tu lo sai',
    rpe: 'Sforzo percepito (RPE)',
    rpeEasy: 'Facile',
    rpeHard: 'Faticoso',
    rpeMax: 'Al limite',
    watchRpe: (value: number) => \`L’orologio indicava \${value}\`,
    clear: 'Cancella',
    soreness: 'Zone indolenzite',
    markSore: 'Segna le zone indolenzite',
    fold: 'Comprimi',
    shoe: 'Scarpe usate',
    auto: 'Automatico',
    pick: 'Scegli un paio',
    none: 'Nessun paio registrato',
    how: {
      chosen: 'tua scelta',
      zepp: 'registrate da Zepp',
      default: 'paio predefinito',
      none: 'hai indicato nessun paio registrato',
      unknown: 'non riconosciuto',
    },
    autoNow: (name: string, how: string) => \`Conteggiate per “\${name}” (\${how})\`,
    autoUnknown: 'Attualmente non assegnate ad alcun paio. Imposta un paio predefinito o scegline uno qui.',
    noShoes: 'Ancora nessuna scarpa registrata.',
    register: 'Registra nel diario',
    retired: 'Dismesse',
    saved: 'Salvato',
  },

  'components/journal/journal': {
    title: 'Diario',
    intro: 'La parte che scrivi personalmente: gare, risultati, scarpe, infortuni e periodi. Rimane su questo computer e viaggia insieme alle consegne all’IA.',
    save: 'Salva',
    cancel: 'Annulla',
    remove: 'Elimina',
    edit: 'Modifica',
    add: 'Aggiungi',
    notes: 'Note (facoltativo)',
    removeConfirm: 'Eliminare questa voce?',
    timeHint: 'o:mm:ss, es. 1:45:00',
    badTime: 'Formato del tempo non riconosciuto. Usa 1:45:00 o 45:30.',
    required: 'Nome e data sono obbligatori.',
    km: (value: string) => \`\${value} km\`,
    pace: (value: string) => \`\${value} /km\`,

    nextRace: 'Prossima gara',
    daysLeft: (days: number) => plural(days, { one: 'Manca 1 giorno', other: \`Mancano \${days} giorni\` }),
    raceToday: 'È oggi',
    goal: (time: string) => \`Obiettivo \${time}\`,
    races: 'Gare',
    upcoming: 'Iscritto',
    noRace: 'Ancora nessuna gara registrata. Aggiungine una e il conto alla rovescia apparirà qui; i piani dell’IA la useranno come traguardo.',
    addRace: 'Registra gara',
    editRace: 'Modifica gara',
    medals: 'Muro delle medaglie',
    medalsEmpty: 'Le gare completate compariranno qui non appena inserisci il risultato.',
    awaiting: 'In attesa del risultato',
    fillResult: 'Inserisci risultato',
    candidate: (time: string, km: string) => \`In quel giorno hai registrato \${km} in \${time}. Si tratta di questa gara?\`,
    useCandidate: 'È questa',
    beatGoal: 'Obiettivo raggiunto',
    raceName: 'Nome della gara',
    raceDate: 'Giorno della gara',
    raceSport: 'Disciplina',
    distance: 'Distanza (km)',
    goalTime: 'Tempo obiettivo',
    result: 'Risultato',
    priority: 'Priorità',
    priorities: {
      a: 'Obiettivo principale (A)',
      b: 'Secondaria (B)',
      c: 'Test (C)',
    },
    raceSports: {
      running: 'Strada',
      trail: 'Trail running',
      cycling: 'Ciclismo',
      swimming: 'Nuoto',
      triathlon: 'Triathlon',
      other: 'Altro',
    },
    distances: {
      '5k': '5 km',
      '10k': '10 km',
      half: 'Mezza maratona',
      marathon: 'Maratona',
    },

    records: 'Migliori prestazioni personali',
    recordsHint: (runs: number) => \`Il tratto più veloce tra \${runs} corse sufficientemente lunghe. Le finestre terminano su rilevazioni reali, quindi il tempo può essere calcolato solo in difetto, mai artificialmente più veloce.\`,
    methods: {
      samples: 'Traccia al secondo',
      splits: 'Parziali al chilometro',
      whole: 'Intero allenamento',
      race: 'Risultato ufficiale',
    },
    noRecord: 'Non ancora',
    then: 'Poi',

    shoes: 'Scarpe',
    shoesHint: 'I chilometri vengono assegnati in quest’ordine: il paio scelto per la sessione → le scarpe rilevate da Zepp → il paio predefinito per quello sport. I chilometri non identificati non vengono conteggiati.',
    addShoe: 'Aggiungi un paio',
    editShoe: 'Modifica scarpa',
    noShoe: 'Ancora nessuna scarpa registrata.',
    wear: {
      fresh: 'In ottimo stato',
      near: 'Vicino alla dismissione',
      due: 'Da dismettere',
      retired: 'Dismesse',
    },
    shoeKm: (km: string, retire: string) => \`\${km} / \${retire} km\`,
    runs: (count: number) => plural(count, { one: '1 allenamento', other: \`\${count} allenamenti\` }),
    isDefaultBadge: 'Predefinita',
    unknownGear: 'Scarpe registrate da Zepp non ancora aggiunte',
    unknownGearHint: 'Zepp fornisce solo un ID. Assegna loro un nome affinché le sessioni siano attribuite a quel paio.',
    nameIt: 'Assegna nome',
    used: (from: string, to: string) => \`\${from} – \${to}\`,
    shoeName: 'Nome',
    shoeSport: 'Utilizzo',
    isDefault: 'Predefinita per questo sport',
    shoeSports: {
      running: 'Corsa',
      trail: 'Trail running',
      walking: 'Camminata',
      hiking: 'Escursionismo',
    },
    startKm: 'Già percorsi prima dell’aggiunta (km)',
    retireKm: 'Avviso di dismissione (km)',
    retireHint: 'Consiglio abituale: 600–800 km',
    startedOn: 'Primo utilizzo',
    retired: 'Dismesse',
    retiredOn: 'Data di dismissione',
    zeppGear: 'ID scarpa Zepp',

    injuries: 'Infortuni',
    injuriesHint: 'Dove, da quando a quando e gravità. Nella pianificazione, l’IA visualizza gli infortuni in corso e quelli guariti negli ultimi 90 giorni.',
    addInjury: 'Registra infortunio',
    editInjury: 'Modifica infortunio',
    noInjury: 'Nessun infortunio registrato. Che continui così.',
    stillHurting: 'In corso',
    injuryTitle: 'Cosa è successo',
    bodyPart: 'Zona (seleziona un punto)',
    severity: 'Gravità',
    severities: {
      '1': 'Lieve',
      '2': 'Moderata',
      '3': 'Grave (influisce sugli allenamenti)',
    },
    startDate: 'Inizio',
    endDate: 'Guarigione',
    since: (date: string) => \`dal \${date}\`,

    epochs: 'Periodi',
    epochsHint: 'Dai un nome a un lasso di tempo (preparazione prima maratona, recupero post infortunio): tutti i grafici di tendenza avranno uno sfondo colorato e anche l’IA ne terrà conto.',
    addEpoch: 'Nuovo periodo',
    noEpoch: 'Ancora nessun periodo.',
    dayCount: (days: number) => plural(days, { one: '1 giorno', other: \`\${days} giorni\` }),

    entry: 'Diario',
    entryNoRace: 'Gare, scarpe e infortuni; record personali identificati automaticamente',
    shoeAlert: (name: string) => \`\${name}: da dismettere\`,
    shoeNear: (name: string) => \`\${name}: vicino alla dismissione\`,
  },
  },`.replace(/\n/g, '\r\n');

if (!content.includes(target)) {
  console.error('Target not found!');
  process.exit(1);
}

content = content.replace(target, addition);
writeFileSync(itPath, content, 'utf8');
console.log('it.ts updated successfully.');

const pendingPath = 'src/i18n/locales/it.pending.txt';
const pendingContent = '# 尚未覆盖的键（i18n:check --write-pending 生成；W4 翻译一行删一行）。\r\n# 格式：moduleId.键路径。\r\n';
writeFileSync(pendingPath, pendingContent, 'utf8');
console.log('it.pending.txt updated successfully.');
