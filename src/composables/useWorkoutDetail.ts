import { computed, onMounted, ref, watch, type Ref } from 'vue';
import { useLoadingAfterMotion } from './useFirstLoad';
import { open as showOpenDialog } from '@tauri-apps/plugin-dialog';
import { useAiHandoff } from './useAiHandoff';
import { useSyncController } from './useSyncController';
import { isTauri, tauriApi, toUserMessage } from './useTauriApi';
import { createLoadSeq } from '../lib/loadSeq';
import { workoutPageQueries } from '../lib/pageQueries';
import { cached, peekAll } from '../lib/readCache';
import { afterMotion } from '../lib/motion/budget';
import { AI_PROVIDERS, AI_PROVIDER_BY_ID, type AiProviderId } from '../lib/aiProviders';
import { workoutLabel } from '../lib/labels';
import { isFiniteNumber } from '../lib/format';
import { readDefaultExportFormat } from '../lib/exportScope';
import { workoutDisplayLabel, workoutDisplayType } from '../lib/workouts';
import { intlLocale, useMessages } from '../i18n';
import { workoutDetailMessages } from '../views/WorkoutDetail.i18n';
import type { DeviceProfile, SportOption, Workout, WorkoutInsight, WorkoutSeries, WorkoutSeriesSample } from '../types';

export type WorkoutMetrics = Workout & {
  pace?: number | string | null;
  duration_minutes?: number | null;
};
export type ExportFormat = 'json' | 'csv' | 'gpx' | 'fit';

/**
 * 运动详情页的数据和动作：读记录 / 序列 / 设备 / 洞察，纠正运动类型，导出，交给 AI。
 * 从 WorkoutDetail.vue 搬出来，行为不变；页面只剩展示。
 */
export const useWorkoutDetail = (workoutId: Ref<string>) => {
  const t = useMessages(workoutDetailMessages);
  const { dataRevision } = useSyncController();
  const workout = ref<WorkoutMetrics | null>(null);
  const series = ref<WorkoutSeries | null>(null);
  const device = ref<DeviceProfile>({});
  const loading = ref(true);
  // 从最近记录 / 运动列表点进来之前，这一条多半已经预先读好了（lib/pageQueries.ts）：第一帧就是它，不放骨架。
  const preloaded = isTauri() && workoutId.value ? peekAll(workoutPageQueries(workoutId.value)) : null;
  if (preloaded) {
    workout.value = preloaded[0] as WorkoutMetrics | null;
    series.value = preloaded[1];
    device.value = preloaded[2];
    loading.value = false;
  }
  const error = ref<string | null>(null);
  const actionError = ref<string | null>(null);
  const exportedNote = ref<string | null>(null);
  const activeFormat = ref<ExportFormat>(readDefaultExportFormat());
  const exportBusy = ref(false);
  const displayType = computed(() => workout.value ? workoutDisplayType(workout.value) : 'unknown');
  const insight = ref<WorkoutInsight | null>(null);
  const insightLoading = ref(false);
  const insightError = ref<string | null>(null);
  const seriesError = ref<string | null>(null);
  const insightSeq = createLoadSeq();

  const loadInsight = async (id: string) => {
    const seq = insightSeq.next();
    if (!id) return;
    if (!isTauri()) {
      if (!insightSeq.isCurrent(seq)) return;
      insight.value = null;
      insightError.value = null;
      insightLoading.value = false;
      return;
    }
    insightLoading.value = true;
    insightError.value = null;
    try {
      const next = await tauriApi.getWorkoutInsight(id);
      if (!insightSeq.isCurrent(seq)) return;
      insight.value = next;
    } catch (cause) {
      if (!insightSeq.isCurrent(seq)) return;
      insight.value = null;
      insightError.value = toUserMessage(cause, t.value.insightFailed);
    } finally {
      if (insightSeq.isCurrent(seq)) insightLoading.value = false;
    }
  };

  /* 「交给 AI」就在这一页完成，不再把用户丢回「交给 AI」大页面再让他确认一遍
     范围。范围就是这一条运动，走的是和导出同一套互斥 ExportScope，所以洞察、
     导出和 AI 数据包读的是同一个库、同一套规则。 */
  const { handoffState, handoffError, prepareAndCopy } = useAiHandoff();
  const aiProviderId = ref<AiProviderId>('chatgpt');
  const aiProvider = computed(() => AI_PROVIDER_BY_ID[aiProviderId.value]);
  const aiProviderChoices = computed(() =>
    AI_PROVIDERS.map((provider) => ({ value: provider.id, label: provider.label, image: provider.localIcon })));
  const aiNote = ref<string | null>(null);

  const sendWorkoutToAi = async () => {
    aiNote.value = null;
    if (!workout.value) return;
    if (!isTauri()) {
      aiNote.value = t.value.needDesktop;
      return;
    }
    try {
      const label = workoutDisplayLabel(workout.value);
      const result = await prepareAndCopy(
        aiProvider.value,
        {
          scope: { kind: 'workout', workoutId: workout.value.workout_id },
          dataTypes: ['workouts', 'heart_rate'],
          detail: 'full',
        },
        t.value.aiPrompt(label),
        false, // 精确轨迹默认不外发
      );
      const opened = handoffState.value !== 'copied_only';
      if (result.mode === 'attachment') {
        aiNote.value = opened
          ? t.value.attachmentOpened(aiProvider.value.label)
          : t.value.attachmentNotOpened(aiProvider.value.label);
      } else {
        aiNote.value = opened
          ? t.value.copiedAndOpened(aiProvider.value.label)
          : t.value.copiedOnly(aiProvider.value.label);
      }
    } catch {
      // 错误从 handoffError 渲染
    }
  };

  const typeOverrideBusy = ref(false);
  /* 纠正选项直接来自随包运动目录（一百多项），不是一份写死的短名单：目录里有
     「壁球」而名单里没有，用户就永远改不成它。目录被 include_str! 编进二进制，
     所以这里和后端的允许值天然一致。 */
  const typeOverrideOptions = ref<SportOption[]>([]);
  const typeOverrideChoices = computed(() => [
    { value: '', label: t.value.noCorrection },
    // 后端发来的 label 是中文（那份列表也给 CLI 用），界面按 key 自己查名字。
    // 排序也得在这里做：按真正显示出来的那串字排，英文界面里才找得到「Squash」。
    ...typeOverrideOptions.value
      .map((option) => ({ value: option.key, label: workoutLabel(option.key) }))
      .sort((a, b) => a.label.localeCompare(b.label, intlLocale())),
  ]);

  let detailSeq = 0;
  const loadDetail = async () => {
    const seq = ++detailSeq;
    // 已经是这一条（预先读好的、或者数据版本变了重读）：内容留着，读完原地换，不退回骨架。
    if (workout.value?.workout_id !== workoutId.value) loading.value = true;
    error.value = null;
    seriesError.value = null;
    if (!isTauri()) { loading.value = false; return; }
    try {
      const emptySeries: WorkoutSeries = { workout_id: workoutId.value, samples: [], route: [], pauses: [], splits: [], laps: [], summary: {} };
      const [detailQuery, seriesQuery, deviceQuery] = workoutPageQueries(workoutId.value);
      const [detail, seriesResult, profile] = await Promise.all([
        cached(detailQuery),
        cached(seriesQuery).then(
          (value) => ({ ok: true as const, value }),
          (cause) => ({ ok: false as const, cause }),
        ),
        cached(deviceQuery).catch(() => ({})),
      ]);
      if (seq !== detailSeq) return;
      workout.value = detail as WorkoutMetrics | null;
      if (!detail) {
        series.value = null;
        seriesError.value = null;
      } else if (seriesResult.ok) {
        series.value = seriesResult.value;
        seriesError.value = null;
      } else {
        series.value = emptySeries;
        seriesError.value = toUserMessage(seriesResult.cause, t.value.seriesFailed);
      }
      device.value = profile;
    } catch (cause) {
      if (seq === detailSeq) error.value = toUserMessage(cause, t.value.loadFailed);
    } finally {
      if (seq === detailSeq) loading.value = false;
    }
  };

  const changeWorkoutOverride = async (value: string | number) => {
    if (!workout.value) return;
    const next = String(value);
    typeOverrideBusy.value = true;
    actionError.value = null;
    try {
      const updated = await tauriApi.setWorkoutTypeOverride(workout.value.workout_id, next || null);
      workout.value = updated as WorkoutMetrics;
      exportedNote.value = next ? t.value.overrideSaved : t.value.overrideCleared;
      void loadInsight(updated.workout_id);
    } catch (cause) {
      actionError.value = toUserMessage(cause, t.value.overrideFailed);
    } finally {
      typeOverrideBusy.value = false;
    }
  };

  const exportRecord = async () => {
    if (!workout.value || exportBusy.value) return;
    const exportWorkoutId = workout.value.workout_id;
    actionError.value = null;
    exportedNote.value = null;
    if (seriesError.value && activeFormat.value !== 'fit') {
      actionError.value = t.value.exportNeedsSeries;
      return;
    }
    exportBusy.value = true;
    try {
      if (activeFormat.value === 'fit') {
        const path = await showOpenDialog({ title: t.value.saveFit, directory: true, multiple: false });
        if (!path || typeof path !== 'string') return;
        await tauriApi.saveFitExport({
          scope: { kind: 'workout', workoutId: exportWorkoutId },
          dataTypes: ['workouts'],
          detail: 'full',
        }, path);
        exportedNote.value = t.value.savedFit;
        return;
      }
      const csvCell = (value: unknown): string => `"${String(value ?? '').replace(/"/g, '""')}"`;
      const csv = () => {
        const fields: Array<keyof WorkoutSeriesSample> = ['timestamp', 'heart_rate', 'speed', 'pace', 'cadence', 'stride_cm', 'altitude_m', 'power_watts', 'ground_contact_ms', 'vertical_oscillation_mm', 'vertical_ratio_pct', 'equivalent_pace_s_per_km'];
        return [fields.join(','), ...(series.value?.samples ?? []).map((sample) => fields.map((field) => csvCell(sample[field])).join(','))].join('\r\n');
      };
      const xmlEscape = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character] ?? character);
      const gpx = () => `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="ZeppBridge" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${xmlEscape(workoutLabel(displayType.value))}</name></metadata><trk><name>${xmlEscape(workout.value?.workout_id)}</name><trkseg>${(series.value?.route ?? []).map((point) => `<trkpt lat="${point.latitude}" lon="${point.longitude}">${isFiniteNumber(point.altitude_m) ? `<ele>${point.altitude_m}</ele>` : ''}<time>${xmlEscape(point.timestamp)}</time></trkpt>`).join('')}</trkseg></trk></gpx>`;
      const payload = activeFormat.value === 'json'
        ? JSON.stringify({ workout: workout.value, series: series.value }, null, 2)
        : activeFormat.value === 'csv' ? csv() : gpx();
      await navigator.clipboard.writeText(payload);
      exportedNote.value = t.value.copied(activeFormat.value.toUpperCase());
    } catch (cause) { actionError.value = toUserMessage(cause, t.value.exportFailed); }
    finally { exportBusy.value = false; }
  };

  onMounted(() => {
    // 第一帧用的是先前读好的数据：重读（含设备信息）等形变放完再做，晚到的结果不在形变途中改页面。
    if (preloaded) afterMotion(() => { void loadDetail(); });
    else void loadDetail();
    if (isTauri()) {
      void tauriApi.getWorkoutTypeOptions()
        .then((options) => { typeOverrideOptions.value = options; })
        .catch(() => { typeOverrideOptions.value = []; });
    }
  });
  watch([dataRevision, workoutId], () => void loadDetail());
  watch(workoutId, (id) => { if (id) void loadInsight(id); }, { immediate: true });

  return {
    workout, series, device, loading: useLoadingAfterMotion(loading), error, actionError, exportedNote, activeFormat, exportBusy, displayType,
    insight, insightLoading, insightError, seriesError,
    handoffState, handoffError, aiProviderId, aiProvider, aiProviderChoices, aiNote, sendWorkoutToAi,
    typeOverrideBusy, typeOverrideChoices, changeWorkoutOverride,
    loadDetail, exportRecord,
  };
};
