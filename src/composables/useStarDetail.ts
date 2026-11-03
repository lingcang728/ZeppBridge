/**
 * 年轮运动名片要的那点详情（components/rings/StarCard.vue）：平均心率、心率区间、运动时长，有 GPS 再要轨迹画剪影。
 * 卡先用年轮里现成的距离 / 时长出来，这些到了再补上；拨到前后一次之前先把邻居读好（prefetch），拨过去就是满的。
 * 小小的 LRU，最多记 20 条：年轮页常来回拨，没必要每次都问后端。
 */
import { shallowRef, watch, type Ref } from 'vue';
import { backend, isDesktop } from '../lib/bridge';
import type { Workout } from '../types/workout';

export interface StarDetail { workout: Workout | null; route: string | null }

const LIMIT = 20;
const cache = new Map<string, Promise<StarDetail>>();

const fetchDetail = async (id: string, draw: (points: { latitude: number; longitude: number }[]) => string | null): Promise<StarDetail> => {
  const workout = await backend.getWorkoutDetail(id).catch(() => null);
  if (!workout?.gps_available) return { workout, route: null };
  const series = await backend.getWorkoutSeries(id).catch(() => null);
  return { workout, route: series ? draw(series.route) : null };
};

/** 读一条（读过的直接拿缓存，并挪到最新）。 */
export const loadStarDetail = (id: string, draw: (points: { latitude: number; longitude: number }[]) => string | null): Promise<StarDetail> => {
  const hit = cache.get(id);
  if (hit) {
    cache.delete(id);
    cache.set(id, hit);
    return hit;
  }
  const next = fetchDetail(id, draw);
  cache.set(id, next);
  // 读失败的不记：下次再试。
  next.then((value) => { if (!value.workout) cache.delete(id); }, () => cache.delete(id));
  while (cache.size > LIMIT) cache.delete(cache.keys().next().value as string);
  return next;
};

/** 跟着 `id` 走的详情：换了 id 先清空，到了再填；晚到的旧结果丢掉。`neighbors` 顺手预读。 */
export const useStarDetail = (
  id: Ref<string | null>, neighbors: Ref<string[]>, draw: (points: { latitude: number; longitude: number }[]) => string | null,
) => {
  const detail = shallowRef<StarDetail | null>(null);
  watch(id, (now) => {
    detail.value = null;
    if (!now || !isDesktop()) return;
    void loadStarDetail(now, draw).then((value) => { if (id.value === now) detail.value = value; });
  }, { immediate: true });
  watch(neighbors, (list) => {
    if (!isDesktop()) return;
    for (const other of list) void loadStarDetail(other, draw);
  }, { immediate: true });
  return detail;
};
