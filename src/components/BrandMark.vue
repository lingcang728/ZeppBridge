<script setup lang="ts">
import masterSource from '../../src-tauri/icons/icon-source.svg?raw';

// Extract the master symbol at build time; external SVG fragments are not
// reliable for Vite data URLs in Chromium.
const brandMark = masterSource.match(/<symbol\s+id="brand-mark"[^>]*>([\s\S]*?)<\/symbol>/)?.[1] ?? '';
if (!brandMark) throw new Error('icon-source.svg is missing the brand-mark symbol');
</script>

<template>
  <svg
    class="brand-mark"
    viewBox="0 0 24 24"
    width="28"
    height="28"
    aria-hidden="true"
    focusable="false"
  >
    <g v-html="brandMark" />
  </svg>
</template>

<style scoped>
.brand-mark {
  display: block;
  flex: 0 0 auto;
  color: var(--icon-mint);
  overflow: visible;
}
</style>
