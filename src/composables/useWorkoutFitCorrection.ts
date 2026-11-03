import { ref, watch, type Ref } from 'vue';
import { open as showOpenDialog } from '@tauri-apps/plugin-dialog';
import { isTauri, tauriApi, toUserMessage } from './useTauriApi';
import { useSyncController } from './useSyncController';
import { useMessages } from '../i18n';
import { workoutDetailMessages } from '../views/WorkoutDetail.i18n';
import type { WorkoutFitOverride } from '../types';

/**
 * #140：拿修正过的 .fit 顶替这条运动，或者撤回去。只改本机——Zepp 开放接口没有导入运动的端点。
 * 写完标一次数据变了，详情、序列、列表都按新数据重读。
 */
export const useWorkoutFitCorrection = (workoutId: Ref<string>) => {
  const t = useMessages(workoutDetailMessages);
  const { markDataChanged } = useSyncController();
  const override = ref<WorkoutFitOverride | null>(null);
  const busy = ref(false);
  const note = ref<string | null>(null);
  const error = ref<string | null>(null);

  const load = async (id: string) => {
    override.value = null;
    note.value = null;
    error.value = null;
    if (!isTauri() || !id) return;
    try {
      const value = await tauriApi.getWorkoutFitOverride(id);
      if (id === workoutId.value) override.value = value;
    } catch {
      // 读不到就当没有修正：按钮照样能用，导入时的错误会说清楚。
    }
  };

  const run = async (action: () => Promise<void>) => {
    busy.value = true;
    note.value = null;
    error.value = null;
    try {
      await action();
      markDataChanged();
    } catch (cause) {
      error.value = toUserMessage(cause, t.value.fitFailed);
    } finally {
      busy.value = false;
    }
  };

  const replace = async () => {
    if (busy.value || !isTauri()) return;
    const id = workoutId.value;
    const path = await showOpenDialog({
      title: t.value.fitDialogTitle,
      multiple: false,
      directory: false,
      filters: [{ name: 'FIT', extensions: ['fit', 'FIT'] }],
    });
    if (!path || typeof path !== 'string') return;
    await run(async () => {
      override.value = await tauriApi.importWorkoutFit(id, path);
      note.value = t.value.fitApplied;
    });
  };

  const restore = async () => {
    if (busy.value || !override.value) return;
    const id = workoutId.value;
    await run(async () => {
      await tauriApi.removeWorkoutFit(id);
      override.value = null;
      note.value = t.value.fitRestored;
    });
  };

  watch(workoutId, (id) => void load(id), { immediate: true });

  return { override, busy, note, error, replace, restore };
};
