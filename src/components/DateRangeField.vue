<script setup lang="ts">
/**
 * 起止日期一行：还在持续（没有结束日期）时，开始日期独自居中；关掉持续，开始日期被推到左栏，
 * 结束日期从右边缓缓出来；再打开，原路退回（用户 2026-10-22：「全程都用过渡动画」）。
 *
 * 结束那一栏一直挂着，只是看不见、点不到（inert）：不用 v-if，免得滚轮挂上来那一帧闪一下，
 * 也让两栏的宽度始终一样，居中的位移就是「半栏 + 半个间距」，纯 CSS 就能算准。
 * 只动 transform / opacity；减弱动态时 shell.css 会把过渡时长压到几乎为零。
 * 窄屏（单栏）时开始日期不用居中，结束那一栏改成上下展开。
 */
defineProps<{ showEnd: boolean }>();
</script>

<template>
  <div :class="['date-range', { 'has-end': showEnd }]">
    <div class="dr-start"><slot name="start" /></div>
    <div class="dr-end" :aria-hidden="!showEnd" :inert="!showEnd || undefined"><slot name="end" /></div>
  </div>
</template>

<style scoped>
.date-range { --dr-gap: 12px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-rows: auto; gap: var(--dr-gap); }
.dr-start, .dr-end { min-width: 0; transition: transform 460ms cubic-bezier(.2, .9, .25, 1), opacity 320ms ease, visibility 0s; }
.dr-start { transform: translateX(calc(50% + var(--dr-gap) / 2)); }
.dr-end { visibility: hidden; opacity: 0; transform: translateX(28px); transition-delay: 0s, 0s, 460ms; }
.has-end .dr-start { transform: none; }
.has-end .dr-end { visibility: visible; opacity: 1; transform: none; transition-delay: 90ms, 90ms, 0s; }
@media (max-width: 480px) {
  .date-range { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto 0fr; transition: grid-template-rows 460ms cubic-bezier(.2, .9, .25, 1); }
  .date-range.has-end { grid-template-rows: auto 1fr; }
  .dr-start, .has-end .dr-start { transform: none; }
  .dr-end { overflow: hidden; min-height: 0; transform: translateY(-8px); }
}
</style>
