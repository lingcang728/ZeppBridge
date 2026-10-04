<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { BRIDGE_RANGES } from '../../../lib/aiTask/bridgeScale';
import { useBridgeText } from './bridge.i18n';
const props = defineProps<{ modelValue: number; disabled?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [number]; preview: [number] }>();
const t = useBridgeText();
const track = ref<HTMLElement | null>(null), dragging = ref(false);
let frame = 0, choice = props.modelValue;
const at = (x: number) => {
  const rect = track.value?.getBoundingClientRect();
  if (!rect) return;
  const fraction = Math.max(0, Math.min(1, (x - rect.left) / rect.width));
  choice = BRIDGE_RANGES[Math.round((1 - fraction) * 3)];
  cancelAnimationFrame(frame); frame = requestAnimationFrame(() => emit('preview', choice));
};
const down = (e: PointerEvent) => { if (props.disabled || e.button !== 0) return; dragging.value = true; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); at(e.clientX); };
const move = (e: PointerEvent) => { if (dragging.value) at(e.clientX); };
const up = () => { if (!dragging.value) return; cancelAnimationFrame(frame); dragging.value = false; emit('update:modelValue', choice); };
const cancel = () => { if (!dragging.value) return; dragging.value = false; cancelAnimationFrame(frame); emit('preview', props.modelValue); };
const key = (e: KeyboardEvent) => {
  if (props.disabled || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  e.preventDefault(); const index = BRIDGE_RANGES.findIndex(v => v === props.modelValue);
  const next = e.key === 'Home' ? 90 : e.key === 'End' ? 7 : BRIDGE_RANGES[Math.max(0, Math.min(3, index + (e.key === 'ArrowLeft' ? 1 : -1)))];
  emit('update:modelValue', next);
};
onBeforeUnmount(() => cancelAnimationFrame(frame));
</script>
<template>
  <div class="range-control">
    <div ref="track" class="range-track" :class="{ dragging }" role="slider" tabindex="0" :aria-label="t.lookback" :aria-valuemin="7" :aria-valuemax="90" :aria-valuenow="modelValue" :aria-disabled="disabled" :title="t.rangeHint"
      @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="cancel" @lostpointercapture="cancel" @keydown="key">
      <i class="track-line"></i><i class="range-thumb" :style="{ left: `${100 - Math.max(0, BRIDGE_RANGES.indexOf(modelValue as 7 | 14 | 30 | 90)) / 3 * 100}%` }"><span></span><span></span></i>
    </div>
    <div class="range-labels"><button v-for="n in [...BRIDGE_RANGES].reverse()" :key="n" type="button" :disabled="disabled" :class="{ active: n === modelValue }" @click="emit('update:modelValue', n)">{{ t.days(n) }}</button></div>
  </div>
</template>
<style scoped src="./BridgeHandle.css"></style>
