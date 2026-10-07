<script setup lang="ts">
/**
 * 「挑日子」（精修批次 7.2，第二轮 10-07 重做）：点一下，牌从这枚按钮飞出来铺满全屏（CardTable 浮层），
 * 收牌时飞回这里。可以是一项指标（指标卡），也可以是一整类（睡眠详情）。
 * 范围跟着页面的 7 天 / 1 个月 / 6 个月走，牌桌上还能再换。挑中的牌飞进右下角的收集箱。
 */
import { computed, defineAsyncComponent, ref, shallowRef } from 'vue';
import Icon from '../Icon.vue';
import { useCardsText } from './cards.i18n';
import { useCardCollection } from '../../composables/useCardCollection';
import { useTrendRange } from '../../composables/useTrendRange';
import { askCategoryOf } from '../../lib/metricAsk';
import { deckRangeOf } from '../../lib/cards/deck';
import { categorySource, metricSource, type DeckSource } from '../../lib/cards/sources';
import type { AiTaskCategory } from '../../lib/bridge/types';

const CardTable = defineAsyncComponent(() => import('./CardTable.vue'));

const props = defineProps<{
  /** 一项指标；和 `category` 二选一。 */
  metric?: string | null;
  /** 一整类（如睡眠）。 */
  category?: AiTaskCategory;
  label: string;
  tint: string;
  format: ((value: number) => string) | null;
  unit?: string;
}>();
const t = useCardsText();
const box = useCardCollection();
const range = useTrendRange();
const open = ref(false);
const origin = shallowRef<DOMRect | null>(null);
const key = computed(() => (props.category ? `cat:${props.category}` : props.metric ?? ''));
const pickedHere = computed(() => (key.value ? box.picks.value.filter((pick) => pick.key === key.value).length : 0));
const source = computed<DeckSource>(() => (props.category
  ? categorySource({ category: props.category, label: props.label, tint: props.tint, format: props.format, unit: props.unit })
  : metricSource({
    metric: props.metric ?? '',
    category: askCategoryOf(props.metric ?? ''),
    label: props.label,
    tint: props.tint,
    format: props.format ?? ((value: number) => String(value)),
    unit: props.unit,
  })));

const show = (event: MouseEvent) => {
  origin.value = (event.currentTarget as HTMLElement).getBoundingClientRect();
  open.value = true;
};
</script>

<template>
  <button v-if="key" type="button" :class="['pick-days', { lit: pickedHere > 0 }]" :title="t.pickTitle(label)" :aria-label="t.pickTitle(label)" aria-haspopup="dialog" @click="show">
    <Icon name="cards" :size="16" /><span>{{ t.pick }}</span><b v-if="pickedHere">{{ pickedHere }}</b>
  </button>
  <CardTable v-if="open" :source="source" :range="deckRangeOf(range)" :origin="origin" @close="open = false" />
</template>

<style scoped>
.pick-days { display: inline-flex; align-items: center; justify-content: center; gap: 4px; height: 30px; padding: 0 11px 0 9px; white-space: nowrap; border: 0; border-radius: 999px;
  background: var(--mat-inset); box-shadow: var(--mat-inset-shadow); color: var(--muted); font: inherit; font-size: var(--fs-xs); font-weight: 650;
  font-variant-numeric: tabular-nums; cursor: pointer; transition: background var(--dur-base) ease, color var(--dur-base) ease, transform 160ms ease; }
.pick-days:hover { background: color-mix(in srgb, var(--ink) 8%, var(--mat-inset)); color: var(--ink); }
.pick-days:active { transform: scale(.94); }
.pick-days.lit { background: color-mix(in srgb, var(--accent) 18%, var(--mat-inset)); color: var(--accent); }
.pick-days b { min-width: 18px; padding: 1px 6px; border-radius: 999px; background: var(--accent); color: var(--accent-ink, #10140a); font-size: var(--fs-2xs); text-align: center; }
.pick-days:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
