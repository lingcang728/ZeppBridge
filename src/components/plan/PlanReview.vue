<script setup lang="ts">
/**
 * 贴回 AI 的计划之后的审阅卡：左边一天一行（改动一眼可见），右边是选中那天的区间图和步骤，
 * 底栏说清这次会改什么，唯一的主按钮「发到手表」。
 *
 * 默认要人确认，不自动发；有挡住发送的错误（`error`）时按钮不亮，并说还有几处要先改好。
 * `unverified` 只是提醒，可以发。
 */
import { computed, ref, watch } from 'vue';
import PlanWeekList from './PlanWeekList.vue';
import PlanDetail from './PlanDetail.vue';
import { changeCounts, dayRows, issueDate } from '../../lib/trainingPlan/week';
import { planIssueText } from '../../lib/trainingPlan/issues';
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
const { t } = usePlanText();

const rows = computed(() => dayRows(props.preview, localDateString(new Date())));
const counts = computed(() => changeCounts(rows.value));

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
      <h2>{{ title }}</h2>
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

    <div class="body">
      <PlanWeekList :rows="rows" :selected="selected" @select="selected = $event" />
      <PlanDetail :row="current" :issues="forDay" />
    </div>

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
.review { overflow: hidden; border-radius: var(--radius-xl); }
.head { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; padding: 20px 24px 14px; }
.head h2 { margin: 0; font-size: var(--fs-3xl); }
.sums { display: flex; gap: 6px; }
.head .discard { margin-left: auto; }
.badge { display: inline-flex; padding: 2px 10px; border-radius: 999px; font-size: var(--fs-2xs); font-weight: 700; white-space: nowrap; }
.b-new { background: var(--accent-soft); color: var(--accent); }
.b-rep { background: var(--pace-wash); color: var(--pace); }
.b-del { background: var(--heart-wash); color: var(--heart); }
.loose { display: grid; gap: 6px; margin: 0 24px 12px; padding: 0; list-style: none; }
.issue { display: flex; align-items: flex-start; gap: 10px; padding: 9px 12px; border-radius: 14px; background: var(--mat-inset); box-shadow: var(--mat-inset-shadow); font-size: var(--fs-xs); line-height: 1.5; }
.issue .tag { flex: none; padding: 1px 9px; border-radius: 999px; box-shadow: inset 0 0 0 1px currentColor; font-size: 11.5px; font-weight: 700; }
.issue.error .tag { color: var(--danger); }
.issue.unverified .tag { color: var(--warning); }
.issue .msg { min-width: 0; color: var(--muted); overflow-wrap: anywhere; }
.issue .msg b { color: var(--ink); font-weight: 600; }
.body { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); border-top: 1px solid var(--line); }
.foot { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; padding: 14px 24px; border-top: 1px solid var(--line); background: color-mix(in srgb, var(--surface) 55%, transparent); }
.txt { flex: 1 1 320px; display: grid; gap: 2px; margin: 0; color: var(--ink); font-size: var(--fs-xs); }
.txt b { display: inline-flex; align-items: center; gap: 6px; color: var(--warning); }
.txt span { color: var(--subtle); font-size: var(--fs-2xs); }
.go { min-height: 42px; margin-left: auto; padding-inline: 22px; border-radius: 999px; font-size: var(--fs-md); }
@media (max-width: 1180px) {
  .body { grid-template-columns: minmax(0, 1fr); }
}
</style>
