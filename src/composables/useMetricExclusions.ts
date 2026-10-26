/**
 * 用户选择「不参与分析」的指标（core `storage::metric_prefs`）。
 *
 * 准不准我们不替用户判断：界面只说清每项怎么来的，排不排除由用户在「?」浮层里自己拨。
 * 排除不删数据、卡片照常显示，只是不参与常态比较、不交给 AI / MCP。全局单例，第一次用时取一次。
 */
import { ref } from 'vue';
import { backend, isDesktop } from '../lib/bridge';
import { invalidateMetricBaselines } from './useMetricBaselines';

const excluded = ref<string[]>([]);
let loaded = false;

const load = async () => {
  if (loaded || !isDesktop()) return;
  loaded = true;
  try {
    excluded.value = await backend.metricExclusions();
  } catch {
    loaded = false;
  }
};

export const useMetricExclusions = () => {
  void load();
  const isExcluded = (metric: string | null | undefined) => Boolean(metric && excluded.value.includes(metric));
  const setExcluded = async (metric: string, value: boolean) => {
    excluded.value = await backend.setMetricExcluded(metric, value);
    // 「比平时」的结论要按新名单重取：排除的指标后端不再给。
    invalidateMetricBaselines();
  };
  return { excluded, isExcluded, setExcluded };
};
