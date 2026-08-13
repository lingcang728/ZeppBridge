<script setup lang="ts">
import { computed } from 'vue';

type IconName =
  | 'activity'
  | 'arrow-right'
  | 'check'
  | 'chevron-down'
  | 'circle-check'
  | 'cloud'
  | 'copy'
  | 'database'
  | 'external'
  | 'file'
  | 'folder'
  | 'heart'
  | 'info'
  | 'link'
  | 'moon'
  | 'refresh'
  | 'shield'
  | 'sliders'
  | 'spark'
  | 'steps'
  | 'sun'
  | 'sync'
  | 'terminal'
  | 'trash'
  | 'warning'
  | 'wifi'
  | 'x';

const props = withDefaults(defineProps<{ name: IconName; size?: number; stroke?: number }>(), {
  size: 18,
  stroke: 1.8,
});

const iconLabel = computed(() => `icon-${props.name}`);
</script>

<template>
  <svg
    :width="props.size"
    :height="props.size"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    :aria-label="iconLabel"
    aria-hidden="true"
    focusable="false"
  >
    <path v-if="name === 'activity'" d="M3 12h3l2.1-6 4 12 2.2-6H21" :stroke-width="stroke" />
    <path v-else-if="name === 'arrow-right'" d="M5 12h14m-6-6 6 6-6 6" :stroke-width="stroke" />
    <path v-else-if="name === 'check'" d="m5 12 4 4L19 6" :stroke-width="stroke" />
    <path v-else-if="name === 'chevron-down'" d="m6 9 6 6 6-6" :stroke-width="stroke" />
    <g v-else-if="name === 'circle-check'">
      <circle cx="12" cy="12" r="8.5" :stroke-width="stroke" />
      <path d="m8.2 12 2.4 2.4 5.2-5.2" :stroke-width="stroke" />
    </g>
    <path v-else-if="name === 'cloud'" d="M7.1 18h9.5a4.4 4.4 0 0 0 .6-8.76A5.5 5.5 0 0 0 6.6 8.5 4.75 4.75 0 0 0 7.1 18Z" :stroke-width="stroke" />
    <g v-else-if="name === 'copy'">
      <rect x="8" y="8" width="11" height="11" rx="2" :stroke-width="stroke" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" :stroke-width="stroke" />
    </g>
    <path v-else-if="name === 'database'" d="M4 6c0-1.1 3.58-2 8-2s8 .9 8 2-3.58 2-8 2-8-.9-8-2Zm0 0v6c0 1.1 3.58 2 8 2s8-.9 8-2V6m-16 6v6c0 1.1 3.58 2 8 2s8-.9 8-2v-6" :stroke-width="stroke" />
    <path v-else-if="name === 'external'" d="M14 5h5v5m0-5-8 8M17 13v4a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h4" :stroke-width="stroke" />
    <path v-else-if="name === 'file'" d="M6 3.5h8l4 4V20H6V3.5Zm8 0v4h4M9 12h6m-6 3h6" :stroke-width="stroke" />
    <path v-else-if="name === 'folder'" d="M3.5 7.5h6l1.6 2h9.4v7.8a2.2 2.2 0 0 1-2.2 2.2H5.7a2.2 2.2 0 0 1-2.2-2.2V7.5Zm0 2h17" :stroke-width="stroke" />
    <path v-else-if="name === 'heart'" d="M20.6 8.8c0 5-8.6 10-8.6 10s-8.6-5-8.6-10A4.6 4.6 0 0 1 12 6.3a4.6 4.6 0 0 1 8.6 2.5Z" :stroke-width="stroke" />
    <g v-else-if="name === 'info'">
      <circle cx="12" cy="12" r="8.5" :stroke-width="stroke" />
      <path d="M12 10.7v5m0-7.7v.1" :stroke-width="stroke" />
    </g>
    <path v-else-if="name === 'link'" d="m9.5 14.5 5-5m-7.1 8.1-1 .1a3.5 3.5 0 0 1-3.2-5.8l2.2-2.2a3.5 3.5 0 0 1 5.8 1.1m1.3-3.5 1-.1a3.5 3.5 0 0 1 3.2 5.8l-2.2 2.2a3.5 3.5 0 0 1-5.8-1.1" :stroke-width="stroke" />
    <path v-else-if="name === 'moon'" d="M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10Z" :stroke-width="stroke" />
    <path v-else-if="name === 'refresh'" d="M20 11a8 8 0 0 0-13.7-4.9L4 8.4M4 4v4.4h4.4M4 13a8 8 0 0 0 13.7 4.9l2.3-2.3m0 4.4v-4.4h-4.4" :stroke-width="stroke" />
    <path v-else-if="name === 'shield'" d="M12 3.5 19 6v5.3c0 4.2-2.8 7.8-7 9.2-4.2-1.4-7-5-7-9.2V6l7-2.5Z" :stroke-width="stroke" />
    <path v-else-if="name === 'sliders'" d="M4 6h16M4 12h16M4 18h16M8 4v4M15 10v4M10 16v4" :stroke-width="stroke" />
    <path v-else-if="name === 'spark'" d="m12 3 1.2 5.8L19 10l-5.8 1.2L12 17l-1.2-5.8L5 10l5.8-1.2L12 3Zm6 13 .5 2.5L21 19l-2.5.5L18 22l-.5-2.5L15 19l2.5-.5L18 16Z" :stroke-width="stroke" />
    <path v-else-if="name === 'steps'" d="M6 19v-4h4v4m4 0v-7h4v7M8 15v-4h4v4m4-7V4h4v4" :stroke-width="stroke" />
    <g v-else-if="name === 'sun'">
      <circle cx="12" cy="12" r="3.5" :stroke-width="stroke" />
      <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" :stroke-width="stroke" />
    </g>
    <path v-else-if="name === 'sync'" d="M20 7v4h-4M4 17v-4h4m11.1-2A7.5 7.5 0 0 0 6.2 7L4 9m16 6-2.2 2a7.5 7.5 0 0 1-12.9-4" :stroke-width="stroke" />
    <path v-else-if="name === 'terminal'" d="m5 7 5 5-5 5m7 0h7" :stroke-width="stroke" />
    <path v-else-if="name === 'trash'" d="M5 7h14m-9 4v5m4-5v5M9 7V4h6v3m-9 0 1 13h10l1-13" :stroke-width="stroke" />
    <path v-else-if="name === 'warning'" d="m12 3 9 16H3L12 3Zm0 6v4m0 3v.1" :stroke-width="stroke" />
    <path v-else-if="name === 'wifi'" d="M3.5 8.8a13.4 13.4 0 0 1 17 0M6.5 12a8.6 8.6 0 0 1 11 0M9.4 15.2a4 4 0 0 1 5.2 0M12 18.7v.1" :stroke-width="stroke" />
    <path v-else-if="name === 'x'" d="m6 6 12 12M18 6 6 18" :stroke-width="stroke" />
  </svg>
</template>

<style scoped>
svg {
  display: block;
  flex: 0 0 auto;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
