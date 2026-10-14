import { defineMessages } from '../i18n';

/* HeartRateZonePicker 的文案。单独一个文件，免得三种语言的文案把逻辑挤出视野；moduleId 不变，语言包不用跟着搬家。 */
export const heartRateZonePickerMessages = defineMessages(
  {
    title: '心率区间',
    lead: '按你选的算法和基准，统计运动时的心率分布。',
    setupSummary: '算法与基准',
    intro: '三种算法算出的区间不同，哪种对你有意义只有你知道，所以 ZeppBridge 不预设默认，也不用 220−年龄 这类公式估算。每个基准都标了出处和测量日期。',
    clearChoice: '清除选择',
    desktopOnly: '从 ZeppBridge 桌面应用打开，心率区间要读本机记录。',
    noBases: '本机还没有可用的心率基准。同步一次运动后，这里会出现实测最高心率等基准。',
    modelGroup: '算法',
    modelAria: '心率区间算法',
    pickModelFirst: '先选算法，下面按你选的基准算出区间。',
    pickBasesNext: '再选齐上面的基准，即可算出区间和各区间时长。',
    window: (days: number, total: string) => `近 ${days} 天运动逐秒心率 · 共 ${total}`,
    outside: (below: string, above: string) => `区间外：低于 Z1 ${below} · 高于 Z5 ${above}`,
    formulaNote: (formula: string, bases: string) =>
      `${formula}；边界向下取整，与手表一致。基准：${bases}`,
    missingBases: (list: string) => `本机还没有${list}`,
    basesSeparator: '、',
    zonesUnavailable: '心率区间暂不可用',
    saveFailed: '保存心率区间设置失败',
    zeroMinutes: '0 分',
    durationHours: (hours: number, minutes: number) => `${hours} 小时 ${minutes} 分`,
    durationMinutes: (minutes: number) => `${minutes} 分`,
    kind: {
      max_hr: '最大心率基准',
      resting_hr: '静息心率基准',
      threshold_hr: '乳酸阈值基准',
    },
    /* 算法名、公式、区间名和基准说明都按后端发来的稳定 id 查表。
       后端也带着一份中文，那是给 CLI / MCP 的：它们的输出不跟界面语言走。 */
    model: {
      max_hr: { label: '最大心率区间', formula: '区间下界 = 最大心率 x 百分比' },
      hr_reserve: { label: '储备心率区间', formula: '区间下界 = 静息心率 + (最大心率 - 静息心率) x 百分比' },
      lactate_threshold: { label: '乳酸阈值区间', formula: '区间下界 = 乳酸阈值心率 x 百分比' },
    },
    percentBands: ['热身', '燃脂', '有氧耐力', '无氧耐力', '极限'],
    thresholdBands: ['轻松', '耐力', '节奏', '阈值', '无氧'],
    basis: {
      observed_max: {
        label: '实测最高心率',
        note: '本地记录到的最高心率。没跑到真极限时，区间会整体偏窄。',
      },
      device_max: {
        label: '手表自报最大心率',
        note: '手表在 PAI 报文里自报的最大心率，通常来自 Zepp App 的个人设置。',
      },
      device_resting: {
        label: '手表自报静息心率',
        note: '手表在 PAI 报文里自报的静息心率。',
      },
      lactate_threshold: {
        label: '乳酸阈值心率',
        note: '手表在一次高强度跑步后测出的乳酸阈值心率。',
      },
      computed_resting: {
        label: '本地统计静息心率',
        note: '',
      },
    },
    computedRestingNote: (days: number) => `近 30 天中有数据的 ${days} 天的均值。`,
  },
  {
    title: 'Heart rate zones',
    lead: 'How your workout heart rate spreads across zones, by the model and basis you pick.',
    setupSummary: 'Model and basis',
    intro: 'The three models draw different zones; only you know which matters to you. ZeppBridge sets no default and never estimates from formulas like 220 − age. Every basis below lists its source and measurement date.',
    clearChoice: 'Clear selection',
    desktopOnly: 'Open this in the ZeppBridge desktop app; heart rate zones read local records.',
    noBases: 'No heart rate bases on this machine yet. Sync a workout and measured bases like your highest recorded heart rate appear here.',
    modelGroup: 'Model',
    modelAria: 'Heart rate zone model',
    pickModelFirst: 'Pick a model — zones are computed from the bases you choose.',
    pickBasesNext: 'Pick the remaining bases above to get zones and time in each.',
    window: (days: number, total: string) => `Workout heart rate, second by second, last ${days} days · ${total} total`,
    outside: (below: string, above: string) => `Outside zones: below Z1 ${below} · above Z5 ${above}`,
    formulaNote: (formula: string, bases: string) =>
      `${formula}. Boundaries round down, matching the watch. Bases: ${bases}`,
    missingBases: (list: string) => `Not on this machine yet: ${list}`,
    basesSeparator: ', ',
    zonesUnavailable: 'Heart rate zones unavailable right now',
    saveFailed: 'Could not save heart rate zone settings',
    zeroMinutes: '0 min',
    durationHours: (hours: number, minutes: number) => `${hours} hr ${minutes} min`,
    durationMinutes: (minutes: number) => `${minutes} min`,
    kind: {
      max_hr: 'Max HR basis',
      resting_hr: 'Resting HR basis',
      threshold_hr: 'Threshold HR basis',
    },
    model: {
      max_hr: { label: 'Max heart rate zones', formula: 'Zone floor = max heart rate x percentage' },
      hr_reserve: { label: 'Heart rate reserve zones', formula: 'Zone floor = resting HR + (max HR - resting HR) x percentage' },
      lactate_threshold: { label: 'Lactate threshold zones', formula: 'Zone floor = threshold heart rate x percentage' },
    },
    percentBands: ['Warm-up', 'Fat burn', 'Aerobic', 'Anaerobic', 'Maximum'],
    thresholdBands: ['Easy', 'Endurance', 'Tempo', 'Threshold', 'Anaerobic'],
    basis: {
      observed_max: {
        label: 'Highest recorded heart rate',
        note: 'Highest heart rate recorded locally. Never hit a real limit and the zones come out narrow.',
      },
      device_max: {
        label: 'Max heart rate reported by the watch',
        note: 'What the watch reports in its PAI payload, usually taken from your Zepp app profile.',
      },
      device_resting: {
        label: 'Resting heart rate reported by the watch',
        note: 'What the watch reports in its PAI payload.',
      },
      lactate_threshold: {
        label: 'Lactate threshold heart rate',
        note: 'Measured by the watch after a hard run.',
      },
      computed_resting: {
        label: 'Resting heart rate computed locally',
        note: '',
      },
    },
    computedRestingNote: (days: number) => `Average across the ${days} days with data in the last 30.`,
  },
  {
    title: 'Zonas de frecuencia cardíaca',
    lead: 'Cómo se reparte tu frecuencia cardíaca al entrenar, según el modelo y la base que elijas.',
    setupSummary: 'Modelo y base',
    intro: 'Los tres modelos dibujan zonas distintas y solo tú sabes cuál te sirve; por eso ZeppBridge no elige una por defecto ni estima con fórmulas como 220 menos tu edad. Cada base indica su origen y la fecha en que se midió.',
    clearChoice: 'Borrar selección',
    desktopOnly: 'Ábrelo en la app de escritorio de ZeppBridge: las zonas de frecuencia cardíaca leen registros locales.',
    noBases: 'Aún no hay bases de frecuencia cardíaca en este equipo. Sincroniza un entrenamiento y aparecerán bases medidas, como tu máxima registrada.',
    modelGroup: 'Algoritmo',
    modelAria: 'Modelo de zonas de frecuencia cardíaca',
    pickModelFirst: 'Elige un modelo; abajo se calculan las zonas con las bases que escojas.',
    pickBasesNext: 'Elige las bases que faltan arriba para obtener zonas y tiempo en cada una.',
    window: (days: number, total: string) => `Frecuencia cardíaca segundo a segundo de los entrenamientos en ${days} días · ${total} en total`,
    outside: (below: string, above: string) => `Fuera de las zonas: por debajo de Z1 ${below} · por encima de Z5 ${above}`,
    formulaNote: (formula: string, bases: string) =>
      `${formula}. Los límites se redondean hacia abajo, igual que en el reloj. Bases: ${bases}`,
    missingBases: (list: string) => `Todavía no están en este equipo: ${list}`,
    basesSeparator: ', ',
    zonesUnavailable: 'Zonas de frecuencia cardíaca no disponibles de momento',
    saveFailed: 'No se pudo guardar la configuración de zonas de frecuencia cardíaca',
    zeroMinutes: '0 min',
    durationHours: (hours: number, minutes: number) => `${hours} h ${minutes} min`,
    durationMinutes: (minutes: number) => `${minutes} min`,
    kind: {
      max_hr: 'Base de FC máxima',
      resting_hr: 'Base de FC en reposo',
      threshold_hr: 'Base de FC de umbral',
    },
    model: {
      max_hr: { label: 'Zonas por FC máxima', formula: 'Límite inferior de la zona = FC máxima x porcentaje' },
      hr_reserve: { label: 'Zonas por FC de reserva', formula: 'Límite inferior de la zona = FC en reposo + (FC máxima - FC en reposo) x porcentaje' },
      lactate_threshold: { label: 'Zonas por umbral de lactato', formula: 'Límite inferior de la zona = FC de umbral x porcentaje' },
    },
    percentBands: ['Calentamiento', 'Quema de grasa', 'Aeróbica', 'Anaeróbica', 'Máxima'],
    thresholdBands: ['Suave', 'Resistencia', 'Tempo', 'Umbral', 'Anaeróbica'],
    basis: {
      observed_max: {
        label: 'Frecuencia cardíaca más alta registrada',
        note: 'La más alta registrada localmente. Si nunca llegaste a un límite real, las zonas salen estrechas.',
      },
      device_max: {
        label: 'Frecuencia cardíaca máxima reportada por el reloj',
        note: 'Lo que el reloj reporta en sus datos de PAI, normalmente tomado de tu perfil en la app Zepp.',
      },
      device_resting: {
        label: 'Frecuencia cardíaca en reposo reportada por el reloj',
        note: 'Lo que el reloj reporta en sus datos de PAI.',
      },
      lactate_threshold: {
        label: 'Frecuencia cardíaca de umbral de lactato',
        note: 'Medida por el reloj después de una carrera intensa.',
      },
      computed_resting: {
        label: 'Frecuencia cardíaca en reposo calculada localmente',
        note: '',
      },
    },
    computedRestingNote: (days: number) => `Promedio de los ${days} días con datos de los últimos 30.`,
  },
  'components/HeartRateZonePicker',
);
