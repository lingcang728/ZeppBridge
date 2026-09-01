<script setup lang="ts">
/**
 * 长期归档与完整历史补拉。
 *
 * 两件事解决时间轴的两半：**归档**管右半边——从今天起不再自动清理；
 * **补拉**管左半边——把装 ZeppBridge 以前的历史取回来。只有两个都到位，
 * 「本机完整副本」这句话才成立。
 *
 * 覆盖账本按月记账，所以界面能分开显示「已写入」「云端没有返回」「还没做」
 * 和「失败可重试」。把这四种状态压成一个进度条，用户就没法回答
 * 「我 2023 年的数据到底有没有」。
 */
import { computed, onMounted, ref, watch } from 'vue';
import SelectMenu from './SelectMenu.vue';
import { useSyncController } from '../composables/useSyncController';
import { backend, isDesktop, toUserMessage } from '../lib/bridge';
import type { CoverageLedger, FailedChunk, StorageEstimate, UserPrefs } from '../types';
import { syncStreamLabel } from '../lib/syncStreams';
import { defineMessages, useMessages } from '../i18n';
import { failedChunkText } from '../lib/failedChunkText';
import { storageEstimateText, storageStopReasonText } from '../lib/storageEstimateText';

const messages = defineMessages(
  {
    title: '长期归档与完整历史',
    intro: '归档管「从今天起不再删」，补拉管「把以前的取回来」。两个都到位，本机才真的是一份完整副本。',
    archiveTitle: '长期归档',
    archiveBody: '开启后，成功同步不再按保留期自动清理历史。库会持续变大，可以随时关闭；关闭时会提示下一次同步的清理影响。',
    archiveAria: '长期归档',
    startLabel: '补拉起点',
    startAria: '历史补拉起点',
    customDateLabel: '起始日期',
    customDateAria: '补拉起始日期',
    estimateTitle: '预计占用',
    estimateRate: (days: number, perDay: string) => `本机 ${days} 天样本 · 约 ${perDay}/天`,
    unmeasured: (streams: string) =>
      `本机样本不足、没有估算：${streams}。这几条不计入上面的总数——与其编一个速率乘上几年，不如说不知道。`,
    wouldBeCleanedUp: (requested: number, retention: number) =>
      `这次补拉要取回 ${requested} 天的历史，但本机只保留最近 ${retention} 天——取回来的数据会在下一次成功同步后被删掉。请先打开长期归档，或把保留期调长。`,
    backfilling: '正在补拉…',
    continueBackfill: '继续补拉',
    startBackfill: '开始补拉',
    autoContinue: '自动跑完',
    autoContinueHint: '一轮跑完自动接着下一轮，直到全部补完。随时可以停，已经拉回来的不会丢。',
    stopBackfill: '停止',
    stopping: '正在停止…',
    roundProgress: (done: number, total: number) =>
      `正在补拉：已完成 ${done} / ${total} 个月份块。可以随时停。`,
    stoppedByUser: (remaining: number) =>
      `已停止，还剩 ${remaining} 个月份块。已经拉回来的历史都在，点「继续补拉」接着做。`,
    stalled: (remaining: number) =>
      `还剩 ${remaining} 个月份块，但这一轮一个都没能推进，已经停下来。多半是这些块反复失败——看下面的失败列表，或者点「重试失败项」。`,
    resetLedger: '清空账本',
    ledgerTitle: '覆盖账本',
    ledgerProgress: (done: number, total: number) => `${done} / ${total} 个月份块已有结论`,
    ledgerFrom: (from: string) => ` · 请求范围 ${from} 起`,
    ledgerComplete: '账本里每个月份块都有结论：要么已写入本机，要么云端明确没有那段时间的数据。',
    ledgerIncomplete: (remaining: number) =>
      `还有 ${remaining} 个块没有结论。在它们全部完成之前，这份本地副本只能算「已成功同步范围内的副本」，不是完整副本。`,
    ledgerStats: (persisted: number, empty: number, pending: number) =>
      `已写入 ${persisted} · 云端无返回 ${empty} · 待做 ${pending}`,
    ledgerFailed: (failed: number) => `失败 ${failed}`,
    ledgerRange: (from: string, to: string, records: number) => `${from} ~ ${to} · ${records} 条`,
    ledgerNothingWritten: '尚未写入任何月份',

    range1y: '最近 1 年',
    range2y: '最近 2 年',
    range3y: '最近 3 年',
    rangeAll: (years: number) => `全部可获取历史（最多 ${years} 年）`,
    rangeCustom: '自定义起点',

    confirmDisableArchive: '关掉长期归档后，下一次成功同步会按保留期清理更早的数据，且不可恢复。\n如果你刚补拉过历史，建议先做一份数据库快照。\n确定关闭吗？',
    archiveEnabled: '已开启长期归档：成功同步后不再自动清理历史。',
    archiveDisabled: '已关闭长期归档：下一次成功同步会按保留期清理。',
    archiveSaveFailed: '无法保存归档设置',
    pickStartFirst: '请先选择补拉起点。',
    outOfRetention: '这次补拉的范围超出了本机保留期，取回来的数据会在下一次成功同步后被清掉。请先打开长期归档，或把保留期调长。',
    roundDone: (remaining: number) =>
      `这一轮已处理完，还剩 ${remaining} 个月份块。再点一次「继续补拉」接着做，随时可以停。`,
    allChunksDone: '账本里的每个月份块都有结论了。',
    backfillFailed: '历史补拉失败',
    confirmResetLedger: '只清空覆盖账本，不会删除任何已经写进本机的数据。之后可以重新规划一次补拉。确定吗？',
    ledgerReset: '账本已清空，可以重新规划补拉范围。',
    ledgerResetFailed: '无法清空账本',
    failedTitle: '没能取回的月份',
    failedIntro: '这些块失败了。其余的月份没有受影响，已经照常补拉。',
    failedRow: (stream: string, month: string) => `${stream} · ${month}`,
    failedAttempts: (attempts: number) => `已尝试 ${attempts} 次`,
    failedExhausted: '自动重试已用尽，点「重试失败项」再试一次',
    failedNoReason: '没有记录原因',
    retryFailed: '重试失败项',
    retryFailedDone: '失败的月份已重新排队，可以继续补拉了。',
    retryFailedFailed: '无法重新排队失败的月份',
    streamSeparator: '、',

    stream: {
      heart_rate: '心率',
      daily_summary: '每日概览',
      workouts: '运动记录',
      sleep: '睡眠',
      hrv: '心率变异性',
      wellness: '压力 / 血氧等',
    },
  },
  {
    title: 'Long-term archive and full history',
    intro: 'The archive covers "stop deleting from today on"; the backfill covers "go get what came before". Only with both is the local copy actually complete.',
    archiveTitle: 'Long-term archive',
    archiveBody: 'With this on, a successful sync no longer prunes history by the retention window. The database keeps growing; you can turn it off at any time, and turning it off tells you what the next sync would prune.',
    archiveAria: 'Long-term archive',
    startLabel: 'Backfill from',
    startAria: 'History backfill start',
    customDateLabel: 'Start date',
    customDateAria: 'Backfill start date',
    estimateTitle: 'Estimated growth',
    estimateRate: (days: number, perDay: string) => `${days} days of local samples · about ${perDay}/day`,
    unmeasured: (streams: string) =>
      `Not enough local samples to estimate: ${streams}. These are left out of the total above — better to say we do not know than to invent a rate and multiply it by years.`,
    wouldBeCleanedUp: (requested: number, retention: number) =>
      `This backfill would fetch ${requested} days of history, but this machine only keeps the last ${retention} days — what comes back would be deleted at the next successful sync. Turn on the long-term archive first, or raise the retention window.`,
    backfilling: 'Backfilling…',
    continueBackfill: 'Continue backfilling',
    startBackfill: 'Start backfilling',
    autoContinue: 'Run to completion',
    autoContinueHint: 'Each round starts the next one automatically until the whole range is backfilled. Stop whenever you like — nothing already fetched is lost.',
    stopBackfill: 'Stop',
    stopping: 'Stopping…',
    roundProgress: (done: number, total: number) =>
      `Backfilling: ${done} of ${total} monthly chunks done. You can stop at any time.`,
    stoppedByUser: (remaining: number) =>
      `Stopped with ${remaining} monthly chunks left. Everything already fetched is kept — press "Continue backfilling" to carry on.`,
    stalled: (remaining: number) =>
      `${remaining} monthly chunks remain, but this round moved none of them, so it stopped. They are most likely failing repeatedly — see the failed list below, or press "Retry failed items".`,
    resetLedger: 'Clear the ledger',
    ledgerTitle: 'Coverage ledger',
    ledgerProgress: (done: number, total: number) => `${done} of ${total} monthly chunks resolved`,
    ledgerFrom: (from: string) => ` · requested from ${from}`,
    ledgerComplete: 'Every monthly chunk in the ledger is resolved: either written locally, or the cloud said plainly it has nothing for that period.',
    ledgerIncomplete: (remaining: number) =>
      `${remaining} chunks are still unresolved. Until they are all done, this local copy is a copy of the successfully synced range — not a complete one.`,
    ledgerStats: (persisted: number, empty: number, pending: number) =>
      `${persisted} written · ${empty} empty from the cloud · ${pending} to do`,
    ledgerFailed: (failed: number) => `${failed} failed`,
    ledgerRange: (from: string, to: string, records: number) => `${from} ~ ${to} · ${records} records`,
    ledgerNothingWritten: 'No month written yet',

    range1y: 'Last 1 year',
    range2y: 'Last 2 years',
    range3y: 'Last 3 years',
    rangeAll: (years: number) => `All available history (up to ${years} years)`,
    rangeCustom: 'Custom start',

    confirmDisableArchive: 'With the long-term archive off, the next successful sync prunes older data by the retention window, and that cannot be undone.\nIf you just backfilled history, take a database snapshot first.\nTurn it off?',
    archiveEnabled: 'Long-term archive on: successful syncs no longer prune history.',
    archiveDisabled: 'Long-term archive off: the next successful sync prunes by the retention window.',
    archiveSaveFailed: 'Could not save the archive setting',
    pickStartFirst: 'Choose where the backfill starts first.',
    outOfRetention: 'This backfill reaches past the local retention window, so what comes back would be pruned at the next successful sync. Turn on the long-term archive first, or raise the retention window.',
    roundDone: (remaining: number) =>
      `This round is done; ${remaining} monthly chunks remain. Press "Continue backfilling" to carry on — you can stop whenever you like.`,
    allChunksDone: 'Every monthly chunk in the ledger is resolved.',
    backfillFailed: 'The history backfill failed',
    confirmResetLedger: 'This clears the coverage ledger only. Nothing already written locally is deleted, and you can plan a new backfill afterwards. Continue?',
    ledgerReset: 'The ledger is cleared. You can plan a new backfill range.',
    ledgerResetFailed: 'Could not clear the ledger',
    failedTitle: 'Months that could not be fetched',
    failedIntro: 'These chunks failed. Every other month was unaffected and has been backfilled as usual.',
    failedRow: (stream: string, month: string) => `${stream} · ${month}`,
    failedAttempts: (attempts: number) => `${attempts} attempt${attempts === 1 ? '' : 's'}`,
    failedExhausted: 'Automatic retries are used up. Use "Retry failed months" to try again',
    failedNoReason: 'No reason recorded',
    retryFailed: 'Retry failed months',
    retryFailedDone: 'The failed months are queued again. You can continue the backfill.',
    retryFailedFailed: 'Could not re-queue the failed months',
    streamSeparator: ', ',

    stream: {
      heart_rate: 'Heart rate',
      daily_summary: 'Daily summaries',
      workouts: 'Workouts',
      sleep: 'Sleep',
      hrv: 'Heart rate variability',
      wellness: 'Stress / SpO2 and similar',
    },
  },
);
const t = useMessages(messages);

/* 流名和数据健康页、同步进度共用一份：各写各的，同一条流会在三处叫三个名字。 */
const streamLabel = (stream: string): string => syncStreamLabel(stream);

const props = defineProps<{ prefs: UserPrefs | null }>();
const emit = defineEmits<{ (event: 'prefs-changed', prefs: UserPrefs): void }>();

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
    return date.toISOString().slice(0, 10);
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
const wouldBeCleanedUp = computed(() => Boolean(
  props.prefs
  && !props.prefs.archive_enabled
  && requestedDays.value > props.prefs.retention_days,
));

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

const loadEstimate = async () => {
  if (!isDesktop() || !requestedDays.value) return;
  try {
    estimate.value = await backend.getStorageEstimate(requestedDays.value);
  } catch {
    estimate.value = null;
  }
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
  if (!props.prefs) return;
  const next = !props.prefs.archive_enabled;
  if (!next && !window.confirm(t.value.confirmDisableArchive)) return;
  busy.value = true;
  error.value = null;
  message.value = null;
  try {
    const updated = await backend.setUserPrefs(
      props.prefs.retention_days,
      props.prefs.history_sync_days,
      next,
    );
    emit('prefs-changed', updated);
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

const stopBackfill = () => {
  stopRequested.value = true;
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
  busy.value = true;
  stopRequested.value = false;
  error.value = null;
  message.value = null;
  try {
    for (;;) {
      const before = remaining.value;
      ledger.value = await backend.startHistoryBackfill(fromDate.value);
      markDataChanged();

      if (remaining.value <= 0) {
        message.value = t.value.allChunksDone;
        break;
      }
      if (!autoContinue.value) {
        message.value = t.value.roundDone(remaining.value);
        break;
      }
      if (stopRequested.value) {
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
</script>

<template>
  <section class="settings-card" aria-labelledby="archive-title">
    <h2 id="archive-title">{{ t.title }}</h2>
    <p class="section-description">{{ t.intro }}</p>

    <div class="toggle-row archive-toggle">
      <div class="toggle-copy">
        <strong>{{ t.archiveTitle }}</strong>
        <span>{{ t.archiveBody }}</span>
      </div>
      <button
        class="switch"
        type="button"
        role="switch"
        :aria-label="t.archiveAria"
        :aria-checked="Boolean(prefs?.archive_enabled)"
        :disabled="busy || !prefs"
        @click="toggleArchive"
      ><span></span></button>
    </div>

    <div class="field-row">
      <span class="kv-label">{{ t.startLabel }}</span>
      <SelectMenu v-model="startChoice" :options="START_CHOICES" :aria-label="t.startAria" />
    </div>
    <div v-if="startChoice === 'custom'" class="field-row">
      <span class="kv-label">{{ t.customDateLabel }}</span>
      <input v-model="customFrom" type="date" :aria-label="t.customDateAria" />
    </div>

    <div v-if="estimate" class="estimate-block">
      <div class="estimate-head">
        <strong>{{ t.estimateTitle }}</strong>
        <span>{{ estimateText }}</span>
      </div>
      <div v-if="measuredStreams.length" class="estimate-list">
        <div v-for="item in measuredStreams" :key="item.stream" class="estimate-row">
          <span>{{ streamLabel(item.stream) }}</span>
          <span class="estimate-rate">
            {{ t.estimateRate(item.observed_days, formatBytes(item.bytes_per_day)) }}
          </span>
          <span class="estimate-total">+{{ formatBytes(item.estimated_add_bytes) }}</span>
        </div>
      </div>
      <p v-if="unmeasuredStreams.length" class="retain-note">
        {{ t.unmeasured(unmeasuredStreams.map((item) => streamLabel(item.stream)).join(t.streamSeparator)) }}
      </p>
    </div>

    <p v-if="estimate?.stop_reason" class="api-error" role="alert">{{ stopReasonText }}</p>

    <p v-if="wouldBeCleanedUp" class="api-error" role="alert">
      {{ t.wouldBeCleanedUp(requestedDays, prefs?.retention_days ?? 0) }}
    </p>

    <label class="auto-continue">
      <input v-model="autoContinue" type="checkbox" :disabled="busy" />
      <span>
        <strong>{{ t.autoContinue }}</strong>
        <em>{{ t.autoContinueHint }}</em>
      </span>
    </label>

    <div class="inline-actions">
      <button
        class="button primary"
        type="button"
        :disabled="busy || isSyncing || !fromDate || wouldBeCleanedUp || Boolean(estimate?.stop_reason)"
        @click="runBackfill"
      >{{ busy ? t.backfilling : (remaining > 0 ? t.continueBackfill : t.startBackfill) }}</button>
      <button
        v-if="busy && autoContinue"
        class="button secondary"
        type="button"
        :disabled="stopRequested"
        @click="stopBackfill"
      >{{ stopRequested ? t.stopping : t.stopBackfill }}</button>
      <button
        v-if="ledger?.failed_chunks_detail?.length"
        class="button secondary"
        type="button"
        :disabled="busy || isSyncing"
        @click="retryFailed"
      >{{ t.retryFailed }}</button>
      <button v-if="ledger?.total_chunks" class="button secondary" type="button" :disabled="busy" @click="resetLedger">
        {{ t.resetLedger }}
      </button>
    </div>

    <p v-if="error" class="api-error" role="alert">{{ error }}</p>
    <p v-else-if="message" class="hint-line ok" role="status">{{ message }}</p>

    <template v-if="ledger && ledger.total_chunks > 0">
      <div class="ledger-head">
        <strong>{{ t.ledgerTitle }}</strong>
        <span>
          {{ t.ledgerProgress(ledger.completed_chunks, ledger.total_chunks) }}
          <template v-if="ledger.requested_from">
            {{ t.ledgerFrom(ledger.requested_from.slice(0, 7)) }}
          </template>
        </span>
      </div>
      <p class="retain-note">
        <template v-if="ledger.complete">{{ t.ledgerComplete }}</template>
        <template v-else>{{ t.ledgerIncomplete(remaining) }}</template>
      </p>
      <div class="ledger-list">
        <div v-for="stream in ledger.streams" :key="stream.stream" class="ledger-row">
          <strong>{{ streamLabel(stream.stream) }}</strong>
          <span class="ledger-stats">
            {{ t.ledgerStats(stream.persisted_chunks, stream.empty_chunks, stream.pending_chunks) }}
            <template v-if="stream.failed_chunks"> · <em>{{ t.ledgerFailed(stream.failed_chunks) }}</em></template>
          </span>
          <span class="ledger-range">
            <template v-if="stream.persisted_from">
              {{ t.ledgerRange(stream.persisted_from.slice(0, 7), stream.persisted_to?.slice(0, 7) ?? '', stream.records) }}
            </template>
            <template v-else>{{ t.ledgerNothingWritten }}</template>
          </span>
        </div>
      </div>

      <!-- 哪个月、为什么。只显示到月，原因在后端已经脱敏。 -->
      <div v-if="ledger.failed_chunks_detail.length" class="failed-block">
        <strong>{{ t.failedTitle }}</strong>
        <p class="retain-note">{{ t.failedIntro }}</p>
        <ul class="failed-list">
          <li v-for="item in ledger.failed_chunks_detail" :key="`${item.stream}:${item.chunk_start}`">
            <span class="failed-where">{{ t.failedRow(streamLabel(item.stream), item.chunk_start.slice(0, 7)) }}</span>
            <span class="failed-why">{{ chunkErrorText(item) }}</span>
            <span class="failed-meta">
              {{ t.failedAttempts(item.attempts) }}
              <template v-if="item.exhausted"> · {{ t.failedExhausted }}</template>
            </span>
          </li>
        </ul>
      </div>
    </template>
  </section>
</template>

<style scoped>
.failed-block { margin-top: 12px; padding: 12px 14px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface-raised); }
.failed-list { margin: 8px 0 0; padding: 0; list-style: none; display: grid; gap: 8px; }
.failed-list li { display: grid; gap: 2px; }
.failed-where { color: var(--ink); font-size: 13px; font-weight: 600; }
.failed-why { color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
.failed-meta { color: var(--subtle); font-size: 11px; }
.estimate-block { margin-top: 10px; padding: 12px 14px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface-raised); }
.estimate-head { display: grid; gap: 3px; }
.estimate-head strong { color: var(--ink); font-size: 12px; font-weight: 500; }
.estimate-head span { color: var(--subtle); font-size: 11px; line-height: 1.55; }
.estimate-list { display: grid; gap: 3px; margin-top: 8px; }
.estimate-row { display: grid; grid-template-columns: minmax(0, 88px) minmax(0, 1fr) auto; gap: 10px; align-items: baseline; color: var(--subtle); font-size: 11px; }
.estimate-row > span:first-child { color: var(--ink); }
.estimate-total { color: var(--muted); font-variant-numeric: tabular-nums; }
.estimate-block .retain-note { margin: 8px 0 0; font-size: 11px; }

/* 与设置页共用的视觉基元。子组件拿不到父组件的 scoped 样式，
   所以这里按同一套 token 重述一遍，保证看起来是同一套东西。 */
h2 { margin: 0 0 14px; font-size: 15px; font-weight: 700; color: var(--ink); }
.settings-card { padding: 18px 20px; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface); min-width: 0; }
.section-description { margin: 0 0 var(--space-3); color: var(--muted); font-size: 12px; }
.toggle-row { display: flex; align-items: center; gap: 10px; min-height: 52px; padding: 8px 0; }
.toggle-copy { flex: 1; min-width: 0; display: grid; gap: 1px; }
.toggle-copy strong { font-size: 12px; color: var(--ink); }
.toggle-copy span { color: var(--subtle); font-size: 11px; line-height: 1.55; }
.switch { width: 42px; height: 24px; flex: 0 0 42px; padding: 2px; border: 1px solid var(--line-strong); border-radius: 999px; background: var(--surface-raised); cursor: pointer; }
.switch span { display: block; width: 18px; height: 18px; border-radius: 50%; background: var(--muted); transition: transform 150ms ease, background-color 150ms ease; }
.switch[aria-checked='true'] { border-color: var(--accent); background: var(--accent-soft); }
.switch[aria-checked='true'] span { transform: translateX(18px); background: var(--accent); }
.switch:disabled { opacity: .5; cursor: not-allowed; }
.field-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 44px; padding: 6px 0; }
.field-row input {
  min-height: 34px;
  min-width: 160px;
  padding: 5px 10px;
  border: 1px solid var(--line-strong);
  border-radius: 9px;
  background: var(--surface-raised);
  color: var(--ink);
  font-size: 12px;
}
.field-row .select-menu { min-width: 220px; flex: 0 0 auto; }
.kv-label { flex: 0 0 96px; color: var(--muted); font-size: 12px; }
.retain-note { margin: 6px 0 8px; color: var(--muted); font-size: 12px; line-height: 1.6; }
.inline-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
/* 「自动跑完」放在按钮正上方：它改变的正是下面那个按钮的行为。 */
.auto-continue { display: flex; gap: 8px; align-items: flex-start; margin-top: 14px; cursor: pointer; }
.auto-continue input { margin-top: 3px; flex: none; }
.auto-continue span { display: flex; flex-direction: column; gap: 2px; }
.auto-continue em { font-style: normal; font-size: 12px; opacity: .72; line-height: 1.5; }
.hint-line { display: inline-flex; align-items: center; gap: 6px; margin: 12px 0 0; color: var(--muted); font-size: 12px; }
.hint-line.ok { color: var(--accent); }
.api-error { margin: 12px 0 0; color: var(--danger); font-size: 12px; line-height: 1.55; }

.archive-toggle { margin: 10px 0; border-bottom: 0; }
.ledger-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; margin-top: 14px; }
.ledger-head strong { color: var(--ink); font-size: 12px; font-weight: 500; }
.ledger-head span { color: var(--muted); font-size: 11px; }
.ledger-list { display: grid; gap: 8px; margin-top: 8px; }
.ledger-row {
  display: grid;
  gap: 2px;
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
}
.ledger-row strong { color: var(--ink); font-size: 12px; font-weight: 500; }
.ledger-stats, .ledger-range { color: var(--subtle); font-size: 11px; }
.ledger-stats em { color: var(--danger); font-style: normal; }
</style>
