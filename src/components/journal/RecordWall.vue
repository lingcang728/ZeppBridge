<script setup lang="ts">
/* PB 墙：5K / 10K / 半马 / 全马各一格，最快的那次大字，下面一行配速、日期、怎么算出来的，再列其后两次。
   有运动编号的点了去那次运动。没有就写「还没有」，不编。 */
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import JournalCard from './JournalCard.vue';
import { useJournalText } from './journal.i18n';
import { useLogbook } from '../../composables/useLogbook';
import { clockText } from '../../lib/logbook/clock';
import { journalDay } from '../../lib/logbook/display';
import type { Effort } from '../../types/logbook';

const t = useJournalText();
const { records } = useLogbook();
const rows = computed(() => records.value?.records ?? []);
const pace = (effort: Effort, meters: number) => t.value.pace(clockText(effort.seconds / (meters / 1000)));
const how = (effort: Effort) => (effort.method === 'race' && effort.race_name ? effort.race_name : t.value.methods[effort.method]);
</script>

<template>
  <JournalCard :title="t.records" tone="record" :hint="records ? t.recordsHint(records.runs_scanned) : undefined">
    <ul class="pb-grid">
      <li v-for="row in rows" :key="row.key" class="pb" :class="{ none: !row.best }">
        <span class="pb-dist">{{ t.distances[row.key] }}</span>
        <template v-if="row.best">
          <component :is="row.best.workout_id ? RouterLink : 'span'" :to="row.best.workout_id ? `/workouts/${row.best.workout_id}` : undefined" class="pb-time">{{ clockText(row.best.seconds) }}</component>
          <span class="pb-meta">{{ pace(row.best, row.distance_m) }} · {{ journalDay(row.best.date) }}</span>
          <span class="pb-how">{{ how(row.best) }}</span>
          <ol v-if="row.runners_up.length" class="pb-then" :aria-label="t.then">
            <li v-for="effort in row.runners_up" :key="`${effort.date}-${effort.seconds}`">
              <span>{{ clockText(effort.seconds) }}</span><small>{{ journalDay(effort.date) }}</small>
            </li>
          </ol>
        </template>
        <span v-else class="pb-time muted">{{ t.noRecord }}</span>
      </li>
    </ul>
  </JournalCard>
</template>

<style scoped>
.pb-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 0; padding: 0; list-style: none; }
.pb { display: grid; align-content: start; gap: 3px; padding: 14px 14px 12px; border-radius: 16px; background: var(--mat-inset); box-shadow: var(--cap-track-shadow); }
.pb-dist { color: var(--muted); font-size: var(--fs-xs); font-weight: 650; }
.pb-time { color: var(--ink); font-family: var(--font-mono); font-size: 26px; line-height: 1.15; font-variant-numeric: tabular-nums; text-decoration: none; }
a.pb-time:hover { color: var(--accent); }
.pb-time.muted { color: var(--subtle); font-family: inherit; font-size: var(--fs-md); }
.pb-meta { color: var(--muted); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
.pb-how { color: var(--subtle); font-size: var(--fs-2xs); overflow-wrap: anywhere; }
.pb-then { display: grid; gap: 2px; margin: 6px 0 0; padding: 6px 0 0; border-top: 1px solid var(--mat-line); list-style: none; }
.pb-then li { display: flex; justify-content: space-between; gap: 8px; color: var(--muted); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
.pb-then small { color: var(--subtle); }
</style>
