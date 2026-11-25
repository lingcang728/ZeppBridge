<script setup lang="ts">
/**
 * 发牌桌（「建议 → 发牌 → 交给 AI」）：首页「今日一问」卡里原地展开的一块。按一个问题挑好的一手牌从卡面那叠小牌里
 * 抽出来排开；按「换几张牌」（`showBench`）才在牌桌右侧露出一叠候补（错开叠着，每张露出上沿，最新换下来的那张压在最上面、整张看得见）。
 * 露出 / 收起候补时主牌让位（FLIP），台面高度一起平滑过渡，底下的问题和按钮跟着滑。
 *
 * 牌桌只做预览和替换，不再让人一张张挑（候补收着时牌不能抽，免得点一下牌就不见了）：
 * - 拖：按住主牌里的一张拖到右边那叠候补上就是抽掉；按住候补里的一张拖到某张主牌上就是和它对换。牌跟着手走、微微歪向
 *   拖的方向，只有落点那一格亮起来（那叠候补，或被换下的那张主牌），不给整排描边；松手没到位就弹回原处。
 *   点一下也照旧：点主牌抽到候补，点候补换进来。
 *   换位都是「从此刻的样子起」的 FLIP（拖着松手就从手指那里起），只动 transform，约 500ms。
 * - 每次换牌都马上告诉外面（`change`），交给 AI 的任务包跟着这手牌变。
 * - 收牌（卡面再点一下、Esc）：先理成一叠，再整叠放回卡面那叠小牌，底下按钮一起淡掉；`close` 带上是不是用了这手牌。
 *   发牌途中按 Esc 也是从此刻理牌放回，不会半路消失。底下那一排按钮由外面放（`foot` 插槽）。
 * 减少动效时一律淡入淡出（lib/motion/cards）。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import PlayingCard from './PlayingCard.vue';
import { useHandsText } from './hands.i18n';
import { handFace } from './handFace';
import { drawOut, swapIn, type Hand, type HandCard } from '../../lib/cards/hands';
import type { HandLines } from '../../types/hands';
import {
  animateFromNow, CARD_RETURN_MS, dealCards, receive, reducedMotion, relay, returnStack, stackAndReturnMs, stackCards, type Landing,
} from '../../lib/motion/cards';
import { CLOSE_EASE, OPEN_EASE, paced } from '../../lib/motion/timing';
import { onMotionEscape } from '../../lib/motion/interrupt';
import { whenFramesSteady } from '../../lib/motion/steady';
import { fadeSourceIn, holdSource, sourceInFrames } from '../../lib/motion/sourceHold';

const props = withDefaults(defineProps<{
  hand: Hand;
  title: string;
  lines?: Record<string, HandLines>;
  origin?: DOMRect | null;
  anchor?: Element | null;
  /** 露出候补（「换几张牌」）。收着时牌不能抽也不能拖。 */
  showBench?: boolean;
}>(), { lines: () => ({}), origin: null, anchor: null, showBench: false });
/** `returning`：理好的一叠开始飞回来处（外面可以同时把牌桌占的地方收起来）。 */
const emit = defineEmits<{ change: [hand: Hand]; close: [used: boolean]; returning: [] }>();
const t = useHandsText();
/** 换牌：一张牌从主牌飞进候补（或反过来）的时长，≈500ms。 */
const MOVE_MS = paced(380);
const GAP = 16;

const hand = shallowRef<Hand>(props.hand);
const stage = ref<HTMLElement | null>(null);
const foot = ref<HTMLElement | null>(null);
const benchHead = ref<HTMLElement | null>(null);
const stageBox = ref({ width: 640 });
const closing = ref(false);
const seq = relay();
let returnFocus: HTMLElement | null = null;

const faces = computed(() => new Map([...hand.value.cards, ...hand.value.bench].map((card) => {
  const lines = card.kind === 'workout' ? props.lines[card.workout.workout_id] : null;
  return [card.id, handFace(card, t.value, lines)] as const;
})));
const face = (card: HandCard) => faces.value.get(card.id)!;

/* ---------- 版式：主牌一道微拱的扇面，候补一排小牌 ---------- */
/** 候补那一叠的牌宽：和主牌比例固定，不跟着候补张数变窄。 */
const BENCH_W = 96;
/** 候补每张往下错开多少（露出上沿的图标和名字）；张数多时压紧，整叠不超过两张牌高。 */
const benchStep = computed(() => {
  const n = hand.value.bench.length;
  return n < 2 ? 0 : Math.max(14, Math.min(34, (BENCH_W * 1.4) / (n - 1)));
});
const mainW = computed(() => {
  const n = Math.max(1, hand.value.cards.length);
  const room = stageBox.value.width - (props.showBench ? BENCH_W + 32 : 0);
  const fit = (room - GAP * (n - 1)) / n;
  return Math.max(72, Math.floor(Math.min(140, fit)));
});
const fanStyle = (i: number): Record<string, string> => {
  const n = hand.value.cards.length;
  if (reducedMotion() || n < 3) return {};
  const mid = (n - 1) / 2;
  const off = (i - mid) / mid;
  const sag = Math.min(24, 6 + n * 2.5);
  return { transform: `translateY(${(off * off * sag - sag / 2).toFixed(1)}px) rotate(${(off * Math.min(5, 24 / n)).toFixed(2)}deg)` };
};

/* ---------- 来处 ---------- */
const anchorLanding = (): Landing | null => {
  const rect = props.anchor?.isConnected ? props.anchor.getBoundingClientRect() : props.origin;
  return rect ? { rect, kind: 'button' } : null;
};
let releaseAnchor: () => void = () => undefined;
const stageCenter = () => {
  const r = stage.value?.getBoundingClientRect();
  return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : undefined;
};
const allCards = (): HTMLElement[] => [...(stage.value?.querySelectorAll<HTMLElement>('.pcard') ?? [])];

/* ---------- 发牌 ---------- */
const deal = async (id: number) => {
  await nextTick();
  const cards = allCards();
  if (!reducedMotion() && props.anchor instanceof HTMLElement && anchorLanding()) releaseAnchor = holdSource(props.anchor);
  const before = new Set(cards.flatMap((card) => card.getAnimations()));
  const dealt = dealCards(cards, anchorLanding(), { track: seq.track });
  // 先停在第一帧，等挂载、光栅化这几帧过去再放（和挑日子的牌桌一样，免得第一帧卡住、放出来跳一截）。
  const fresh = cards.flatMap((card) => card.getAnimations()).filter((animation) => !before.has(animation));
  for (const animation of fresh) animation.pause();
  await whenFramesSteady();
  for (const animation of fresh) if (animation.playState === 'paused') animation.play();
  await dealt;
  if (!seq.live(id)) return;
  stage.value?.querySelector<HTMLElement>('.hand-row .pcard')?.focus({ preventScroll: true });
};

/* ---------- 换牌：FLIP，从此刻的样子起 ---------- */
const snapshot = () => new Map(allCards().map((el) => [el.dataset.cardId ?? '', el.getBoundingClientRect()]));
/** 每张牌从 `before` 记下的样子滑到现在的牌位（只动 transform）。`crossed` 里的牌换了一排，走一道往上拱的弧线。 */
const flip = (before: Map<string, DOMRect>, crossed: Set<string>, moved: string | null) => {
  for (const el of allCards()) {
    const id = el.dataset.cardId ?? '';
    const from = before.get(id);
    if (!from) continue;
    // 先把这张牌身上在放的动画取消，再量它的落点：量到的才是新牌位本身。
    for (const animation of el.getAnimations()) animation.cancel();
    const to = el.getBoundingClientRect();
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    const s = from.width / Math.max(to.width, 1);
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(s - 1) < 0.01) continue;
    const start = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${s.toFixed(3)})`;
    // 换了一排的那张走一道往上拱的弧线；同一排里让位的牌直接滑过去。
    const arc = crossed.has(id);
    const lift = Math.min(80, 24 + Math.hypot(dx, dy) * 0.12);
    const frames: Keyframe[] = arc
      ? [{ transform: start }, { transform: `translate(${(dx / 2).toFixed(1)}px, ${(dy / 2 - lift).toFixed(1)}px) scale(${((s + 1) / 2).toFixed(3)}) rotate(${id === moved ? -4 : 0}deg)`, offset: 0.5 }, { transform: 'none' }]
      : [{ transform: start }, { transform: 'none' }];
    seq.track(el.animate(frames, { duration: MOVE_MS, easing: arc ? 'cubic-bezier(.35, .1, .25, 1)' : OPEN_EASE }));
  }
};
/** 刚换过去的那张：飞的途中和落定后都压在同一叠最上面（HandTable.css `.is-fresh`）。 */
const fresh = ref<string | null>(null);
let freshTimer = 0;
const move = async (next: Hand, moved: string, release?: () => void) => {
  if (closing.value) { release?.(); return; }
  const before = snapshot();
  release?.();
  const wasBench = new Set(hand.value.bench.map((card) => card.id));
  window.clearTimeout(freshTimer);
  fresh.value = moved || null;
  hand.value = next;
  emit('change', next);
  await nextTick();
  const nowBench = new Set(next.bench.map((card) => card.id));
  // 换进主牌的那张落定就放下；落进候补的那张等指针离开那一叠（鼠标停着的那张不会一下盖上来）。
  if (moved && !nowBench.has(moved)) freshTimer = window.setTimeout(() => { if (fresh.value === moved) fresh.value = null; }, MOVE_MS);
  if (!reducedMotion()) {
    const crossed = new Set([...before.keys()].filter((id) => wasBench.has(id) !== nowBench.has(id)));
    flip(before, crossed, moved);
  }
  if (moved) stage.value?.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(moved)}"]`)?.focus({ preventScroll: true });
};
const leaveBench = () => { if (fresh.value && hand.value.bench.some((card) => card.id === fresh.value)) fresh.value = null; };

/* ---------- 露出 / 收起候补：主牌让位变窄或变宽（FLIP），台面高度平滑过渡——底下的问题和按钮跟着滑，不跳 ---------- */
const BENCH_MS = MOVE_MS;
let stageSizing: Animation | null = null;
watch(() => props.showBench, async () => {
  const el = stage.value;
  if (!el || closing.value || reducedMotion()) return;
  const before = snapshot();
  const from = el.getBoundingClientRect().height;
  stageSizing?.cancel();
  await nextTick();
  if (closing.value || !el.isConnected) return;
  // 新的台面高度（收起时那一叠已经脱离排版，见 HandTable.css）；先按住旧高度再量牌位，牌从旧样子滑过去的同时台面一起长 / 收。
  const to = el.getBoundingClientRect().height;
  stageSizing = Math.abs(to - from) < 1 ? null : el.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: BENCH_MS, easing: OPEN_EASE });
  flip(before, new Set(), null);
}, { flush: 'pre' });
const tapMain = (card: HandCard) => { if (!swallowClick() && props.showBench) void move(drawOut(hand.value, card.id), card.id); };
const tapBench = (card: HandCard) => { if (!swallowClick()) void move(swapIn(hand.value, card.id), card.id); };

/* ---------- 拖：主牌拖到候补那叠上、候补拖到某张主牌上 ---------- */
const benchEl = ref<HTMLElement | null>(null);
/** 落点：候补那一叠（`bench`），或要被换下的那张主牌的 id（主牌抽空了就是 `hand`）。只有它亮。 */
const target = ref<string | null>(null);
const DRAG_START = 6;
let drag: { card: HandCard; el: HTMLElement; from: 'hand' | 'bench'; x: number; y: number; dx: number; dy: number; live: boolean; id: number } | null = null;
let dragged = false;
/** 刚拖完松手时浏览器还会补一个 click：吞掉它，免得拖完又当成点了一下。 */
const swallowClick = () => { if (!dragged) return false; dragged = false; return true; };
const landingOf = (from: 'hand' | 'bench', x: number, y: number, self: string): string | null => {
  const bench = benchEl.value?.getBoundingClientRect();
  if (!bench) return null;
  if (from === 'hand') return x > bench.left - 16 && y > bench.top - 24 && y < bench.bottom + 24 ? 'bench' : null;
  if (x > bench.left - 24) return null;
  // 候补往左拖进牌桌：落在离指针最近的那张主牌上（和它对换）；主牌抽空了就落进空桌。
  let best: string | null = null;
  let distance = Infinity;
  for (const el of stage.value?.querySelectorAll<HTMLElement>('.hand-row .pcard') ?? []) {
    const id = el.dataset.cardId ?? '';
    if (id === self) continue;
    const r = el.getBoundingClientRect();
    const d = Math.abs(r.left + r.width / 2 - x) + Math.max(0, Math.abs(r.top + r.height / 2 - y) - r.height / 2);
    if (d < distance) { distance = d; best = id; }
  }
  return best ?? (hand.value.cards.length ? null : 'hand');
};
const place = (el: HTMLElement, dx: number, dy: number) => {
  const tilt = Math.max(-8, Math.min(8, dx * 0.04));
  el.style.translate = `${dx.toFixed(1)}px ${dy.toFixed(1)}px`;
  el.style.rotate = `${tilt.toFixed(2)}deg`;
  el.style.scale = '1.06';
};
const unplace = (el: HTMLElement) => { el.style.translate = ''; el.style.rotate = ''; el.style.scale = ''; el.classList.remove('is-dragging'); };
const onCardDown = (event: PointerEvent, card: HandCard, from: 'hand' | 'bench') => {
  if (closing.value || event.button !== 0 || !props.showBench) return;
  const el = event.currentTarget as HTMLElement;
  drag = { card, el, from, x: event.clientX, y: event.clientY, dx: 0, dy: 0, live: false, id: event.pointerId };
  window.addEventListener('pointermove', onCardMove);
  window.addEventListener('pointerup', onCardUp);
  window.addEventListener('pointercancel', onCardCancel);
};
const onCardMove = (event: PointerEvent) => {
  if (!drag || event.pointerId !== drag.id) return;
  drag.dx = event.clientX - drag.x;
  drag.dy = event.clientY - drag.y;
  if (!drag.live) {
    if (Math.hypot(drag.dx, drag.dy) < DRAG_START) return;
    drag.live = true;
    // 从此刻的样子起：手里接过来的牌先停下身上的动画（扇开、换位），再跟手。
    for (const animation of drag.el.getAnimations()) { animation.commitStyles?.(); animation.cancel(); }
    drag.el.style.transform = '';
    drag.el.classList.add('is-dragging');
  }
  place(drag.el, drag.dx, drag.dy);
  target.value = landingOf(drag.from, event.clientX, event.clientY, drag.card.id);
};
const stopListening = () => {
  window.removeEventListener('pointermove', onCardMove);
  window.removeEventListener('pointerup', onCardUp);
  window.removeEventListener('pointercancel', onCardCancel);
};
/** 没拖到位：从手指那里弹回原处（弹簧略过头一点再落定）。 */
const springBack = (el: HTMLElement, dx: number, dy: number) => {
  const tilt = Math.max(-8, Math.min(8, dx * 0.04));
  unplace(el);
  if (reducedMotion()) return;
  el.animate([
    { translate: `${dx}px ${dy}px`, rotate: `${tilt}deg`, scale: '1.06' },
    { translate: `${(-dx * 0.06).toFixed(1)}px ${(-dy * 0.06).toFixed(1)}px`, rotate: `${(-tilt * 0.2).toFixed(2)}deg`, scale: '1', offset: 0.7 },
    { translate: '0px 0px', rotate: '0deg', scale: '1' },
  ], { duration: paced(420), easing: 'cubic-bezier(.2, .9, .3, 1)' });
};
const onCardUp = (event: PointerEvent) => {
  const current = drag;
  if (!current || event.pointerId !== current.id) return;
  stopListening();
  drag = null;
  const hit = target.value;
  target.value = null;
  if (!current.live) return;
  dragged = true;
  window.setTimeout(() => { dragged = false; }, 0);
  if (hit) {
    const out = hit === 'bench' || hit === 'hand' ? null : hit;
    const next = current.from === 'hand' ? drawOut(hand.value, current.card.id) : swapIn(hand.value, current.card.id, out);
    void move(next, current.card.id, () => unplace(current.el));
  } else springBack(current.el, current.dx, current.dy);
};
const onCardCancel = () => {
  const current = drag;
  stopListening();
  drag = null;
  target.value = null;
  if (current?.live) springBack(current.el, current.dx, current.dy);
};

/* ---------- 收牌：理成一叠，整叠放回来处 ---------- */
const fadeChrome = (to: number, duration: number) => [benchHead.value, foot.value]
  .filter((el): el is HTMLElement => !!el)
  .map((el) => animateFromNow(el, { opacity: to }, { duration, easing: to ? OPEN_EASE : CLOSE_EASE, fill: 'forwards' }, ['opacity']));
/** `quiet`：落定时不亮那一圈（来处紧接着还要飞走，比如今日一问缩成胶囊：留下的光圈会悬在原地）。 */
const close = async (used = false, quiet = false) => {
  if (closing.value) return;
  onCardCancel();
  const id = seq.handoff();
  closing.value = true;
  const cards = allCards();
  const receiver = receive(props.anchor);
  const fades = fadeChrome(0, reducedMotion() ? 160 : stackAndReturnMs(cards.length));
  await stackCards(cards, stageCenter());
  if (!seq.live(id)) { receiver.cancel(); return; }
  const landing = anchorLanding();
  emit('returning');
  if (landing && props.anchor instanceof HTMLElement) fadeSourceIn(props.anchor, sourceInFrames(0.6, 0.95), { duration: CARD_RETURN_MS, easing: 'linear' });
  await Promise.all([returnStack(cards, landing), ...fades.map((a) => a.finished.catch(() => undefined))]);
  if (!seq.live(id)) { receiver.cancel(); return; }
  releaseAnchor();
  if (quiet) receiver.cancel();
  else receiver.land('var(--accent)');
  emit('close', used);
  returnFocus?.focus({ preventScroll: true });
};

/* ---------- 生命周期 ---------- */
let releaseEscape: (() => void) | null = null;
let resize: ResizeObserver | null = null;
const measure = () => {
  const el = stage.value;
  if (el) stageBox.value = { width: el.clientWidth - 16 };
};
onMounted(() => {
  returnFocus = document.activeElement as HTMLElement | null;
  releaseEscape = onMotionEscape(() => { void close(); return true; });
  measure();
  resize = new ResizeObserver(measure);
  if (stage.value) resize.observe(stage.value);
  foot.value?.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 360, delay: 160, easing: OPEN_EASE, fill: 'backwards' });
  void deal(seq.next());
});
onBeforeUnmount(() => {
  releaseAnchor();
  releaseEscape?.();
  resize?.disconnect();
  stopListening();
});
defineExpose({ close: (options: { quiet?: boolean } = {}) => close(false, !!options.quiet), isClosing: () => closing.value });
</script>

<template>
  <div :class="['hand-table', { closing, swapping: showBench }]" role="group" :aria-label="title">
    <div ref="stage" :class="['hand-stage', { 'drop-bench': target === 'bench' }]">
      <div class="hand-row" :style="{ '--card-w': `${mainW}px` }">
        <span v-for="(card, i) in hand.cards" :key="card.id" :class="['hslot', { 'is-target': target === card.id, 'is-fresh': fresh === card.id }]" :style="fanStyle(i)">
          <PlayingCard kind="day" :data-card-id="card.id" :top="face(card).top" :title="face(card).title" :value="face(card).value" :note="face(card).aside"
            :sketch="face(card).sketch" :icon="face(card).icon" :tint="face(card).tint" :corner="card.date.slice(8).replace(/^0/, '')"
            :aria-label="showBench ? t.drawOutAria(face(card).label) : face(card).label" @pointerdown="onCardDown($event, card, 'hand')" @click="tapMain(card)" />
        </span>
        <p v-if="!hand.cards.length" :class="['hand-empty', { 'is-target': target === 'hand' }]">{{ t.handEmpty }}</p>
      </div>
      <Transition name="bench-pile">
        <section v-if="showBench" ref="benchEl" class="bench" :aria-label="t.bench" @pointerleave="leaveBench">
          <div class="bench-row" :style="{ '--card-w': `${BENCH_W}px`, '--step': `${benchStep}px` }">
            <span v-for="(card, i) in hand.bench" :key="card.id" :class="['hslot', { 'is-fresh': fresh === card.id }]" :style="{ '--z': hand.bench.length - i }">
              <PlayingCard kind="day" :data-card-id="card.id" :top="face(card).top" :title="face(card).title" :value="face(card).value" :note="face(card).aside"
                :icon="face(card).icon" :tint="face(card).tint" :aria-label="t.swapInAria(face(card).label)" @pointerdown="onCardDown($event, card, 'bench')" @click="tapBench(card)" />
            </span>
            <p v-if="!hand.bench.length" class="bench-empty">{{ t.benchEmpty }}</p>
          </div>
          <span ref="benchHead" class="bench-label">{{ t.bench }}<b v-if="hand.bench.length">{{ hand.bench.length }}</b></span>
        </section>
      </Transition>
    </div>
    <footer ref="foot" class="hand-foot">
      <slot name="foot" :hand="hand" />
    </footer>
  </div>
</template>

<style scoped src="./HandTable.css"></style>
