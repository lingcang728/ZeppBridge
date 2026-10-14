<script setup lang="ts">
/**
 * 指标卡上的「问 AI」（精修批次 6.1，10-07 第二轮重做）。
 *
 * - 点开：一块玻璃浮层从这枚按钮里弹出来（GlassPopover），给 2–3 个按这一项配好的问题；点空白 / Esc 缩回按钮。
 * - 选一个：浮层缩回按钮的同时，这张指标卡长成「交给 AI」整页（armPageMorph → usePageMorph 的 expand）——
 *   新开一个任务，只带这一项所属那一类近期的数据、问题填好。返回时缩回同一张卡。
 *   以前问题行在弹窗里、弹窗一关来源就没了，只能硬切进去（用户 10-07 录屏）。
 * 有「比平时高 / 低」标记的卡，这枚按钮更显眼。
 */
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import Icon from '../Icon.vue';
import GlassPopover from '../GlassPopover.vue';
import { askPresets, workoutAskPresets, type AskPreset } from '../../lib/metricAsk';
import { AI_TASK_CATEGORY_META } from '../../lib/aiTask/categories';
import { useAiTaskDraft } from '../../composables/useAiTaskDraft';
import { useMetricBaselines } from '../../composables/useMetricBaselines';
import { armPageMorph } from '../../composables/usePageMorph';
import { useAskText } from './ask.i18n';

const props = defineProps<{
  metric?: string | null;
  /** 单次运动（运动详情头部，第三轮 B6）：问题按运动配，交出去时带上这次运动。和 `metric` 二选一。 */
  workout?: { id: string; label: string } | null;
  label: string;
  /** 形变的来源卡（CSS 选择器，在页面里找）；不给就用按钮所在的那张卡（.trend-card / section）。 */
  card?: string;
  /** 不弹问题、不离开本页：点一下交给外面（运动页洞察卡就地出文件）。 */
  direct?: boolean;
  busy?: boolean;
  /** 外面的浮层开着（direct 时按钮自己没有问题浮层）。 */
  expanded?: boolean;
}>();
const emit = defineEmits<{ activate: [] }>();
const a = useAskText();
const router = useRouter();
const ctl = useAiTaskDraft();
const { baselineOf } = useMetricBaselines();
const open = ref(false);
const button = ref<HTMLElement | null>(null);
const popover = ref<InstanceType<typeof GlassPopover> | null>(null);
const direction = computed(() => baselineOf(props.metric)?.direction ?? null);
const titleId = computed(() => `ask-${props.workout ? `workout-${props.workout.id}` : props.metric ?? 'metric'}`);
const shown = computed(() => !!props.direct || !!props.metric || !!props.workout);
const expandedNow = computed(() => (props.direct ? !!props.expanded : open.value));
const onPress = () => {
  if (props.busy) return;
  if (props.direct) { emit('activate'); return; }
  show();
};
defineExpose({
  get button(): HTMLElement | null { return button.value; },
});
const presets = computed(() => (props.workout ? workoutAskPresets() : props.metric ? askPresets(props.metric) : []));
const questions = computed(() => presets.value.map((preset) => ({ preset, text: questionText(preset) })));
function questionText(preset: AskPreset): string {
  const t = a.value;
  switch (preset.key) {
    case 'first': return direction.value === 'above' ? t.firstAbove(props.label) : direction.value === 'below' ? t.firstBelow(props.label) : t.firstUsual(props.label);
    case 'withTraining': return t.withTraining(props.label);
    case 'withSleep': return t.withSleep;
    case 'sleepWithTraining': return t.sleepWithTraining;
    case 'trainingNext': return t.trainingNext;
    case 'bodyFood': return t.bodyFood(props.label);
    case 'workoutReview': return t.workoutReview(props.label);
    case 'workoutRecovery': return t.workoutRecovery(props.label);
    case 'workoutNext': return t.workoutNext(props.label);
    default: return t.firstUsual(props.label);
  }
}
/** 打开浮层时就把「交给 AI」页的代码块取回来：选完问题形变时第一帧就是真页面。 */
const show = () => {
  open.value = true;
  void import('../../views/AiComposer.vue').catch(() => undefined);
};
const sourceCard = (): HTMLElement | null => {
  if (props.card) return document.getElementById('main-content')?.querySelector<HTMLElement>(props.card) ?? null;
  return button.value?.closest<HTMLElement>('.workout-hero, .trend-card, .surface-card, section') ?? null;
};
/** 新开一个任务：只开这几类、看这么多天、问题填好；浮层缩回按钮，同时卡长成「交给 AI」。 */
const choose = async (preset: AskPreset, text: string) => {
  ctl.resetDraft();
  for (const range of ctl.draft.value.categories) {
    if (!AI_TASK_CATEGORY_META[range.category].hasWindow) continue;
    ctl.setCategoryEnabled(range.category, preset.categories.includes(range.category));
  }
  ctl.setWindowDays(preset.days - 1);
  if (props.workout) ctl.setWorkoutSelected(props.workout.id, true);
  ctl.setPrompt(text);
  void popover.value?.close();
  armPageMorph(sourceCard(), '/ai');
  await router.push('/ai');
};
</script>

<template>
  <button v-if="shown" ref="button" type="button" :disabled="busy" :class="['ask-ai', { lit: !direct && (direction === 'above' || direction === 'below'), open: expandedNow }]" :title="a.ask" :aria-label="a.askTitle(label)"
    aria-haspopup="dialog" :aria-expanded="expandedNow" @click="onPress">
    <Icon name="spark" :size="15" /><span>{{ a.ask }}</span>
  </button>
  <GlassPopover v-if="open && !direct" ref="popover" :anchor="button" :labelledby="titleId" @close="open = false">
    <h2 :id="titleId" class="ask-title" data-pop-item><Icon name="spark" :size="16" />{{ a.askTitle(label) }}</h2>
    <p class="ask-hint" data-pop-item>{{ workout ? a.workoutHint : a.askHint }}</p>
    <button v-for="item in questions" :key="item.preset.key" type="button" class="question" data-pop-item @click="choose(item.preset, item.text)">
      <span>{{ item.text }}</span><Icon name="arrow-right" :size="15" />
    </button>
  </GlassPopover>
</template>

<style scoped>
/* 一枚小玻璃胶囊：比正文显眼，但不抢读数。有「比平时高 / 低」标记时染上强调色、带一圈细光。 */
.ask-ai { display: inline-flex; align-items: center; gap: 5px; height: 30px; padding: 0 12px 0 10px; border: 0; border-radius: 999px;
  background: var(--mat-inset); box-shadow: var(--mat-inset-shadow); color: var(--ink); font: inherit; font-size: var(--fs-xs); font-weight: 650;
  white-space: nowrap; cursor: pointer; transition: background var(--dur-base) ease, color var(--dur-base) ease, box-shadow var(--dur-base) ease, transform 160ms ease; }
.ask-ai :deep(svg) { color: var(--accent); }
.ask-ai:hover, .ask-ai.open { background: color-mix(in srgb, var(--accent) 12%, var(--mat-inset)); }
.ask-ai:active { transform: scale(.96); }
.ask-ai.lit { background: color-mix(in srgb, var(--accent) 20%, var(--mat-inset)); box-shadow: var(--mat-inset-shadow), 0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent);
  color: var(--accent); }
.ask-ai:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.ask-ai:disabled { cursor: progress; }
.ask-title { display: flex; align-items: center; gap: 8px; margin: 0; font-size: var(--fs-md); line-height: 1.3; }
.ask-title :deep(svg) { flex: 0 0 auto; color: var(--accent); }
.ask-hint { margin: 0 0 4px; color: var(--muted); font-size: var(--fs-xs); line-height: 1.55; }
.question { display: grid; grid-template-columns: minmax(0, 1fr) 16px; align-items: center; gap: 10px; padding: 12px 14px; border: 0; border-radius: 14px;
  background: color-mix(in srgb, var(--ink) 6%, transparent); color: var(--ink); font: inherit; font-size: var(--fs-sm); line-height: 1.4; text-align: left; cursor: pointer;
  transition: background var(--dur-base) ease, transform 160ms ease; }
.question :deep(svg) { color: var(--subtle); transition: transform var(--dur-base) ease, color var(--dur-base) ease; }
.question:hover, .question:focus-visible { outline: none; background: color-mix(in srgb, var(--accent) 14%, transparent); }
.question:hover :deep(svg), .question:focus-visible :deep(svg) { color: var(--accent); transform: translateX(3px); }
.question:active { transform: scale(.985); }
</style>
