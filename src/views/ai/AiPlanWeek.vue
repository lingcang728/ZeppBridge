<script setup lang="ts">
/**
 * 「你的下一步」周视图（/ai/plan）：一周一页的计划，点某一天进单天页（从那一格长出来），拖动交换两天，
 * 长按发到手表。标题行是状态胶囊（点开看每一周送没送到、撤销、清空）和「接回定稿」。
 * 已经发出去的计划也能直接拖、直接改：第一下改动时把它拿回来变成草稿，按钮变成「有 N 处改动 · 重新同步到手表」。
 * 已经过去的日子不在这里，改不到。
 * 还没有计划时，除了接回 AI 的定稿，也可以用存过的模板或一个 .zwo / .fit 文件起一份（放在今天，拖到别的日子）。
 */
import { computed, ref, watch } from 'vue';
import { offerInlineSoon } from '../../composables/useTour';
import { gatherCards } from '../../lib/motion/cards/gather';
import PageHeader from '../../components/PageHeader.vue';
import Icon from '../../components/Icon.vue';
import BridgeFuture from '../../components/ai/bridge/BridgeFuture.vue';
import ReceiveCapsule from '../../components/ai/bridge/ReceiveCapsule.vue';
import PlanStatusChip from '../../components/plan/PlanStatusChip.vue';
import PlanClearDialog from '../../components/plan/PlanClearDialog.vue';
import GlassPopover from '../../components/GlassPopover.vue';
import PlanLibraryItems from '../../components/plan/PlanLibraryItems.vue';
import PlanAddNotice from '../../components/plan/PlanAddNotice.vue';
import PlanEasySwap from '../../components/plan/PlanEasySwap.vue';
import { usePlanAdd } from '../../composables/usePlanAdd';
import { useLibraryText } from '../../components/plan/library.i18n';
import { addDays } from '../../lib/aiTask/bridgeScale';
import type { PlanTemplate } from '../../lib/trainingPlan/templates';
import { useAiHub } from '../../composables/ai/useAiHub';
import { useExchanges } from '../../composables/useExchanges';
import { useTrainingPlan } from '../../composables/useTrainingPlan';
import { useBridgeText } from '../../components/ai/bridge/bridge.i18n';
import { useHubText } from '../../components/ai/hub/hub.i18n';
import { usePlanText } from '../../components/plan/usePlanText';
import { foreignToUi, langOf } from '../../lib/trainingPlan/foreignText';
import { issueDate } from '../../lib/trainingPlan/week';
import { planIssueText } from '../../lib/trainingPlan/issues';
import '../../styles/ai-task.css';

defineOptions({ name: 'AiPlanWeek' });
const hub = useAiHub();
/* 第一次看到一周计划：就地说一句怎么改、怎么发（新手引导的就地一章）。没有计划时不说。 */
watch(() => !!hub.future.value, (has) => { if (has) offerInlineSoon('planFirst', 900, () => !!hub.future.value); }, { immediate: true });
const plan = useTrainingPlan();
const history = useExchanges();
const t = useBridgeText();
const h = useHubText();
const { t: pt } = usePlanText();
const l = useLibraryText();
/** 没有计划时用一条训练起一份新草稿：管今天起的 7 天，训练放在今天。 */
const library = usePlanAdd((workout) => plan.startDraft({
  format: 'zeppbridge-plan/3', from: hub.today.value, to: addDays(hub.today.value, 6),
  workouts: [{ ...workout, date: hub.today.value }],
}));
const startMenu = ref(false);
const startButton = ref<HTMLElement | null>(null);
const startPop = ref<InstanceType<typeof GlassPopover> | null>(null);
const startWith = async (template: PlanTemplate) => { await startPop.value?.close(); await library.place(template.workout); };
const startFromFile = async () => { await startPop.value?.close(); library.openFile(); };
const root = ref<HTMLElement | null>(null);
const chip = ref<InstanceType<typeof PlanStatusChip> | null>(null);
/** 挂不到某一天的问题（整份计划的、日期写坏的）列在这里；挂得到的在那一天的单天页里。 */
const looseIssues = computed(() => (hub.future.value?.check.issues ?? []).filter((issue) => !issueDate(issue, hub.written.value)));
/** 纸片落在七天的格子上；还没有计划时落在空态那一块。 */
const landing = () => root.value?.querySelector<HTMLElement>('.future-days') ?? root.value?.querySelector<HTMLElement>('.ai-empty') ?? null;
const received = () => {
  void history.load();
  chip.value?.flash();
};
/**
 * 送达动画（批次 4.4）：长按发出去的那一刻，这一页有训练的格子收成一叠；结果回来以后，送到了就整叠飞进
 * 状态胶囊里的手表图标、胶囊从「发送中」平滑变成结果；被拒（一周都没送到）就按原路发回各自的位置，
 * 通知里写明原因。
 */
const sending = ref(false);
const deliver = async () => {
  if (sending.value || plan.busy.value) return;
  const cards = [...(root.value?.querySelectorAll<HTMLElement>('.future-day') ?? [])].filter((cell) => cell.querySelector('.day-art svg.shape'));
  const flight = gatherCards(cards);
  sending.value = true;
  try {
    await plan.publish();
  } finally {
    const state = plan.state.value?.last_publish?.state;
    const notice = plan.notice.value?.kind;
    const failed = notice === 'rejected' || notice === 'error' || notice === 'invalid' || state === 'rejected';
    if (failed) await flight.returnHome();
    else await flight.land(root.value?.querySelector<HTMLElement>('.plan-chip-watch') ?? null);
    // 牌落进手表以后，胶囊才从「发送中」变成结果。
    sending.value = false;
    chip.value?.flash();
  }
};
/** 从已发出的计划改过来的草稿：改了几天（发出去时只重推这几天所在的那几周）。 */
const changes = computed(() => (plan.editingSent.value
  ? (plan.preview.value?.days ?? []).filter((day) => ['added', 'replaced', 'removed'].includes(day.change)).length
  : 0));
</script>

<template>
  <section ref="root" class="page ai-sub-page ai-plan-week" aria-labelledby="ai-plan-title">
    <PageHeader title-id="ai-plan-title" :title="t.future">
      <div class="head-acts">
        <PlanStatusChip ref="chip" :state="plan.state.value" :drafting="!!plan.preview.value && plan.accepted.value" :busy="plan.busy.value" :sending="sending" :simulated="hub.demo.value"
          :discardable="!!plan.preview.value && plan.accepted.value" @undo="plan.undo()" @clear="plan.clear()" @discard="plan.discard()" />
        <ReceiveCapsule v-if="hub.future.value" variant="pill" :target="landing" @received="received" />
      </div>
    </PageHeader>
    <div v-if="plan.preview.value && !plan.accepted.value" class="ai-message"><Icon name="spark" :size="16" /><span>{{ t.mcp }}</span><button class="pill-button" @click="plan.accept()">{{ t.accept }}</button><button class="pill-button quiet" @click="plan.discard()">{{ t.discard }}</button></div>
    <PlanAddNotice :outcome="library.outcome.value" :need="library.need.value" @supply="library.supply" @cancel="library.cancelNeed" @dismiss="library.dismiss" />
    <div v-if="hub.notice.value" class="ai-message" role="status"><Icon name="info" :size="14" /><span>{{ hub.notice.value }}</span><button class="pill-button quiet" @click="plan.dismissNotice()">{{ pt.dismiss }}</button></div>

    <PlanEasySwap class="week-easy" />
    <div v-if="hub.future.value" class="ai-panel week-panel">
      <p v-if="hub.future.value.check.summary" class="plan-summary" :lang="langOf(hub.future.value.check.summary)">{{ hub.future.value.check.summary }}<small v-if="foreignToUi(hub.future.value.check.summary)" class="ai-original" :title="pt.aiOriginalHint" lang="">{{ pt.aiOriginal }}</small></p>
      <BridgeFuture :preview="hub.future.value" :readonly="!hub.editable.value" :stamped="hub.stamped.value" :today="hub.today.value"
        :swap="hub.changeDay" :insert="hub.insertAt" :changes="changes"
        @move="hub.changeDay" @delete="hub.removeDay" @publish="deliver" />
      <ul v-if="looseIssues.length" class="whole-issues"><li v-for="(issue, i) in looseIssues" :key="i"><Icon name="warning" :size="14" />{{ planIssueText(issue) }}</li></ul>
    </div>
    <div v-else class="ai-panel ai-empty">
      <p>{{ h.planEmpty }}</p>
      <ReceiveCapsule variant="primary" :target="landing" @received="received" />
      <button ref="startButton" type="button" class="pill-button quiet start-from" :aria-expanded="startMenu" @click="startMenu = true"><Icon name="file" :size="14" />{{ l.startFrom }}</button>
    </div>
    <GlassPopover v-if="startMenu" ref="startPop" :anchor="startButton" :width="260" @close="startMenu = false">
      <PlanLibraryItems :templates="library.templates.value" @place="startWith" @remove="library.remove" @import="startFromFile" />
    </GlassPopover>
    <PlanClearDialog />
  </section>
</template>

<style scoped src="./aiPage.css"></style>
<style scoped>
.head-acts { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.week-panel { gap: 14px; }
.week-easy { margin: 12px 0; }
.start-from { display: inline-flex; align-items: center; gap: 6px; }
.plan-summary { margin: 0; color: var(--muted); font-size: var(--fs-sm); line-height: 1.6; }
.ai-original { display: inline-block; margin-left: 8px; padding: 1px 8px; border-radius: 999px; background: color-mix(in srgb, var(--ink) 8%, transparent);
  color: var(--subtle); font-size: var(--fs-2xs); font-weight: 600; white-space: nowrap; vertical-align: 1px; cursor: help; }
.whole-issues { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; color: var(--warning); font-size: var(--fs-xs); }
.whole-issues li { display: flex; align-items: center; gap: 8px; }
</style>
