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
import { defineMessages, useMessages } from '../i18n';

const messages = defineMessages(
  {
    title: '跑完怎么样',
    handoff: '让 AI 展开分析',
    reading: '正在读取本地记录…',
    comparedTo: (count: number) => `和你自己距离相近的最近 ${count} 次跑步相比：`,
    noComparison: '还没有足够的可比历史记录，所以这次只报数值，不做比较。',
    baselinePrefix: (value: string, delta: string) => `基线 ${value} · ${delta}`,
    baselineSummary: '对比基准是怎么来的',
    // 容差可能没有（后端标成 null）。那时不编一个数字出来，写「—」。
    baselineRule: (days: number, tolerance: number | null | undefined, min: number, max: number) =>
      `规则：只看最近 ${days} 天里距离相差不超过 ±${tolerance ?? '—'}% 的同类跑步，至少 ${min} 次、最多 ${max} 次。`,
    excludedPrefix: '排除：',
    excludedItem: (label: string, count: number) => `${label} ${count} 次 `,
    footnote: '全部结论只和你自己的历史比较，不和任何人群基准比较，也不做医学判断。缺的数据显示「未提供」，不用 0 填补。',
    notProvided: '未提供',
    durationHours: (hours: number, minutes: number) => `${hours} 小时 ${minutes} 分`,
    durationMinutes: (minutes: number) => `${minutes} 分`,
    metric: {
      'run.distance': '距离',
      'run.duration': '用时',
      'run.pace': '平均配速',
      'run.avg_hr': '平均心率',
      'run.training_load': '训练负荷',
    },
    confidence: {
      high: '证据充分',
      medium: '证据一般',
      low: '证据偏少',
      insufficient: '证据不足',
    },
    exclusion: {
      distance_out_of_tolerance: '距离差得太多',
      missing_distance: '没有距离',
      missing_duration: '没有时长',
      implausible_pace: '配速数值不可信',
      beyond_max_samples: '超出取样上限',
    },
  },
  {
    title: 'How the run went',
    handoff: 'Let AI dig in',
    reading: 'Reading local records…',
    comparedTo: (count: number) => `Against your own ${count} most recent runs of a similar distance:`,
    noComparison: 'Not enough comparable history yet, so this run reports its numbers without comparing them.',
    baselinePrefix: (value: string, delta: string) => `baseline ${value} · ${delta}`,
    baselineSummary: 'Where the baseline comes from',
    baselineRule: (days: number, tolerance: number | null | undefined, min: number, max: number) =>
      `The rule: runs of the same type from the last ${days} days whose distance is within ±${tolerance ?? '—'}% of this one, at least ${min} and at most ${max} of them.`,
    excludedPrefix: 'Excluded: ',
    excludedItem: (label: string, count: number) => `${label} ×${count} `,
    footnote: 'Every conclusion here compares you to your own history — never to a population baseline — and none of it is a medical judgement. Missing data reads "Not provided" rather than being filled with a zero.',
    notProvided: 'Not provided',
    durationHours: (hours: number, minutes: number) => `${hours} hr ${minutes} min`,
    durationMinutes: (minutes: number) => `${minutes} min`,
    metric: {
      'run.distance': 'Distance',
      'run.duration': 'Time',
      'run.pace': 'Avg pace',
      'run.avg_hr': 'Avg HR',
      'run.training_load': 'Training load',
    },
    confidence: {
      high: 'Well evidenced',
      medium: 'Some evidence',
      low: 'Thin evidence',
      insufficient: 'Not enough evidence',
    },
    exclusion: {
      distance_out_of_tolerance: 'distance too different',
      missing_distance: 'no distance',
      missing_duration: 'no duration',
      implausible_pace: 'implausible pace',
      beyond_max_samples: 'past the sample cap',
    },
  },
);
const t = useMessages(messages);

const metricLabel = (factId: string, fallback: string): string =>
  (t.value.metric as Record<string, string | undefined>)[factId] ?? fallback;
const confidenceLabel = (confidence: string): string =>
  (t.value.confidence as Record<string, string | undefined>)[confidence] ?? confidence;

const props = defineProps<{
  insight: WorkoutInsight | null;
  loading?: boolean;
  error?: string | null;
}>();
const emit = defineEmits<{ (event: 'handoff'): void }>();

/** 数字变小对这个指标意味着「更好」吗？只影响配色，不影响事实本身。 */
const LOWER_IS_BETTER = new Set(['run.pace', 'run.avg_hr']);

const formatValue = (fact: InsightFact): string => {
  if (fact.value === null) return t.value.notProvided;
  if (fact.metric === 'pace') {
    const total = Math.round(fact.value);
    return `${Math.floor(total / 60)}'${String(total % 60).padStart(2, '0')}"/km`;
  }
  if (fact.metric === 'duration') {
    const total = Math.round(fact.value);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    return hours ? t.value.durationHours(hours, minutes) : t.value.durationMinutes(minutes);
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

const exclusionSummary = computed(() => {
  const counts = new Map<string, number>();
  for (const entry of props.insight?.baseline_excluded ?? []) {
    counts.set(entry.reason, (counts.get(entry.reason) ?? 0) + 1);
  }
  const labels = t.value.exclusion as Record<string, string | undefined>;
  return [...counts.entries()].map(([reason, count]) => ({
    label: labels[reason] || reason,
    count,
  }));
});
</script>

<template>
  <section class="insight-card" aria-labelledby="insight-title">
    <header>
      <h2 id="insight-title"><Icon name="activity" :size="15" />{{ t.title }}</h2>
      <button
        v-if="insight?.supported"
        class="button secondary"
        type="button"
        @click="emit('handoff')"
      ><Icon name="send" :size="14" />{{ t.handoff }}</button>
    </header>

    <p v-if="loading" class="insight-note">{{ t.reading }}</p>
    <p v-else-if="error" class="insight-error" role="alert">{{ error }}</p>

    <template v-else-if="insight && !insight.supported">
      <p class="insight-note">{{ insight.unsupported_reason }}</p>
    </template>

    <template v-else-if="insight">
      <p class="insight-summary">
        <template v-if="hasAnyComparison">
          {{ t.comparedTo(comparedFacts[0].evidence_count) }}
          <span
            v-for="fact in comparedFacts"
            :key="fact.fact_id"
            :class="['delta', deltaTone(fact)]"
          >{{ metricLabel(fact.fact_id, fact.metric) }} {{ deltaText(fact) }}</span>
        </template>
        <template v-else>
          {{ t.noComparison }}
        </template>
      </p>

      <div class="fact-grid">
        <div v-for="fact in facts" :key="fact.fact_id" class="fact">
          <span class="fact-label">{{ metricLabel(fact.fact_id, fact.metric) }}</span>
          <strong>{{ formatValue(fact) }}</strong>
          <span v-if="fact.comparison" :class="['fact-delta', deltaTone(fact)]">
            {{ t.baselinePrefix(formatValue({ ...fact, value: fact.comparison.baseline_value }), deltaText(fact)) }}
          </span>
          <span v-else class="fact-delta muted">{{ confidenceLabel(fact.confidence) }}</span>
        </div>
      </div>

      <details v-if="insight.baseline_included.length || insight.baseline_excluded.length">
        <summary>{{ t.baselineSummary }}</summary>
        <p class="insight-note">
          <template v-if="baselineWindow">
            {{ t.baselineRule(
              baselineWindow.days,
              baselineWindow.distance_tolerance_percent,
              baselineWindow.min_samples,
              baselineWindow.max_samples,
            ) }}
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
          {{ t.excludedPrefix }}
          <span v-for="item in exclusionSummary" :key="item.label">{{ t.excludedItem(item.label, item.count) }}</span>
        </p>
      </details>

      <p class="insight-note">{{ t.footnote }}</p>
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
