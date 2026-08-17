<script setup lang="ts">
import { computed } from 'vue';

export type IconName =
  | 'activity'
  | 'arrow-left'
  | 'arrow-right'
  | 'bars'
  | 'bell'
  | 'box'
  | 'braces'
  | 'dots'
  | 'edit'
  | 'globe'
  | 'help'
  | 'key'
  | 'map'
  | 'mountain'
  | 'pin'
  | 'plus'
  | 'ring'
  | 'search'
  | 'send'
  | 'star'
  | 'table'
  | 'user'
  | 'training-load'
  | 'check'
  | 'chevron-down'
  | 'circle-check'
  | 'clock'
  | 'cloud'
  | 'compass'
  | 'copy'
  | 'database'
  | 'export'
  | 'external'
  | 'file'
  | 'flame'
  | 'folder'
  | 'gear'
  | 'grid'
  | 'heart'
  | 'heart-rest'
  | 'heart-max'
  | 'hrv'
  | 'info'
  | 'link'
  | 'lock'
  | 'monitor'
  | 'moon'
  | 'pace'
  | 'refresh'
  | 'run'
  | 'shield'
  | 'sliders'
  | 'spark'
  | 'spo2'
  | 'steps'
  | 'stress'
  | 'sun'
  | 'sync'
  | 'terminal'
  | 'trash'
  | 'vo2'
  | 'warning'
  | 'watch'
  | 'wifi'
  | 'x';

const props = withDefaults(defineProps<{ name: IconName; size?: number; stroke?: number }>(), {
  size: 18,
  stroke: 1.6,
});

const iconLabel = computed(() => `icon-${props.name}`);
// Keep the local icon family optically consistent while retaining the public
// `stroke` prop for callers that need a slightly lighter/heavier outline.
const stroke = computed(() => Math.min(1.75, Math.max(1.5, props.stroke)));
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
    <g v-if="name === 'activity' || name === 'run'" fill="currentColor" stroke="none">
      <circle cx="15.8" cy="4.7" r="1.8" />
      <path d="M11.3 7.3c.4-.7 1.3-1 2-.6l3.1 1.8 2.2-.3c.9-.1 1.6.5 1.7 1.3.1.8-.5 1.6-1.3 1.7l-2.8.4-1.5-.8 1.3 2.1 2.3 2.8c.5.6.4 1.5-.2 2-.6.5-1.5.4-2-.2l-2.5-3-1.2 2.4 2.2 3.1c.5.7.3 1.6-.4 2.1-.7.5-1.6.3-2.1-.4l-2.7-3.9c-.3-.5-.3-1.1 0-1.6l2.1-4.3-1.6.8-1.1 2.3c-.4.8-1.3 1.1-2.1.7-.8-.4-1.1-1.3-.7-2.1l1.6-3.4c.1-.2.3-.4.5-.5l3.5-2.1Z" />
    </g>
    <path v-else-if="name === 'arrow-left'" d="M19 12H5m6-6-6 6 6 6" :stroke-width="stroke" />
    <path v-else-if="name === 'arrow-right'" d="M5 12h14m-6-6 6 6-6 6" :stroke-width="stroke" />
    <g v-else-if="name === 'bars' || name === 'training-load'" fill="currentColor" stroke="none">
      <rect x="4" y="13" width="4" height="7" rx="1" />
      <rect x="10" y="9" width="4" height="11" rx="1" />
      <rect x="16" y="5" width="4" height="15" rx="1" />
      <path d="m4.6 10.8 3.5-2.7 3 1.5 5.8-5" fill="none" stroke="currentColor" :stroke-width="stroke" />
    </g>
    <path v-else-if="name === 'check'" d="m5 12 4 4L19 6" :stroke-width="stroke" />
    <path v-else-if="name === 'chevron-down'" d="m6 9 6 6 6-6" :stroke-width="stroke" />
    <g v-else-if="name === 'circle-check'">
      <circle cx="12" cy="12" r="8.5" :stroke-width="stroke" />
      <path d="m8.2 12 2.4 2.4 5.2-5.2" :stroke-width="stroke" />
    </g>
    <g v-else-if="name === 'clock'">
      <circle cx="12" cy="12" r="8.2" :stroke-width="stroke" />
      <path d="M12 7.5V12l3.2 2" :stroke-width="stroke" />
    </g>
    <path v-else-if="name === 'cloud'" d="M7.1 18h9.5a4.4 4.4 0 0 0 .6-8.76A5.5 5.5 0 0 0 6.6 8.5 4.75 4.75 0 0 0 7.1 18Z" :stroke-width="stroke" />
    <g v-else-if="name === 'compass'">
      <circle cx="12" cy="12" r="8.5" :stroke-width="stroke" />
      <path d="m15.5 8.5-5 2-2 5 5-2 2-5Z" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </g>
    <g v-else-if="name === 'copy'">
      <rect x="8" y="8" width="11" height="11" rx="2" :stroke-width="stroke" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" :stroke-width="stroke" />
    </g>
    <path v-else-if="name === 'database'" d="M4 6c0-1.1 3.58-2 8-2s8 .9 8 2-3.58 2-8 2-8-.9-8-2Zm0 0v6c0 1.1 3.58 2 8 2s8-.9 8-2V6m-16 6v6c0 1.1 3.58 2 8 2s8-.9 8-2v-6" :stroke-width="stroke" />
    <path v-else-if="name === 'export'" d="M12 15V4m0 0 4 4M12 4 8 8M5 16v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3" :stroke-width="stroke" />
    <path v-else-if="name === 'external'" d="M14 5h5v5m0-5-8 8M17 13v4a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h4" :stroke-width="stroke" />
    <path v-else-if="name === 'file'" d="M6 3.5h8l4 4V20H6V3.5Zm8 0v4h4M9 12h6m-6 3h6" :stroke-width="stroke" />
    <path v-else-if="name === 'flame'" d="M12 3s5 5.2 5 9.2A5 5 0 0 1 7 12c0-2.2 1.5-4.2 3-5.6-.2 1.8.4 3-1 4.2 2.4-.2 4.6-2 3-7.6Z" fill="currentColor" stroke="none" />
    <path v-else-if="name === 'folder'" d="M3.5 7.5h6l1.6 2h9.4v7.8a2.2 2.2 0 0 1-2.2 2.2H5.7a2.2 2.2 0 0 1-2.2-2.2V7.5Zm0 2h17" :stroke-width="stroke" />
    <g v-else-if="name === 'gear'">
      <circle cx="12" cy="12" r="3" :stroke-width="stroke" />
      <path d="M12 4.2 13.1 6.6l2.6.2 1.4 2.2-.9 2.4.9 2.4-1.4 2.2-2.6.2L12 19.8l-1.1-2.4-2.6-.2-1.4-2.2.9-2.4-.9-2.4 1.4-2.2 2.6-.2L12 4.2Z" :stroke-width="stroke" />
    </g>
    <path v-else-if="name === 'sliders'" d="M4 6h16M4 12h16M4 18h16M8 4v4M15 10v4M10 16v4" :stroke-width="stroke" />
    <path v-else-if="name === 'grid'" d="M4.5 4.5h6v6h-6Zm9 0h6v6h-6Zm-9 9h6v6h-6Zm9 0h6v6h-6Z" :stroke-width="stroke" />
    <path v-else-if="name === 'heart' || name === 'heart-rest'" d="M20.6 8.8c0 5-8.6 10-8.6 10s-8.6-5-8.6-10A4.6 4.6 0 0 1 12 6.3a4.6 4.6 0 0 1 8.6 2.5Z" fill="currentColor" stroke="none" />
    <g v-else-if="name === 'heart-max'" stroke="none">
      <path d="M20.6 8.8c0 5-8.6 10-8.6 10s-8.6-5-8.6-10A4.6 4.6 0 0 1 12 6.3a4.6 4.6 0 0 1 8.6 2.5Z" fill="currentColor" />
      <path d="M17.4 3.8v4.4m-2.2-2.2h4.4" fill="none" stroke="currentColor" :stroke-width="stroke" />
    </g>
    <path v-else-if="name === 'hrv'" d="M3 13h3l2-5 3 10 2.5-6H21" :stroke-width="stroke" />
    <g v-else-if="name === 'info'">
      <circle cx="12" cy="12" r="8.5" :stroke-width="stroke" />
      <path d="M12 10.7v5m0-7.7v.1" :stroke-width="stroke" />
    </g>
    <path v-else-if="name === 'link'" d="m9.5 14.5 5-5m-7.1 8.1-1 .1a3.5 3.5 0 0 1-3.2-5.8l2.2-2.2a3.5 3.5 0 0 1 5.8 1.1m1.3-3.5 1-.1a3.5 3.5 0 0 1 3.2 5.8l-2.2 2.2a3.5 3.5 0 0 1-5.8-1.1" :stroke-width="stroke" />
    <g v-else-if="name === 'lock'">
      <rect x="6" y="10" width="12" height="10" rx="2" :stroke-width="stroke" />
      <path d="M9 10V7.5a3 3 0 0 1 6 0V10" :stroke-width="stroke" />
    </g>
    <g v-else-if="name === 'monitor'">
      <rect x="3.5" y="5" width="17" height="11" rx="2" :stroke-width="stroke" />
      <path d="M8 20h8M12 16v4" :stroke-width="stroke" />
    </g>
    <g v-else-if="name === 'moon'">
      <path d="M16.8 13.6A6.4 6.4 0 0 1 8.6 5.2a6.8 6.8 0 1 0 9.4 9.6 6.2 6.2 0 0 1-1.2-1.2Z" fill="currentColor" stroke="none" />
      <path d="M16.4 5.2l.55 1.35L18.3 7.1l-1.35.55-.55 1.35-.55-1.35-1.35-.55 1.35-.55L16.4 5.2Z" fill="currentColor" stroke="none" />
      <path d="M20.2 9.1l.35.85.85.35-.85.35-.35.85-.35-.85-.85-.35.85-.35.35-.85Z" fill="currentColor" stroke="none" />
    </g>
    <g v-else-if="name === 'pace'">
      <circle cx="12" cy="13" r="7.2" :stroke-width="stroke" />
      <path d="M12 13 8.8 8.4M12 6V4" :stroke-width="stroke" />
    </g>
    <path v-else-if="name === 'refresh'" d="M20 11a8 8 0 0 0-13.7-4.9L4 8.4M4 4v4.4h4.4M4 13a8 8 0 0 0 13.7 4.9l2.3-2.3m0 4.4v-4.4h-4.4" :stroke-width="stroke" />
    <path v-else-if="name === 'shield'" d="M12 3.5 19 6v5.3c0 4.2-2.8 7.8-7 9.2-4.2-1.4-7-5-7-9.2V6l7-2.5Z" :stroke-width="stroke" />
    <path v-else-if="name === 'spark'" d="m12 3 1.2 5.8L19 10l-5.8 1.2L12 17l-1.2-5.8L5 10l5.8-1.2L12 3Zm6 13 .5 2.5L21 19l-2.5.5L18 22l-.5-2.5L15 19l2.5-.5L18 16Z" :stroke-width="stroke" />
    <g v-else-if="name === 'spo2'" stroke="none">
      <path d="M12 3.8c1.8 2.7 5.4 6.1 5.4 9.6a5.4 5.4 0 1 1-10.8 0c0-3.5 3.6-6.9 5.4-9.6Z" fill="currentColor" />
      <path d="M9.3 14.2c1.3 1.1 4.1 1.1 5.4 0" fill="none" stroke="currentColor" :stroke-width="stroke" />
    </g>
    <g v-else-if="name === 'steps'" fill="currentColor" stroke="none">
      <path d="M6.2 4.1c1.8.3 3.4 1.4 4.5 3l2.1 3.1 2.5 1.8c1 .7 2.1 1 3.4 1.1l.9.1c.9.1 1.5.8 1.4 1.7-.1.7-.5 1.3-1.2 1.7l-3.9-.6c-2-.3-3.7-1.3-4.9-2.9l-1.8-2.3-2.3 5.7c-.5 1.3-1.8 2-3.2 1.7l-1-.2c-.7-.2-1.1-.9-.9-1.6l2.6-9.9c.2-.8.9-1.3 1.6-1.2Z" />
      <path d="M5.2 19.8h10.2c.8 0 1.4-.5 1.7-1.2l.4-1.2-11.4-1.8-.9 2.2c-.3.9-.1 1.6 0 2Z" opacity=".7" />
    </g>
    <g v-else-if="name === 'stress'" fill="currentColor" stroke="none">
      <circle cx="12" cy="7" r="2.2" />
      <path d="M5.8 19c.4-3.9 2.5-6.1 6.2-6.1s5.8 2.2 6.2 6.1H5.8Z" />
    </g>
    <g v-else-if="name === 'sun'">
      <circle cx="12" cy="12" r="3.5" :stroke-width="stroke" />
      <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" :stroke-width="stroke" />
    </g>
    <path v-else-if="name === 'sync'" d="M20 7v4h-4M4 17v-4h4m11.1-2A7.5 7.5 0 0 0 6.2 7L4 9m16 6-2.2 2a7.5 7.5 0 0 1-12.9-4" :stroke-width="stroke" />
    <path v-else-if="name === 'terminal'" d="m5 7 5 5-5 5m7 0h7" :stroke-width="stroke" />
    <path v-else-if="name === 'trash'" d="M5 7h14m-9 4v5m4-5v5M9 7V4h6v3m-9 0 1 13h10l1-13" :stroke-width="stroke" />
    <g v-else-if="name === 'vo2'">
      <path d="M3.8 7.1h2l2.1 8.2L10 7.1h2l-3 10H6.8l-3-10Z" fill="currentColor" stroke="none" />
      <circle cx="16.7" cy="13.8" r="3.1" :stroke-width="stroke" />
    </g>
    <path v-else-if="name === 'warning'" d="m12 3 9 16H3L12 3Zm0 6v4m0 3v.1" :stroke-width="stroke" />
    <g v-else-if="name === 'watch'">
      <rect x="7.2" y="6.5" width="9.6" height="11" rx="2.4" :stroke-width="stroke" />
      <path d="M9 6.5V4.2h6V6.5M9 17.5v2.3h6V17.5" :stroke-width="stroke" />
    </g>
    <path v-else-if="name === 'wifi'" d="M3.5 8.8a13.4 13.4 0 0 1 17 0M6.5 12a8.6 8.6 0 0 1 11 0M9.4 15.2a4 4 0 0 1 5.2 0M12 18.7v.1" :stroke-width="stroke" />
    <path v-else-if="name === 'x'" d="m6 6 12 12M18 6 6 18" :stroke-width="stroke" />
    <path v-else-if="name === 'bell'" d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6Zm-8 9a2.2 2.2 0 0 0 4 0" :stroke-width="stroke" />
    <g v-else-if="name === 'help'">
      <circle cx="12" cy="12" r="8.5" :stroke-width="stroke" />
      <path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.8c0 1.6-2.4 2-2.4 3.4m0 2.9v.1" :stroke-width="stroke" />
    </g>
    <g v-else-if="name === 'user'">
      <circle cx="12" cy="8.4" r="3.4" :stroke-width="stroke" />
      <path d="M5.2 19.6c.7-3.5 3.3-5.4 6.8-5.4s6.1 1.9 6.8 5.4" :stroke-width="stroke" />
    </g>
    <path v-else-if="name === 'plus'" d="M12 5v14M5 12h14" :stroke-width="stroke" />
    <g v-else-if="name === 'globe'">
      <circle cx="12" cy="12" r="8.5" :stroke-width="stroke" />
      <path d="M3.5 12h17M12 3.5c2.4 2.3 3.6 5.2 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.2-3.6-8.5s1.2-6.2 3.6-8.5Z" :stroke-width="stroke" />
    </g>
    <g v-else-if="name === 'edit'">
      <path d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5" :stroke-width="stroke" />
      <path d="M17.7 3.9a2 2 0 0 1 2.8 2.8L12 15.2l-3.7.9.9-3.7 8.5-8.5Z" :stroke-width="stroke" />
    </g>
    <g v-else-if="name === 'key'">
      <circle cx="8" cy="15" r="4" :stroke-width="stroke" />
      <path d="m11 12 8.5-8.5M16 6l2.5 2.5M13.5 8.5 16 11" :stroke-width="stroke" />
    </g>
    <g v-else-if="name === 'search'">
      <circle cx="11" cy="11" r="6.5" :stroke-width="stroke" />
      <path d="m20 20-4.4-4.4" :stroke-width="stroke" />
    </g>
    <path v-else-if="name === 'star'" d="m12 3.5 2.5 5.3 5.8.7-4.3 4 1.1 5.7L12 16.4l-5.1 2.8 1.1-5.7-4.3-4 5.8-.7L12 3.5Z" :stroke-width="stroke" />
    <path v-else-if="name === 'send'" d="m4.5 11 15-6.5-4.5 15-3.4-6.1L4.5 11Zm7.1 2.4 7.9-8.9" :stroke-width="stroke" />
    <g v-else-if="name === 'dots'" fill="currentColor" stroke="none">
      <circle cx="6" cy="12" r="1.15" />
      <circle cx="12" cy="12" r="1.15" />
      <circle cx="18" cy="12" r="1.15" />
    </g>
    <path v-else-if="name === 'braces'" d="M8.5 4.5C7 4.5 6.5 5.5 6.5 7v2.5c0 1.2-.7 2-2 2.5 1.3.5 2 1.3 2 2.5V17c0 1.5.5 2.5 2 2.5m7-15c1.5 0 2 1 2 2.5v2.5c0 1.2.7 2 2 2.5-1.3.5-2 1.3-2 2.5V17c0 1.5-.5 2.5-2 2.5" :stroke-width="stroke" />
    <g v-else-if="name === 'table'">
      <rect x="4" y="5" width="16" height="14" rx="2" :stroke-width="stroke" />
      <path d="M4 10h16M10 10v9" :stroke-width="stroke" />
    </g>
    <g v-else-if="name === 'map'">
      <path d="m9 4.5-5 2v13l5-2 6 2 5-2v-13l-5 2-6-2Zm0 0v13m6-11v13" :stroke-width="stroke" />
    </g>
    <g v-else-if="name === 'pin'">
      <path d="M12 21s6.5-5.3 6.5-10.5a6.5 6.5 0 1 0-13 0C5.5 15.7 12 21 12 21Z" :stroke-width="stroke" />
      <circle cx="12" cy="10.3" r="2.3" :stroke-width="stroke" />
    </g>
    <path v-else-if="name === 'mountain'" d="m3.5 18.5 5.5-9.5 3.2 5.4 2.3-3.4 6 7.5h-17Z" :stroke-width="stroke" />
    <g v-else-if="name === 'ring'">
      <circle cx="12" cy="12" r="8" :stroke-width="stroke" />
      <circle cx="12" cy="12" r="4.4" :stroke-width="stroke" />
    </g>
    <g v-else-if="name === 'box'">
      <path d="M12 3.3 20 7.5v9L12 20.7 4 16.5v-9L12 3.3Zm-8 4.2 8 4.2 8-4.2M12 11.7v9" :stroke-width="stroke" />
    </g>
  </svg>
</template>

<style scoped>
svg {
  display: block;
  flex: 0 0 auto;
  overflow: visible;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
