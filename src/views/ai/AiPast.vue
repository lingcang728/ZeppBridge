<script setup lang="ts">
/**
 * 「你的过去」二级页（/ai/past）：六类数据各一行——点亮的那几类会交给 AI，细条是逐天的数据，
 * 右边的箭头进这一类的逐天页（/ai/past/:category，从这一行长出来）。底下拖动回溯范围。
 * 运动那一行的柱子可以点：选中的那几次运动一起交给 AI。
 */
import { computed, ref, watch } from 'vue';
import PageHeader from '../../components/PageHeader.vue';
import Icon from '../../components/Icon.vue';
import BridgeRow from '../../components/ai/bridge/BridgeRow.vue';
import BridgeHandle from '../../components/ai/bridge/BridgeHandle.vue';
import { useAiHub } from '../../composables/ai/useAiHub';
import { useAiTaskDraft } from '../../composables/useAiTaskDraft';
import { useBridgeStrip } from '../../composables/useBridgeStrip';
import { useBridgeText } from '../../components/ai/bridge/bridge.i18n';
import { useHubText } from '../../components/ai/hub/hub.i18n';
import { addDays } from '../../lib/aiTask/bridgeScale';
import { categoryLabel } from '../../lib/aiTask/categories';
import type { AiTaskCategory } from '../../lib/bridge/types';
import '../../styles/ai-task.css';

defineOptions({ name: 'AiPast' });
const hub = useAiHub();
const ctl = useAiTaskDraft();
const strips = useBridgeStrip();
const t = useBridgeText();
const h = useHubText();
const { draft } = ctl;
const ORDER: AiTaskCategory[] = ['sleep', 'recovery', 'heart_rate', 'workout', 'training', 'body'];
const rows = computed(() => ORDER.map((category) => strips.rows.value.find((r) => r.category === category) ?? { category, metric: null, cells: [] }));
const days = ref(hub.pastDays.value);
watch(hub.pastDays, (n) => { days.value = n; });
const end = computed(() => strips.end.value);
const marks = computed(() => [addDays(end.value, 1 - days.value), addDays(end.value, -Math.floor(days.value / 2)), end.value]);
const enabled = (category: AiTaskCategory) => draft.value.categories.find((c) => c.category === category)?.enabled ?? false;
const toggle = (category: AiTaskCategory) => ctl.setCategoryEnabled(category, !enabled(category));
const commit = (n: number) => { days.value = n; ctl.setWindowDays(n - 1); };
</script>

<template>
  <section class="page ai-sub-page ai-past-page" aria-labelledby="ai-past-title">
    <PageHeader title-id="ai-past-title" :title="t.past" :intro="h.pastIntro" />
    <div class="ai-panel">
      <ul class="past-rows">
        <li v-for="(row, i) in rows" :key="row.category" class="past-row" data-morph-card :style="{ '--row-index': i }">
          <BridgeRow :row="row" :days="days" :enabled="enabled(row.category)" :selected-ids="draft.workout_ids" :adherence="strips.adherence.value"
            @toggle="toggle(row.category)" @workout="ctl.toggleWorkout" />
          <RouterLink :to="`/ai/past/${row.category}`" class="row-open" :aria-label="categoryLabel(row.category)"><Icon name="chevron-right" :size="16" /></RouterLink>
        </li>
      </ul>
      <div class="past-dates"><span v-for="date in marks" :key="date">{{ date.slice(5).replace('-', ' / ') }}</span></div>
      <footer class="past-footer">
        <span class="range-title">{{ h.rangeTitle }}</span>
        <BridgeHandle :model-value="days" @preview="days = $event" @update:model-value="commit" />
        <span v-if="draft.workout_ids.length" class="selection-count">{{ t.selected(draft.workout_ids.length) }}</span>
      </footer>
    </div>
    <p v-if="strips.error.value" class="ai-message" role="alert"><Icon name="warning" :size="14" /><span>{{ strips.error.value }}</span><button class="pill-button quiet" @click="strips.load()">{{ t.retry }}</button></p>
  </section>
</template>

<style scoped src="./aiPage.css"></style>
<style scoped>
.past-rows { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
.past-row { display: grid; grid-template-columns: minmax(0, 1fr) 40px; align-items: center; gap: 4px; border-radius: 14px; transition: background var(--dur-base) ease; }
.past-row:hover { background: color-mix(in srgb, var(--ink) 3%, transparent); }
.row-open { display: grid; width: 36px; height: 36px; place-items: center; border-radius: 50%; color: var(--subtle); }
.row-open:hover { background: var(--glass-press); color: var(--ink); }
.row-open:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.past-dates { display: flex; justify-content: space-between; margin: 0 118px 0 126px; color: var(--subtle); font: 10px var(--font-mono); }
.past-footer { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; padding-top: 6px; color: var(--subtle); font-size: var(--fs-2xs); }
.range-title { color: var(--muted); font-size: var(--fs-xs); }
.selection-count { margin-left: auto; color: var(--accent); }
@media (max-width: 700px) { .past-dates { margin-inline: 90px 50px; } }
</style>
