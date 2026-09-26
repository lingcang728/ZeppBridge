<script setup lang="ts" generic="T extends string | number">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { dragThumb, snapStop, type SegmentStop } from '../lib/navigation';

export type SegmentItem<T extends string | number> = { value: T; label: string };

const props = withDefaults(defineProps<{
  items: SegmentItem<T>[];
  modelValue: T;
  ariaLabel?: string;
  disabled?: boolean;
  compact?: boolean;
}>(), {
  disabled: false,
  compact: false,
});

const emit = defineEmits<{ 'update:modelValue': [value: T] }>();

const track = ref<HTMLElement | null>(null);
const thumb = ref({ left: 0, width: 0, visible: false });
const dragging = ref(false);
const preview = ref<T | null>(null);
const shown = computed(() => preview.value ?? props.modelValue);

type Gesture = {
  id: number;
  x: number;
  scale: number;
  center: number;
  startValue: T;
  lastX: number;
  time: number;
  velocity: number;
  stops: SegmentStop<T>[];
};
let gesture: Gesture | null = null;
let frame = 0;
let nextThumb: { left: number; width: number } | null = null;
let suppressClick = false;
let observer: ResizeObserver | null = null;

const buttons = () => Array.from(track.value?.querySelectorAll<HTMLElement>('.segment-item') ?? []);
const scaleOf = () => {
  if (!track.value) return 1;
  const width = track.value.getBoundingClientRect().width;
  return width > 0 ? width / track.value.offsetWidth : 1;
};
const readStops = (): SegmentStop<T>[] => {
  if (!track.value) return [];
  const origin = track.value.getBoundingClientRect().left;
  const scale = scaleOf();
  return buttons().map((el, index) => {
    const box = el.getBoundingClientRect();
    return {
      left: (box.left - origin) / scale,
      width: box.width / scale,
      value: props.items[index]!.value,
    };
  });
};
const measure = () => {
  if (gesture || !track.value) return;
  const stop = readStops().find((item) => item.value === props.modelValue);
  thumb.value = stop
    ? { left: stop.left, width: stop.width, visible: true }
    : { ...thumb.value, visible: false };
};
const commit = (value: T) => {
  if (value !== props.modelValue) emit('update:modelValue', value);
};
const clearGesture = () => {
  const current = gesture;
  gesture = null;
  dragging.value = false;
  preview.value = null;
  cancelAnimationFrame(frame);
  frame = 0;
  nextThumb = null;
  if (current && track.value?.hasPointerCapture(current.id)) track.value.releasePointerCapture(current.id);
};
const onDown = (event: PointerEvent) => {
  if (props.disabled || event.button !== 0 || !event.isPrimary || !track.value) return;
  const button = (event.target as Element).closest<HTMLElement>('.segment-item');
  const index = button ? buttons().indexOf(button) : -1;
  const startValue = index >= 0 ? props.items[index]!.value : props.modelValue;
  const stops = readStops();
  const active = stops.find((stop) => stop.value === props.modelValue) ?? stops[0];
  if (!active) return;
  gesture = {
    id: event.pointerId,
    x: event.clientX,
    scale: scaleOf(),
    center: active.left + active.width / 2,
    startValue,
    lastX: event.clientX,
    time: event.timeStamp,
    velocity: 0,
    stops,
  };
  track.value.setPointerCapture(event.pointerId);
};
const onMove = (event: PointerEvent) => {
  const current = gesture;
  if (!current || current.id !== event.pointerId) return;
  const dx = (event.clientX - current.x) / current.scale;
  if (!dragging.value && Math.abs(dx) < 5) return;
  dragging.value = true;
  suppressClick = true;
  current.velocity = (event.clientX - current.lastX) / current.scale / Math.max(1, event.timeStamp - current.time);
  current.lastX = event.clientX;
  current.time = event.timeStamp;
  nextThumb = dragThumb(current.stops, current.center + dx, current.velocity);
  preview.value = snapStop(current.stops, current.center + dx, 0).value;
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
    measure();
    return;
  }
  const moved = dragging.value;
  const center = current.center + (event.clientX - current.x) / current.scale;
  const velocity = event.timeStamp - current.time < 90 ? current.velocity : 0;
  const next = moved ? snapStop(current.stops, center, velocity).value : current.startValue;
  clearGesture();
  const stop = readStops().find((item) => item.value === next);
  if (stop) thumb.value = { left: stop.left, width: stop.width, visible: true };
  commit(next);
  window.setTimeout(() => { suppressClick = false; }, 0);
};
const onClick = (value: T) => {
  if (props.disabled || suppressClick) return;
  commit(value);
};
watch(() => props.modelValue, () => nextTick(measure));
watch(() => props.items, () => nextTick(measure), { deep: true });
onMounted(() => {
  void nextTick(measure);
  if (track.value) {
    observer = new ResizeObserver(() => { if (!gesture) measure(); });
    observer.observe(track.value);
  }
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
    :class="['segment-track', { 'is-dragging': dragging, 'is-compact': compact, 'is-disabled': disabled }]"
    role="radiogroup"
    :aria-label="ariaLabel"
    :aria-disabled="disabled || undefined"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onUp"
    @lostpointercapture="onUp"
  >
    <span
      class="segment-thumb"
      aria-hidden="true"
      :style="{ transform: `translateX(${thumb.left}px)`, width: `${thumb.width}px`, opacity: thumb.visible ? 1 : 0 }"
    />
    <button
      v-for="item in items"
      :key="String(item.value)"
      type="button"
      role="radio"
      class="segment-item"
      :class="{ 'is-on': item.value === shown }"
      :aria-checked="item.value === modelValue"
      :disabled="disabled"
      :tabindex="item.value === modelValue ? 0 : -1"
      @click="onClick(item.value)"
    >
      <slot :item="item" :active="item.value === shown">{{ item.label }}</slot>
    </button>
  </div>
</template>

<style scoped>
.segment-track {
  position: relative;
  display: inline-flex;
  max-width: 100%;
  align-items: stretch;
  padding: 3px;
  overflow: hidden;
  isolation: isolate;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface-raised);
  user-select: none;
  touch-action: none;
}
.segment-thumb {
  position: absolute;
  left: 0;
  top: 3px;
  bottom: 3px;
  border-radius: 999px;
  background: var(--accent);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .28), 0 2px 8px color-mix(in srgb, var(--accent) 28%, transparent);
  pointer-events: none;
  transition: transform 280ms cubic-bezier(.2, 1.15, .32, 1), width 280ms cubic-bezier(.2, 1.15, .32, 1);
}
.segment-track.is-dragging .segment-thumb { transition: none; }
.segment-item {
  position: relative;
  z-index: 1;
  display: inline-flex;
  min-width: 0;
  min-height: 32px;
  align-items: center;
  justify-content: center;
  padding: 5px 14px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: var(--fs-sm);
  line-height: 1.2;
  white-space: nowrap;
  cursor: grab;
}
.segment-track.is-dragging .segment-item { cursor: grabbing; }
.segment-item.is-on { color: var(--accent-ink); font-weight: 600; }
.segment-item:disabled { cursor: not-allowed; }
.segment-track.is-compact .segment-item { min-height: 28px; padding: 3px 11px; font-size: var(--fs-xs); }
.segment-track.is-disabled { opacity: .55; }
@media (prefers-reduced-motion: reduce) {
  .segment-thumb { transition: none; }
}
</style>
