<script setup lang="ts">
/**
 * 概览第一屏的「这一周」摘要（体验评估 #3）：最值得看的两三项变化、用了几天记录、比的是哪段日期。
 * 点开能看曲线、补一条生活事件、或带去问 AI。只陈述和你自己此前 28 天比的事实，不给健康建议、
 * 不评好坏（下面完整周报卡的好坏着色规则不变）。
 */
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import Icon from '../Icon.vue';
import { useWeeklyReport } from '../../composables/useWeeklyReport';
import { useLifeEvents } from '../../composables/useLifeEvents';
import { weeklyReportMessages } from '../WeeklyReportCard.i18n';
import { displayDateTimeFormatter, parseDisplayDate } from '../../lib/dateTime';
import type { InsightFact } from '../../types';
import { defineMessages, useMessages } from '../../i18n';

const t = useMessages(defineMessages(
  {
    title: '这一周',
    window: (recent: string, baseline: string) => `${recent}，对比你自己的 ${baseline}`,
    higher: (label: string, percent: number) => `${label}比平时高 ${percent}%`,
    lower: (label: string, percent: number) => `${label}比平时低 ${percent}%`,
    days: (count: number) => `${count} 天记录`,
    steady: '这一周和平时比没有明显的变化。',
    none: '这一周还没有能和平时比的数据。',
    curves: '看曲线',
    addEvent: '补一条生活事件',
    toAi: '带去问 AI',
    full: '完整周报',
  },
  {
    title: 'This week',
    window: (recent: string, baseline: string) => `${recent}, compared with your own ${baseline}`,
    higher: (label: string, percent: number) => `${label} ${percent}% higher than usual`,
    lower: (label: string, percent: number) => `${label} ${percent}% lower than usual`,
    days: (count: number) => (count === 1 ? '1 day of records' : `${count} days of records`),
    steady: 'Nothing changed much compared with usual this week.',
    none: 'Nothing to compare with usual yet this week.',
    curves: 'See curves',
    addEvent: 'Add a life event',
    toAi: 'Ask AI about it',
    full: 'Full weekly report',
  },
  {
    title: 'Esta semana',
    window: (recent: string, baseline: string) => `${recent}, frente a tu propio ${baseline}`,
    higher: (label: string, percent: number) => `${label} un ${percent}% más alto de lo habitual`,
    lower: (label: string, percent: number) => `${label} un ${percent}% más bajo de lo habitual`,
    days: (count: number) => `${count} días con registros`,
    steady: 'Esta semana no hubo cambios claros respecto a lo habitual.',
    none: 'Aún no hay datos para comparar con lo habitual esta semana.',
    curves: 'Ver curvas',
    addEvent: 'Añadir un evento',
    toAi: 'Preguntar a la IA',
    full: 'Informe semanal completo',
  },
  'components/overview/WeekDigest',
));
const w = useMessages(weeklyReportMessages);
const { report } = useWeeklyReport(() => w.value.loadFailed);
const { open: openEvent } = useLifeEvents();
const router = useRouter();

const ROUTE: Record<string, string> = {
  'weekly.resting_hr': '/heart',
  'weekly.hrv': '/body',
  'weekly.stress': '/body',
  'weekly.sleep_duration': '/sleep',
  'weekly.sleep_start_regularity': '/sleep',
  'weekly.workout_count': '/workouts',
  'weekly.training_load': '/training',
};
/** 变化小于这个百分比不算「值得看」：日常波动。 */
const NOTABLE_PERCENT = 5;

const label = (fact: InsightFact) =>
  (w.value.metric as Record<string, string | undefined>)[fact.fact_id] ?? fact.metric;
const top = computed(() => (report.value?.facts ?? [])
  .filter((fact) => fact.comparison && fact.value !== null && fact.confidence !== 'insufficient'
    && Math.abs(fact.comparison.delta_percent) >= NOTABLE_PERCENT)
  .sort((a, b) => Math.abs(b.comparison!.delta_percent) - Math.abs(a.comparison!.delta_percent))
  .slice(0, 3)
  .map((fact) => {
    const percent = Math.round(Math.abs(fact.comparison!.delta_percent));
    const text = fact.comparison!.delta_percent > 0 ? t.value.higher(label(fact), percent) : t.value.lower(label(fact), percent);
    return { id: fact.fact_id, text, days: fact.evidence_count, to: ROUTE[fact.fact_id] ?? '/recent' };
  }));
const comparable = computed(() => (report.value?.facts ?? []).some((fact) => fact.comparison));

const day = (date: string) => displayDateTimeFormatter({ month: 'numeric', day: 'numeric' }).format(parseDisplayDate(date));
const windowText = computed(() => {
  const value = report.value;
  if (!value) return '';
  return t.value.window(`${day(value.recent_start)}–${day(value.recent_end)}`, `${day(value.baseline_start)}–${day(value.baseline_end)}`);
});

const addEvent = () => { if (report.value) openEvent(undefined, report.value.recent_end.slice(0, 10)); };
const toFull = () => document.querySelector('.weekly-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
</script>

<template>
  <section v-if="report" class="week-digest" aria-labelledby="week-digest-title">
    <header class="digest-head">
      <h2 id="week-digest-title"><Icon name="activity" :size="15" />{{ t.title }}</h2>
      <span class="digest-window">{{ windowText }}</span>
    </header>
    <ul v-if="top.length" class="digest-list">
      <li v-for="item in top" :key="item.id">
        <RouterLink :to="item.to" class="digest-item">
          <strong>{{ item.text }}</strong>
          <small>{{ t.days(item.days) }}</small>
          <Icon name="chevron-right" :size="14" class="digest-go" />
        </RouterLink>
      </li>
    </ul>
    <p v-else class="digest-empty">{{ comparable ? t.steady : t.none }}</p>
    <!-- 三个去处排成等宽的一排：各带一枚有底色的小图标，整行可点，和上面的三格事实对齐。
         以前是三枚没有边界的小字按钮挤在左下角，看不出能点、也不齐。 -->
    <div class="digest-actions">
      <button type="button" class="digest-action" @click="toFull">
        <span class="da-icon tone-report" aria-hidden="true"><Icon name="bars" :size="14" /></span><span class="da-text">{{ t.full }}</span>
      </button>
      <button type="button" class="digest-action" @click="addEvent">
        <span class="da-icon tone-event" aria-hidden="true"><Icon name="plus" :size="14" /></span><span class="da-text">{{ t.addEvent }}</span>
      </button>
      <button type="button" class="digest-action" @click="router.push('/ai')">
        <span class="da-icon tone-ai" aria-hidden="true"><Icon name="send" :size="14" /></span><span class="da-text">{{ t.toAi }}</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.week-digest { display: grid; gap: 10px; padding: 16px 18px; border-radius: var(--radius-lg); background: var(--mat-card); box-shadow: var(--mat-rim), var(--mat-shadow); }
.digest-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; }
.digest-head h2 { display: inline-flex; align-items: center; gap: 6px; margin: 0; color: var(--ink); font-size: var(--fs-lg); font-weight: 700; }
.digest-window { color: var(--subtle); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
.digest-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px; margin: 0; padding: 0; list-style: none; }
.digest-item { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 2px 8px; min-height: 56px; padding: 10px 14px; border-radius: var(--radius-md); background: var(--mat-inset); box-shadow: var(--mat-inset-shadow); color: var(--ink); text-decoration: none; }
.digest-item:hover { background: color-mix(in srgb, var(--accent) 8%, var(--mat-inset)); }
.digest-item:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.digest-item strong { font-size: var(--fs-md); font-weight: 650; }
.digest-item small { grid-row: 2; color: var(--subtle); font-size: var(--fs-xs); }
.digest-go { grid-row: 1 / span 2; grid-column: 2; color: var(--subtle); }
.digest-empty { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
.digest-actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 8px; padding-top: 10px; border-top: 1px solid var(--mat-line); }
.digest-action { display: flex; align-items: center; gap: 10px; min-width: 0; min-height: 40px; padding: 6px 12px 6px 7px; border: 0; border-radius: 999px;
  background: transparent; color: var(--muted); font: inherit; font-size: var(--fs-sm); font-weight: 600; text-align: left; cursor: pointer;
  transition: background-color var(--dur-fast) ease, color var(--dur-fast) ease; }
.digest-action:hover { background: color-mix(in srgb, var(--ink) 6%, transparent); color: var(--ink); }
.digest-action:active { scale: .98; }
.digest-action:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.da-icon { display: grid; width: 28px; height: 28px; flex: none; place-items: center; border-radius: 50%; }
.da-icon.tone-report { background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--accent); }
.da-icon.tone-event { background: color-mix(in srgb, var(--warning) 18%, transparent); color: var(--warning); }
.da-icon.tone-ai { background: color-mix(in srgb, var(--pace) 18%, transparent); color: var(--pace); }
.da-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
