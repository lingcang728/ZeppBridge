import { displayDateTimeFormatter, parseDisplayDate } from './dateTime';
import { rangeBounds } from './hourlySteps';
import { localDateString } from './format';

/**
 * 「前一段」到底是哪几天：紧挨在当前范围之前、一样长的一段，写成「9月24日 – 10月23日」。
 * 卡片上的「较前一段」只写百分比的话看不出在和谁比，所以把日期一起写出来。
 */
export const previousPeriodLabel = (days: number, today?: Date): string => {
  const span = Math.max(1, Math.round(days));
  const current = rangeBounds(span, today);
  const prior = rangeBounds(span * 2, today);
  const [y, m, d] = current.start.split('-').map(Number);
  const end = localDateString(new Date(y!, m! - 1, d! - 1));
  const format = displayDateTimeFormatter({ month: 'short', day: 'numeric' });
  return `${format.format(parseDisplayDate(prior.start))} – ${format.format(parseDisplayDate(end))}`;
};

/**
 * 变化的「好坏」：只给有明确方向的指标上色，其余保持中性。
 *   - up：越高越好（步数、HRV、睡眠评分、最大摄氧量……）；
 *   - down：越低越好（静息心率、压力、体脂率、清醒时长）；
 *   - 其余（训练负荷、体重、BMI、浅睡）涨跌各有各的含义，不判断好坏，只显示方向。
 */
const HIGHER_IS_BETTER = new Set([
  'steps', 'active_minutes', 'active_calories', 'distance', 'hrv', 'hrv_rmssd', 'sleep_score', 'sleep_duration',
  'vo2max', 'readiness', 'pai_total', 'spo2', 'deep', 'rem',
]);
const LOWER_IS_BETTER = new Set(['resting_hr', 'stress', 'body_fat_rate', 'awake']);

/** good = 朝好的方向变，bad = 朝坏的方向变，flat = 变化不到 0.5%（持平），neutral = 这个指标不判断好坏。 */
export type DeltaTone = 'good' | 'bad' | 'flat' | 'neutral';

export interface PeriodChange {
  /** 「↑ +8.2%」这样的文字。 */
  text: string;
  tone: DeltaTone;
}

/**
 * 和紧挨着的前一段比平均值：给方向、幅度，和（对有明确方向的指标）好坏。
 * 前一段读数太少时（`before` 为空）或前一段是 0 时不比。变化不到 0.5% 算持平，不上色。
 */
export const periodChange = (
  now: number | null | undefined,
  before: number | null | undefined,
  metric?: string,
): PeriodChange | null => {
  if (typeof now !== 'number' || typeof before !== 'number' || !Number.isFinite(now) || !Number.isFinite(before) || before === 0) return null;
  const percent = ((now - before) / Math.abs(before)) * 100;
  if (!Number.isFinite(percent)) return null;
  const rounded = Math.abs(percent) < 0.5 ? 0 : percent;
  const size = Math.abs(rounded).toFixed(rounded !== 0 && Math.abs(rounded) < 10 ? 1 : 0);
  const text = `${rounded > 0 ? '↑ +' : rounded < 0 ? '↓ −' : '→ '}${size}%`;
  let tone: DeltaTone = 'neutral';
  if (Math.abs(percent) < 0.5) tone = 'flat';
  else if (metric && HIGHER_IS_BETTER.has(metric)) tone = percent > 0 ? 'good' : 'bad';
  else if (metric && LOWER_IS_BETTER.has(metric)) tone = percent < 0 ? 'good' : 'bad';
  return { text, tone };
};

/** 只要文字的版本（不关心颜色的地方）。 */
export const periodDelta = (now: number | null | undefined, before: number | null | undefined): string | null =>
  periodChange(now, before)?.text ?? null;

/** 往前 `window` 个位置的移动平均（只算有值的，至少 3 个读数才给）。 */
export const trailingMean = (values: Array<number | null>, window: number): Array<number | null> =>
  values.map((_, index) => {
    const slice = values.slice(Math.max(0, index - window + 1), index + 1).filter((value): value is number => value !== null);
    return slice.length >= Math.min(3, window) ? slice.reduce((sum, value) => sum + value, 0) / slice.length : null;
  });
