<script setup lang="ts">
/**
 * 发牌桌（「建议 → 发牌 → 交给 AI」）：按一个问题挑好的一手牌，从来处抽出来扇开；底下一排小牌是候补。
 *
 * 牌桌只做预览和替换，不再让人一张张挑：
 * - 点主牌里的一张 → 它沿一道弧线落进候补最前面；点候补里的一张 → 它换进这手牌（按日期插回去）。
 *   两种都是「从此刻的样子起」的 FLIP，只动 transform，约 500ms；连着点也是从此刻接着走，不跳。
 * - 每次换牌都马上告诉外面（`change`），交给 AI 的任务包跟着这手牌变。
 * - 收牌（×、点空白、Esc、「就用这手牌」）：和挑日子的牌桌同一套——先理成一叠，再整叠放回来处，背景同起同止淡掉；
 *   发牌途中按 Esc 也是从此刻理牌放回，不会半路消失。
 * 减少动效时一律淡入淡出（lib/motion/cards）。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import Icon from '../Icon.vue';
import PlayingCard from './PlayingCard.vue';
import { useHandsText } from './hands.i18n';
import { useCardsText } from './cards.i18n';
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
  subtitle?: string | null;
  lines?: Record<string, HandLines>;
  origin?: DOMRect | null;
  anchor?: Element | null;
}>(), { subtitle: null, lines: () => ({}), origin: null, anchor: null });
const emit = defineEmits<{ change: [hand: Hand]; close: [] }>();
const t = useHandsText();
const tc = useCardsText();
const titleId = `hand-table-${Math.random().toString(36).slice(2, 8)}`;
/** 换牌：一张牌从主牌飞进候补（或反过来）的时长，≈500ms。 */
const MOVE_MS = paced(380);
const GAP = 16;

const hand = shallowRef<Hand>(props.hand);
const stage = ref<HTMLElement | null>(null);
const backdrop = ref<HTMLElement | null>(null);
const head = ref<HTMLElement | null>(null);
const foot = ref<HTMLElement | null>(null);
const benchHead = ref<HTMLElement | null>(null);
const stageBox = ref({ width: 1000, height: 560 });
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
  const { width, height } = stageBox.value;
  const fit = (width - GAP * (n - 1)) / n;
  return Math.max(84, Math.floor(Math.min(196, fit, height * 0.5 * (5 / 7))));
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
const move = async (next: Hand, moved: string) => {
  if (closing.value) return;
  const before = new Map(allCards().map((el) => [el.dataset.cardId ?? '', el.getBoundingClientRect()]));
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
const tapMain = (card: HandCard) => void move(drawOut(hand.value, card.id), card.id);
const tapBench = (card: HandCard) => void move(swapIn(hand.value, card.id), card.id);

/* ---------- 收牌：理成一叠，整叠放回来处 ---------- */
const fadeChrome = (to: number, duration: number) => [backdrop.value, head.value, benchHead.value, foot.value]
  .filter((el): el is HTMLElement => !!el)
  .map((el) => animateFromNow(el, { opacity: to }, { duration, easing: to ? OPEN_EASE : CLOSE_EASE, fill: 'forwards' }, ['opacity']));
const close = async () => {
  if (closing.value) return;
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
  emit('close');
  returnFocus?.focus({ preventScroll: true });
};
const onBlank = () => void close();

/* ---------- 生命周期 ---------- */
let releaseEscape: (() => void) | null = null;
let resize: ResizeObserver | null = null;
const measure = () => {
  const el = stage.value;
  if (el) stageBox.value = { width: el.clientWidth - 24, height: el.clientHeight - 24 };
};
onMounted(() => {
  returnFocus = document.activeElement as HTMLElement | null;
  releaseEscape = onMotionEscape(() => { void close(); return true; });
  measure();
  resize = new ResizeObserver(measure);
  if (stage.value) resize.observe(stage.value);
  backdrop.value?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reducedMotion() ? 140 : 420, easing: OPEN_EASE, fill: 'backwards' });
  [head.value, benchHead.value, foot.value].forEach((el, i) => el?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 360, delay: 60 + i * 80, easing: OPEN_EASE, fill: 'backwards' }));
  void deal(seq.next());
});
onBeforeUnmount(() => {
  releaseAnchor();
  releaseEscape?.();
  resize?.disconnect();
});
defineExpose({ close, isClosing: () => closing.value });
</script>

<template>
  <Teleport to="body">
    <div :class="['hand-table', { closing }]" role="dialog" aria-modal="true" :aria-labelledby="titleId" :aria-describedby="`${titleId}-tip`">
      <div ref="backdrop" class="hand-backdrop" aria-hidden="true" @click="onBlank"></div>
      <header ref="head" class="hand-head">
        <span class="hand-mark" aria-hidden="true"><Icon name="cards" :size="18" /></span>
        <div class="hand-titles">
          <h2 :id="titleId">{{ title }}</h2>
          <p>{{ subtitle ? `${subtitle} · ` : '' }}{{ t.cardCount(hand.cards.length) }}</p>
        </div>
        <button type="button" class="hand-icon" :aria-label="tc.close" @click="close"><Icon name="x" :size="17" /></button>
      </header>
      <div ref="stage" class="hand-stage" @click.self="onBlank">
        <div class="hand-row" :style="{ '--card-w': `${mainW}px` }" @click.self="onBlank">
          <span v-for="(card, i) in hand.cards" :key="card.id" class="hslot" :style="fanStyle(i)">
            <PlayingCard kind="day" :data-card-id="card.id" :top="face(card).top" :title="face(card).title" :value="face(card).value" :note="face(card).aside"
              :sketch="face(card).sketch" :icon="face(card).icon" :tint="face(card).tint" :corner="card.date.slice(8).replace(/^0/, '')"
              :aria-label="t.drawOutAria(face(card).label)" @click="tapMain(card)" />
          </span>
          <p v-if="!hand.cards.length" class="hand-empty">{{ t.handEmpty }}</p>
        </div>
        <section class="bench" :aria-label="t.bench">
          <h3 ref="benchHead">{{ t.bench }}</h3>
          <div class="bench-row" :style="{ '--card-w': `${benchW}px` }">
            <span v-for="card in hand.bench" :key="card.id" class="hslot">
              <PlayingCard kind="day" :data-card-id="card.id" :top="face(card).top" :title="face(card).title" :value="face(card).value" :note="face(card).aside"
                :icon="face(card).icon" :tint="face(card).tint" :aria-label="t.swapInAria(face(card).label)" @click="tapBench(card)" />
            </span>
            <p v-if="!hand.bench.length" class="bench-empty">{{ t.benchEmpty }}</p>
          </div>
        </section>
      </div>
      <footer ref="foot" class="hand-foot">
        <p :id="`${titleId}-tip`">{{ t.tableTip }}</p>
        <button type="button" class="hand-use" :disabled="!hand.cards.length" @click="close"><Icon name="check" :size="16" /><span>{{ t.useHand }}</span></button>
      </footer>
    </div>
  </Teleport>
</template>

<style scoped src="./HandTable.css"></style>
