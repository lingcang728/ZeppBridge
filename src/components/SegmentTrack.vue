<script setup lang="ts" generic="T extends string | number">
/* 分段控件 / 胶囊导航。
 *
 * 标签画两层：底层是暗色字，上层是「选中字」，上层按滑块的形状裁剪、和滑块用
 * 同一条过渡曲线。这样文字颜色永远跟它底下的东西一致——以前是标签颜色先切、
 * 滑块后到，半截深色字会露在滑块外面。
 *
 * 位置用 offsetLeft / offsetWidth 量（布局像素，不受原生缩放影响），并且在
 * 每个按钮尺寸变化、字体加载完成时重新量：以前只盯轨道本身，字体晚到时滑块
 * 会停在旧宽度上。 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import { dragThumb, segmentClip, snapStop, type SegmentStop } from '../lib/navigation';

export type SegmentItem<T extends string | number> = { value: T; label: string };

const props = withDefaults(defineProps<{
  items: SegmentItem<T>[];
  modelValue: T;
  ariaLabel?: string;
  disabled?: boolean;
  compact?: boolean;
  /** 按钮等宽铺满整条轨道；默认按内容收紧。 */
  fill?: boolean;
  /** `glass` 给浮在顶栏上的导航；`inset` 是表单里的凹槽底。 */
  variant?: 'inset' | 'glass';
}>(), {
  disabled: false,
  compact: false,
  fill: false,
  variant: 'inset',
});

const emit = defineEmits<{ 'update:modelValue': [value: T] }>();

const track = ref<HTMLElement | null>(null);
const stops = ref([]) as Ref<SegmentStop<T>[]>;
const thumb = ref({ left: 0, width: 0, visible: false });
const trackWidth = ref(0);
const dragging = ref(false);
/** 第一次量完之前不做过渡，免得滑块从最左边滑进来。 */
const settled = ref(false);

type Gesture = {
  id: number;
  x: number;
  center: number;
  startValue: T;
  lastX: number;
  time: number;
  velocity: number;
};
let gesture: Gesture | null = null;
let frame = 0;
let nextThumb: { left: number; width: number } | null = null;
let suppressClick = false;
let observer: ResizeObserver | null = null;

const buttons = () => Array.from(track.value?.querySelectorAll<HTMLElement>('.segment-item') ?? []);
const readStops = (): SegmentStop<T>[] => buttons().map((el, index) => ({
  left: el.offsetLeft,
  width: el.offsetWidth,
  value: props.items[index]!.value,
}));

const placeOn = (value: T) => {
  const stop = stops.value.find((item) => item.value === value);
  thumb.value = stop ? { left: stop.left, width: stop.width, visible: true } : { ...thumb.value, visible: false };
};

const measure = () => {
  if (!track.value) return;
  stops.value = readStops();
  trackWidth.value = track.value.clientWidth;
  if (!gesture) placeOn(props.modelValue);
  if (!settled.value && thumb.value.visible) requestAnimationFrame(() => { settled.value = true; });
};

const observeItems = () => {
  if (!observer || !track.value) return;
  observer.disconnect();
  observer.observe(track.value);
  for (const el of buttons()) observer.observe(el);
};

/* 透镜横向放大的倍数，和样式里 .is-dragging .segment-thumb 的 scale 保持一致。 */
const LENS_GROW = 1.08;
const clip = computed(() => segmentClip(thumb.value, trackWidth.value, 3, dragging.value ? LENS_GROW : 1));

const focusActive = () => {
  if (!track.value?.contains(document.activeElement)) return;
  const index = props.items.findIndex((item) => item.value === props.modelValue);
  buttons()[index]?.focus({ preventScroll: true });
};

const commit = (value: T) => {
  if (value !== props.modelValue) emit('update:modelValue', value);
};

const clearGesture = () => {
  const current = gesture;
  gesture = null;
  dragging.value = false;
  cancelAnimationFrame(frame);
  frame = 0;
  nextThumb = null;
  if (current && track.value?.hasPointerCapture(current.id)) track.value.releasePointerCapture(current.id);
};

const onDown = (event: PointerEvent) => {
  if (props.disabled || event.button !== 0 || !event.isPrimary || !track.value) return;
  measure();
  const button = (event.target as Element).closest<HTMLElement>('.segment-item');
  const index = button ? buttons().indexOf(button) : -1;
  const startValue = index >= 0 ? props.items[index]!.value : props.modelValue;
  const active = stops.value.find((stop) => stop.value === props.modelValue) ?? stops.value[0];
  if (!active) return;
  gesture = {
    id: event.pointerId,
    x: event.clientX,
    center: active.left + active.width / 2,
    startValue,
    lastX: event.clientX,
    time: event.timeStamp,
    velocity: 0,
  };
  track.value.setPointerCapture(event.pointerId);
};

/** 指针移动的屏幕像素换算成布局像素（原生缩放下两者不同）。 */
const layoutScale = () => {
  if (!track.value || !track.value.offsetWidth) return 1;
  return track.value.getBoundingClientRect().width / track.value.offsetWidth || 1;
};

const onMove = (event: PointerEvent) => {
  const current = gesture;
  if (!current || current.id !== event.pointerId) return;
  const scale = layoutScale();
  const dx = (event.clientX - current.x) / scale;
  if (!dragging.value && Math.abs(dx) < 5) return;
  dragging.value = true;
  suppressClick = true;
  current.velocity = (event.clientX - current.lastX) / scale / Math.max(1, event.timeStamp - current.time);
  current.lastX = event.clientX;
  current.time = event.timeStamp;
  nextThumb = dragThumb(stops.value, current.center + dx, current.velocity);
  if (!frame) {
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (nextThumb) thumb.value = { ...nextThumb, visible: true };
    });
  }
  event.preventDefault();
};

const onUp = (event: PointerEvent) => {
  const current = gesture;
  if (!current || current.id !== event.pointerId) return;
  if (event.type !== 'pointerup') {
    clearGesture();
    placeOn(props.modelValue);
    return;
  }
  const moved = dragging.value;
  const center = current.center + (event.clientX - current.x) / layoutScale();
  const velocity = event.timeStamp - current.time < 90 ? current.velocity : 0;
  const next = moved ? snapStop(stops.value, center, velocity).value : current.startValue;
  clearGesture();
  placeOn(next);
  commit(next);
  window.setTimeout(() => { suppressClick = false; }, 0);
};

const onClick = (value: T) => {
  if (props.disabled || suppressClick) return;
  commit(value);
};

const onKeydown = (event: KeyboardEvent) => {
  if (props.disabled || !props.items.length) return;
  const index = Math.max(0, props.items.findIndex((item) => item.value === props.modelValue));
  const last = props.items.length - 1;
  const target = {
    ArrowRight: Math.min(last, index + 1),
    ArrowDown: Math.min(last, index + 1),
    ArrowLeft: Math.max(0, index - 1),
    ArrowUp: Math.max(0, index - 1),
    Home: 0,
    End: last,
  }[event.key];
  if (target === undefined) return;
  event.preventDefault();
  commit(props.items[target]!.value);
};

watch(() => props.modelValue, async () => {
  await nextTick();
  if (!gesture) placeOn(props.modelValue);
  focusActive();
});
watch(() => props.items, async () => {
  await nextTick();
  observeItems();
  measure();
}, { deep: true });

onMounted(() => {
  void nextTick(() => {
    measure();
    observer = new ResizeObserver(() => measure());
    observeItems();
  });
  void document.fonts?.ready.then(() => measure());
  window.addEventListener('resize', measure);
});
onBeforeUnmount(() => {
  clearGesture();
  observer?.disconnect();
  window.removeEventListener('resize', measure);
});
</script>

<template>
  <div
    ref="track"
    :class="['segment-track', `is-${variant}`, {
      'is-dragging': dragging, 'is-compact': compact, 'is-disabled': disabled, 'is-fill': fill, 'is-settled': settled,
    }]"
    role="radiogroup"
    :aria-label="ariaLabel"
    :aria-disabled="disabled || undefined"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onUp"
    @lostpointercapture="onUp"
    @keydown="onKeydown"
  >
    <button
      v-for="item in items"
      :key="String(item.value)"
      type="button"
      role="radio"
      class="segment-item"
      :aria-checked="item.value === modelValue"
      :disabled="disabled"
      :tabindex="item.value === modelValue ? 0 : -1"
      @click="onClick(item.value)"
    >
      <slot :item="item" :active="false">{{ item.label }}</slot>
    </button>
    <span
      class="segment-thumb"
      aria-hidden="true"
      :style="{ transform: `translateX(${thumb.left}px)`, width: `${thumb.width}px`, opacity: thumb.visible ? 1 : 0 }"
    />
    <!-- 选中字：同样的标签按量好的位置摆一遍，只露出滑块覆盖的那一段。 -->
    <span class="segment-ink" aria-hidden="true" :style="{ clipPath: clip }">
      <span
        v-for="(stop, index) in stops"
        :key="String(stop.value)"
        class="segment-ink-item"
        :style="{ left: `${stop.left}px`, width: `${stop.width}px` }"
      >
        <slot v-if="items[index]" :item="items[index]!" :active="true">{{ items[index]!.label }}</slot>
      </span>
    </span>
  </div>
</template>

<style scoped>
.segment-track {
  --seg-pad: 3px;
  --seg-dur: var(--dur-base, 240ms);
  --seg-ease: var(--ease-spring, cubic-bezier(.2, 1.15, .32, 1));
  position: relative;
  display: inline-flex;
  max-width: 100%;
  align-items: stretch;
  padding: var(--seg-pad);
  overflow: hidden;
  isolation: isolate;
  border-radius: 999px;
  user-select: none;
  touch-action: none;
}
.segment-track.is-inset { background: var(--mat-inset); box-shadow: var(--mat-inset-shadow); }
/* 浮在内容之上的导航：用浮动控件的玻璃（见 material.css 的 .glass-control）。
   选中的那一格不再是一块品牌绿，而是玻璃里一块中性的亮底、字用品牌色——
   导航里的颜色只用来点出「你在哪」，大块的颜色留给内容。 */
.segment-track.is-glass {
  background: linear-gradient(180deg, var(--glass-sheen), transparent 60%), var(--glass);
  -webkit-backdrop-filter: var(--glass-blur);
  backdrop-filter: var(--glass-blur);
  box-shadow: var(--glass-rim), var(--glass-shadow);
}
.segment-track.is-glass .segment-thumb {
  background: color-mix(in srgb, var(--ink) 13%, transparent);
  box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 16%, transparent);
}
.segment-track.is-glass .segment-ink { color: var(--accent); }
@media (prefers-reduced-transparency: reduce) {
  .segment-track.is-glass { background: var(--mat-glass-strong); -webkit-backdrop-filter: none; backdrop-filter: none; }
}
.segment-track.is-fill { display: flex; }
.segment-track.is-fill .segment-item { flex: 1 1 0; }

.segment-item {
  position: relative;
  z-index: 1;
  display: inline-flex;
  min-width: 0;
  min-height: 32px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 5px 15px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: var(--fs-sm);
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
  cursor: grab;
}
.segment-item:hover:not(:disabled) { color: var(--ink); }
/* 焦点画在滑块上，不画在按钮上：按钮的 outline 会留在旧位置，成为一圈残影。 */
.segment-item:focus-visible { outline: none; }
.segment-track.is-dragging .segment-item { cursor: grabbing; }
.segment-item:disabled { cursor: not-allowed; }

.segment-thumb {
  position: absolute;
  z-index: 2;
  top: var(--seg-pad);
  bottom: var(--seg-pad);
  left: 0;
  border-radius: 999px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--accent-hover) 88%, #fff) 0%, var(--accent) 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .32), inset 0 -1px 0 rgba(0, 0, 0, .12),
    0 2px 10px -2px color-mix(in srgb, var(--accent) 50%, transparent);
  pointer-events: none;
}
.segment-ink {
  position: absolute;
  z-index: 3;
  inset: 0;
  color: var(--accent-ink);
  font-weight: 600;
  pointer-events: none;
}
.segment-ink-item {
  position: absolute;
  top: var(--seg-pad);
  bottom: var(--seg-pad);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 5px 15px;
  font-size: var(--fs-sm);
  line-height: 1.2;
  white-space: nowrap;
}
.segment-track.is-settled .segment-thumb {
  transition: transform var(--seg-dur) var(--seg-ease), width var(--seg-dur) var(--seg-ease),
    scale var(--seg-dur) var(--seg-ease), background var(--seg-dur) ease, box-shadow var(--seg-dur) ease;
}
.segment-track.is-settled .segment-ink { transition: clip-path var(--seg-dur) var(--seg-ease), color var(--seg-dur) ease; }

/* 拖动时滑块临时变成清透的透镜：放大一点、边缘高光、几乎无色，透过它能看清
   底下的标签。不做模糊——透镜是聚光，不是磨砂；模糊会把底下的字糊成一圈光晕。
   两层字在拖动时用同一字重，叠在一起才是一个字而不是重影。 */
.segment-track.is-dragging .segment-thumb {
  scale: 1.08 1.16;
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .5), inset 0 -1px 0 rgba(255, 255, 255, .12),
    inset 0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent), 0 8px 20px -8px rgba(0, 0, 0, .45);
  transition: scale var(--seg-dur) var(--seg-ease), background var(--seg-dur) ease, box-shadow var(--seg-dur) ease;
}
.segment-track.is-dragging .segment-ink { color: var(--ink); font-weight: 500; transition: color var(--seg-dur) ease; }

.segment-track:has(.segment-item:focus-visible) .segment-thumb {
  box-shadow: 0 0 0 2px var(--canvas), 0 0 0 4px var(--focus);
}

.segment-track.is-compact .segment-item,
.segment-track.is-compact .segment-ink-item { padding: 3px 12px; font-size: var(--fs-xs); }
.segment-track.is-compact .segment-item { min-height: 28px; }
.segment-track.is-disabled { opacity: .55; }

@media (prefers-reduced-motion: reduce) {
  .segment-track.is-settled .segment-thumb,
  .segment-track.is-settled .segment-ink,
  .segment-track.is-dragging .segment-thumb { transition: none; }
}
</style>
