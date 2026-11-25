import { computed, ref, shallowRef, watch, type Ref } from 'vue';
import { isTauri } from './useTauriApi';
import { backend } from '../lib/bridge';
import { nextSlot } from '../lib/motion/budget';
import {
  readAlbumZoom, sleepMonthPeriods, workoutMonthPeriods, writeAlbumZoom,
  type AlbumKind, type AlbumZoom, type SleepPeriod, type WorkoutPeriod,
} from '../lib/album/album';
import type { RouteShape, SleepMonth, WorkoutMonth } from '../types/album';

/**
 * 一张列表的缩放状态：日 / 月 / 年（按列表记在偏好里）、按月汇总（第一次离开「日」才读），
 * 运动行上的轨迹轮廓（列表读到哪就按 50 条一批在空闲时补到哪，不挡首屏）。
 * 睡眠行不再画分期条，所以不取分期。
 */
export function useRecordAlbum(kind: AlbumKind, ids: Ref<string[]>, initial?: AlbumZoom | null) {
  const zoom = ref<AlbumZoom>(initial ?? readAlbumZoom(kind));
  watch(zoom, (value) => writeAlbumZoom(kind, value));

  const months = shallowRef<WorkoutMonth[] | SleepMonth[] | null>(null);
  let monthsLoading: Promise<void> | null = null;
  const loadMonths = (force = false): Promise<void> => {
    if (!isTauri()) { months.value = months.value ?? []; return Promise.resolve(); }
    if (monthsLoading && !force) return monthsLoading;
    monthsLoading = (kind === 'workouts' ? backend.getWorkoutMonths() : backend.getSleepMonths())
      .then((list) => { months.value = list; })
      .catch(() => { months.value = months.value ?? []; });
    return monthsLoading;
  };
  const periods = computed<(WorkoutPeriod | SleepPeriod)[]>(() => {
    const list = months.value ?? [];
    return kind === 'workouts' ? workoutMonthPeriods(list as WorkoutMonth[]) : sleepMonthPeriods(list as SleepMonth[]);
  });
  watch(zoom, (next) => { if (next !== 'day' && !months.value) void loadMonths(); }, { immediate: true });

  /* 轨迹轮廓：已经问过的编号不再问（没有轨迹的也记着，免得反复问）。 */
  const shapes = shallowRef(new Map<string, RouteShape>());
  const asked = new Set<string>();
  let pumping = false;
  const pump = () => {
    if (kind !== 'workouts' || pumping || !isTauri()) return;
    const batch = ids.value.filter((id) => !asked.has(id)).slice(0, 50);
    if (!batch.length) return;
    pumping = true;
    batch.forEach((id) => asked.add(id));
    backend.getWorkoutRouteShapes(batch).then((list) => {
      const next = new Map(shapes.value);
      for (const shape of list) next.set(shape.workout_id, shape);
      shapes.value = next;
    }).catch(() => undefined).finally(() => { pumping = false; nextSlot(pump); });
  };
  watch(() => ids.value.length, () => nextSlot(pump), { immediate: true });

  /** 数据变了（同步、重放）：汇总和轮廓都作废，按需重读。 */
  const invalidate = () => {
    asked.clear();
    shapes.value = new Map();
    monthsLoading = null;
    if (zoom.value !== 'day' || months.value) void loadMonths(true);
    nextSlot(pump);
  };

  return { zoom, months, periods, loadMonths, shapes, invalidate };
}
