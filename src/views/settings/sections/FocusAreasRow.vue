<script setup lang="ts">
/* 「我关注」：概览首次提问问过的那件事，在这里随时改。点一下就生效，没有确认按钮。 */
import { focusAreaList, useFocusAreas } from '../../../composables/useFocusAreas';
import type { FocusArea } from '../../../lib/focusAreas';
import { useMessages } from '../../../i18n';
import { displayCardMessages } from './display.i18n';

const m = useMessages(displayCardMessages);
const { areas, setAreas } = useFocusAreas();
const toggle = (area: FocusArea) => {
  setAreas(areas.value.includes(area) ? areas.value.filter((a) => a !== area) : [...areas.value, area]);
};
</script>

<template>
  <div class="s-row">
    <div class="s-row-main">
      <span class="s-row-title">{{ m.focusTitle }}</span>
      <span class="s-row-sub">{{ m.focusSub }}</span>
    </div>
    <div class="s-row-control chips" role="group" :aria-label="m.focusTitle">
      <button
        v-for="chip in focusAreaList"
        :key="chip.area"
        type="button"
        :class="['focus-chip', { 'is-on': areas.includes(chip.area) }]"
        :aria-pressed="areas.includes(chip.area)"
        @click="toggle(chip.area)"
      >{{ chip.label }}</button>
    </div>
  </div>
</template>

<style scoped src="../settings-local.css"></style>
<style scoped>
.chips { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 7px; }
.focus-chip {
  display: inline-flex; min-height: 30px; align-items: center; padding: 0 14px; border: 0; border-radius: 999px;
  background: var(--mat-inset); box-shadow: var(--mat-inset-shadow);
  color: var(--muted); font: inherit; font-size: var(--fs-xs); font-weight: 600; cursor: pointer;
  transition: background-color var(--dur-fast) ease, color var(--dur-fast) ease;
}
.focus-chip.is-on { background: color-mix(in srgb, var(--accent) 20%, transparent); box-shadow: none; color: var(--ink); }
.focus-chip:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
