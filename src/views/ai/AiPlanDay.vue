<script setup lang="ts">
/**
 * 单天页（/ai/plan/:date）：这一天的强度走势、每一步、给手表的说明（目的 · 子类型 + 要点），以及这一天的
 * 校验问题。走路这类发不到手表的训练在这里就地删掉或换成能发的大类。前一天 / 后一天直接换（替换当前历史，
 * 返回仍然回到周视图、缩回当初那一格）。
 * （批次 4 会在这里加强度图直接拖、行内滚轮、按时间 / 按距离、目标类型的玻璃分段。）
 */
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import PageHeader from '../../components/PageHeader.vue';
import Icon from '../../components/Icon.vue';
import PlanDetail from '../../components/plan/PlanDetail.vue';
import { useAiHub } from '../../composables/ai/useAiHub';
import { useTrainingPlan } from '../../composables/useTrainingPlan';
import { useBridgeText } from '../../components/ai/bridge/bridge.i18n';
import { useHubText } from '../../components/ai/hub/hub.i18n';
import { usePlanText } from '../../components/plan/usePlanText';
import { issueDate } from '../../lib/trainingPlan/week';
import { displayDateTimeFormatter, parseDisplayDate } from '../../lib/dateTime';
import '../../styles/ai-task.css';

defineOptions({ name: 'AiPlanDay' });
const route = useRoute();
const hub = useAiHub();
const plan = useTrainingPlan();
const t = useBridgeText();
const h = useHubText();
const { t: pt } = usePlanText();
const date = computed(() => String(route.params.date ?? ''));
const index = computed(() => hub.rows.value.findIndex((row) => row.date === date.value));
const row = computed(() => hub.rows.value[index.value] ?? null);
const prev = computed(() => hub.rows.value[index.value - 1]?.date ?? null);
const next = computed(() => hub.rows.value[index.value + 1]?.date ?? null);
const issues = computed(() => (hub.future.value?.check.issues ?? []).filter((issue) => issueDate(issue, hub.written.value) === date.value));
const title = computed(() => (/^\d{4}-\d{2}-\d{2}$/.test(date.value)
  ? displayDateTimeFormatter({ month: 'long', day: 'numeric', weekday: 'long' }).format(parseDisplayDate(date.value))
  : '—'));
</script>

<template>
  <section class="page ai-sub-page" aria-labelledby="ai-day-title">
    <PageHeader title-id="ai-day-title" :title="title" :intro="h.dayIntro">
      <nav class="day-nav" :aria-label="title" data-no-morph>
        <RouterLink v-if="prev" :to="`/ai/plan/${prev}`" replace class="pill-button quiet"><Icon name="arrow-left" :size="13" />{{ h.prevDay }}</RouterLink>
        <RouterLink v-if="next" :to="`/ai/plan/${next}`" replace class="pill-button quiet">{{ h.nextDay }}<Icon name="arrow-right" :size="13" /></RouterLink>
      </nav>
    </PageHeader>
    <div v-if="hub.notice.value" class="ai-message" role="status"><Icon name="info" :size="14" /><span>{{ hub.notice.value }}</span><button class="pill-button quiet" @click="plan.dismissNotice()">{{ pt.dismiss }}</button></div>
    <div class="ai-panel">
      <template v-if="row">
        <PlanDetail :row="row" :issues="issues" :show-date="false" :editable="hub.editable.value" @retype="hub.retype" @remove="hub.removeWorkout" />
        <footer v-if="hub.editable.value" class="day-foot">
          <button class="pill-button quiet" :disabled="plan.busy.value" @click="hub.removeDay(date)"><Icon name="trash" :size="13" />{{ t.deleteDay }}</button>
        </footer>
      </template>
      <p v-else class="ai-empty">{{ pt.noPlanDay }}</p>
    </div>
  </section>
</template>

<style scoped src="./aiPage.css"></style>
<style scoped>
.day-nav { display: flex; gap: 6px; }
.day-foot { display: flex; justify-content: flex-end; padding-top: 8px; border-top: 1px solid var(--line); }
</style>
