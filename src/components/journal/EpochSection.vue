<script setup lang="ts">
/* 纪元与事件：生活事件的家（以前概览底部单独有一张「生活事件」卡，用户 2026-10-22 定：生活事件就是履历，
   合到这里）。上面是标成纪元的那几段日子（名字、起止、持续多少天），下面是其余的事，按时间倒着排。
   新建 / 编辑都用同一个生活事件编辑器，从被点的按钮 / 那一行长出来、关的时候缩回去。 */
import { computed, onMounted, ref } from 'vue';
import Icon from '../Icon.vue';
import JournalCard from './JournalCard.vue';
import { useJournalText } from './journal.i18n';
import { useLifeEvents } from '../../composables/useLifeEvents';
import { eventIcon, eventTone, lifeEventMessages } from '../../lib/lifeEvents';
import { daysBetween } from '../../lib/logbook/clock';
import { journalDay, todayKey } from '../../lib/logbook/display';
import { useMessages } from '../../i18n';
import type { LifeEvent } from '../../types';

const t = useJournalText();
const le = useMessages(lifeEventMessages);
const lifeEvents = useLifeEvents();
onMounted(() => { void lifeEvents.reload(); });
const newestFirst = (a: LifeEvent, b: LifeEvent) => b.startDate.localeCompare(a.startDate);
const epochs = computed(() => lifeEvents.events.value.filter(event => event.epoch).sort(newestFirst));
const others = computed(() => lifeEvents.events.value.filter(event => !event.epoch).sort(newestFirst));
const STEP = 6;
const visible = ref(STEP);
const shown = computed(() => others.value.slice(0, visible.value));
const span = (event: LifeEvent) => {
  if (!event.endDate) return t.value.since(journalDay(event.startDate));
  if (event.endDate === event.startDate) return journalDay(event.startDate);
  return `${journalDay(event.startDate)} – ${journalDay(event.endDate)}`;
};
const days = (event: LifeEvent) => daysBetween(event.startDate, event.endDate ?? todayKey()) + 1;
const target = (event: Event) => event.currentTarget as HTMLElement;
function addEpoch(origin: HTMLElement) {
  lifeEvents.open(undefined, todayKey(), origin);
  if (lifeEvents.draft.value) { lifeEvents.draft.value.epoch = true; lifeEvents.draft.value.endDate = null; lifeEvents.draft.value.category = 'training'; }
}
</script>

<template>
  <JournalCard id="life-events" :title="t.epochs" tone="epoch" :hint="t.epochsHint">
    <template #actions>
      <button type="button" class="pill-button quiet" @click="addEpoch(target($event))">{{ t.addEpoch }}</button>
      <button type="button" class="pill-button quiet" @click="lifeEvents.open(undefined, todayKey(), target($event))">{{ t.addEvent }}</button>
    </template>
    <p v-if="lifeEvents.loaded.value && !lifeEvents.events.value.length" class="empty">{{ t.noEpoch }}</p>
    <ul v-if="epochs.length" class="row-list">
      <li v-for="event in epochs" :key="event.id">
        <button type="button" class="epoch row-hit" @click="lifeEvents.open(event, undefined, target($event))">
          <i :style="{ background: eventTone(event.category) }" aria-hidden="true"></i>
          <span class="e-name">{{ event.title }}</span>
          <span class="e-meta">{{ span(event) }}</span>
          <span class="e-days">{{ t.dayCount(days(event)) }}</span>
        </button>
      </li>
    </ul>
    <template v-if="others.length">
      <h3 v-if="epochs.length" class="sub-head">{{ le.title }}</h3>
      <ul class="row-list">
        <li v-for="event in shown" :key="event.id" :style="{ '--event-tone': eventTone(event.category) }">
          <button type="button" class="event row-hit" @click="lifeEvents.open(event, undefined, target($event))">
            <span :class="['ev-node', { ongoing: event.endDate === null }]" aria-hidden="true"><Icon :name="eventIcon(event.category)" :size="13" /></span>
            <span class="e-name">{{ event.title }}</span>
            <span class="e-meta">{{ le.categories[event.category] }} · {{ span(event) }}</span>
            <span v-if="event.notes" class="e-notes">{{ event.notes }}</span>
          </button>
        </li>
      </ul>
      <div v-if="others.length > STEP" class="more">
        <button v-if="visible < others.length" type="button" class="pill-button quiet" @click="visible += STEP">{{ le.showMore(Math.min(STEP, others.length - visible)) }}</button>
        <button v-if="visible > STEP" type="button" class="pill-button quiet" @click="visible = STEP">{{ le.showLess }}</button>
      </div>
    </template>
  </JournalCard>
</template>

<style scoped>
.empty { margin: 0; color: var(--subtle); font-size: var(--fs-sm); line-height: 1.6; }
#life-events { scroll-margin-top: 24px; }
.epoch { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 2px 10px; }
.epoch i { grid-row: 1 / span 2; width: 4px; height: 30px; border-radius: 4px; opacity: .8; }
.e-name { color: var(--ink); font-size: var(--fs-sm); font-weight: 600; overflow-wrap: anywhere; }
.e-meta { grid-column: 2; color: var(--subtle); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
.e-days { grid-column: 3; grid-row: 1 / span 2; color: var(--muted); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
.sub-head { margin: 4px 0 -6px; color: var(--muted); font-size: var(--fs-xs); font-weight: 650; letter-spacing: .02em; }
.event { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 2px 10px; }
.ev-node { position: relative; display: grid; grid-row: 1 / span 2; width: 26px; height: 26px; place-items: center; border-radius: 50%;
  background: color-mix(in srgb, var(--event-tone) 20%, transparent); color: var(--event-tone); }
.ev-node.ongoing::after { content: ''; position: absolute; inset: -3px; border-radius: 50%; box-shadow: 0 0 0 1.5px var(--event-tone); animation: ev-breathe 2.4s ease-in-out 3; }
@keyframes ev-breathe { 50% { opacity: .2; scale: 1.15; } }
.event .e-name, .event .e-meta { grid-column: 2; }
.e-notes { grid-column: 2; display: -webkit-box; overflow: hidden; color: var(--subtle); font-size: var(--fs-xs); line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.more { display: flex; justify-content: center; gap: 8px; }
@media (prefers-reduced-motion: reduce) { .ev-node.ongoing::after { animation: none; } }
</style>
