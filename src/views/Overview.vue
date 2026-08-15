<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import CircularProgress from '../components/CircularProgress.vue';
import DeviceCard from '../components/DeviceCard.vue';
import Icon from '../components/Icon.vue';
import SkeletonBlock from '../components/SkeletonBlock.vue';
import { useDevices } from '../composables/useDevices';
import { useSyncController } from '../composables/useSyncController';
import { backend, isDesktop, toUserMessage } from '../lib/bridge';
import { formatDateTime, formatMetric, isFiniteNumber } from '../lib/format';
import { displayableWorkouts } from '../lib/workouts';
import type { HealthOverview, SleepSession, Workout } from '../types';

const { appStatus, dataRevision } = useSyncController();
const { models: deviceModels, loading: devicesLoading, error: deviceError, load: loadDevices } = useDevices();

const overview = ref<HealthOverview | null>(null);
const recentSleep = ref<SleepSession[]>([]);
const recentWorkouts = ref<Workout[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const partialWarning = ref<string | null>(null);

const missing = '未提供';
const dateTime = (value?: string | null) => value ? formatDateTime(value, '时间未知') : '尚未获取';
const numberLabel = (value: unknown, suffix = '') => isFiniteNumber(value) ? `${formatMetric(value)}${suffix}` : missing;

const aiChecks = computed(() => [
  { label: '体征概览 (HRV / 心率 / 准备度)', ready: Boolean(overview.value) },
  { label: '睡眠分期与时长 (Deep / REM)', ready: recentSleep.value.length > 0 },
  { label: '多模态运动记录 (配速 / 轨迹)', ready: recentWorkouts.value.length > 0 },
  { label: '实体穿戴设备配置与固件', ready: deviceModels.value.length > 0 },
]);
const aiReadyCount = computed(() => aiChecks.value.filter((check) => check.ready).length);
const aiReadiness = computed(() => {
  if (!aiChecks.value.length) return 0;
  return Math.round((aiReadyCount.value / aiChecks.value.length) * 100);
});

const deviceSummary = computed(() => {
  if (devicesLoading.value) return '正在识别…';
  if (!deviceModels.value.length) return '未识别实体设备';
  return `已识别 ${deviceModels.value.length} 台设备`;
});

const cloudState = computed(() => ['connected', 'configured'].includes(String(appStatus.value?.connection_state || '')) ? '账号已识别' : '未识别');
const syncLabel = computed(() => dateTime(appStatus.value?.last_cloud_sync_at));

const coverageLabel = computed(() => {
  const coverage = overview.value?.coverage;
  if (!coverage?.start || !coverage.end) return '最近 30 天';
  return `${coverage.start} ~ ${coverage.end}`;
});

const recordsLabel = computed(() => {
  const total = (appStatus.value?.streams ?? []).reduce((sum, stream) => sum + (stream.records ?? 0), 0);
  return total > 0 ? `${total.toLocaleString('zh-CN')} 条` : '就绪待导出';
});

const loadOverview = async () => {
  loading.value = true;
  error.value = null;
  partialWarning.value = null;
  if (!isDesktop()) {
    overview.value = null;
    recentSleep.value = [];
    recentWorkouts.value = [];
    loading.value = false;
    return;
  }
  const results = await Promise.allSettled([
    backend.getHealthOverview(),
    backend.getRecentSleep(3),
    backend.getRecentWorkouts(3),
  ]);
  const [health, sleep, workouts] = results;
  overview.value = health.status === 'fulfilled' ? health.value : null;
  recentSleep.value = sleep.status === 'fulfilled' ? sleep.value : [];
  recentWorkouts.value = workouts.status === 'fulfilled' ? displayableWorkouts(workouts.value) : [];

  const rejected = results.filter((result) => result.status === 'rejected');
  if (rejected.length === results.length) {
    error.value = toUserMessage(rejected[0].reason, '健康数据暂时不可用');
  } else if (rejected.length) {
    partialWarning.value = toUserMessage(rejected[0].reason, '部分数据流尚未获取');
  }
  loading.value = false;
};

onMounted(() => {
  void loadOverview();
  void loadDevices();
});
watch(dataRevision, () => {
  void loadOverview();
  void loadDevices();
});
</script>

<template>
  <section class="page overview-page" aria-labelledby="overview-title">
    <!-- Hero 区域 -->
    <header class="hero-section">
      <div class="hero-header">
        <div class="hero-copy">
          <p class="eyebrow">ZEPP DATA TO AI PIPELINE</p>
          <h1 id="overview-title">你的穿戴数据，已准备好交给 AI</h1>
          <p class="page-intro">将 Zepp 与 Amazfit 运动健康数据自动对齐、无损结构化转换，以隐私优先的方式交付给前沿大模型。</p>
        </div>
        <div class="overview-meta">
          <span class="state-chip"><i class="dot"></i>{{ cloudState }}</span>
          <span>最近同步 {{ syncLabel }}</span>
        </div>
      </div>

      <!-- 三枚核心价值卡 -->
      <div class="value-cards-grid">
        <div class="value-card">
          <div class="value-icon"><Icon name="shield" :size="20" /></div>
          <div class="value-text">
            <strong>本地运算 · 安全 Secure</strong>
            <span>数据解析在本地完成，不经第三方中转，凭据安全隔离。</span>
          </div>
        </div>
        <div class="value-card">
          <div class="value-icon"><Icon name="sliders" :size="20" /></div>
          <div class="value-text">
            <strong>可控脱敏 · 私密 Private</strong>
            <span>精确经纬度与敏感体征默认脱敏保护，范围自主掌控。</span>
          </div>
        </div>
        <div class="value-card">
          <div class="value-icon"><Icon name="spark" :size="20" /></div>
          <div class="value-text">
            <strong>无损对齐 · AI 友好 AI-ready</strong>
            <span>自动生成对齐时序的结构化 Markdown / JSON，随附专业提示词。</span>
          </div>
        </div>
      </div>

      <!-- 流程流转示意 -->
      <div class="pipeline-card">
        <div class="pipeline-step">
          <div class="step-badge"><Icon name="cloud" :size="16" /></div>
          <div class="step-info">
            <span class="step-tag">数据源</span>
            <strong>MSV / Zepp Cloud</strong>
          </div>
        </div>
        <div class="pipeline-arrow"><Icon name="arrow-right" :size="16" /></div>
        <div class="pipeline-step is-hub">
          <div class="step-badge hub-badge"><Icon name="database" :size="18" /></div>
          <div class="step-info">
            <span class="step-tag">本地引擎</span>
            <strong>ZeppBridge</strong>
          </div>
        </div>
        <div class="pipeline-arrow"><Icon name="arrow-right" :size="16" /></div>
        <div class="pipeline-step">
          <div class="step-badge"><Icon name="terminal" :size="16" /></div>
          <div class="step-info">
            <span class="step-tag">消费端</span>
            <strong>Claude / ChatGPT / 提示词</strong>
          </div>
        </div>
      </div>
    </header>

    <div v-if="partialWarning" class="inline-alert warning" role="status">
      <Icon name="info" :size="15" />{{ partialWarning }}
    </div>
    <div v-if="deviceError" class="inline-alert warning" role="status">
      <Icon name="info" :size="15" />设备识别：{{ deviceError }}
    </div>

    <!-- 加载骨架屏 -->
    <div v-if="loading" class="overview-skeleton" aria-live="polite" aria-label="正在加载概览">
      <SkeletonBlock height="180px" />
      <div class="skeleton-grid">
        <SkeletonBlock height="220px" />
        <SkeletonBlock height="220px" />
      </div>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error" class="empty-wrap">
      <div class="empty-state" role="alert">
        <Icon name="warning" :size="20" />
        <strong>无法读取数据概览</strong>
        <span>{{ error }}</span>
        <button class="button button-secondary" type="button" @click="loadOverview">重试</button>
      </div>
    </div>

    <!-- 正常内容展示 -->
    <template v-else>
      <div class="main-sections-grid">
        <!-- 已连接设备面板 -->
        <section class="surface-card devices-panel" aria-label="已连接设备">
          <div class="section-head">
            <div>
              <p class="eyebrow">ACCOUNT & DEVICES</p>
              <h2>已连接设备</h2>
            </div>
            <span class="head-note">{{ deviceSummary }}</span>
          </div>

          <div v-if="devicesLoading" class="device-grid device-grid-loading">
            <SkeletonBlock v-for="i in 2" :key="i" height="96px" />
          </div>
          <div v-else-if="deviceModels.length" class="device-grid">
            <DeviceCard
              v-for="device in deviceModels"
              :key="device.profile.device_id || device.profile.serial || device.canonicalName"
              :profile="device"
            />
          </div>
          <div v-else class="device-empty">
            <Icon name="watch" :size="18" />
            <span>账号尚未识别实体穿戴设备，云端历史记录仍可完整同步。</span>
          </div>

          <div class="cloud-source">
            <span class="cloud-source-icon"><Icon name="cloud" :size="18" /></span>
            <div class="cloud-source-copy">
              <strong>Zepp Cloud</strong>
              <span>云服务状态 · {{ cloudState }}</span>
            </div>
            <span class="cloud-source-time">最近同步 {{ syncLabel }}</span>
          </div>
        </section>

        <!-- 最新数据包面板 -->
        <section class="surface-card package-panel" aria-label="最新数据包">
          <div class="section-head">
            <div>
              <p class="eyebrow">LATEST DATA PACKAGE</p>
              <h2>最新数据包</h2>
            </div>
            <RouterLink class="text-link" to="/explore">导出数据 <Icon name="arrow-right" :size="13" /></RouterLink>
          </div>

          <div class="package-metrics-grid">
            <div class="pkg-metric-item">
              <span class="pkg-label">数据覆盖周期</span>
              <strong class="pkg-val">{{ coverageLabel }}</strong>
            </div>
            <div class="pkg-metric-item">
              <span class="pkg-label">同步记录总数</span>
              <strong class="pkg-val font-mono">{{ recordsLabel }}</strong>
            </div>
            <div class="pkg-metric-item">
              <span class="pkg-label">今日步数</span>
              <strong class="pkg-val font-mono">{{ numberLabel(overview?.steps_today, ' 步') }}</strong>
            </div>
            <div class="pkg-metric-item">
              <span class="pkg-label">活动消耗</span>
              <strong class="pkg-val font-mono">{{ numberLabel(overview?.active_calories_today, ' kcal') }}</strong>
            </div>
          </div>

          <div class="stream-chips-row">
            <span class="stream-chip"><i class="chip-dot dot-sleep"></i>睡眠分期</span>
            <span class="stream-chip"><i class="chip-dot dot-workout"></i>运动轨迹</span>
            <span class="stream-chip"><i class="chip-dot dot-heart"></i>静息心率与 HRV</span>
            <span class="stream-chip"><i class="chip-dot dot-readiness"></i>恢复准备度</span>
          </div>
        </section>
      </div>

      <!-- AI 交接就绪度与快速操作 -->
      <section class="surface-card handoff-section" aria-label="AI 数据交接">
        <div class="section-head">
          <div>
            <p class="eyebrow">AI HANDOFF & ACTIONS</p>
            <h2>AI 交接就绪度</h2>
          </div>
          <span class="state-badge">本地就绪</span>
        </div>

        <div class="handoff-content-grid">
          <div class="handoff-progress-col">
            <CircularProgress :value="aiReadiness" :size="110" :stroke-width="9" color="#CDDC7C">
              <div class="progress-inner-text">
                <strong>{{ aiReadiness }}%</strong>
                <span>AI 就绪</span>
              </div>
            </CircularProgress>
            <p class="handoff-caption">已检查字段结构完整度，数据包格式符合 Claude / ChatGPT 输入标准。</p>
          </div>

          <div class="handoff-checklist-col">
            <ul class="check-list">
              <li v-for="check in aiChecks" :key="check.label">
                <Icon :name="check.ready ? 'circle-check' : 'info'" :size="15" :class="{ 'is-ready': check.ready, 'is-pending': !check.ready }" />
                <span>{{ check.label }}</span>
                <em>{{ check.ready ? '已就绪' : '等待同步' }}</em>
              </li>
            </ul>
          </div>

          <div class="handoff-actions-col">
            <RouterLink class="button button-primary action-btn" to="/explore">
              <Icon name="spark" :size="15" />
              <span>前往导出与提示词</span>
              <Icon name="arrow-right" :size="13" />
            </RouterLink>
            <RouterLink class="button button-secondary action-btn" to="/recent">
              <Icon name="clock" :size="15" />
              <span>查看历史记录</span>
            </RouterLink>
          </div>
        </div>
      </section>

      <!-- 底部安全处理保证横条 -->
      <footer class="security-guarantees-bar">
        <div class="guarantee-item">
          <Icon name="shield" :size="14" />
          <span>本地运算与转换</span>
        </div>
        <div class="guarantee-divider"></div>
        <div class="guarantee-item">
          <Icon name="terminal" :size="14" />
          <span>标准结构化输出</span>
        </div>
        <div class="guarantee-divider"></div>
        <div class="guarantee-item">
          <Icon name="sliders" :size="14" />
          <span>不上传原始凭据</span>
        </div>
        <div class="guarantee-divider"></div>
        <div class="guarantee-item">
          <Icon name="circle-check" :size="14" />
          <span>端到端透明开源</span>
        </div>
      </footer>
    </template>
  </section>
</template>

<style scoped>
.overview-page { display: grid; gap: 20px; }

/* ── Hero 区域 ─────────────────────────── */
.hero-section { display: grid; gap: 16px; }
.hero-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; min-width: 0; }
.hero-copy { min-width: 0; }
.eyebrow { margin: 0 0 4px; color: var(--subtle); font-size: 11px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; }
.hero-copy h1 { margin: 0 0 6px; font-size: 24px; font-weight: 700; color: var(--ink); letter-spacing: -.02em; }
.page-intro { margin: 0; color: var(--muted); font-size: 13px; max-width: 680px; line-height: 1.5; }
.overview-meta { display: flex; align-items: center; gap: 10px; color: var(--muted); font-size: 12px; white-space: nowrap; }
.state-chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border: 1px solid var(--line-strong); border-radius: 999px; background: var(--surface); color: var(--accent); font-size: 11px; font-weight: 600; }
.dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); }

/* 三枚价值卡 */
.value-cards-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.value-card { display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface); }
.value-icon { display: grid; place-items: center; width: 36px; height: 36px; flex: 0 0 36px; border-radius: 9px; background: var(--accent-soft); color: var(--accent); }
.value-text { display: grid; gap: 3px; min-width: 0; }
.value-text strong { color: var(--ink); font-size: 12px; font-weight: 600; }
.value-text span { color: var(--muted); font-size: 11px; line-height: 1.45; }

/* 流程图示 */
.pipeline-card { display: flex; align-items: center; justify-content: space-between; padding: 12px 20px; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface-raised); }
.pipeline-step { display: flex; align-items: center; gap: 10px; }
.step-badge { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 8px; background: var(--surface); color: var(--muted); border: 1px solid var(--line); }
.step-badge.hub-badge { background: var(--accent-soft); color: var(--accent); border-color: var(--accent); }
.step-info { display: grid; gap: 2px; }
.step-tag { font-size: 10px; color: var(--subtle); text-transform: uppercase; letter-spacing: .06em; }
.step-info strong { font-size: 12px; color: var(--ink); }
.pipeline-arrow { color: var(--subtle); display: grid; place-items: center; }

/* ── 骨架屏与提示 ───────────────────────── */
.inline-alert { display: flex; align-items: flex-start; gap: 8px; padding: 9px 12px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); color: var(--muted); font-size: 12px; }
.inline-alert.warning { color: var(--warning); }
.overview-skeleton { display: grid; gap: 16px; }
.skeleton-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }

/* ── 主网格（设备 + 最新数据包） ─────────── */
.main-sections-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; }
.surface-card { padding: 18px 20px; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface); }
.section-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.section-head h2 { margin: 2px 0 0; font-size: 15px; font-weight: 700; color: var(--ink); }
.head-note { color: var(--muted); font-size: 12px; }
.text-link { display: inline-flex; align-items: center; gap: 4px; color: var(--accent); font-size: 12px; text-decoration: none; }
.text-link:hover { text-decoration: underline; }

/* 设备卡网格 */
.device-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
.device-grid-loading { align-items: stretch; }
.device-empty { display: flex; align-items: center; gap: 10px; min-height: 80px; padding: 14px; border: 1px dashed var(--line-strong); border-radius: var(--radius-sm); color: var(--muted); font-size: 12px; }
.cloud-source { display: flex; align-items: center; gap: 10px; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line); }
.cloud-source-icon { display: grid; place-items: center; width: 34px; height: 34px; border: 1px solid var(--line); border-radius: 8px; color: var(--pace); background: var(--surface-raised); }
.cloud-source-copy { display: grid; gap: 2px; min-width: 0; flex: 1; }
.cloud-source-copy strong { font-size: 12px; color: var(--ink); }
.cloud-source-copy span { color: var(--muted); font-size: 11px; }
.cloud-source-time { color: var(--subtle); font-size: 11px; font-family: var(--font-mono); }

/* 数据包面板 */
.package-metrics-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 14px; }
.pkg-metric-item { display: grid; gap: 4px; padding: 12px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface-raised); }
.pkg-label { color: var(--subtle); font-size: 11px; }
.pkg-val { color: var(--ink); font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.font-mono { font-family: var(--font-mono); }

.stream-chips-row { display: flex; flex-wrap: wrap; gap: 8px; padding-top: 12px; border-top: 1px solid var(--line); }
.stream-chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; background: var(--surface-raised); color: var(--muted); font-size: 11px; }
.chip-dot { width: 6px; height: 6px; border-radius: 50%; }
.dot-sleep { background: var(--sleep-deep); }
.dot-workout { background: var(--pace); }
.dot-heart { background: var(--heart); }
.dot-readiness { background: var(--readiness); }

/* ── AI 交接与快速操作 ─────────────────── */
.handoff-section { margin-top: 0; }
.state-badge { display: inline-flex; padding: 3px 8px; border-radius: 6px; background: var(--accent-soft); color: var(--accent); font-size: 11px; font-weight: 600; }
.handoff-content-grid { display: grid; grid-template-columns: 200px 1fr 200px; gap: 20px; align-items: center; }

.handoff-progress-col { display: grid; justify-items: center; text-align: center; gap: 10px; }
.progress-inner-text { display: grid; justify-items: center; }
.progress-inner-text strong { font-size: 22px; font-family: var(--font-mono); color: var(--ink); }
.progress-inner-text span { font-size: 10px; color: var(--muted); }
.handoff-caption { margin: 0; color: var(--subtle); font-size: 11px; line-height: 1.4; }

.check-list { display: grid; gap: 9px; margin: 0; padding: 0; list-style: none; }
.check-list li { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 12px; }
.check-list li svg.is-ready { color: var(--readiness); }
.check-list li svg.is-pending { color: var(--subtle); }
.check-list li span { flex: 1; color: var(--ink); }
.check-list li em { color: var(--muted); font-size: 11px; font-style: normal; font-family: var(--font-mono); }

.handoff-actions-col { display: grid; gap: 10px; }
.action-btn { width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 38px; }

/* ── 底部安全保障横条 ───────────────────── */
.security-guarantees-bar { display: flex; align-items: center; justify-content: center; gap: 16px; padding: 12px 16px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); color: var(--subtle); font-size: 11px; }
.guarantee-item { display: inline-flex; align-items: center; gap: 6px; }
.guarantee-item svg { color: var(--accent); }
.guarantee-divider { width: 1px; height: 12px; background: var(--line); }

/* ── 响应式适配 ─────────────────────────── */
@media (max-width: 920px) {
  .value-cards-grid { grid-template-columns: 1fr; }
  .main-sections-grid { grid-template-columns: 1fr; }
  .handoff-content-grid { grid-template-columns: 1fr; justify-items: center; text-align: center; }
  .check-list li { justify-content: center; }
  .pipeline-card { flex-direction: column; gap: 12px; }
  .pipeline-arrow { transform: rotate(90deg); }
  .security-guarantees-bar { flex-wrap: wrap; gap: 10px; }
  .guarantee-divider { display: none; }
}
</style>
