import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import { displayDateTimeFormatter } from '../lib/dateTime';
import { isTauri, tauriApi, toUserMessage } from './useTauriApi';
import { useMessages } from '../i18n';
import { exploreMessages } from '../views/Explore.i18n';
import type { ExportDataType, ExportDetail, ExportScope } from '../types';

/* 探索页的「数据感知摘要」：按当前范围和勾选的数据流，向后端要条数和体积估算
   （从 Explore.vue 搬出来，行为不变）。 */

export const formatBytes = (bytes: number | null) => {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

interface PreviewInputs {
  startDate: Ref<string>;
  endDate: Ref<string>;
  dataTypes: Ref<ExportDataType[]>;
  detail: Ref<ExportDetail>;
  focusedWorkoutId: Ref<string | null>;
  currentScope: () => ExportScope;
  /** 这些变了要立刻重读（同步完成、生活事件变化），不走防抖。 */
  reloadOn: Ref<unknown>[];
}

export const useExplorePreview = (inputs: PreviewInputs) => {
  const { startDate, endDate, dataTypes, detail, focusedWorkoutId, currentScope } = inputs;
  const t = useMessages(exploreMessages);

  const previewBusy = ref(false);
  const previewError = ref<string | null>(null);
  const previewCount = ref<number | null>(null);
  const previewBytes = ref<number | null>(null);
  const previewScope = ref<{ startTime: string; endTime: string | null } | null>(null);
  let previewTimer = 0;
  let previewSeq = 0;

  const rangeDays = computed(() => {
    const start = new Date(startDate.value).getTime();
    const end = new Date(endDate.value).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
    return Math.round((end - start) / 86400000) + 1;
  });

  const datesValid = computed(() =>
    Boolean(startDate.value && endDate.value && startDate.value <= endDate.value),
  );

  /* 摘要里显示的范围来自后端真正用了的范围。锁定单条运动时显示这条运动的
     起止时刻，而不是页面上那两个和它无关的日期。 */
  const scopeRangeText = computed(() => {
    if (focusedWorkoutId.value) {
      if (!previewScope.value) return t.value.thisWorkout;
      const start = new Date(previewScope.value.startTime);
      if (Number.isNaN(start.getTime())) return t.value.thisWorkout;
      return displayDateTimeFormatter({
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(start);
    }
    return datesValid.value ? `${startDate.value} ~ ${endDate.value}` : '—';
  });

  const scopeRangeSub = computed(() => {
    if (focusedWorkoutId.value) {
      if (!previewScope.value?.endTime) return t.value.onlyThisWorkout;
      const start = new Date(previewScope.value.startTime).getTime();
      const end = new Date(previewScope.value.endTime).getTime();
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return t.value.onlyThisWorkout;
      return t.value.approxMinutes(Math.max(1, Math.round((end - start) / 60000)));
    }
    return rangeDays.value ? t.value.rangeDays(rangeDays.value) : '';
  });

  /* 选中的范围往回够到多少天。给 CoverageNotice 用：导出读的也是本机库，
     选了半年而库里只有 30 天时，导出文件会安静地只装 30 天。 */
  const requestedSpanDays = computed(() => {
    if (focusedWorkoutId.value) return 0;
    if (!startDate.value) return 0;
    const start = Date.parse(`${startDate.value}T00:00:00`);
    if (!Number.isFinite(start)) return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((today.getTime() - start) / 86_400_000) + 1;
  });

  const loadPreview = async () => {
    const seq = ++previewSeq;
    previewError.value = null;
    if ((!datesValid.value && !focusedWorkoutId.value) || !dataTypes.value.length) {
      previewCount.value = null;
      previewBytes.value = null;
      previewBusy.value = false;
      previewError.value = dataTypes.value.length ? null : t.value.needDataTypes;
      return;
    }
    if (!isTauri()) {
      previewCount.value = null;
      previewBytes.value = null;
      previewBusy.value = false;
      previewError.value = t.value.previewDesktopOnly;
      return;
    }
    previewBusy.value = true;
    try {
      const estimate = await tauriApi.estimateExport({
        scope: currentScope(),
        dataTypes: [...dataTypes.value],
        detail: detail.value,
      });
      if (seq !== previewSeq) return;
      previewCount.value = estimate.recordCount;
      previewBytes.value = estimate.estimatedBytes;
      // 摘要里的「时间范围」必须是后端真正用了的范围，而不是页面上那两个日期。
      previewScope.value = estimate.scopeKind === 'workout' && estimate.startTime
        ? { startTime: estimate.startTime, endTime: estimate.endTime ?? null }
        : null;
    } catch (error) {
      if (seq !== previewSeq) return;
      previewCount.value = null;
      previewBytes.value = null;
      previewError.value = toUserMessage(error, t.value.previewFailed);
    } finally {
      if (seq === previewSeq) previewBusy.value = false;
    }
  };

  const schedulePreview = () => {
    window.clearTimeout(previewTimer);
    previewTimer = window.setTimeout(() => { void loadPreview(); }, 280);
  };

  watch(
    [startDate, endDate, dataTypes, detail, focusedWorkoutId],
    schedulePreview,
    { deep: true, immediate: true },
  );
  watch(inputs.reloadOn, () => void loadPreview());
  onBeforeUnmount(() => window.clearTimeout(previewTimer));

  return {
    previewBusy, previewError, previewCount, previewBytes,
    datesValid, scopeRangeText, scopeRangeSub, requestedSpanDays, loadPreview,
  };
};
