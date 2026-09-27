<script setup lang="ts">
/**
 * 液态玻璃的 SVG 滤镜，全应用只挂一份（App.vue）。胶囊拖动时的镜片用
 * `filter: url(#zb-liquid-glass)` 叠在 `backdrop-filter` 上，把底下的字按玻璃边缘折射。
 *
 * 滤镜结构逐项移植自 rdev/liquid-glass-react 的 GlassFilter（MIT，Copyright 2025
 * Max Rovensky）：位移贴图 → 红绿蓝三路错开的位移做色散 → 只在边缘保留色散、中心
 * 保持原样。差别只有两处：
 *   - 位移贴图是构建期生成的实体 PNG（scripts/assets/generate-glass-map.py），不是
 *     运行时的 data: URL——本应用的 CSP 不允许 data: 图片；
 *   - 参数按 32px 高的小胶囊调小（原库的默认值是给整块大玻璃的）。
 *
 * 只有 Chromium（Windows 的 WebView2）能把 SVG 滤镜作用到 backdrop 上；WebKit（macOS、
 * Linux）不支持，给 <html> 挂 `has-liquid-glass` 的判断失败，镜片自动回落成原来的磨砂胶囊。
 */
import { onMounted } from 'vue';
import mapUrl from '../assets/glass/displacement-pill.png';

const SCALE = 26;
const ABERRATION = 2;

onMounted(() => {
  const ua = navigator.userAgent;
  const chromium = /(Chrome|Chromium|Edg)\//.test(ua) && !/Firefox\//.test(ua);
  const backdrop = typeof CSS !== 'undefined' && CSS.supports('backdrop-filter', 'blur(1px)');
  document.documentElement.classList.toggle('has-liquid-glass', chromium && backdrop);
});
</script>

<template>
  <svg class="liquid-glass-defs" width="0" height="0" aria-hidden="true" focusable="false">
    <defs>
      <filter id="zb-liquid-glass" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">
        <feImage x="0" y="0" width="100%" height="100%" result="DISPLACEMENT_MAP" :href="mapUrl" preserveAspectRatio="none" />
        <feColorMatrix in="DISPLACEMENT_MAP" type="matrix"
          values="0.3 0.3 0.3 0 0  0.3 0.3 0.3 0 0  0.3 0.3 0.3 0 0  0 0 0 1 0" result="EDGE_INTENSITY" />
        <feComponentTransfer in="EDGE_INTENSITY" result="EDGE_MASK">
          <feFuncA type="discrete" :tableValues="`0 ${ABERRATION * 0.05} 1`" />
        </feComponentTransfer>
        <feOffset in="SourceGraphic" dx="0" dy="0" result="CENTER_ORIGINAL" />
        <feDisplacementMap in="SourceGraphic" in2="DISPLACEMENT_MAP" :scale="SCALE" xChannelSelector="R" yChannelSelector="B" result="RED_DISPLACED" />
        <feColorMatrix in="RED_DISPLACED" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="RED_CHANNEL" />
        <feDisplacementMap in="SourceGraphic" in2="DISPLACEMENT_MAP" :scale="SCALE * (1 - ABERRATION * 0.05)" xChannelSelector="R" yChannelSelector="B" result="GREEN_DISPLACED" />
        <feColorMatrix in="GREEN_DISPLACED" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="GREEN_CHANNEL" />
        <feDisplacementMap in="SourceGraphic" in2="DISPLACEMENT_MAP" :scale="SCALE * (1 - ABERRATION * 0.1)" xChannelSelector="R" yChannelSelector="B" result="BLUE_DISPLACED" />
        <feColorMatrix in="BLUE_DISPLACED" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="BLUE_CHANNEL" />
        <feBlend in="GREEN_CHANNEL" in2="BLUE_CHANNEL" mode="screen" result="GB_COMBINED" />
        <feBlend in="RED_CHANNEL" in2="GB_COMBINED" mode="screen" result="RGB_COMBINED" />
        <feGaussianBlur in="RGB_COMBINED" :stdDeviation="Math.max(0.1, 0.5 - ABERRATION * 0.1)" result="ABERRATED_BLURRED" />
        <feComposite in="ABERRATED_BLURRED" in2="EDGE_MASK" operator="in" result="EDGE_ABERRATION" />
        <feComponentTransfer in="EDGE_MASK" result="INVERTED_MASK">
          <feFuncA type="table" tableValues="1 0" />
        </feComponentTransfer>
        <feComposite in="CENTER_ORIGINAL" in2="INVERTED_MASK" operator="in" result="CENTER_CLEAN" />
        <feComposite in="EDGE_ABERRATION" in2="CENTER_CLEAN" operator="over" />
      </filter>
    </defs>
  </svg>
</template>

<style scoped>
.liquid-glass-defs { position: absolute; width: 0; height: 0; overflow: hidden; pointer-events: none; }
</style>
