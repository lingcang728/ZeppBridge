<script setup lang="ts">
/**
 * 发牌桌（「建议 → 发牌 → 交给 AI」）：首页「今日一问」卡里原地展开的一块。按一个问题挑好的一手牌从卡面那叠小牌里
 * 抽出来排开；按「换几张牌」（`showBench`）才露出底下一排候补小牌。
 *
 * 牌桌只做预览和替换，不再让人一张张挑（候补收着时牌不能抽，免得点一下牌就不见了）：
 * - 拖：按住主牌里的一张往下拖进候补就是抽掉；按住候补里的一张往上拖进这手牌就是换上。牌跟着手走、微微歪向拖的方向，
 *   拖到位时那一排亮起来；松手没到位就弹回原处。点一下也照旧：点主牌抽到候补，点候补换进来。
 *   换位都是「从此刻的样子起」的 FLIP（拖着松手就从手指那里起），只动 transform，约 500ms。
 * - 每次换牌都马上告诉外面（`change`），交给 AI 的任务包跟着这手牌变。
 * - 收牌（卡面再点一下、Esc）：先理成一叠，再整叠放回卡面那叠小牌，底下按钮一起淡掉；`close` 带上是不是用了这手牌。
 *   发牌途中按 Esc 也是从此刻理牌放回，不会半路消失。底下那一排按钮由外面放（`foot` 插槽）。
 * 减少动效时一律淡入淡出（lib/motion/cards）。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import FoldTransition from '../FoldTransition.vue';
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
const emit = defineEmits<{ change: [hand: Hand]; close: [used: boolean] }>();
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
const mainW = computed(() => {
  const n = Math.max(1, hand.value.cards.length);
  const fit = (stageBox.value.width - GAP * (n - 1)) / n;
  return Math.max(72, Math.floor(Math.min(140, fit)));
});
const benchW = computed(() => {
  const n = Math.max(1, hand.value.bench.length);
  const fit = (stageBox.value.width - 10 * (n - 1)) / n;
  return Math.max(64, Math.floor(Math.min(112, mainW.value * 0.6, fit)));
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
const move = async (next: Hand, moved: string, release?: () => void) => {
  if (closing.value) { release?.(); return; }
  const before = new Map(allCards().map((el) => [el.dataset.cardId ?? '', el.getBoundingClientRect()]));
  release?.();
  const wasBench = new Set(hand.value.bench.map((card) => card.id));
  hand.value = next;
  emit('change', next);
  await nextTick();
  if (reducedMotion()) return;
  const nowBench = new Set(next.bench.map((card) => card.id));
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
    const crossed = wasBench.has(id) !== nowBench.has(id);
    const lift = Math.min(80, 24 + Math.hypot(dx, dy) * 0.12);
    const frames: Keyframe[] = crossed
      ? [{ transform: start }, { transform: `translate(${(dx / 2).toFixed(1)}px, ${(dy / 2 - lift).toFixed(1)}px) scale(${((s + 1) / 2).toFixed(3)}) rotate(${id === moved ? -4 : 0}deg)`, offset: 0.5 }, { transform: 'none' }]
      : [{ transform: start }, { transform: 'none' }];
    seq.track(el.animate(frames, { duration: MOVE_MS, easing: crossed ? 'cubic-bezier(.35, .1, .25, 1)' : OPEN_EASE }));
  }
  if (moved) stage.value?.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(moved)}"]`)?.focus({ preventScroll: true });
};
const tapMain = (card: HandCard) => { if (!swallowClick() && props.showBench) void move(drawOut(hand.value, card.id), card.id); };
const tapBench = (card: HandCard) => { if (!swallowClick()) void move(swapIn(hand.value, card.id), card.id); };

/* ---------- 拖：主牌往下拖进候补、候补往上拖进这手牌 ---------- */
const benchEl = ref<HTMLElement | null>(null);
/** 拖到位了：主牌越过候补那道线、候补越过它那一排的上沿。 */
const target = ref<'bench' | 'hand' | null>(null);
const DRAG_START = 6;
let drag: { card: HandCard; el: HTMLElement; from: 'hand' | 'bench'; x: number; y: number; dx: number; dy: number; live: boolean; id: number } | null = null;
let dragged = false;
/** 刚拖完松手时浏览器还会补一个 click：吞掉它，免得拖完又当成点了一下。 */
const swallowClick = () => { if (!dragged) return false; dragged = false; return true; };
const arrived = (from: 'hand' | 'bench', y: number) => {
  if (from === 'hand') {
    const line = benchEl.value?.getBoundingClientRect().top;
    return line !== undefined && y > line - 12;
  }
  const line = benchEl.value?.getBoundingClientRect().top;
  return line !== undefined && y < line - 24;
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
  target.value = arrived(drag.from, event.clientY) ? (drag.from === 'hand' ? 'bench' : 'hand') : null;
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
    const next = current.from === 'hand' ? drawOut(hand.value, current.card.id) : swapIn(hand.value, current.card.id);
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
const close = async (used = false) => {
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
  if (landing && props.anchor instanceof HTMLElement) fadeSourceIn(props.anchor, sourceInFrames(0.6, 0.95), { duration: CARD_RETURN_MS, easing: 'linear' });
  await Promise.all([returnStack(cards, landing), ...fades.map((a) => a.finished.catch(() => undefined))]);
  if (!seq.live(id)) { receiver.cancel(); return; }
  releaseAnchor();
  receiver.land('var(--accent)');
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
defineExpose({ close: () => close(false), isClosing: () => closing.value });
</script>

<template>
  <div :class="['hand-table', { closing, swapping: showBench }]" role="group" :aria-label="title">
    <div ref="stage" :class="['hand-stage', target && `drop-${target}`]">
      <div class="hand-row" :style="{ '--card-w': `${mainW}px` }">
        <span v-for="(card, i) in hand.cards" :key="card.id" class="hslot" :style="fanStyle(i)">
          <PlayingCard kind="day" :data-card-id="card.id" :top="face(card).top" :title="face(card).title" :value="face(card).value" :note="face(card).aside"
            :sketch="face(card).sketch" :icon="face(card).icon" :tint="face(card).tint" :corner="card.date.slice(8).replace(/^0/, '')"
            :aria-label="showBench ? t.drawOutAria(face(card).label) : face(card).label" @pointerdown="onCardDown($event, card, 'hand')" @click="tapMain(card)" />
        </span>
        <p v-if="!hand.cards.length" class="hand-empty">{{ t.handEmpty }}</p>
      </div>
      <FoldTransition>
        <section v-if="showBench" ref="benchEl" class="bench" :aria-label="t.bench">
          <h3 ref="benchHead">{{ t.bench }}</h3>
          <div class="bench-row" :style="{ '--card-w': `${benchW}px` }">
            <span v-for="card in hand.bench" :key="card.id" class="hslot">
              <PlayingCard kind="day" :data-card-id="card.id" :top="face(card).top" :title="face(card).title" :value="face(card).value" :note="face(card).aside"
                :icon="face(card).icon" :tint="face(card).tint" :aria-label="t.swapInAria(face(card).label)" @pointerdown="onCardDown($event, card, 'bench')" @click="tapBench(card)" />
            </span>
            <p v-if="!hand.bench.length" class="bench-empty">{{ t.benchEmpty }}</p>
          </div>
        </section>
      </FoldTransition>
    </div>
    <footer ref="foot" class="hand-foot">
      <slot name="foot" :hand="hand" />
    </footer>
  </div>
</template>

<style scoped src="./HandTable.css"></style>
