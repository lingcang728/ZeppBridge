<script setup lang="ts">
/* 伤病：左边人形图（还没好的血色、好了的淡淡一圈黄），右边一条条记录，还没好的在前。 */
import { computed } from 'vue';
import BodyMap from './BodyMap.vue';
import JournalCard from './JournalCard.vue';
import { useBodyPartName } from './body.i18n';
import { useJournalText } from './journal.i18n';
import { useLogbook } from '../../composables/useLogbook';
import { journalDay, todayKey } from '../../lib/logbook/display';
import type { Injury, InjuryInput } from '../../types/logbook';

const emit = defineEmits<{ (event: 'edit', injury: InjuryInput, origin?: HTMLElement): void }>();
const t = useJournalText();
const partName = useBodyPartName();
const { injuries } = useLogbook();

const list = computed(() => injuries.value ?? []);
const hurting = computed(() => [...new Set(list.value.filter(i => !i.end_date && i.body_part).map(i => i.body_part!))]);
const healed = computed(() => [...new Set(list.value.filter(i => i.end_date && i.body_part).map(i => i.body_part!))]);
const fresh = (): InjuryInput => ({ id: null, title: '', body_part: null, severity: null, start_date: todayKey(), end_date: null, notes: '' });
const asInput = (injury: Injury): InjuryInput => {
  const { created_at: _c, updated_at: _u, ...input } = injury;
  return input;
};
const span = (injury: Injury) => (injury.end_date ? `${journalDay(injury.start_date)} – ${journalDay(injury.end_date)}` : t.value.since(journalDay(injury.start_date)));
</script>

<template>
  <JournalCard :title="t.injuries" tone="injury" :hint="t.injuriesHint" :action="t.addInjury" @action="o => emit('edit', fresh(), o)">
    <div class="injury-body">
      <BodyMap class="map" :model-value="hurting" :marked="healed" readonly :show-list="false" />
      <p v-if="injuries && !list.length" class="empty">{{ t.noInjury }}</p>
      <ul v-else class="row-list">
        <li v-for="injury in list" :key="injury.id">
          <button type="button" :class="['injury row-hit', { ongoing: !injury.end_date }]" @click="emit('edit', asInput(injury), $event.currentTarget as HTMLElement)">
            <span class="i-title">{{ injury.title }}<em v-if="!injury.end_date">{{ t.stillHurting }}</em></span>
            <span class="i-meta">
              <template v-if="injury.body_part">{{ partName(injury.body_part) }} · </template>
              <template v-if="injury.severity">{{ t.severities[injury.severity] }} · </template>{{ span(injury) }}
            </span>
          </button>
        </li>
      </ul>
    </div>
  </JournalCard>
</template>

<style scoped>
.injury-body { display: grid; grid-template-columns: minmax(280px, 400px) minmax(0, 1fr); gap: 16px; align-items: start; }
.empty { margin: 0; color: var(--subtle); font-size: var(--fs-sm); }
.injury { display: grid; gap: 3px; }
.i-title { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; color: var(--ink); font-size: var(--fs-sm); font-weight: 600; }
.i-title em { padding: 1px 8px; border-radius: 999px; background: color-mix(in srgb, var(--heart) 16%, transparent); color: var(--heart); font-size: var(--fs-2xs); font-style: normal; font-weight: 600; }
.i-meta { color: var(--subtle); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
@container journal (max-width: 560px) { .injury-body { grid-template-columns: minmax(0, 1fr); } .map { max-width: 400px; justify-self: center; width: 100%; } }
</style>
