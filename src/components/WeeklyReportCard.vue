<script setup lang="ts">
/**
 * 本地周报：最近 7 天对比你自己此前 28 天。
 *
 * 全部在本机确定性计算，不调用 AI。每条结论都带样本数、来源和置信度，
 * 不足就说不足。**只和你自己的历史比**——项目没有人群基准数据，也不打算有；
 * 这里不做诊断、治疗或风险预测。
 */
import { computed, onMounted, ref, watch } from 'vue';
import Icon from './Icon.vue';
import SkeletonBlock from './SkeletonBlock.vue';
import { useSyncController } from '../composables/useSyncController';
import { backend, isDesktop, toUserMessage } from '../lib/bridge';
import type { InsightFact, WeeklyReport } from '../types';

const { dataRevision } = useSyncController();

const report = ref<WeeklyReport | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

const LABEL: Record<string, string> = {
  'weekly.resting_hr': '静息心率',
  'weekly.hrv': 'HRV',
  'weekly.stress': '压力',
  'weekly.sleep_duration': '睡眠时长',
  'weekly.sleep_start_regularity': '入睡时间波动',
  'weekly.workout_count': '训练次数',
  'weekly.training_load': '训练负荷',
};

/** 数字变小对这个指标意味着「更好」吗？只影响配色，不改变事实。 */
const LOWER_IS_BETTER = new Set([
  'weekly.resting_hr',
  'weekly.stress',
  'weekly.sleep_start_regularity',
]);

const CONFIDENCE_LABEL: Record<string, string> = {
  high: '证据充分',
  medium: '证据一般',
  low: '证据偏少',
  insufficient: '证据不足',
};

const load = async () => {
  if (!isDesktop()) {
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = null;
  try {
    report.value = await backend.getWeeklyReport();
  } catch (cause) {
    error.value = toUserMessage(cause, '无法生成本地周报');
  } finally {
    loading.value = false;
  }
};

onMounted(() => void load());
watch(dataRevision, () => void load());

const formatValue = (fact: InsightFact): string => {
  if (fact.value === null) return '未提供';
  if (fact.metric === 'sleep_duration') {
    const total = Math.round(fact.value);
    return `${Math.floor(total / 60)} 小时 ${total % 60} 分`;
  }
  if (fact.metric === 'sleep_start_regularity') return `±${Math.round(fact.value)} 分`;
  if (fact.metric === 'workout_count') return `${Math.round(fact.value)} 次`;
  return `${Math.round(fact.value)} ${fact.unit}`;
};

const tone = (fact: InsightFact): 'good' | 'bad' | 'flat' => {
  if (!fact.comparison || fact.comparison.direction === 'same') return 'flat';
  const lower = fact.comparison.direction === 'lower';
  return LOWER_IS_BETTER.has(fact.fact_id) === lower ? 'good' : 'bad';
};

/** 有数据的排前面；完全没有数据的沉底，但不隐藏——缺失本身也是信息。 */
const facts = computed(() => [...(report.value?.facts ?? [])].sort((a, b) => {
  const rank = (fact: InsightFact) => (fact.comparison ? 0 : fact.value === null ? 2 : 1);
  return rank(a) - rank(b);
}));
</script>

<template>
  <section class="weekly-card" aria-labelledby="weekly-title">
    <header>
      <h2 id="weekly-title"><Icon name="activity" :size="15" />这一周</h2>
      <span v-if="report" class="weekly-window">
        {{ report.recent_start }} ~ {{ report.recent_end }} · 对比你自己 {{ report.baseline_start }} ~ {{ report.baseline_end }}
      </span>
    </header>

    <SkeletonBlock v-if="loading" height="120px" />
    <p v-else-if="error" class="weekly-error" role="alert">{{ error }}</p>
    <p v-else-if="!report" class="weekly-note">周报需要从 ZeppBridge 桌面应用打开。</p>

    <template v-else>
      <div class="weekly-grid">
        <div v-for="fact in facts" :key="fact.fact_id" class="weekly-item">
          <span class="weekly-label">{{ LABEL[fact.fact_id] || fact.metric }}</span>
          <strong>{{ formatValue(fact) }}</strong>
          <span v-if="fact.comparison" :class="['weekly-delta', tone(fact)]">
            {{ fact.comparison.delta_percent > 0 ? '+' : '' }}{{ fact.comparison.delta_percent.toFixed(1) }}%
            · {{ CONFIDENCE_LABEL[fact.confidence] }}（{{ fact.evidence_count }} 项证据）
          </span>
          <span v-else class="weekly-delta muted">{{ fact.reason || CONFIDENCE_LABEL[fact.confidence] }}</span>
        </div>
      </div>
      <p class="weekly-note">
        全部在本机计算，只和你自己此前 28 天比较，不和任何人群基准比较，也不做医学判断。没有数据的项显示「未提供」。
      </p>
    </template>
  </section>
</template>

<style scoped>
.weekly-card {
  display: grid;
  gap: 10px;
  padding: 16px 18px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--surface);
}
.weekly-card header { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 8px; }
.weekly-card h2 { display: flex; align-items: center; gap: 6px; margin: 0; color: var(--ink); font-size: 14px; font-weight: 500; }
.weekly-window { color: var(--muted); font-size: 11px; }

.weekly-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; }
.weekly-item { display: grid; gap: 2px; padding: 10px 12px; border-radius: 12px; background: var(--surface-raised); }
.weekly-label { color: var(--muted); font-size: 11px; }
.weekly-item strong { color: var(--ink); font-size: 16px; font-weight: 500; }
.weekly-delta { font-size: 11px; line-height: 1.5; }
.weekly-delta.good { color: var(--accent); }
.weekly-delta.bad { color: var(--danger); }
.weekly-delta.flat, .weekly-delta.muted { color: var(--muted); }

.weekly-note { margin: 0; color: var(--subtle); font-size: 11px; line-height: 1.6; }
.weekly-error { margin: 0; color: var(--danger); font-size: 12px; }
</style>
