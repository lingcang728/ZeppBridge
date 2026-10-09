<script setup lang="ts">
/**
 * 确定性洞察卡片。
 *
 * 每一句话都指得回库里的一行：数值来自这条记录，比较来自明确列出的那几次
 * 历史记录，样本不够就说不够。这里不调用任何 AI，也不做健康建议——AI 是加分，
 * 不是前提。
 */
import GlassSwitch from './GlassSwitch.vue';
import { computed, ref } from 'vue';
import Icon from './Icon.vue';
import ComparisonBars from './ComparisonBars.vue';
import AskAiButton from './ask/AskAiButton.vue';
import GlassPopover from './GlassPopover.vue';
import MdSheet from './ai/MdSheet.vue';
import type { InsightFact, WorkoutInsight } from '../types';
import type { AiTaskPrepareResult } from '../lib/bridge/types';
import { useMessages } from '../i18n';
import {
  distanceUnitLabel,
  paceSecondsPerBigUnit,
  paceUnitLabel,
  toBigDistance,
} from '../lib/units';
import { insightCardMessages as messages } from './InsightCard.i18n';
import { changeArrow, changeTone } from '../lib/changeTone';

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
  askBusy?: boolean;
  askResult?: AiTaskPrepareResult | null;
  askError?: string | null;
  askProvider?: string;
  askProviderIcon?: string;
}>();
const emit = defineEmits<{ handoff: []; copy: []; open: []; reveal: [] }>();
const sheetOpen = ref(false);
const askBtn = ref<{ button: HTMLElement | null } | null>(null);
const askAnchor = computed(() => askBtn.value?.button ?? null);
const openSheet = () => {
  sheetOpen.value = true;
  emit('handoff');
};
/** 「带上前 7 天睡眠和恢复」（1D·D10），默认勾上；在运动页的 useWorkoutDetail 里决定交什么。 */
const withRecovery = defineModel<boolean>('withRecovery', { default: true });

/* 好 / 坏 / 只是变化：和周报同一套规则（lib/changeTone.ts）。距离、时长、训练负荷
   多了不等于更好，只给方向箭头。 */

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

const deltaTone = changeTone;

const deltaText = (fact: InsightFact): string => {
  if (!fact.comparison) return '';
  const sign = fact.comparison.delta_percent > 0 ? '+' : '';
  const arrow = changeTone(fact) === 'neutral' ? `${changeArrow(fact)}\u00a0` : '';
  return `${arrow}${sign}${fact.comparison.delta_percent.toFixed(1)}%`;
};

/* 前后半程。没有数字时整块不出现，不再写一段「为什么没有」。 */
const drift = computed(() => props.insight?.heart_rate_drift ?? null);

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

const facts = computed(() => props.insight?.facts ?? []);
const comparedFacts = computed(() => facts.value.filter((fact) => fact.comparison));
const hasAnyComparison = computed(() => comparedFacts.value.length > 0);
</script>

<template>
  <section class="insight-card" aria-labelledby="insight-title">
    <header>
      <h2 id="insight-title"><Icon name="activity" :size="15" />{{ t.title }}</h2>
      <span v-if="insight?.supported" class="insight-handoff">
        <label class="recovery-toggle" :title="t.withRecoveryHint">
          <GlassSwitch :model-value="withRecovery" :aria-label="t.withRecovery" @update:model-value="withRecovery = !withRecovery" />
          <span>{{ t.withRecovery }}</span>
        </label>
        <AskAiButton ref="askBtn" direct :label="t.title" :busy="askBusy" :expanded="sheetOpen" @activate="openSheet" />
      </span>
    </header>
    <GlassPopover v-if="sheetOpen" :anchor="askAnchor" :width="372" @close="sheetOpen = false">
      <MdSheet :busy="!!askBusy" :result="askResult ?? null" :error="askError ?? null" :provider="askProvider ?? ''" :provider-icon="askProviderIcon ?? ''"
        @copy="emit('copy')" @open="emit('open')" @reveal="emit('reveal')" />
    </GlassPopover>

    <p v-if="loading" class="insight-note">{{ t.reading }}</p>
    <p v-else-if="error" class="insight-error" role="alert">{{ error }}</p>

    <template v-else-if="insight && !insight.supported">
      <p class="insight-note">{{ unsupportedText }}</p>
    </template>

    <template v-else-if="insight">
      <p class="insight-summary">
        <template v-if="hasAnyComparison">
          {{ t.comparedTo(comparedFacts[0].evidence_count) }}
        </template>
        <template v-else>
          {{ t.noComparison }}
        </template>
      </p>

      <div class="fact-grid">
        <div v-for="fact in facts" :key="fact.fact_id" class="fact">
          <span class="fact-label">{{ metricLabel(fact.fact_id, fact.metric) }}</span>
          <strong>{{ formatValue(fact) }}</strong>
          <ComparisonBars v-if="fact.comparison && fact.value !== null" :current="fact.value" :baseline="fact.comparison.baseline_value"
            :current-label="t.currentRun" :baseline-label="t.baselineRun"
            :current-text="formatValue(fact)" :baseline-text="formatValue({ ...fact, value: fact.comparison.baseline_value })" :tone="deltaTone(fact)" />
          <span v-if="fact.comparison" :class="['fact-delta', deltaTone(fact)]">
            {{ deltaText(fact) }}
          </span>
          <span v-else class="fact-delta muted">{{ confidenceLabel(fact.confidence) }}</span>
        </div>
      </div>

      <section v-if="driftRows.length" class="drift" :aria-label="t.driftTitle">
        <p class="drift-head"><strong>{{ t.driftTitle }}</strong></p>
        <div class="drift-grid">
          <div v-for="row in driftRows" :key="row.key" class="fact">
            <span class="fact-label">{{ row.label }}</span>
            <strong>{{ row.perBeat }}</strong>
            <span class="fact-delta muted">{{ row.detail }}</span>
          </div>
        </div>
      </section>
    </template>
  </section>
</template>

<style scoped>
.insight-card {
  display: grid;
  gap: 10px;
  padding: 16px 18px;
  border-radius: var(--radius-lg);
  background: var(--mat-card); box-shadow: var(--mat-rim), var(--mat-shadow);
}
.insight-card header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
.insight-handoff { display: inline-flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 10px 14px; }
.recovery-toggle { display: inline-flex; align-items: center; gap: 8px; color: var(--muted); font-size: var(--fs-xs); cursor: pointer; }
.insight-card h2 { display: flex; align-items: center; gap: 6px; margin: 0; color: var(--ink); font-size: var(--fs-lg); font-weight: 600; }

.insight-summary { margin: 0; color: var(--ink); font-size: var(--fs-md); line-height: 1.7; }
.delta { margin-right: 10px; font-weight: 600; }
.delta.good, .fact-delta.good { color: var(--accent); }
.delta.bad, .fact-delta.bad { color: var(--danger); }
.delta.flat, .fact-delta.flat, .fact-delta.neutral { color: var(--muted); }

/* 好/坏不能只靠绿/红：红绿色觉障碍下这两个状态完全一样。
   统一加一个前置符号，颜色只作为强化。 */
.delta.good::before, .fact-delta.good::before { content: '✓\a0'; font-weight: 700; }
.delta.bad::before, .fact-delta.bad::before { content: '!\a0'; font-weight: 700; }
.delta.flat::before, .fact-delta.flat::before { content: '=\a0'; font-weight: 700; }

.fact-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 230px), 1fr)); gap: 10px; }
.fact { display: grid; align-content: start; min-width: 0; gap: 6px; padding: 10px 12px; border-radius: 12px; background: var(--mat-inset); box-shadow: var(--mat-inset-shadow); }
.fact-label { color: var(--muted); font-size: var(--fs-xs); }
.fact strong { color: var(--ink); font-size: var(--fs-2xl); font-weight: 600; }
.fact-delta { font-size: var(--fs-xs); }
.fact-delta.muted { color: var(--muted); }

details summary { color: var(--subtle); font-size: var(--fs-sm); cursor: pointer; }
.baseline-list { display: grid; gap: 2px; margin: 6px 0; padding-left: 18px; }
.baseline-list a { color: var(--accent); font-size: var(--fs-xs); }

.insight-note { margin: 0; color: var(--subtle); font-size: var(--fs-xs); line-height: 1.6; }
.insight-error { margin: 0; color: var(--danger); font-size: var(--fs-sm); }
.drift { margin-top: 14px; padding-top: 13px; border-top: 1px solid var(--line); }
.drift-head { display: flex; align-items: baseline; gap: 8px; margin: 0 0 4px; }
.drift-head strong { color: var(--ink); font-size: var(--fs-md); }
.drift-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 10px 0 0; }
.insight-note.subtle { color: var(--subtle); }
</style>
