<script setup lang="ts" generic="C extends { id: string; tone?: string }">
/* 设置卡组的总览：coverflow。
 *
 * 正中一张立着正对人，左右的卡侧转、叠在两边，越远越小越糊，舞台两端渐隐
 * 成背景——没有一条硬边告诉你「卡组到这儿为止」。
 *
 * 操作：左右拖（松手按速度吸附）、滚轮、←/→、点两侧的卡把它转到正中；
 * 点正中那张（或回车）打开。卡组首尾相接：停在哪一张，两边都有卡叠着。没有左右箭头按钮——
 * 拖就是翻。摆位全部由 lib/deck/coverflow.ts 的纯函数算，这里只管手势和一个连续下标。
 *
 * 侧卡没有硬边：外侧那一半按离正中的远近渐隐进背景（pose.dissolve），叠在两边的
 * 卡看上去是一片越来越淡的影子，而不是一条条卡边。 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useSpringIndex } from '../../composables/useSpringIndex';
import { coverflowPose, COVER_VISIBLE, pxPerCard } from '../../lib/deck/coverflow';
import { defineMessages, useMessages } from '../../i18n';

const t = useMessages(defineMessages(
  {
    label: '设置卡组，左右滑动挑一张',
    previous: '上一张',
    next: '下一张',
    open: (title: string) => `打开「${title}」`,
    position: (index: number, total: number) => `${index} / ${total}`,
  },
  {
    label: 'Settings cards — swipe sideways to pick one',
    previous: 'Previous card',
    next: 'Next card',
    open: (title: string) => `Open “${title}”`,
    position: (index: number, total: number) => `${index} / ${total}`,
  },
  {
    label: 'Tarjetas de configuración: desliza para elegir una',
    previous: 'Tarjeta anterior',
    next: 'Tarjeta siguiente',
    open: (title: string) => `Abrir «${title}»`,
    position: (index: number, total: number) => `${index} / ${total}`,
  },
  'components/deck/DeckCoverflow',
));

const props = defineProps<{
  cards: (C & { title: string })[];
  /** 停在正中的那张。 */
  modelValue: string | null;
  /** 卡组的宽度（px）。第一帧就按它摆，卡组从平铺形变回来时终点才准。 */
  initialWidth?: number;
}>();
const emit = defineEmits<{
  'update:modelValue': [id: string];
  open: [id: string];
}>();
defineSlots<{
  face(props: { card: C & { title: string }; centered: boolean }): unknown;
  quick?(props: { card: C & { title: string } }): unknown;
  actions?(): unknown;
}>();

const stage = ref<HTMLElement | null>(null);
const dragging = ref(false);
const widthFor = (stageWidth: number) => Math.round(Math.min(500, Math.max(260, stageWidth * 0.44)));
const cardWidth = ref(props.initialWidth ? widthFor(props.initialWidth) : 420);
const indexOf = (id: string | null) => Math.max(0, props.cards.findIndex((card) => card.id === id));

const n = () => Math.max(1, props.cards.length);
const wrap = (index: number) => ((index % n()) + n()) % n();
/** 第 index 张离当前位置差几格，取首尾相接后最近的那条路。 */
const offsetOf = (index: number) => {
  const d = index - pos.value;
  return d - n() * Math.round(d / n());
};

const { pos, animateTo, place, stop } = useSpringIndex({
  count: () => props.cards.length,
  wrap: true,
  initial: indexOf(props.modelValue),
  onSettle: (index) => {
    const card = props.cards[index];
    if (card && card.id !== props.modelValue) emit('update:modelValue', card.id);
  },
});

const centered = computed(() => wrap(Math.round(pos.value)));
/** 拖动或吸附途中：只有这时才给每张卡开合成层（常驻 will-change 会一直占着显存）。 */
const moving = computed(() => dragging.value || Math.abs(pos.value - Math.round(pos.value)) > 0.001);
/** 转到第 index 张，走最近的方向。 */
const turnTo = (index: number) => animateTo(pos.value + offsetOf(index));
const centerCard = computed(() => props.cards[centered.value]);

const poseStyle = (index: number) => {
  const d = offsetOf(index);
  const pose = coverflowPose(d, cardWidth.value);
  return {
    '--fade': String(pose.dissolve),
    transform: `translate3d(calc(-50% + ${pose.x}px), -50%, ${pose.z}px) rotateY(${pose.rotate}deg) scale(${pose.scale})`,
    opacity: pose.opacity,
    zIndex: pose.zIndex,
    pointerEvents: (Math.abs(offsetOf(index)) >= COVER_VISIBLE ? 'none' : 'auto') as 'none' | 'auto',
  };
};

/* —— 拖动 —— */
const INTERACTIVE = 'button:not(.cover-hit), a, input, select, textarea, [role="switch"], [role="slider"]';
let gesture: { id: number; x: number; startPos: number; lastX: number; time: number; v: number; moved: boolean; hit: number } | null = null;
const layoutScale = () => {
  const el = stage.value;
  return el && el.offsetWidth ? el.getBoundingClientRect().width / el.offsetWidth || 1 : 1;
};

const onDown = (event: PointerEvent) => {
  if (event.button !== 0 || !event.isPrimary || !stage.value) return;
  if ((event.target as Element).closest(INTERACTIVE)) return;
  const hitEl = (event.target as Element).closest<HTMLElement>('[data-cover-index]');
  stop();
  gesture = {
    id: event.pointerId, x: event.clientX, startPos: pos.value, lastX: event.clientX, time: event.timeStamp, v: 0, moved: false,
    hit: hitEl ? Number(hitEl.dataset.coverIndex) : -1,
  };
  // 拖卡组时不许顺带选中字（以前拖出舞台，页头那两行说明会被刷成一片蓝）。阻止了默认行为，
  // 焦点得自己给——键盘 ←/→ 仍然跟着这个卡组走。
  event.preventDefault();
  stage.value.focus({ preventScroll: true });
  stage.value.setPointerCapture(event.pointerId);
};
const onMove = (event: PointerEvent) => {
  const g = gesture;
  if (!g || g.id !== event.pointerId) return;
  const dx = (event.clientX - g.x) / layoutScale();
  if (!g.moved && Math.abs(dx) < 5) return;
  g.moved = true;
  dragging.value = true;
  const dt = Math.max(1, event.timeStamp - g.time);
  g.v = ((event.clientX - g.lastX) / layoutScale()) / dt;
  g.lastX = event.clientX;
  g.time = event.timeStamp;
  pendingPos = g.startPos - dx / pxPerCard(cardWidth.value);
  // 指针事件比刷新率密（高回报率鼠标 500–1000Hz），合并到每帧一次。
  if (!moveFrame) {
    moveFrame = requestAnimationFrame(() => {
      moveFrame = 0;
      if (pendingPos !== null && gesture) pos.value = pendingPos;
      pendingPos = null;
    });
  }
};
let moveFrame = 0;
let pendingPos: number | null = null;
const onUp = (event: PointerEvent) => {
  const g = gesture;
  if (!g || g.id !== event.pointerId) return;
  gesture = null;
  dragging.value = false;
  cancelAnimationFrame(moveFrame);
  moveFrame = 0;
  if (pendingPos !== null) pos.value = pendingPos;
  pendingPos = null;
  if (stage.value?.hasPointerCapture(event.pointerId)) stage.value.releasePointerCapture(event.pointerId);
  if (event.type !== 'pointerup') {
    animateTo(pos.value);
    return;
  }
  if (!g.moved) {
    if (g.hit < 0) { animateTo(pos.value); return; }
    if (g.hit === centered.value && Math.abs(offsetOf(g.hit)) < 0.3) {
      const card = props.cards[g.hit];
      if (card) emit('open', card.id);
      return;
    }
    turnTo(g.hit);
    return;
  }
  const per = pxPerCard(cardWidth.value);
  const flick = event.timeStamp - g.time < 90 ? g.v : 0;
  animateTo(pos.value - (flick * 150) / per, -(flick * 1000) / per * 0.35);
};

/* —— 滚轮：攒够一格走一张 —— */
let wheelAcc = 0;
let wheelIdle = 0;
const onWheel = (event: WheelEvent) => {
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  if (!delta) return;
  event.preventDefault();
  window.clearTimeout(wheelIdle);
  wheelIdle = window.setTimeout(() => { wheelAcc = 0; }, 180);
  wheelAcc += delta;
  if (Math.abs(wheelAcc) < 50) return;
  const steps = Math.sign(wheelAcc);
  wheelAcc = 0;
  animateTo(Math.round(pos.value) + steps);
};

const go = (direction: -1 | 1) => animateTo(Math.round(pos.value) + direction);
const onKeydown = (event: KeyboardEvent) => {
  if ((event.target as Element).closest(INTERACTIVE)) return;
  if (event.key === 'ArrowRight') { event.preventDefault(); go(1); }
  else if (event.key === 'ArrowLeft') { event.preventDefault(); go(-1); }
  else if (event.key === 'Home') { event.preventDefault(); turnTo(0); }
  else if (event.key === 'End') { event.preventDefault(); turnTo(props.cards.length - 1); }
  else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    if (centerCard.value) emit('open', centerCard.value.id);
  }
};

watch(() => props.modelValue, (id) => {
  if (gesture) return;
  const index = indexOf(id);
  if (index !== centered.value) turnTo(index);
});

let observer: ResizeObserver | null = null;
const measure = () => {
  cardWidth.value = widthFor(stage.value?.clientWidth ?? 900);
};
onMounted(() => {
  place(indexOf(props.modelValue));
  measure();
  observer = new ResizeObserver(measure);
  if (stage.value) {
    observer.observe(stage.value);
    stage.value.addEventListener('wheel', onWheel, { passive: false });
  }
});
onBeforeUnmount(() => {
  cancelAnimationFrame(moveFrame);
  observer?.disconnect();
  stage.value?.removeEventListener('wheel', onWheel);
  window.clearTimeout(wheelIdle);
});
</script>

<template>
  <div class="coverflow">
    <div
      ref="stage"
      :class="['cover-stage', { 'is-dragging': dragging, 'is-moving': moving }]"
      role="listbox"
      tabindex="0"
      :aria-label="t.label"
      :aria-activedescendant="centerCard ? `cover-${centerCard.id}` : undefined"
      :style="{ '--cover-w': `${cardWidth}px` }"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
      @lostpointercapture="onUp"
      @keydown="onKeydown"
    >
      <article
        v-for="(card, index) in cards"
        :id="`cover-${card.id}`"
        :key="card.id"
        :data-cover-index="index"
        :data-deck-card="card.id"
        role="option"
        :aria-selected="index === centered"
        :class="['cover-card', offsetOf(index) < 0 ? 'is-left' : 'is-right', { centered: index === centered }]"
        :style="{ ...poseStyle(index), '--card-tone': card.tone }"
      >
        <button type="button" class="cover-hit" tabindex="-1" :aria-label="t.open(card.title)"></button>
        <div class="cover-face">
          <slot name="face" :card="card" :centered="index === centered" />
        </div>
        <div v-if="$slots.quick" class="cover-quick"><slot name="quick" :card="card" /></div>
        <span class="cover-fade" aria-hidden="true"></span>
      </article>
    </div>

    <div class="cover-bar">
      <div class="cover-caption glass-control" aria-live="polite">
        <strong>{{ centerCard?.title }}</strong>
        <span>{{ t.position(centered + 1, cards.length) }}</span>
      </div>
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.coverflow { display: grid; gap: 22px; min-width: 0; }

.cover-stage {
  position: relative;
  height: calc(var(--cover-w) * .64 + 60px);
  min-height: 250px;
  outline: none;
  cursor: grab;
  touch-action: pan-y;
  user-select: none;
  perspective: 1500px;
  perspective-origin: 50% 45%;
  /* 两端渐隐进背景：卡组没有边界。 */
  -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 14%, #000 86%, transparent 100%);
  mask-image: linear-gradient(90deg, transparent 0, #000 14%, #000 86%, transparent 100%);
}
.cover-stage.is-dragging { cursor: grabbing; }
.cover-stage:focus-visible .cover-card.centered { box-shadow: 0 0 0 3px var(--focus), var(--mat-rim), var(--mat-shadow-lift); }

.cover-card {
  --card-tone: var(--accent);
  position: absolute;
  top: 50%;
  left: 50%;
  width: var(--cover-w);
  aspect-ratio: 1.58;
  overflow: hidden;
  border-radius: var(--radius-xl);
  background:
    radial-gradient(120% 90% at 0% 0%, color-mix(in srgb, var(--card-tone) 26%, transparent), transparent 62%),
    radial-gradient(90% 70% at 100% 100%, color-mix(in srgb, var(--card-tone) 10%, transparent), transparent 70%),
    var(--mat-card);
  box-shadow: var(--mat-shadow-lift);
  backface-visibility: hidden;
}
.cover-stage.is-moving .cover-card { will-change: transform, opacity; }
/* 侧卡外侧那一半渐隐进背景：一层静态渐变，拖动时只改它的不透明度（--fade），不重画。 */
.cover-fade {
  position: absolute;
  inset: 0;
  z-index: 3;
  border-radius: inherit;
  opacity: var(--fade, 0);
  pointer-events: none;
}
.cover-card.is-left .cover-fade { background: linear-gradient(90deg, var(--canvas) 0%, color-mix(in srgb, var(--canvas) 70%, transparent) 30%, transparent 62%); }
.cover-card.is-right .cover-fade { background: linear-gradient(270deg, var(--canvas) 0%, color-mix(in srgb, var(--canvas) 70%, transparent) 30%, transparent 62%); }
/* 顶上一层很淡的亮面，给卡一点厚度——不画边线（以前那圈 1px 亮边就是「卡片边界明显」的来源）。 */
.cover-card::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(180deg, color-mix(in srgb, #fff 6%, transparent) 0%, transparent 40%);
  pointer-events: none;
}
.cover-hit {
  position: absolute;
  inset: 0;
  z-index: 1;
  border: 0;
  border-radius: inherit;
  background: transparent;
  cursor: inherit;
}
.cover-face { position: relative; height: 100%; padding: 26px 28px; pointer-events: none; }
.cover-quick { position: absolute; top: 22px; right: 24px; z-index: 2; }

.cover-bar { display: flex; align-items: center; justify-content: center; gap: 10px; flex-wrap: wrap; animation: cover-bar-in .36s var(--ease-out) .1s both; }
@keyframes cover-bar-in { from { opacity: 0; translate: 0 10px; } }
.cover-caption {
  display: grid;
  min-width: 220px;
  justify-items: center;
  gap: 1px;
  padding: 8px 26px;
  border-radius: 999px;
  text-align: center;
}
.cover-caption strong { color: var(--ink); font-size: var(--fs-md); font-weight: 650; }
.cover-caption span { color: var(--subtle); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }

@media (max-width: 720px) {
  .cover-face { padding: 18px 20px; }
  .cover-caption { min-width: 160px; }
}
</style>
