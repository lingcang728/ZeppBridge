<script setup lang="ts">
/* 「推送到你自己的站点」的小演示（2026-11-18）：电脑 → 加密 → 你的站点 → 手机 / AI，一颗数据点沿线走一遍。
 * 用来代替一段原理说明：看一眼就知道数据往哪走、在哪一步变成密文。
 * 只动 transform / opacity（每段一条整宽的轨道整体平移，点画在轨道左端）；减少动态效果时点静止在线中间。 */
import Icon from '../../../components/Icon.vue';
import { useMessages } from '../../../i18n';
import { pushMessages } from './push.i18n';

const t = useMessages(pushMessages);
</script>

<template>
  <div class="flow" aria-hidden="true">
    <div class="node"><span class="disc"><Icon name="monitor" :size="18" /></span><small>{{ t.flowComputer }}</small></div>
    <span class="seg s1"><i class="run"><b></b></i></span>
    <div class="node"><span class="disc lock"><Icon name="lock" :size="18" /></span><small>{{ t.flowLock }}</small></div>
    <span class="seg s2 sealed"><i class="run"><b></b></i></span>
    <div class="node"><span class="disc"><Icon name="globe" :size="18" /></span><small>{{ t.flowSite }}</small></div>
    <span class="seg s3 sealed"><i class="run"><b></b></i></span>
    <div class="node"><span class="disc"><Icon name="watch" :size="18" /></span><small>{{ t.flowReader }}</small></div>
  </div>
</template>

<style scoped>
.flow { display: flex; align-items: flex-start; gap: 0; padding: 6px 0 2px; }
.node { flex: 0 0 auto; width: 4.6rem; display: grid; justify-items: center; gap: 6px; min-width: 0; }
.node small { max-width: 100%; color: var(--muted); font-size: var(--fs-xs); line-height: 1.3; text-align: center; overflow-wrap: anywhere; hyphens: auto; }
.disc { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 50%; color: var(--ink);
  background: var(--mat-inset); box-shadow: inset 0 0 0 1px var(--mat-line); }
.disc.lock { color: var(--accent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent); }
/* 线和点：线在圆心那一高度。 */
.seg { position: relative; flex: 1 1 0; min-width: 18px; height: 38px; overflow: hidden; }
.seg::before { content: ''; position: absolute; inset: 50% 0 auto; border-top: 1.5px dashed color-mix(in srgb, var(--ink) 22%, transparent); }
.run { position: absolute; inset: 0; animation: travel 3.6s cubic-bezier(.45, 0, .55, 1) infinite; opacity: 0; }
.run > b { position: absolute; left: 0; top: 50%; width: 8px; height: 8px; margin: -4px 0 0 -4px; border-radius: 50%; background: var(--accent); }
.sealed .run > b { border-radius: 2px; background: color-mix(in srgb, var(--accent) 55%, var(--ink)); }
.s2 .run { animation-delay: 1.2s; }
.s3 .run { animation-delay: 2.4s; }
@keyframes travel {
  0% { transform: translateX(0); opacity: 0; }
  5% { opacity: 1; }
  28% { opacity: 1; }
  33.3% { transform: translateX(100%); opacity: 0; }
  100% { transform: translateX(100%); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .run { animation: none; opacity: 1; transform: translateX(50%); }
}
</style>
