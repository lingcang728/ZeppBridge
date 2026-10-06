<script setup lang="ts">
/**
 * 指标卡右上角的「问 AI」（精修批次 6.1）。点开是从这枚按钮长出来的玻璃浮层（ModalDialog 的 dialogFlight），
 * 给 2–3 个按这一项配好的问题；选一个就新开一个任务——只带这一项所属那一类近期的数据、问题填好——
 * 然后从被点的那一行形变进「交给 AI」（链接标了 data-morph-card）。有「比平时高 / 低」标记的卡，这枚按钮更显眼。
 */
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import Icon from '../Icon.vue';
import ModalDialog from '../ModalDialog.vue';
import { askPresets, type AskPreset } from '../../lib/metricAsk';
import { AI_TASK_CATEGORY_META } from '../../lib/aiTask/categories';
import { useAiTaskDraft } from '../../composables/useAiTaskDraft';
import { useMetricBaselines } from '../../composables/useMetricBaselines';
import { useAskText } from './ask.i18n';

const props = defineProps<{ metric: string | null | undefined; label: string }>();
const a = useAskText();
const router = useRouter();
const ctl = useAiTaskDraft();
const { baselineOf } = useMetricBaselines();
const open = ref(false);
const direction = computed(() => baselineOf(props.metric)?.direction ?? null);
const titleId = computed(() => `ask-${props.metric ?? 'metric'}`);
const questions = computed(() => (props.metric ? askPresets(props.metric) : []).map((preset) => ({ preset, text: questionText(preset) })));
function questionText(preset: AskPreset): string {
  const t = a.value;
  switch (preset.key) {
    case 'first': return direction.value === 'above' ? t.firstAbove(props.label) : direction.value === 'below' ? t.firstBelow(props.label) : t.firstUsual(props.label);
    case 'withTraining': return t.withTraining(props.label);
    case 'withSleep': return t.withSleep;
    case 'sleepWithTraining': return t.sleepWithTraining;
    case 'trainingNext': return t.trainingNext;
    case 'bodyFood': return t.bodyFood(props.label);
    default: return t.firstUsual(props.label);
  }
}
/** 新开一个任务：只开这几类、看这么多天、问题填好，再去交给 AI。 */
const choose = async (preset: AskPreset, text: string) => {
  ctl.resetDraft();
  for (const range of ctl.draft.value.categories) {
    if (!AI_TASK_CATEGORY_META[range.category].hasWindow) continue;
    ctl.setCategoryEnabled(range.category, preset.categories.includes(range.category));
  }
  ctl.setWindowDays(preset.days - 1);
  ctl.setPrompt(text);
  open.value = false;
  await router.push('/ai');
};
</script>

<template>
  <button v-if="metric" type="button" :class="['ask-ai', { lit: direction === 'above' || direction === 'below' }]" :title="a.ask" :aria-label="a.askTitle(label)" @click="open = true">
    <Icon name="spark" :size="13" /><span>{{ a.ask }}</span>
  </button>
  <ModalDialog v-if="open" :labelledby="titleId" @close="open = false">
    <div class="ask-sheet">
      <h2 :id="titleId">{{ a.askTitle(label) }}</h2>
      <p>{{ a.askHint }}</p>
      <a v-for="item in questions" :key="item.preset.key" href="/ai" class="question" data-morph-card @click.prevent="choose(item.preset, item.text)">
        <Icon name="spark" :size="14" /><span>{{ item.text }}</span><Icon name="chevron-right" :size="14" />
      </a>
    </div>
  </ModalDialog>
</template>

<style scoped>
.ask-ai { display: inline-flex; align-items: center; gap: 4px; padding: 3px 9px; border: 0; border-radius: 999px; background: transparent; color: var(--subtle);
  font: inherit; font-size: var(--fs-2xs); cursor: pointer; transition: background var(--dur-base) ease, color var(--dur-base) ease; }
.ask-ai:hover { background: var(--glass-press); color: var(--ink); }
.ask-ai.lit { background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); }
.ask-ai:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.ask-sheet { display: grid; gap: 10px; }
.ask-sheet h2 { margin: 0; font-size: var(--fs-xl); }
.ask-sheet p { margin: 0 0 4px; color: var(--muted); font-size: var(--fs-xs); line-height: 1.6; }
.question { display: grid; grid-template-columns: 16px minmax(0, 1fr) 16px; align-items: center; gap: 10px; padding: 12px 14px; border-radius: 14px;
  background: var(--mat-inset); box-shadow: var(--mat-inset-shadow); color: var(--ink); font-size: var(--fs-sm); text-decoration: none; transition: background var(--dur-base) ease; }
.question:hover { background: color-mix(in srgb, var(--accent) 10%, var(--mat-inset)); }
.question :first-child { color: var(--accent); }
</style>
