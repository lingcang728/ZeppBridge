<script setup lang="ts">
import { displayDateTimeFormatter } from '../lib/dateTime';
import { useFirstLoad } from '../composables/useFirstLoad';

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
import { useRouter } from 'vue-router';
import Icon from '../components/Icon.vue';
import PageHeader from '../components/PageHeader.vue';
import SegmentTrack from '../components/SegmentTrack.vue';
import SkeletonBlock from '../components/SkeletonBlock.vue';
import { syncOutcomeLabel, useSyncController } from '../composables/useSyncController';
import { backend, isDesktop, toUserMessage } from '../lib/bridge';
import { createLoadSeq } from '../lib/loadSeq';
import { formatBytes } from '../lib/format';
import type { DataHealth, HealthAction, StageState, StreamHealth } from '../types';
import { syncStreamLabel } from '../lib/syncStreams';
import { intlLocale, useMessages } from '../i18n';
import { backendText } from '../i18n/backendText';
import { healthCheckMessages as messages } from './HealthCheck.i18n';

const t = useMessages(messages);

const lookup = (table: unknown, key: string): string | undefined =>
  (table as Record<string, string | undefined>)[key];

const { runSync, isSyncing, markDataChanged, syncState, syncMessage } = useSyncController();
const router = useRouter();
const loadSeq = createLoadSeq();

const health = ref<DataHealth | null>(null);
const loading = ref(true);
const initialLoading = useFirstLoad(loading);
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
  const seq = loadSeq.next();
  loading.value = true;
  error.value = null;
  try {
    const next = await backend.getDataHealth(windowDays.value);
    if (!loadSeq.isCurrent(seq)) return;
    health.value = next;
  } catch (cause) {
    if (!loadSeq.isCurrent(seq)) return;
    error.value = toUserMessage(cause, t.value.loadFailed);
  } finally {
    if (loadSeq.isCurrent(seq)) loading.value = false;
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
  return displayDateTimeFormatter({
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date).replace(/\//g, '-');
};

const cadenceLabel = (cadence: string): string => lookup(t.value.cadence, cadence) ?? cadence;

/* 覆盖说明和动作文案都由界面按码组合，不用后端那份中文。 */
const coverageNote = (stream: StreamHealth): string => {
  const { coverage } = stream;
  if (coverage.kind !== 'gaps') {
    return stream.cadence === 'per_event' ? t.value.coveragePerEvent : t.value.coverageOccasional;
  }
  if (coverage.observed_days === 0) return t.value.coverageNoData;
  if (coverage.gap_total === 0) return t.value.coverageNoGaps;
  return t.value.coverageGaps(coverage.gap_total);
};

const actionCopy = (action: HealthAction): { label: string; reason: string } => {
  const known = (t.value.action as Record<string, { label: string; reason: string } | undefined>)[
    action.code ?? ''
  ];
  // 后端认识但界面还没有的动作：原样显示后端那份，总比空着强。
  if (!known) return { label: action.label, reason: action.reason };
  const reason = action.code === 'reprocess'
    ? t.value.reprocessReason(health.value?.database.pending_normalization ?? 0)
    : known.reason;
  return { label: known.label, reason };
};

/* 只有当失败类别是我们不认识的，后端那句原文才有价值；否则它是冗余的中文。 */
const unknownStageDetail = (stream: StreamHealth): string => {
  for (const stage of [stream.fetch, stream.parse]) {
    if (stage.state !== 'failed' || !stage.message) continue;
    const known = lookup(t.value.errorKind, stage.error_kind || 'unknown');
    if (!known) return backendText(stage.message, '');
  }
  return '';
};

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
  const copy = actionCopy(action);
  if (action.destructive && !window.confirm(t.value.confirmDestructive(copy.label, copy.reason))) return;
  busyAction.value = action.id;
  actionError.value = null;
  actionMessage.value = null;
  try {
    if (action.id === 'sync') {
      const report = await runSync('incremental');
      const failed = !report
        || report.outcome === 'failed'
        || report.outcome === 'cancelled'
        || syncState.value === 'failed'
        || syncState.value === 'cancelled';
      if (failed) {
        actionError.value = syncMessage.value || t.value.actionFailed(copy.label);
      } else {
        actionMessage.value = t.value.actionSynced;
      }
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
      await router.push('/settings/account');
      actionMessage.value = t.value.actionReconnect;
      return;
    }
    await load();
  } catch (cause) {
    actionError.value = toUserMessage(cause, t.value.actionFailed(actionCopy(action).label));
  } finally {
    busyAction.value = null;
  }
};

const integrity = computed(() => health.value?.database.last_integrity_check ?? null);
const allStreams = computed(() => health.value?.streams ?? []);
const occasional = computed(() => health.value?.occasional_metrics ?? []);

/* 首屏一张总结卡：几条数据流正常、几条要处理；细节五块在下面逐块摊开。 */
const streamOk = (stream: StreamHealth) => [stream.fetch, stream.parse, stream.write].every((stage) => stage.state === 'ok');
const streamFailed = (stream: StreamHealth) => [stream.fetch, stream.parse, stream.write].some((stage) => stage.state === 'failed');
const summary = computed(() => {
  const streams = allStreams.value;
  const ok = streams.filter(streamOk).length;
  const failed = streams.filter(streamFailed).length;
  return { ok, total: streams.length, failed, pending: streams.length - ok - failed };
});

onMounted(() => void load());
</script>

<template>
  <section class="page health-page" aria-labelledby="health-title">
    <PageHeader
      title-id="health-title"
      :title="t.title"
      :intro="t.intro"
    >
      <SegmentTrack
        :items="WINDOWS.map((range) => ({ value: range.days, label: range.label }))"
        :model-value="windowDays"
        :aria-label="t.rangeAria"
        @update:model-value="(value) => setWindow(Number(value))"
      />
    </PageHeader>

    <div v-if="error" class="inline-alert" role="alert">
      <Icon name="warning" :size="14" />{{ error }}
      <button v-if="isDesktop()" class="button button-secondary retry" type="button" @click="load">{{ t.retry }}</button>
    </div>

    <div v-if="initialLoading" class="health-grid" aria-live="polite" :aria-label="t.loadingAria">
      <SkeletonBlock v-for="index in 4" :key="index" height="180px" />
    </div>

    <template v-else-if="health">
      <div v-if="health.database.replay_in_progress" class="inline-alert neutral" role="status">
        <Icon name="info" :size="14" />
        {{ t.replayInProgress }}
      </div>

      <section class="health-card summary-card" aria-labelledby="summary-title">
        <div class="summary-main">
          <span :class="['summary-dot', summary.failed ? 'bad' : summary.pending ? 'warn' : 'ok']" aria-hidden="true"></span>
          <div>
            <h2 id="summary-title">{{ t.summaryStreams(summary.ok, summary.total) }}</h2>
            <p class="health-note">{{ summary.failed ? t.summaryFailed(summary.failed) : summary.pending ? t.summaryPending(summary.pending) : t.summaryAllGood }}</p>
          </div>
        </div>
      </section>

      <!-- 逐流三阶段 -->
      <section class="health-card" aria-labelledby="streams-title">
        <h2 id="streams-title">{{ t.streamsTitle }}</h2>
        <p class="health-note">{{ t.streamsNote }}</p>
        <div class="stream-list">
          <article v-for="stream in allStreams" :key="stream.stream" class="stream-row">
            <header>
              <strong>{{ syncStreamLabel(stream.stream, stream.label) }}</strong>
              <span class="cadence">{{ cadenceLabel(stream.cadence) }}</span>
            </header>
            <div class="stages">
              <span v-for="stage in [[t.stageFetch, stream.fetch], [t.stageParse, stream.parse], [t.stageWrite, stream.write]] as const"
                    :key="stage[0]"
                    :class="['stage', stage[1].state]">
                <i aria-hidden="true"></i>{{ t.stageLine(stage[0], stageText(stage[1])) }}
              </span>
            </div>
            <!-- `error_kind` 是稳定码，上面那行已经按界面语言显示过了。
                 后端的 `message` 是中文原文，只有在类别都认不出来时才拿它兜底，
                 否则英文界面会在这里冒出一段中文。 -->
            <p v-if="unknownStageDetail(stream)" class="stream-message">
              {{ unknownStageDetail(stream) }}
            </p>
            <dl class="stream-facts">
              <div><dt>{{ t.factRaw }}</dt><dd>{{ stream.raw_records.toLocaleString(intlLocale()) }}</dd></div>
              <div><dt>{{ t.factCanonical }}</dt><dd>{{ stream.canonical_records.toLocaleString(intlLocale()) }}</dd></div>
              <div><dt>{{ t.factSources }}</dt><dd>{{ sourceSummary(stream) }}</dd></div>
              <div><dt>{{ t.factObservedDays }}</dt><dd>{{ t.days(stream.coverage.observed_days) }}</dd></div>
            </dl>
            <p class="coverage-note">
              {{ coverageNote(stream) }}
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
      <!-- 三条互不冒充的时间线 -->
      <section class="health-card" aria-labelledby="timings-title">
        <h2 id="timings-title">{{ t.timingsTitle }}</h2>
        <div class="timing-grid">
          <div>
            <span class="timing-label">{{ t.timingCloud }}</span>
            <strong>{{ formatDateTime(health.timings.last_cloud_sync_at) }}</strong>
            <span class="timing-note">{{ syncOutcomeLabel(health.timings.last_cloud_sync_outcome) || t.timingCloudNote }}</span>
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
          <div><span>{{ t.dbSize }}</span><strong>{{ formatBytes(health.database.database_bytes, t.notProvided) }}</strong></div>
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
      <!-- 偶发指标 -->
      <section v-if="occasional.length" class="health-card" aria-labelledby="occasional-title">
        <h2 id="occasional-title">{{ t.occasionalTitle }}</h2>
        <p class="health-note">{{ t.occasionalNote }}</p>
        <div class="occasional-list">
          <div v-for="metric in occasional" :key="metric.stream" class="occasional-row">
            <strong>{{ syncStreamLabel(metric.stream, metric.label) }}</strong>
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
              <strong>{{ actionCopy(action).label }}</strong>
              <span>{{ actionCopy(action).reason }}</span>
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

<style scoped src="./HealthCheck.css"></style>
