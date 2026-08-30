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
import { intlLocale } from '../i18n';

const { runSync, isSyncing, markDataChanged } = useSyncController();

const health = ref<DataHealth | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const busyAction = ref<string | null>(null);
const actionMessage = ref<string | null>(null);
const actionError = ref<string | null>(null);
const windowDays = ref(90);

const WINDOWS = [
  { days: 30, label: '最近 30 天' },
  { days: 90, label: '最近 90 天' },
  { days: 365, label: '最近一年' },
] as const;

const load = async () => {
  loading.value = true;
  error.value = null;
  try {
    health.value = await backend.getDataHealth(windowDays.value);
  } catch (cause) {
    error.value = toUserMessage(cause, '读取数据健康状态失败');
  } finally {
    loading.value = false;
  }
};

const setWindow = async (days: number) => {
  windowDays.value = days;
  await load();
};

const formatDateTime = (value?: string | null): string => {
  if (!value) return '尚无记录';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间未知';
  return new Intl.DateTimeFormat(intlLocale(), {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date).replace(/\//g, '-');
};

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '未提供';
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${Math.round(bytes / 1_048_576)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
};

const CADENCE_LABEL: Record<string, string> = {
  continuous: '一天多次',
  daily: '一天一条',
  nightly: '一夜一条',
  per_event: '发生了才有',
  occasional: '偶尔才给',
};

const STAGE_LABEL: Record<string, string> = { ok: '正常', failed: '失败', never: '尚未发生' };
const ERROR_KIND_LABEL: Record<string, string> = {
  network: '没连上云端',
  auth: '需要重新连接账号',
  not_available: '这个账号没有这条流',
  unrecognized_payload: '拿到了报文但没看懂',
  storage: '写本地库失败',
  busy: '另一个操作正在写库，这次让开了',
  cancelled: '被取消',
  unknown: '未分类的失败',
};

const stageText = (stage: StageState): string => {
  if (stage.state === 'failed') {
    return ERROR_KIND_LABEL[stage.error_kind || 'unknown'] || '失败';
  }
  return STAGE_LABEL[stage.state] || stage.state;
};

const sourceLabel = (source: string): string => ({
  device: '单设备',
  user_fused: '用户融合',
  unknown: '来源未知',
}[source] || source);

/** 来源未知的数据不静默并进设备数据里；这里如实分开列。 */
const sourceSummary = (stream: StreamHealth): string => {
  if (!stream.sources.length) return '暂无记录';
  return stream.sources
    .map((entry) => `${sourceLabel(entry.source)} ${entry.records}`)
    .join(' · ');
};

const runAction = async (action: HealthAction) => {
  if (action.destructive && !window.confirm(`${action.label}：${action.reason}\n确定继续吗？`)) return;
  busyAction.value = action.id;
  actionError.value = null;
  actionMessage.value = null;
  try {
    if (action.id === 'sync') {
      await runSync('incremental');
      actionMessage.value = '同步已执行，状态已刷新。';
    } else if (action.id === 'reprocess') {
      const result = await backend.reprocessLocalData();
      actionMessage.value = `已用当前解析器重放本地报文（${result.total_records} 条派生记录）。云端同步时间没有被改写。`;
      markDataChanged();
    } else if (action.id === 'integrity_check') {
      const result = await backend.runDatabaseIntegrityCheck();
      actionMessage.value = result.ok
        ? '数据库完整性检查通过。'
        : `数据库完整性检查未通过：${result.detail || '请备份数据文件夹后重新同步'}`;
    } else if (action.id === 'open_data_folder') {
      await backend.openDataFolder();
      actionMessage.value = '已打开数据文件夹。';
    } else if (action.id === 'reauth') {
      window.location.hash = '';
      actionMessage.value = '请到设置页重新连接 Zepp 账号。';
    }
    await load();
  } catch (cause) {
    actionError.value = toUserMessage(cause, `${action.label}失败`);
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
      back-label="返回设置"
      title-id="health-title"
      eyebrow="数据健康"
      title="数据健康检查"
      intro="每条数据流从云端取回、被解析、写进本机这三步分别是什么状态，覆盖到哪些日期，来自哪个来源。缺就是缺，不用 0 补。"
    >
      <div class="range-switch" role="radiogroup" aria-label="覆盖范围">
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
      <button v-if="isDesktop()" class="button button-secondary retry" type="button" @click="load">重试</button>
    </div>

    <div v-if="loading" class="health-grid" aria-live="polite" aria-label="正在读取数据健康状态">
      <SkeletonBlock v-for="index in 4" :key="index" height="180px" />
    </div>

    <template v-else-if="health">
      <div v-if="health.database.replay_in_progress" class="inline-alert neutral" role="status">
        <Icon name="info" :size="14" />
        正在用新版解析器重放本地报文。这期间云端同步会主动让路并自动重试，不是失败。
      </div>

      <!-- 三条互不冒充的时间线 -->
      <section class="health-card" aria-labelledby="timings-title">
        <h2 id="timings-title">三个不一样的「时间」</h2>
        <div class="timing-grid">
          <div>
            <span class="timing-label">上次从云端取回</span>
            <strong>{{ formatDateTime(health.timings.last_cloud_sync_at) }}</strong>
            <span class="timing-note">{{ health.timings.last_cloud_sync_outcome || '尚无结果' }}</span>
          </div>
          <div>
            <span class="timing-label">上次本地重放</span>
            <strong>{{ formatDateTime(health.timings.last_local_replay_at) }}</strong>
            <span class="timing-note">用当前解析器重新解释本地报文，不触网，也不改写上面那个时间</span>
          </div>
          <div>
            <span class="timing-label">上次手动重新解析</span>
            <strong>{{ formatDateTime(health.timings.last_manual_reprocess_at) }}</strong>
            <span class="timing-note">你亲手点过的那一次</span>
          </div>
          <div>
            <span class="timing-label">最新一条健康样本</span>
            <strong>{{ formatDateTime(health.timings.newest_sample_at) }}</strong>
            <span class="timing-note">手表上这条记录本身发生的时间</span>
          </div>
        </div>
      </section>

      <!-- 数据库 -->
      <section class="health-card" aria-labelledby="db-title">
        <h2 id="db-title">本机数据库</h2>
        <div class="fact-grid">
          <div><span>库体积</span><strong>{{ formatBytes(health.database.database_bytes) }}</strong></div>
          <div><span>原始报文</span><strong>{{ health.database.raw_records.toLocaleString() }}</strong></div>
          <div><span>标准化记录</span><strong>{{ health.database.canonical_records.toLocaleString() }}</strong></div>
          <div>
            <span>待归一化</span>
            <strong :class="{ warn: health.database.pending_normalization > 0 }">
              {{ health.database.pending_normalization.toLocaleString() }}
            </strong>
          </div>
          <div><span>schema 版本</span><strong>{{ health.database.schema_version }}</strong></div>
          <div><span>解析器修订</span><strong class="mono">{{ health.database.normalizer_revision }}</strong></div>
        </div>
        <p class="health-note">
          <template v-if="integrity">
            完整性检查：{{ integrity.ok ? '通过' : `未通过（${integrity.detail || '详情见下'}）` }}
            · {{ formatDateTime(integrity.checked_at) }}
          </template>
          <template v-else>
            还没跑过完整性检查。它会扫描整个库，大库需要一点时间，所以只在你主动点击时执行。
          </template>
        </p>
      </section>

      <!-- 逐流三阶段 -->
      <section class="health-card" aria-labelledby="streams-title">
        <h2 id="streams-title">每条数据流走到哪一步</h2>
        <p class="health-note">
          取回、解析、写入是三件能各自失败的事。把它们折叠成一个红点，你就没法知道该重试、该重新连接，还是这个账号本来就没有这条流。
        </p>
        <div class="stream-list">
          <article v-for="stream in allStreams" :key="stream.stream" class="stream-row">
            <header>
              <strong>{{ stream.label }}</strong>
              <span class="cadence">{{ CADENCE_LABEL[stream.cadence] || stream.cadence }}</span>
            </header>
            <div class="stages">
              <span v-for="stage in [['取回', stream.fetch], ['解析', stream.parse], ['写入', stream.write]] as const"
                    :key="stage[0]"
                    :class="['stage', stage[1].state]">
                <i aria-hidden="true"></i>{{ stage[0] }}：{{ stageText(stage[1]) }}
              </span>
            </div>
            <p v-if="stream.parse.message || stream.fetch.message" class="stream-message">
              {{ stream.fetch.message || stream.parse.message }}
            </p>
            <dl class="stream-facts">
              <div><dt>原始报文</dt><dd>{{ stream.raw_records.toLocaleString() }}</dd></div>
              <div><dt>标准化记录</dt><dd>{{ stream.canonical_records.toLocaleString() }}</dd></div>
              <div><dt>来源</dt><dd>{{ sourceSummary(stream) }}</dd></div>
              <div><dt>观察到的日期</dt><dd>{{ stream.coverage.observed_days }} 天</dd></div>
            </dl>
            <p class="coverage-note">
              {{ stream.coverage.note }}
              <template v-if="stream.coverage.gap_dates.length">
                缺口示例：{{ stream.coverage.gap_dates.join('、') }}<template v-if="stream.coverage.gap_total > stream.coverage.gap_dates.length"> 等</template>。
              </template>
              <template v-if="stream.coverage.latest_observed_at">
                最近一次 {{ stream.coverage.latest_observed_at }}。
              </template>
            </p>
          </article>
        </div>
      </section>

      <!-- 偶发指标 -->
      <section v-if="occasional.length" class="health-card" aria-labelledby="occasional-title">
        <h2 id="occasional-title">偶尔才给的指标</h2>
        <p class="health-note">
          VO₂max、乳酸阈值这类指标手表本来就不是天天给。这里只报告观察到的日期和最近一次，不按天算缺口——把正常的稀疏画成红色才是误导。
        </p>
        <div class="occasional-list">
          <div v-for="metric in occasional" :key="metric.stream" class="occasional-row">
            <strong>{{ metric.label }}</strong>
            <span>{{ metric.canonical_records.toLocaleString() }} 条 · 观察到 {{ metric.coverage.observed_days }} 天</span>
            <span class="muted">
              {{ metric.coverage.latest_observed_at ? `最近一次 ${metric.coverage.latest_observed_at}` : '这段范围内没有观察到' }}
            </span>
          </div>
        </div>
      </section>

      <!-- 可执行动作 -->
      <section class="health-card" aria-labelledby="actions-title">
        <h2 id="actions-title">可以做点什么</h2>
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
            >{{ busyAction === action.id ? '执行中…' : '执行' }}</button>
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
