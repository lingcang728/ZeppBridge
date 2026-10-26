<script setup lang="ts">
/**
 * 信匣「你的信」（批次 7）：那年今天、时间胶囊、每周数据来信。
 *
 * 全是本机的事实，不生成评语、不和别人比。每周来信和胶囊是写下那一刻的快照（后端存在
 * data_letters 里），离线也能重读；胶囊没到日子，后端连原文都不给界面。
 * 每周来信的事实怎么写成字和概览的本地周报共用一份（weeklyFactText.ts）。
 */
import './paper.css';
import { computed, onMounted, ref } from 'vue';
import WaxSeal from './WaxSeal.vue';
import { useDataLetterText } from './dataLetters.i18n';
import { useWeeklyFactText } from '../weeklyFactText';
import { backend } from '../../lib/bridge';
import { workoutLabel } from '../../lib/labels';
import { formatNumber } from '../../lib/format';
import { displayDateTimeFormatter, parseDisplayDate } from '../../lib/dateTime';
import { dayKey } from '../../lib/aiTask/bridgeScale';
import { changeArrow, reportTone as tone } from '../../lib/changeTone';
import type { DataLetter, DataLettersView, SnapshotValue } from '../../types/letters';
import type { InsightFact } from '../../types';

const t = useDataLetterText();
const facts = useWeeklyFactText();

const view = ref<DataLettersView | null>(null);
const failed = ref(false);
const load = async () => {
  try {
    view.value = await backend.dataLettersState();
    failed.value = false;
  } catch {
    failed.value = true;
  }
};
onMounted(load);

const capsules = computed(() => (view.value?.letters ?? []).filter((letter) => letter.kind === 'capsule'));
const weeklies = computed(() => (view.value?.letters ?? []).filter((letter) => letter.kind === 'weekly' && letter.weekly));
const isEmpty = computed(() => view.value !== null && !view.value.letters.length && !view.value.on_this_day.length);

const longDate = (value: string) => {
  const date = parseDisplayDate(value.slice(0, 10));
  return Number.isNaN(date.getTime()) ? value : displayDateTimeFormatter({ year: 'numeric', month: 'short', day: 'numeric' }).format(date);
};
const shortDate = (value: string) => displayDateTimeFormatter({ month: 'short', day: 'numeric' }).format(parseDisplayDate(value));
const today = () => dayKey(new Date());
const isDue = (letter: DataLetter) => Boolean(letter.open_on && letter.open_on <= today());

/* 快照里的一项借周报的写法（同一指标同一口径）；步数周报里没有，单独写。 */
const asFact = (value: SnapshotValue) => ({ metric: value.metric, unit: value.unit } as InsightFact);
const valueLabel = (value: SnapshotValue) =>
  (value.metric === 'steps' ? t.value.stepsLabel : facts.metricLabel(`weekly.${value.metric}`, value.metric));
const valueText = (value: SnapshotValue | undefined) => {
  if (!value || value.value === null) return '—';
  if (value.metric === 'steps') return t.value.steps(formatNumber(Math.round(value.value)));
  return facts.formatNumber(asFact(value), value.value);
};
const pairs = (letter: DataLetter) => (letter.written_snapshot?.values ?? []).map((then) => ({
  then,
  now: letter.opened_snapshot?.values.find((value) => value.metric === then.metric),
})).filter((pair) => pair.then.value !== null || (pair.now?.value ?? null) !== null);

const workoutText = (workout: { workout_type: string; distance_meters: number | null; duration_seconds: number | null }) => {
  const km = workout.distance_meters && workout.distance_meters > 0
    ? formatNumber(workout.distance_meters / 1000, { maximumFractionDigits: 1 }) : null;
  const minutes = workout.duration_seconds ? Math.round(workout.duration_seconds / 60) : null;
  return t.value.workout(workoutLabel(workout.workout_type), km, minutes);
};

const weeklyFacts = (letter: DataLetter) => (letter.weekly?.facts ?? []).filter((fact) => fact.value !== null);
const deltaText = (fact: InsightFact) => {
  if (!fact.comparison) return facts.reasonText(fact);
  const percent = `${fact.comparison.delta_percent > 0 ? '+' : ''}${fact.comparison.delta_percent.toFixed(1)}%`;
  const arrow = tone(fact) === 'up' || tone(fact) === 'down' ? `${changeArrow(fact)} ` : '';
  return t.value.vsBefore(facts.formatNumber(fact, fact.comparison.baseline_value), arrow + percent);
};

/* 写胶囊：只给三个跨度可选，不弹日历——这是写信，不是排日程。 */
const SPANS = [{ months: 6, key: 'spanHalfYear' }, { months: 12, key: 'spanOneYear' }, { months: 36, key: 'spanThreeYears' }] as const;
const note = ref('');
const months = ref<number>(12);
const sealing = ref(false);
const actionError = ref('');
const openOn = () => {
  const date = new Date();
  date.setMonth(date.getMonth() + months.value);
  return dayKey(date);
};
const seal = async () => {
  if (!note.value.trim() || sealing.value) return;
  sealing.value = true;
  actionError.value = '';
  try {
    await backend.dataLettersSealCapsule(note.value.trim(), openOn());
    note.value = '';
    await load();
  } catch {
    actionError.value = t.value.sealFailed;
  } finally {
    sealing.value = false;
  }
};
const opening = ref<number | null>(null);
const openCapsule = async (letter: DataLetter) => {
  opening.value = letter.id;
  actionError.value = '';
  try {
    await backend.dataLettersOpenCapsule(letter.id);
    await load();
  } catch {
    actionError.value = t.value.openFailed;
  } finally {
    opening.value = null;
  }
};
</script>

<template>
  <div class="data-letters">
    <p v-if="failed" class="box-empty" role="alert">{{ t.loadFailed }}</p>
    <p v-else-if="isEmpty" class="box-empty">{{ t.empty }}</p>

    <template v-if="view?.on_this_day.length">
      <h2 class="box-heading">{{ t.onThisDay }}</h2>
      <ul class="slip-grid">
        <li v-for="year in view.on_this_day" :key="year.date" class="slip paper">
          <span class="slip-head">{{ t.yearsAgo(year.years_ago) }} · {{ longDate(year.date) }}</span>
          <p v-for="value in year.values" :key="value.metric" class="slip-line">
            <span>{{ valueLabel(value) }}</span><strong>{{ valueText(value) }}</strong>
          </p>
          <p v-for="workout in year.workouts" :key="workout.workout_id" class="slip-line">
            <span>{{ workoutText(workout) }}</span>
          </p>
        </li>
      </ul>
    </template>

    <h2 class="box-heading">{{ t.capsules }}</h2>
    <form class="slip paper capsule-pad" @submit.prevent="seal">
      <textarea v-model="note" class="capsule-text paper-lines" maxlength="1000" rows="4" :placeholder="t.capsulePlaceholder" :aria-label="t.capsules"></textarea>
      <div class="capsule-row">
        <label class="capsule-span">
          <span>{{ t.openAfter }}</span>
          <select v-model.number="months">
            <option v-for="span in SPANS" :key="span.months" :value="span.months">{{ t[span.key] }}</option>
          </select>
        </label>
        <button type="submit" class="button" :disabled="!note.trim() || sealing">{{ sealing ? t.sealing : t.seal }}</button>
      </div>
    </form>
    <p v-if="actionError" class="box-empty" role="alert">{{ actionError }}</p>

    <ul v-if="capsules.length" class="slip-grid">
      <li v-for="letter in capsules" :key="letter.id" :class="['slip', 'paper', { 'is-sealed': letter.sealed }]">
        <span class="slip-head">{{ t.sealedOn(longDate(letter.written_at)) }}</span>
        <template v-if="letter.sealed">
          <div class="sealed-face">
            <WaxSeal :size="56" still />
            <span v-if="isDue(letter)" class="sealed-note">{{ t.due }}</span>
            <span v-else class="sealed-note">{{ t.sealedUntil(longDate(letter.open_on ?? '')) }}</span>
          </div>
          <button v-if="isDue(letter)" type="button" class="button" :disabled="opening === letter.id" @click="openCapsule(letter)">{{ t.open }}</button>
        </template>
        <template v-else>
          <p class="slip-text paper-lines">{{ letter.note }}</p>
          <table v-if="pairs(letter).length" class="compare">
            <caption>{{ t.windowNote }}</caption>
            <thead><tr><th></th><th>{{ t.then }}</th><th>{{ t.now }}</th></tr></thead>
            <tbody>
              <tr v-for="pair in pairs(letter)" :key="pair.then.metric">
                <th scope="row">{{ valueLabel(pair.then) }}</th>
                <td>{{ valueText(pair.then) }}</td>
                <td>{{ valueText(pair.now) }}</td>
              </tr>
            </tbody>
          </table>
          <span v-if="letter.opened_at" class="slip-receipt">{{ t.openedOn(longDate(letter.opened_at)) }}</span>
        </template>
      </li>
    </ul>

    <template v-if="weeklies.length">
      <h2 class="box-heading">{{ t.weekly }}</h2>
      <ul class="slip-grid">
        <li v-for="letter in weeklies" :key="letter.id" class="slip paper">
          <span class="slip-head">{{ t.weekRange(shortDate(letter.weekly!.recent_start), shortDate(letter.weekly!.recent_end)) }}</span>
          <p v-for="fact in weeklyFacts(letter)" :key="fact.fact_id" class="slip-line">
            <span>{{ facts.metricLabel(fact.fact_id, fact.metric) }}</span>
            <strong>{{ facts.formatValue(fact) }}</strong>
            <em :class="['slip-delta', fact.comparison ? tone(fact) : 'muted']">{{ deltaText(fact) }}</em>
          </p>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.data-letters { display: grid; gap: 14px; }
.box-empty { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
.box-heading { margin: 8px 0 0; color: var(--muted); font-size: var(--fs-2xs); font-weight: 400; letter-spacing: .06em; }
.slip-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); align-items: start; gap: 18px; margin: 0; padding: 0; list-style: none; }
.slip { --paper-size: 15px; --paper-line: 28px; display: grid; align-content: start; gap: 2px; padding: 14px 20px 16px; }
.slip-head { color: var(--paper-muted); font: 400 var(--fs-2xs) / var(--paper-line) var(--font-sans); letter-spacing: .06em; }
.slip-line { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; margin: 0; line-height: var(--paper-line); }
.slip-line > span { color: var(--paper-muted); }
.slip-line > strong { font-weight: 700; }
.slip-delta { flex-basis: 100%; margin-top: -6px; color: var(--paper-muted); font-size: var(--fs-2xs); font-style: normal; line-height: 1.6; }
/* 信纸是纸色，不跟主题变；好坏用墨色区分，中性指标只给箭头。 */
.slip-delta.good { color: #2f6b45; }
.slip-delta.bad { color: var(--paper-rubric); }
.slip-text { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.slip-receipt { margin-top: 8px; color: var(--paper-rubric); font: 700 var(--fs-2xs)/1.6 var(--font-sans); letter-spacing: .04em; }
.slip > .button { justify-self: start; margin-top: 8px; }

.capsule-pad { gap: 10px; }
.capsule-text {
  width: 100%; min-height: calc(var(--paper-line) * 4); padding: 0; border: 0; resize: vertical;
  background-color: transparent; color: var(--paper-ink); font: inherit; line-height: var(--paper-line);
}
.capsule-text:focus-visible { outline: none; }
.capsule-text::placeholder { color: var(--paper-muted); }
.capsule-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
.capsule-span { display: inline-flex; align-items: center; gap: 8px; color: var(--paper-muted); font-size: var(--fs-xs); }
.capsule-span select { padding: 4px 8px; border: 1px solid rgb(0 0 0 / .18); border-radius: 6px; background: transparent; color: var(--paper-ink); font: inherit; }

.sealed-face { display: flex; align-items: center; gap: 14px; min-height: 72px; }
.sealed-note { color: var(--paper-muted); font-size: var(--fs-xs); }

.compare { width: 100%; margin-top: 10px; border-collapse: collapse; font-size: var(--fs-xs); }
.compare caption { caption-side: bottom; padding-top: 6px; color: var(--paper-muted); font-size: var(--fs-2xs); text-align: left; }
.compare th, .compare td { padding: 3px 6px 3px 0; text-align: left; font-weight: 400; }
.compare thead th { color: var(--paper-muted); font-size: var(--fs-2xs); }
.compare tbody th { color: var(--paper-muted); }
.compare td { font-weight: 700; font-variant-numeric: tabular-nums; }
</style>
