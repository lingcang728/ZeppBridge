<script setup lang="ts">
/* 落地页自己的一小套线性图标（24 网格、1.7 描边、圆角端点），不背应用那张大图标表。 */
export type LandingIconName =
  | 'watch' | 'laptop' | 'sparkle' | 'arrow-right' | 'download' | 'github' | 'lock' | 'folder'
  | 'terminal' | 'globe' | 'moon' | 'sun' | 'check' | 'key' | 'eye-off' | 'file' | 'cloud' | 'chevron-down' | 'x'
  | 'heart' | 'activity' | 'calendar' | 'sliders';

withDefaults(defineProps<{ name: LandingIconName; size?: number }>(), { size: 20 });
</script>

<template>
  <svg
    class="lp-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path v-if="name === 'heart'" d="M20.5 5.7a5 5 0 0 0-7.1 0L12 7.1l-1.4-1.4a5 5 0 0 0-7.1 7.1L12 21l8.5-8.2a5 5 0 0 0 0-7.1Z" />
    <path v-else-if="name === 'activity'" d="M2 12h5l3-8 4 16 3-8h5" />
    <template v-else-if="name === 'calendar'"><rect x="4" y="5" width="16" height="16" rx="3" /><path d="M8 3v4M16 3v4M4 10h16M8 14h2M14 14h2M8 17h2" /></template>
    <template v-else-if="name === 'sliders'"><path d="M5 3v5M5 12v9M12 3v10M12 17v4M19 3v2M19 9v12" /><path d="M2 8h6v4H2zM9 13h6v4H9zM16 5h6v4h-6z" /></template>
    <template v-else-if="name === 'watch'">
      <rect x="6" y="6" width="12" height="12" rx="3.5" />
      <path d="M9 6 9.6 2.8h4.8L15 6M9 18l.6 3.2h4.8L15 18M12 9.5V12l1.6 1" />
    </template>
    <template v-else-if="name === 'x'">
      <path d="M6 6l12 12M18 6 6 18" />
    </template>
    <template v-else-if="name === 'laptop'">
      <rect x="4" y="5" width="16" height="11" rx="2" />
      <path d="M2.5 19h19" />
    </template>
    <path v-else-if="name === 'sparkle'" d="M12 3c.6 3.9 2.1 5.4 6 6-3.9.6-5.4 2.1-6 6-.6-3.9-2.1-5.4-6-6 3.9-.6 5.4-2.1 6-6ZM18.5 15.5c.3 1.6.9 2.2 2.5 2.5-1.6.3-2.2.9-2.5 2.5-.3-1.6-.9-2.2-2.5-2.5 1.6-.3 2.2-.9 2.5-2.5Z" />
    <path v-else-if="name === 'arrow-right'" d="M5 12h14m-6-6 6 6-6 6" />
    <path v-else-if="name === 'download'" d="M12 4v11m-5-5 5 5 5-5M5 20h14" />
    <path
      v-else-if="name === 'github'"
      d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"
    />
    <template v-else-if="name === 'lock'">
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5v2" />
    </template>
    <path v-else-if="name === 'folder'" d="M3.5 7.5A2 2 0 0 1 5.5 5.5h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" />
    <template v-else-if="name === 'terminal'">
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <path d="m7 9.5 3 2.5-3 2.5M12.5 15h4.5" />
    </template>
    <template v-else-if="name === 'globe'">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.4 2.4 3.4 5.2 3.4 8.5s-1 6.1-3.4 8.5c-2.4-2.4-3.4-5.2-3.4-8.5s1-6.1 3.4-8.5Z" />
    </template>
    <path v-else-if="name === 'moon'" d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
    <template v-else-if="name === 'sun'">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
    </template>
    <path v-else-if="name === 'check'" d="m5 12.5 4.5 4.5L19 7.5" />
    <template v-else-if="name === 'key'">
      <circle cx="8" cy="15" r="4" />
      <path d="m11 12 8.5-8.5M16.5 6.5l2.5 2.5M14.5 8.5l2 2" />
    </template>
    <path v-else-if="name === 'eye-off'" d="M3 3l18 18M10.6 5.1A9.7 9.7 0 0 1 12 5c5 0 8.5 4.5 9.5 7a13 13 0 0 1-2.6 3.8M6.6 6.6C4.5 8 3.1 10 2.5 12c1 2.5 4.5 7 9.5 7 1.7 0 3.2-.5 4.5-1.3M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    <template v-else-if="name === 'file'">
      <path d="M6.5 3h7l4.5 4.5V19a2 2 0 0 1-2 2h-9.5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M13.5 3v4.5H18M8.5 13h7M8.5 16.5h5" />
    </template>
    <path v-else-if="name === 'cloud'" d="M7 18.5a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 8.5a4.9 4.9 0 0 1-.5 10Z" />
    <path v-else-if="name === 'chevron-down'" d="m6 9 6 6 6-6" />
  </svg>
</template>

<style scoped>
.lp-icon { flex: 0 0 auto; }
</style>
