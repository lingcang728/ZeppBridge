<script setup lang="ts">
/**
 * 「今日一问」缩小后的那枚小胶囊：挂在概览「我的指标」标题行右边（当天有效）。
 *
 * 今天有能问的就一直挂着、占着位置，没缩小时藏起来（visibility: hidden，读屏和 Tab 也跳过）：
 * 卡缩过来的那一下形变要先量到终点。形变由卡那头放（SuggestCards，lib/motion/chipFlight.ts），
 * 飞的时候胶囊藏着，板落定、撤掉的同一帧它亮出来。点胶囊：标上「从胶囊长回来」，把卡放回去，卡那头接着放形变。
 * 设置里把「今日一问」整个关掉时胶囊也不出。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import Icon from '../Icon.vue';
import { suggestAvailable, suggestChip, suggestMorph, useSuggestCards } from '../../composables/useSuggestCards';
import { reducedMotion } from '../../lib/motion/cards';
import { useSuggestText } from './suggest.i18n';

const t = useSuggestText();
const prefs = useSuggestCards();
const chip = ref<HTMLButtonElement | null>(null);
const present = computed(() => prefs.enabled() && suggestAvailable.value);
const shown = computed(() => present.value && prefs.minimized() && suggestMorph.value === 'idle');
watch(chip, (el) => { suggestChip.value = el; }, { immediate: true });
onBeforeUnmount(() => { if (suggestChip.value === chip.value) suggestChip.value = null; });

const restore = () => {
  if (!shown.value) return;
  if (!reducedMotion()) suggestMorph.value = 'from-chip';
  prefs.restore();
};
</script>

<template>
  <button v-if="present" ref="chip" type="button" :class="['suggest-chip', { hidden: !shown }]" :aria-label="t.restore" :title="t.restore"
    :aria-hidden="!shown || undefined" :tabindex="shown ? undefined : -1" @click="restore">
    <span class="chip-glyph" aria-hidden="true"><Icon name="spark" :size="12" /></span>
    <span class="chip-label">{{ t.aria }}</span>
  </button>
</template>

<style scoped>
.suggest-chip { display: inline-flex; align-items: center; gap: 7px; height: 32px; margin-left: auto; padding: 0 13px 0 7px; border: 0; border-radius: 999px;
  background: var(--mat-raised); box-shadow: var(--mat-raised-rim, inset 0 0 0 1px var(--mat-line)), 0 8px 18px -12px rgb(0 0 0 / .6);
  color: var(--ink); font: 650 var(--fs-xs) var(--font-sans); white-space: nowrap; cursor: pointer; transition: scale 200ms cubic-bezier(.3, 1.3, .5, 1); }
.suggest-chip.hidden { visibility: hidden; pointer-events: none; }
.suggest-chip:hover { scale: 1.04; }
.suggest-chip:active { scale: .96; }
.suggest-chip:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.chip-glyph { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: color-mix(in srgb, var(--accent) 22%, transparent); color: var(--accent); }
</style>
