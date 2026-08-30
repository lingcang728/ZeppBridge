<script setup lang="ts">
/**
 * 数据健康中心。
 *
 * Zepp App 给你结果，这一页给你结果的来源、覆盖度和可信程度。
 *
 * 三条时间线在这里必须分开显示，谁也不冒充谁：什么时候连过云、什么时候用当前
 * 解析器重放过本地报文、手表上最新那条记录发生在什么时候。三个都答完，用户才
 * 知道自己看到的数据「新不新」到底是什么意思。
 *
 * 覆盖度按流的节奏解释：连续和日度流能说「缺了哪几天」，运动和 VO₂max 这种
 * 只能说「哪几天观察到了」。用一个统一的完整度百分比去衡量它们，必然把正常的
 * 稀疏画成故障。
 */
import { computed, onMounted, ref } from 'vue';
import Icon from '../components/Icon.vue';
import PageHeader from '../components/PageHeader.vue';
import SkeletonBlock from '../components/SkeletonBlock.vue';
import { useSyncController } from '../composables/useSyncController';
import { backend, isDesktop, toUserMessage } from '../lib/bridge';
import type { DataHealth, HealthAction, StageState, StreamHealth } from '../types';
import { defineMessages, intlLocale, useMessages } from '../i18n';

const messages = defineMessages(
  {
    window30: '最近 30 天',
    window90: '最近 90 天',
    window365: '最近一年',
    loadFailed: '读取数据健康状态失败',
    retry: '重试',
    noRecords: '尚无记录',
    timeUnknown: '时间未知',
    notProvided: '未提供',
    backToSettings: '返回设置',
    eyebrow: '数据健康',
    title: '数据健康检查',
    intro: '每条数据流从云端取回、被解析、写进本机这三步分别是什么状态，覆盖到哪些日期，来自哪个来源。缺就是缺，不用 0 补。',
    rangeAria: '覆盖范围',
    loadingAria: '正在读取数据健康状态',
    replayInProgress: '正在用新版解析器重放本地报文。这期间云端同步会主动让路并自动重试，不是失败。',

    timingsTitle: '三个不一样的「时间」',
    timingCloud: '上次从云端取回',
    timingCloudNote: '尚无结果',
    timingReplay: '上次本地重放',
    timingReplayNote: '用当前解析器重新解释本地报文，不触网，也不改写上面那个时间',
    timingManual: '上次手动重新解析',
    timingManualNote: '你亲手点过的那一次',
    timingNewest: '最新一条健康样本',
    timingNewestNote: '手表上这条记录本身发生的时间',

    dbTitle: '本机数据库',
    dbSize: '库体积',
    dbRaw: '原始报文',
    dbCanonical: '标准化记录',
    dbPending: '待归一化',
    dbSchema: 'schema 版本',
    dbNormalizer: '解析器修订',
    integrityPassed: '通过',
    integrityFailed: (detail: string) => `未通过（${detail}）`,
    integrityDetailBelow: '详情见下',
    integrityLine: (verdict: string, checkedAt: string) => `完整性检查：${verdict} · ${checkedAt}`,
    integrityNeverRun: '还没跑过完整性检查。它会扫描整个库，大库需要一点时间，所以只在你主动点击时执行。',

    streamsTitle: '每条数据流走到哪一步',
    streamsNote: '取回、解析、写入是三件能各自失败的事。把它们折叠成一个红点，你就没法知道该重试、该重新连接，还是这个账号本来就没有这条流。',
    stageFetch: '取回',
    stageParse: '解析',
    stageWrite: '写入',
    stageLine: (stage: string, state: string) => `${stage}：${state}`,
    factRaw: '原始报文',
    factCanonical: '标准化记录',
    factSources: '来源',
    factObservedDays: '观察到的日期',
    days: (count: number) => `${count} 天`,
    gapExamples: (dates: string) => `缺口示例：${dates}`,
    gapMore: ' 等',
    period: '。',
    latestObserved: (date: string) => `最近一次 ${date}。`,
    noRecordsYet: '暂无记录',
    sourceSeparator: '、',

    occasionalTitle: '偶尔才给的指标',
    occasionalNote: 'VO₂max、乳酸阈值这类指标手表本来就不是天天给。这里只报告观察到的日期和最近一次，不按天算缺口——把正常的稀疏画成红色才是误导。',
    occasionalLine: (records: string, days: number) => `${records} 条 · 观察到 ${days} 天`,
    occasionalLatest: (date: string) => `最近一次 ${date}`,
    occasionalNone: '这段范围内没有观察到',

    actionsTitle: '可以做点什么',
    actionRunning: '执行中…',
    actionRun: '执行',
    confirmDestructive: (label: string, reason: string) => `${label}：${reason}\n确定继续吗？`,
    actionSynced: '同步已执行，状态已刷新。',
    actionReplayed: (count: string) => `已用当前解析器重放本地报文（${count} 条派生记录）。云端同步时间没有被改写。`,
    actionIntegrityOk: '数据库完整性检查通过。',
    actionIntegrityFailed: (detail: string) => `数据库完整性检查未通过：${detail}`,
    actionIntegrityFallback: '请备份数据文件夹后重新同步',
    actionFolderOpened: '已打开数据文件夹。',
    actionReconnect: '请到设置页重新连接 Zepp 账号。',
    actionFailed: (label: string) => `${label}失败`,

    cadence: {
      continuous: '一天多次',
      daily: '一天一条',
      nightly: '一夜一条',
      per_event: '发生了才有',
      occasional: '偶尔才给',
    },
    stage: { ok: '正常', failed: '失败', never: '尚未发生' },
    errorKind: {
      network: '没连上云端',
      auth: '需要重新连接账号',
      not_available: '这个账号没有这条流',
      unrecognized_payload: '拿到了报文但没看懂',
      storage: '写本地库失败',
      busy: '另一个操作正在写库，这次让开了',
      cancelled: '被取消',
      unknown: '未分类的失败',
    },
    source: {
      device: '单设备',
      user_fused: '用户融合',
      unknown: '来源未知',
    },
  },
  {
    window30: 'Last 30 days',
    window90: 'Last 90 days',
    window365: 'Last year',
    loadFailed: 'Could not read the data health status',
    retry: 'Try again',
    noRecords: 'No records yet',
    timeUnknown: 'Time unknown',
    notProvided: 'Not provided',
    backToSettings: 'Back to settings',
    eyebrow: 'Data health',
    title: 'Data health check',
    intro: 'For each data stream: how far it got through fetching from the cloud, parsing, and writing locally; which dates it covers; and where it came from. Missing is missing — never padded with a zero.',
    rangeAria: 'Coverage window',
    loadingAria: 'Reading the data health status',
    replayInProgress: 'Replaying local payloads through the new parser. Cloud syncs step aside and retry themselves during this; that is not a failure.',

    timingsTitle: 'Three different "last times"',
    timingCloud: 'Last fetched from the cloud',
    timingCloudNote: 'No result yet',
    timingReplay: 'Last local replay',
    timingReplayNote: 'Re-reads local payloads with the current parser. No network, and it does not rewrite the time above.',
    timingManual: 'Last manual reprocess',
    timingManualNote: 'The one you clicked yourself',
    timingNewest: 'Newest health sample',
    timingNewestNote: 'When the record itself happened on the watch',

    dbTitle: 'Local database',
    dbSize: 'File size',
    dbRaw: 'Raw payloads',
    dbCanonical: 'Normalized records',
    dbPending: 'Pending normalization',
    dbSchema: 'Schema version',
    dbNormalizer: 'Parser revision',
    integrityPassed: 'passed',
    integrityFailed: (detail: string) => `failed (${detail})`,
    integrityDetailBelow: 'details below',
    integrityLine: (verdict: string, checkedAt: string) => `Integrity check: ${verdict} · ${checkedAt}`,
    integrityNeverRun: 'No integrity check has been run. It scans the whole database, which takes a while on a large one, so it only runs when you ask for it.',

    streamsTitle: 'How far each stream got',
    streamsNote: 'Fetching, parsing and writing are three things that fail separately. Collapsed into one red dot, you could not tell whether to retry, to reconnect, or whether this account simply has no such stream.',
    stageFetch: 'Fetch',
    stageParse: 'Parse',
    stageWrite: 'Write',
    stageLine: (stage: string, state: string) => `${stage}: ${state}`,
    factRaw: 'Raw payloads',
    factCanonical: 'Normalized records',
    factSources: 'Sources',
    factObservedDays: 'Days observed',
    days: (count: number) => `${count} days`,
    gapExamples: (dates: string) => `Gaps include: ${dates}`,
    gapMore: ' and more',
    period: '.',
    latestObserved: (date: string) => `Most recent ${date}.`,
    noRecordsYet: 'No records yet',
    sourceSeparator: ', ',

    occasionalTitle: 'Metrics that only turn up occasionally',
    occasionalNote: 'Metrics like VO₂max and lactate threshold are not reported daily by design. This section reports the days observed and the most recent one, and never counts daily gaps — painting normal sparseness red would be the misleading thing to do.',
    occasionalLine: (records: string, days: number) => `${records} records · observed on ${days} days`,
    occasionalLatest: (date: string) => `most recent ${date}`,
    occasionalNone: 'Nothing observed in this range',

    actionsTitle: 'What you can do',
    actionRunning: 'Running…',
    actionRun: 'Run',
    confirmDestructive: (label: string, reason: string) => `${label}: ${reason}\nContinue?`,
    actionSynced: 'Sync ran and the status was refreshed.',
    actionReplayed: (count: string) => `Local payloads replayed with the current parser (${count} derived records). The cloud sync time was not rewritten.`,
    actionIntegrityOk: 'The database passed its integrity check.',
    actionIntegrityFailed: (detail: string) => `The database failed its integrity check: ${detail}`,
    actionIntegrityFallback: 'Back up the data folder and sync again',
    actionFolderOpened: 'Data folder opened.',
    actionReconnect: 'Go to Settings and connect the Zepp account again.',
    actionFailed: (label: string) => `${label} failed`,

    cadence: {
      continuous: 'many times a day',
      daily: 'once a day',
      nightly: 'once a night',
      per_event: 'only when it happens',
      occasional: 'only occasionally',
    },
    stage: { ok: 'OK', failed: 'failed', never: 'never happened' },
    errorKind: {
      network: 'could not reach the cloud',
      auth: 'the account needs reconnecting',
      not_available: 'this account has no such stream',
      unrecognized_payload: 'a payload arrived but could not be read',
      storage: 'writing to the local database failed',
      busy: 'another operation was writing, so this one stood aside',
      cancelled: 'cancelled',
      unknown: 'unclassified failure',
    },
    source: {
      device: 'single device',
      user_fused: 'user-fused',
      unknown: 'source unknown',
    },
  },
);
const t = useMessages(messages);

const lookup = (table: unknown, key: string): string | undefined =>
  (table as Record<string, string | undefined>)[key];

const { runSync, isSyncing, markDataChanged } = useSyncController();

const health = ref<DataHealth | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const busyAction = ref<string | null>(null);
const actionMessage = ref<string | null>(null);
const actionError = ref<string | null>(null);
const windowDays = ref(90);

const WINDOWS = computed(() => [
  { days: 30, label: t.value.window30 },
  { days: 90, label: t.value.window90 },
  { days: 365, label: t.value.window365 },
]);

const load = async () => {
  loading.value = true;
  error.value = null;
  try {
    health.value = await backend.getDataHealth(windowDays.value);
  } catch (cause) {
    error.value = toUserMessage(cause, t.value.loadFailed);
  } finally {
    loading.value = false;
  }
};

const setWindow = async (days: number) => {
  windowDays.value = days;
  await load();
};

const formatDateTime = (value?: string | null): string => {
  if (!value) return t.value.noRecords;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t.value.timeUnknown;
  return new Intl.DateTimeFormat(intlLocale(), {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date).replace(/\//g, '-');
};

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return t.value.notProvided;
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${Math.round(bytes / 1_048_576)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
};

const cadenceLabel = (cadence: string): string => lookup(t.value.cadence, cadence) ?? cadence;

const stageText = (stage: StageState): string => {
  if (stage.state === 'failed') {
    return lookup(t.value.errorKind, stage.error_kind || 'unknown') ?? t.value.stage.failed;
  }
  return lookup(t.value.stage, stage.state) ?? stage.state;
};

const sourceLabel = (source: string): string => lookup(t.value.source, source) ?? source;

/** 来源未知的数据不静默并进设备数据里；这里如实分开列。 */
const sourceSummary = (stream: StreamHealth): string => {
  if (!stream.sources.length) return t.value.noRecordsYet;
  return stream.sources
    .map((entry) => `${sourceLabel(entry.source)} ${entry.records}`)
    .join(' · ');
};

const runAction = async (action: HealthAction) => {
  if (action.destructive && !window.confirm(t.value.confirmDestructive(action.label, action.reason))) return;
  busyAction.value = action.id;
  actionError.value = null;
  actionMessage.value = null;
  try {
    if (action.id === 'sync') {
      await runSync('incremental');
      actionMessage.value = t.value.actionSynced;
    } else if (action.id === 'reprocess') {
      const result = await backend.reprocessLocalData();
      actionMessage.value = t.value.actionReplayed(result.total_records.toLocaleString(intlLocale()));
      markDataChanged();
    } else if (action.id === 'integrity_check') {
      const result = await backend.runDatabaseIntegrityCheck();
      actionMessage.value = result.ok
        ? t.value.actionIntegrityOk
        : t.value.actionIntegrityFailed(result.detail || t.value.actionIntegrityFallback);
    } else if (action.id === 'open_data_folder') {
      await backend.openDataFolder();
      actionMessage.value = t.value.actionFolderOpened;
    } else if (action.id === 'reauth') {
      window.location.hash = '';
      actionMessage.value = t.value.actionReconnect;
    }
    await load();
  } catch (cause) {
    actionError.value = toUserMessage(cause, t.value.actionFailed(action.label));
  } finally {
    busyAction.value = null;
  }
};

const integrity = computed(() => health.value?.database.last_integrity_check ?? null);
const allStreams = computed(() => health.value?.streams ?? []);
const occasional = computed(() => health.value?.occasional_metrics ?? []);

onMounted(() => void load());
</script>

<template>
  <section class="page health-page" aria-labelledby="health-title">
    <PageHeader
      back="/settings"
      :back-label="t.backToSettings"
      title-id="health-title"
      :eyebrow="t.eyebrow"
      :title="t.title"
      :intro="t.intro"
    >
      <div class="range-switch" role="radiogroup" :aria-label="t.rangeAria">
        <button
          v-for="range in WINDOWS"
          :key="range.days"
          type="button"
          role="radio"
          :aria-checked="windowDays === range.days"
          :class="['range-pill', { 'is-on': windowDays === range.days }]"
          @click="setWindow(range.days)"
        >{{ range.label }}</button>
      </div>
    </PageHeader>

    <div v-if="error" class="inline-alert" role="alert">
      <Icon name="warning" :size="14" />{{ error }}
      <button v-if="isDesktop()" class="button button-secondary retry" type="button" @click="load">{{ t.retry }}</button>
    </div>

    <div v-if="loading" class="health-grid" aria-live="polite" :aria-label="t.loadingAria">
      <SkeletonBlock v-for="index in 4" :key="index" height="180px" />
    </div>

    <template v-else-if="health">
      <div v-if="health.database.replay_in_progress" class="inline-alert neutral" role="status">
        <Icon name="info" :size="14" />
        {{ t.replayInProgress }}
      </div>

      <!-- 三条互不冒充的时间线 -->
      <section class="health-card" aria-labelledby="timings-title">
        <h2 id="timings-title">{{ t.timingsTitle }}</h2>
        <div class="timing-grid">
          <div>
            <span class="timing-label">{{ t.timingCloud }}</span>
            <strong>{{ formatDateTime(health.timings.last_cloud_sync_at) }}</strong>
            <span class="timing-note">{{ health.timings.last_cloud_sync_outcome || t.timingCloudNote }}</span>
          </div>
          <div>
            <span class="timing-label">{{ t.timingReplay }}</span>
            <strong>{{ formatDateTime(health.timings.last_local_replay_at) }}</strong>
            <span class="timing-note">{{ t.timingReplayNote }}</span>
          </div>
          <div>
            <span class="timing-label">{{ t.timingManual }}</span>
            <strong>{{ formatDateTime(health.timings.last_manual_reprocess_at) }}</strong>
            <span class="timing-note">{{ t.timingManualNote }}</span>
          </div>
          <div>
            <span class="timing-label">{{ t.timingNewest }}</span>
            <strong>{{ formatDateTime(health.timings.newest_sample_at) }}</strong>
            <span class="timing-note">{{ t.timingNewestNote }}</span>
          </div>
        </div>
      </section>

      <!-- 数据库 -->
      <section class="health-card" aria-labelledby="db-title">
        <h2 id="db-title">{{ t.dbTitle }}</h2>
        <div class="fact-grid">
          <div><span>{{ t.dbSize }}</span><strong>{{ formatBytes(health.database.database_bytes) }}</strong></div>
          <div><span>{{ t.dbRaw }}</span><strong>{{ health.database.raw_records.toLocaleString(intlLocale()) }}</strong></div>
          <div><span>{{ t.dbCanonical }}</span><strong>{{ health.database.canonical_records.toLocaleString(intlLocale()) }}</strong></div>
          <div>
            <span>{{ t.dbPending }}</span>
            <strong :class="{ warn: health.database.pending_normalization > 0 }">
              {{ health.database.pending_normalization.toLocaleString(intlLocale()) }}
            </strong>
          </div>
          <div><span>{{ t.dbSchema }}</span><strong>{{ health.database.schema_version }}</strong></div>
          <div><span>{{ t.dbNormalizer }}</span><strong class="mono">{{ health.database.normalizer_revision }}</strong></div>
        </div>
        <p class="health-note">
          <template v-if="integrity">
            {{ t.integrityLine(
              integrity.ok ? t.integrityPassed : t.integrityFailed(integrity.detail || t.integrityDetailBelow),
              formatDateTime(integrity.checked_at),
            ) }}
          </template>
          <template v-else>{{ t.integrityNeverRun }}</template>
        </p>
      </section>

      <!-- 逐流三阶段 -->
      <section class="health-card" aria-labelledby="streams-title">
        <h2 id="streams-title">{{ t.streamsTitle }}</h2>
        <p class="health-note">{{ t.streamsNote }}</p>
        <div class="stream-list">
          <article v-for="stream in allStreams" :key="stream.stream" class="stream-row">
            <header>
              <strong>{{ stream.label }}</strong>
              <span class="cadence">{{ cadenceLabel(stream.cadence) }}</span>
            </header>
            <div class="stages">
              <span v-for="stage in [[t.stageFetch, stream.fetch], [t.stageParse, stream.parse], [t.stageWrite, stream.write]] as const"
                    :key="stage[0]"
                    :class="['stage', stage[1].state]">
                <i aria-hidden="true"></i>{{ t.stageLine(stage[0], stageText(stage[1])) }}
              </span>
            </div>
            <p v-if="stream.parse.message || stream.fetch.message" class="stream-message">
              {{ stream.fetch.message || stream.parse.message }}
            </p>
            <dl class="stream-facts">
              <div><dt>{{ t.factRaw }}</dt><dd>{{ stream.raw_records.toLocaleString(intlLocale()) }}</dd></div>
              <div><dt>{{ t.factCanonical }}</dt><dd>{{ stream.canonical_records.toLocaleString(intlLocale()) }}</dd></div>
              <div><dt>{{ t.factSources }}</dt><dd>{{ sourceSummary(stream) }}</dd></div>
              <div><dt>{{ t.factObservedDays }}</dt><dd>{{ t.days(stream.coverage.observed_days) }}</dd></div>
            </dl>
            <p class="coverage-note">
              {{ stream.coverage.note }}
              <template v-if="stream.coverage.gap_dates.length">
                {{ t.gapExamples(stream.coverage.gap_dates.join(t.sourceSeparator)) }}<template v-if="stream.coverage.gap_total > stream.coverage.gap_dates.length">{{ t.gapMore }}</template>{{ t.period }}
              </template>
              <template v-if="stream.coverage.latest_observed_at">
                {{ t.latestObserved(stream.coverage.latest_observed_at) }}
              </template>
            </p>
          </article>
        </div>
      </section>

      <!-- 偶发指标 -->
      <section v-if="occasional.length" class="health-card" aria-labelledby="occasional-title">
        <h2 id="occasional-title">{{ t.occasionalTitle }}</h2>
        <p class="health-note">{{ t.occasionalNote }}</p>
        <div class="occasional-list">
          <div v-for="metric in occasional" :key="metric.stream" class="occasional-row">
            <strong>{{ metric.label }}</strong>
            <span>{{ t.occasionalLine(metric.canonical_records.toLocaleString(intlLocale()), metric.coverage.observed_days) }}</span>
            <span class="muted">
              {{ metric.coverage.latest_observed_at ? t.occasionalLatest(metric.coverage.latest_observed_at) : t.occasionalNone }}
            </span>
          </div>
        </div>
      </section>

      <!-- 可执行动作 -->
      <section class="health-card" aria-labelledby="actions-title">
        <h2 id="actions-title">{{ t.actionsTitle }}</h2>
        <div class="action-list">
          <div v-for="action in health.actions" :key="action.id" class="action-row">
            <div>
              <strong>{{ action.label }}</strong>
              <span>{{ action.reason }}</span>
            </div>
            <button
              class="button secondary"
              type="button"
              :disabled="Boolean(busyAction) || (action.id === 'sync' && isSyncing)"
              @click="runAction(action)"
            >{{ busyAction === action.id ? t.actionRunning : t.actionRun }}</button>
          </div>
        </div>
        <p v-if="actionError" class="inline-alert" role="alert"><Icon name="warning" :size="14" />{{ actionError }}</p>
        <p v-else-if="actionMessage" class="health-note ok" role="status">{{ actionMessage }}</p>
      </section>
    </template>
  </section>
</template>

<style scoped>
.health-page { display: grid; gap: 16px; }
.health-grid { display: grid; gap: 14px; }

.health-card {
  display: grid;
  gap: 10px;
  padding: 18px 20px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--surface);
}
.health-card h2 { margin: 0; color: var(--ink); font-size: 14px; font-weight: 500; }
.health-note { margin: 0; color: var(--subtle); font-size: 11px; line-height: 1.6; }
.health-note.ok { color: var(--accent); }

.timing-grid, .fact-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
.timing-grid > div { display: grid; gap: 2px; }
.timing-label { color: var(--muted); font-size: 11px; }
.timing-grid strong { color: var(--ink); font-size: 13px; font-weight: 500; }
.timing-note { color: var(--subtle); font-size: 11px; line-height: 1.5; }

.fact-grid > div { display: grid; gap: 2px; }
.fact-grid span { color: var(--muted); font-size: 11px; }
.fact-grid strong { color: var(--ink); font-size: 15px; font-weight: 500; }
.fact-grid strong.warn { color: var(--warning, var(--accent)); }
.fact-grid strong.mono { font-family: var(--font-mono); font-size: 11px; word-break: break-all; }

.stream-list, .occasional-list, .action-list { display: grid; gap: 10px; }
.stream-row {
  display: grid;
  gap: 8px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface-raised);
}
.stream-row header { display: flex; align-items: baseline; gap: 8px; }
.stream-row header strong { color: var(--ink); font-size: 13px; font-weight: 500; }
.cadence { color: var(--muted); font-size: 11px; }

.stages { display: flex; flex-wrap: wrap; gap: 8px; }
.stage { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: 11px; }
.stage i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.stage.ok { color: var(--accent); }
.stage.failed { color: var(--danger); }

.stream-message { margin: 0; color: var(--danger); font-size: 11px; line-height: 1.5; }
.stream-facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; margin: 0; }
.stream-facts div { display: grid; gap: 1px; }
.stream-facts dt { color: var(--muted); font-size: 11px; }
.stream-facts dd { margin: 0; color: var(--ink); font-size: 12px; }
.coverage-note { margin: 0; color: var(--subtle); font-size: 11px; line-height: 1.6; }

.occasional-row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 10px; align-items: baseline; padding: 8px 0; border-bottom: 1px solid var(--line); }
.occasional-row:last-child { border-bottom: 0; }
.occasional-row strong { color: var(--ink); font-size: 12px; font-weight: 500; }
.occasional-row span { color: var(--subtle); font-size: 11px; }
.occasional-row .muted { color: var(--muted); }

.action-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--line); }
.action-row:last-child { border-bottom: 0; }
.action-row div { display: grid; gap: 2px; }
.action-row strong { color: var(--ink); font-size: 12px; font-weight: 500; }
.action-row span { color: var(--subtle); font-size: 11px; line-height: 1.5; }

.inline-alert.neutral { color: var(--muted); }
</style>
