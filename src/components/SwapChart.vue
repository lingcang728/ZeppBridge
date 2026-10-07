<script setup lang="ts">
/* 换数据时会过渡的图表（切 7 天 / 1 个月 / 6 个月）。
 *
 * 前两版都不对：
 *   - 合并更新、靠 ECharts 补间：7 天和 30 天的点数不一样，ECharts 按下标对点，线在半路
 *     乱折、两端各缺一截；
 *   - 旧图先淡到 0、再让新图从左往右画：中间整块空一拍，十来张图各自整张逐帧重画
 *     560ms，高分屏上又卡又费电。
 *
 * 现在是交叉溶解：换数据那一刻把画布上的旧图拷一份（一次 drawImage，GPU 上拷贝），
 * 盖在原处；新图不带任何动画一次画好，从下面淡上来，旧图的拷贝同时淡掉、朝时间轴的
 * 方向轻轻缩放一下（范围变长往右收、变短往外放），像同一条线换了个远近。全程画面上
 * 始终有线，只动两块画布的 opacity / transform，都在合成器上。
 *
 * 只有切范围才溶解（lib/chartSwap.ts）：换主题、换语言、同步来了新数据都是原地换掉。
 * 图表自己永远不播 ECharts 的入场 / 更新动画（animation: false）——所以缓存页回场、
 * 换主题重建画布时，也不会再「重画一遍」。 */
import { onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { CHART_THEME, VChart } from '../lib/echartsSetup';
import { SMOOTH_CHART_UPDATE } from '../lib/metricSeries';
import { chartSwapIntent } from '../lib/chartSwap';
import { currentSweep, sweepDelay, type AshSweep } from '../lib/motion/ashReveal';

defineOptions({ inheritAttrs: false });

const props = defineProps<{ option: Record<string, unknown>; ariaLabel?: string }>();
type ChartPointerEvent = { name?: string; data?: unknown; componentType?: string };
const emit = defineEmits<{
  click: [event: ChartPointerEvent];
  mouseover: [event: ChartPointerEvent];
  mouseout: [event: ChartPointerEvent];
  axis: [index: number | null];
}>();
/* 坐标轴指示器停在第几格（类目轴给的是下标）；指示器收起时给 null。 */
/* vue-echarts 8 把事件参数标成通用的 Payload，形状在这里自己收窄。 */
const onAxisPointer = (payload: unknown) => {
  const event = payload as { axesInfo?: { axisDim?: string; value?: unknown }[] };
  const x = event.axesInfo?.find((info) => info.axisDim === 'x');
  emit('axis', typeof x?.value === 'number' ? x.value : null);
};

const FADE_MS = 400;
const EASE = 'cubic-bezier(.2, .8, .2, 1)';
/** 缩放的幅度：只是个方向感，大了坐标轴上的字会被明显拉宽。 */
const SQUASH = 0.04;

const still = (option: Record<string, unknown>) => ({ ...option, animation: false });

const host = ref<HTMLElement | null>(null);
const canvasHost = ref<HTMLElement | null>(null);
const shown = shallowRef<Record<string, unknown>>(still(props.option));
let incoming: Animation | null = null;
const ghosts = new Set<HTMLCanvasElement>();

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** 把画布上此刻的样子拷一份，铺在同一个位置。 */
const snapshot = (el: HTMLElement): HTMLCanvasElement | null => {
  const source = canvasHost.value?.querySelector('canvas');
  if (!source || !source.width || !source.height) return null;
  const copy = document.createElement('canvas');
  copy.width = source.width;
  copy.height = source.height;
  const context = copy.getContext('2d');
  if (!context) return null;
  context.drawImage(source, 0, 0);
  copy.className = 'swap-chart-ghost';
  copy.setAttribute('aria-hidden', 'true');
  el.appendChild(copy);
  ghosts.add(copy);
  return copy;
};

const dropGhost = (ghost: HTMLCanvasElement) => {
  ghosts.delete(ghost);
  ghost.remove();
};

/** 换语言：旧图（旧语言的坐标字）先盖着，涟漪扫到这张图时交叉溶解成新图。 */
const LOCALE_FADE_MS = 460;
/** 这一圈涟漪里已经盖好旧图了：同一圈里又来新数据（排队更新）只换底下的新图，不再拷一份（那时画布上已是新图）。 */
let pendingSweep: AshSweep | null = null;
const localeCrossfade = (active: AshSweep, el: HTMLElement, chart: HTMLElement, next: Record<string, unknown>) => {
  if (pendingSweep === active) { shown.value = still(next); return; }
  const ghost = snapshot(el);
  shown.value = still(next);
  if (!ghost) return;
  pendingSweep = active;
  incoming?.cancel();
  const hold = chart.animate([{ opacity: 0 }, { opacity: 0 }], { duration: 60_000, fill: 'forwards' });
  void active.started.then((t0) => {
    const delay = Math.max(0, t0 + sweepDelay(active, el.getBoundingClientRect()) - performance.now());
    hold.cancel();
    if (pendingSweep === active) pendingSweep = null;
    incoming = chart.animate([{ opacity: 0 }, { opacity: 1 }], { duration: LOCALE_FADE_MS, delay, easing: EASE, fill: 'backwards' });
    ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: LOCALE_FADE_MS, delay, easing: EASE, fill: 'both' })
      .finished.then(() => dropGhost(ghost), () => dropGhost(ghost));
  });
};

watch(() => props.option, (next) => {
  const el = host.value;
  const sweeping = currentSweep();
  if (sweeping && el && canvasHost.value && !reduced()) {
    localeCrossfade(sweeping, el, canvasHost.value, next);
    return;
  }
  const intent = chartSwapIntent();
  const chart = canvasHost.value;
  if (!el || !chart || !intent || reduced()) {
    shown.value = still(next);
    return;
  }
  // 上一段溶解还没放完：新图此刻是半透明的，拷贝要从同样的透明度开始淡。
  const from = Number.parseFloat(getComputedStyle(chart).opacity);
  const ghost = snapshot(el);
  shown.value = still(next);
  const grow = intent.direction === 0 ? 1 : 1 + intent.direction * SQUASH;
  const shrink = intent.direction === 0 ? 1 : 1 - intent.direction * SQUASH;
  if (ghost) {
    ghost.animate(
      [
        { opacity: Number.isFinite(from) ? from : 1, transform: 'none' },
        { opacity: 0, transform: `scaleX(${shrink})` },
      ],
      { duration: FADE_MS, easing: EASE, fill: 'forwards' },
    ).finished.then(() => dropGhost(ghost), () => dropGhost(ghost));
  }
  incoming?.cancel();
  incoming = chart.animate(
    [
      { opacity: 0, transform: `scaleX(${grow})` },
      { opacity: 1, transform: 'none' },
    ],
    { duration: FADE_MS, easing: EASE },
  );
});

onBeforeUnmount(() => {
  incoming?.cancel();
  for (const ghost of [...ghosts]) dropGhost(ghost);
});
</script>

<template>
  <div ref="host" v-bind="$attrs" class="swap-chart">
    <div ref="canvasHost" class="swap-chart-layer">
      <VChart
        class="swap-chart-canvas"
        :key="CHART_THEME"
        :theme="CHART_THEME"
        :option="shown"
        :update-options="SMOOTH_CHART_UPDATE"
        autoresize
        role="img"
        :aria-label="ariaLabel"
        @click="(event: ChartPointerEvent) => emit('click', event)"
        @mouseover="(event: ChartPointerEvent) => emit('mouseover', event)"
        @mouseout="(event: ChartPointerEvent) => emit('mouseout', event)"
        @update-axis-pointer="onAxisPointer"
        @globalout="() => emit('axis', null)"
      />
    </div>
  </div>
</template>

<style scoped>
.swap-chart { position: relative; }
/* 缩放以右边（最近一天）为原点：三档范围都以今天结尾，线的右端在远近变化里不动。 */
.swap-chart-layer { width: 100%; height: 100%; transform-origin: right center; }
.swap-chart-canvas { width: 100%; height: 100%; }
.swap-chart :deep(.swap-chart-ghost) {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  pointer-events: none;
  transform-origin: right center;
}
</style>
