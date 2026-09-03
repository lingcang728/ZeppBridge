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
import {
  distanceUnitLabel,
  paceSecondsPerBigUnit,
  paceUnitLabel,
  toBigDistance,
} from '../lib/units';

const messages = defineMessages(
  {
    title: '跑完怎么样',
    unsupportedWorkoutType: '暂不支持这类运动的洞察。第一版只做已用真实数据验证过的跑步；其他运动仍可正常查看、纠正和导出。',
    handoff: '让 AI 展开分析',
    reading: '正在读取本地记录…',
    comparedTo: (count: number) => `和你自己距离相近的最近 ${count} 次跑步相比：`,
    noComparison: '还没有足够的可比历史记录，所以这次只报数值，不做比较。',
    baselinePrefix: (value: string, delta: string) => `基线 ${value} · ${delta}`,
    driftTitle: '前后半程',
    driftSub: '把这次运动按时间切成两半，比同样的速度各花了多少心跳。',
    driftFirst: '前半程',
    driftSecond: '后半程',
    driftPerBeat: (metres: string) => `${metres} 米/拍`,
    driftHrSpeed: (hr: number, pace: string) => `${hr} bpm · ${pace}`,
    driftDelta: (percent: string) => `${percent}%`,
    driftRising: '后半程维持同样的速度花了更多心跳。',
    driftFlat: '前后半程基本一致。',
    driftFalling: '后半程每一拍跑得比前半程更远。',
    driftNote: '这只是这一次运动自己的前后对比，不和任何人比。红绿灯、爬坡、间歇和 GPS 漂移都会污染它，所以配速不够稳的时候这里不给数字。',
    driftUnavailable: (code: string) => ({
      too_short: '这次太短了，算不了前后半程：前十分钟基本都是心率还在爬，拿它和后半程比量到的是热身，不是漂移。',
      pace_too_variable: '这次的配速起伏太大（间歇、红绿灯或者爬坡都会这样），前后两半根本不可比，所以不给数字。',
      not_enough_samples: '这次没有足够的逐点心率和速度采样，算不了前后半程。',
      unsupported_workout_type: '前后半程对比目前只做跑步 —— 走路和骑行的采样也够算，但还没有拿真实数据验过阈值。',
    } as Record<string, string | undefined>)[code] ?? '这次算不了前后半程。',
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
    unsupportedWorkoutType: 'Insights for this workout type are not supported yet. The first version covers running only, because that is what has been checked against real data. Every other workout still displays, corrects and exports normally.',
    handoff: 'Let AI dig in',
    reading: 'Reading local records…',
    comparedTo: (count: number) => `Against your own ${count} most recent runs of a similar distance:`,
    noComparison: 'Not enough comparable history yet, so this run reports its numbers without comparing them.',
    baselinePrefix: (value: string, delta: string) => `baseline ${value} · ${delta}`,
    driftTitle: 'First half vs second',
    driftSub: 'Splits this workout in two by time and compares how many beats the same speed cost.',
    driftFirst: 'First half',
    driftSecond: 'Second half',
    driftPerBeat: (metres: string) => `${metres} m/beat`,
    driftHrSpeed: (hr: number, pace: string) => `${hr} bpm · ${pace}`,
    driftDelta: (percent: string) => `${percent}%`,
    driftRising: 'Holding the same speed cost more beats in the second half.',
    driftFlat: 'The two halves are essentially the same.',
    driftFalling: 'Each beat carried you further in the second half.',
    driftNote: 'This compares the workout only with itself, never with anyone else. Traffic lights, hills, intervals and GPS drift all contaminate it, so no number is given when the pace was not steady.',
    driftUnavailable: (code: string) => ({
      too_short: 'Too short to split. The first ten minutes are mostly the heart rate still climbing, so comparing them to the second half measures the warm-up, not drift.',
      pace_too_variable: 'The pace varied too much (intervals, traffic lights or hills all look like this), so the two halves are not comparable and no number is given.',
      not_enough_samples: 'Not enough per-point heart rate and speed samples in this workout to split it.',
      unsupported_workout_type: 'The first-half/second-half comparison covers running only for now. Walking and cycling carry enough samples too, but the thresholds have not been checked against real data.',
    } as Record<string, string | undefined>)[code] ?? 'This workout cannot be split.',
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

/* 不支持的原因按后端发来的码渲染。后端那份中文是给 CLI / MCP 的，
   它们的输出不跟界面语言走；界面不认识这个码时才回退到它。 */
const unsupportedText = computed(() => {
  const insight = props.insight;
  if (!insight) return '';
  if (insight.unsupported_code === 'unsupported_workout_type') return t.value.unsupportedWorkoutType;
  return insight.unsupported_reason ?? '';
});

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
    const total = Math.round(paceSecondsPerBigUnit(fact.value));
    return `${Math.floor(total / 60)}'${String(total % 60).padStart(2, '0')}"${paceUnitLabel()}`;
  }
  if (fact.metric === 'duration') {
    const total = Math.round(fact.value);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    return hours ? t.value.durationHours(hours, minutes) : t.value.durationMinutes(minutes);
  }
  if (fact.metric === 'distance') return `${toBigDistance(fact.value).toFixed(2)} ${distanceUnitLabel()}`;
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

/*
 * 前后半程。
 *
 * 后端在条件不满足时给的是原因码而不是数字 —— 这里照样把原因说出来，而不是
 * 把整块藏起来：「这次为什么没有」和「这次是多少」一样值得看见。
 */
const drift = computed(() => props.insight?.heart_rate_drift ?? null);
const driftReason = computed(() => props.insight?.heart_rate_drift_unavailable ?? null);

/** 米/秒 -> 每个显示单位的分秒。0 或非有限值不显示成 0'00"。 */
const paceFromSpeed = (metresPerSecond: number): string => {
  if (!Number.isFinite(metresPerSecond) || metresPerSecond <= 0) return t.value.notProvided;
  const seconds = Math.round(paceSecondsPerBigUnit(1000 / metresPerSecond));
  return `${Math.floor(seconds / 60)}'${String(seconds % 60).padStart(2, '0')}" ${paceUnitLabel()}`;
};

const driftRows = computed(() => {
  const value = drift.value;
  if (!value) return [];
  return [
    {
      key: 'first',
      label: t.value.driftFirst,
      perBeat: t.value.driftPerBeat(value.first_half_metres_per_beat.toFixed(2)),
      detail: t.value.driftHrSpeed(
        Math.round(value.first_half_avg_hr),
        paceFromSpeed(value.first_half_avg_speed_mps),
      ),
    },
    {
      key: 'second',
      label: t.value.driftSecond,
      perBeat: t.value.driftPerBeat(value.second_half_metres_per_beat.toFixed(2)),
      detail: t.value.driftHrSpeed(
        Math.round(value.second_half_avg_hr),
        paceFromSpeed(value.second_half_avg_speed_mps),
      ),
    },
  ];
});

/** 半个百分点以内当作没变化：那个量级是采样噪声，不是身体。 */
const driftVerdict = computed(() => {
  const percent = drift.value?.drift_percent;
  if (percent === undefined) return null;
  if (Math.abs(percent) < 0.5) return { tone: 'flat', text: t.value.driftFlat };
  return percent < 0
    ? { tone: 'bad', text: t.value.driftRising }
    : { tone: 'good', text: t.value.driftFalling };
});

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
      <p class="insight-note">{{ unsupportedText }}</p>
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

      <section class="drift" :aria-label="t.driftTitle">
        <p class="drift-head">
          <strong>{{ t.driftTitle }}</strong>
          <span
            v-if="drift && driftVerdict"
            :class="['delta', driftVerdict.tone]"
          >{{ t.driftDelta(drift.drift_percent.toFixed(1)) }}</span>
        </p>
        <p class="insight-note">{{ t.driftSub }}</p>
        <template v-if="drift">
          <div class="drift-grid">
            <div v-for="row in driftRows" :key="row.key" class="fact">
              <span class="fact-label">{{ row.label }}</span>
              <strong>{{ row.perBeat }}</strong>
              <span class="fact-delta muted">{{ row.detail }}</span>
            </div>
          </div>
          <p v-if="driftVerdict" class="insight-note">{{ driftVerdict.text }}</p>
        </template>
        <p v-else-if="driftReason" class="insight-note">{{ t.driftUnavailable(driftReason) }}</p>
        <p class="insight-note subtle">{{ t.driftNote }}</p>
      </section>

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
              {{ entry.start_time.slice(0, 10) }} · {{ toBigDistance(entry.distance_meters).toFixed(2) }} {{ distanceUnitLabel() }}
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
.drift { margin-top: 14px; padding-top: 13px; border-top: 1px solid var(--line); }
.drift-head { display: flex; align-items: baseline; gap: 8px; margin: 0 0 4px; }
.drift-head strong { color: var(--ink); font-size: 13px; }
.drift-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 10px 0 0; }
.insight-note.subtle { color: var(--subtle); }
</style>
