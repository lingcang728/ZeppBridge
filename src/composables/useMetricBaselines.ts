/**
 * 「比平时高 / 低」的标记（精修批次 6.2）：结论在 core `insight::anomaly` 里按确定性规则算（只和用户自己近 28 天
 * 比，少于 14 天不标），这里只是取回来、缓存、同步出新数据时作废。
 *
 * 全局单例：概览的置顶指标和二级页的指标卡问同一项时只取一次。卡片挂上时登记要哪些指标，攒一帧一起取。
 */
import { ref, watch } from 'vue';
import { backend, isDesktop } from '../lib/bridge';
import type { MetricBaseline } from '../lib/bridge/types';
import { useSyncController } from './useSyncController';

const cache = ref<Record<string, MetricBaseline | null>>({});
const pending = new Set<string>();
let timer = 0;
let watching = false;

const flush = async () => {
  timer = 0;
  const metrics = [...pending];
  pending.clear();
  if (!metrics.length || !isDesktop()) return;
  try {
    const list = await backend.getMetricBaselines(metrics);
    const next = { ...cache.value };
    for (const metric of metrics) next[metric] = list.find((item) => item.metric === metric) ?? null;
    cache.value = next;
  } catch {
    // 取不到就不标：标记只是锦上添花，不能因为它让卡片报错。
  }
};

const request = (metric: string | null | undefined) => {
  if (!metric || metric in cache.value || pending.has(metric)) return;
  pending.add(metric);
  if (!timer) timer = window.setTimeout(() => void flush(), 30);
};

export const useMetricBaselines = () => {
  if (!watching) {
    watching = true;
    const { dataRevision } = useSyncController();
    watch(dataRevision, () => {
      const known = Object.keys(cache.value);
      cache.value = {};
      for (const metric of known) request(metric);
    });
  }
  /** 这一项的结论；还没取到或数据不够就是 null。 */
  const baselineOf = (metric: string | null | undefined): MetricBaseline | null => {
    request(metric);
    return metric ? cache.value[metric] ?? null : null;
  };
  return { baselineOf };
};
