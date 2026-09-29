<script setup lang="ts">
/* 换数据时会过渡的图表（切 7 天 / 1 个月 / 6 个月）。
 *
 * 以前是 notMerge 直接换 option、靠 ECharts 的更新动画补间：点数一样（7 天 ↔ 7 天）时线在
 * 原地挪，点数不一样时旧线和新线的点对不上，画面乱飞一下；7 天 → 6 个月干脆一帧跳过去，
 * 没有动画。现在不管从哪一档切到哪一档都是同一种过渡：旧图淡出，新图从左往右画出来、
 * 同时淡入。只动这块画布的 opacity（合成器）和 ECharts 自己的入场动画。
 *
 * 第一次出现不画入场动画（option 里的 animationDuration 原样生效，通常是 0）。 */
import { nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { CHART_THEME, VChart } from '../lib/echartsSetup';
import { SMOOTH_CHART_UPDATE } from '../lib/metricSeries';

defineOptions({ inheritAttrs: false });

const props = defineProps<{ option: Record<string, unknown>; ariaLabel?: string }>();
const emit = defineEmits<{ click: [event: { name?: string; data?: unknown }] }>();

const OUT_MS = 120;
const IN_MS = 220;
const DRAW_MS = 560;

const host = ref<HTMLElement | null>(null);
const shown = shallowRef<Record<string, unknown>>(props.option);
let running: Animation | null = null;
let token = 0;

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

watch(() => props.option, async (next) => {
  const el = host.value;
  const mine = ++token;
  if (!el || reduced()) {
    shown.value = next;
    return;
  }
  // 从画面上现在的透明度接着淡出（上一次还没淡完又切了一档）。
  const from = Number.parseFloat(getComputedStyle(el).opacity) || 0;
  running?.cancel();
  running = el.animate([{ opacity: from }, { opacity: 0 }], { duration: OUT_MS * from, easing: 'ease-in', fill: 'forwards' });
  try { await running.finished; } catch { return; }
  if (mine !== token) return;
  shown.value = { ...next, animationDuration: DRAW_MS, animationEasing: 'cubicOut' };
  await nextTick();
  if (mine !== token) return;
  running.cancel();
  running = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: IN_MS, easing: 'ease-out' });
  running.finished.then(() => { if (mine === token) running = null; }, () => undefined);
});

onBeforeUnmount(() => { running?.cancel(); });
</script>

<template>
  <div ref="host" v-bind="$attrs" class="swap-chart">
    <VChart
      class="swap-chart-canvas"
      :key="CHART_THEME"
      :theme="CHART_THEME"
      :option="shown"
      :update-options="SMOOTH_CHART_UPDATE"
      autoresize
      role="img"
      :aria-label="ariaLabel"
      @click="(event: { name?: string; data?: unknown }) => emit('click', event)"
    />
  </div>
</template>

<style scoped>
.swap-chart { position: relative; }
.swap-chart-canvas { width: 100%; height: 100%; }
</style>
