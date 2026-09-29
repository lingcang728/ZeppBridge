import type { InsightFact } from '../types';

/**
 * 周报、运动洞察里一项变化该怎么上色。
 *
 * 「增加了」和「更好了」是两层意思：训练次数、训练负荷、睡眠时长、距离涨了，是事实，
 * 但多不一定好——以前除了三项「越低越好」，其余一律按「越高越好」打绿勾，等于替用户
 * 下了结论。现在只有确实有公认方向的指标才给好 / 坏，其余是 neutral：只给方向箭头，
 * 不给评价色。后端只产出数字和方向，好坏是这里加的，不改任何事实。
 */
export type ChangeTone = 'good' | 'bad' | 'neutral' | 'flat';

/** 数字变小对这项意味着「更好」。 */
const LOWER_IS_BETTER = new Set([
  'weekly.resting_hr',
  'weekly.stress',
  'weekly.sleep_start_regularity',
  'run.pace',
  'run.avg_hr',
]);
/** 数字变大对这项意味着「更好」。 */
const HIGHER_IS_BETTER = new Set(['weekly.hrv']);

export const changeTone = (fact: Pick<InsightFact, 'fact_id' | 'comparison'>): ChangeTone => {
  const direction = fact.comparison?.direction;
  if (!direction || direction === 'same') return 'flat';
  const lower = direction === 'lower';
  if (LOWER_IS_BETTER.has(fact.fact_id)) return lower ? 'good' : 'bad';
  if (HIGHER_IS_BETTER.has(fact.fact_id)) return lower ? 'bad' : 'good';
  return 'neutral';
};

/** 中性变化前面的箭头：只说方向。 */
export const changeArrow = (fact: Pick<InsightFact, 'comparison'>): string => {
  const direction = fact.comparison?.direction;
  return direction === 'higher' ? '↑' : direction === 'lower' ? '↓' : '';
};
