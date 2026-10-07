<script setup lang="ts">
/**
 * 交给 AI 的总页：只留概括（2026-10 精修批次 3）。
 *
 * 单列叙事（第四轮 1D·D2，用户 10-07 在三版样稿里选了 B）：一条从上往下读的线，内容收窄到 860。
 *
 *   任务名胶囊（→ 已保存的任务）
 *   「你的过去」缩略卡（→ /ai/past）
 *   这次想问什么：模板胶囊 + 唯一的输入框
 *   「你的下一步」缩略卡（→ /ai/plan） + 上次发到手表的状态栏
 *   往返记录（每一行 → /ai/exchanges/:id）
 *   底栏（就绪度 → /ai/check，交给某个 AI）——挂在外壳上（components/ai/AiDockHost.vue），不跟着总页卸载
 *
 * 所有下钻都是路由，点开从被点的那张卡 / 那一行长出来，返回缩回去（usePageMorph）。以前插在页面中间的
 * 单天详情、整页切到「正在查看历史 · 只读」的模式、底栏里可以改的最终提示词、任务下拉列表都去掉了。
 * 数据都在全局单例里（composables/ai/useAiHub.ts），切子页面不重读、不丢草稿。
 */
import { onBeforeUnmount, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import '../styles/ai-task.css';
import Icon from '../components/Icon.vue';
import AiTaskHeader from '../components/ai/AiTaskHeader.vue';
import PastSummary from '../components/ai/hub/PastSummary.vue';
import NextSummary from '../components/ai/hub/NextSummary.vue';
import ComposeLine from '../components/ai/ComposeLine.vue';
import GraphUndoPill from '../components/ai/GraphUndoPill.vue';
import ExchangeList from '../components/ai/ExchangeList.vue';
import PlanLedger from '../components/plan/PlanLedger.vue';
import PlanClearDialog from '../components/plan/PlanClearDialog.vue';
import { useAiHub } from '../composables/ai/useAiHub';
import { useAiTaskDraft } from '../composables/useAiTaskDraft';
import { useAiTaskLibrary } from '../composables/useAiTaskLibrary';
import { useBridgeStrip } from '../composables/useBridgeStrip';
import { useExchanges } from '../composables/useExchanges';
import { useTrainingPlan } from '../composables/useTrainingPlan';
import { useBridgeText } from '../components/ai/bridge/bridge.i18n';
import { usePlanText } from '../components/plan/usePlanText';

defineOptions({ name: 'AiComposer' });
const route = useRoute();
const ctl = useAiTaskDraft();
const { templates } = useAiTaskLibrary();
const plan = useTrainingPlan();
const history = useExchanges();
const strips = useBridgeStrip();
const hub = useAiHub();
const t = useBridgeText();
const { t: pt } = usePlanText();
const { draft } = ctl;
const sentAnimation = ref(false);

/** 从别处带着 ?task= 打开：接着那个任务。 */
watch(() => route.query.task, (id) => {
  if (typeof id === 'string' && id && id !== draft.value.id) void ctl.loadTask(id).catch(() => undefined);
}, { immediate: true });

/* 刚交出去一份（底栏在外壳上发出信号）：「你的过去」那张卡的细条折一下。 */
let animationTimer = 0;
watch(hub.handedOff, () => {
  sentAnimation.value = false;
  requestAnimationFrame(() => { sentAnimation.value = true; });
  window.clearTimeout(animationTimer);
  animationTimer = window.setTimeout(() => { sentAnimation.value = false; }, 1200);
});
onBeforeUnmount(() => window.clearTimeout(animationTimer));
const received = () => { void history.load(); };
const selectWorkout = () => { document.querySelector<HTMLElement>('.past-card')?.focus(); };
</script>

<template>
  <section class="page ai-bridge-page" aria-labelledby="ai-page-title">
    <header class="bridge-page-head">
      <AiTaskHeader :fallback-title="hub.title.value" />
      <div v-if="hub.demo.value" class="demo-banner" role="status"><Icon name="database" :size="14" /><div><strong>{{ t.fullDemo }}</strong><span>{{ t.demoHint }}</span></div></div>
      <Transition name="undo-fade"><GraphUndoPill v-if="ctl.canUndo.value" class="undo-selection" :can-undo="ctl.canUndo.value" :label="t.undo" @undo="ctl.undo()" /></Transition>
    </header>

    <PastSummary :rows="strips.rows.value" :categories="draft.categories" :days="hub.pastDays.value" :sent="sentAnimation" />
    <p v-if="strips.error.value" class="bridge-message" role="alert"><Icon name="warning" :size="14" />{{ strips.error.value }}<button class="pill-button quiet" @click="strips.load()">{{ t.retry }}</button></p>

    <ComposeLine :templates="templates" @workout="selectWorkout" />

    <div v-if="plan.preview.value && !plan.accepted.value" class="mcp-arrival"><Icon name="spark" :size="16" /><span>{{ t.mcp }}</span><button class="pill-button" @click="plan.accept()">{{ t.accept }}</button><button class="pill-button quiet" @click="plan.discard()">{{ t.discard }}</button></div>
    <div v-if="hub.notice.value" class="bridge-message" role="status"><Icon name="info" :size="14" /><span>{{ hub.notice.value }}</span><button class="pill-button quiet" @click="plan.dismissNotice()">{{ pt.dismiss }}</button></div>
    <NextSummary :rows="hub.rows.value" :drafting="!!plan.preview.value" :state="plan.state.value" @received="received" />
    <div v-if="plan.state.value?.last_publish" class="plan-status-row"><PlanLedger :state="plan.state.value" :busy="plan.busy.value" :simulated="hub.demo.value" @undo="plan.undo()" @clear="plan.clear()" /></div>

    <ExchangeList :items="history.exchanges.value" />
    <p v-if="history.error.value" class="bridge-message" role="alert">{{ history.error.value }}<button class="pill-button quiet" @click="history.load()">{{ t.retry }}</button></p>
    <PlanClearDialog />
  </section>
</template>

<style scoped src="./AiComposer.css"></style>
