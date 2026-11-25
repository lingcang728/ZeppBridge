<script setup lang="ts">
/* 月档每一组的组头（月度分析）：大数在上、标签在下，一栏一项，栏间一道细竖线。
   - 睡眠：平均时长 · 平均评分 · 平均入睡 · 记录几晚，右边分期占比环 + 四色图例；
   - 运动：次数 · 距离 · 时长。
   「比上个月」不单占一栏：挂成小胶囊贴在被比较的那一项旁边（睡眠比平均时长，运动比距离），涨绿跌红，标签行补一句「比 十月」。
   哪一项没有数据就写「—」，上个月没有记录就不写比较（不拿 0 当上个月）。 */
import { computed } from 'vue';
import { useMessages } from '../../i18n';
import { albumMessages } from './album.i18n';
import { formatDistance, formatDuration } from '../../lib/format';
import { displayDateTimeFormatter } from '../../lib/dateTime';
import { sleepStageLabel } from '../../lib/sleepStages';
import { clockFromNoon, periodDelta, previousMonth, type AlbumKind, type SleepPeriod, type WorkoutPeriod } from '../../lib/album/album';
import StageRing from './StageRing.vue';

const props = defineProps<{ kind: AlbumKind; month: string; periods: (WorkoutPeriod | SleepPeriod)[] }>();
const t = useMessages(albumMessages);

const dateOf = (key: string) => new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1);
const title = computed(() => displayDateTimeFormatter({ year: 'numeric', month: 'long' }).format(dateOf(props.month)));
const prevName = computed(() => displayDateTimeFormatter({ month: 'long' }).format(dateOf(previousMonth(props.month))));
const period = computed(() => props.periods.find((p) => p.key === props.month) ?? null);

interface Fact { key: string; label: string; value: string; delta?: { text: string; good: boolean } | null }
const signed = (value: number, text: string) => `${value > 0 ? '+' : '−'}${text}`;
const STAGES = ['deep', 'light', 'rem', 'awake'] as const;

const sleep = computed(() => {
  if (props.kind !== 'sleep' || !period.value) return null;
  const p = period.value as SleepPeriod;
  const delta = periodDelta(props.periods as SleepPeriod[], props.month, (x) => x.avg_duration_min);
  const total = STAGES.reduce((sum, key) => sum + Math.max(0, p.stages[key]), 0);
  const facts: Fact[] = [
    {
      key: 'duration', label: t.value.avgDuration, value: formatDuration(p.avg_duration_min, '—'),
      delta: delta === null || Math.round(delta) === 0 ? null : { text: signed(delta, formatDuration(Math.abs(delta))), good: delta > 0 },
    },
    { key: 'score', label: t.value.avgScore, value: p.avg_score === null ? '—' : String(Math.round(p.avg_score)) },
    { key: 'onset', label: t.value.avgOnset, value: p.avg_onset_min === null ? '—' : clockFromNoon(p.avg_onset_min) },
    { key: 'nights', label: t.value.nightsLabel, value: t.value.nights(p.nights) },
  ];
  const legend = total > 0
    ? STAGES.map((stage) => ({ stage, label: sleepStageLabel(stage), share: `${Math.round((Math.max(0, p.stages[stage]) / total) * 100)}%` }))
    : [];
  return { facts, stages: p.stages, legend };
});
const workout = computed(() => {
  if (props.kind !== 'workouts' || !period.value) return null;
  const p = period.value as WorkoutPeriod;
  const delta = periodDelta(props.periods as WorkoutPeriod[], props.month, (x) => (x.distance_m > 0 ? x.distance_m : null));
  const facts: Fact[] = [
    { key: 'count', label: t.value.count, value: String(p.count) },
    {
      key: 'distance', label: t.value.distance, value: formatDistance(p.distance_m, '—'),
      delta: delta === null || Math.abs(delta) < 50 ? null : { text: signed(delta, formatDistance(Math.abs(delta))), good: delta > 0 },
    },
    { key: 'duration', label: t.value.duration, value: p.duration_s > 0 ? formatDuration(p.duration_s / 60) : '—' },
  ];
  return { facts };
});
const facts = computed(() => sleep.value?.facts ?? workout.value?.facts ?? []);
</script>

<template>
  <header :class="['month-head', kind]">
    <h3 class="month-name">{{ title }}</h3>
    <div v-if="facts.length" class="month-row">
      <!-- 各项均分整行宽度（不再左边挤一团、右边一个环、中间空一大截），分期环是最后一栏。 -->
      <dl class="month-facts" :style="{ '--cols': facts.length }">
        <div v-for="fact in facts" :key="fact.key" class="fact">
          <dt>{{ fact.label }}<span v-if="fact.delta" class="fact-vs"> · {{ t.vsMonth(prevName) }}</span></dt>
          <dd class="fact-value">
            <span>{{ fact.value }}</span>
            <span v-if="fact.delta" :class="['fact-delta', fact.delta.good ? 'good' : 'bad']">{{ fact.delta.text }}</span>
          </dd>
        </div>
      </dl>
      <div v-if="sleep?.legend.length" class="month-mix">
        <StageRing class="month-ring" :stages="sleep.stages" :stroke="6" :label="t.stageShare" />
        <ul class="mix-legend">
          <li v-for="item in sleep.legend" :key="item.stage"><i :class="['swatch', item.stage]" />{{ item.label }}<b>{{ item.share }}</b></li>
        </ul>
      </div>
    </div>
  </header>
</template>

<style scoped>
.month-head { display: grid; gap: 14px; margin: 0 0 18px; container-type: inline-size; }
.month-name { margin: 0; color: var(--ink); font-size: var(--fs-lg, 1.15rem); font-weight: 700; font-variant-numeric: tabular-nums; }
.month-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; padding: 14px 0; border-block: 1px solid color-mix(in srgb, var(--ink) 7%, transparent); }
.month-facts { display: grid; grid-template-columns: repeat(var(--cols), minmax(0, 1fr)); margin: 0; }
.fact { display: grid; align-content: center; gap: 3px; min-width: 0; padding-inline: 20px; }
.fact:first-child { padding-left: 4px; }
.fact + .fact, .month-mix { box-shadow: inset 1px 0 0 color-mix(in srgb, var(--ink) 10%, transparent); }
.fact-value { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; margin: 0; color: var(--ink); font-size: var(--fs-xl, 1.2rem); font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.2; }
.fact-delta { padding: 1px 8px; border-radius: 999px; font-size: var(--fs-xs); font-weight: 650; white-space: nowrap; }
.fact-delta.good { background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--accent); }
.fact-delta.bad { background: color-mix(in srgb, var(--danger) 16%, transparent); color: var(--danger); }
.month-facts dt { grid-row: 2; overflow: hidden; color: var(--muted); font-size: var(--fs-xs); font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.fact-vs { color: var(--subtle); }
.month-mix { display: flex; align-items: center; gap: 14px; padding-left: 24px; }
.month-ring { width: 56px; height: 56px; }
.mix-legend { display: grid; grid-template-columns: repeat(2, auto); gap: 2px 18px; margin: 0; padding: 0; list-style: none; color: var(--muted); font-size: var(--fs-xs); font-weight: 600; }
.mix-legend li { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
.mix-legend b { margin-left: auto; padding-left: 6px; color: var(--ink); font-weight: 650; font-variant-numeric: tabular-nums; }
.swatch { width: 8px; height: 8px; flex: none; border-radius: 50%; }
.swatch.deep { background: var(--sleep-deep); }
.swatch.light { background: var(--sleep-light); }
.swatch.rem { background: var(--sleep-rem); }
.swatch.awake { background: var(--sleep-awake); }
/* 中等宽度：图例收成一列。窄：数一行两项、不画竖线，分期环单独占一行。 */
@container (max-width: 980px) {
  .mix-legend { grid-template-columns: auto; }
}
@container (max-width: 680px) {
  .month-row { grid-template-columns: minmax(0, 1fr); gap: 12px; }
  .month-facts { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 16px; }
  .fact, .fact:first-child { padding-inline: 0; }
  .fact + .fact, .month-mix { box-shadow: none; }
  .month-mix { padding-left: 0; }
  .mix-legend { grid-template-columns: repeat(2, auto); }
}
</style>
