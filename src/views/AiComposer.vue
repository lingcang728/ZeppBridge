<script setup lang="ts">
/**
 * 交给 AI（2026-10-08 横向舞台，取代单列叙事 1D·D2）：
 *
 *   左：一把浮着的牌——要交给 AI 的每一类一张、个人档案一张、「加一类」一张（≤ 9 张）；可拖、往上甩 = 不交
 *   中：一条竖线上的门锁（这次交给哪个 AI、就绪度），锁散出去的思维树牵着每一张牌
 *   右：一张牌——问题 → 回执（交出去的 .md）→ 计划（一张牌的一生，见 FutureCard）
 *
 * 按住锁蓄满一圈：牌抖两下，沿各自那根线飞进锁（同时后端准备文件），回执牌从锁里长出来落到右边，落定后复制开场白、打开网站
 * （useStageSend）。细节都在下一层：点一张牌 = 翻到背面改回溯天数（二级）→「挑具体日子」= 牌桌从这张牌发牌（三级）；
 * 锁下的小字 → 寄出前检查；计划牌 → 周视图；任务名 → 已保存的任务；「往返 N 次」→ 往返记录。全部从被点处长出、缩回。
 * 原来的柱状条带、底栏、「你的过去」二级页都没有了。
 */
import { computed, defineAsyncComponent, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, shallowRef, watch } from 'vue';
import { useRoute } from 'vue-router';
import '../styles/ai-task.css';
import Icon from '../components/Icon.vue';
import AiTaskHeader from '../components/ai/AiTaskHeader.vue';
import GraphUndoPill from '../components/ai/GraphUndoPill.vue';
import PlanLedger from '../components/plan/PlanLedger.vue';
import PlanClearDialog from '../components/plan/PlanClearDialog.vue';
import ProfileTray from '../components/ai/ProfileTray.vue';
import StageCard from '../components/ai/stage/StageCard.vue';
import ThreadField from '../components/ai/stage/ThreadField.vue';
import BridgeLock from '../components/ai/stage/BridgeLock.vue';
import FutureCard from '../components/ai/stage/FutureCard.vue';
import StageCardBack from '../components/ai/stage/StageCardBack.vue';
import AddKindDialog from '../components/ai/stage/AddKindDialog.vue';
import AiSheet from '../components/ai/AiSheet.vue';
import { leaveSheet } from '../lib/motion/sheet';
import { useAiHub } from '../composables/ai/useAiHub';
import { useStageCards, type StageCardModel } from '../composables/ai/useStageCards';
import { useStageSend } from '../composables/ai/useStageSend';
import { useCloudDrag } from '../composables/ai/useCloudDrag';
import { useCloudPhysics } from '../composables/ai/useCloudPhysics';
import { useBoxPour } from '../composables/ai/useBoxPour';
import { useAiTaskDraft } from '../composables/useAiTaskDraft';
import { useAiTaskLibrary } from '../composables/useAiTaskLibrary';
import { useBridgeStrip } from '../composables/useBridgeStrip';
import { useExchanges } from '../composables/useExchanges';
import { useSyncController } from '../composables/useSyncController';
import { useTrainingPlan } from '../composables/useTrainingPlan';
import { cloudLayout } from '../lib/aiTask/cloud';
import { stageLayout } from '../lib/aiTask/stageLayout';
import { sampleStrand, threadTree } from '../lib/aiTask/threads';
import { categoryDeckSource } from '../lib/cards/categoryDeck';
import type { DeckSource } from '../lib/cards/sources';
import { bump, convergeCards, emergeFrom, reducedMotion, SPRINGS, springCurve, type Convergence } from '../lib/motion/cards';
import { onMotionEscape } from '../lib/motion/interrupt';
import { useBridgeText } from '../components/ai/bridge/bridge.i18n';
import { useHandoffText } from '../components/ai/HandoffDock.i18n';
import { useStageText } from '../components/ai/stage/stage.i18n';

defineOptions({ name: 'AiComposer' });
const route = useRoute();
const ctl = useAiTaskDraft();
const { templates } = useAiTaskLibrary();
const plan = useTrainingPlan();
const history = useExchanges();
const strips = useBridgeStrip();
const hub = useAiHub();
const send = useStageSend();
const { cards, off, empty, dataCard } = useStageCards();
const { dataReady, isSyncing, syncProgress } = useSyncController();
const t = useBridgeText();
const ht = useHandoffText();
const s = useStageText();

/** 从别处带着 ?task= 打开：接着那个任务。 */
watch(() => route.query.task, (id) => {
  if (typeof id === 'string' && id && id !== ctl.draft.value.id) void ctl.loadTask(id).catch(() => undefined);
}, { immediate: true });

/* ---------- 版式：量舞台，算锁、右牌、撒牌区和每张牌的位置 ---------- */
const stage = ref<HTMLElement | null>(null);
const size = ref({ width: 1100, height: 600 });
let observer: ResizeObserver | null = null;
const measure = () => {
  const el = stage.value;
  if (!el) return;
  const top = el.getBoundingClientRect().top;
  size.value = { width: el.clientWidth, height: Math.max(520, Math.min(720, window.innerHeight - Math.max(0, top) - 28)) };
};
onMounted(() => {
  measure();
  observer = new ResizeObserver(measure);
  if (stage.value) observer.observe(stage.value);
  window.addEventListener('resize', measure);
});
onBeforeUnmount(() => { observer?.disconnect(); window.removeEventListener('resize', measure); });
const layout = computed(() => stageLayout(size.value.width, size.value.height));
/** 撒牌区底下留一条给「加一类」那枚胶囊（它不是牌，不进线网，2026-10-08 第二轮）。 */
const ADD_H = 48;
const zone = computed(() => ({ ...layout.value.cloud, height: layout.value.cloud.height - (off.value.length ? ADD_H : 0) }));
const cloud = computed(() => cloudLayout(cards.value.length, zone.value));
/** 「加一类」紧贴在这把牌的下沿下面（牌被列宽卡住时整把牌是上下居中的）。 */
const addTop = computed(() => zone.value.y + Math.max(0, ...cloud.value.slots.map((slot) => slot.y + cloud.value.height)) + 22);
const restOf = (id: string) => {
  const i = cards.value.findIndex((c) => c.id === id);
  const slot = cloud.value.slots[i];
  return slot ? { x: zone.value.x + slot.x, y: zone.value.y + slot.y } : null;
};

/* ---------- 拖、甩、点 ---------- */
const slots = new Map<string, HTMLElement>();
const setSlot = (id: string, el: unknown) => { if (el instanceof HTMLElement) slots.set(id, el); else slots.delete(id); };
const backCard = shallowRef<StageCardModel | null>(null);
const adding = ref(false);
const profile = ref(false);
const drag = useCloudDrag({
  slotOf: (id) => slots.get(id) ?? null,
  canFlick: (id) => cards.value.find((c) => c.id === id)?.kind === 'data',
  onTap: (id) => open(id),
  onFlick: (id) => {
    const card = cards.value.find((c) => c.id === id);
    if (card?.category) ctl.setCategoryEnabled(card.category, false);
  },
  onLand: (id, dx, dy) => physics.nudge(id, dx, dy),
  grabAt: (id) => physics.shiftOf(id),
  onTake: (id) => physics.take(id),
});
/* 牌和牌之间的「力」（10-08 H16）：拖着一张靠近别的牌，别的牌被挤开；松手各自弹回，线跟着轻轻晃。 */
const physics = useCloudPhysics({
  slots: () => cards.value.map((c) => { const r = restOf(c.id); return { id: c.id, x: r?.x ?? 0, y: r?.y ?? 0 }; }),
  offsetOf: (id) => drag.offsetOf(id),
  live: () => drag.live.value,
  card: () => ({ width: cloud.value.width, height: cloud.value.height }),
  bounds: () => zone.value,
});
watch(() => drag.live.value, () => physics.kick());
/**
 * 拖着一张牌时（10-09，用户：视觉焦点要始终在手里这张牌上）：舞台其余部分压一层高斯模糊，被挤开的牌在模糊底下让位；
 * 手里这张浮在最上面。松手以后模糊和层级都留到弹回落定（牌从很远弹回来时，视线还在它身上），再一起退。
 */
const holdingCard = computed(() => !!drag.live.value);
const focusing = ref(false);
const lifted = ref(false);
let liftTimer = 0;
watch(holdingCard, (on) => {
  window.clearTimeout(liftTimer);
  if (on) { focusing.value = true; lifted.value = true; }
  else liftTimer = window.setTimeout(() => { focusing.value = false; lifted.value = false; }, 720);
});
onBeforeUnmount(() => window.clearTimeout(liftTimer));
const open = (id: string) => {
  if (send.gathering.value) return;
  const card = cards.value.find((c) => c.id === id);
  if (!card) return;
  if (card.kind === 'profile') profile.value = true;
  else backCard.value = card;
};
/**
 * 重新撒一遍：拖过的位置作废，旧牌用 FLIP 弹簧挪到新位置，新牌淡入——不瞬移。
 * `stagger`：一张接一张出发（一键复原：一把牌依次落回原位，看得出是「收拾好了」）。
 */
const reflow = async (stagger = 0) => {
  const before = new Map([...slots].map(([id, el]) => [id, el.getBoundingClientRect()]));
  drag.resetOffsets();
  physics.reset();
  await nextTick();
  if (reducedMotion()) return;
  const { easing, duration } = springCurve(SPRINGS.settle);
  let i = 0;
  for (const [id, el] of slots) {
    const was = before.get(id);
    const now = el.getBoundingClientRect();
    if (!was) { el.animate([{ opacity: 0, transform: 'scale(.9)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'ease-out' }); continue; }
    const dx = was.left - now.left, dy = was.top - now.top;
    if (Math.abs(dx) + Math.abs(dy) < 1) continue;
    el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration, easing, delay: stagger * i, fill: 'backwards' });
    i += 1;
  }
};
/* 牌的多少变了（甩掉一张、加回一类、换任务）。 */
watch(() => cards.value.map((c) => c.id).join('|'), () => reflow(), { flush: 'pre' });
const resetCards = () => { if (!drag.dragging() && !send.gathering.value) void reflow(45); };
/** 牌此刻的位置（含拖动偏移、被挤开的位移）：线从这里接出去。`stay` 是本来停的位置（不含被挤开），线分组只看它。 */
const placed = computed(() => cards.value.map((card) => {
  const rest = restOf(card.id) ?? { x: 0, y: 0 };
  const live = drag.live.value?.id === card.id ? drag.live.value : null;
  const stored = drag.offsetOf(card.id);
  const o = live ?? stored;
  const s = physics.shiftOf(card.id);
  return { card, rest, x: rest.x + o.x + s.x, y: rest.y + o.y + s.y, stayY: rest.y + stored.y, rot: cloud.value.slots[cards.value.indexOf(card)]?.rot ?? 0 };
}));
const tree = computed(() => {
  const l = layout.value;
  if (l.mode !== 'row') return null;
  const w = cloud.value.width;
  const h = cloud.value.height;
  // 牌在锁左边：线接右沿；被拖到锁右边：接左沿（线总是从牌朝着锁的那一边出来）。
  const ports = placed.value.map((p) => {
    const left = p.x + w / 2 > l.lock.x;
    return { id: p.card.id, x: left ? p.x : p.x + w, y: p.y + h / 2, side: left ? 'left' as const : 'right' as const, ry: p.stayY + h / 2 };
  });
  return threadTree(l.lock, l.lock.r, ports, { x: l.card.x, y: l.card.y + l.card.height / 2, h: l.card.height }, [], zone.value.x + zone.value.width);
});
/** 被拖着的牌靠近锁（牌心离锁心不到两个半锁半径）：锁迎上来、外圈亮起（H21）。 */
const nearLock = computed(() => {
  const live = drag.live.value;
  const p = live ? placed.value.find((one) => one.card.id === live.id) : null;
  if (!p || layout.value.mode !== 'row') return false;
  const l = layout.value.lock;
  return Math.hypot(p.x + cloud.value.width / 2 - l.x, p.y + cloud.value.height / 2 - l.y) < l.r * 2.5;
});
/** 第几张牌先飞：线按同一个顺序收。 */
const order = computed(() => Object.fromEntries(placed.value.map((p, i) => [p.card.id, i])));

/* ---------- 收集箱并进左边的牌（useBoxPour） ---------- */
useBoxPour({
  cardOf: (category) => slots.get(category)?.querySelector<HTMLElement>('.scard') ?? null,
  fallback: () => stage.value?.querySelector<HTMLElement>('.add-kind') ?? [...slots.values()][0]?.querySelector<HTMLElement>('.scard') ?? null,
  busy: () => send.gathering.value,
});

/* ---------- 三级：从牌背面挑具体日子（牌桌从这张牌发牌） ---------- */
const CardTable = defineAsyncComponent(() => import('../components/cards/CardTable.vue'));
const deck = shallowRef<{ source: DeckSource; origin: DOMRect; anchor: Element | null } | null>(null);
const deal = async () => {
  const card = backCard.value;
  backCard.value = null;
  if (!card?.category) return;
  // 背面先缩回牌里，再从这张牌发牌（不叠影）。
  await new Promise((resolve) => window.setTimeout(resolve, 460));
  const el = slots.get(card.id)?.querySelector('.scard') ?? null;
  const unit = strips.rows.value.find((r) => r.category === card.category)?.cells.find((cell) => cell.unit)?.unit ?? null;
  deck.value = {
    source: categoryDeckSource(card.category, { unit, pickedWorkouts: () => ctl.draft.value.workout_ids, releaseWorkout: (id) => ctl.setWorkoutSelected(id, false) }),
    origin: el?.getBoundingClientRect() ?? new DOMRect(window.innerWidth / 4, window.innerHeight / 2, 0, 0),
    anchor: el,
  };
};

/* ---------- 寄出：牌沿线飞进锁 → 回执牌从锁里长出来 ---------- */
const future = ref<{ front: HTMLElement | null; turn: (face: 'question' | 'receipt' | 'plan') => Promise<void> } | null>(null);
const lockEl = () => stage.value?.querySelector<HTMLElement>('.bridge-lock .lock') ?? null;
const lit = ref(false);
/** 线收回锁里（牌飞进锁的那一段）。 */
const reeled = ref(false);
let flight: Convergence | null = null;
const choreography = {
  gather: async () => {
    const box = stage.value?.getBoundingClientRect();
    const flying = placed.value;
    const els = flying.map((p) => slots.get(p.card.id)?.querySelector<HTMLElement>('.scard')).filter((el): el is HTMLElement => !!el);
    const paths = flying.map((p) => (tree.value && box ? sampleStrand(tree.value, p.card.id, 14).map((pt) => ({ x: pt.x + box.left, y: pt.y + box.top })) : []));
    lit.value = true;
    reeled.value = true;
    flight = convergeCards(els, paths, lockEl());
    await flight.gather();
  },
  emerge: async () => {
    await nextTick();
    await emergeFrom(future.value?.front ?? null, lockEl());
    flight?.finish();
    flight = null;
    lit.value = false;
    reeled.value = false;
  },
  scatter: async () => {
    lit.value = false;
    reeled.value = false;
    await flight?.scatter();
    flight = null;
  },
};
const go = () => {
  if (send.gathering.value) { send.recall(); return; }
  void send.send(choreography, () => { void history.load(); hub.handedOff.value += 1; });
};
/* 汇聚途中 Esc = 原路收回（接管全局的「Esc 快进动效」，lib/motion/interrupt.ts）。 */
const releaseEscape = onMotionEscape(() => {
  if (!send.gathering.value) return false;
  send.recall();
  return true;
});
onBeforeUnmount(releaseEscape);

const received = async () => {
  void history.load();
  await future.value?.turn('plan');
};
const highlightWorkout = () => { bump(slots.get('workout')?.querySelector('.scard')); };
const waiting = computed(() => {
  if (dataReady.value.phase !== 'waiting') return null;
  return syncProgress.value && isSyncing.value ? ht.value.readinessWaitingStep(syncProgress.value.current, syncProgress.value.total) : ht.value.readinessWaiting;
});

/** 子路由开在哪一张玻璃大卡里（往返记录和某一次往返共用一张，里面换内容）。 */
const sheetOf = (path: string) => /^\/ai\/(check|tasks|exchanges)(\/|$)/.exec(path)?.[1] ?? null;

/* ---------- 浮动：页面看不见（切走、窗口最小化）时停下 ---------- */
const paused = ref(false);
const onVisibility = () => { paused.value = document.hidden; };
onMounted(() => document.addEventListener('visibilitychange', onVisibility));
onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisibility));
onActivated(() => { paused.value = document.hidden; measure(); });
onDeactivated(() => { paused.value = true; });
</script>

<template>
  <section class="page ai-stage-page" aria-labelledby="ai-page-title">
    <header class="stage-head">
      <AiTaskHeader :fallback-title="hub.title.value" />
      <RouterLink v-if="history.exchanges.value.length" to="/ai/exchanges" class="exchanges-pill" data-sheet="exchanges">
        {{ s.exchanges(history.exchanges.value.length) }}<Icon name="chevron-right" :size="13" />
      </RouterLink>
      <div v-if="hub.demo.value" class="demo-banner" role="status"><Icon name="database" :size="14" /><div><strong>{{ t.fullDemo }}</strong><span>{{ t.demoHint }}</span></div></div>
      <Transition name="undo-fade"><GraphUndoPill v-if="ctl.canUndo.value" class="undo-selection" :can-undo="ctl.canUndo.value" :label="t.undo" @undo="ctl.undo()" /></Transition>
    </header>

    <div ref="stage" :class="['stage', layout.mode, { paused, gathering: send.gathering.value, focusing, lifted }]" :style="{ height: `${layout.height}px` }" :aria-label="s.stage">
      <div class="spine" :style="layout.mode === 'row' ? { left: `${layout.lock.x}px` } : { top: `${layout.lock.y}px` }" aria-hidden="true"></div>
      <ThreadField :tree="tree" :width="layout.width" :height="layout.height" :lit="lit" :reeled="reeled" :order="order" :active="drag.live.value?.id ?? null" />

      <ul class="cloud" :style="{ '--card-w': `${cloud.width}px` }" :aria-label="t.past">
        <li class="focus-veil" aria-hidden="true"></li>
        <li v-for="(p, i) in placed" :key="p.card.id" :ref="(el) => setSlot(p.card.id, el)" :class="['slot', { top: drag.lastId.value === p.card.id }]"
          :style="{ left: `${p.rest.x}px`, top: `${p.rest.y}px`, translate: `${p.x - p.rest.x}px ${p.y - p.rest.y}px`, '--rot': `${p.rot}deg`, '--i': i }">
          <button type="button" class="slot-button" :aria-label="`${p.card.title} · ${p.card.line}`" @pointerdown="drag.onDown($event, p.card.id)" @keydown.enter.prevent="open(p.card.id)" @keydown.space.prevent="open(p.card.id)">
            <StageCard :card="p.card" />
          </button>
        </li>
      </ul>
      <!-- 「加一类」和一类都不剩时的那句提示排在同一行（10-08 H21：以前提示固定在 40% 高处，和牌、胶囊叠在一起）。 -->
      <div v-if="off.length || cards.length <= 1 || drag.moved.value" class="add-row" :style="{ left: `${zone.x}px`, top: `${addTop}px`, maxWidth: `${zone.width}px` }">
        <button v-if="off.length" type="button" class="add-kind" @click="adding = true">
          <Icon name="plus" :size="14" />{{ s.add }}
        </button>
        <Transition name="undo-fade">
          <button v-if="drag.moved.value" type="button" class="add-kind" :disabled="send.gathering.value" @click="resetCards">
            <Icon name="refresh" :size="14" />{{ s.resetCards }}
          </button>
        </Transition>
        <p v-if="cards.length <= 1" class="cloud-empty">{{ s.nothing }}</p>
      </div>

      <div class="lock-host" :style="{ left: `${layout.lock.x}px`, top: `${layout.lock.y - layout.lock.r}px` }">
        <BridgeLock :r="layout.lock.r" :provider="send.provider.value" :busy="send.gathering.value" :disabled="send.disabled.value" :subscribed="send.subscribed.value"
          :readiness="send.readiness.value" :md-line="send.mdLine.value" :issues="send.issueCount.value" :waiting="waiting" :near="nearLock"
          :title="isSyncing ? ht.goSubSyncing : ht.run(send.provider.value.label)" @go="go" @pick="send.pick" @export-only="send.exportOnly()" />
      </div>

      <FutureCard ref="future" v-model:face="send.face.value" :box="layout.card" :templates="templates" :disabled="send.gathering.value"
        :ready="send.ready.value" :blocked="send.blocked.value" :provider="send.provider.value.label" :provider-icon="send.provider.value.localIcon" :stale="send.stale.value" :recalled="send.recalled.value"
        :steps="send.steps.value" :save-error="send.saveError.value" :rows="hub.rows.value" :drafting="!!plan.preview.value" :plan="plan.state.value"
        :mcp="!!plan.preview.value && !plan.accepted.value" @copy="send.copyAgain()" @open="send.openAgain()" @reveal="send.reveal()" @retry="send.retry($event as 'copy' | 'open')"
        @received="received" @accept="plan.accept()" @discard="plan.discard()" @workout="highlightWorkout" />
    </div>

    <div class="stage-foot">
      <p v-if="strips.error.value" class="bridge-message" role="alert"><Icon name="warning" :size="14" />{{ strips.error.value }}<button class="pill-button quiet" @click="strips.load()">{{ t.retry }}</button></p>
      <p v-if="send.blocked.value.length === 0 && send.ready.value === null && hub.notice.value" class="bridge-message" role="status"><Icon name="info" :size="14" /><span>{{ hub.notice.value }}</span><button class="pill-button quiet" @click="plan.dismissNotice()">{{ t.close }}</button></p>
      <div v-if="plan.state.value?.last_publish" class="plan-status-row"><PlanLedger :state="plan.state.value" :busy="plan.busy.value" :simulated="hub.demo.value" @undo="plan.undo()" @clear="plan.clear()" /></div>
    </div>

    <StageCardBack v-if="backCard" :card="cards.find((c) => c.id === backCard!.id) ?? backCard" @close="backCard = null" @deal="deal" />
    <AddKindDialog v-if="adding" :cards="off.map(dataCard)" :empty="empty" @close="adding = false" />
    <ProfileTray v-if="profile" @close="profile = false" />
    <CardTable v-if="deck" :source="deck.source" :range="7" :origin="deck.origin" :anchor="deck.anchor" @close="deck = null" />
    <PlanClearDialog />
    <RouterView v-slot="{ Component, route: sub }">
      <Transition :css="false" @leave="leaveSheet">
        <AiSheet v-if="Component && sheetOf(sub.path)" :key="sheetOf(sub.path)!" :name="sheetOf(sub.path)!">
          <Transition name="sheet-swap" mode="out-in"><component :is="Component" :key="sub.path" /></Transition>
        </AiSheet>
      </Transition>
    </RouterView>
  </section>
</template>

<style scoped src="./AiComposer.css"></style>
