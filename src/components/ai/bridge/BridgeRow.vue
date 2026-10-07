<script setup lang="ts">
import { computed } from 'vue';
import TintIcon from '../TintIcon.vue';
import BridgeStrip from './BridgeStrip.vue';
import type { DayStripRow, AdherenceDay } from '../../../types/timeBridge';
import { AI_TASK_CATEGORY_META, categoryLabel } from '../../../lib/aiTask/categories';
import { unitLabel } from '../../../lib/aiTask/metrics';
import { useBridgeText } from './bridge.i18n';
import { useHubText } from '../hub/hub.i18n';
import { emptyCategories } from '../../../lib/aiTask/emptyCategories';
const props = defineProps<{ row: DayStripRow; enabled: boolean; days: number; selectedIds: string[]; adherence: AdherenceDay[]; disabled?: boolean }>();
const emit = defineEmits<{ toggle: []; day: [{ date: string; rect: DOMRect; el: Element | null }] }>();
const t = useBridgeText();
const meta = computed(() => AI_TASK_CATEGORY_META[props.row.category]);
const latest = computed(() => [...props.row.cells].reverse().find(c => c.value !== null));
/* 这一行 90 天一天记录都没有：一行灰字，不画空格子（1D·D8）。 */
const empty = computed(() => emptyCategories([props.row]).size > 0);
const h = useHubText();
</script>
<template>
  <div class="bridge-row" :class="{ excluded: !enabled }" :style="{ '--row-tint': meta.tint }">
    <button class="row-toggle" type="button" :disabled="disabled" :aria-pressed="enabled" :aria-label="`${categoryLabel(row.category)} · ${enabled ? t.included : t.excluded}`" :title="row.category === 'body' ? t.bodyNote : undefined" @click="emit('toggle')"><TintIcon :name="meta.icon" :tint="meta.tint" :size="24" :off="!enabled" /><span>{{ categoryLabel(row.category) }}</span></button>
    <span v-if="empty" class="row-empty">{{ row.category === 'body' ? h.emptyBody : h.emptyCategory }}</span>
    <BridgeStrip v-else :row="row" :days="days" :selected-ids="selectedIds" :adherence="adherence" :disabled="disabled || !enabled" @day="emit('day', $event)" />
    <span class="row-value" :title="latest?.date">{{ latest ? latest.value!.toFixed(latest.unit === 'kg' ? 1 : 0) : '·' }}<small v-if="latest">{{ unitLabel(latest.unit ?? '') }}</small></span>
  </div>
</template>
<style scoped src="./BridgeRow.css"></style>
