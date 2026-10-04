<script setup lang="ts">
import { computed } from 'vue';
import Icon from '../../Icon.vue';
import BridgeStrip from './BridgeStrip.vue';
import type { DayStripRow, AdherenceDay } from '../../../types/timeBridge';
import { AI_TASK_CATEGORY_META, categoryLabel } from '../../../lib/aiTask/categories';
import { unitLabel } from '../../../lib/aiTask/metrics';
import { useBridgeText } from './bridge.i18n';
const props = defineProps<{ row: DayStripRow; enabled: boolean; days: number; selectedIds: string[]; adherence: AdherenceDay[]; disabled?: boolean }>();
const emit = defineEmits<{ toggle: []; workout: [string] }>();
const t = useBridgeText();
const meta = computed(() => AI_TASK_CATEGORY_META[props.row.category]);
const latest = computed(() => [...props.row.cells].reverse().find(c => c.value !== null));
</script>
<template>
  <div class="bridge-row" :class="{ excluded: !enabled }" :style="{ '--row-tint': meta.tint }">
    <button class="row-toggle" type="button" :disabled="disabled" :aria-pressed="enabled" :aria-label="`${categoryLabel(row.category)} · ${enabled ? t.included : t.excluded}`" :title="row.category === 'body' ? t.bodyNote : undefined" @click="emit('toggle')"><i></i><Icon :name="meta.icon" :size="13"/><span>{{ categoryLabel(row.category) }}</span></button>
    <BridgeStrip :row="row" :days="days" :selected-ids="selectedIds" :adherence="adherence" :disabled="disabled || !enabled" @workout="emit('workout', $event)" />
    <span class="row-value" :title="latest?.date">{{ latest ? latest.value!.toFixed(latest.unit === 'kg' ? 1 : 0) : '·' }}<small v-if="latest">{{ unitLabel(latest.unit ?? '') }}</small></span>
  </div>
</template>
<style scoped src="./BridgeRow.css"></style>
