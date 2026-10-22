<script setup lang="ts">
/* 纪元：标成纪元的生活事件，一条一行（名字、起止、持续多少天）。新建 / 编辑都用生活事件编辑器，
   新建时「作为纪元」已经打开。 */
import { computed, onMounted } from 'vue';
import JournalCard from './JournalCard.vue';
import { useJournalText } from './journal.i18n';
import { useLifeEvents } from '../../composables/useLifeEvents';
import { eventTone } from '../../lib/lifeEvents';
import { daysBetween } from '../../lib/logbook/clock';
import { journalDay, todayKey } from '../../lib/logbook/display';
import type { LifeEvent } from '../../types';

const t = useJournalText();
const lifeEvents = useLifeEvents();
onMounted(() => { void lifeEvents.reload(); });
const epochs = computed(() => lifeEvents.events.value.filter(event => event.epoch).sort((a, b) => b.startDate.localeCompare(a.startDate)));
const span = (event: LifeEvent) => (event.endDate ? `${journalDay(event.startDate)} – ${journalDay(event.endDate)}` : t.value.since(journalDay(event.startDate)));
const days = (event: LifeEvent) => daysBetween(event.startDate, event.endDate ?? todayKey()) + 1;
function add() {
  lifeEvents.open(undefined, todayKey());
  if (lifeEvents.draft.value) { lifeEvents.draft.value.epoch = true; lifeEvents.draft.value.endDate = null; lifeEvents.draft.value.category = 'training'; }
}
</script>

<template>
  <JournalCard :title="t.epochs" tone="epoch" :hint="t.epochsHint" :action="t.addEpoch" @action="add">
    <p v-if="lifeEvents.loaded.value && !epochs.length" class="empty">{{ t.noEpoch }}</p>
    <ul v-else class="epoch-list">
      <li v-for="event in epochs" :key="event.id">
        <button type="button" @click="lifeEvents.open(event)">
          <i :style="{ background: eventTone(event.category) }" aria-hidden="true"></i>
          <span class="e-name">{{ event.title }}</span>
          <span class="e-meta">{{ span(event) }}</span>
          <span class="e-days">{{ t.dayCount(days(event)) }}</span>
        </button>
      </li>
    </ul>
  </JournalCard>
</template>

<style scoped>
.empty { margin: 0; color: var(--subtle); font-size: var(--fs-sm); }
.epoch-list { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
.epoch-list button { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 2px 10px; width: 100%; padding: 10px 6px; border: 0; border-top: 1px solid var(--mat-line); background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.epoch-list li:first-child button { border-top: 0; }
.epoch-list button:hover { background: color-mix(in srgb, var(--ink) 3%, transparent); }
.epoch-list i { grid-row: 1 / span 2; width: 4px; height: 30px; border-radius: 4px; opacity: .8; }
.e-name { color: var(--ink); font-size: var(--fs-sm); font-weight: 600; overflow-wrap: anywhere; }
.e-meta { grid-column: 2; color: var(--subtle); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
.e-days { grid-column: 3; grid-row: 1 / span 2; color: var(--muted); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
</style>
