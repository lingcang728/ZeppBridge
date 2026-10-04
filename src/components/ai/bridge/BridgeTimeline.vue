<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import BridgeRow from './BridgeRow.vue';
import BridgeHandle from './BridgeHandle.vue';
import BridgeFuture from './BridgeFuture.vue';
import { useBridgeText } from './bridge.i18n';
import type { DayStripRow, AdherenceDay } from '../../../types/timeBridge';
import type { AiTaskCategory, AiTaskCategoryRange } from '../../../lib/bridge/types';
import type { PlanDraftPreview } from '../../../types/trainingPlan';
import { addDays, perCell } from '../../../lib/aiTask/bridgeScale';
const props = defineProps<{ rows: DayStripRow[]; days: number; end: string; categories: AiTaskCategoryRange[]; selectedIds: string[]; adherence: AdherenceDay[]; preview: PlanDraftPreview | null; selected: string | null; loading: boolean; ready: boolean; sent: boolean; readonly?: boolean; futureReadonly?: boolean; stamped?: boolean }>();
const emit = defineEmits<{ range: [number]; toggle: [AiTaskCategory]; workout: [string]; select: [string]; move: [string,string]; delete: [string]; publish: []; received: [] }>();
const t = useBridgeText(), visualDays = ref(props.days);
const scroll = ref<HTMLElement | null>(null);
let observer: ResizeObserver | undefined;
const centerToday = () => {
  const el = scroll.value, axis = el?.querySelector<HTMLElement>('.today-axis');
  if (el && axis && el.clientWidth < 980) el.scrollLeft = Math.max(0, axis.offsetLeft + axis.offsetWidth / 2 - el.clientWidth / 2);
};
onMounted(() => { observer = new ResizeObserver(centerToday); if (scroll.value) observer.observe(scroll.value); centerToday(); });
onBeforeUnmount(() => observer?.disconnect());
watch(() => props.days, n => { visualDays.value = n; });
const order: AiTaskCategory[] = ['sleep','recovery','heart_rate','workout','training','body'];
const rows = computed(() => order.map(category => props.rows.find(r => r.category === category) ?? { category, metric: null, cells: [] }));
const marks = computed(() => [addDays(props.end,1 - visualDays.value), addDays(props.end, -Math.floor(visualDays.value / 2)), props.end]);
const commitRange = (n: number) => { visualDays.value = n; emit('range',n); };
</script>
<template>
  <div ref="scroll" class="timeline-scroll">
    <section :class="['time-bridge',{ sent, loading, historical: readonly }]" :aria-label="`${t.past} · ${t.today} · ${t.future}`">
      <header class="past-heading"><span class="section-number">01</span><div><h2>{{ t.past }}</h2><p>{{ t.pastNote }}</p></div><span class="range-count">{{ t.days(visualDays) }}</span></header>
      <div :class="['today-axis',{ 'axis-ready': ready && !sent }]" aria-hidden="true"><span>{{ t.today }}</span><i></i><small>{{ end.slice(5).replace('-',' / ') }}</small></div>
      <header class="future-heading"><span class="section-number">02</span><div><h2>{{ t.future }}</h2><p>{{ t.futureNote }}</p></div><slot name="future-action"></slot></header>
      <div class="past-strips">
        <BridgeRow v-for="(row,i) in rows" :key="row.category" :row="row" :days="visualDays" :enabled="categories.find(c => c.category === row.category)?.enabled ?? false" :selected-ids="selectedIds" :adherence="adherence" :disabled="readonly" :style="{ '--row-index': i }" @toggle="emit('toggle',row.category)" @workout="emit('workout',$event)" />
        <div class="past-dates"><span v-for="date in marks" :key="date">{{ date.slice(5).replace('-',' / ') }}</span></div>
        <footer class="past-footer"><BridgeHandle :model-value="visualDays" :disabled="readonly" @preview="visualDays = $event" @update:model-value="commitRange"/><span v-if="selectedIds.length" class="selection-count">{{ t.selected(selectedIds.length) }}</span><small v-else>{{ perCell(visualDays) > 1 ? `3 ${t.days(1).replace(/^1\s*/, '')} / ▏` : '' }}</small></footer>
      </div>
      <BridgeFuture :preview="preview" :readonly="readonly || futureReadonly" :selected="selected" :stamped="stamped" @select="emit('select',$event)" @move="(a,b) => emit('move',a,b)" @delete="emit('delete',$event)" @publish="emit('publish')" @received="emit('received')"/>
    </section>
  </div>
</template>
<style scoped src="./BridgeTimeline.css"></style>
