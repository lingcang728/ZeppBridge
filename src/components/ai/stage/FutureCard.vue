<script setup lang="ts">
/**
 * 舞台右边那一张牌（2026-10-08，用户拍板「一张牌的一生」）：
 *
 *   问题牌（你在牌上写这次想问什么，牌底一条玻璃分段选模板）
 *     → 按门锁：左边的牌飞进锁，**回执牌**从锁里长出来落在这里（ReceiptFace：交出去的 .md 文件卡）
 *     → 接回 AI 的定稿：回执牌翻面成**计划牌**（PlanFace，点开进 /ai/plan）。
 *
 * 朝外的那一面后面错开垫着「另一张」：问题 / 回执时垫着计划牌，计划朝外时垫着问题牌。
 * 点垫着的那张 = 翻面换过来（2D 压扁换面，flipCard）。
 */
import { computed, nextTick, ref } from 'vue';
import SegmentTrack from '../../SegmentTrack.vue';
import Icon from '../../Icon.vue';
import ReceiptFace from './ReceiptFace.vue';
import PlanFace from './PlanFace.vue';
import { flipCard } from '../../../lib/motion/cards';
import type { AiTaskIssue, AiTaskPrepareResult, AiTaskTemplate } from '../../../lib/bridge/types';
import type { DayRow } from '../../../lib/trainingPlan/week';
import type { TrainingPlanState } from '../../../types/trainingPlan';
import type { HandoffStep, HandoffStepId } from '../../../composables/useAiTaskHandoff';
import type { FutureFace } from '../../../composables/ai/useStageSend';
import { useAiTaskDraft } from '../../../composables/useAiTaskDraft';
import { aiTaskIssueText } from '../../../lib/aiTask/copy';
import type { Box } from '../../../lib/aiTask/stageLayout';
import { useBridgeText } from '../bridge/bridge.i18n';
import { useStageText } from './stage.i18n';

const props = defineProps<{
  box: Box; face: FutureFace; templates: AiTaskTemplate[]; disabled: boolean;
  ready: AiTaskPrepareResult | null; blocked: AiTaskIssue[]; provider: string; stale: boolean; recalled: boolean;
  steps: Record<HandoffStepId, HandoffStep>; saveError: string | null;
  rows: DayRow[]; drafting: boolean; plan: TrainingPlanState | null; mcp: boolean;
}>();
const emit = defineEmits<{
  'update:face': [FutureFace]; copy: []; open: []; reveal: []; retry: [HandoffStepId]; received: []; accept: []; discard: []; workout: [];
}>();
const ctl = useAiTaskDraft();
const t = useBridgeText();
const s = useStageText();
const front = ref<HTMLElement | null>(null);
const input = ref<HTMLTextAreaElement | null>(null);

/* ---------- 模板：五档玻璃分段（自由问 + 四个模板），同旧的模板胶囊 ---------- */
type Intent = 'free' | 'sleep' | 'week' | 'workout' | 'next';
const TEMPLATE_OF: Record<Exclude<Intent, 'free'>, { id: string; days: number }> = {
  sleep: { id: 'sleep_review', days: 14 }, week: { id: 'week_review', days: 7 }, workout: { id: 'recovery_run', days: 14 }, next: { id: 'next_week', days: 30 },
};
const intents = computed(() => [
  { value: 'free' as Intent, label: s.value.freeIntent },
  { value: 'sleep' as Intent, label: s.value.sleepShort, title: t.value.sleepIntentHint },
  { value: 'week' as Intent, label: s.value.weekShort, title: t.value.weekIntentHint },
  { value: 'workout' as Intent, label: s.value.workoutShort, title: t.value.workoutIntentHint },
  { value: 'next' as Intent, label: s.value.nextShort, title: t.value.nextIntentHint },
]);
const intent = computed<Intent>(() => (Object.entries(TEMPLATE_OF).find(([, v]) => v.id === ctl.draft.value.template_id)?.[0] as Intent | undefined) ?? 'free');
const pick = async (next: Intent) => {
  if (props.disabled || next === intent.value) return;
  if (next === 'free') {
    ctl.setTemplate(null);
  } else {
    const spec = TEMPLATE_OF[next];
    ctl.setTemplate(props.templates.find((p) => p.id === spec.id) ?? null);
    ctl.setWindowDays(spec.days - 1);
    ctl.setPrompt({ sleep: t.value.sleepQuestion, week: t.value.weekQuestion, workout: t.value.workoutQuestion, next: t.value.nextQuestion }[next]);
    if (next === 'workout') emit('workout');
  }
  if (props.face !== 'question') await turn('question');
  await nextTick();
  input.value?.focus();
};

/* ---------- 翻面 ---------- */
const back = computed<FutureFace | null>(() => (props.face === 'plan' ? 'question' : props.rows.length || props.mcp ? 'plan' : null));
const turn = async (next: FutureFace) => {
  if (!front.value) { emit('update:face', next); return; }
  await flipCard(front.value, async () => { emit('update:face', next); await nextTick(); });
};
const backLabel = computed(() => (back.value === 'plan' ? s.value.planPeek : s.value.questionTitle));

defineExpose({ front, turn });
</script>

<template>
  <div class="future" :style="{ left: `${box.x}px`, top: `${box.y}px`, width: `${box.width}px`, '--card-h': `${box.height}px` }">
    <div class="stack">
      <button v-if="back" type="button" class="fcard behind" :aria-label="backLabel" @click="turn(back)">
        <span class="peek"><Icon :name="back === 'plan' ? 'compass' : 'edit'" :size="13" />{{ backLabel }}</span>
      </button>
      <section ref="front" :class="['fcard', 'front', `face-${face}`]">
        <template v-if="face === 'question'">
          <label class="question">
            <span>{{ t.composer }}</span>
            <textarea ref="input" :value="ctl.draft.value.prompt" :placeholder="t.placeholder" :disabled="disabled" @input="ctl.setPrompt(($event.target as HTMLTextAreaElement).value)"></textarea>
          </label>
          <div class="templates">
            <SegmentTrack compact :items="intents" :model-value="intent" :disabled="disabled" :aria-label="t.composer" @update:model-value="pick" />
          </div>
          <ul v-if="blocked.length" class="issues" role="alert">
            <li v-for="(issue, i) in blocked" :key="i"><Icon name="warning" :size="13" />{{ aiTaskIssueText(issue) }}</li>
          </ul>
        </template>
        <ReceiptFace v-else-if="face === 'receipt'" :ready="ready" :provider="provider" :stale="stale" :recalled="recalled" :steps="steps" :save-error="saveError"
          :question="ctl.draft.value.prompt" @copy="emit('copy')" @open="emit('open')" @reveal="emit('reveal')" @retry="emit('retry', $event)"
          @edit="turn('question')" @received="emit('received')" />
        <PlanFace v-else :rows="rows" :drafting="drafting" :state="plan" :mcp="mcp" @received="emit('received')" @accept="emit('accept')" @discard="emit('discard')" />
      </section>
    </div>
  </div>
</template>

<style scoped>
.future { position: absolute; }
.stack { position: relative; height: var(--card-h); }
/* 模板：问题牌底边一条玻璃分段，长语言在牌里自己折行。 */
.templates { display: flex; min-width: 0; padding-top: 12px; border-top: 1px solid var(--mat-line); }
.templates :deep(.segment-track) { max-width: 100%; }
.fcard { position: absolute; inset: 0; border-radius: 24px; background: var(--mat-card); box-shadow: var(--mat-rim), var(--mat-shadow); border: 1px solid var(--mat-line); color: var(--ink); }
.front { display: grid; padding: 18px 18px 16px; overflow: hidden; }
/* 垫着的那张：往右上错开、歪一点，只露出上沿写着名字的那一条。 */
.behind { translate: 6px -30px; rotate: -1.5deg; scale: .97; padding: 0; cursor: pointer; opacity: .9; transition: translate 260ms cubic-bezier(.3, 1.3, .5, 1), opacity var(--dur-base) ease; }
.behind:hover { translate: 8px -40px; opacity: 1; }
.behind:focus-visible { outline: 2px solid var(--focus); outline-offset: 3px; }
.peek { position: absolute; top: 7px; right: 22px; display: inline-flex; align-items: center; gap: 5px; color: var(--muted); font-size: var(--fs-2xs); font-weight: 650; }
.front.face-question { grid-template-rows: minmax(0, 1fr) auto auto; gap: 12px; }
.question { display: grid; grid-template-rows: auto 1fr; gap: 10px; min-height: 0; }
.question > span { color: var(--subtle); font-size: var(--fs-xs); }
.question textarea { width: 100%; min-height: 0; padding: 0; border: 0; outline: 0; background: none; resize: none; color: var(--ink); font: 17px / 1.65 var(--font-sans); }
.question textarea::placeholder { color: var(--subtle); opacity: .75; }
.front.face-question:focus-within { box-shadow: var(--mat-rim), var(--mat-shadow), inset 0 0 0 1px var(--line-strong); }
.issues { display: grid; gap: 6px; margin: 10px 0 0; padding: 0; list-style: none; color: var(--danger, var(--warning)); font-size: var(--fs-2xs); }
.issues li { display: flex; gap: 6px; }
@media (prefers-reduced-motion: reduce) { .behind { transition: none; } }
</style>
