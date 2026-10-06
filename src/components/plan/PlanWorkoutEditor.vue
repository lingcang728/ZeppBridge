<script setup lang="ts">
/**
 * 单天页里的一条训练（批次 4.2）：
 *   - 名字、训练目的、要点直接改；缺目的 / 缺要点时红框（发不了）。
 *   - 运动大类、子类型用玻璃分段；旁边一行小字如实说「手表上还会让你再选一次」（第三方计划只到大类）。
 *   - 强度图直接拖：右边缘改时长、上下拖改心率区间（PlanChart）。
 *   - 每一步点开是滚轮精调（StepEditor）；重复组的「×N」胶囊左右拨改轮数，组里改一步每一轮都跟着变。
 * 所有改动经 useAiHub.queueEdit 攒一下写回草稿的书写格式，由后端重新校验；已经发出去的计划第一下改动时
 * 先拿回来变成草稿。
 */
import { computed, ref } from 'vue';
import Icon from '../Icon.vue';
import SegmentTrack from '../SegmentTrack.vue';
import PlanChart from './PlanChart.vue';
import StepEditor from './StepEditor.vue';
import { useAiHub } from '../../composables/ai/useAiHub';
import { workoutProfile, type StepRow } from '../../lib/trainingPlan/profile';
import { INTENSITY_COLOR } from '../../lib/trainingPlan/intensity';
import { SPORT_VARIANTS, retypeWorkout } from '../../lib/trainingPlan/reshape';
import { setRepeat, setStepLength, setStepTarget, setText, shiftHeartRate } from '../../lib/trainingPlan/edit';
import type { PlanDocument, PlanIssue, PlanSport, PlanStepLength, PlanTarget, PlanVariant, PlanWorkout } from '../../types/trainingPlan';
import { usePlanText } from './usePlanText';
import { useEditorText } from './editor.i18n';

const props = defineProps<{
  workout: PlanWorkout;
  /** 这条训练在（改动那一刻的）草稿原文里是第几条。 */
  locate: (document: PlanDocument) => number | null;
  issues: PlanIssue[];
  editable: boolean;
}>();
const hub = useAiHub();
const { t, sport, intensity, length, target, variant } = usePlanText();
const e = useEditorText();
const chart = ref<InstanceType<typeof PlanChart> | null>(null);
const open = ref<string | null>(null);
const profile = computed(() => workoutProfile(props.workout));
const missing = (code: string) => props.issues.some((issue) => issue.message_code === code);

const apply = async (change: (document: PlanDocument, index: number) => PlanDocument) => {
  await hub.queueEdit((doc) => {
    const index = props.locate(doc);
    return index === null ? doc : change(doc, index);
  });
  chart.value?.settle();
};

const sportItems = computed(() => (['running', 'cycling', 'pool_swim', 'open_water_swim'] as PlanSport[]).map((value) => ({ value, label: sport(value) })));
const variantItems = computed(() => SPORT_VARIANTS[props.workout.sport].map((value) => ({ value, label: variant(props.workout.sport, value) ?? value })));
const pickNote = computed(() => {
  if (!SPORT_VARIANTS[props.workout.sport].length) return '';
  const name = variant(props.workout.sport, props.workout.variant);
  return name ? t.value.variantPick(name) : t.value.variantPickAny;
});
const setSport = (value: PlanSport) => void apply((doc, i) => retypeWorkout(doc, i, value));
const setVariant = (value: PlanVariant) => void apply((doc, i) => retypeWorkout(doc, i, props.workout.sport, value));
const setField = (field: 'name' | 'focus' | 'description', event: Event) => {
  const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  const current = field === 'name' ? props.workout.name : props.workout[field] ?? '';
  if (value.trim() !== current.trim()) void apply((doc, i) => setText(doc, i, field, value));
};

const onLength = (path: number[], seconds: number) => void apply((doc, i) => setStepLength(doc, i, path, { type: 'time', seconds }));
const onShift = (path: number[], delta: number) => {
  const segment = profile.value.segments.find((s) => s.path.join('.') === path.join('.'));
  if (!segment || segment.low === null || segment.high === null) { chart.value?.settle(); return; }
  const next = shiftHeartRate({ type: 'heart_rate', low: segment.low, high: segment.high }, delta);
  void apply((doc, i) => setStepTarget(doc, i, path, next));
};
const setLength = (path: number[], value: PlanStepLength) => void apply((doc, i) => setStepLength(doc, i, path, value));
const setTarget = (path: number[], value: PlanTarget) => void apply((doc, i) => setStepTarget(doc, i, path, value));
const toggle = (key: string) => { if (props.editable) open.value = open.value === key ? null : key; };

/* 「×N」胶囊：左右拨（每 28px 一轮）或点两边的 − / +。 */
let swipe: { x: number; times: number; index: number } | null = null;
const repeatDraft = ref<{ index: number; times: number } | null>(null);
const timesOf = (index: number, times: number) => (repeatDraft.value?.index === index ? repeatDraft.value.times : times);
const startSwipe = (event: PointerEvent, index: number, times: number) => {
  if (!props.editable) return;
  (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
  swipe = { x: event.clientX, times, index };
};
const moveSwipe = (event: PointerEvent) => {
  if (!swipe) return;
  const times = Math.min(50, Math.max(1, swipe.times + Math.round((event.clientX - swipe.x) / 28)));
  repeatDraft.value = { index: swipe.index, times };
};
const endSwipe = () => {
  const draft = repeatDraft.value;
  const began = swipe;
  swipe = null;
  if (draft && began && draft.times !== began.times) void apply((doc, i) => setRepeat(doc, i, draft.index, draft.times)).then(() => { repeatDraft.value = null; });
  else repeatDraft.value = null;
};
const bump = (index: number, times: number, by: number) => void apply((doc, i) => setRepeat(doc, i, index, times + by));
const rowKey = (path: number[]) => path.join('.');
const rowOf = (row: StepRow) => `${intensity(row.intensity)} ${length(row.length)}`;
</script>

<template>
  <article class="workout-editor">
    <header class="fields">
      <label class="field name"><span>{{ e.nameLabel }}</span>
        <input class="ai-input" type="text" :value="workout.name" :disabled="!editable" maxlength="60" @change="setField('name', $event)" />
      </label>
      <label :class="['field', { bad: missing('ui.training_plan.issue.missing_focus') }]"><span>{{ e.focusLabel }}</span>
        <input class="ai-input" type="text" :value="workout.focus ?? ''" :placeholder="e.focusPlaceholder" :disabled="!editable" maxlength="20" @change="setField('focus', $event)" />
        <small v-if="missing('ui.training_plan.issue.missing_focus')">{{ e.required }}</small>
      </label>
      <label :class="['field', 'wide', { bad: missing('ui.training_plan.issue.missing_description') }]"><span>{{ e.descriptionLabel }}</span>
        <textarea class="ai-input" rows="2" :value="workout.description ?? ''" :placeholder="e.descriptionPlaceholder" :disabled="!editable" @change="setField('description', $event)"></textarea>
        <small v-if="missing('ui.training_plan.issue.missing_description')">{{ e.required }}</small>
      </label>
    </header>
    <div class="kinds">
      <SegmentTrack compact :items="sportItems" :model-value="workout.sport" :disabled="!editable" :aria-label="e.sportLabel" @update:model-value="setSport" />
      <SegmentTrack v-if="variantItems.length" compact :items="variantItems" :model-value="(workout.variant ?? '') as PlanVariant" :disabled="!editable" :aria-label="e.variantLabel" @update:model-value="setVariant" />
      <p v-if="pickNote" class="note"><Icon name="watch" :size="13" />{{ pickNote }}</p>
    </div>
    <div class="chart">
      <PlanChart ref="chart" :profile="profile" :editable="editable" @length="onLength" @shift="onShift" />
      <p v-if="editable" class="note">{{ e.chartHint }}</p>
    </div>
    <ol class="steps">
      <template v-for="(group, index) in profile.groups" :key="index">
        <li v-if="group.kind === 'step'" class="step-block">
          <button type="button" class="step" :class="{ on: open === rowKey([index]) }" :style="{ '--c': INTENSITY_COLOR[group.row.intensity] }" :aria-expanded="open === rowKey([index])" :disabled="!editable" @click="toggle(rowKey([index]))">
            <i aria-hidden="true"></i><span class="what">{{ rowOf(group.row) }}</span><span class="target">{{ target(group.row.target) }}</span>
          </button>
          <StepEditor v-if="open === rowKey([index])" :length="group.row.length" :target="group.row.target" @length="setLength([index], $event)" @target="setTarget([index], $event)" />
        </li>
        <li v-else class="rep">
          <div class="rep-head">
            <span class="rep-capsule" :title="e.roundsHint" @pointerdown="startSwipe($event, index, group.times)" @pointermove="moveSwipe" @pointerup="endSwipe" @pointercancel="endSwipe">
              <button type="button" :disabled="!editable || group.times <= 1" @click="bump(index, group.times, -1)">−</button>
              <b>×{{ timesOf(index, group.times) }}</b>
              <button type="button" :disabled="!editable || group.times >= 50" @click="bump(index, group.times, 1)">+</button>
            </span>
            <small>{{ e.rounds }}</small>
          </div>
          <ol>
            <li v-for="(inner, innerIndex) in group.rows" :key="innerIndex" class="step-block">
              <button type="button" class="step" :class="{ on: open === rowKey([index, innerIndex]) }" :style="{ '--c': INTENSITY_COLOR[inner.intensity] }" :disabled="!editable" @click="toggle(rowKey([index, innerIndex]))">
                <i aria-hidden="true"></i><span class="what">{{ rowOf(inner) }}</span><span class="target">{{ target(inner.target) }}</span>
              </button>
              <StepEditor v-if="open === rowKey([index, innerIndex])" :length="inner.length" :target="inner.target" @length="setLength([index, innerIndex], $event)" @target="setTarget([index, innerIndex], $event)" />
            </li>
          </ol>
        </li>
      </template>
    </ol>
  </article>
</template>

<style scoped>
.workout-editor { display: grid; gap: 16px; min-width: 0; }
.fields { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 10px 16px; }
.field { display: grid; gap: 4px; min-width: 0; color: var(--subtle); font-size: var(--fs-2xs); }
.field.wide { grid-column: 1 / -1; }
.field input, .field textarea { width: 100%; resize: vertical; }
.field.name input { font-size: var(--fs-lg); font-weight: 650; }
.field.bad input, .field.bad textarea { box-shadow: 0 0 0 1.5px var(--danger); }
.field.bad small { color: var(--danger); }
.kinds { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; }
.note { display: flex; align-items: center; gap: 6px; margin: 0; color: var(--subtle); font-size: var(--fs-2xs); line-height: 1.5; }
.chart { display: grid; gap: 6px; }
.steps, .steps ol { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; }
.step { display: grid; grid-template-columns: 14px minmax(0, 1fr) auto; align-items: center; gap: 10px; width: 100%; padding: 8px 6px; border: 0; border-radius: 10px;
  background: transparent; color: var(--muted); font: inherit; font-size: var(--fs-xs); text-align: left; cursor: pointer; transition: background var(--dur-base) ease; }
.step:hover:not(:disabled), .step.on { background: color-mix(in srgb, var(--ink) 4%, transparent); }
.step:disabled { cursor: default; }
.step > i { width: 9px; height: 9px; border-radius: 50%; background: var(--c); box-shadow: 0 0 0 3px color-mix(in srgb, var(--c) 18%, transparent); }
.what { color: var(--ink); }
.target { color: var(--subtle); font-size: var(--fs-2xs); font-variant-numeric: tabular-nums; }
.step-block + .step-block { border-top: 1px solid color-mix(in srgb, var(--line) 60%, transparent); }
.rep { margin: 4px 0; padding: 8px 10px 4px; border-radius: 14px; background: color-mix(in srgb, var(--ink) 4%, transparent); }
.rep-head { display: flex; align-items: center; gap: 8px; color: var(--subtle); font-size: var(--fs-2xs); }
.rep-capsule { display: inline-flex; align-items: center; gap: 2px; padding: 2px; border-radius: 999px; background: var(--cap-track); box-shadow: var(--cap-track-shadow); color: var(--accent); cursor: ew-resize; touch-action: none; user-select: none; }
.rep-capsule b { min-width: 34px; text-align: center; font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
.rep-capsule button { width: 24px; height: 24px; border: 0; border-radius: 50%; background: transparent; color: var(--ink); cursor: pointer; }
.rep-capsule button:hover:not(:disabled) { background: var(--glass-press); }
.rep-capsule button:disabled { opacity: .35; cursor: default; }
@media (max-width: 700px) { .fields { grid-template-columns: minmax(0, 1fr); } }
</style>
