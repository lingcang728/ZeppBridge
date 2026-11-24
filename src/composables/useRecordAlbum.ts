import { computed, ref, shallowRef, watch, type Ref } from 'vue';
import { isTauri } from './useTauriApi';
import { backend } from '../lib/bridge';
import { nextSlot } from '../lib/motion/budget';
import {
  readAlbumPrefs, sleepMonthPeriods, sleepYearPeriods, workoutMonthPeriods, workoutYearPeriods, writeAlbumPrefs,
  type AlbumDensity, type AlbumKind, type AlbumLevel, type SleepPeriod, type WorkoutPeriod,
} from '../lib/album/album';
import type { RouteShape, SleepMonth, SleepStrip, WorkoutMonth } from '../types/album';

/**
 * 一张列表的相册状态：层级、密度（按列表记在偏好里）、按月汇总（第一次切到月 / 年才读）、
 * 行上的小图（轨迹轮廓 / 分期条，列表读到哪就按 50 条一批在空闲时补到哪，不挡首屏）。
 */
export function useRecordAlbum(kind: AlbumKind, ids: Ref<string[]>) {
  const prefs = readAlbumPrefs(kind);
  const level = ref<AlbumLevel>(prefs.level);
  const density = ref<AlbumDensity>(prefs.density);
  watch([level, density], () => writeAlbumPrefs(kind, { level: level.value, density: density.value }));

  const months = shallowRef<WorkoutMonth[] | SleepMonth[] | null>(null);
  let monthsLoading: Promise<void> | null = null;
  const loadMonths = (force = false): Promise<void> => {
    if (!isTauri()) { months.value = []; return Promise.resolve(); }
    if (monthsLoading && !force) return monthsLoading;
    monthsLoading = (kind === 'workouts' ? backend.getWorkoutMonths() : backend.getSleepMonths())
      .then((list) => { months.value = list; })
      .catch(() => { months.value = months.value ?? []; });
    return monthsLoading;
  };
  const periods = computed<{ month: (WorkoutPeriod | SleepPeriod)[]; year: (WorkoutPeriod | SleepPeriod)[] }>(() => {
    const list = months.value ?? [];
    return kind === 'workouts'
      ? { month: workoutMonthPeriods(list as WorkoutMonth[]), year: workoutYearPeriods(list as WorkoutMonth[]) }
      : { month: sleepMonthPeriods(list as SleepMonth[]), year: sleepYearPeriods(list as SleepMonth[]) };
  });
  watch(level, (next) => { if (next !== 'day' && !months.value) void loadMonths(); }, { immediate: true });

  /* 小图：已经问过的编号不再问（没有轨迹的也记着，免得反复问）。 */
  const shapes = shallowRef(new Map<string, RouteShape>());
  const strips = shallowRef(new Map<string, SleepStrip>());
  const asked = new Set<string>();
  let pumping = false;
  const pump = () => {
    if (pumping || !isTauri()) return;
    const batch = ids.value.filter((id) => !asked.has(id)).slice(0, 50);
    if (!batch.length) return;
    pumping = true;
    batch.forEach((id) => asked.add(id));
    const done = () => { pumping = false; nextSlot(pump); };
    if (kind === 'workouts') {
      backend.getWorkoutRouteShapes(batch).then((list) => {
        const next = new Map(shapes.value);
        for (const shape of list) next.set(shape.workout_id, shape);
        shapes.value = next;
      }).catch(() => undefined).finally(done);
    } else {
      backend.getSleepStageStrips(batch).then((list) => {
        const next = new Map(strips.value);
        for (const strip of list) next.set(strip.sleep_id, strip);
        strips.value = next;
      }).catch(() => undefined).finally(done);
    }
  };
  watch(() => ids.value.length, () => nextSlot(pump), { immediate: true });

  /** 数据变了（同步、重放）：汇总和小图都作废，按需重读。 */
  const invalidate = () => {
    asked.clear();
    shapes.value = new Map();
    strips.value = new Map();
    monthsLoading = null;
    if (level.value !== 'day' || months.value) void loadMonths(true);
    nextSlot(pump);
  };

  return { level, density, months, periods, loadMonths, shapes, strips, invalidate };
}
