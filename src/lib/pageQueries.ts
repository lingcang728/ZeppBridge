import { backend, isDesktop } from './bridge';
import { SERIES_FETCH_DAYS } from './metricSeries';
import { cached, type Query } from './readCache';
import { METRICS as BODY_METRICS } from '../views/body/bodyCards';
import type { DailyHeartRateExtreme, HeartRatePoint, MetricSeries, SleepSession, StressPoint, TrainingBalancePoint } from '../types';

/**
 * 各详情页首屏要读的东西，写在一处：页面自己读的时候用这里的查询，预加载（lib/motion/prefetch.ts）
 * 也用这里的——键一样，预先读好的结果页面挂载时就能直接拿到（lib/readCache.ts）。
 *
 * 这个模块不进首屏：prefetch.ts 第一次用到时才动态 import（它带着身体页的指标清单）。
 */
export const HEART_TREND_METRICS = ['resting_hr', 'hrv', 'hrv_rmssd'] as const;
export const TRAINING_METRICS = ['vo2max', 'training_load', 'lactate_threshold_hr', 'lactate_threshold_pace', 'pai_daily'] as const;
export const ACTIVITY_METRICS = ['steps', 'distance', 'active_calories', 'active_minutes'] as const;
/** 训练负荷平衡至少看一个月：28 天窗口要先有这么长的跑道才算得出比值。 */
export const TRAINING_BALANCE_DAYS = Math.max(28, SERIES_FETCH_DAYS);

export const pageQuery = {
  metricSeries: (metrics: readonly string[], days = SERIES_FETCH_DAYS): Query<MetricSeries[]> => ({
    key: `metric_series:${days}:${metrics.join(',')}`,
    fetch: () => backend.getMetricSeries([...metrics], days),
  }),
  heartRateSeries: (hours: number): Query<HeartRatePoint[]> => ({
    key: `heart_rate_series:${hours}`,
    fetch: () => backend.getHeartRateSeries(hours),
  }),
  dailyHeartRateExtremes: (days: number): Query<DailyHeartRateExtreme[]> => ({
    key: `daily_hr_extremes:${days}`,
    fetch: () => backend.getDailyHeartRateExtremes(days),
  }),
  stressSeries: (hours: number): Query<StressPoint[]> => ({
    key: `stress_series:${hours}`,
    fetch: () => backend.getStressSeries(hours),
  }),
  trainingBalance: (days: number): Query<TrainingBalancePoint[]> => ({
    key: `training_balance:${days}`,
    fetch: () => backend.getTrainingBalance(days),
  }),
  sleepDetail: (sleepId: string): Query<SleepSession | null> => ({
    key: `sleep_detail:${sleepId}`,
    fetch: () => backend.getSleepDetail(sleepId),
  }),
  recentSleep: (limit: number): Query<SleepSession[]> => ({
    key: `recent_sleep:${limit}`,
    fetch: () => backend.getRecentSleep(limit),
  }),
};

/** 每个详情页首屏的那一组（顺序和页面里 Promise.allSettled 的顺序一致）。 */
export const heartPageQueries = () => [
  pageQuery.heartRateSeries(24),
  pageQuery.metricSeries(HEART_TREND_METRICS),
  pageQuery.dailyHeartRateExtremes(SERIES_FETCH_DAYS),
] as const;
export const bodyPageQueries = () => [pageQuery.metricSeries(BODY_METRICS), pageQuery.stressSeries(24)] as const;
export const trainingPageQueries = () => [
  pageQuery.metricSeries(TRAINING_METRICS),
  pageQuery.trainingBalance(TRAINING_BALANCE_DAYS),
] as const;
export const activityPageQueries = () => [pageQuery.metricSeries(ACTIVITY_METRICS)] as const;
export const sleepPageQueries = (sleepId: string) => [pageQuery.sleepDetail(sleepId), pageQuery.recentSleep(7)] as const;

const ROUTES: Array<[RegExp, (match: RegExpMatchArray) => readonly Query<unknown>[]]> = [
  [/^\/heart\/?$/, heartPageQueries],
  [/^\/body\/?$/, bodyPageQueries],
  [/^\/training\/?$/, trainingPageQueries],
  [/^\/activity\/?$/, activityPageQueries],
  [/^\/sleep\/([^/?#]+)$/, (match) => sleepPageQueries(decodeURIComponent(match[1]))],
];

/** 按路径找出那一页首屏的查询（没有登记的页返回空）。 */
export const queriesFor = (path: string): readonly Query<unknown>[] => {
  const clean = path.split(/[?#]/)[0];
  for (const [pattern, build] of ROUTES) {
    const match = clean.match(pattern);
    if (match) return build(match);
  }
  return [];
};

/**
 * 把那一页首屏的数据先读好。`waitMs` > 0 时最多等这么久（切页前用：读好了新页第一帧就是真内容，
 * 读不完也不让人干等，页面自己的骨架接着）。
 */
export const preloadRoute = (path: string, waitMs = 0): Promise<void> => {
  if (!isDesktop()) return Promise.resolve();
  const queries = queriesFor(path);
  if (!queries.length) return Promise.resolve();
  const all = Promise.allSettled(queries.map((query) => cached(query))).then(() => undefined);
  if (waitMs <= 0) return all;
  return Promise.race([all, new Promise<void>((resolve) => { setTimeout(resolve, waitMs); })]);
};
