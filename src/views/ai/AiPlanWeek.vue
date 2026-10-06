<script setup lang="ts">
/**
 * 「你的下一步」周视图（/ai/plan）：一周一页的计划，点某一天进单天页（从那一格长出来），拖动交换两天，
 * 长按发到手表。底下是「上次发到手表的」状态和每一周有没有送达。
 * 已经发出去的计划也能直接拖、直接改：第一下改动时把它拿回来变成草稿，按钮变成「有 N 处改动 · 重新同步到手表」；
 * 「撤销上一次」回到上一版。已经过去的日子不在这里，改不到。
 */
import { computed, ref } from 'vue';
import { gatherCards } from '../../lib/motion/cards/gather';
import PageHeader from '../../components/PageHeader.vue';
import Icon from '../../components/Icon.vue';
import BridgeFuture from '../../components/ai/bridge/BridgeFuture.vue';
import ReceiveCapsule from '../../components/ai/bridge/ReceiveCapsule.vue';
import PlanLedger from '../../components/plan/PlanLedger.vue';
import PlanClearDialog from '../../components/plan/PlanClearDialog.vue';
import PlanWeeks from '../../components/plan/PlanWeeks.vue';
import { useAiHub } from '../../composables/ai/useAiHub';
import { useExchanges } from '../../composables/useExchanges';
import { useTrainingPlan } from '../../composables/useTrainingPlan';
import { useBridgeText } from '../../components/ai/bridge/bridge.i18n';
import { useHubText } from '../../components/ai/hub/hub.i18n';
import { usePlanText } from '../../components/plan/usePlanText';
import { issueDate } from '../../lib/trainingPlan/week';
import { planIssueText } from '../../lib/trainingPlan/issues';
import '../../styles/ai-task.css';

defineOptions({ name: 'AiPlanWeek' });
const hub = useAiHub();
const plan = useTrainingPlan();
const history = useExchanges();
const t = useBridgeText();
const h = useHubText();
const { t: pt } = usePlanText();
/** 挂不到某一天的问题（整份计划的、日期写坏的）列在这里；挂得到的在那一天的单天页里。 */
const looseIssues = computed(() => (hub.future.value?.check.issues ?? []).filter((issue) => !issueDate(issue, hub.written.value)));
const received = () => { void history.load(); };
/**
 * 送达动画（批次 4.4）：长按发出去的那一刻，这一页有训练的格子收成一叠；结果回来以后，送到了就整叠飞进
 * 状态栏的手表图标、状态那一格从「发送中」平滑变成结果；被拒（一周都没送到）就按原路发回各自的位置，
 * 通知里写明原因。
 */
const sending = ref(false);
const deliver = async () => {
  if (sending.value || plan.busy.value) return;
  const cards = [...document.querySelectorAll<HTMLElement>('.week-panel .future-day')].filter((cell) => cell.querySelector('.workout-shape svg'));
  const flight = gatherCards(cards);
  sending.value = true;
  try {
    await plan.publish();
  } finally {
    const state = plan.state.value?.last_publish?.state;
    const notice = plan.notice.value?.kind;
    const failed = notice === 'rejected' || notice === 'error' || notice === 'invalid' || state === 'rejected';
    if (failed) await flight.returnHome();
    else await flight.land(document.querySelector<HTMLElement>('.week-foot .ledger-watch'));
    // 牌落进手表以后，状态那一格才从「发送中」变成结果。
    sending.value = false;
  }
};
/** 从已发出的计划改过来的草稿：改了几天（发出去时只重推这几天所在的那几周）。 */
const changes = computed(() => (plan.editingSent.value
  ? (plan.preview.value?.days ?? []).filter((day) => ['added', 'replaced', 'removed'].includes(day.change)).length
  : 0));
</script>

<template>
  <section class="page ai-sub-page" aria-labelledby="ai-plan-title">
    <PageHeader title-id="ai-plan-title" :title="t.future" :intro="h.planIntro">
      <ReceiveCapsule v-if="hub.future.value" compact @received="received" />
    </PageHeader>
    <div v-if="plan.preview.value && !plan.accepted.value" class="ai-message"><Icon name="spark" :size="16" /><span>{{ t.mcp }}</span><button class="pill-button" @click="plan.accept()">{{ t.accept }}</button><button class="pill-button quiet" @click="plan.discard()">{{ t.discard }}</button></div>
    <div v-if="hub.notice.value" class="ai-message" role="status"><Icon name="info" :size="14" /><span>{{ hub.notice.value }}</span><button class="pill-button quiet" @click="plan.dismissNotice()">{{ pt.dismiss }}</button></div>

    <div v-if="hub.future.value" class="ai-panel week-panel">
      <p v-if="hub.future.value.check.summary" class="plan-summary">{{ hub.future.value.check.summary }}</p>
      <BridgeFuture :preview="hub.future.value" :readonly="!hub.editable.value" :stamped="hub.stamped.value" :show-summary="false"
        :swap="hub.changeDay" :insert="hub.insertAt" :changes="changes"
        @move="hub.changeDay" @delete="hub.removeDay" @publish="deliver" />
      <ul v-if="looseIssues.length" class="whole-issues"><li v-for="(issue, i) in looseIssues" :key="i"><Icon name="warning" :size="14" />{{ planIssueText(issue) }}</li></ul>
      <footer class="week-foot">
        <PlanLedger v-if="plan.state.value?.last_publish || sending" :state="plan.state.value" :busy="plan.busy.value" :sending="sending" :simulated="hub.demo.value" @undo="plan.undo()" @clear="plan.clear()" />
        <button v-if="plan.preview.value && plan.accepted.value" class="pill-button quiet discard" :disabled="plan.busy.value" @click="plan.discard()">{{ t.discard }}</button>
      </footer>
    </div>
    <div v-else class="ai-panel ai-empty">
      <p>{{ h.planEmpty }}</p>
      <ReceiveCapsule @received="received" />
    </div>
    <PlanWeeks v-if="plan.state.value?.weeks?.length" class="weeks" :weeks="plan.state.value.weeks" />
    <PlanClearDialog />
  </section>
</template>

<style scoped src="./aiPage.css"></style>
<style scoped>
.week-panel { gap: 10px; }
.plan-summary { margin: 0; color: var(--muted); font-size: var(--fs-xs); line-height: 1.6; }
.whole-issues { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; color: var(--warning); font-size: var(--fs-xs); }
.whole-issues li { display: flex; align-items: center; gap: 8px; }
.week-foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; padding-top: 6px; border-top: 1px solid var(--line); }
.discard { margin-left: auto; }
.weeks { margin-top: 16px; }
</style>
