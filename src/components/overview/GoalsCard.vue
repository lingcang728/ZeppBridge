<script setup lang="ts">
/**
 * 目标与连续天数：每天步数、每晚睡眠、每周距离。
 * 每一项一行：今天（这一晚 / 这一周）的进度条、连续达成多久、最近的达成率。
 * 没有记录的日子就是没达成（连续天数在那里断开），今天还没走完时从昨天往回数，不算断。
 * 目标只存在这台机器上，右上角「编辑」可以改或清掉（清掉 = 不设这一项）。
 */
import { computed, ref } from 'vue';
import { useGoals } from '../../composables/useGoals';
import { today as currentToday } from '../../lib/currentDay';
import { formatDuration, formatNumber } from '../../lib/format';
import { dailyStreak, weeklyGoalProgress, weeklyTotalsFromDays, type DayPoint } from '../../lib/progress';
import type { SleepNight } from '../../lib/sleepTrends';
import { distanceUnitLabel, toBigDistance } from '../../lib/units';
import { formatDay } from '../../lib/trendWindow';
import { mondayOf } from '../../lib/weeklyVolume';
import { defineMessages, useMessages } from '../../i18n';

const props = defineProps<{ steps: DayPoint[]; distance: DayPoint[]; nights: SleepNight[] }>();

const messages = defineMessages(
  {
    title: '目标',
    edit: '编辑',
    done: '完成',
    steps: '每天步数',
    sleep: '每晚睡眠',
    distance: '每周总距离（全天）',
    stepsUnit: '步',
    hoursUnit: '小时',
    streakDays: (count: number) => `连续 ${count} 天`,
    streakWeeks: (count: number) => `连续 ${count} 周`,
    noStreak: '还没有连续记录',
    best: (count: number, unit: string) => `最长 ${count} ${unit}`,
    days: '天',
    weeks: '周',
    recent: (met: number, days: number) => `最近 30 天达成 ${met} / ${days}`,
    recentWeeks: (met: number) => `最近 8 周达成 ${met} 周`,
    today: '今天',
    lastNight: '最近一晚',
    thisWeek: '本周',
    noData: '暂无记录',
    off: '没有设这个目标',
    setGoal: '设一个',
    reached: '已达成',
    editDistance: (unit: string) => `每周距离（${unit}）`,
    empty: '同步后会在这里显示进度。',
  },
  {
    title: 'Goals',
    edit: 'Edit',
    done: 'Done',
    steps: 'Daily steps',
    sleep: 'Nightly sleep',
    distance: 'Weekly distance (all day)',
    stepsUnit: 'steps',
    hoursUnit: 'hours',
    streakDays: (count: number) => `${count}-day streak`,
    streakWeeks: (count: number) => `${count}-week streak`,
    noStreak: 'No streak yet',
    best: (count: number, unit: string) => `Best ${count} ${unit}`,
    days: 'days',
    weeks: 'weeks',
    recent: (met: number, days: number) => `Met ${met} of the last ${days} days`,
    recentWeeks: (met: number) => `Met in ${met} of the last 8 weeks`,
    today: 'Today',
    lastNight: 'Last night',
    thisWeek: 'This week',
    noData: 'No record yet',
    off: 'No goal set',
    setGoal: 'Set one',
    reached: 'Reached',
    editDistance: (unit: string) => `Weekly distance (${unit})`,
    empty: 'Progress shows up here after a sync.',
  },
  {
    title: 'Objetivos',
    edit: 'Editar',
    done: 'Listo',
    steps: 'Pasos al día',
    sleep: 'Sueño cada noche',
    distance: 'Distancia semanal (todo el día)',
    stepsUnit: 'pasos',
    hoursUnit: 'horas',
    streakDays: (count: number) => `Racha de ${count} días`,
    streakWeeks: (count: number) => `Racha de ${count} semanas`,
    noStreak: 'Sin racha todavía',
    best: (count: number, unit: string) => `Mejor: ${count} ${unit}`,
    days: 'días',
    weeks: 'semanas',
    recent: (met: number, days: number) => `Cumplido ${met} de los últimos ${days} días`,
    recentWeeks: (met: number) => `Cumplido en ${met} de las últimas 8 semanas`,
    today: 'Hoy',
    lastNight: 'Anoche',
    thisWeek: 'Esta semana',
    noData: 'Sin registro todavía',
    off: 'Sin objetivo',
    setGoal: 'Fijar uno',
    reached: 'Cumplido',
    editDistance: (unit: string) => `Distancia semanal (${unit})`,
    empty: 'El progreso aparecerá aquí tras sincronizar.',
  },
  'components/overview/GoalsCard',
);
const t = useMessages(messages);

const goals = useGoals();
const editing = ref(false);
const todayText = computed(() => formatDay(currentToday()));

/** 每大单位多少米：公制 1000，英制 1609.344。 */
const metersPerBig = () => 1000 / toBigDistance(1000);

interface Row {
  key: 'steps' | 'sleep' | 'distance';
  label: string;
  goalText: string | null;
  /** 现在的进度文字，和 0–100+ 的进度。没有记录时是 null。 */
  nowText: string | null;
  nowLabel: string;
  percent: number | null;
  streakText: string;
  bestText: string | null;
  recentText: string | null;
}

const rows = computed<Row[]>(() => {
  const out: Row[] = [];
  const goal = goals.value;
  const today = todayText.value;

  // 每天步数
  {
    const target = goal.stepsPerDay;
    const todaySteps = props.steps.find((point) => point.date === today)?.value ?? null;
    const streak = target ? dailyStreak(props.steps, target, today) : null;
    out.push({
      key: 'steps',
      label: t.value.steps,
      goalText: target ? `${formatNumber(target)} ${t.value.stepsUnit}` : null,
      nowLabel: t.value.today,
      nowText: todaySteps !== null ? formatNumber(Math.round(todaySteps)) : null,
      percent: target && todaySteps !== null ? (todaySteps / target) * 100 : null,
      streakText: streak && streak.current > 0 ? t.value.streakDays(streak.current) : t.value.noStreak,
      bestText: streak && streak.best > 0 ? t.value.best(streak.best, t.value.days) : null,
      recentText: streak?.recent ? t.value.recent(streak.recent.met, streak.recent.days) : null,
    });
  }

  // 每晚睡眠（按入睡那天记一晚）
  {
    const target = goal.sleepHours;
    const nightPoints = props.nights.map((night) => ({ date: night.date, value: night.minutes }));
    const last = props.nights[props.nights.length - 1] ?? null;
    // 「今天」对睡眠来说是昨晚入睡的那一晚：记在昨天的日期上，所以把「今天」往前挪一天来数。
    const anchor = formatDay(new Date(currentToday().getFullYear(), currentToday().getMonth(), currentToday().getDate() - 1));
    const streak = target ? dailyStreak(nightPoints, target * 60, anchor) : null;
    out.push({
      key: 'sleep',
      label: t.value.sleep,
      goalText: target ? `${formatNumber(target)} ${t.value.hoursUnit}` : null,
      nowLabel: t.value.lastNight,
      nowText: last ? formatDuration(Math.round(last.minutes)) : null,
      percent: target && last ? (last.minutes / (target * 60)) * 100 : null,
      streakText: streak && streak.current > 0 ? t.value.streakDays(streak.current) : t.value.noStreak,
      bestText: streak && streak.best > 0 ? t.value.best(streak.best, t.value.days) : null,
      recentText: streak?.recent ? t.value.recent(streak.recent.met, streak.recent.days) : null,
    });
  }

  // 每周距离
  {
    const target = goal.weeklyDistanceM;
    // 全天总距离（日常活动里的每日距离：走路、通勤都算），不只是运动记录。
    const totals = weeklyTotalsFromDays(props.distance);
    const progress = target ? weeklyGoalProgress(totals, target, currentToday()) : null;
    out.push({
      key: 'distance',
      label: t.value.distance,
      goalText: target ? `${formatNumber(Math.round(toBigDistance(target) * 10) / 10)} ${distanceUnitLabel()}` : null,
      nowLabel: t.value.thisWeek,
      nowText: props.distance.length ? `${formatNumber(Math.round(toBigDistance(totals.get(mondayOf(currentToday())) ?? 0) * 10) / 10)} ${distanceUnitLabel()}` : null,
      percent: target && props.distance.length ? ((progress?.thisWeek ?? 0) / target) * 100 : null,
      streakText: progress && progress.streakWeeks > 0 ? t.value.streakWeeks(progress.streakWeeks) : t.value.noStreak,
      bestText: null,
      recentText: progress ? t.value.recentWeeks(progress.recentMet) : null,
    });
  }
  return out;
});

/* —— 编辑：输入框的值直接写回目标；留空 = 不设这一项。 */
const parse = (text: string): number | null => {
  const value = Number(text.replace(',', '.'));
  return text.trim() !== '' && Number.isFinite(value) && value > 0 ? value : null;
};
const setSteps = (text: string) => { goals.value = { ...goals.value, stepsPerDay: parse(text) }; };
const setSleep = (text: string) => { goals.value = { ...goals.value, sleepHours: parse(text) }; };
const setDistance = (text: string) => {
  const value = parse(text);
  goals.value = { ...goals.value, weeklyDistanceM: value === null ? null : Math.round(value * metersPerBig()) };
};
const distanceInput = computed(() => (goals.value.weeklyDistanceM ? String(Math.round(toBigDistance(goals.value.weeklyDistanceM) * 10) / 10) : ''));
const hasData = computed(() => props.steps.length > 0 || props.nights.length > 0 || props.distance.length > 0);
</script>

<template>
  <section class="goals-card" :aria-label="t.title">
    <header>
      <strong>{{ t.title }}</strong>
      <button type="button" class="goals-edit" :aria-pressed="editing" @click="editing = !editing">{{ editing ? t.done : t.edit }}</button>
    </header>

    <div v-if="editing" class="goals-form">
      <label><span>{{ t.steps }}</span>
        <input type="number" inputmode="numeric" min="500" step="500" :value="goals.stepsPerDay ?? ''" @change="setSteps(($event.target as HTMLInputElement).value)" />
      </label>
      <label><span>{{ t.sleep }} ({{ t.hoursUnit }})</span>
        <input type="number" inputmode="decimal" min="3" max="14" step="0.5" :value="goals.sleepHours ?? ''" @change="setSleep(($event.target as HTMLInputElement).value)" />
      </label>
      <label><span>{{ t.editDistance(distanceUnitLabel()) }}</span>
        <input type="number" inputmode="decimal" min="1" step="5" :value="distanceInput" @change="setDistance(($event.target as HTMLInputElement).value)" />
      </label>
    </div>

    <p v-if="!hasData" class="goals-empty">{{ t.empty }}</p>
    <ul v-else class="goals-rows">
      <li v-for="row in rows" :key="row.key">
        <div class="goal-head">
          <span class="goal-label">{{ row.label }}</span>
          <span v-if="row.goalText" class="goal-target">{{ row.goalText }}</span>
          <span v-else class="goal-target off">{{ t.off }}</span>
        </div>
        <template v-if="row.goalText">
          <div class="goal-bar" role="progressbar" :aria-label="row.label" :aria-valuenow="row.percent === null ? undefined : Math.round(Math.min(100, row.percent))" aria-valuemin="0" aria-valuemax="100">
            <i :class="{ met: (row.percent ?? 0) >= 100 }" :style="{ width: `${Math.min(100, row.percent ?? 0)}%` }" />
          </div>
          <p class="goal-now">
            <span>{{ row.nowLabel }}: <b>{{ row.nowText ?? t.noData }}</b></span>
            <span v-if="row.percent !== null && row.percent >= 100" class="goal-reached">{{ t.reached }}</span>
          </p>
          <p class="goal-streak">
            <b>{{ row.streakText }}</b>
            <span v-if="row.bestText">{{ row.bestText }}</span>
          </p>
          <p v-if="row.recentText" class="goal-recent">{{ row.recentText }}</p>
        </template>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.goals-card { display: grid; align-content: start; gap: 14px; padding: 20px 22px; border-radius: var(--radius-lg); background: var(--mat-card); box-shadow: var(--mat-rim); }
header { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
header strong { font-size: var(--fs-sm); font-weight: 600; }
.goals-edit { padding: 3px 10px; border: 0; border-radius: var(--radius-sm); background: transparent; box-shadow: inset 0 0 0 1px var(--mat-line); color: var(--muted); font: inherit; font-size: var(--fs-xs); cursor: pointer; }
.goals-edit:hover { box-shadow: inset 0 0 0 1px var(--mat-line-hover); }
.goals-edit[aria-pressed='true'] { color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
.goals-empty { margin: 0; padding: 16px 0; color: var(--subtle); font-size: var(--fs-xs); text-align: center; }
.goals-form { display: grid; gap: 8px; }
.goals-form label { display: grid; grid-template-columns: minmax(0, 1fr) 7.5rem; align-items: center; gap: 10px; color: var(--muted); font-size: var(--fs-xs); }
.goals-form input { min-height: 32px; padding: 4px 10px; border: 0; border-radius: var(--radius-sm); background: transparent; box-shadow: inset 0 0 0 1px var(--mat-line); color: var(--ink); font: inherit; font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
.goals-form input:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.goals-rows { display: grid; gap: 18px; margin: 0; padding: 0; list-style: none; }
.goal-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.goal-label { color: var(--ink); font-size: var(--fs-sm); font-weight: 600; }
.goal-target { color: var(--muted); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
.goal-target.off { color: var(--subtle); }
.goal-bar { height: 6px; margin: 8px 0 6px; overflow: hidden; border-radius: 3px; background: color-mix(in srgb, var(--ink) 9%, transparent); }
.goal-bar i { display: block; height: 100%; border-radius: inherit; background: color-mix(in srgb, var(--accent) 60%, transparent); transition: width 420ms var(--ease-out); }
.goal-bar i.met { background: var(--accent); }
.goal-now, .goal-streak { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 2px 10px; margin: 0; color: var(--muted); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
.goal-now b { color: var(--ink); font-weight: 600; }
.goal-reached { color: var(--accent); font-weight: 600; }
.goal-streak { justify-content: flex-start; gap: 2px 14px; margin-top: 2px; color: var(--subtle); }
.goal-recent { margin: 0; color: var(--subtle); font-size: var(--fs-2xs); }
.goal-streak b { color: var(--muted); font-weight: 600; }
</style>
