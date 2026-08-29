<script setup lang="ts">
/**
 * 确定性洞察卡片。
 *
 * 每一句话都指得回库里的一行：数值来自这条记录，比较来自明确列出的那几次
 * 历史记录，样本不够就说不够。这里不调用任何 AI，也不做健康建议——AI 是加分，
 * 不是前提。
 */
import { computed } from 'vue';
import Icon from './Icon.vue';
import type { InsightFact, WorkoutInsight } from '../types';

const props = defineProps<{
  insight: WorkoutInsight | null;
  loading?: boolean;
  error?: string | null;
}>();
const emit = defineEmits<{ (event: 'handoff'): void }>();

const METRIC_LABEL: Record<string, string> = {
  'run.distance': '距离',
  'run.duration': '用时',
  'run.pace': '平均配速',
  'run.avg_hr': '平均心率',
  'run.training_load': '训练负荷',
};

/** 数字变小对这个指标意味着「更好」吗？只影响配色，不影响事实本身。 */
const LOWER_IS_BETTER = new Set(['run.pace', 'run.avg_hr']);

const CONFIDENCE_LABEL: Record<string, string> = {
  high: '证据充分',
  medium: '证据一般',
  low: '证据偏少',
  insufficient: '证据不足',
};

const formatValue = (fact: InsightFact): string => {
  if (fact.value === null) return '未提供';
  if (fact.metric === 'pace') {
    const total = Math.round(fact.value);
    return `${Math.floor(total / 60)}'${String(total % 60).padStart(2, '0')}"/km`;
  }
  if (fact.metric === 'duration') {
    const total = Math.round(fact.value);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    return hours ? `${hours} 小时 ${minutes} 分` : `${minutes} 分`;
  }
  if (fact.metric === 'distance') return `${(fact.value / 1000).toFixed(2)} km`;
  return `${Math.round(fact.value)} ${fact.unit}`;
};

const deltaTone = (fact: InsightFact): 'good' | 'bad' | 'flat' => {
  if (!fact.comparison || fact.comparison.direction === 'same') return 'flat';
  const lower = fact.comparison.direction === 'lower';
  return LOWER_IS_BETTER.has(fact.fact_id) === lower ? 'good' : 'bad';
};

const deltaText = (fact: InsightFact): string => {
  if (!fact.comparison) return '';
  const sign = fact.comparison.delta_percent > 0 ? '+' : '';
  return `${sign}${fact.comparison.delta_percent.toFixed(1)}%`;
};

const facts = computed(() => props.insight?.facts ?? []);
const baselineWindow = computed(() => facts.value.find((fact) => fact.baseline_window)?.baseline_window ?? null);
const comparedFacts = computed(() => facts.value.filter((fact) => fact.comparison));
const hasAnyComparison = computed(() => comparedFacts.value.length > 0);

const EXCLUSION_LABEL: Record<string, string> = {
  distance_out_of_tolerance: '距离差得太多',
  missing_distance: '没有距离',
  missing_duration: '没有时长',
  implausible_pace: '配速数值不可信',
  beyond_max_samples: '超出取样上限',
};

const exclusionSummary = computed(() => {
  const counts = new Map<string, number>();
  for (const entry of props.insight?.baseline_excluded ?? []) {
    counts.set(entry.reason, (counts.get(entry.reason) ?? 0) + 1);
  }
  return [...counts.entries()].map(([reason, count]) => ({
    label: EXCLUSION_LABEL[reason] || reason,
    count,
  }));
});
</script>

<template>
  <section class="insight-card" aria-labelledby="insight-title">
    <header>
      <h2 id="insight-title"><Icon name="activity" :size="15" />跑完怎么样</h2>
      <button
        v-if="insight?.supported"
        class="button secondary"
        type="button"
        @click="emit('handoff')"
      ><Icon name="send" :size="14" />让 AI 展开分析</button>
    </header>

    <p v-if="loading" class="insight-note">正在读取本地记录…</p>
    <p v-else-if="error" class="insight-error" role="alert">{{ error }}</p>

    <template v-else-if="insight && !insight.supported">
      <p class="insight-note">{{ insight.unsupported_reason }}</p>
    </template>

    <template v-else-if="insight">
      <p class="insight-summary">
        <template v-if="hasAnyComparison">
          和你自己距离相近的最近
          {{ comparedFacts[0].evidence_count }} 次跑步相比：
          <span
            v-for="fact in comparedFacts"
            :key="fact.fact_id"
            :class="['delta', deltaTone(fact)]"
          >{{ METRIC_LABEL[fact.fact_id] || fact.metric }} {{ deltaText(fact) }}</span>
        </template>
        <template v-else>
          还没有足够的可比历史记录，所以这次只报数值，不做比较。
        </template>
      </p>

      <div class="fact-grid">
        <div v-for="fact in facts" :key="fact.fact_id" class="fact">
          <span class="fact-label">{{ METRIC_LABEL[fact.fact_id] || fact.metric }}</span>
          <strong>{{ formatValue(fact) }}</strong>
          <span v-if="fact.comparison" :class="['fact-delta', deltaTone(fact)]">
            基线 {{ formatValue({ ...fact, value: fact.comparison.baseline_value }) }} · {{ deltaText(fact) }}
          </span>
          <span v-else class="fact-delta muted">{{ CONFIDENCE_LABEL[fact.confidence] }}</span>
        </div>
      </div>

      <details v-if="insight.baseline_included.length || insight.baseline_excluded.length">
        <summary>对比基准是怎么来的</summary>
        <p class="insight-note">
          <template v-if="baselineWindow">
            规则：只看最近 {{ baselineWindow.days }} 天里距离相差不超过
            ±{{ baselineWindow.distance_tolerance_percent }}% 的同类跑步，
            至少 {{ baselineWindow.min_samples }} 次、最多 {{ baselineWindow.max_samples }} 次。
          </template>
        </p>
        <ul class="baseline-list">
          <li v-for="entry in insight.baseline_included" :key="entry.workout_id">
            <RouterLink :to="`/workouts/${entry.workout_id}`">
              {{ entry.start_time.slice(0, 10) }} · {{ (entry.distance_meters / 1000).toFixed(2) }} km
            </RouterLink>
          </li>
        </ul>
        <p v-if="exclusionSummary.length" class="insight-note">
          排除：
          <span v-for="item in exclusionSummary" :key="item.label">{{ item.label }} {{ item.count }} 次 </span>
        </p>
      </details>

      <p class="insight-note">
        全部结论只和你自己的历史比较，不和任何人群基准比较，也不做医学判断。缺的数据显示「未提供」，不用 0 填补。
      </p>
    </template>
  </section>
</template>

<style scoped>
.insight-card {
  display: grid;
  gap: 10px;
  padding: 16px 18px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--surface);
}
.insight-card header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.insight-card h2 { display: flex; align-items: center; gap: 6px; margin: 0; color: var(--ink); font-size: 14px; font-weight: 500; }

.insight-summary { margin: 0; color: var(--ink); font-size: 13px; line-height: 1.7; }
.delta { margin-right: 10px; font-weight: 500; }
.delta.good, .fact-delta.good { color: var(--accent); }
.delta.bad, .fact-delta.bad { color: var(--danger); }
.delta.flat, .fact-delta.flat { color: var(--muted); }

.fact-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; }
.fact { display: grid; gap: 2px; padding: 10px 12px; border-radius: 12px; background: var(--surface-raised); }
.fact-label { color: var(--muted); font-size: 11px; }
.fact strong { color: var(--ink); font-size: 16px; font-weight: 500; }
.fact-delta { font-size: 11px; }
.fact-delta.muted { color: var(--muted); }

details summary { color: var(--subtle); font-size: 12px; cursor: pointer; }
.baseline-list { display: grid; gap: 2px; margin: 6px 0; padding-left: 18px; }
.baseline-list a { color: var(--accent); font-size: 11px; }

.insight-note { margin: 0; color: var(--subtle); font-size: 11px; line-height: 1.6; }
.insight-error { margin: 0; color: var(--danger); font-size: 12px; }
</style>
