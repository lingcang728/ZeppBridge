import { defineMessages, useMessages } from '../../i18n';

/** 首页建议卡（「建议 → 发牌 → 交给 AI」）：后端只给触发码和事实，句子在这里按语言写。 */
const messages = defineMessages(
  {
    aria: '给你的建议',
    workoutEyebrow: '刚练完',
    workoutLine: (what: string, amount: string, count: number) => (count ? `今天的${what} ${amount}，和最近 ${count} 次同类比一比` : `今天的${what} ${amount}，复盘一下`),
    sleepEyebrow: '昨晚睡得差',
    sleepShort: (duration: string, gap: string) => `昨晚睡了 ${duration}，比你近四周的常态少 ${gap}`,
    sleepDeep: (deep: string, gap: string) => `深睡 ${deep}，比你近四周的常态少 ${gap}`,
    idleEyebrow: (days: number) => `${days} 天没动了`,
    idleLine: (date: string, what: string) => `上次是 ${date} 的${what}`,
    tomorrowSub: '带上最近 7 天的恢复和运动',
    sleepReview: '昨晚睡得怎么样',
    sleepReviewSub: '带上最近几晚的睡眠和恢复',
    sleepReviewQuestion: '附上了昨晚和前几晚的睡眠、恢复读数，还有最近几天的运动。请帮我看看昨晚睡得怎么样：和前几晚比有什么不同，可能是什么原因，今天的训练要不要因此调整。',
    dismiss: '关掉这张建议',
    failed: '这会儿发不出牌，稍后再试',
  },
  {
    aria: 'Suggestions for you',
    workoutEyebrow: 'Just finished',
    workoutLine: (what: string, amount: string, count: number) => (count ? `Today's ${what}, ${amount}. Compare it with your last ${count}` : `Today's ${what}, ${amount}. Take a look back`),
    sleepEyebrow: 'Rough night',
    sleepShort: (duration: string, gap: string) => `You slept ${duration}, ${gap} less than your 4-week norm`,
    sleepDeep: (deep: string, gap: string) => `Deep sleep ${deep}, ${gap} below your 4-week norm`,
    idleEyebrow: (days: number) => `${days} days without a workout`,
    idleLine: (date: string, what: string) => `Last one: ${what} on ${date}`,
    tomorrowSub: 'With the last 7 days of recovery and workouts',
    sleepReview: 'How did I sleep last night?',
    sleepReviewSub: 'With the last few nights of sleep and recovery',
    sleepReviewQuestion: 'Attached are last night and the few nights before it (sleep and recovery readings), plus my workouts from the last few days. Tell me how I slept last night: how it differs from the nights before, what might explain it, and whether today\'s training should change because of it.',
    dismiss: 'Dismiss this suggestion',
    failed: 'Could not deal the cards right now. Try again later',
  },
  {
    aria: 'Sugerencias para ti',
    workoutEyebrow: 'Al terminar de entrenar',
    workoutLine: (what: string, amount: string, count: number) => (count
      ? `Entrenamiento de hoy: ${what}, ${amount}. Compáralo con tus últimas ${count} sesiones similares.`
      : `Entrenamiento de hoy: ${what}, ${amount}. Repasa cómo te fue.`),
    sleepEyebrow: 'Anoche dormiste mal',
    sleepShort: (duration: string, gap: string) => `Anoche dormiste ${duration}, ${gap} menos que lo habitual para ti en las últimas 4 semanas.`,
    sleepDeep: (deep: string, gap: string) => `Tu sueño profundo fue de ${deep}, ${gap} menos que lo habitual para ti en las últimas 4 semanas.`,
    idleEyebrow: (days: number) => `Hace ${days} días que no entrenas`,
    idleLine: (date: string, what: string) => `Tu último entrenamiento fue el ${date}: ${what}`,
    tomorrowSub: 'Con los datos de recuperación y entrenamientos de los últimos 7 días',
    sleepReview: '¿Cómo dormí anoche?',
    sleepReviewSub: 'Con el sueño y la recuperación de las últimas noches',
    sleepReviewQuestion: 'Adjunto el sueño y las lecturas de recuperación de anoche y de las noches anteriores, además de mis entrenamientos de los últimos días. Dime cómo dormí anoche: en qué se diferencia de las noches anteriores, qué podría explicarlo y si debería ajustar el entrenamiento de hoy por ello.',
    dismiss: 'Descartar esta sugerencia',
    failed: 'No se pudieron repartir las cartas. Inténtalo de nuevo más tarde.',
  },
  'components/overview/suggest',
);

export const useSuggestText = () => useMessages(messages);
