<script setup lang="ts">
/**
 * 单天页里的一条训练（2026-10-12 第 3 批重做；用户：「人工修改体验极差」）：
 *   - 名字、训练目的、要点直接改；缺目的 / 缺要点时红框（发不了）。
 *   - 运动大类、子类型用胶囊分段；旁边一句如实说「手表上还会让你再选一次」（第三方计划只到大类）。
 *   - 总览条（PlanStrip）：点柱子 = 选中那一步并滚过去、展开；悬停时柱子和对应的步骤卡同时高亮。
 *   - 每一步是一张卡：色条、「热身 · 1 公里」、紧跟着目标、›；点开就地展开滚轮精调（StepEditor）和「删掉这一步」，
 *     收起时高度平滑过渡。重复组单独一张组卡，「×N」胶囊左右拨或点 − / + 改轮数，组里改一步每一轮都跟着变。
 *   - 底部四个按钮：+热身 / +一步 / +间歇组 / +放松（默认值见 lib/trainingPlan/edit.ts 的 addTemplate）。
 *   - 不再有任何拖动改图（拖边缘改时长、拖柱身改心率都去掉了）。
 * 所有改动经 useAiHub.queueEdit 攒一下写回草稿的书写格式，由后端重新校验；已经发出去的计划第一下改动时
 * 先拿回来变成草稿。
 */
import { computed, nextTick, ref } from 'vue';
import Icon from '../Icon.vue';
import SegmentTrack from '../SegmentTrack.vue';
import PlanStrip from './PlanStrip.vue';
import StepEditor from './StepEditor.vue';
import { useAiHub } from '../../composables/ai/useAiHub';
import { paced } from '../../lib/motion/timing';
import { workoutProfile, type ProfileSegment, type StepRow } from '../../lib/trainingPlan/profile';
import { INTENSITY_COLOR } from '../../lib/trainingPlan/intensity';
import { SPORT_VARIANTS, retypeWorkout } from '../../lib/trainingPlan/reshape';
import { addStep, removeStep, setRepeat, setStepLength, setStepTarget, setText, type AddKind } from '../../lib/trainingPlan/edit';
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
const root = ref<HTMLElement | null>(null);
/** 展开着的那一步（路径键 `i` / `i.j`）和悬停着的那一步：总览条和步骤卡共用。 */
const open = ref<string | null>(null);
const hovered = ref<string | null>(null);
const profile = computed(() => workoutProfile(props.workout));
const missing = (code: string) => props.issues.some((issue) => issue.message_code === code);

const apply = (change: (document: PlanDocument, index: number) => PlanDocument) => hub.queueEdit((doc) => {
  const index = props.locate(doc);
  return index === null ? doc : change(doc, index);
}, [props.workout.date]);

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

const keyOf = (path: number[]) => path.join('.');
const pathOf = (key: string) => key.split('.').map(Number);
const setLength = (key: string, value: PlanStepLength) => void apply((doc, i) => setStepLength(doc, i, pathOf(key), value));
const setTarget = (key: string, value: PlanTarget) => void apply((doc, i) => setStepTarget(doc, i, pathOf(key), value));
const toggle = (key: string) => { if (props.editable) open.value = open.value === key ? null : key; };
/** 点总览条上的柱子：选中那一步、滚过去、展开。 */
const select = async (key: string) => {
  if (!props.editable) return;
  open.value = key;
  await nextTick();
  root.value?.querySelector(`[data-step="${key}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
};
const remove = (key: string) => {
  open.value = null;
  void apply((doc, i) => removeStep(doc, i, pathOf(key)));
};
const ADDS: AddKind[] = ['warmup', 'step', 'repeat', 'cooldown'];
const addLabel = (kind: AddKind) => ({ warmup: e.value.addWarmup, step: e.value.addStep, repeat: e.value.addRepeat, cooldown: e.value.addCooldown })[kind];
const add = async (kind: AddKind) => {
  let at = -1;
  await apply((doc, i) => {
    const next = addStep(doc, i, kind);
    at = next.index;
    return next.document;
  });
  if (at >= 0) await select(kind === 'repeat' ? `${at}.0` : String(at));
};

/* 「×N」胶囊：左右拨（每 28px 一轮）或点两边的 − / +。 */
let swipe: { x: number; times: number; index: number } | null = null;
const repeatDraft = ref<{ index: number; times: number } | null>(null);
const timesOf = (index: number, times: number) => (repeatDraft.value?.index === index ? repeatDraft.value.times : times);
const startSwipe = (event: PointerEvent, index: number, times: number) => {
  if (!props.editable || (event.target as Element).closest('button')) return;
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

const whatOf = (row: StepRow) => `${intensity(row.intensity)} · ${length(row.length)}`;
const targetOf = (row: StepRow) => (row.target.type === 'open' ? '' : target(row.target));
/** 总览条提示里的读数：和步骤卡上同一句。 */
const rowAt = (path: number[]): StepRow | null => {
  const group = profile.value.groups[path[0]!];
  if (!group) return null;
  return group.kind === 'step' ? group.row : group.rows[path[1] ?? 0] ?? null;
};
const describe = (segment: ProfileSegment) => {
  const row = rowAt(segment.path);
  if (!row) return intensity(segment.intensity);
  const aim = targetOf(row);
  return aim ? `${whatOf(row)} · ${aim}` : whatOf(row);
};

/* 展开 / 收起：高度平滑过渡（只这一块，360ms 开、300ms 收）。 */
const EASE = 'cubic-bezier(.4, .6, .2, 1)';
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const grow = (el: Element, done: () => void) => {
  if (reduced()) { done(); return; }
  const h = (el as HTMLElement).scrollHeight;
  el.animate([{ height: '0px', opacity: 0 }, { height: `${h}px`, opacity: 1 }], { duration: paced(360), easing: EASE }).finished.then(done, done);
};
const shrink = (el: Element, done: () => void) => {
  if (reduced()) { done(); return; }
  const h = (el as HTMLElement).offsetHeight;
  el.animate([{ height: `${h}px`, opacity: 1 }, { height: '0px', opacity: 0 }], { duration: paced(300), easing: EASE }).finished.then(done, done);
};
</script>

<template>
  <article ref="root" class="workout-editor">
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
      <p v-if="pickNote" class="note"><Icon name="watch" :size="14" />{{ pickNote }}</p>
    </div>

    <PlanStrip :profile="profile" :describe="describe" :active="hovered ?? open" :interactive="editable" @select="select" @hover="hovered = $event" />

    <ol class="steps">
      <template v-for="(group, index) in profile.groups" :key="index">
        <li v-if="group.kind === 'step'" :data-step="keyOf([index])" :class="['step-card', { open: open === keyOf([index]), lit: hovered === keyOf([index]) }]" :style="{ '--c': INTENSITY_COLOR[group.row.intensity] }"
          @pointerenter="hovered = keyOf([index])" @pointerleave="hovered = null">
          <button type="button" class="step-head" :aria-expanded="open === keyOf([index])" :disabled="!editable" @click="toggle(keyOf([index]))">
            <i aria-hidden="true"></i><span class="what">{{ whatOf(group.row) }}</span><span v-if="targetOf(group.row)" class="aim">{{ targetOf(group.row) }}</span>
            <Icon class="chev" name="chevron-right" :size="15" />
          </button>
          <Transition :css="false" @enter="grow" @leave="shrink">
            <div v-if="open === keyOf([index])" class="step-body">
              <StepEditor :length="group.row.length" :target="group.row.target" @length="setLength(keyOf([index]), $event)" @target="setTarget(keyOf([index]), $event)" />
              <button type="button" class="pill-button quiet danger" @click="remove(keyOf([index]))"><Icon name="trash" :size="13" />{{ e.deleteStep }}</button>
            </div>
          </Transition>
        </li>
        <li v-else class="group-card">
          <div class="group-head">
            <span class="rep-capsule" :title="e.roundsHint" @pointerdown="startSwipe($event, index, group.times)" @pointermove="moveSwipe" @pointerup="endSwipe" @pointercancel="endSwipe">
              <button type="button" :disabled="!editable || group.times <= 1" :aria-label="`${group.times - 1}`" @click="bump(index, group.times, -1)">−</button>
              <b>×{{ timesOf(index, group.times) }}</b>
              <button type="button" :disabled="!editable || group.times >= 50" :aria-label="`${group.times + 1}`" @click="bump(index, group.times, 1)">+</button>
            </span>
          </div>
          <ol>
            <li v-for="(inner, innerIndex) in group.rows" :key="innerIndex" :data-step="keyOf([index, innerIndex])"
              :class="['step-card', { open: open === keyOf([index, innerIndex]), lit: hovered === keyOf([index, innerIndex]) }]" :style="{ '--c': INTENSITY_COLOR[inner.intensity] }"
              @pointerenter="hovered = keyOf([index, innerIndex])" @pointerleave="hovered = null">
              <button type="button" class="step-head" :aria-expanded="open === keyOf([index, innerIndex])" :disabled="!editable" @click="toggle(keyOf([index, innerIndex]))">
                <i aria-hidden="true"></i><span class="what">{{ whatOf(inner) }}</span><span v-if="targetOf(inner)" class="aim">{{ targetOf(inner) }}</span>
                <Icon class="chev" name="chevron-right" :size="15" />
              </button>
              <Transition :css="false" @enter="grow" @leave="shrink">
                <div v-if="open === keyOf([index, innerIndex])" class="step-body">
                  <StepEditor :length="inner.length" :target="inner.target" @length="setLength(keyOf([index, innerIndex]), $event)" @target="setTarget(keyOf([index, innerIndex]), $event)" />
                  <button type="button" class="pill-button quiet danger" @click="remove(keyOf([index, innerIndex]))"><Icon name="trash" :size="13" />{{ e.deleteStep }}</button>
                </div>
              </Transition>
            </li>
          </ol>
        </li>
      </template>
    </ol>
    <div v-if="editable" class="adds">
      <button v-for="kind in ADDS" :key="kind" type="button" class="add" :style="{ '--c': INTENSITY_COLOR[kind === 'step' ? 'active' : kind === 'repeat' ? 'interval' : kind] }" @click="add(kind)">
        <Icon name="plus" :size="13" />{{ addLabel(kind) }}
      </button>
    </div>
  </article>
</template>

<style scoped src="./PlanWorkoutEditor.css"></style>
