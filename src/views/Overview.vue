<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import Icon from '../components/Icon.vue';
import CircularProgress from '../components/CircularProgress.vue';
import SkeletonBlock from '../components/SkeletonBlock.vue';
import { isTauri, tauriApi, toUserMessage } from '../composables/useTauriApi';
import { useSyncController } from '../composables/useSyncController';
import { formatMetric, isFiniteNumber, localDateString } from '../lib/format';
import type { HealthOverview, SleepSession, Workout } from '../types';

const overview = ref<HealthOverview | null>(null);
const recentSleep = ref<SleepSession[]>([]);
const recentWorkouts = ref<Workout[]>([]);
const loading = ref(true);
const partialWarning = ref<string | null>(null);
const promptCopied = ref(false);
const { appStatus, dataRevision } = useSyncController();

const connected = computed(() => appStatus.value?.connection_state === 'connected');

const devices = computed(() => [
  { name: 'T-Rex 3', icon: 'watch' as const, connected: connected.value, lastSync: lastSyncClock.value },
  { name: 'Helio Ring', icon: 'ring' as const, connected: connected.value, lastSync: lastSyncClock.value },
]);
const devicesOkCount = computed(() => devices.value.filter((device) => device.connected).length);

const lastSyncClock = computed(() => {
  const raw = appStatus.value?.last_cloud_sync_at;
  if (!raw) return '—';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date).replace(/\//g, '-');
});

const packageRange = computed(() => {
  const coverage = overview.value?.coverage;
  if (coverage?.start && coverage?.end) return `${coverage.start} ~ ${coverage.end}`;
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 7);
  return `${localDateString(start)} ~ ${localDateString(end)}`;
});
const packageRecords = computed(() => {
  const streams = appStatus.value?.streams ?? [];
  const total = streams.reduce((sum, stream) => sum + (stream.records ?? 0), 0);
  return total > 0 ? `${total.toLocaleString('zh-CN')} 条记录` : '—';
});

const readinessChecks = computed(() => [
  { label: '数据完整性检查', state: connected.value ? '通过' : '待同步' },
  { label: '结构化转换', state: connected.value ? '完成' : '待同步' },
  { label: '脱敏处理', state: '完成' },
  { label: 'AI 就绪', state: connected.value ? '完成' : '待同步' },
]);
const readinessPercent = computed(() => {
  const done = readinessChecks.value.filter((check) => check.state !== '待同步').length;
  return Math.round((done / readinessChecks.value.length) * 100);
});

const PROMPT_PREVIEW = `你是一位专业的健康数据分析师。
请基于我提供的 Amazfit 穿戴数据，
进行全面的分析和洞察。

请重点关注: 睡眠质量、恢复情况、活动负荷、心率变化趋势、
压力水平等关键指标, 并提供可执行的健康建议。

数据格式为 JSON, 包含以下字段:
sleep, activity, heart_rate, stress, recovery, metrics ...`;

const copyPrompt = async () => {
  try {
    await navigator.clipboard.writeText(PROMPT_PREVIEW);
    promptCopied.value = true;
    window.setTimeout(() => { promptCopied.value = false; }, 2000);
  } catch {
    promptCopied.value = false;
  }
};

const quickActions = [
  { label: '导出 CSV', sub: '通用数据表格', icon: 'table' as const, to: '/explore' },
  { label: '导出 JSON', sub: '结构化数据', icon: 'braces' as const, to: '/explore' },
  { label: '分享数据包', sub: '生成分享链接', icon: 'export' as const, to: '/explore' },
  { label: '打开提示词', sub: '在 AI 工具中使用', icon: 'edit' as const, to: '/explore' },
];

const guarantees = [
  { title: '本地处理优先', sub: '所有处理在本地完成', icon: 'shield' as const },
  { title: '结构化输出', sub: '适配多种 AI 场景', icon: 'database' as const },
  { title: '不上传原始数据', sub: '我们不会收集或上传你的原始数据', icon: 'spo2' as const },
  { title: '端到端加密', sub: '保护传输与本地数据', icon: 'lock' as const },
];

const loadOverview = async () => {
  loading.value = true;
  partialWarning.value = null;
  if (!isTauri()) {
    loading.value = false;
    overview.value = null;
    recentSleep.value = [];
    recentWorkouts.value = [];
    return;
  }
  const [health, sleep, workouts] = await Promise.allSettled([
    tauriApi.getHealthOverview(),
    tauriApi.getRecentSleep(3),
    tauriApi.getRecentWorkouts(3),
  ]);
  overview.value = health.status === 'fulfilled' ? health.value : null;
  recentSleep.value = sleep.status === 'fulfilled' ? sleep.value : [];
  recentWorkouts.value = workouts.status === 'fulfilled' ? workouts.value : [];
  const rejected = [health, sleep, workouts].filter((result) => result.status === 'rejected');
  if (rejected.length) {
    partialWarning.value = toUserMessage(rejected[0].reason, '部分数据暂时不可用');
  }
  loading.value = false;
};

onMounted(() => void loadOverview());
watch(dataRevision, () => void loadOverview());
</script>

<template>
  <section class="page explore-page" aria-labelledby="explore-title">
    <header class="hero">
      <h1 id="explore-title">你的穿戴数据，已准备好交给 <em>AI</em></h1>
      <p class="page-intro">Z-Bridge 将你的穿戴数据整理为适合 AI 使用的结构化输出，安全、私密、AI 友好。</p>
    </header>

    <div v-if="partialWarning" class="partial-warning" role="status">
      <Icon name="info" :size="15" />
      <span>{{ partialWarning }}</span>
    </div>

    <div v-if="loading" class="explore-skeleton" aria-label="正在加载" aria-live="polite">
      <SkeletonBlock height="128px" />
      <SkeletonBlock height="220px" />
      <SkeletonBlock height="280px" />
    </div>

    <template v-else>
      <!-- 安全 / 私密 / AI 友好 + 流程示意 -->
      <article class="pledge-strip surface-card">
        <div class="pledge-item">
          <p class="pledge-head"><Icon name="shield" :size="17" /><strong>安全</strong><span>Secure</span></p>
          <p class="pledge-sub">数据仅在你掌控之中，本地处理更安心</p>
        </div>
        <div class="pledge-item">
          <p class="pledge-head"><Icon name="lock" :size="17" /><strong>私密</strong><span>Private</span></p>
          <p class="pledge-sub">不上传原始数据，保护你的隐私</p>
        </div>
        <div class="pledge-item">
          <p class="pledge-head"><Icon name="spark" :size="17" /><strong>AI 友好</strong><span>AI-ready</span></p>
          <p class="pledge-sub">结构化输出，开箱即用</p>
        </div>
        <div class="pipeline" aria-label="数据流转">
          <span class="pipe-node"><i><Icon name="cloud" :size="24" /></i>MSV Cloud</span>
          <Icon name="arrow-right" :size="15" class="pipe-arrow" />
          <span class="pipe-node is-brand"><i><Icon name="link" :size="24" /></i>Z-Bridge</span>
          <Icon name="arrow-right" :size="15" class="pipe-arrow" />
          <span class="pipe-node"><i><Icon name="spark" :size="24" /></i>AI 工具</span>
        </div>
      </article>

      <!-- 已连接设备 + 最新数据包 -->
      <div class="row-devices">
        <article class="surface-card devices-card">
          <div class="card-head">
            <h2>已连接设备</h2>
            <span class="head-note">{{ devicesOkCount }}/{{ devices.length }} {{ devicesOkCount === devices.length ? '正常' : '连接' }}</span>
          </div>
          <div class="device-grid">
            <div v-for="device in devices" :key="device.name" class="device-card">
              <span class="device-visual"><Icon :name="device.icon" :size="34" /></span>
              <strong>{{ device.name }}</strong>
              <span :class="['device-state', { on: device.connected }]"><i class="dot"></i>{{ device.connected ? '已连接' : '未连接' }}</span>
              <span class="device-sync">最后同步<br />{{ device.lastSync }}</span>
            </div>
          </div>
          <RouterLink class="card-foot-link" to="/settings">查看设备详情<Icon name="arrow-right" :size="13" /></RouterLink>
        </article>

        <article class="surface-card package-card">
          <div class="card-head">
            <h2><Icon name="box" :size="16" />最新数据包</h2>
            <RouterLink class="mini-btn" to="/recent">查看全部<Icon name="arrow-right" :size="12" /></RouterLink>
          </div>
          <dl class="package-list">
            <div><dt>日期范围</dt><dd>{{ packageRange }}</dd></div>
            <div><dt>记录条数</dt><dd>{{ packageRecords }}</dd></div>
            <div><dt>最后同步</dt><dd>{{ lastSyncClock }}</dd></div>
            <div><dt>今日步数</dt><dd>{{ formatMetric(overview?.steps_today) }} 步</dd></div>
            <div><dt>静息心率</dt><dd>{{ isFiniteNumber(overview?.resting_hr) ? `${formatMetric(overview?.resting_hr)} BPM` : '—' }}</dd></div>
          </dl>
        </article>
      </div>

      <!-- 提示词预览 + AI 交接概览 + 快速操作 -->
      <div class="row-tools">
        <article class="surface-card prompt-card">
          <div class="card-head">
            <h2>提示词预览</h2>
            <RouterLink class="text-link" to="/explore">编辑</RouterLink>
          </div>
          <pre class="prompt-box">{{ PROMPT_PREVIEW }}</pre>
          <button class="button button-secondary" type="button" @click="copyPrompt">
            <Icon :name="promptCopied ? 'check' : 'copy'" :size="14" />{{ promptCopied ? '已复制' : '复制提示词' }}
          </button>
        </article>

        <article class="surface-card readiness-card">
          <div class="card-head"><h2>AI 交接概览</h2></div>
          <div class="readiness-ring">
            <CircularProgress :value="readinessPercent" :size="128" :stroke-width="10" color="var(--accent)" track-color="var(--line)" :show-label="false">
              <div class="ring-center">
                <strong>{{ readinessPercent }}%</strong>
                <span>就绪</span>
              </div>
            </CircularProgress>
          </div>
          <ul class="check-list">
            <li v-for="check in readinessChecks" :key="check.label">
              <Icon name="circle-check" :size="14" :class="{ pending: check.state === '待同步' }" />
              <span>{{ check.label }}</span>
              <em>{{ check.state }}</em>
            </li>
          </ul>
          <RouterLink class="button button-primary readiness-cta" to="/explore">准备交给 AI 工具 <Icon name="arrow-right" :size="14" /></RouterLink>
        </article>

        <article class="surface-card quick-card">
          <div class="card-head"><h2>快速操作</h2></div>
          <div class="quick-grid">
            <RouterLink v-for="action in quickActions" :key="action.label" class="quick-item" :to="action.to">
              <span class="quick-icon"><Icon :name="action.icon" :size="18" /></span>
              <strong>{{ action.label }}</strong>
              <span class="quick-sub">{{ action.sub }}</span>
            </RouterLink>
          </div>
          <RouterLink class="card-foot-link" to="/explore">更多操作，前往 导出与提示词<Icon name="arrow-right" :size="13" /></RouterLink>
        </article>
      </div>

      <!-- 数据处理保证 -->
      <article class="surface-card guarantee-strip">
        <p class="guarantee-title">数据处理保证</p>
        <div class="guarantee-grid">
          <div v-for="item in guarantees" :key="item.title" class="guarantee-item">
            <span class="guarantee-icon"><Icon :name="item.icon" :size="17" /></span>
            <div>
              <strong>{{ item.title }}</strong>
              <span>{{ item.sub }}</span>
            </div>
          </div>
        </div>
      </article>
    </template>
  </section>
</template>

<style scoped>
.explore-page.page { display: grid; gap: 18px; }
.explore-skeleton { display: grid; gap: 18px; }
.hero { min-width: 0; }
.hero h1 { margin-bottom: 8px; font-size: 30px; }
.hero h1 em { color: var(--accent); font-style: normal; }

.partial-warning {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--warning);
  font-size: 12px;
}

/* 安全承诺条 */
.pledge-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr)) auto;
  gap: 20px;
  align-items: center;
  padding: 20px 24px;
}
.pledge-item { min-width: 0; padding-right: 20px; border-right: 1px solid var(--line); }
.pledge-head { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; }
.pledge-head svg { color: var(--accent); }
.pledge-head strong { font-size: 15px; }
.pledge-head span { color: var(--subtle); font-size: 12px; }
.pledge-sub { margin: 0; color: var(--muted); font-size: 12px; }
.pipeline { display: flex; align-items: center; gap: 12px; padding-left: 4px; }
.pipe-node {
  display: grid;
  justify-items: center;
  gap: 6px;
  color: var(--muted);
  font-size: 12px;
  white-space: nowrap;
}
.pipe-node i {
  display: grid;
  place-items: center;
  width: 54px;
  height: 54px;
  border-radius: 14px;
  border: 1px solid var(--line);
  background: var(--surface-raised);
  color: var(--muted);
}
.pipe-node.is-brand i { border-color: rgba(205, 220, 124, .35); color: var(--accent); background: var(--accent-soft); }
.pipe-arrow { color: var(--faint); margin-bottom: 20px; }

/* 卡片通用 */
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}
.card-head h2 { display: inline-flex; align-items: center; gap: 8px; margin: 0; font-size: 15px; font-weight: 700; }
.card-head h2 svg { color: var(--accent); }
.head-note { color: var(--muted); font-size: 12px; }
.text-link { color: var(--accent); font-size: 12px; text-decoration: none; }
.mini-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--muted);
  font-size: 12px;
  text-decoration: none;
}
.mini-btn:hover { color: var(--accent); border-color: var(--accent); }
.card-foot-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-top: 12px;
  color: var(--muted);
  font-size: 12px;
  text-decoration: none;
}
.card-foot-link:hover { color: var(--accent); }

/* 设备 + 数据包 */
.row-devices {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
  gap: 18px;
  align-items: stretch;
}
.devices-card, .package-card, .prompt-card, .readiness-card, .quick-card { padding: 18px 20px; }
.device-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.device-card {
  display: grid;
  justify-items: start;
  gap: 6px;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface-raised);
}
.device-visual {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  border-radius: 14px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--muted);
  margin-bottom: 4px;
}
.device-card strong { font-size: 14px; }
.device-state { display: inline-flex; align-items: center; gap: 5px; color: var(--subtle); font-size: 12px; }
.device-state .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--subtle); }
.device-state.on { color: var(--accent); }
.device-state.on .dot { background: var(--accent); }
.device-sync { color: var(--subtle); font-size: 11px; line-height: 1.5; }
.package-list { display: grid; gap: 12px; margin: 0; }
.package-list > div { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.package-list dt { color: var(--muted); font-size: 12px; }
.package-list dd { margin: 0; color: var(--ink); font-size: 13px; font-variant-numeric: tabular-nums; }

/* 提示词 / 就绪 / 快速操作 */
.row-tools {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: 18px;
  align-items: stretch;
}
.prompt-box {
  margin: 0 0 12px;
  padding: 14px;
  max-height: 260px;
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
  color: var(--muted);
  font-family: var(--font-sans);
  font-size: 12px;
  line-height: 1.8;
  white-space: pre-wrap;
}
.readiness-card { display: flex; flex-direction: column; }
.readiness-ring { display: grid; place-items: center; padding: 6px 0 14px; }
.ring-center { display: grid; justify-items: center; gap: 2px; }
.ring-center strong { font-family: 'Inter', var(--font-sans); font-size: 26px; font-weight: 700; font-variant-numeric: tabular-nums; }
.ring-center span { color: var(--accent); font-size: 12px; }
.check-list { display: grid; gap: 9px; margin: 0 0 14px; padding: 0; list-style: none; }
.check-list li { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); }
.check-list li svg { color: var(--accent); }
.check-list li svg.pending { color: var(--faint); }
.check-list li span { flex: 1; }
.check-list li em { color: var(--accent); font-style: normal; }
.readiness-cta { margin-top: auto; width: 100%; }
.quick-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.quick-item {
  display: grid;
  justify-items: start;
  gap: 4px;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface-raised);
  color: inherit;
  text-decoration: none;
}
.quick-item:hover { border-color: var(--accent); }
.quick-icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 9px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--accent);
  margin-bottom: 2px;
}
.quick-item strong { font-size: 13px; }
.quick-sub { color: var(--subtle); font-size: 11px; }

/* 保证条 */
.guarantee-strip { padding: 16px 20px; }
.guarantee-title { margin: 0 0 12px; font-size: 13px; font-weight: 700; }
.guarantee-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
.guarantee-item { display: flex; align-items: flex-start; gap: 10px; min-width: 0; }
.guarantee-icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  border-radius: 9px;
  border: 1px solid var(--line);
  background: var(--surface-raised);
  color: var(--accent);
}
.guarantee-item strong { display: block; font-size: 13px; }
.guarantee-item span { color: var(--subtle); font-size: 11px; }

@media (max-width: 1100px) {
  .pledge-strip { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .pipeline { grid-column: 1 / -1; justify-content: center; }
  .row-tools { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .quick-card { grid-column: 1 / -1; }
}
@media (max-width: 860px) {
  .pledge-strip { grid-template-columns: minmax(0, 1fr); }
  .pledge-item { border-right: 0; border-bottom: 1px solid var(--line); padding: 0 0 14px; }
  .row-devices, .row-tools { grid-template-columns: minmax(0, 1fr); }
  .guarantee-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 520px) {
  .device-grid, .quick-grid, .guarantee-grid { grid-template-columns: minmax(0, 1fr); }
}
</style>
