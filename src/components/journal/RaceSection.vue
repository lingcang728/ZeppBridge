<script setup lang="ts">
import { useRepairText } from './repair.i18n';
const repair = useRepairText();
/**
 * 比赛：最上面是下一场的倒计时（大数字），下面是之后报了名的，再下面是奖牌墙。
 *
 * 奖牌墙只挂填了成绩的比赛（成绩是用户填的，官方成绩为准）。比赛日过了还没成绩的排在墙前面，
 * 后端认得出那天最像这场的一次运动时问一句「是这一场吗」，点了才存——只是建议。
 */
import { computed } from 'vue';
import JournalCard from './JournalCard.vue';
import { useJournalText } from './journal.i18n';
import { useLogbook } from '../../composables/useLogbook';
import { backend } from '../../lib/bridge';
import { clockText, daysBetween, paceOf, raceDistanceKey } from '../../lib/logbook/clock';
import { journalDay, journalShortDay, kmText, todayKey } from '../../lib/logbook/display';
import type { Race, RaceInput } from '../../types/logbook';

const emit = defineEmits<{ (event: 'edit', race: RaceInput, origin?: HTMLElement): void }>();
const t = useJournalText();
const { races, write } = useLogbook();

const today = todayKey();
const upcoming = computed(() => (races.value ?? []).filter(r => r.race_date >= today));
const next = computed(() => upcoming.value[0] ?? null);
const past = computed(() => (races.value ?? []).filter(r => r.race_date < today).reverse());
const medals = computed(() => past.value.filter(r => r.result_seconds));
const pending = computed(() => past.value.filter(r => !r.result_seconds));

const distanceName = (race: Race) => {
  const key = raceDistanceKey(race.distance_m);
  if (key) return t.value.distances[key];
  return race.distance_m ? t.value.km(kmText(race.distance_m / 1000)) : t.value.raceSports[race.sport];
};
const paceLine = (race: Race) => {
  const pace = race.result_seconds ? paceOf(race.result_seconds, race.distance_m) : null;
  return pace && race.sport !== 'cycling' && race.sport !== 'swimming' ? t.value.pace(clockText(pace)) : null;
};
const fresh = (): RaceInput => ({ id: null, name: '', race_date: today, sport: 'running', distance_m: null, goal_seconds: null, priority: 'a', result_seconds: null, workout_id: null, notes: '' });
const asInput = (race: Race): RaceInput => {
  const { created_at: _c, updated_at: _u, candidate: _k, ...input } = race;
  return input;
};
const accept = (race: Race) => {
  const candidate = race.candidate;
  if (!candidate) return;
  void write(() => backend.raceSave({ ...asInput(race), result_seconds: candidate.elapsed_seconds, workout_id: candidate.workout_id }), ['races', 'records']);
};
</script>

<template>
  <JournalCard :title="t.races" tone="race" :action="t.addRace" @action="o => emit('edit', fresh(), o)">
    <button v-if="next" type="button" class="countdown" data-next-race @click="emit('edit', asInput(next), $event.currentTarget as HTMLElement)">
      <span class="cd-label">{{ t.nextRace }} · {{ t.priorities[next.priority] }}</span>
      <strong class="cd-name">{{ next.name }}</strong>
      <span class="cd-days">
        <b>{{ next.race_date === today ? '0' : daysBetween(today, next.race_date) }}</b>
        <small>{{ next.race_date === today ? t.raceToday : t.daysLeft(daysBetween(today, next.race_date)) }}</small>
      </span>
      <span class="cd-meta">{{ journalDay(next.race_date) }} · {{ distanceName(next) }}<template v-if="next.goal_seconds"> · {{ t.goal(clockText(next.goal_seconds)) }}</template></span>
    </button>
    <p v-else-if="!past.length" class="empty">{{ repair.noRaces }}</p>

    <ul v-if="upcoming.length > 1" class="row-list" :aria-label="t.upcoming">
      <li v-for="race in upcoming.slice(1)" :key="race.id">
        <button type="button" class="race-row row-hit" @click="emit('edit', asInput(race), $event.currentTarget as HTMLElement)">
          <span class="rl-date">{{ journalDay(race.race_date) }}</span>
          <span class="rl-name">{{ race.name }}</span>
          <span class="rl-meta">{{ distanceName(race) }} · {{ t.daysLeft(daysBetween(today, race.race_date)) }}</span>
        </button>
      </li>
    </ul>

    <div v-if="past.length" class="medal-head"><h3>{{ t.medals }}</h3></div>
    <ul v-if="pending.length" class="pending">
      <li v-for="race in pending" :key="race.id">
        <span class="rl-name">{{ race.name }} <small>{{ journalDay(race.race_date) }} · {{ t.awaiting }}</small></span>
        <span v-if="race.candidate" class="cand">{{ t.candidate(clockText(race.candidate.elapsed_seconds), t.km(kmText((race.candidate.distance_m ?? 0) / 1000))) }}</span>
        <span class="pending-actions">
          <button v-if="race.candidate" type="button" class="pill-button" @click="accept(race)">{{ t.useCandidate }}</button>
          <button type="button" class="pill-button quiet" @click="emit('edit', asInput(race), $event.currentTarget as HTMLElement)">{{ t.fillResult }}</button>
        </span>
      </li>
    </ul>
    <ul v-if="medals.length" class="medals">
      <li v-for="race in medals" :key="race.id">
        <button type="button" class="medal" :class="{ gold: race.goal_seconds && race.result_seconds! <= race.goal_seconds }" @click="emit('edit', asInput(race), $event.currentTarget as HTMLElement)">
          <span class="ribbon" aria-hidden="true"></span>
          <span class="coin"><small>{{ distanceName(race) }}</small><b>{{ clockText(race.result_seconds!) }}</b></span>
          <span class="m-name">{{ race.name }}</span>
          <span class="m-meta"><span>{{ journalShortDay(race.race_date) }}</span><span v-if="paceLine(race)">{{ paceLine(race) }}</span></span>
          <span v-if="race.goal_seconds && race.result_seconds! <= race.goal_seconds" class="m-goal">{{ t.beatGoal }}</span>
        </button>
      </li>
    </ul>

  </JournalCard>
</template>

<style scoped>
.empty { margin: 0; color: var(--subtle); font-size: var(--fs-sm); line-height: 1.6; }
button { font: inherit; color: inherit; }
.countdown { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 16px; padding: 16px 18px; border: 0; border-radius: 18px; text-align: left; cursor: pointer;
  background: var(--mat-inset); box-shadow: var(--cap-track-shadow); }
.countdown:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.cd-label { grid-column: 1; color: var(--subtle); font-size: var(--fs-xs); }
.cd-name { grid-column: 1; color: var(--ink); font-size: var(--fs-lg); font-weight: 700; overflow-wrap: anywhere; }
.cd-meta { grid-column: 1; color: var(--muted); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
.cd-days { grid-column: 2; grid-row: 1 / span 3; display: grid; justify-items: end; align-content: center; }
.cd-days b { color: var(--training); font-family: var(--font-mono); font-size: 44px; line-height: 1; font-variant-numeric: tabular-nums; }
.cd-days small { color: var(--muted); font-size: var(--fs-xs); }
.pending, .medals { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
.race-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: baseline; gap: 12px; padding-block: 8px; }
.rl-date { color: var(--muted); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
.rl-name { color: var(--ink); font-size: var(--fs-sm); overflow-wrap: anywhere; }
.rl-name small { margin-left: 6px; color: var(--subtle); font-size: var(--fs-xs); }
.rl-meta { color: var(--subtle); font-size: var(--fs-xs); }
.medal-head h3 { margin: 4px 0 0; color: var(--muted); font-size: var(--fs-xs); font-weight: 650; letter-spacing: .02em; }
.pending li { display: grid; gap: 6px; padding: 10px 12px; border-radius: 14px; background: color-mix(in srgb, var(--warning) 8%, transparent); }
.cand { color: var(--muted); font-size: var(--fs-xs); line-height: 1.6; }
.pending-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
.medals { grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); gap: 12px; }
.medal { position: relative; display: grid; justify-items: center; gap: 4px; width: 100%; padding: 22px 10px 12px; border: 0; border-radius: 16px; background: transparent; text-align: center; cursor: pointer; }
.medal:hover { background: color-mix(in srgb, var(--ink) 4%, transparent); }
.medal:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
/* 绶带：两条斜着的带子挂在奖牌上头。 */
.ribbon { position: absolute; top: 4px; left: 50%; width: 34px; height: 26px; transform: translateX(-50%);
  background: linear-gradient(115deg, transparent 0 18%, var(--training) 18% 46%, transparent 46% 54%, var(--pace) 54% 82%, transparent 82%); opacity: .75; }
.coin { position: relative; display: grid; place-content: center; justify-items: center; width: 92px; height: 92px; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--ink) 22%, var(--surface)), color-mix(in srgb, var(--ink) 8%, var(--surface)) 70%);
  box-shadow: inset 0 0 0 3px color-mix(in srgb, var(--ink) 14%, transparent), inset 0 0 0 6px color-mix(in srgb, var(--surface) 60%, transparent), var(--mat-shadow); }
.medal.gold .coin { background: radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--warning) 70%, white), color-mix(in srgb, var(--warning) 60%, var(--surface)) 72%);
  box-shadow: inset 0 0 0 3px color-mix(in srgb, var(--warning) 80%, black 10%), inset 0 0 0 6px color-mix(in srgb, white 30%, transparent), var(--mat-shadow); }
.coin small { color: var(--muted); font-size: var(--fs-2xs); max-width: 74px; line-height: 1.2; }
.coin b { color: var(--ink); font-family: var(--font-mono); font-size: var(--fs-md); font-variant-numeric: tabular-nums; }
.medal.gold .coin small, .medal.gold .coin b { color: color-mix(in srgb, black 78%, var(--warning)); }
.m-name { margin-top: 6px; color: var(--ink); font-size: var(--fs-sm); line-height: 1.35; overflow-wrap: anywhere; }
.m-meta { display: flex; flex-wrap: wrap; justify-content: center; gap: 0 6px; color: var(--subtle); font-size: var(--fs-2xs); font-variant-numeric: tabular-nums; }
.m-meta span { white-space: nowrap; }
.m-goal { color: var(--warning); font-size: var(--fs-2xs); font-weight: 650; }
</style>
