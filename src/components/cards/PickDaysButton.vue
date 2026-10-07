<script setup lang="ts">
/**
 * 指标卡右上角的「挑日子」（精修批次 7.2）：点一下，这张卡最近的日子发成一桌牌（CardTable 浮层），
 * 牌从这张卡里发出来、收牌时收回这张卡。范围跟着页面的 7 天 / 1 个月 / 6 个月走，牌桌上还能再换。
 * 挑中的牌飞进右下角的收集箱。
 */
import { computed, defineAsyncComponent, ref, shallowRef } from 'vue';
import Icon from '../Icon.vue';
import { useCardsText } from './cards.i18n';
import { useCardCollection } from '../../composables/useCardCollection';
import { useTrendRange } from '../../composables/useTrendRange';
import { askCategoryOf } from '../../lib/metricAsk';
import { deckRangeOf } from '../../lib/cards/deck';
import { metricSource } from '../../lib/cards/sources';

const CardTable = defineAsyncComponent(() => import('./CardTable.vue'));

const props = defineProps<{ metric: string | null | undefined; label: string; tint: string; format: (value: number) => string; unit?: string }>();
const t = useCardsText();
const box = useCardCollection();
const range = useTrendRange();
const open = ref(false);
const origin = shallowRef<DOMRect | null>(null);
const pickedHere = computed(() => (props.metric ? box.picks.value.filter((pick) => pick.key === props.metric).length : 0));
const source = computed(() => metricSource({
  metric: props.metric ?? '',
  category: askCategoryOf(props.metric ?? ''),
  label: props.label,
  tint: props.tint,
  format: props.format,
  unit: props.unit,
}));

const show = (event: MouseEvent) => {
  const button = event.currentTarget as HTMLElement;
  origin.value = (button.closest('section') ?? button).getBoundingClientRect();
  open.value = true;
};
</script>

<template>
  <button v-if="metric" type="button" :class="['pick-days', { lit: pickedHere > 0 }]" :title="t.pickTitle(label)" :aria-label="t.pickTitle(label)" :aria-haspopup="'dialog'" @click="show">
    <Icon name="cards" :size="13" /><span v-if="pickedHere">{{ pickedHere }}</span>
  </button>
  <CardTable v-if="open" :source="source" :range="deckRangeOf(range)" :origin="origin" @close="open = false" />
</template>

<style scoped>
.pick-days { display: inline-flex; align-items: center; gap: 4px; min-height: 22px; padding: 3px 6px; border: 0; border-radius: 999px; background: transparent; color: var(--subtle);
  font: inherit; font-size: var(--fs-2xs); font-variant-numeric: tabular-nums; cursor: pointer; transition: background var(--dur-base) ease, color var(--dur-base) ease; }
.pick-days:hover { background: var(--glass-press); color: var(--ink); }
.pick-days.lit { background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); }
.pick-days:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
