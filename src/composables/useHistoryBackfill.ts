import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useSyncController } from './useSyncController';
import { backend, isDesktop, toUserMessage } from '../lib/bridge';
import { isCancelledSyncError, isDeferredSyncError } from '../lib/syncDeferred';
import type { CoverageLedger, FailedChunk, StorageEstimate, UserPrefs } from '../types';
import { syncStreamLabel } from '../lib/syncStreams';
import { useMessages } from '../i18n';
import { failedChunkText } from '../lib/failedChunkText';
import { storageEstimateText, storageStopReasonText } from '../lib/storageEstimateText';
import { localDateString } from '../lib/format';
import { createLoadSeq } from '../lib/loadSeq';
import { archiveMessages } from '../components/HistoryArchivePanel.i18n';

/**
 * 长期归档与历史补拉的状态和动作（从 HistoryArchivePanel 里搬出来，行为不变）。
 *
 * 两件事解决时间轴的两半：**归档**管右半边——从今天起不再自动清理；
 * **补拉**管左半边——把装 ZeppBridge 以前的历史取回来。覆盖账本按月记账，
 * 所以界面能分开显示「已写入」「云端没有返回」「还没做」和「失败可重试」。
 */
export const useHistoryBackfill = (
  prefs: () => UserPrefs | null,
  onPrefsChanged: (prefs: UserPrefs) => void,
) => {
  const t = useMessages(archiveMessages);

  /* 流名和数据健康页、同步进度共用一份：各写各的，同一条流会在三处叫三个名字。 */
  const streamLabel = (stream: string): string => syncStreamLabel(stream);


  const { isSyncing, markDataChanged } = useSyncController();

  const ledger = ref<CoverageLedger | null>(null);
  const busy = ref(false);
  const error = ref<string | null>(null);
  const message = ref<string | null>(null);
  const estimate = ref<StorageEstimate | null>(null);
  const startChoice = ref<'1y' | '2y' | '3y' | 'all' | 'custom'>('1y');
  const customFrom = ref('');

  /** Zepp 云端本身也不会有更早的记录；给「全部」一个诚实的下界而不是 1970。 */
  const ALL_HISTORY_YEARS = 10;

  const START_CHOICES = computed(() => [
    { value: '1y', label: t.value.range1y },
    { value: '2y', label: t.value.range2y },
    { value: '3y', label: t.value.range3y },
    { value: 'all', label: t.value.rangeAll(ALL_HISTORY_YEARS) },
    { value: 'custom', label: t.value.rangeCustom },
  ]);

  const fromDate = computed(() => {
    const today = new Date();
    const back = (years: number) => {
      const date = new Date(today);
      date.setFullYear(date.getFullYear() - years);
      // 纯日历日期：用本地年月日，`toISOString()` 会在东八区把清晨推到前一天。
      return localDateString(date);
    };
    switch (startChoice.value) {
      case '1y': return back(1);
      case '2y': return back(2);
      case '3y': return back(3);
      case 'all': return back(ALL_HISTORY_YEARS);
      default: return customFrom.value;
    }
  });

  const requestedDays = computed(() => {
    if (!fromDate.value) return 0;
    const start = Date.parse(fromDate.value);
    if (!Number.isFinite(start)) return 0;
    return Math.max(0, Math.round((Date.now() - start) / 86_400_000));
  });

  /** 补拉回来的历史会不会在下一次成功同步后被清掉。 */
  const wouldBeCleanedUp = computed(() => {
    const current = prefs();
    return Boolean(current && !current.archive_enabled && requestedDays.value > current.retention_days);
  });

  const remaining = computed(() => {
    const value = ledger.value;
    if (!value) return 0;
    return Math.max(0, value.total_chunks - value.completed_chunks);
  });

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  };

  /** 有本机样本的流才有速率；其余显示「样本不足」，不编一个数字。 */
  const measuredStreams = computed(() => estimate.value?.streams.filter((item) => item.measured) ?? []);
  const unmeasuredStreams = computed(() => estimate.value?.streams.filter((item) => !item.measured) ?? []);

  const estimateLoadSeq = createLoadSeq();

  const loadEstimate = async () => {
    if (!isDesktop() || !requestedDays.value) return;
    const seq = estimateLoadSeq.next();
    const days = requestedDays.value;
    let result: StorageEstimate | null;
    try {
      result = await backend.getStorageEstimate(days);
    } catch {
      result = null;
    }
    // `requestedDays` can change again while this request is in flight; an
    // out-of-order response must not overwrite the estimate for whatever
    // range is currently selected with a stale one from an earlier range.
    if (!estimateLoadSeq.isCurrent(seq)) return;
    estimate.value = result;
  };

  const loadLedger = async () => {
    if (!isDesktop()) return;
    try {
      ledger.value = await backend.getCoverageLedger();
    } catch {
      ledger.value = null;
    }
  };

  onMounted(() => {
    void loadLedger();
    void loadEstimate();
  });

  // 换一个补拉起点，占用估算就该跟着变；否则用户看到的是上一个范围的数字。
  watch(requestedDays, () => { void loadEstimate(); });

  const toggleArchive = async () => {
    const current = prefs();
    if (!current) return;
    const next = !current.archive_enabled;
    if (!next && !window.confirm(t.value.confirmDisableArchive)) return;
    busy.value = true;
    error.value = null;
    message.value = null;
    try {
      const updated = await backend.setUserPrefs(
        current.retention_days,
        current.history_sync_days,
        next,
      );
      onPrefsChanged(updated);
      message.value = next ? t.value.archiveEnabled : t.value.archiveDisabled;
    } catch (cause) {
      error.value = toUserMessage(cause, t.value.archiveSaveFailed);
    } finally {
      busy.value = false;
    }
  };

  /*
   * 估算说明和失败原因都是后端给的**散文**，不是错误——上一轮只给错误加了码，
   * 这一类就漏在外面，于是英文界面上照样是中文（issue 里那两张截图）。
   *
   * 后端现在只给稳定码，句子在这里按界面语言拼，数字用本地的 formatBytes。
   */
  const estimateText = computed(() => storageEstimateText(estimate.value));
  const stopReasonText = computed(() => storageStopReasonText(estimate.value));

  /* 失败原因的实现在 lib/failedChunkText.ts，那里可以直接拿数据库行做单测；
     写在 SFC 里就只能靠人点界面看，这正是前几次没能及时发现的原因。 */
  const chunkErrorText = (item: FailedChunk): string => failedChunkText(item);

  /*
   * 一轮跑完自动接着下一轮（issue #29）。
   *
   * 后端每次调用只处理有限块数并返回账本——这个设计本身是对的，它让一次几年
   * 的补拉可以被中断、被记账、被续传。错的是把「再来一轮」这件事整个丢给用户：
   * 报告者说他连着点了一小时。
   *
   * 所以循环放在这里，而不是把后端那一轮改成无限：可取消、可观察、失败时能停
   * 在原地，这三条都还是靠「一轮一轮来」保证的。
   */
  const autoContinue = ref(true);
  const stopRequested = ref(false);
  let loopGeneration = 0;

  onUnmounted(() => {
    loopGeneration += 1;
    stopRequested.value = true;
    if (busy.value && isDesktop()) void backend.cancelSync();
  });

  const sleepBackfill = async (ms: number, gen: number): Promise<boolean> => {
    const step = 200;
    let waited = 0;
    while (waited < ms) {
      if (stopRequested.value || gen !== loopGeneration) return false;
      await new Promise((resolve) => window.setTimeout(resolve, step));
      waited += step;
    }
    return !stopRequested.value && gen === loopGeneration;
  };

  const stopBackfill = async () => {
    stopRequested.value = true;
    loopGeneration += 1;
    if (!isDesktop()) return;
    try {
      await backend.cancelSync();
    } catch {
      // 取消令已经立了；命令失败不该挡住「停止」本身。
    }
  };

  const runBackfill = async () => {
    if (!fromDate.value) {
      error.value = t.value.pickStartFirst;
      return;
    }
    if (estimate.value?.stop_reason) {
      error.value = stopReasonText.value;
      return;
    }
    if (wouldBeCleanedUp.value) {
      error.value = t.value.outOfRetention;
      return;
    }
    const gen = loopGeneration;
    busy.value = true;
    stopRequested.value = false;
    error.value = null;
    message.value = null;
    try {
      for (;;) {
        if (gen !== loopGeneration || stopRequested.value) {
          message.value = t.value.stoppedByUser(remaining.value);
          break;
        }
        const before = remaining.value;
        try {
          const next = await backend.startHistoryBackfill(fromDate.value);
          if (gen !== loopGeneration) {
            message.value = t.value.stoppedByUser(remaining.value);
            break;
          }
          ledger.value = next;
          markDataChanged();
        } catch (cause) {
          if (gen !== loopGeneration || stopRequested.value || isCancelledSyncError(cause)) {
            message.value = t.value.stoppedByUser(remaining.value);
            break;
          }
          if (isDeferredSyncError(cause) && autoContinue.value) {
            message.value = t.value.deferredRetry;
            const keepGoing = await sleepBackfill(15_000, gen);
            if (!keepGoing) {
              message.value = t.value.stoppedByUser(remaining.value);
              break;
            }
            continue;
          }
          throw cause;
        }

        if (remaining.value <= 0) {
          message.value = t.value.allChunksDone;
          break;
        }
        if (!autoContinue.value) {
          message.value = t.value.roundDone(remaining.value);
          break;
        }
        if (stopRequested.value || gen !== loopGeneration) {
          message.value = t.value.stoppedByUser(remaining.value);
          break;
        }
        // 一轮下来一块都没推进：再循环下去就是空转。可能是这些块反复失败，
        // 也可能是账本和云端对不上——两种情况都需要人看一眼，不该让应用
        // 自己转到天亮。
        if (before > 0 && remaining.value >= before) {
          message.value = t.value.stalled(remaining.value);
          break;
        }
        // 让出一帧，进度文案和「停止」按钮才有机会真的更新和被点到。
        message.value = t.value.roundProgress(
          ledger.value?.completed_chunks ?? 0,
          ledger.value?.total_chunks ?? 0,
        );
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      }
    } catch (cause) {
      error.value = toUserMessage(cause, t.value.backfillFailed);
      await loadLedger();
    } finally {
      busy.value = false;
      stopRequested.value = false;
    }
  };

  /* 「重试失败项」和「清空账本」是两件事：前者只让失败的月份重新排队，
     已经写入的历史一条都不动。上一版没有前者，用户为了重试一个月份只能清掉
     整个账本，把几年历史重拉一遍。 */
  const retryFailed = async () => {
    busy.value = true;
    error.value = null;
    try {
      ledger.value = await backend.retryFailedBackfillChunks();
      message.value = t.value.retryFailedDone;
    } catch (cause) {
      error.value = toUserMessage(cause, t.value.retryFailedFailed);
    } finally {
      busy.value = false;
    }
  };

  const resetLedger = async () => {
    if (!window.confirm(t.value.confirmResetLedger)) return;
    busy.value = true;
    error.value = null;
    try {
      ledger.value = await backend.resetCoverageLedger();
      message.value = t.value.ledgerReset;
    } catch (cause) {
      error.value = toUserMessage(cause, t.value.ledgerResetFailed);
    } finally {
      busy.value = false;
    }
  };

  return {
    t,
    streamLabel,
    ledger,
    busy,
    error,
    message,
    estimate,
    startChoice,
    customFrom,
    START_CHOICES,
    fromDate,
    requestedDays,
    wouldBeCleanedUp,
    remaining,
    formatBytes,
    measuredStreams,
    unmeasuredStreams,
    estimateText,
    stopReasonText,
    chunkErrorText,
    autoContinue,
    stopRequested,
    isSyncing,
    toggleArchive,
    stopBackfill,
    runBackfill,
    retryFailed,
    resetLedger,
  };
};
