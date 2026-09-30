import { defineMessages } from '../i18n';

/* 本地周报的文案：完整周报卡和概览顶上的「这一周」摘要共用（指标名只写一份）。moduleId 不变。 */
export const weeklyReportMessages = defineMessages(
  {
    title: '这一周',
    window: (recentStart: string, recentEnd: string, baseStart: string, baseEnd: string) =>
      `${recentStart} ~ ${recentEnd} · 对比你自己 ${baseStart} ~ ${baseEnd}`,
    legendGood: '绿色 = 对这项指标来说更好',
    legendBad: '红色 = 更差',
    legendNeutral: '↑↓ = 只是变化，不评好坏',
    legendNote: '只和你自己此前 28 天比，不和任何人群基准比',
    desktopOnly: '周报要用 ZeppBridge 桌面应用打开。',
    nothingComparable: '这一周还没有可比较的记录，同步一次后再看。',
    loadFailed: '无法生成本地周报',
    barThisWeek: '本周',
    barBaseline: '此前 28 天',
    noBaseline: '此前的数据不够，这次只报现状',
    baselineCountUnknown: '基线天数未知，这次只报现状不做比较。',
    thinBaseline: (days: number, found: number, needed: number) =>
      `此前 ${days} 天里只有 ${found} 天有这项数据，不足 ${needed} 天，所以只报现状不做比较。`,
    noRecentData: '最近 7 天本机没有这项数据。',
    zeroBaseline: '此前基线均值是 0，算不出相对变化，这次只报现状不做比较。',
    notProvided: '未提供',
    sleepDuration: (hours: number, minutes: number) => `${hours} 小时 ${minutes} 分`,
    regularity: (minutes: number) => `±${minutes} 分`,
    workoutCount: (count: number) => `${count} 次`,
    /** 后端给的单位码（score / load / bpm / ms）按界面语言写出来；返回空串就只显示数字。 */
    unitWord: (unit: string) =>
      ({ score: '分', load: '', bpm: '次/分' } as Record<string, string | undefined>)[unit] ?? unit,
    metric: {
      'weekly.resting_hr': '静息心率',
      'weekly.hrv': 'HRV',
      'weekly.stress': '压力',
      'weekly.sleep_duration': '睡眠时长',
      'weekly.sleep_start_regularity': '入睡时间波动',
      'weekly.workout_count': '训练次数',
      'weekly.training_load': '训练负荷',
    },
  },
  {
    title: 'This week',
    window: (recentStart: string, recentEnd: string, baseStart: string, baseEnd: string) =>
      `${recentStart} ~ ${recentEnd} · against your own ${baseStart} ~ ${baseEnd}`,
    legendGood: 'Green = better for this metric',
    legendBad: 'Red = worse',
    legendNeutral: '↑↓ = just a change, not a verdict',
    legendNote: 'Compared only to your own previous 28 days, never to a population baseline',
    desktopOnly: 'The weekly report needs the ZeppBridge desktop app.',
    nothingComparable: 'Nothing comparable this week yet. Come back after a sync.',
    loadFailed: 'Could not build the local weekly report',
    barThisWeek: 'This week',
    barBaseline: 'Prev. 28 days',
    noBaseline: 'Not enough prior data — current figure only.',
    baselineCountUnknown: 'Baseline days unknown — current figure only, no comparison.',
    thinBaseline: (days: number, found: number, needed: number) =>
      `Only ${found} of the last ${days} days have this data (need ${needed}) — current figure only.`,
    noRecentData: 'No local data for this metric in the last 7 days.',
    zeroBaseline: 'The baseline averaged 0 — no relative change possible, current figure only.',
    notProvided: 'Not provided',
    sleepDuration: (hours: number, minutes: number) => `${hours} hr ${minutes} min`,
    regularity: (minutes: number) => `±${minutes} min`,
    workoutCount: (count: number) => `${count} sessions`,
    unitWord: (unit: string) => unit,
    metric: {
      'weekly.resting_hr': 'Resting HR',
      'weekly.hrv': 'HRV',
      'weekly.stress': 'Stress',
      'weekly.sleep_duration': 'Sleep duration',
      'weekly.sleep_start_regularity': 'Bedtime spread',
      'weekly.workout_count': 'Workouts',
      'weekly.training_load': 'Training load',
    },
  },
  {
    title: 'Esta semana',
    window: (recentStart: string, recentEnd: string, baseStart: string, baseEnd: string) =>
      `${recentStart} ~ ${recentEnd} · frente a tus propios datos de ${baseStart} ~ ${baseEnd}`,
    legendGood: 'Verde = mejor para esta métrica',
    legendBad: 'Rojo = peor',
    legendNeutral: '↑↓ = solo un cambio, sin juicio',
    legendNote: 'Comparado solo con tus propios 28 días anteriores, nunca con un promedio de población',
    desktopOnly: 'El informe semanal se abre en la app de escritorio de ZeppBridge.',
    nothingComparable: 'Nada comparable esta semana aún; míralo después de sincronizar.',
    loadFailed: 'No se pudo generar el informe semanal local',
    barThisWeek: 'Esta semana',
    barBaseline: '28 días previos',
    noBaseline: 'No hay suficiente historial previo, así que solo se muestra el valor actual',
    baselineCountUnknown: 'No se conoce el número de días de la línea base, así que solo se muestra el valor actual sin comparación.',
    thinBaseline: (days: number, found: number, needed: number) =>
      `Solo ${found} de los ${days} días anteriores tienen esta métrica (se necesitan ${needed}), así que se muestra el valor actual sin comparación.`,
    noRecentData: 'No hay registros locales de esta métrica en los últimos 7 días.',
    zeroBaseline:
      'La línea base anterior promedió 0 y no permite un cambio relativo; solo se muestra el valor actual.',
    notProvided: 'No proporcionado',
    sleepDuration: (hours: number, minutes: number) => `${hours} h ${minutes} min`,
    regularity: (minutes: number) => `±${minutes} min`,
    workoutCount: (count: number) => `${count} sesiones`,
    unitWord: (unit: string) =>
      ({ score: 'pts', load: '', bpm: 'lpm' } as Record<string, string | undefined>)[unit] ?? unit,
    metric: {
      'weekly.resting_hr': 'FC en reposo',
      'weekly.hrv': 'VFC',
      'weekly.stress': 'Estrés',
      'weekly.sleep_duration': 'Duración del sueño',
      'weekly.sleep_start_regularity': 'Variación de la hora de dormir',
      'weekly.workout_count': 'Entrenamientos',
      'weekly.training_load': 'Carga de entrenamiento',
    },
  },
  // moduleId：让 src/i18n/locales/<locale>.ts 的语言包能覆盖这个模块。
  'components/WeeklyReportCard',
);
