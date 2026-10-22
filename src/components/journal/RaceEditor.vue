<script setup lang="ts">
/* 比赛编辑：名字、日子、项目、距离（四个常用距离一点就填）、目标、成绩、优先级。成绩按 1:45:00 写。 */
import { computed, ref, watch } from 'vue';
import EditorShell from './EditorShell.vue';
import SegmentTrack from '../SegmentTrack.vue';
import WheelDatePicker from '../WheelDatePicker.vue';
import { useJournalText } from './journal.i18n';
import { useLogbook } from '../../composables/useLogbook';
import { backend } from '../../lib/bridge';
import { clockText, parseClock, RACE_DISTANCES } from '../../lib/logbook/clock';
import type { RaceInput, RacePriority, RaceSport } from '../../types/logbook';

const props = defineProps<{ race: RaceInput }>();
const emit = defineEmits<{ (event: 'close'): void }>();
const t = useJournalText();
const { busy, error, write } = useLogbook();

const draft = ref<RaceInput>({ ...props.race });
const km = ref('');
const goal = ref('');
const result = ref('');
const local = ref<string | null>(null);
watch(() => props.race, (race) => {
  draft.value = { ...race };
  km.value = race.distance_m ? String(+(race.distance_m / 1000).toFixed(3)) : '';
  goal.value = race.goal_seconds ? clockText(race.goal_seconds) : '';
  result.value = race.result_seconds ? clockText(race.result_seconds) : '';
  local.value = null;
}, { immediate: true });

const sports = computed(() => (['running', 'trail', 'cycling', 'swimming', 'triathlon', 'other'] as RaceSport[])
  .map(value => ({ value, label: t.value.raceSports[value] })));
const priorities = computed(() => (['a', 'b', 'c'] as RacePriority[]).map(value => ({ value, label: t.value.priorities[value] })));
const pickDistance = (meters: number) => { km.value = String(+(meters / 1000).toFixed(4)); };

async function save() {
  local.value = null;
  const name = draft.value.name.trim();
  if (!name || !draft.value.race_date) { local.value = t.value.required; return; }
  const goalSeconds = goal.value.trim() ? parseClock(goal.value) : null;
  const resultSeconds = result.value.trim() ? parseClock(result.value) : null;
  if ((goal.value.trim() && !goalSeconds) || (result.value.trim() && !resultSeconds)) { local.value = t.value.badTime; return; }
  const meters = km.value.trim() ? Number(km.value) * 1000 : null;
  if (meters !== null && !(meters >= 50)) { local.value = t.value.required; return; }
  const input = { ...draft.value, name, distance_m: meters, goal_seconds: goalSeconds, result_seconds: resultSeconds };
  if (await write(() => backend.raceSave(input), ['races', 'records'])) emit('close');
}
async function remove() {
  if (draft.value.id && await write(() => backend.raceDelete(draft.value.id!), ['races', 'records'])) emit('close');
}
</script>

<template>
  <EditorShell :title="draft.id ? t.editRace : t.addRace" :busy="busy" :error="local ?? error" :can-delete="Boolean(draft.id)"
    @save="save" @close="emit('close')" @remove="remove">
    <label>{{ t.raceName }}<input v-model="draft.name" maxlength="120" required data-race-name></label>
    <div class="field"><span>{{ t.raceDate }}</span><WheelDatePicker v-model="draft.race_date" :aria-label="t.raceDate" /></div>
    <div class="field"><span>{{ t.raceSport }}</span>
      <SegmentTrack compact :model-value="draft.sport" :items="sports" :aria-label="t.raceSport" @update:model-value="v => (draft.sport = v as RaceSport)" />
    </div>
    <div class="field">
      <span>{{ t.distance }}</span>
      <div class="quick-row">
        <button v-for="item in RACE_DISTANCES" :key="item.key" type="button" class="quick" @click="pickDistance(item.meters)">{{ t.distances[item.key] }}</button>
      </div>
      <input v-model="km" class="num" inputmode="decimal" :aria-label="t.distance" data-race-km>
    </div>
    <div class="pair">
      <label>{{ t.goalTime }}<input v-model="goal" class="num" :placeholder="t.timeHint" inputmode="numeric" data-race-goal></label>
      <label>{{ t.result }}<input v-model="result" class="num" :placeholder="t.timeHint" inputmode="numeric" data-race-result></label>
    </div>
    <div class="field"><span>{{ t.priority }}</span>
      <SegmentTrack compact :model-value="draft.priority" :items="priorities" :aria-label="t.priority" @update:model-value="v => (draft.priority = v as RacePriority)" />
    </div>
    <label>{{ t.notes }}<textarea v-model="draft.notes" rows="2" maxlength="2000"></textarea></label>
  </EditorShell>
</template>

<style scoped>
.quick-row { display: flex; flex-wrap: wrap; gap: 6px; }
.quick { min-height: 28px; padding: 0 10px; border: 0; border-radius: 999px; background: color-mix(in srgb, var(--ink) 7%, transparent); color: var(--muted); font: inherit; font-size: var(--fs-xs); cursor: pointer; }
.quick:hover { background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--ink); }
</style>
