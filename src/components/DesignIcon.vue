<script setup lang="ts">
/**
 * 品牌类图标：应用图标、品牌 Z 标、Zepp Cloud。内联 SVG，和 src-tauri/icons/icon-source.svg 同一套
 * 「双轨 Z」几何；两条轨道各用一段渐变（亮橄榄金 → 深橄榄），任意尺寸都清楚，不再是 72 / 168 px 的位图放大。
 *
 * 类别图标不走这里：它们由 GlyphTile 用 Icon.vue 的图形画（lib/glyphs.ts）。DesignIconName 仍是
 * 那张表的键名，所以名字留着，但只有下面三个有图。
 */
import { computed, useId } from 'vue';

export type DesignIconName =
  | 'ai-ready'
  | 'app-icon'
  | 'auto-sync'
  | 'body-activity'
  | 'brand-mark'
  | 'browser-login'
  | 'chevron-right'
  | 'cloud-output'
  | 'database'
  | 'document'
  | 'handoff'
  | 'health-watch'
  | 'heart-rate'
  | 'maintenance'
  | 'manual-entry'
  | 'outdoor-cycling'
  | 'outdoor-run'
  | 'overview'
  | 'pace'
  | 'power'
  | 'stride'
  | 'contact'
  | 'oscillation'
  | 'ratio'
  | 'private'
  | 'profile'
  | 'recovery'
  | 'resting-heart-rate'
  | 'secure'
  | 'settings'
  | 'sleep'
  | 'sleep-waves'
  | 'steps'
  | 'structured-data'
  | 'training-load'
  | 'verified'
  | 'vo2-max'
  | 'zepp-cloud';

const props = withDefaults(defineProps<{
  name: DesignIconName;
  size?: number;
  alt?: string;
}>(), {
  size: 32,
  alt: '',
});

const id = useId();
const front = `${id}-front`;
const back = `${id}-back`;
const tile = `${id}-tile`;
const kind = computed(() => (props.name === 'app-icon' || props.name === 'zepp-cloud' ? props.name : 'brand-mark'));
</script>

<template>
  <svg
    class="design-icon"
    :class="`is-${kind}`"
    viewBox="0 0 24 24"
    :width="size"
    :height="size"
    :role="alt ? 'img' : undefined"
    :aria-label="alt || undefined"
    :aria-hidden="alt ? undefined : true"
    focusable="false"
  >
    <defs>
      <linearGradient :id="front" x1="4" y1="5" x2="20" y2="19" gradientUnits="userSpaceOnUse">
        <stop offset="0" style="stop-color: var(--brand-rail-hi)" />
        <stop offset="1" style="stop-color: var(--brand-rail-lo)" />
      </linearGradient>
      <linearGradient :id="back" x1="20" y1="5" x2="8" y2="19" gradientUnits="userSpaceOnUse">
        <stop offset="0" style="stop-color: var(--brand-rail-hi); stop-opacity: .92" />
        <stop offset="1" style="stop-color: var(--brand-rail-mid)" />
      </linearGradient>
      <linearGradient :id="tile" x1="0" y1="0" x2="0" y2="24" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#1B2420" />
        <stop offset="1" stop-color="#0C110F" />
      </linearGradient>
    </defs>

    <template v-if="kind === 'app-icon'">
      <rect x="0.5" y="0.5" width="23" height="23" rx="5.3" :fill="`url(#${tile})`" />
      <rect x="0.5" y="0.5" width="23" height="23" rx="5.3" fill="none" style="stroke: var(--brand-rail-hi); stroke-opacity: .28" stroke-width=".6" />
      <g transform="translate(3.2 3.2) scale(.733)">
        <path d="M20.2 5L8 19H20.2" fill="none" :stroke="`url(#${back})`" stroke-width="3.1" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M3.8 5H16.2L4 19" fill="none" :stroke="`url(#${front})`" stroke-width="3.1" stroke-linecap="round" stroke-linejoin="round" />
      </g>
    </template>

    <template v-else-if="kind === 'zepp-cloud'">
      <path d="M6.6 20h11a5 5 0 0 0 .7-9.95A6.3 6.3 0 0 0 6.1 9.3 5.4 5.4 0 0 0 6.6 20Z" style="fill: var(--brand-cloud-fill); stroke: var(--brand-rail-mid)" stroke-width="1.2" stroke-linejoin="round" />
      <path d="M8.6 11.6h5.4l-5.3 5.6h6" fill="none" :stroke="`url(#${front})`" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" />
    </template>

    <template v-else>
      <path d="M20.2 5L8 19H20.2" fill="none" :stroke="`url(#${back})`" stroke-width="3.1" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M3.8 5H16.2L4 19" fill="none" :stroke="`url(#${front})`" stroke-width="3.1" stroke-linecap="round" stroke-linejoin="round" />
    </template>
  </svg>
</template>

<style scoped>
.design-icon {
  /* 品牌色：深色界面上是亮橄榄金；浅色界面压深一档，白底上也立得住（tokens.css 不收品牌图的私有色）。 */
  --brand-rail-hi: #E4EDA0;
  --brand-rail-mid: #B9C964;
  --brand-rail-lo: #8FA23E;
  --brand-cloud-fill: rgba(205, 220, 124, .12);
  display: block;
  flex: 0 0 auto;
  max-width: none;
  overflow: visible;
  user-select: none;
}
</style>

<style>
/* 浅色界面：品牌轨道压深一档（不能写成 scoped 的 :global(html[...]) .x，那样编译后只剩 html 选择器）。 */
html[data-theme='light'] .design-icon:not(.is-app-icon) {
  --brand-rail-hi: #9DB043;
  --brand-rail-mid: #7A8C2C;
  --brand-rail-lo: #55661C;
  --brand-cloud-fill: rgba(122, 140, 44, .1);
}
</style>
