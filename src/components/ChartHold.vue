<script setup lang="ts">
/* 包住的那一片里的图表在 ready 之前只放空壳（lib/motion/chartHold.ts）。自己不出任何元素，不改排版。 */
import { toRef } from 'vue';
import { provideChartHold } from '../lib/motion/chartHold';

const props = defineProps<{ ready: boolean }>();
provideChartHold(toRef(props, 'ready'));
</script>

<template>
  <slot />
</template>
