<script setup lang="ts">
/* 概览上的履历入口（批次 7 主观层）：一行横卡。有报名的比赛就是下一场的倒计时，没有就一句话说这里能记什么；
   有跑鞋到了九成退役里程，右边挂一枚提醒。点整张卡去 /journal。PB 不在这里算（后端现算，留给履历页）。 */
import { computed, onActivated, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import GlyphTile from '../GlyphTile.vue';
import { useJournalText } from '../journal/journal.i18n';
import { useLogbook } from '../../composables/useLogbook';
import { daysBetween } from '../../lib/logbook/clock';
import { todayKey } from '../../lib/logbook/display';

defineOptions({ name: 'OverviewJournalEntryCard' });
const t = useJournalText();
const { races, shoes, load } = useLogbook();
onMounted(() => { void load(['races', 'shoes']); });
onActivated(() => { void load(['races', 'shoes']); });

const next = computed(() => {
  const today = todayKey();
  const race = (races.value ?? []).find(r => r.race_date >= today);
  return race ? { name: race.name, days: daysBetween(today, race.race_date) } : null;
});
/* 只提醒最要紧的一双：该退役的先于快到的。 */
const alert = computed(() => {
  const list = shoes.value?.shoes ?? [];
  const due = list.find(s => s.wear === 'due');
  if (due) return { tone: 'due', text: t.value.shoeAlert(due.name) };
  const near = list.find(s => s.wear === 'near');
  return near ? { tone: 'near', text: t.value.shoeNear(near.name) } : null;
});
</script>

<template>
  <RouterLink class="metric-panel journal-entry" to="/journal" :aria-label="t.entry">
    <GlyphTile name="outdoor-run" :size="38" />
    <span class="je-main">
      <span class="je-title">{{ t.entry }}</span>
      <span v-if="next" class="je-race">{{ t.nextRace }} · <b>{{ next.name }}</b> · <em>{{ next.days === 0 ? t.raceToday : t.daysLeft(next.days) }}</em></span>
      <span v-else class="je-race muted">{{ t.entryNoRace }}</span>
    </span>
    <span v-if="alert" :class="['je-alert', `is-${alert.tone}`]">{{ alert.text }}</span>
    <GlyphTile class="je-go" name="chevron-right" :size="18" />
  </RouterLink>
</template>

<style scoped>
.journal-entry { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; padding: 14px 18px; color: inherit; text-decoration: none;
  background: radial-gradient(320px 160px at 0 100%, color-mix(in srgb, var(--training) 9%, transparent), transparent 70%), var(--mat-card); }
.je-main { display: grid; flex: 1 1 14rem; gap: 2px; min-width: 0; }
.je-title { color: var(--ink); font-size: var(--fs-md); font-weight: 600; }
.je-race { overflow: hidden; color: var(--muted); font-size: var(--fs-sm); text-overflow: ellipsis; white-space: nowrap; }
.je-race b { color: var(--ink); font-weight: 600; }
.je-race.muted { color: var(--subtle); }
.je-race em { color: var(--training); font-style: normal; font-variant-numeric: tabular-nums; }
.je-alert { padding: 4px 10px; border-radius: 999px; font-size: var(--fs-xs); }
.je-alert.is-near { background: color-mix(in srgb, var(--warning) 16%, transparent); color: var(--warning); }
.je-alert.is-due { background: color-mix(in srgb, var(--heart) 16%, transparent); color: var(--heart); }
.je-go { opacity: .7; transition: translate var(--dur-base) var(--ease-out), opacity var(--dur-fast) ease; }
.journal-entry:hover .je-go { opacity: 1; translate: 2px 0; }
</style>
