<script setup lang="ts">
/**
 * 一步的精调（单天页里点开某一步）：玻璃两档「按时间 / 按距离」、四档目标「心率 / 配速 / 功率 / 不设」，
 * 数值用滚轮拨。每拨一下交出一次 `change`，页面攒一下（350ms）再改草稿，后端重新校验。
 * 全部写法都已在手表上实测过（2026-10-06，见 core training_plan::VERIFIED）。
 */
import { computed } from 'vue';
import SegmentTrack from '../SegmentTrack.vue';
import WheelColumn from '../WheelColumn.vue';
import type { PlanStepLength, PlanTarget } from '../../types/trainingPlan';
import { useEditorText } from './editor.i18n';

const props = defineProps<{ length: PlanStepLength; target: PlanTarget }>();
const emit = defineEmits<{ length: [PlanStepLength]; target: [PlanTarget] }>();
const e = useEditorText();
const range = (from: number, to: number, step: number, label: (n: number) => string = String) =>
  Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => ({ value: from + i * step, label: label(from + i * step) }));
const pace = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

const lengthItems = computed(() => [{ value: 'time', label: e.value.byTime }, { value: 'distance', label: e.value.byDistance }]);
const targetItems = computed(() => [
  { value: 'heart_rate', label: e.value.targetHr }, { value: 'pace', label: e.value.targetPace },
  { value: 'power', label: e.value.targetPower }, { value: 'open', label: e.value.targetOpen },
]);
const MINUTES = range(0, 240, 1);
const SECONDS = range(0, 30, 30);
const KM = range(0, 60, 1);
const HUNDREDS = range(0, 9, 1);
const BPM = range(40, 220, 5);
const PACE = range(150, 900, 5, pace);
const WATTS = range(50, 800, 5);

const setMode = (mode: string) => {
  if (mode === props.length.type) return;
  emit('length', mode === 'time' ? { type: 'time', seconds: 600 } : { type: 'distance', meters: 1000 });
};
const time = computed(() => (props.length.type === 'time' ? props.length.seconds : 0));
const meters = computed(() => (props.length.type === 'distance' ? props.length.meters : 0));
const setTime = (minutes: number, seconds: number) => emit('length', { type: 'time', seconds: Math.max(30, minutes * 60 + seconds) });
const setDistance = (km: number, hundreds: number) => emit('length', { type: 'distance', meters: Math.max(100, km * 1000 + hundreds * 100) });

const setKind = (kind: string) => {
  if (kind === props.target.type) return;
  const next: Record<string, PlanTarget> = {
    heart_rate: { type: 'heart_rate', low: 120, high: 140 },
    pace: { type: 'pace', fast: 300, slow: 330 },
    power: { type: 'power', low: 150, high: 180 },
    open: { type: 'open' },
  };
  emit('target', next[kind]!);
};
/** 两端分开拨：低端不许越过高端（配速是快端不许慢过慢端），越过就推着另一端走。 */
const setRange = (which: 'low' | 'high', value: number) => {
  const t = props.target;
  if (t.type === 'heart_rate' || t.type === 'power') {
    const low = which === 'low' ? value : Math.min(t.low, value - 5);
    const high = which === 'high' ? value : Math.max(t.high, value + 5);
    emit('target', { ...t, low, high });
  } else if (t.type === 'pace') {
    const fast = which === 'low' ? value : Math.min(t.fast, value - 5);
    const slow = which === 'high' ? value : Math.max(t.slow, value + 5);
    emit('target', { type: 'pace', fast, slow });
  }
};
</script>

<template>
  <div class="step-editor">
    <div class="row">
      <SegmentTrack compact :items="lengthItems" :model-value="length.type" :aria-label="e.byTime" @update:model-value="setMode" />
      <div v-if="length.type === 'time'" class="wheels">
        <WheelColumn :items="MINUTES" :model-value="Math.floor(time / 60)" :label="e.minutes" @update:model-value="setTime($event, time % 60 >= 30 ? 30 : 0)" /><span>{{ e.minutes }}</span>
        <WheelColumn :items="SECONDS" :model-value="time % 60 >= 30 ? 30 : 0" :label="e.seconds" @update:model-value="setTime(Math.floor(time / 60), $event)" /><span>{{ e.seconds }}</span>
      </div>
      <div v-else class="wheels">
        <WheelColumn :items="KM" :model-value="Math.floor(meters / 1000)" :label="e.km" @update:model-value="setDistance($event, Math.round((meters % 1000) / 100))" /><span>{{ e.km }}</span>
        <WheelColumn :items="HUNDREDS" :model-value="Math.round((meters % 1000) / 100)" :label="e.hundredMeters" @update:model-value="setDistance(Math.floor(meters / 1000), $event)" /><span>{{ e.hundredMeters }}</span>
      </div>
    </div>
    <div class="row">
      <SegmentTrack compact :items="targetItems" :model-value="target.type" :aria-label="e.targetHr" @update:model-value="setKind" />
      <div v-if="target.type === 'heart_rate'" class="wheels">
        <WheelColumn :items="BPM" :model-value="target.low" :label="e.low" @update:model-value="setRange('low', $event)" /><span>–</span>
        <WheelColumn :items="BPM" :model-value="target.high" :label="e.high" @update:model-value="setRange('high', $event)" /><span>bpm</span>
      </div>
      <div v-else-if="target.type === 'pace'" class="wheels">
        <WheelColumn :items="PACE" :model-value="target.fast" :label="e.fast" @update:model-value="setRange('low', $event)" /><span>–</span>
        <WheelColumn :items="PACE" :model-value="target.slow" :label="e.slow" @update:model-value="setRange('high', $event)" /><span>/km</span>
      </div>
      <div v-else-if="target.type === 'power'" class="wheels">
        <WheelColumn :items="WATTS" :model-value="target.low" :label="e.low" @update:model-value="setRange('low', $event)" /><span>–</span>
        <WheelColumn :items="WATTS" :model-value="target.high" :label="e.high" @update:model-value="setRange('high', $event)" /><span>W</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.step-editor { display: grid; gap: 12px; padding: 12px 0 6px 24px; }
.row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 18px; }
.wheels { display: flex; align-items: center; gap: 6px; color: var(--subtle); font-size: var(--fs-2xs); }
.wheels :deep(.wheel-col) { width: 64px; }
</style>
