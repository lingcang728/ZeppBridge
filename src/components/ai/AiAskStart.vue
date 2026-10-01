<script setup lang="ts">
/**
 * 交给 AI 的「你想知道什么」：一排四个入口，浮在关系网上方（U06 / U07 / 体验评估 #2 #9）。
 *
 * 看看最近睡眠 / 回顾这周变化 / 分析一次运动 / 自由提问——选了就带上推荐的方向和数据范围，右边
 * 步骤栏跳到下一步。下面一句大白话说清会交出去什么（日期、哪几类、有没有位置、附件几个）。
 *
 * 以前这里是和「图谱」二选一的一整页（四张大卡 + 一张逐类清单），用户希望两者融在一起
 * （2026-09-30）：清单和关系网本来就是同一份草稿，逐类的开关、天数、覆盖天数现在都在关系网的节点上。
 */
import { computed, nextTick, ref, watch } from 'vue';
import Icon, { type IconName } from '../Icon.vue';
import type { AiTask, AiTaskPreview, AiTaskTemplate } from '../../lib/bridge/types';
import {
  AI_TASK_CATEGORY_META,
  AI_TASK_CATEGORY_ORDER,
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
    freeSub: '自己写问题，数据范围照图上选的',
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
    haveDays: (have: number, total: number) => `${total} 天里 ${have} 天有数据`,
    noneInRange: '这段时间没有记录',
    notPicked: '不交',
    counting: '正在清点…',
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
    freeSub: 'Write your own question; data follows what the graph includes',
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
    haveDays: (have: number, total: number) => `${have} of ${total} days have data`,
    noneInRange: 'No records in this period',
    notPicked: 'Not included',
    counting: 'Counting…',
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
    freeSub: 'Escribe tu pregunta; los datos siguen lo que incluye el grafo',
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
    haveDays: (have: number, total: number) => `${have} de ${total} días con datos`,
    noneInRange: 'Sin registros en este periodo',
    notPicked: 'No se incluye',
    counting: 'Contando…',
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
/* 亮哪一个：刚点的那个。以前只看草稿套的模板——点了「分析一次运动」（它不换模板，只打开挑运动那一步），
   框却还停在上一次的「回顾这周变化」上。模板被别处换掉（方向面板、打开旧任务）时回到按模板判断。 */
const picked = ref<string | null>(null);
watch(() => props.draft.template_id, () => { picked.value = null; });
const templateEntry = computed(() => ({ sleep_review: 'sleep', week_review: 'week' } as Record<string, string>)[props.draft.template_id ?? ''] ?? null);
const activeEntry = computed(() => picked.value ?? templateEntry.value);
const choose = (entry: Entry) => {
  entry.run();
  // 套模板会先清掉 picked（上面的 watch），这里等它换完再记。
  void nextTick(() => { picked.value = entry.key; });
};

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
  return { category, label: categoryLabel(category), icon: AI_TASK_CATEGORY_META[category].icon, enabled: range.enabled, status, tone };
}));

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
  <section class="ask-strip glass-control" aria-labelledby="ai-ask-title">
    <div class="ask-line">
      <h2 id="ai-ask-title" class="ask-title">{{ t.title }}</h2>
      <div class="ask-entries">
        <button v-for="entry in entries" :key="entry.key" type="button" :class="['ask-chip', { on: activeEntry === entry.key }]"
          :title="entry.sub" :aria-pressed="activeEntry === entry.key" @click="choose(entry)">
          <Icon :name="entry.icon" :size="15" class="ask-icon" /><span>{{ entry.title }}</span>
        </button>
      </div>
    </div>
    <p class="ask-plain"><b>{{ t.dataTitle }}</b>{{ plain }}</p>
    <p v-if="nothingInRange" class="ask-empty" role="status">
      <Icon name="info" :size="14" />{{ t.emptyRange }}
      <button type="button" class="ai-tool" @click="emit('allDays', 30)">{{ t.widen }}</button>
    </p>
  </section>
</template>

<style scoped>
/* 一条浮在关系网上方的玻璃条：左边一句问题，右边四个入口胶囊；下面一行灰字说清会交出去什么。 */
.ask-strip { display: grid; gap: 6px; width: fit-content; max-width: 100%; padding: 8px 10px 8px 16px; border-radius: var(--radius-lg); }
.ask-line { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; min-width: 0; }
.ask-title { margin: 0; color: var(--ink); font-size: var(--fs-md); font-weight: 750; white-space: nowrap; }
.ask-entries { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; }
.ask-chip { display: inline-flex; align-items: center; gap: 7px; min-height: 34px; padding: 0 14px 0 11px; border: 0; border-radius: 999px;
  background: color-mix(in srgb, var(--ink) 6%, transparent); color: var(--muted); font: inherit; font-size: var(--fs-sm); font-weight: 600; cursor: pointer;
  transition: background-color var(--dur-fast) ease, color var(--dur-fast) ease, box-shadow var(--dur-fast) ease; }
.ask-chip:hover { background: color-mix(in srgb, var(--ink) 10%, transparent); color: var(--ink); }
.ask-chip:active { scale: .97; }
.ask-chip:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.ask-chip.on { background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--ink); }
.ask-icon { flex: none; color: var(--accent); }
.ask-plain { margin: 0 0 2px; color: var(--muted); font-size: var(--fs-xs); line-height: 1.5; }
.ask-plain b { margin-right: 6px; color: var(--subtle); font-weight: 650; }
.ask-empty { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0; color: var(--warning); font-size: var(--fs-xs); }
</style>
