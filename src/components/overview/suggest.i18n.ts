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
    dismiss: 'Dismiss this suggestion',
    failed: 'Could not deal the cards right now. Try again later',
  },
  undefined,
  'components/overview/suggest',
);

export const useSuggestText = () => useMessages(messages);
