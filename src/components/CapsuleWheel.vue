<script setup lang="ts" generic="T extends string | number">
/* 胶囊传送带（Apple 相机模式滚轮的网页版）。
 *
 * 选项排在一条看不见的圆柱面上：选中的那一项永远停在胶囊正中，两边的选项
 * 像传送带转过扶梯拐角一样侧转、缩小、变淡，到胶囊边缘被渐隐吃掉——没有硬边。
 *
 * 手势：按住左右拖（竖向时上下拖），松手按速度吸附到最近一项；滚轮一格一项；
 * 点两侧的选项直接转过去；←/→（↑/↓）、Home/End 同样可用。
 *
 * 位置是一个连续的浮点下标 `pos`，所有项的形变都由它算出来，拖动和吸附动画
 * 只改这一个数；选中值在动画停稳以后才提交——切语言会重绘整页，放在动画
 * 中途提交会让滚轮卡一下。 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Icon, { type IconName } from './Icon.vue';

export type WheelItem<T extends string | number> = { value: T; label: string; icon?: IconName; image?: string };

const props = withDefaults(defineProps<{
  items: WheelItem<T>[];
  modelValue: T;
  ariaLabel?: string;
  orientation?: 'horizontal' | 'vertical';
  /** 胶囊可视宽度（横向）或高度（竖向），px。 */
  span?: number;
  /** 只显示图标（主题切换那种），标签进 aria。 */
  iconOnly?: boolean;
  disabled?: boolean;
}>(), {
  orientation: 'horizontal',
  span: 148,
  iconOnly: false,
  disabled: false,
});

const emit = defineEmits<{ 'update:modelValue': [value: T] }>();

const root = ref<HTMLElement | null>(null);
const itemEls = ref<HTMLElement[]>([]);
const sizes = ref<number[]>([]);
const vertical = computed(() => props.orientation === 'vertical');

const indexOf = (value: T) => Math.max(0, props.items.findIndex((item) => item.value === value));
const pos = ref(indexOf(props.modelValue));
let target = pos.value;
let velocity = 0;
let raf = 0;
let lastTs = 0;
const dragging = ref(false);

/** 相邻两项之间的空隙（沿圆柱表面量），px。 */
const GAP = 12;
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

const measure = () => {
  sizes.value = itemEls.value.map((el) => (vertical.value ? el.offsetHeight : el.offsetWidth));
};
/* 选项沿圆柱表面按各自的宽度排开（弧长布局）：长标签不会把短标签挤出视野。
   centers[i] 是第 i 项中心在「展开的圆柱面」上的位置；pos 是浮点下标，
   在相邻两项的中心之间线性插值成一个弧长位置。 */
const centers = computed(() => {
  const out: number[] = [];
  let cursor = 0;
  sizes.value.forEach((size, index) => {
    const half = size / 2;
    cursor += index === 0 ? half : (sizes.value[index - 1]! / 2) + GAP + half;
    out.push(cursor);
  });
  return out;
});
const arcAt = (p: number): number => {
  const list = centers.value;
  if (!list.length) return 0;
  const last = list.length - 1;
  if (p <= 0) return list[0]! + p * ((list[1] ?? list[0]! + 60) - list[0]!);
  if (p >= last) return list[last]! + (p - last) * (list[last]! - (list[last - 1] ?? list[last]! - 60));
  const lo = Math.floor(p);
  return list[lo]! + (p - lo) * (list[lo + 1]! - list[lo]!);
};
/** arcAt 的反函数：拖动时手指走过的弧长换回浮点下标。 */
const posAt = (arc: number): number => {
  const list = centers.value;
  if (list.length < 2) return 0;
  const last = list.length - 1;
  if (arc <= list[0]!) return (arc - list[0]!) / (list[1]! - list[0]!);
  if (arc >= list[last]!) return last + (arc - list[last]!) / (list[last]! - list[last - 1]!);
  let lo = 0;
  while (lo < last - 1 && list[lo + 1]! < arc) lo += 1;
  return lo + (arc - list[lo]!) / (list[lo + 1]! - list[lo]!);
};
/** 圆柱半径：比胶囊可视宽度的一半略大，边缘那一项转过拐角但仍认得出来。 */
const radius = computed(() => props.span * 0.62);

const clampPos = (value: number) => Math.min(props.items.length - 1, Math.max(0, value));
/** 拖过两端时的橡皮筋：越界部分只走三分之一。 */
const rubber = (value: number) => {
  const last = props.items.length - 1;
  if (value < 0) return value / 3;
  if (value > last) return last + (value - last) / 3;
  return value;
};

const itemStyle = (index: number) => {
  const offset = (centers.value[index] ?? 0) - arcAt(pos.value);
  const rad = Math.max(-1.75, Math.min(1.75, offset / radius.value));
  const angle = rad * 180 / Math.PI;
  const shift = radius.value * Math.sin(rad);
  const depth = radius.value * (Math.cos(rad) - 1);
  const far = Math.min(1, Math.abs(rad) / 1.5);
  const move = vertical.value
    ? `translate3d(-50%, calc(-50% + ${shift}px), ${depth}px) rotateX(${-angle}deg)`
    : `translate3d(calc(-50% + ${shift}px), -50%, ${depth}px) rotateY(${angle}deg)`;
  return {
    transform: move,
    opacity: Math.abs(rad) >= 1.6 ? 0 : 1 - far * 0.7,
    filter: far > 0.05 ? `blur(${(far * 1.6).toFixed(2)}px)` : 'none',
    zIndex: 100 - Math.round(Math.abs(rad) * 20),
  };
};

/** 中间那块镜片的尺寸在相邻两项之间插值，拖动时跟着内容伸缩。 */
const lensSize = computed(() => {
  if (!sizes.value.length) return 0;
  const p = clampPos(pos.value);
  const lo = Math.floor(p);
  const hi = Math.min(sizes.value.length - 1, lo + 1);
  const f = p - lo;
  return (sizes.value[lo] ?? 0) * (1 - f) + (sizes.value[hi] ?? 0) * f;
});

const settle = () => {
  const index = Math.round(clampPos(target));
  const item = props.items[index];
  if (item && item.value !== props.modelValue) emit('update:modelValue', item.value);
};

/* 临界阻尼弹簧：没有过冲，也没有「慢慢蹭到位」的尾巴。 */
const tick = (ts: number) => {
  const dt = Math.min(34, lastTs ? ts - lastTs : 16.7) / 1000;
  lastTs = ts;
  const omega = 22;
  const x = pos.value - target;
  const accel = -omega * omega * x - 2 * omega * velocity;
  velocity += accel * dt;
  pos.value += velocity * dt;
  if (Math.abs(pos.value - target) < 0.002 && Math.abs(velocity) < 0.01) {
    pos.value = target;
    velocity = 0;
    raf = 0;
    lastTs = 0;
    settle();
    return;
  }
  raf = requestAnimationFrame(tick);
};
const animateTo = (index: number) => {
  target = clampPos(Math.round(index));
  if (reducedMotion()) {
    pos.value = target;
    settle();
    return;
  }
  if (!raf) raf = requestAnimationFrame(tick);
};

/* —— 拖动 —— */
let gesture: { id: number; hit: number; start: number; startArc: number; last: number; time: number; v: number; moved: boolean } | null = null;
const coord = (event: PointerEvent) => (vertical.value ? event.clientY : event.clientX);
/** 当前位置附近一格有多宽（弧长），甩动速度换算成格数时用。 */
const pxPerItem = () => {
  const p = Math.round(Math.min(props.items.length - 1, Math.max(0, pos.value)));
  const list = centers.value;
  const next = list[p + 1] ?? list[p - 1];
  return next === undefined || list[p] === undefined ? 60 : Math.abs(next - list[p]!);
};
const layoutScale = () => {
  const el = root.value;
  if (!el || !el.offsetWidth) return 1;
  return el.getBoundingClientRect().width / el.offsetWidth || 1;
};

const onDown = (event: PointerEvent) => {
  if (props.disabled || event.button !== 0 || !event.isPrimary || !root.value) return;
  cancelAnimationFrame(raf);
  raf = 0;
  lastTs = 0;
  velocity = 0;
  // 按下时就记住点的是哪一项：抓住指针以后，pointerup 的 target 会变成整个胶囊。
  const hit = (event.target as Element).closest<HTMLElement>('[data-wheel-index]');
  gesture = { id: event.pointerId, hit: hit ? Number(hit.dataset.wheelIndex) : -1, start: coord(event), startArc: arcAt(pos.value), last: coord(event), time: event.timeStamp, v: 0, moved: false };
  root.value.setPointerCapture(event.pointerId);
};
const onMove = (event: PointerEvent) => {
  const g = gesture;
  if (!g || g.id !== event.pointerId) return;
  const delta = (coord(event) - g.start) / layoutScale();
  if (!g.moved && Math.abs(delta) < 4) return;
  g.moved = true;
  dragging.value = true;
  const dt = Math.max(1, event.timeStamp - g.time);
  g.v = ((coord(event) - g.last) / layoutScale()) / dt;
  g.last = coord(event);
  g.time = event.timeStamp;
  pos.value = rubber(posAt(g.startArc - delta));
  event.preventDefault();
};
const onUp = (event: PointerEvent) => {
  const g = gesture;
  if (!g || g.id !== event.pointerId) return;
  gesture = null;
  dragging.value = false;
  if (root.value?.hasPointerCapture(event.pointerId)) root.value.releasePointerCapture(event.pointerId);
  if (!g.moved) {
    // 点击：点到哪一项就转到哪一项。
    const index = g.hit >= 0 ? g.hit : Math.round(pos.value);
    animateTo(index === Math.round(pos.value) && props.items.length === 2 ? 1 - index : index);
    return;
  }
  const flick = event.timeStamp - g.time < 90 ? g.v : 0;
  // 甩一下相当于再往前走 ~140ms 的距离。
  const projected = pos.value - (flick * 140) / pxPerItem();
  velocity = -(flick * 1000) / pxPerItem() * 0.4;
  animateTo(projected);
};

/* —— 滚轮：攒够一格走一项 —— */
let wheelAcc = 0;
const onWheel = (event: WheelEvent) => {
  if (props.disabled) return;
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  if (!delta) return;
  event.preventDefault();
  wheelAcc += delta;
  if (Math.abs(wheelAcc) < 40) return;
  const steps = Math.sign(wheelAcc);
  wheelAcc = 0;
  animateTo(Math.round(target) + steps);
};

const onKeydown = (event: KeyboardEvent) => {
  if (props.disabled) return;
  const current = Math.round(target);
  const last = props.items.length - 1;
  const next = {
    ArrowRight: current + 1, ArrowDown: current + 1,
    ArrowLeft: current - 1, ArrowUp: current - 1,
    Home: 0, End: last,
  }[event.key];
  if (next === undefined) return;
  event.preventDefault();
  animateTo(next);
};

watch(() => props.modelValue, (value) => {
  if (gesture) return;
  const index = indexOf(value);
  if (index !== Math.round(target) || Math.abs(pos.value - index) > 0.001) animateTo(index);
});
watch(() => props.items.map((item) => item.label).join('\u0000'), async () => {
  await nextTick();
  measure();
});

let observer: ResizeObserver | null = null;
onMounted(() => {
  measure();
  void document.fonts?.ready.then(measure);
  observer = new ResizeObserver(measure);
  for (const el of itemEls.value) observer.observe(el);
  root.value?.addEventListener('wheel', onWheel, { passive: false });
});
onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
  observer?.disconnect();
  root.value?.removeEventListener('wheel', onWheel);
});

const activeIndex = computed(() => Math.round(clampPos(pos.value)));
const current = computed(() => props.items[indexOf(props.modelValue)]);
</script>

<template>
  <div
    ref="root"
    :class="['capsule-wheel', `is-${orientation}`, { 'is-dragging': dragging, 'is-icon-only': iconOnly, 'is-disabled': disabled }]"
    :style="vertical ? { height: `${span}px` } : { width: `${span}px` }"
    role="slider"
    tabindex="0"
    :aria-label="ariaLabel"
    :aria-valuemin="0"
    :aria-valuemax="items.length - 1"
    :aria-valuenow="indexOf(modelValue)"
    :aria-valuetext="current?.label"
    :aria-disabled="disabled || undefined"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onUp"
    @lostpointercapture="onUp"
    @keydown="onKeydown"
  >
    <span
      class="wheel-lens"
      aria-hidden="true"
      :style="vertical ? { height: `${lensSize + 14}px` } : { width: `${lensSize + (iconOnly ? 14 : 22)}px` }"
    />
    <div class="wheel-drum" aria-hidden="true">
      <span
        v-for="(item, index) in items"
        :key="String(item.value)"
        ref="itemEls"
        :data-wheel-index="index"
        :class="['wheel-item', { on: index === activeIndex }]"
        :style="itemStyle(index)"
        :title="iconOnly ? item.label : undefined"
      >
        <img v-if="item.image" :src="item.image" alt="" class="wheel-image" draggable="false" />
        <Icon v-else-if="item.icon" :name="item.icon" :size="iconOnly ? 16 : 14" />
        <span v-if="!iconOnly">{{ item.label }}</span>
      </span>
    </div>
  </div>
</template>

<style scoped>
.capsule-wheel {
  position: relative;
  display: inline-block;
  flex: 0 0 auto;
  height: 36px;
  overflow: hidden;
  border-radius: 999px;
  outline: none;
  cursor: grab;
  touch-action: none;
  user-select: none;
  perspective: 420px;
  /* 两端渐隐：选项转到边缘时被吃掉，而不是被一条硬边切掉。 */
  -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 16%, #000 84%, transparent 100%);
  mask-image: linear-gradient(90deg, transparent 0, #000 16%, #000 84%, transparent 100%);
}
.capsule-wheel.is-vertical {
  width: auto;
  min-width: 120px;
  -webkit-mask-image: linear-gradient(180deg, transparent 0, #000 25%, #000 75%, transparent 100%);
  mask-image: linear-gradient(180deg, transparent 0, #000 25%, #000 75%, transparent 100%);
}
.capsule-wheel.is-dragging { cursor: grabbing; }
.capsule-wheel.is-disabled { opacity: .5; cursor: not-allowed; }
.capsule-wheel:focus-visible .wheel-lens { box-shadow: 0 0 0 2px var(--focus), var(--glass-rim); }

/* 正中的镜片：选中项永远在它上面。宽度随拖动在两项之间插值。 */
.wheel-lens {
  position: absolute;
  top: 3px;
  bottom: 3px;
  left: 50%;
  translate: -50% 0;
  min-width: 30px;
  border-radius: 999px;
  background: linear-gradient(180deg, color-mix(in srgb, #fff 14%, transparent), transparent 70%),
    color-mix(in srgb, var(--ink) 12%, transparent);
  box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 22%, transparent), inset 0 -1px 0 rgba(0, 0, 0, .12),
    0 2px 8px -3px rgba(0, 0, 0, .4);
  transition: scale var(--dur-base) var(--ease-spring);
}
.is-vertical .wheel-lens { top: 50%; bottom: auto; left: 3px; right: 3px; translate: 0 -50%; min-width: 0; }
.capsule-wheel.is-dragging .wheel-lens { scale: 1.06 1.1; }

.wheel-drum { position: absolute; inset: 0; transform-style: preserve-3d; }
.wheel-item {
  position: absolute;
  top: 50%;
  left: 50%;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 11px;
  color: var(--muted);
  font-size: var(--fs-sm);
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  backface-visibility: hidden;
  will-change: transform;
  transition: color var(--dur-fast) ease;
}
.is-icon-only .wheel-item { padding: 0 7px; }
.wheel-image { width: 18px; height: 18px; flex: 0 0 18px; border-radius: 5px; pointer-events: none; }
.wheel-item.on { color: var(--accent); font-weight: 600; }

@media (prefers-reduced-transparency: reduce) {
  .wheel-item { filter: none !important; }
}
</style>
