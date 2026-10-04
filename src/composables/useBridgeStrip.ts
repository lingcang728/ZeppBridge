import { ref, watch, type Ref } from 'vue';
import { backend, toUserMessage } from '../lib/bridge';
import { useSyncController } from './useSyncController';
import type { DayStripRow, AdherenceDay } from '../types/timeBridge';
import { addDays, dayKey } from '../lib/aiTask/bridgeScale';

export const useBridgeStrip = (days: Ref<number>, end: Ref<string>) => {
  const rows = ref<DayStripRow[]>([]), adherence = ref<AdherenceDay[]>([]), error = ref<string | null>(null), loading = ref(false);
  let sequence = 0;
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
  const { dataRevision } = useSyncController();
  watch([days, end, dataRevision], () => { void load(); }, { immediate: true });
  return { rows, adherence, loading, error, load, today: dayKey() };
};
