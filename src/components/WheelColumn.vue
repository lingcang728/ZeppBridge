<script setup lang="ts">
/* 日期滚轮的一列（年 / 月 / 日），iOS 那种竖着转的鼓：选中项停在正中的玻璃带里，上下
 * 的项沿圆柱转走、变小、变淡。
 *
 * 手势：鼠标滚轮——慢拨一格走一项，快拨逐级加速（lib/wheel/momentum.ts）；按住上下拖，
 * 松手按甩动速度继续滑一段再吸附；↑/↓ 一项、PageUp/PageDown 五项。
 * 位置是连续的浮点下标，所有项的形变都由它算；停稳后才提交值。 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { newWheelAccel, wheelSteps } from '../lib/wheel/momentum';
import { useGlassLens } from '../composables/useGlassLens';

const props = defineProps<{
  items: { value: number; label: string }[];
  modelValue: number;
  label: string;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: number] }>();

/** 每一行的高度（px）与可见行数（奇数，正中一行是选中项）。 */
const ROW = 34;
const VISIBLE = 5;

const root = ref<HTMLElement | null>(null);
/* 折射（lib/glassLens.ts）：玻璃带上面再盖一块同样大小的玻璃，滚动时从带子上下沿经过的数字被弯折，
   带子正中原样清楚。只在转动时浮起来。 */
const refractEl = ref<HTMLElement | null>(null);
const refract = useGlassLens(refractEl, 'thumb');
const indexOf = (value: number) => Math.max(0, props.items.findIndex((item) => item.value === value));
const pos = ref(indexOf(props.modelValue));
let target = pos.value;
let velocity = 0;
let raf = 0;
let lastTs = 0;
const moving = ref(false);
const last = () => props.items.length - 1;
const clamp = (value: number) => Math.min(last(), Math.max(0, value));
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

const commit = () => {
  const item = props.items[Math.round(clamp(target))];
  if (item && item.value !== props.modelValue) emit('update:modelValue', item.value);
};

/* 临界阻尼弹簧：快速连拨时目标不断前移，弹簧一路追着走，看起来就是带惯性的加速。 */
const tick = (ts: number) => {
  const dt = Math.min(34, lastTs ? ts - lastTs : 16.7) / 1000;
  lastTs = ts;
  const omega = 18;
  const accel = -omega * omega * (pos.value - target) - 2 * omega * velocity;
  velocity += accel * dt;
  pos.value += velocity * dt;
  if (Math.abs(pos.value - target) < 0.002 && Math.abs(velocity) < 0.01) {
    pos.value = target;
    velocity = 0;
    raf = 0;
    lastTs = 0;
    moving.value = false;
    commit();
    return;
  }
  raf = requestAnimationFrame(tick);
};
const animateTo = (index: number) => {
  target = clamp(Math.round(index));
  if (reducedMotion()) { pos.value = target; commit(); return; }
  if (!raf) { moving.value = true; raf = requestAnimationFrame(tick); }
};

/* —— 滚轮 —— */
const accel = newWheelAccel();
const onWheel = (event: WheelEvent) => {
  event.preventDefault();
  const steps = wheelSteps(accel, event.deltaY || event.deltaX, event.deltaMode, event.timeStamp);
  if (steps) animateTo(target + steps);
};

/* —— 拖动 —— */
let gesture: { id: number; y: number; start: number; lastY: number; time: number; v: number; moved: boolean } | null = null;
const onDown = (event: PointerEvent) => {
  if (event.button !== 0 || !root.value) return;
  cancelAnimationFrame(raf);
  raf = 0;
  lastTs = 0;
  velocity = 0;
  gesture = { id: event.pointerId, y: event.clientY, start: pos.value, lastY: event.clientY, time: event.timeStamp, v: 0, moved: false };
  root.value.setPointerCapture(event.pointerId);
};
const onMove = (event: PointerEvent) => {
  const g = gesture;
  if (!g || g.id !== event.pointerId) return;
  const dy = event.clientY - g.y;
  if (!g.moved && Math.abs(dy) < 4) return;
  g.moved = true;
  moving.value = true;
  g.v = (event.clientY - g.lastY) / Math.max(1, event.timeStamp - g.time);
  g.lastY = event.clientY;
  g.time = event.timeStamp;
  const raw = g.start - dy / ROW;
  // 拖过两端时只走三分之一，像橡皮筋。
  pos.value = raw < 0 ? raw / 3 : raw > last() ? last() + (raw - last()) / 3 : raw;
};
const onUp = (event: PointerEvent) => {
  const g = gesture;
  if (!g || g.id !== event.pointerId) return;
  gesture = null;
  if (root.value?.hasPointerCapture(event.pointerId)) root.value.releasePointerCapture(event.pointerId);
  if (!g.moved) {
    // 点上下的项：直接转过去。
    const rect = root.value!.getBoundingClientRect();
    const offset = Math.round((event.clientY - (rect.top + rect.height / 2)) / ROW);
    animateTo(pos.value + offset);
    return;
  }
  const flick = event.timeStamp - g.time < 90 ? g.v : 0;
  // 甩一下相当于再往前滑 ~180ms 的距离。
  animateTo(pos.value - (flick * 180) / ROW);
};

const onKey = (event: KeyboardEvent) => {
  const step = { ArrowUp: -1, ArrowDown: 1, PageUp: -5, PageDown: 5 }[event.key];
  if (step !== undefined) { event.preventDefault(); animateTo(target + step); }
  else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); animateTo(event.key === 'Home' ? 0 : last()); }
};

watch(() => props.modelValue, (value) => {
  if (gesture || raf) return;
  const index = indexOf(value);
  if (index !== Math.round(target)) animateTo(index);
});
// 项数变了（换月份后日子变少）：位置钳回范围内。
watch(() => props.items.length, () => {
  if (pos.value > last()) { pos.value = last(); target = last(); commit(); }
});

onMounted(() => root.value?.addEventListener('wheel', onWheel, { passive: false }));
onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
  root.value?.removeEventListener('wheel', onWheel);
});

const RADIUS = ROW * 2.3;
const itemStyle = (index: number) => {
  const d = index - pos.value;
  if (Math.abs(d) > VISIBLE / 2 + 1) return { visibility: 'hidden' as const };
  const rad = Math.max(-1.4, Math.min(1.4, (d * ROW) / RADIUS));
  return {
    transform: `translateY(${(RADIUS * Math.sin(rad)).toFixed(2)}px) rotateX(${(-rad * 180 / Math.PI).toFixed(2)}deg)`,
    opacity: Math.max(0, 1 - Math.abs(d) * 0.3).toFixed(3),
  };
};
const active = computed(() => Math.round(clamp(pos.value)));
const current = computed(() => props.items[indexOf(props.modelValue)]);
</script>

<template>
  <div
    ref="root"
    :class="['wheel-col', { moving }]"
    :style="{ height: `${ROW * VISIBLE}px` }"
    role="spinbutton"
    tabindex="0"
    :aria-label="label"
    :aria-valuenow="modelValue"
    :aria-valuetext="current?.label"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onUp"
    @keydown="onKey"
  >
    <span class="band" aria-hidden="true" :style="{ height: `${ROW}px` }" />
    <div class="drum" aria-hidden="true">
      <span v-for="(item, index) in items" :key="item.value" :class="['cell', { on: index === active }]" :style="itemStyle(index)">{{ item.label }}</span>
    </div>
    <span v-if="refract.active.value" ref="refractEl" class="band-refract" aria-hidden="true" :style="[{ height: `${ROW}px` }, refract.style()]" />
  </div>
</template>

<style scoped>
.wheel-col {
  position: relative;
  min-width: 0;
  overflow: hidden;
  border-radius: 18px;
  outline: none;
  cursor: ns-resize;
  touch-action: none;
  user-select: none;
}
.wheel-col:focus-visible .band { box-shadow: 0 0 0 2px var(--focus), var(--cap-thumb-rim); }
/* 正中的玻璃带：选中项停在它里面。 */
.band {
  position: absolute;
  top: 50%;
  right: 4px;
  left: 4px;
  translate: 0 -50%;
  border-radius: 999px;
  background: var(--cap-thumb);
  box-shadow: var(--cap-thumb-rim);
}
.band-refract {
  position: absolute;
  top: 50%;
  right: 4px;
  left: 4px;
  translate: 0 -50%;
  border-radius: 999px;
  box-shadow: var(--lens-glass-rim);
  pointer-events: none;
  opacity: 0;
  transition: opacity 160ms ease;
}
.moving .band-refract { opacity: 1; }
.drum {
  position: absolute;
  inset: 0;
  perspective: 360px;
  -webkit-mask-image: linear-gradient(180deg, transparent 0, #000 30%, #000 70%, transparent 100%);
  mask-image: linear-gradient(180deg, transparent 0, #000 30%, #000 70%, transparent 100%);
}
.cell {
  position: absolute;
  top: 50%;
  right: 0;
  left: 0;
  margin-top: -17px;
  height: 34px;
  line-height: 34px;
  color: var(--muted);
  font-size: var(--fs-md);
  font-variant-numeric: tabular-nums;
  text-align: center;
  white-space: nowrap;
  backface-visibility: hidden;
  transition: color var(--dur-fast) ease;
}
.moving .cell { will-change: transform, opacity; }
.cell.on { color: var(--cap-ink); font-weight: 650; }
</style>
