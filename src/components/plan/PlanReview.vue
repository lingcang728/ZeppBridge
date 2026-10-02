<script setup lang="ts">
/**
 * 贴回 AI 的计划之后的审阅卡：
 *   顶上：标题 + 一周小结（几次训练、总时长、几次高强度）+ 改动计数；
 *   中间：一周一排的日历格（PlanWeekStrip），点哪天下面就换成那天；
 *   下面：选中那天的强度走势和步骤（PlanDetail）；
 *   底栏：说清这次会改什么，唯一的主按钮「发到手表」。
 *
 * 默认要人确认，不自动发；有挡住发送的错误（`error`）时按钮不亮，并说还有几处要先改好。
 * `unverified` 只是提醒，可以发。
 */
import { computed, ref, watch } from 'vue';
import PlanWeekStrip from './PlanWeekStrip.vue';
import PlanDetail from './PlanDetail.vue';
import { changeCounts, dayRows, issueDate } from '../../lib/trainingPlan/week';
import { planIssueText } from '../../lib/trainingPlan/issues';
import { weekStats } from '../../lib/trainingPlan/summary';
import { displayDateTimeFormatter, parseDisplayDate } from '../../lib/dateTime';
import { localDateString } from '../../lib/format';
import type { PlanDraftPreview } from '../../types/trainingPlan';
import Icon from '../Icon.vue';
import { usePlanText } from './usePlanText';

const props = defineProps<{
  preview: PlanDraftPreview;
  /** 草稿原文里每条训练写的日期：问题带的是原文里第几条。 */
  written: { date: string }[];
  busy: boolean;
}>();
const emit = defineEmits<{ send: []; discard: [] }>();
const { t, minutes } = usePlanText();

const rows = computed(() => dayRows(props.preview, localDateString(new Date())));
const counts = computed(() => changeCounts(rows.value));
const stats = computed(() => weekStats(rows.value));
const statLine = computed(() => {
  const value = stats.value;
  const total = minutes(Math.round(value.seconds / 60));
  return [
    t.value.weekSessions(value.sessions),
    value.sessions ? t.value.weekTotal(value.approx ? t.value.totalAbout(total) : total) : '',
    value.hard ? t.value.weekHard(value.hard) : '',
    value.restDays ? t.value.weekRest(value.restDays) : '',
  ].filter(Boolean);
});

/* 打开时先看最该看的一天：有改动的第一天，其次有训练的第一天。 */
const selected = ref<string | null>(null);
const pickDefault = () => {
  const list = rows.value;
  const changed = list.find((row) => row.inWindow && ['added', 'replaced', 'removed'].includes(row.change));
  selected.value = (changed ?? list.find((row) => row.after.length) ?? list[0])?.date ?? null;
};
watch(() => props.preview, () => {
  if (!selected.value || !rows.value.some((row) => row.date === selected.value)) pickDefault();
}, { immediate: true });
const current = computed(() => rows.value.find((row) => row.date === selected.value) ?? null);

/* 校验问题：挂得到某一天的放进那天的详情；挂不到的（整份计划的、日期写坏的）单独列在上面。 */
const issues = computed(() => props.preview.check.issues);
const dated = computed(() => issues.value.map((issue) => ({ issue, date: issueDate(issue, props.written) })));
const forDay = computed(() => dated.value.filter((item) => item.date && item.date === selected.value).map((item) => item.issue));
const loose = computed(() => dated.value.filter((item) => !item.date || !rows.value.some((row) => row.date === item.date)));
const blocking = computed(() => issues.value.filter((issue) => issue.severity === 'error'));

const shortDay = (date: string) => displayDateTimeFormatter({ month: 'numeric', day: 'numeric' }).format(parseDisplayDate(date));
const title = computed(() => {
  const dates = props.preview.check.workouts.map((workout) => workout.date).sort();
  const from = props.preview.check.from ?? dates[0];
  const to = props.preview.check.to ?? dates[dates.length - 1];
  if (!from) return t.value.reviewTitleOne(shortDay(props.preview.window.start));
  return !to || to === from ? t.value.reviewTitleOne(shortDay(from)) : t.value.reviewTitle(shortDay(from), shortDay(to));
});
</script>

<template>
  <section class="review surface-card" :aria-label="title">
    <header class="head">
      <div class="title">
        <h2>{{ title }}</h2>
        <p class="stats"><span v-for="item in statLine" :key="item">{{ item }}</span></p>
      </div>
      <span class="sums">
        <span v-if="counts.added" class="badge b-new">{{ t.added(counts.added) }}</span>
        <span v-if="counts.replaced" class="badge b-rep">{{ t.replaced(counts.replaced) }}</span>
        <span v-if="counts.removed" class="badge b-del">{{ t.removed(counts.removed) }}</span>
      </span>
      <button type="button" class="pill-button quiet discard" :disabled="busy" @click="emit('discard')">{{ t.discard }}</button>
    </header>

    <ul v-if="loose.length" class="loose" role="alert">
      <li v-for="(item, index) in loose" :key="index" :class="['issue', item.issue.severity]">
        <span class="tag">{{ item.issue.severity === 'error' ? t.issueError : t.issueUnverified }}</span>
        <span class="msg"><b>{{ t.issueWhole }} · </b>{{ planIssueText(item.issue) }}</span>
      </li>
    </ul>

    <PlanWeekStrip class="strip" :rows="rows" :selected="selected" @select="selected = $event" />
    <PlanDetail class="detail" :row="current" :issues="forDay" />

    <footer class="foot">
      <p class="txt">
        <b v-if="blocking.length"><Icon name="warning" :size="14" />{{ t.footBlocked(blocking.length) }}</b>
        <template v-else>{{ t.footSummary(counts.added, counts.replaced, counts.removed) }}</template>
        <span>{{ t.footNote }}</span>
      </p>
      <button type="button" class="button primary go" :disabled="busy || blocking.length > 0" @click="emit('send')">
        <Icon name="send" :size="16" />{{ busy ? t.sending : t.send }}
      </button>
    </footer>
  </section>
</template>

<style scoped>
.review { display: grid; gap: 22px; overflow: hidden; padding: 24px 26px 0; border-radius: var(--radius-xl); }
.head { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 10px 14px; }
.title { display: grid; flex: 1 1 320px; gap: 6px; min-width: 0; }
.head h2 { margin: 0; font-size: var(--fs-2xl); line-height: 1.25; }
.stats { display: flex; flex-wrap: wrap; gap: 2px 0; margin: 0; color: var(--muted); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
.stats span + span::before { content: '·'; margin: 0 8px; color: var(--subtle); }
.sums { display: flex; gap: 6px; padding-top: 4px; }
.discard { margin-top: -2px; }
.badge { display: inline-flex; padding: 2px 10px; border-radius: 999px; font-size: var(--fs-2xs); font-weight: 700; white-space: nowrap; }
.b-new { background: var(--accent-soft); color: var(--accent); }
.b-rep { background: var(--pace-wash); color: var(--pace); }
.b-del { background: var(--heart-wash); color: var(--heart); }
.loose { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
.issue { display: flex; align-items: flex-start; gap: 10px; padding: 9px 12px; border-radius: 14px; background: var(--mat-inset); box-shadow: var(--mat-inset-shadow); font-size: var(--fs-xs); line-height: 1.5; }
.issue .tag { flex: none; padding: 1px 9px; border-radius: 999px; box-shadow: inset 0 0 0 1px currentColor; font-size: 11.5px; font-weight: 700; }
.issue.error .tag { color: var(--danger); }
.issue.unverified .tag { color: var(--warning); }
.issue .msg { min-width: 0; color: var(--muted); overflow-wrap: anywhere; }
.issue .msg b { color: var(--ink); font-weight: 600; }
.strip { margin: 0 -4px; }
.detail { padding: 22px 2px 4px; border-top: 1px solid var(--line); }
.foot { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; margin: 0 -26px; padding: 14px 26px; border-top: 1px solid var(--line); background: color-mix(in srgb, var(--surface) 55%, transparent); }
.txt { flex: 1 1 320px; display: grid; gap: 2px; margin: 0; color: var(--ink); font-size: var(--fs-xs); }
.txt b { display: inline-flex; align-items: center; gap: 6px; color: var(--warning); }
.txt span { color: var(--subtle); font-size: var(--fs-2xs); }
.go { min-height: 42px; margin-left: auto; padding-inline: 22px; border-radius: 999px; font-size: var(--fs-md); }
</style>
