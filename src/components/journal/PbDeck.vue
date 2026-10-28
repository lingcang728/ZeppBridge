<script setup lang="ts">
/**
 * PB 墙的一格：这个距离最快的三次叠成一叠牌（用户 2026-10-28：以前的「叠卡」点开第二、三次以后点不回去；
 * 叠在一起的牌就该像更新信的信纸一样能甩）。
 *
 * 每张都是完整的大字卡：距离、成绩、配速 · 日期、怎么算出来的，右上角一枚奖牌（1 金 2 银 3 铜）。
 * 后面的牌错开一点、转一点角，露出牌边。拖着顶牌横着甩（门槛同信纸，见 lib/journal/pbDeck.ts）：
 * 往左甩 = 顶牌抽出去落到最底；往右甩 = 最底那张从右边抽出来盖上来。路径是信纸那条不停的圈（lib/letters/turn.ts），
 * 往右时镜像。半路再甩，从此刻的样子接着走。减少动态效果时直接换，不飞。
 * 点顶牌（没拖过）去那次运动，卡↔页形变从顶牌出发；拖完浏览器补发的那下 click 吞掉。键盘 ← / → 换牌、Enter 打开。
 * 只动 transform（层次靠 WAAPI 的 z-index 离散关键帧在抽到最远处换）。
 */
import { computed, nextTick, ref, type ComponentPublicInstance } from 'vue';
import { RouterLink } from 'vue-router';
import { useJournalText } from './journal.i18n';
import { useRepairText } from './repair.i18n';
import { clockText } from '../../lib/logbook/clock';
import { journalShortDay } from '../../lib/logbook/display';
import { lessMotion } from '../../lib/motion/lessMotion';
import { paced } from '../../lib/motion/timing';
import { poseTransform, turnKeyframes, type Pose } from '../../lib/letters/turn';
import { deckDepth, deckMover, deckNext, deckPose, dragOffset, dragPose, isHorizontalDrag, poseFromMatrix, releaseSide } from '../../lib/journal/pbDeck';
import type { Effort, RecordRow } from '../../types/logbook';

const props = defineProps<{ row: RecordRow }>();

const t = useJournalText();
const repair = useRepairText();
const TURN_MS = paced(720);

const cards = computed<Effort[]>(() => (props.row.best ? [props.row.best, ...props.row.runners_up].slice(0, 3) : []));
const count = computed(() => cards.value.length);
const swipeable = computed(() => count.value > 1);
const top = ref(0);
const els: HTMLElement[] = [];
const setEl = (i: number) => (el: Element | ComponentPublicInstance | null) => {
  const node = el && '$el' in el ? (el.$el as HTMLElement) : (el as HTMLElement | null);
  if (node) els[i] = node;
};

const pace = (effort: Effort) => t.value.pace(clockText(effort.seconds / (props.row.distance_m / 1000)));
const how = (effort: Effort) => (effort.method === 'race' && effort.race_name ? effort.race_name : t.value.methods[effort.method]);
const label = (i: number) => repair.value.pbCard(t.value.distances[props.row.key], i + 1, count.value, clockText(cards.value[i]!.seconds));

/* ---------- 换牌 ---------- */

/** 正在飞的牌、各自那段动画和往哪边飞：半路再甩同一张时，先读它此刻的样子，在它出去的那一边原路回来。 */
const flights = new Map<number, { animation: Animation; side: -1 | 1 }>();
const moving = ref(new Set<number>());
const setMoving = (i: number, on: boolean) => {
  const next = new Set(moving.value);
  if (on) next.add(i);
  else next.delete(i);
  moving.value = next;
};
const land = (i: number) => {
  flights.get(i)?.animation.cancel();
  flights.delete(i);
  setMoving(i, false);
};

const swipe = (side: -1 | 1) => {
  if (!swipeable.value) return;
  const n = count.value;
  const mover = deckMover(top.value, n, side);
  const el = els[mover];
  // 此刻的样子（拖着的、正在飞的、正在摆正的都算）：先读，再取消旧动画，新动画首帧就是它。
  const style = el ? getComputedStyle(el) : null;
  const start: Pose = poseFromMatrix(style?.transform ?? 'none');
  const fromZ = style?.zIndex && style.zIndex !== 'auto' ? style.zIndex : String(n - deckDepth(mover, top.value, n));
  // 它正飞在一边（刚往左甩落底、马上又往右甩，动的还是这张）：不穿过整叠飞到另一边，就在这一边掉头回来。
  const path = flights.get(mover)?.side ?? side;
  land(mover);
  top.value = deckNext(top.value, n, side);
  if (!el || lessMotion()) return;
  const end = deckPose(mover, top.value, n);
  const toZ = side < 0 ? '0' : String(n + 2);
  const flight = el.animate(turnKeyframes(start, end, el.offsetWidth, el.offsetHeight, fromZ, toZ, path), { duration: TURN_MS });
  flights.set(mover, { animation: flight, side: path });
  setMoving(mover, true);
  void flight.finished.then(() => { if (flights.get(mover)?.animation === flight) { flights.delete(mover); setMoving(mover, false); } }, () => undefined);
};

/* ---------- 手势（门槛同信纸 LetterPad.vue） ---------- */

const drag = ref(0);
const dragging = ref(false);
const dragBase = ref<Pose | undefined>();
let dragWidth = 220;
let start: { x: number; y: number; id: number; t: number } | null = null;
let horizontal = false;
let swallowClick = false;

const down = (event: PointerEvent) => {
  if (event.button !== 0 || !swipeable.value) return;
  start = { x: event.clientX, y: event.clientY, id: event.pointerId, t: performance.now() };
  horizontal = false;
};
const move = (event: PointerEvent) => {
  if (!start || event.pointerId !== start.id) return;
  const dx = event.clientX - start.x;
  if (!horizontal && isHorizontalDrag(dx, event.clientY - start.y)) {
    horizontal = true;
    dragging.value = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    // 顶牌还在飞（刚盖上来）：从它此刻的样子起拖，不跳回原位。
    const el = els[top.value];
    dragWidth = el?.offsetWidth || dragWidth;
    dragBase.value = el && flights.has(top.value) ? poseFromMatrix(getComputedStyle(el).transform) : undefined;
    land(top.value);
  }
  if (horizontal) drag.value = dragOffset(dx);
};
const up = (event: PointerEvent) => {
  if (horizontal && start) {
    const dx = event.clientX - start.x;
    const side = releaseSide(dx, dx / Math.max(1, performance.now() - start.t));
    if (side) swipe(side);
    swallowClick = true;
    window.setTimeout(() => { swallowClick = false; }, 0);
  }
  start = null;
  horizontal = false;
  dragging.value = false;
  drag.value = 0;
  dragBase.value = undefined;
};
/* 拖过以后浏览器还会补发一下 click：吞掉，别进详情页。 */
const click = (event: MouseEvent) => {
  if (!swallowClick) return;
  swallowClick = false;
  event.preventDefault();
  event.stopPropagation();
};

const key = async (event: KeyboardEvent) => {
  if (!swipeable.value || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
  event.preventDefault();
  swipe(event.key === 'ArrowLeft' ? -1 : 1);
  // 顶牌换了，焦点跟到新的顶牌上（旧的那张已经 inert）。
  await nextTick();
  els[top.value]?.focus({ preventScroll: true });
};

/* ---------- 每张的摆法 ---------- */

const cardStyle = (i: number) => {
  const n = count.value;
  const d = deckDepth(i, top.value, n);
  const held = d === 0 && dragging.value;
  const pose = held ? dragPose(drag.value, dragWidth, dragBase.value) : deckPose(i, top.value, n);
  const style: Record<string, string> = { zIndex: String(n - d), transform: poseTransform(pose) };
  if (held || moving.value.has(i) || lessMotion()) style.transition = 'none';
  return style;
};
</script>

<template>
  <div :class="['pb-deck', { swipeable, dragging, lifted: dragging || moving.size > 0 }]"
    @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @click.capture="click" @keydown="key" @dragstart.prevent>
    <template v-if="count">
      <component :is="effort.workout_id ? RouterLink : 'div'" v-for="(effort, i) in cards" :key="i" :ref="setEl(i)"
        :to="effort.workout_id ? `/workouts/${effort.workout_id}` : undefined"
        :class="['pb-card', { top: i === top, link: !!effort.workout_id }]" :style="cardStyle(i)"
        :data-morph-card="i === top && effort.workout_id ? '' : undefined"
        :tabindex="i === top && !effort.workout_id && swipeable ? 0 : undefined" draggable="false"
        :inert="i !== top || undefined" :aria-hidden="i !== top || undefined" :aria-label="label(i)">
        <span :class="['pb-medal', `rank-${i + 1}`]" aria-hidden="true">{{ i + 1 }}</span>
        <span class="pb-dist">{{ t.distances[row.key] }}</span>
        <span class="pb-time">{{ clockText(effort.seconds) }}</span>
        <span class="pb-meta">{{ pace(effort) }} · {{ journalShortDay(effort.date) }}</span>
        <span class="pb-how">{{ how(effort) }}</span>
      </component>
    </template>
    <div v-else class="pb-card none">
      <span class="pb-dist">{{ t.distances[row.key] }}</span>
      <span class="pb-time muted">{{ t.noRecord }}</span>
    </div>
  </div>
</template>

<style scoped>
/* 牌都摞在同一个格子里（grid-area 1 / 1），一叠的高度 = 最高那张；底边和两侧给后面的牌边留出位置——
   没有后面的牌也留，四格才对得齐。整叠自成一层：飞出去的牌盖得住旁边那格，旁边那格的牌也不会穿过来。 */
.pb-deck { position: relative; z-index: 1; display: grid; height: 100%; box-sizing: border-box; padding: 0 6px 14px; touch-action: pan-y; }
.pb-deck.lifted { z-index: 2; }
.pb-deck.swipeable { cursor: grab; user-select: none; }
.pb-deck.dragging { cursor: grabbing; }
.pb-card { grid-area: 1 / 1; position: relative; display: grid; align-content: start; gap: 8px; min-width: 0; min-height: 148px; box-sizing: border-box;
  padding: 20px 16px; border-radius: 16px; background: var(--mat-inset); box-shadow: var(--cap-track-shadow), 0 1px 3px rgb(0 0 0 / .16);
  color: inherit; text-decoration: none; transform-origin: 50% 60%; will-change: transform;
  transition: transform 700ms cubic-bezier(.3, .7, .25, 1), background 160ms ease; }
.swipeable .pb-card { cursor: inherit; }
/* 后面的牌：一层淡淡的影子，翻上来时退掉。 */
.pb-card:not(.top)::after { content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; background: rgb(0 0 0 / .06); }
.pb-card.top.link:hover { background: color-mix(in srgb, var(--ink) 4%, var(--mat-inset)); }
.pb-card.top.link:hover .pb-time { color: var(--accent); }
.pb-card:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.dragging .pb-card.top { box-shadow: var(--cap-track-shadow), 0 16px 28px -14px rgb(0 0 0 / .5), 0 3px 8px rgb(0 0 0 / .14); }
.pb-card.none { outline: 1px dashed var(--mat-line); box-shadow: none; }

/* 奖牌：圆章 + 名次，颜色是 token（深浅各一套）。 */
.pb-medal { position: absolute; top: 14px; right: 14px; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%;
  --medal: var(--medal-gold);
  background: radial-gradient(circle at 35% 30%, color-mix(in srgb, white 45%, var(--medal)), var(--medal) 60%, color-mix(in srgb, black 18%, var(--medal)));
  box-shadow: inset 0 0 0 1.5px color-mix(in srgb, black 14%, var(--medal)), 0 1px 2px rgb(0 0 0 / .25);
  color: color-mix(in srgb, black 62%, var(--medal)); font-size: var(--fs-2xs); font-weight: 750; font-variant-numeric: tabular-nums; }
.pb-medal.rank-2 { --medal: var(--medal-silver); }
.pb-medal.rank-3 { --medal: var(--medal-bronze); }

.pb-dist { padding-right: 30px; color: var(--muted); font-size: var(--fs-xs); font-weight: 650; }
.pb-time { color: var(--ink); font-family: var(--font-mono); font-size: clamp(30px, 2.2vw, 34px); line-height: 1.15; font-variant-numeric: tabular-nums; }
.pb-time.muted { color: var(--subtle); font-family: inherit; font-size: var(--fs-md); }
.pb-meta { white-space: nowrap; color: var(--muted); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
.pb-how { justify-self: start; padding: 2px 8px; border-radius: 99px; background: var(--mat-card); color: var(--subtle); font-size: var(--fs-2xs); overflow-wrap: anywhere; }
@media (prefers-reduced-motion: reduce) { .pb-card { transition: none; } }
</style>
