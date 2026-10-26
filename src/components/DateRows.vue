<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';
import WheelDatePicker from './WheelDatePicker.vue';
import { journalDay, todayKey } from '../lib/logbook/display';
import { localDateString } from '../lib/format';
import { lifeEventMessages } from '../lib/lifeEvents';
import { useMessages } from '../i18n';
import { useRepairText } from './journal/repair.i18n';
import { lessMotion } from '../lib/motion/lessMotion';

const props = defineProps<{ start: string; end?: string | null; startLabel: string; endLabel?: string }>();
const emit = defineEmits<{ 'update:start': [value: string]; 'update:end': [value: string | null] }>();
const t = useMessages(lifeEventMessages);
const repair = useRepairText();
const id = useId();
const active = ref<'start' | 'end' | null>(null);
let revision = 0;
let collapsing: Promise<unknown> | null = null;
const rows = computed(() => props.endLabel ? ['start', 'end'] as const : ['start'] as const);
function collapseActive() {
  if (!active.value) return collapsing ?? Promise.resolve();
  const previous = document.getElementById(`${id}-${active.value}`);
  active.value = null;
  const wait = (async () => {
    await nextTick();
    if (previous) getComputedStyle(previous).gridTemplateRows;
    await Promise.allSettled((previous?.getAnimations() ?? []).map(animation => animation.finished));
  })();
  collapsing = wait;
  void wait.then(() => { if (collapsing === wait) collapsing = null; });
  return wait;
}
async function toggle(row: 'start' | 'end') {
  const mine = ++revision;
  if (row === 'end' && props.end === null) return;
  if (active.value === row) { await collapseActive(); return; }
  if (active.value && !lessMotion()) {
    // Wait for the actual collapse, including slowed playback or interrupted CSS transitions.
    await collapseActive();
    if (mine === revision && !(row === 'end' && props.end === null)) active.value = row;
  } else {
    if (collapsing) await collapsing;
    if (mine === revision && !(row === 'end' && props.end === null)) active.value = row;
  }
}
function update(row: 'start' | 'end', value: string) {
  if (row === 'start') {
    emit('update:start', value);
    if (props.end && props.end < value) emit('update:end', value);
  } else if (props.end !== null) emit('update:end', value < props.start ? props.start : value);
}
const yesterday = () => { const day = new Date(); day.setDate(day.getDate() - 1); return localDateString(day); };
watch(() => props.end, value => { if (value === null) { revision++; if (active.value === 'end') void collapseActive(); } });
onBeforeUnmount(() => revision++);
</script>

<template>
  <div class="date-rows">
    <div v-for="row in rows" :key="row" class="date-row">
      <button type="button" class="date-heading" :aria-expanded="active === row" :aria-controls="`${id}-${row}`" :disabled="row === 'end' && end === null" @click="toggle(row)">
        <span>{{ row === 'start' ? startLabel : endLabel }}</span>
        <span class="date-value">{{ row === 'end' && end === null ? repair.untilNow : journalDay(row === 'start' ? start : end || start) }}</span>
      </button>
      <div :id="`${id}-${row}`" :class="['date-expansion', { expanded: active === row }]" :inert="active !== row || undefined" :aria-hidden="active !== row">
        <div class="date-clip"><div class="date-content">
          <div class="date-quick">
            <button type="button" class="pill-button quiet" @click="update(row, todayKey())">{{ t.today }}</button>
            <button v-if="row === 'start'" type="button" class="pill-button quiet" @click="update(row, yesterday())">{{ t.yesterday }}</button>
            <button v-else type="button" class="pill-button quiet" @click="update(row, start)">{{ t.sameAsStart }}</button>
          </div>
          <WheelDatePicker :model-value="row === 'start' ? start : end || start" :min="row === 'end' ? start : undefined" :aria-label="row === 'start' ? startLabel : endLabel" @update:model-value="update(row, $event)" />
        </div></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.date-rows { min-width: 0; width: 100%; }
.date-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; padding: 9px 0; border: 0; background: none; color: var(--ink); font: inherit; font-size: var(--fs-sm); text-align: left; cursor: pointer; }
.date-heading:disabled { cursor: default; color: var(--subtle); }
.date-value { border-radius: 99px; padding: 7px 12px; background: var(--cap-track); font-variant-numeric: tabular-nums; }
.date-expansion { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 300ms cubic-bezier(.2,.9,.25,1); }
.date-expansion.expanded { grid-template-rows: 1fr; }
.date-clip { overflow: hidden; min-height: 0; min-width: 0; }
.date-content { display: grid; gap: 8px; padding: 6px 0 12px; }
.date-quick { display: flex; flex-wrap: wrap; gap: 6px; }
@media (prefers-reduced-motion: reduce) { .date-expansion { transition: none; } }
</style>
