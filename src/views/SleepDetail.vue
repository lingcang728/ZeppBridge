<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import Icon from '../components/Icon.vue';
import CircularProgress from '../components/CircularProgress.vue';
import StageBar from '../components/StageBar.vue';
import EmptyState from '../components/EmptyState.vue';
import { useSyncController } from '../composables/useSyncController';
import { dataProviderLabel, dataScopeLabel } from '../lib/labels';
import { isTauri, tauriApi, toUserMessage } from '../composables/useTauriApi';
import { formatDate, formatDateTime, formatDuration, formatTime, isFiniteNumber } from '../lib/format';
import type { DeviceProfile, SleepSession } from '../types';

const route = useRoute();
const { appStatus, dataRevision } = useSyncController();
const session = ref<SleepSession | null>(null);
const device = ref<DeviceProfile>({});
const loading = ref(true);
const error = ref<string | null>(null);
const stageHelpOpen = ref(false);
const sleepId = computed(() => String(route.params.sleepId || ''));

const stages = computed(() => session.value ? [
  { label: '深睡', minutes: session.value.deep_minutes, tone: 'deep' as const },
  { label: '浅睡', minutes: session.value.light_minutes, tone: 'light' as const },
  { label: 'REM', minutes: session.value.rem_minutes, tone: 'rem' as const },
  { label: '清醒', minutes: session.value.awake_minutes, tone: 'awake' as const },
] : []);

const score = computed(() => {
  const value = session.value?.score;
  return isFiniteNumber(value) ? value : null;
});

const scoreComment = computed(() => {
  if (score.value === null) return null;
  if (score.value >= 80) {
    return {
      title: '睡得不错',
      body: '睡眠时长充足，深睡比例良好，维持规律有助于进一步提升恢复效果。',
    };
  }
  if (score.value >= 60) {
    return { title: '还可以', body: '整体尚可。规律作息有助于改善恢复。' };
  }
  return { title: '有待改善', body: '时长或阶段比例偏低。仅展示设备给出的评分。' };
});

const timeInBedLabel = computed(() => {
  const minutes = session.value?.time_in_bed_minutes;
  return isFiniteNumber(minutes) ? formatDuration(minutes, '未提供') : '未提供';
});

const syncTimeLabel = computed(() => {
  if (session.value?.synced_at) return formatDateTime(session.value.synced_at, '同步时间未提供');
  if (appStatus.value?.last_cloud_sync_at) {
    return `最近云端同步 ${formatDateTime(appStatus.value.last_cloud_sync_at, '同步时间未提供')}`;
  }
  return '同步时间未提供';
});

const timezoneLabel = computed(() => device.value.timezone || '未提供');

let detailSeq = 0;

const loadDetail = async () => {
  const seq = ++detailSeq;
  loading.value = true;
  error.value = null;
  if (!isTauri()) {
    loading.value = false;
    return;
  }
  try {
    const detail = await tauriApi.getSleepDetail(sleepId.value);
    if (seq !== detailSeq) return;
    const profile = detail
      ? await tauriApi.getDeviceProfile({
          deviceId: detail.device_id,
          sourceScope: detail.source_scope,
        }).catch(() => ({ name: '设备未确定' }))
      : {};
    if (seq !== detailSeq) return;
    session.value = detail;
    device.value = profile;
  } catch (cause) {
    if (seq !== detailSeq) return;
    error.value = toUserMessage(cause, '睡眠详情暂时不可用');
  } finally {
    if (seq === detailSeq) loading.value = false;
  }
};

onMounted(() => void loadDetail());
watch([dataRevision, sleepId], () => void loadDetail());
</script>

<template>
  <section class="page sleep-page" aria-labelledby="sleep-detail-title">
    <RouterLink class="back-link" to="/"><Icon name="arrow-left" :size="14" />返回概览</RouterLink>
    <header class="page-heading">
      <h1 id="sleep-detail-title">睡眠记录详情</h1>
      <p v-if="session">{{ formatDate(session.start_time, 'long') }}</p>
    </header>

    <div v-if="loading" class="muted-line" aria-live="polite">正在读取睡眠详情…</div>
    <EmptyState v-else-if="error" tone="error" icon="warning" title="无法读取这条睡眠" :message="error">
      <button class="button button-secondary" type="button" @click="loadDetail">重试</button>
    </EmptyState>
    <EmptyState v-else-if="!session" icon="moon" title="找不到这条睡眠记录" message="它可能已被清理，或尚未同步到本机。" />

    <template v-else>
      <article class="sleep-hero" aria-label="睡眠时长与评分">
        <div class="hero-duration">
          <p class="kicker"><span class="mark"><Icon name="moon" :size="16" /></span>睡眠时长</p>
          <p class="value">{{ formatDuration(session.duration_minutes, '—') }}</p>
          <p class="meta">{{ formatTime(session.start_time) }} 入睡 · {{ formatTime(session.end_time) }} 醒来</p>
          <p class="meta">在床时长 {{ timeInBedLabel }}</p>
        </div>
        <div class="hero-score">
          <p class="kicker">睡眠评分</p>
          <div class="score-row">
            <CircularProgress
              v-if="score !== null"
              :value="score"
              :size="92"
              :stroke-width="7"
              color="var(--sleep)"
              track-color="var(--line)"
              unit=""
            />
            <strong v-else class="score-empty">—</strong>
            <small>/ 100</small>
          </div>
          <template v-if="scoreComment">
            <p class="score-title">{{ scoreComment.title }}</p>
            <p class="score-body">{{ scoreComment.body }}</p>
          </template>
        </div>
      </article>

      <section class="surface-card stage-card" aria-label="睡眠阶段">
        <div class="stage-head">
          <h2>睡眠阶段</h2>
          <div class="stage-actions">
            <p>{{ formatTime(session.start_time) }} – {{ formatTime(session.end_time) }}</p>
            <button class="stage-help-button" type="button" @click="stageHelpOpen = !stageHelpOpen">阶段说明</button>
          </div>
        </div>
        <p v-if="stageHelpOpen" class="stage-help">
          深睡：恢复体力的深度睡眠。浅睡：占比较高的过渡阶段。REM：快速眼动期，多与记忆和梦境有关。清醒：夜间醒来或清醒片段。以上为阶段含义说明，不是健康诊断。
        </p>
        <StageBar
          :stages="stages"
          :slices="session.stages"
          :range-start="formatTime(session.start_time)"
          :range-end="formatTime(session.end_time)"
        />
      </section>

      <section class="meta-grid" aria-label="来源与设备">
        <article class="surface-card meta-card">
          <p class="meta-title"><Icon name="cloud" :size="15" />来源</p>
          <dl>
            <div>
              <dt>数据来源</dt>
              <dd>{{ dataProviderLabel() }}</dd>
            </div>
            <div>
              <dt>数据范围</dt>
              <dd>{{ dataScopeLabel(session.source_scope) }}</dd>
            </div>
            <div>
              <dt>同步时间</dt>
              <dd>{{ syncTimeLabel }}</dd>
            </div>
            <div>
              <dt>时区</dt>
              <dd>{{ timezoneLabel }}</dd>
            </div>
          </dl>
        </article>
        <article class="surface-card meta-card">
          <p class="meta-title"><Icon name="watch" :size="15" />设备</p>
          <dl>
            <div>
              <dt>设备名称</dt>
              <dd>{{ device.name || '未提供' }}</dd>
            </div>
            <div>
              <dt>固件版本</dt>
              <dd>{{ device.firmware || '未提供' }}</dd>
            </div>
            <div>
              <dt>设备 ID</dt>
              <dd>{{ device.device_id || session.device_id || '未提供' }}</dd>
            </div>
          </dl>
        </article>
      </section>
      <p class="note">只展示云端给出的阶段汇总。没有 REM 字段时显示「未提供」，不会用减法编造，也不绘制未提供的时间轴。</p>
    </template>
  </section>
</template>

<style scoped>
.sleep-page { width: 100%; }
.back-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 18px;
  color: var(--muted);
  font-size: 13px;
  text-decoration: none;
}
.back-link svg { transform: rotate(180deg); }
.page-heading { margin-bottom: 18px; }
.page-heading h1 {
  margin: 0;
  color: var(--ink);
  font-size: 22px;
  font-weight: 650;
  letter-spacing: -0.04em;
}
.page-heading p {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: 13px;
}
.muted-line { color: var(--muted); }
.sleep-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(220px, 0.8fr);
  align-items: start;
  gap: 0;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--sleep-wash);
}
.score-title { margin: 12px 0 0; font-size: 14px; }
.score-body { margin: 6px 0 0; color: var(--muted); font-size: 12px; line-height: 1.55; }
.hero-duration, .hero-score { min-width: 0; padding: 22px 24px 20px; }
.hero-score {
  border-left: 1px solid var(--line);
  background: var(--surface-raised);
}
.kicker {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--muted);
  font-size: 13px;
}
.mark {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border-radius: 999px;
  color: var(--sleep);
  background: var(--surface-raised);
}
.value {
  margin: 18px 0 0;
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: clamp(32px, 4.4vw, 44px);
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  letter-spacing: -0.04em;
  line-height: 1.1;
}
.meta {
  margin: 12px 0 0;
  color: var(--muted);
  font-size: 13px;
}
.score-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 16px;
}
.score-empty {
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 36px;
  font-weight: 500;
}
.score-row small {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 13px;
}
.stage-card { margin-top: 12px; padding: 18px 20px 20px; background: var(--surface); border-color: var(--line); }
.stage-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}
.stage-head h2 { margin: 0; color: var(--ink); font-size: 16px; }
.stage-head p { margin: 0; color: var(--muted); font-size: 12px; }
.stage-actions { display: flex; align-items: center; gap: 10px; }
.stage-help-button {
  border: 1px solid var(--line);
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  padding: 4px 10px;
  cursor: pointer;
}
.stage-help { margin: 0 0 12px; color: var(--muted); font-size: 12px; line-height: 1.55; }
.meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 12px;
}
.meta-card { padding: 16px 18px 18px; background: var(--surface); border-color: var(--line); }
.meta-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 12px;
  color: var(--ink);
  font-size: 13px;
}
.meta-title svg { color: var(--sleep); }
.meta-card dl { display: grid; gap: 10px; margin: 0; }
.meta-card dt { color: var(--muted); font-size: 12px; }
.meta-card dd {
  margin: 4px 0 0;
  color: var(--ink);
  overflow-wrap: anywhere;
  font-size: 13px;
}
.note { margin: 12px 0 0; color: var(--muted); font-size: 12px; }
@media (max-width: 760px) {
  .sleep-hero, .meta-grid { grid-template-columns: 1fr; }
  .hero-score { border-left: 0; border-top: 1px solid var(--line); }
}
</style>
