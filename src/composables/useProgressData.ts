import { computed, onMounted, ref } from 'vue';
import { useRevisionReload } from './useRevisionReload';
import { isDesktop } from '../lib/bridge';
import { indexSeries, SERIES_FETCH_DAYS } from '../lib/metricSeries';
import { pageQuery } from '../lib/pageQueries';
import { cached } from '../lib/readCache';
import { sleepNights, type SleepNight } from '../lib/sleepTrends';
import { displayableWorkouts } from '../lib/workouts';
import type { DayPoint } from '../lib/progress';
import type { MetricSeries, Workout } from '../types';

/**
 * 概览的「目标 / 纪录 / 本周」三张卡共用的一份数据：
 *   - 每日序列（步数、HRV、静息心率）：最近一年；
 *   - 睡眠按晚；运动逐条。
 * 由 ProgressSection 读一次再分给三张卡，不各读各的。同步落地后自己重读。
 */
const METRICS = ['steps', 'distance', 'hrv_rmssd', 'hrv', 'resting_hr'] as const;

const toPoints = (series?: MetricSeries): DayPoint[] =>
  (series?.points ?? []).filter((point) => Number.isFinite(point.value)).map((point) => ({ date: point.date, value: point.value }));

export const useProgressData = () => {
  const series = ref<Record<string, MetricSeries>>({});
  const sleeps = ref<Parameters<typeof sleepNights>[0]>([]);
  const workouts = ref<Workout[]>([]);
  const loaded = ref(false);
  const failed = ref(false);

  let seq = 0;
  const load = async () => {
    if (!isDesktop()) { loaded.value = true; return; }
    const mine = ++seq;
    const [seriesResult, sleepResult, workoutResult] = await Promise.allSettled([
      cached(pageQuery.metricSeries(METRICS, SERIES_FETCH_DAYS)),
      cached(pageQuery.recentSleep(500)),
      cached(pageQuery.recentWorkouts(500)),
    ]);
    if (mine !== seq) return;
    if (seriesResult.status === 'fulfilled') series.value = indexSeries(seriesResult.value);
    if (sleepResult.status === 'fulfilled') sleeps.value = sleepResult.value;
    if (workoutResult.status === 'fulfilled') workouts.value = displayableWorkouts(workoutResult.value);
    failed.value = [seriesResult, sleepResult, workoutResult].every((result) => result.status === 'rejected');
    loaded.value = true;
  };
  onMounted(() => { void load(); });
  useRevisionReload(() => { void load(); });

  const nights = computed<SleepNight[]>(() => sleepNights(sleeps.value, '0000-01-01', '9999-12-31'));
  const data = computed(() => ({
    steps: toPoints(series.value.steps),
    // 每日总距离（米）：全天的，不只是运动记录里的。
    distance: toPoints(series.value.distance),
    // HRV 有两个口径：谁有读数用谁，优先 rmssd。
    hrv: toPoints(series.value.hrv_rmssd?.points.length ? series.value.hrv_rmssd : series.value.hrv),
    restingHr: toPoints(series.value.resting_hr),
    nights: nights.value,
    workouts: workouts.value,
  }));
  const hasAnything = computed(() => data.value.steps.length > 0 || data.value.nights.length > 0 || data.value.workouts.length > 0);
  return { data, loaded, failed, hasAnything };
};

