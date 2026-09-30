<script setup lang="ts">
/**
 * 交给 AI 的「先问你想知道什么」视图（U06 / U07 / 体验评估 #2 #9）。
 *
 * 首屏先给四个入口：看看最近睡眠 / 回顾这周变化 / 分析一次运动 / 自由提问；选了就带上推荐的
 * 方向和数据范围，右边步骤栏跳到下一步。下面是一份和关系网同一份草稿的紧凑清单：每类写清
 * 「选了没有」和「这段时间实际几天有数据」——缺失和未选不混。最上面一句大白话说清会交出去什么。
 * 喜欢关系网的人切到「图谱」，选择会记住。
 */
import { computed } from 'vue';
import Icon, { type IconName } from '../Icon.vue';
import SegmentTrack from '../SegmentTrack.vue';
import type { AiTask, AiTaskCategory, AiTaskPreview, AiTaskTemplate } from '../../lib/bridge/types';
import {
  AI_TASK_CATEGORY_META,
  AI_TASK_CATEGORY_ORDER,
  CATEGORY_DAY_CHOICES,
  categoryLabel,
  categoryRangeOf,
} from '../../lib/aiTask/categories';
import { categoryCoverage } from '../../lib/aiTask/coverage';
import { coveredRange } from '../../lib/aiTask/handoffParts';
import { displayDateTimeFormatter, parseDisplayDate } from '../../lib/dateTime';
import { defineMessages, useMessages } from '../../i18n';

const props = defineProps<{
  draft: AiTask;
  preview: AiTaskPreview | null;
  templates: AiTaskTemplate[];
  workoutCount: number;
}>();
const emit = defineEmits<{
  template: [template: AiTaskTemplate];
  pickWorkout: [];
  ask: [];
  category: [category: AiTaskCategory, enabled: boolean];
  days: [category: AiTaskCategory, days: number];
  allDays: [days: number];
}>();

const t = useMessages(defineMessages(
  {
    title: '你想知道什么？',
    sleepTitle: '看看最近睡眠',
    sleepSub: '睡得够不够、稳不稳，和恢复的关系',
    weekTitle: '回顾这周变化',
    weekSub: '这周和平时比，哪里变了',
    workoutTitle: '分析一次运动',
    workoutSub: '先挑一次运动，再看配速、心率与恢复',
    freeTitle: '自由提问',
    freeSub: '自己写问题，数据范围照下面的清单',
    dataTitle: '会交出去的数据',
    plain: (range: string, categories: string) => `${range}的${categories}`,
    plainWorkouts: (count: number) => `，重点是你选的 ${count} 次运动`,
    plainNoGps: '；不含精确位置',
    plainGps: '；含精确位置',
    plainAttachments: (count: number) => `；另附 ${count} 个文件`,
    plainNothing: '还没选任何数据。',
    emptyRange: '这段时间没有可分析的记录。',
    widen: '换成最近 30 天',
    rangeUnknown: '最近一段时间',
    daysAria: (name: string) => `${name}的回溯天数`,
    haveDays: (have: number, total: number) => `${total} 天里 ${have} 天有数据`,
    noneInRange: '这段时间没有记录',
    notPicked: '不交',
    counting: '正在清点…',
    daysOption: (days: number) => `${days} 天`,
    separator: '、',
    end: '。',
  },
  {
    title: 'What do you want to know?',
    sleepTitle: 'Check my recent sleep',
    sleepSub: 'Enough and steady sleep, and how it ties to recovery',
    weekTitle: 'Review this week',
    weekSub: 'What changed compared with usual',
    workoutTitle: 'Analyse one workout',
    workoutSub: 'Pick a workout, then pace, heart rate and recovery',
    freeTitle: 'Ask anything',
    freeSub: 'Write your own question; data follows the list below',
    dataTitle: 'Data that will be handed over',
    plain: (range: string, categories: string) => `${categories} for ${range}`,
    plainWorkouts: (count: number) => `, focused on the ${count} workout(s) you picked`,
    plainNoGps: '; no precise location',
    plainGps: '; includes precise location',
    plainAttachments: (count: number) => `; plus ${count} attached file(s)`,
    plainNothing: 'No data selected yet.',
    emptyRange: 'No records to analyse in this period.',
    widen: 'Use the last 30 days',
    rangeUnknown: 'a recent period',
    daysAria: (name: string) => `Days of ${name} to include`,
    haveDays: (have: number, total: number) => `${have} of ${total} days have data`,
    noneInRange: 'No records in this period',
    notPicked: 'Not included',
    counting: 'Counting…',
    daysOption: (days: number) => `${days} d`,
    separator: ', ',
    end: '.',
  },
  {
    title: '¿Qué quieres saber?',
    sleepTitle: 'Ver mi sueño reciente',
    sleepSub: 'Si duermo lo suficiente y estable, y su relación con la recuperación',
    weekTitle: 'Repasar esta semana',
    weekSub: 'Qué cambió respecto a lo habitual',
    workoutTitle: 'Analizar un entrenamiento',
    workoutSub: 'Elige uno y mira ritmo, pulso y recuperación',
    freeTitle: 'Preguntar lo que quiera',
    freeSub: 'Escribe tu pregunta; los datos siguen la lista de abajo',
    dataTitle: 'Datos que se entregarán',
    plain: (range: string, categories: string) => `${categories} de ${range}`,
    plainWorkouts: (count: number) => `, centrado en los ${count} entrenamientos elegidos`,
    plainNoGps: '; sin ubicación precisa',
    plainGps: '; con ubicación precisa',
    plainAttachments: (count: number) => `; y ${count} archivo(s) adjunto(s)`,
    plainNothing: 'Aún no hay datos seleccionados.',
    emptyRange: 'No hay registros que analizar en este periodo.',
    widen: 'Usar los últimos 30 días',
    rangeUnknown: 'un periodo reciente',
    daysAria: (name: string) => `Días de ${name} que se incluyen`,
    haveDays: (have: number, total: number) => `${have} de ${total} días con datos`,
    noneInRange: 'Sin registros en este periodo',
    notPicked: 'No se incluye',
    counting: 'Contando…',
    daysOption: (days: number) => `${days} d`,
    separator: ', ',
    end: '.',
  },
  'components/ai/AiAskStart',
));

interface Entry { key: string; icon: IconName; title: string; sub: string; run: () => void }
const byId = (id: string) => props.templates.find((template) => template.id === id);
const entries = computed<Entry[]>(() => [
  { key: 'sleep', icon: 'moon', title: t.value.sleepTitle, sub: t.value.sleepSub, run: () => { const tpl = byId('sleep_review'); if (tpl) emit('template', tpl); else emit('ask'); } },
  { key: 'week', icon: 'clock', title: t.value.weekTitle, sub: t.value.weekSub, run: () => { const tpl = byId('week_review'); if (tpl) emit('template', tpl); else emit('ask'); } },
  { key: 'workout', icon: 'run', title: t.value.workoutTitle, sub: t.value.workoutSub, run: () => emit('pickWorkout') },
  { key: 'free', icon: 'edit', title: t.value.freeTitle, sub: t.value.freeSub, run: () => emit('ask') },
]);
const activeEntry = computed(() => ({ sleep_review: 'sleep', week_review: 'week' } as Record<string, string>)[props.draft.template_id ?? ''] ?? null);

const windowed = AI_TASK_CATEGORY_ORDER.filter((category) => AI_TASK_CATEGORY_META[category].hasWindow);
const rows = computed(() => windowed.map((category) => {
  const range = categoryRangeOf(props.draft.categories, category);
  const summary = categoryCoverage(props.preview, category);
  let status: string;
  let tone: 'ok' | 'missing' | 'off' | 'wait';
  if (!range.enabled) { status = t.value.notPicked; tone = 'off'; }
  else if (!summary) { status = t.value.counting; tone = 'wait'; }
  else if (!summary.daysWithData) { status = t.value.noneInRange; tone = 'missing'; }
  else { status = t.value.haveDays(summary.daysWithData, summary.daysInRange); tone = 'ok'; }
  return { category, label: categoryLabel(category), icon: AI_TASK_CATEGORY_META[category].icon, enabled: range.enabled, days: range.days_before, status, tone };
}));
const dayItems = computed(() => CATEGORY_DAY_CHOICES.map((days) => ({ value: days, label: t.value.daysOption(days) })));

/* 大白话：包含哪些日期、哪些记录、有没有位置、附件几个（体验评估 #9）。 */
const shortDate = (date: string) => displayDateTimeFormatter({ month: 'numeric', day: 'numeric' }).format(parseDisplayDate(date));
const plain = computed(() => {
  const picked = rows.value.filter((row) => row.enabled);
  if (!picked.length && !props.draft.attachments.length) return t.value.plainNothing;
  const { start, end } = coveredRange(props.preview);
  const range = start && end ? `${shortDate(start)}–${shortDate(end)} ` : `${t.value.rangeUnknown} `;
  let text = t.value.plain(range, picked.map((row) => row.label).join(t.value.separator));
  if (props.workoutCount) text += t.value.plainWorkouts(props.workoutCount);
  text += props.draft.include_precise_gps ? t.value.plainGps : t.value.plainNoGps;
  if (props.draft.attachments.length) text += t.value.plainAttachments(props.draft.attachments.length);
  return `${text}${t.value.end}`;
});
const nothingInRange = computed(() => {
  const picked = rows.value.filter((row) => row.enabled);
  return picked.length > 0 && picked.every((row) => row.tone === 'missing');
});
</script>

<template>
  <section class="ask-start" aria-labelledby="ai-ask-title">
    <h2 id="ai-ask-title" class="ask-title">{{ t.title }}</h2>
    <div class="ask-entries">
      <button v-for="entry in entries" :key="entry.key" type="button" :class="['ask-entry', { on: activeEntry === entry.key }]" @click="entry.run()">
        <Icon :name="entry.icon" :size="20" class="ask-icon" />
        <span><strong>{{ entry.title }}</strong><small>{{ entry.sub }}</small></span>
      </button>
    </div>

    <h3 class="ask-sub">{{ t.dataTitle }}</h3>
    <p class="ask-plain">{{ plain }}</p>
    <p v-if="nothingInRange" class="ask-empty" role="status">
      <Icon name="info" :size="14" />{{ t.emptyRange }}
      <button type="button" class="ai-tool" @click="emit('allDays', 30)">{{ t.widen }}</button>
    </p>
    <ul class="ask-list">
      <li v-for="row in rows" :key="row.category" :class="['ask-row', `is-${row.tone}`]">
        <label class="ask-check">
          <input type="checkbox" :checked="row.enabled" @change="emit('category', row.category, ($event.target as HTMLInputElement).checked)">
          <Icon :name="row.icon" :size="16" />
          <span>{{ row.label }}</span>
        </label>
        <SegmentTrack v-if="row.enabled" compact class="ask-days" :items="dayItems" :model-value="row.days"
          :aria-label="t.daysAria(row.label)" @update:model-value="(value) => emit('days', row.category, Number(value))" />
        <span class="ask-status">{{ row.status }}</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.ask-start { display: grid; gap: 14px; align-content: start; height: 100%; overflow-y: auto; padding: 84px 28px 28px; }
.ask-title { margin: 0; color: var(--ink); font-size: var(--fs-2xl); font-weight: 750; }
.ask-entries { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.ask-entry { display: flex; align-items: flex-start; gap: 12px; min-height: 72px; padding: 14px 16px; border: 0; border-radius: var(--radius-md); background: var(--mat-inset); box-shadow: var(--mat-inset-shadow); color: var(--ink); font: inherit; text-align: left; cursor: pointer; transition: background var(--dur-fast) ease, box-shadow var(--dur-fast) ease; }
.ask-entry:hover { background: color-mix(in srgb, var(--accent) 10%, var(--mat-inset)); }
.ask-entry.on { box-shadow: var(--mat-inset-shadow), 0 0 0 2px color-mix(in srgb, var(--accent) 70%, transparent); }
.ask-entry:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.ask-entry span { display: grid; gap: 3px; min-width: 0; }
.ask-entry strong { font-size: var(--fs-md); }
.ask-entry small { color: var(--subtle); font-size: var(--fs-xs); line-height: 1.45; }
.ask-icon { flex: none; margin-top: 2px; color: var(--accent); }
.ask-sub { margin: 8px 0 0; color: var(--muted); font-size: var(--fs-sm); font-weight: 700; }
.ask-plain { margin: 0; color: var(--ink); font-size: var(--fs-sm); line-height: 1.6; }
.ask-empty { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0; color: var(--warning); font-size: var(--fs-sm); }
.ask-list { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
.ask-row { display: grid; grid-template-columns: minmax(120px, 1fr) auto minmax(120px, 1fr); align-items: center; gap: 12px; min-height: 44px; padding: 6px 12px; border-radius: var(--radius-sm); background: color-mix(in srgb, var(--ink) 4%, transparent); }
.ask-check { display: inline-flex; align-items: center; gap: 8px; min-height: 32px; color: var(--ink); font-size: var(--fs-sm); cursor: pointer; }
.ask-check input { width: 17px; height: 17px; margin: 0; accent-color: var(--accent); }
.ask-days { justify-self: center; }
.ask-status { justify-self: end; color: var(--subtle); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; text-align: right; }
.ask-row.is-missing .ask-status { color: var(--warning); }
.ask-row.is-off { background: transparent; }
.ask-row.is-off .ask-check span { color: var(--subtle); }
@media (max-width: 1100px) {
  .ask-start { height: auto; overflow: visible; padding: 72px 16px 18px; }
}
@media (max-width: 560px) {
  .ask-entries { grid-template-columns: 1fr; }
  .ask-row { grid-template-columns: 1fr auto; }
  .ask-days { grid-column: 1 / -1; justify-self: start; }
  .ask-status { grid-row: 1; grid-column: 2; }
}
</style>
