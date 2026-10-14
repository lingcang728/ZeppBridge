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

/**
 * 周报里的颜色只用绿和红（用户 2026-09-30 定：不要灰）。有公认方向的指标照旧：更好=绿、更差=红，
 * 带 ✓ / !；只是变化的那些（训练次数、训练负荷……）按方向用浅一档的绿 / 红——涨是浅绿、降是浅红，
 * 前面仍是 ↑↓ 箭头、没有 ✓ / !，所以读得出「这只是方向，不是评价」。持平算浅绿。
 */
export type ReportTone = 'good' | 'bad' | 'up' | 'down';
export const reportTone = (fact: Pick<InsightFact, 'fact_id' | 'comparison'>): ReportTone => {
  const tone = changeTone(fact);
  if (tone === 'good' || tone === 'bad') return tone;
  return fact.comparison?.direction === 'lower' ? 'down' : 'up';
};
