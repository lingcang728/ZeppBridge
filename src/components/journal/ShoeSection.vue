<script setup lang="ts">
/* 跑鞋：每双一行（名字、用途、默认标、里程条、次数、上次穿），到九成里程黄、到了红、退役的灰到最后。
   下面列 Zepp 里记过但还没登记的鞋编号，起个名就登记成一双、里程认上。 */
import { computed } from 'vue';
import JournalCard from './JournalCard.vue';
import { useJournalText } from './journal.i18n';
import { useLogbook } from '../../composables/useLogbook';
import { journalDay, kmText, todayKey } from '../../lib/logbook/display';
import type { ShoeInput, ShoeSummary, UnknownGear } from '../../types/logbook';

const emit = defineEmits<{ (event: 'edit', shoe: ShoeInput, origin?: HTMLElement): void }>();
const t = useJournalText();
const { shoes } = useLogbook();

/** 新登记的鞋默认 700 km 提醒退役（和后端 DEFAULT_RETIRE_KM 同值）。 */
const DEFAULT_RETIRE_KM = 700;
const list = computed(() => [...(shoes.value?.shoes ?? [])].sort((a, b) => Number(a.wear === 'retired') - Number(b.wear === 'retired')));
const share = (shoe: ShoeSummary) => Math.min(1, shoe.km / shoe.retire_km);
const fresh = (): ShoeInput => ({ id: null, name: '', sport: 'running', is_default: !(shoes.value?.shoes ?? []).some(s => s.is_default && s.sport === 'running'),
  zepp_gear_id: null, start_km: 0, retire_km: DEFAULT_RETIRE_KM, started_on: todayKey(), retired_on: null, notes: '' });
const fromGear = (gear: UnknownGear): ShoeInput => ({ ...fresh(), sport: gear.sport ?? 'running', is_default: false, zepp_gear_id: gear.zepp_gear_id, started_on: gear.first_used });
const asInput = (shoe: ShoeSummary): ShoeInput => {
  const { created_at: _c, updated_at: _u, km: _k, workouts: _w, last_used: _l, wear: _r, ...input } = shoe;
  return input;
};
</script>

<template>
  <JournalCard :title="t.shoes" tone="shoe" :action="t.addShoe" @action="o => emit('edit', fresh(), o)">
    <p v-if="shoes && !list.length" class="empty">{{ t.noShoe }}</p>
    <ul v-else class="row-list">
      <li v-for="shoe in list" :key="shoe.id">
        <button type="button" class="shoe row-hit" :class="`wear-${shoe.wear}`" @click="emit('edit', asInput(shoe), $event.currentTarget as HTMLElement)">
          <span class="s-name">{{ shoe.name }}<em v-if="shoe.is_default">{{ t.isDefaultBadge }}</em></span>
          <span class="s-km">{{ t.shoeKm(kmText(shoe.km), kmText(shoe.retire_km)) }}</span>
          <span class="s-bar" aria-hidden="true"><i :style="{ width: `${share(shoe) * 100}%` }"></i></span>
          <span class="s-meta">{{ t.shoeSports[shoe.sport] }} · {{ t.runs(shoe.workouts) }}<template v-if="shoe.last_used"> · {{ journalDay(shoe.last_used) }}</template></span>
          <span class="s-wear">{{ t.wear[shoe.wear] }}</span>
        </button>
      </li>
    </ul>
    <div v-if="shoes?.unknown_gear.length" class="gear">
      <h3>{{ t.unknownGear }}</h3>
      <p>{{ t.unknownGearHint }}</p>
      <ul>
        <li v-for="gear in shoes.unknown_gear" :key="gear.zepp_gear_id">
          <span class="g-id">#{{ gear.zepp_gear_id }}</span>
          <span class="g-meta">{{ t.km(kmText(gear.km)) }} · {{ t.runs(gear.workouts) }} · {{ t.used(journalDay(gear.first_used), journalDay(gear.last_used)) }}</span>
          <button type="button" class="pill-button quiet" @click="emit('edit', fromGear(gear), $event.currentTarget as HTMLElement)">{{ t.nameIt }}</button>
        </li>
      </ul>
    </div>
  </JournalCard>
</template>

<style scoped>
.empty { margin: 0; color: var(--subtle); font-size: var(--fs-sm); }
.shoe { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px 12px; }
.s-name { display: flex; align-items: center; gap: 8px; min-width: 0; color: var(--ink); font-size: var(--fs-sm); font-weight: 600; overflow-wrap: anywhere; }
.s-name em { padding: 1px 8px; border-radius: 999px; background: color-mix(in srgb, var(--pace) 16%, transparent); color: var(--muted); font-size: var(--fs-2xs); font-style: normal; font-weight: 500; }
.s-km { color: var(--ink); font-family: var(--font-mono); font-size: var(--fs-sm); font-variant-numeric: tabular-nums; }
.s-bar { grid-column: 1 / -1; height: 6px; border-radius: 999px; background: var(--cap-track); box-shadow: var(--cap-track-shadow); overflow: hidden; }
.s-bar i { display: block; height: 100%; border-radius: inherit; background: var(--pace); }
.wear-near .s-bar i { background: var(--warning); }
.wear-due .s-bar i { background: var(--heart); }
.wear-retired .s-bar i { background: var(--subtle); }
.wear-retired { opacity: .65; }
.s-meta { color: var(--subtle); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
.s-wear { color: var(--muted); font-size: var(--fs-xs); text-align: right; }
.wear-near .s-wear { color: var(--warning); }
.wear-due .s-wear { color: var(--heart); font-weight: 650; }
.gear { display: grid; gap: 6px; padding-top: 6px; border-top: 1px solid var(--mat-line); }
.gear h3 { margin: 0; color: var(--muted); font-size: var(--fs-xs); font-weight: 650; }
.gear p { margin: 0; color: var(--subtle); font-size: var(--fs-xs); line-height: 1.6; }
.gear ul { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
.gear li { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; }
.g-id { color: var(--ink); font-family: var(--font-mono); font-size: var(--fs-sm); }
.g-meta { flex: 1; min-width: 0; color: var(--subtle); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
</style>
