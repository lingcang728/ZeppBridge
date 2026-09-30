/**
 * 本地周报的一份共享数据：概览顶上的「这一周」摘要和下面的完整周报卡读同一份，只查一次。
 * 同步写进新数据（dataRevision 变）时重取。
 */
import { effectScope, ref, watch } from 'vue';
import { backend, isDesktop, toUserMessage } from '../lib/bridge';
import type { WeeklyReport } from '../types';
import { useSyncController } from './useSyncController';

const report = ref<WeeklyReport | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
let started = false;
let inflight: Promise<void> | null = null;

const load = (fallbackError: string): Promise<void> => {
  if (!isDesktop()) return Promise.resolve();
  if (inflight) return inflight;
  loading.value = true;
  error.value = null;
  inflight = backend.getWeeklyReport()
    .then((next) => { report.value = next; })
    .catch((cause) => { error.value = toUserMessage(cause, fallbackError); })
    .finally(() => { loading.value = false; inflight = null; });
  return inflight;
};

export function useWeeklyReport(fallbackError: () => string) {
  if (!started) {
    started = true;
    // 挂在独立的 effect scope 上：第一个用它的组件卸载了，重取也不能跟着停。
    effectScope(true).run(() => {
      const { dataRevision } = useSyncController();
      watch(dataRevision, () => void load(fallbackError()));
    });
  }
  if (!report.value && !inflight) void load(fallbackError());
  return { report, loading, error, reload: () => load(fallbackError()) };
}
