<script setup lang="ts">
/**
 * 品牌类图标：应用图标、品牌 Z 标、Zepp Cloud。
 * 应用图标和品牌 Z 标就是品牌本身，一律用原图（assets/design-icons），不重画。
 * Zepp Cloud 是内联 SVG：深色玻璃云 + 橄榄金描边，中间放的仍是品牌 Z 标原图。
 *
 * 类别图标不走这里：它们由 GlyphTile 用 Icon.vue 的图形画（lib/glyphs.ts）。DesignIconName 仍是
 * 那张表的键名，所以名字留着，但只有下面三个有图。
 */
import { computed, useId } from 'vue';
import appIcon from '../assets/design-icons/app-icon.png';
import brandMark from '../assets/design-icons/brand-mark.png';

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

/** 三团云：左小、中大、右中，底边平直。 */
const CLOUD = 'M6.4 19.5H17.6A4.5 4.5 0 0 0 17.58 10.5A6 6 0 0 0 5.6 10.98A4.3 4.3 0 0 0 6.4 19.5Z';

const id = useId();
const fill = `${id}-fill`;
const rim = `${id}-rim`;
const gloss = `${id}-gloss`;
const clip = `${id}-clip`;
const isCloud = computed(() => props.name === 'zepp-cloud');
const source = computed(() => (props.name === 'app-icon' ? appIcon : brandMark));
</script>

<template>
  <svg
    v-if="isCloud"
    class="design-icon is-zepp-cloud"
    viewBox="0 0 24 24"
    :width="size"
    :height="size"
    :role="alt ? 'img' : undefined"
    :aria-label="alt || undefined"
    :aria-hidden="alt ? undefined : true"
    focusable="false"
  >
    <defs>
      <linearGradient :id="fill" x1="0" y1="5" x2="0" y2="19.5" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#28312B" />
        <stop offset="1" stop-color="#0C110E" />
      </linearGradient>
      <linearGradient :id="rim" x1="5" y1="5" x2="19" y2="20" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#F0F6B8" />
        <stop offset=".45" stop-color="#C9D777" />
        <stop offset="1" stop-color="#66762A" />
      </linearGradient>
      <radialGradient :id="gloss" cx="11" cy="5" r="10" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#E8F0B0" stop-opacity=".22" />
        <stop offset="1" stop-color="#E8F0B0" stop-opacity="0" />
      </radialGradient>
      <clipPath :id="clip"><path :d="CLOUD" /></clipPath>
    </defs>
    <g transform="translate(12.1 12.25) scale(1.1) translate(-12.1 -12.25)">
    <path :d="CLOUD" fill="none" stroke="#C9D777" stroke-opacity=".08" stroke-width="2" stroke-linejoin="round" />
    <path :d="CLOUD" :fill="`url(#${fill})`" />
    <rect width="24" height="24" :fill="`url(#${gloss})`" :clip-path="`url(#${clip})`" />
    <path :d="CLOUD" fill="none" :stroke="`url(#${rim})`" stroke-width=".7" stroke-linejoin="round" />
    </g>
    <image :href="brandMark" x="5.6" y="8" width="12.8" height="12.8" />
  </svg>
  <img
    v-else
    class="design-icon"
    :src="source"
    :alt="alt"
    :width="size"
    :height="size"
    :style="{ width: `${size}px`, height: `${size}px` }"
    :aria-hidden="alt ? undefined : true"
    draggable="false"
  />
</template>

<style scoped>
.design-icon {
  display: block;
  flex: 0 0 auto;
  max-width: none;
  object-fit: contain;
  overflow: visible;
  user-select: none;
  -webkit-user-drag: none;
}
</style>
