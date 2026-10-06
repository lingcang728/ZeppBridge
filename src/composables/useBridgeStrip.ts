/**
 * 「你的过去」的逐日条带和计划执行对照。全局单例：总页的缩略卡、/ai/past、/ai/past/:category 读同一份。
 *
 * 一次取满 90 天（条带按要看的天数在前端折叠），所以改回溯天数不用重读；换了一天或同步出了新数据才重读。
 */
import { ref, watch } from 'vue';
import { backend, toUserMessage } from '../lib/bridge';
import { useSyncController } from './useSyncController';
import type { DayStripRow, AdherenceDay } from '../types/timeBridge';
import { addDays, dayKey } from '../lib/aiTask/bridgeScale';

const rows = ref<DayStripRow[]>([]);
const adherence = ref<AdherenceDay[]>([]);
const error = ref<string | null>(null);
const loading = ref(false);
/** 条带的最后一天（今天）。跨过午夜由 useAiHub 推进。 */
const end = ref(dayKey());
let sequence = 0;
let watching = false;

const load = async () => {
  const mine = ++sequence;
  loading.value = true; error.value = null;
  try {
    const [next, compared] = await Promise.all([backend.aiTaskDayStrip(90, end.value), backend.trainingPlanAdherence(addDays(end.value, -89), end.value)]);
    if (mine !== sequence) return;
    rows.value = next; adherence.value = compared;
  } catch (e) { if (mine === sequence) error.value = toUserMessage(e, ''); }
  finally { if (mine === sequence) loading.value = false; }
};

export const useBridgeStrip = () => {
  if (!watching) {
    watching = true;
    const { dataRevision } = useSyncController();
    watch([end, dataRevision], () => { void load(); }, { immediate: true });
  }
  return { rows, adherence, loading, error, load, end };
};
