<script setup lang="ts">
/**
 * 信匣里摆着的一只信封（来信、每周来信、时间胶囊共用；2026-10-29 用户：除了来信，别的都不像信、像硬贴上去的贴纸）。
 * 按 480 宽画（邮票、火漆的比例和弹窗里那只一样）再缩小摆进格子，微微歪着；鼠标放上去摆正、抬起来。
 * 点开由外面接：同一只信封放大成弹窗，翻面、拆火漆、抽信纸（LetterEnvelope）。默认插槽放盖在信封上的章（「已回」）。
 */
import EnvelopeArt from './EnvelopeArt.vue';

withDefaults(defineProps<{
  label: string;
  version?: string;
  face?: 'front' | 'back';
  to?: string;
  stampLabel?: string;
  mine?: boolean;
  postmark?: string;
  tilt?: number;
}>(), { version: '', face: 'front', to: '', stampLabel: '', mine: false, postmark: '', tilt: 0 });
const emit = defineEmits<{ (event: 'open', value: MouseEvent): void }>();
</script>

<template>
  <button type="button" class="envelope-tile" :style="{ '--tilt': `${tilt}deg` }" :aria-label="label" @click="emit('open', $event)">
    <span class="tile-scale">
      <EnvelopeArt :version="version" :face="face" :to="to" :stamp-label="stampLabel" :mine="mine" :postmark="postmark">
        <template #seal><slot name="seal" /></template>
      </EnvelopeArt>
    </span>
    <slot />
  </button>
</template>

<style scoped>
.envelope-tile {
  position: relative; display: block; width: 300px; height: 188px; padding: 0; border: 0; background: none; cursor: pointer;
  transform: rotate(var(--tilt)); transition: transform 320ms cubic-bezier(.3, .7, .3, 1);
}
.envelope-tile:hover { transform: rotate(0deg) translateY(-6px); }
.envelope-tile:focus-visible { outline: 2px solid var(--focus); outline-offset: 6px; border-radius: 4px; }
.tile-scale { display: block; width: 480px; transform: scale(.625); transform-origin: 0 0; }
@media (max-width: 600px) {
  .envelope-tile { width: 260px; height: 163px; }
  .tile-scale { transform: scale(.5417); }
}
@media (prefers-reduced-motion: reduce) { .envelope-tile { transition: none; } }
</style>
