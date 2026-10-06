<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import '../styles/ai-task.css';
import Icon from '../components/Icon.vue';
import AiTaskHeader from '../components/ai/AiTaskHeader.vue';
import BridgeTimeline from '../components/ai/bridge/BridgeTimeline.vue';
import ReceiveCapsule from '../components/ai/bridge/ReceiveCapsule.vue';
import ComposeLine from '../components/ai/ComposeLine.vue';
import ExchangeList from '../components/ai/ExchangeList.vue';
import HandoffDock from '../components/ai/HandoffDock.vue';
import PlanDetail from '../components/plan/PlanDetail.vue';
import PlanLedger from '../components/plan/PlanLedger.vue';
import ModalDialog from '../components/ModalDialog.vue';
import { useAiTaskDraft } from '../composables/useAiTaskDraft';
import { useAiTaskLibrary } from '../composables/useAiTaskLibrary';
import { useAiTaskPreview } from '../composables/useAiTaskPreview';
import { useSyncController } from '../composables/useSyncController';
import { useTrainingPlan } from '../composables/useTrainingPlan';
import { useBridgeStrip } from '../composables/useBridgeStrip';
import { useExchanges } from '../composables/useExchanges';
import { useBridgeText } from '../components/ai/bridge/bridge.i18n';
import { usePlanText } from '../components/plan/usePlanText';
import { backend } from '../lib/bridge';
import { autoTaskTitle } from '../lib/aiTask/title';
import { directionText } from '../lib/aiTask/prompt';
import { displayableWorkouts } from '../lib/workouts';
import { addDays, dayKey, daysBetween } from '../lib/aiTask/bridgeScale';
import { dayRows, issueDate } from '../lib/trainingPlan/week';
import { moveDay, deleteDay, deleteWorkout, retypeWorkout } from '../lib/trainingPlan/reshape';
import { planIssueText } from '../lib/trainingPlan/issues';
import type { PlanCheck, PlanDraftPreview, PlanSport } from '../types/trainingPlan';
import type { AiExchange } from '../types/timeBridge';
defineOptions({ name: 'AiComposer' });
const route = useRoute(), ctl = useAiTaskDraft(), library = useAiTaskLibrary(), coverage = useAiTaskPreview();
const plan = useTrainingPlan(), history = useExchanges(), t = useBridgeText(), { t: pt } = usePlanText();
const { draft } = ctl, { templates, recentWorkouts } = library;
const selectedExchange = ref<AiExchange | null>(null), selectedDay = ref<string | null>(null), sentAnimation = ref(false), demo = ref(false);
const today = ref(dayKey());
const end = computed(() => selectedExchange.value ? dayKey(new Date(selectedExchange.value.sent_at)) : today.value);
const days = computed(() => selectedExchange.value ? selectedExchange.value.days_before + 1 : Math.min(90, Math.max(7, ...draft.value.categories.filter(c => c.category !== 'workout').map(c => c.days_before + 1))));
const strips = useBridgeStrip(days, end);
const historical = computed(() => !!selectedExchange.value);
const categories = computed(() => selectedExchange.value?.categories ?? draft.value.categories);
const selectedIds = computed(() => selectedExchange.value?.workout_ids ?? draft.value.workout_ids);
const choices = computed(() => displayableWorkouts(recentWorkouts.value));
const picked = computed(() => choices.value.filter(w => draft.value.workout_ids.includes(w.workout_id)));
const template = computed(() => templates.value.find(p => p.id === draft.value.template_id) ?? null);
const title = computed(() => autoTaskTitle(draft.value, picked.value, template.value?.name ?? null));
const direction = computed(() => directionText(template.value));
const ready = computed(() => !historical.value && !!coverage.preview.value && coverage.preview.value.coverage.some(c => c.days_with_data > 0));
const viewOf = (check: PlanCheck, start: string): PlanDraftPreview => {
  const last = check.to && check.to > addDays(start,6) ? check.to : addDays(start,6);
  const count = Math.min(57, Math.max(7, daysBetween(start,last) + 1));
  return { check, window: { start }, days: Array.from({length: count}, (_,i) => {
    const date = addDays(start,i), after = check.workouts.filter(w => w.date === date);
    return { date, change: after.length ? 'unchanged' : 'rest', before: [], after, rest: check.rest?.find(r => r.date === date) ?? null };
  }) };
};
const future = computed(() => {
  if (selectedExchange.value) return selectedExchange.value.plan ? viewOf(selectedExchange.value.plan, end.value) : null;
  if (plan.preview.value) return plan.preview.value;
  const active = plan.state.value?.planned.filter(w => w.date >= today.value) ?? [];
  const latest = history.exchanges.value.find(e => e.publish_state === 'sent' && !e.undone && e.plan?.to && e.plan.to >= today.value);
  if (!active.length && !latest) return null;
  const endings = [active[active.length - 1]?.date, latest?.plan?.to, today.value].filter((d): d is string => !!d).sort();
  const last = endings[endings.length - 1]!;
  return viewOf({ from: today.value, to: last, workouts: active, issues: [], summary: latest?.plan?.summary, rest: latest?.plan?.rest?.filter(r => r.date >= today.value) }, today.value);
});
const stamped = computed(() => selectedExchange.value ? selectedExchange.value.publish_state === 'sent' && !selectedExchange.value.undone : !plan.preview.value && plan.state.value?.last_publish?.state === 'sent');
const rows = computed(() => future.value ? dayRows(future.value,today.value) : []);
const detail = computed(() => rows.value.find(r => r.date === selectedDay.value) ?? null);
const written = computed(() => selectedExchange.value?.document?.workouts ?? plan.document.value?.workouts ?? []);
const issues = computed(() => future.value?.check.issues.filter(i => issueDate(i,written.value) === selectedDay.value) ?? []);
const wholeIssues = computed(() => future.value?.check.issues ?? []);
const notice = computed(() => {
  const n = plan.notice.value;
  if (!n) return null;
  switch (n.kind) {
    case 'sent': return demo.value ? t.value.demoDelivered : pt.value.noticeSent;
    case 'undone': return pt.value.noticeUndone;
    case 'cleared': return pt.value.noticeCleared;
    case 'unconfirmed': return pt.value.noticeUnconfirmed;
    case 'rejected': return pt.value.noticeRejected;
    case 'partial': return pt.value.noticePartial(n.weeks.map(w => w.slice(5).replace('-', '/')).join('、'));
    case 'not_needed': return pt.value.noticeNotNeeded;
    case 'nothing_to_undo': return pt.value.noticeNothingToUndo;
    case 'invalid': return pt.value.noticeInvalid;
    case 'clipboard_not_a_plan': return t.value.receiveEmpty;
    case 'paste_failed': return { empty: pt.value.pasteEmpty, no_json: pt.value.pasteNoJson, not_a_plan: pt.value.pasteNotPlan }[n.failure];
    case 'error': return n.text || pt.value.noticeError;
  }
});
const selectExchange = (item: AiExchange) => { selectedExchange.value = item; selectedDay.value = null; document.querySelector('#main-content')?.scrollTo({ top: 0, behavior: 'smooth' }); };
const current = () => { selectedExchange.value = null; selectedDay.value = null; };
const changeDay = (from: string, to: string) => { if (plan.document.value && !historical.value) { selectedDay.value = to; void plan.reshape(moveDay(plan.document.value,from,to)); } };
const removeDay = (date: string) => { if (plan.document.value && !historical.value) void plan.reshape(deleteDay(plan.document.value,date)); };
const editable = computed(() => !!plan.preview.value && !historical.value && plan.accepted.value);
const retype = (index: number, sport: PlanSport) => { if (plan.document.value && editable.value) void plan.reshape(retypeWorkout(plan.document.value, index, sport)); };
const removeWorkout = (index: number) => { if (plan.document.value && editable.value) void plan.reshape(deleteWorkout(plan.document.value, index)); };
const received = () => { selectedDay.value = null; void history.load(); };
const selectWorkout = () => { document.querySelector<HTMLElement>('.past-strips .bridge-row:nth-child(4) [role="button"]')?.focus(); };
let animationTimer = 0, refreshTimer = 0;
const prepared = () => { void history.load(); sentAnimation.value = false; requestAnimationFrame(() => { sentAnimation.value = true; }); window.clearTimeout(animationTimer); animationTimer = window.setTimeout(() => { sentAnimation.value = false; },1200); };
coverage.watchDraft(draft);
const { dataRevision } = useSyncController();
watch(dataRevision, () => { void library.loadRecentWorkouts(); void coverage.loadPreview(draft.value); void plan.load(); });
watch(plan.revision, () => { void history.load(); void strips.load(); });
watch(() => route.query.task, id => { if (typeof id === 'string' && id && id !== draft.value.id) void ctl.loadTask(id).catch(() => undefined); }, { immediate: true });
onMounted(async () => {
  void history.load(); void library.loadTemplates(); void library.loadTaskList(); void library.loadRecentWorkouts(); void plan.resume();
  try { const prefs = await backend.getUserPrefs(); demo.value = !!prefs.demo_mode; if (demo.value && !draft.value.id && !route.query.task) await ctl.loadTask('demo-full-task'); if (!draft.value.personal_note) ctl.setPersonalNote(prefs.ai_profile_note ?? ''); } catch { /* Profile tray exposes retryable failures. */ }
  refreshTimer = window.setInterval(() => { const now = dayKey(); if (now !== today.value) today.value = now; if (!plan.busy.value) void plan.resume(); },15000);
});
onBeforeUnmount(() => { window.clearInterval(refreshTimer); window.clearTimeout(animationTimer); });
</script>
<template>
  <section class="page ai-bridge-page" aria-labelledby="ai-page-title">
    <header class="bridge-page-head"><AiTaskHeader v-if="!historical" :fallback-title="title"/><p v-else class="history-view"><Icon name="clock" :size="14"/>{{ t.historical }}<button class="pill-button quiet" @click="current">{{ t.backCurrent }}</button></p><div v-if="demo" class="demo-banner" role="status"><Icon name="database" :size="14"/><div><strong>{{ t.fullDemo }}</strong><span>{{ t.demoHint }}</span></div></div><button v-if="ctl.canUndo.value && !historical" class="pill-button quiet undo-selection" @click="ctl.undo()"><Icon name="undo" :size="13"/>{{ t.undo }}</button></header>
    <BridgeTimeline :rows="strips.rows.value" :days="days" :end="end" :categories="categories" :selected-ids="selectedIds" :adherence="strips.adherence.value" :preview="future" :selected="selectedDay" :loading="strips.loading.value" :ready="ready" :sent="sentAnimation" :readonly="historical" :future-readonly="!plan.preview.value || !plan.accepted.value" :stamped="stamped" @range="ctl.setWindowDays($event - 1)" @toggle="ctl.setCategoryEnabled($event, !draft.categories.find(c => c.category === $event)?.enabled)" @workout="ctl.toggleWorkout" @select="selectedDay = selectedDay === $event ? null : $event" @move="changeDay" @delete="removeDay" @publish="plan.publish()" @received="received">
      <template #future-action><ReceiveCapsule v-if="!historical" :compact="!!future" @received="received"/></template>
    </BridgeTimeline>
    <p v-if="strips.error.value" class="bridge-message" role="alert"><Icon name="warning" :size="14"/>{{ strips.error.value }}<button class="pill-button quiet" @click="strips.load()">{{ t.retry }}</button></p>
    <div v-if="plan.preview.value && !plan.accepted.value && !historical" class="mcp-arrival"><Icon name="spark" :size="16"/><span>{{ t.mcp }}</span><button class="pill-button" @click="plan.accept()">{{ t.accept }}</button><button class="pill-button quiet" @click="plan.discard()">{{ t.discard }}</button></div>
    <div v-if="notice && !historical" class="bridge-message" role="status"><Icon name="info" :size="14"/><span>{{ notice }}</span><button class="pill-button quiet" @click="plan.dismissNotice()">{{ pt.dismiss }}</button></div>
    <ul v-if="wholeIssues.length" class="whole-issues"><li v-for="(issue,i) in wholeIssues" :key="i"><Icon name="warning" :size="14"/>{{ planIssueText(issue) }}</li></ul>
    <div v-if="detail" class="bridge-detail"><header><span>{{ t.detail }}</span><div><button v-if="plan.preview.value && !historical && plan.accepted.value" class="pill-button quiet" :disabled="plan.busy.value" @click="removeDay(detail.date)"><Icon name="trash" :size="13"/>{{ t.deleteDay }}</button><button class="pill-button quiet" @click="selectedDay = null">{{ t.close }}</button></div></header><PlanDetail :row="detail" :issues="issues" :editable="editable" @retype="retype" @remove="removeWorkout"/></div>
    <div v-if="!historical" class="plan-status-row"><PlanLedger v-if="plan.state.value?.last_publish" :state="plan.state.value" :busy="plan.busy.value" :simulated="demo" @undo="plan.undo()" @clear="plan.clear()"/><button v-if="plan.preview.value && plan.accepted.value" class="pill-button quiet discard-draft" :disabled="plan.busy.value" @click="plan.discard()">{{ t.discard }}</button></div>
    <ComposeLine v-if="!historical" :templates="templates" @workout="selectWorkout"/>
    <ExchangeList :items="history.exchanges.value" :active-id="selectedExchange?.id ?? null" @select="selectExchange"/>
    <p v-if="history.error.value" class="bridge-message" role="alert">{{ history.error.value }}<button class="pill-button quiet" @click="history.load()">{{ t.retry }}</button></p>
    <HandoffDock v-if="!historical" :preview="coverage.preview.value" :preview-error="coverage.previewError.value" :direction="direction" :fallback-title="title" @prepared="prepared"/>
    <ModalDialog v-if="plan.clearPending.value" labelledby="bridge-clear-title" @close="plan.cancelClear()"><div class="clear-dialog"><h2 id="bridge-clear-title">{{ pt.clearTitle }}</h2><p>{{ pt.clearBody }}</p><footer><button class="pill-button quiet" @click="plan.cancelClear()">{{ pt.cancel }}</button><button class="pill-button danger" :disabled="plan.busy.value" @click="plan.confirmClear()">{{ pt.clearConfirm }}</button></footer></div></ModalDialog>
  </section>
</template>
<style scoped src="./AiComposer.css"></style>
