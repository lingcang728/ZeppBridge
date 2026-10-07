<script setup lang="ts">
/**
 * 回溯范围（10-07 第二轮）：7 / 14 / 30 / 90 天四档，就是一条 Liquid Glass 分段（SegmentTrack）——
 * 拖着玻璃镜片走、点哪一档跳哪一档、方向键也行。以前是一根自己画的细滑杆加一排小字，和全应用的玻璃控件对不上。
 */
import { computed } from 'vue';
import SegmentTrack from '../../SegmentTrack.vue';
import { BRIDGE_RANGES } from '../../../lib/aiTask/bridgeScale';
import { useBridgeText } from './bridge.i18n';

const props = defineProps<{ modelValue: number; disabled?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [number]; preview: [number] }>();
const t = useBridgeText();
const items = computed(() => BRIDGE_RANGES.map((n) => ({ value: n as number, label: t.value.days(n) })));
const pick = (n: number) => {
  if (n === props.modelValue) return;
  emit('preview', n);
  emit('update:modelValue', n);
};
</script>

<template>
  <SegmentTrack class="range-track" :items="items" :model-value="modelValue" :disabled="disabled" :aria-label="t.lookback" :title="t.rangeHint" @update:model-value="pick" />
</template>
