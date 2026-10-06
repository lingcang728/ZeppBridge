/**
 * 「交给 AI」各个子页面共用的那一层（2026-10 精修批次 3：总页只留概括，下钻都成了路由）。
 *
 * - **数据只取一次**：任务草稿、模板、往返记录、训练计划、过去的条带都是全局单例。不管从总页进来，
 *   还是直接打开 /ai/plan/2026-10-08 这种深链接，第一张 AI 页挂上时把它们读好，切子页面不重读、不丢草稿。
 * - **派生的东西只算一份**：「你的下一步」那份计划预览（草稿的、已生效的、最近一次往返的）、任务标题、
 *   方向、提示文案，总页的缩略卡和周视图、单天页读的是同一个 computed。
 * - 跨过午夜由这里推进「今天」：有 AI 页开着时每 15 秒看一眼（没有就不跑）。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { backend } from '../../lib/bridge';
import { autoTaskTitle } from '../../lib/aiTask/title';
import { directionText } from '../../lib/aiTask/prompt';
import { displayableWorkouts } from '../../lib/workouts';
import { addDays, dayKey, daysBetween } from '../../lib/aiTask/bridgeScale';
import { dayRows } from '../../lib/trainingPlan/week';
import { deleteDay, deleteWorkout, insertDay, moveDay, retypeWorkout } from '../../lib/trainingPlan/reshape';
import type { PlanCheck, PlanDocument, PlanDraftPreview, PlanSport } from '../../types/trainingPlan';
import { useAiTaskDraft } from '../useAiTaskDraft';
import { useAiTaskLibrary } from '../useAiTaskLibrary';
import { useAiTaskPreview } from '../useAiTaskPreview';
import { useBridgeStrip } from '../useBridgeStrip';
import { useExchanges } from '../useExchanges';
import { useSyncController } from '../useSyncController';
import { useTrainingPlan } from '../useTrainingPlan';
import { useBridgeText } from '../../components/ai/bridge/bridge.i18n';
import { usePlanText } from '../../components/plan/usePlanText';

const today = ref(dayKey());
const demo = ref(false);
/** 刚交出去一份：「你的过去」那张卡的细条折一下（底栏在外壳上，卡在总页上，借这个信号）。 */
const handedOff = ref(0);
/** 连着拨滚轮、拖图时攒下的改动：停手 350ms 后一次交给后端（每一下都去改草稿、重新校验太密了）。 */
let pendingEdits: Array<(document: PlanDocument) => PlanDocument> = [];
let editTimer = 0;
const editWaiters: Array<() => void> = [];
let started = false;
let mounted = 0;
let timer = 0;

/** 一份校验结果 → 能画周视图的逐日预览（往返记录里的旧计划、已生效的计划都没有「之前」）。 */
export const planViewOf = (check: PlanCheck, start: string): PlanDraftPreview => {
  const last = check.to && check.to > addDays(start, 6) ? check.to : addDays(start, 6);
  const count = Math.min(57, Math.max(7, daysBetween(start, last) + 1));
  return {
    check,
    window: { start },
    days: Array.from({ length: count }, (_, i) => {
      const date = addDays(start, i);
      const after = check.workouts.filter((w) => w.date === date);
      return { date, change: after.length ? 'unchanged' as const : 'rest' as const, before: [], after, rest: check.rest?.find((r) => r.date === date) ?? null };
    }),
  };
};

const bootstrap = async () => {
  const ctl = useAiTaskDraft();
  const library = useAiTaskLibrary();
  const plan = useTrainingPlan();
  const history = useExchanges();
  if (started) {
    // 回到 AI 页：只把可能在别处变过的两样再读一遍（MCP 送来的计划、别的窗口发的推送）。
    void plan.resume();
    void history.load();
    return;
  }
  started = true;
  const coverage = useAiTaskPreview();
  const strips = useBridgeStrip();
  coverage.watchDraft(ctl.draft);
  const { dataRevision } = useSyncController();
  watch(dataRevision, () => { void library.loadRecentWorkouts(); void coverage.loadPreview(ctl.draft.value); void plan.load(); });
  watch(plan.revision, () => { void history.load(); void strips.load(); });
  watch(today, (day) => { strips.end.value = day; });
  void history.load(); void library.loadTemplates(); void library.loadTaskList(); void library.loadRecentWorkouts(); void plan.resume();
  try {
    const prefs = await backend.getUserPrefs();
    demo.value = !!prefs.demo_mode;
    const fromLink = new URLSearchParams(window.location.search).get('task');
    if (demo.value && !ctl.draft.value.id && !fromLink) await ctl.loadTask('demo-full-task');
    if (!ctl.draft.value.personal_note) ctl.setPersonalNote(prefs.ai_profile_note ?? '');
  } catch {
    // 读不到偏好也照常用：个人档案那一格自己会报可重试的错。
  }
};

/** 只有派生状态、不带生命周期：外壳上的底栏也要任务标题和方向，但它不该让 15 秒的轮询一直开着。 */
export const useAiDerived = () => {
  const ctl = useAiTaskDraft();
  const library = useAiTaskLibrary();
  const { draft } = ctl;
  const { templates, recentWorkouts } = library;
  const choices = computed(() => displayableWorkouts(recentWorkouts.value));
  const picked = computed(() => choices.value.filter((w) => draft.value.workout_ids.includes(w.workout_id)));
  const template = computed(() => templates.value.find((p) => p.id === draft.value.template_id) ?? null);
  const title = computed(() => autoTaskTitle(draft.value, picked.value, template.value?.name ?? null));
  const direction = computed(() => directionText(template.value));
  return { choices, picked, template, title, direction, handedOff };
};

export const useAiHub = () => {
  const ctl = useAiTaskDraft();
  const plan = useTrainingPlan();
  const history = useExchanges();
  const t = useBridgeText();
  const { t: pt } = usePlanText();
  const { draft } = ctl;
  const derived = useAiDerived();

  onMounted(() => {
    void bootstrap();
    mounted += 1;
    if (mounted === 1) {
      timer = window.setInterval(() => {
        const now = dayKey();
        if (now !== today.value) today.value = now;
        if (!plan.busy.value) void plan.resume();
      }, 15000);
    }
  });
  onBeforeUnmount(() => {
    mounted -= 1;
    if (!mounted) window.clearInterval(timer);
  });

  /** 「你的过去」看多少天：交出去的各类里最长的那一段（运动按次选，不算），7–90 天。 */
  const pastDays = computed(() => Math.min(90, Math.max(7, ...draft.value.categories.filter((c) => c.category !== 'workout').map((c) => c.days_before + 1))));

  /** 「你的下一步」：手上有草稿就看草稿；否则看已生效的计划（连同最近一次往返里的休息建议）。 */
  const future = computed<PlanDraftPreview | null>(() => {
    if (plan.preview.value) return plan.preview.value;
    const active = plan.state.value?.planned.filter((w) => w.date >= today.value) ?? [];
    const latest = history.exchanges.value.find((e) => e.publish_state === 'sent' && !e.undone && e.plan?.to && e.plan.to >= today.value);
    if (!active.length && !latest) return null;
    const endings = [active[active.length - 1]?.date, latest?.plan?.to, today.value].filter((d): d is string => !!d).sort();
    const last = endings[endings.length - 1]!;
    return planViewOf({
      from: today.value, to: last, workouts: active, issues: [], summary: latest?.plan?.summary,
      rest: latest?.plan?.rest?.filter((r) => r.date >= today.value),
    }, today.value);
  });
  const rows = computed(() => (future.value ? dayRows(future.value, today.value) : []));
  /** 已经发到手表的（没有待发的草稿、最近一次推送送到了）。 */
  const stamped = computed(() => !plan.preview.value && ['sent', 'partial'].includes(plan.state.value?.last_publish?.state ?? ''));
  /** 草稿原文里每条训练写的日期：校验问题带的是原文里第几条。 */
  const written = computed(() => plan.document.value?.workouts ?? []);
  /** 能就地改：手上有草稿（不是 MCP 送来还没接受的），或者有已经生效的计划（改的时候先拿回来变成草稿）。 */
  const editable = computed(() => (plan.preview.value ? plan.accepted.value : !!plan.state.value?.planned.length));

  /** 改草稿：手上没有草稿、但有已经发出去的计划时，先把它拿回来变成草稿（发出后还能改，批次 4.3）。 */
  const edit = async (change: (document: PlanDocument) => PlanDocument): Promise<void> => {
    if (!plan.document.value && !(await plan.editActive(today.value))) return;
    if (!plan.document.value || !plan.accepted.value) return;
    await plan.reshape(change(plan.document.value));
  };
  /** 攒一下再改：返回的 Promise 在这批改动落定（新预览画上来）以后才 resolve。 */
  const queueEdit = (change: (document: PlanDocument) => PlanDocument): Promise<void> => {
    pendingEdits.push(change);
    window.clearTimeout(editTimer);
    const flush = async () => {
      if (plan.busy.value) { editTimer = window.setTimeout(() => void flush(), 120); return; }
      const batch = pendingEdits;
      pendingEdits = [];
      const waiters = editWaiters.splice(0);
      try {
        if (batch.length) await edit((doc) => batch.reduce((current, step) => step(current), doc));
      } finally {
        for (const done of waiters) done();
      }
    };
    editTimer = window.setTimeout(() => void flush(), 350);
    return new Promise((resolve) => { editWaiters.push(resolve); });
  };
  const changeDay = (from: string, to: string) => edit((doc) => moveDay(doc, from, to));
  const insertAt = (from: string, to: string) => edit((doc) => insertDay(doc, from, to));
  const removeDay = (date: string) => edit((doc) => deleteDay(doc, date));
  const retype = (index: number, sport: PlanSport) => edit((doc) => retypeWorkout(doc, index, sport));
  const removeWorkout = (index: number) => edit((doc) => deleteWorkout(doc, index));

  /** 训练计划操作的结局，按当前语言说一句。 */
  const notice = computed(() => {
    const n = plan.notice.value;
    if (!n) return null;
    switch (n.kind) {
      case 'sent': return demo.value ? t.value.demoDelivered : pt.value.noticeSent;
      case 'undone': return pt.value.noticeUndone;
      case 'cleared': return pt.value.noticeCleared;
      case 'unconfirmed': return pt.value.noticeUnconfirmed;
      case 'rejected': return pt.value.noticeRejected;
      case 'partial': return pt.value.noticePartial(n.weeks.map((w) => w.slice(5).replace('-', '/')).join('、'));
      case 'not_needed': return pt.value.noticeNotNeeded;
      case 'nothing_to_undo': return pt.value.noticeNothingToUndo;
      case 'invalid': return pt.value.noticeInvalid;
      case 'clipboard_not_a_plan': return t.value.receiveEmpty;
      case 'paste_failed': return { empty: pt.value.pasteEmpty, no_json: pt.value.pasteNoJson, not_a_plan: pt.value.pasteNotPlan }[n.failure];
      case 'error': return n.text || pt.value.noticeError;
    }
    return null;
  });

  return {
    ...derived, today, demo, pastDays,
    future, rows, stamped, written, editable, notice,
    edit, queueEdit, changeDay, insertAt, removeDay, retype, removeWorkout,
  };
};
