/**
 * ECharts 的唯一入口。
 *
 * 以前注册写在 `main.ts` 里，于是 ECharts 落进了首屏 bundle——包括浏览器里
 * 只会看到落地页的访客，他们下载了 560 kB 一次也用不上的图表引擎。
 *
 * 现在只有真正画图的组件 import 这个模块，`use()` 与 `registerTheme()` 作为
 * 模块副作用在第一次 import 时执行。图表引擎因此只跟着图表页的 chunk 走。
 *
 * 画图的组件请一律从这里拿 `VChart`，不要直接 `import VChart from 'vue-echarts'`：
 * 那样会绕开注册，拿到一个没有 series 类型也没有主题的空图。
 */
import { registerTheme, use } from 'echarts/core';
// 加新图形时**必须**同时加进下面的 `use()`。漏了不会报错、不会警告，只会
// 得到一张空画布——膳食平衡那个环就是这么空了一版：百分比算对了、卡片和
// 说明都在，中间什么都没有。
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import VChartBase from 'vue-echarts';
import { computed, defineComponent, h, onBeforeUnmount, ref, type Component, type VNode } from 'vue';
import { resolvedTheme } from '../composables/useTheme';
import { chartPalettes, zeppThemeDark, zeppThemeLight } from './echartsTheme';
import { motionBusy, whenMotionIdle } from './motion/budget';

use([
  LineChart,
  BarChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  MarkAreaComponent,
  CanvasRenderer,
]);
registerTheme('zeppbridge-dark', zeppThemeDark);
registerTheme('zeppbridge-light', zeppThemeLight);

/* 卡 ↔ 页形变放着的时候不挂图表（lib/motion/budget.ts）：vue-echarts 挂载时同步建画布、算布局、画第一帧，
   十几张图压在形变的第一帧上，窗口就要等它们做完才动——录屏里「一下变黑」的那一截。形变期间先放一个同样
   类名（同样高度）的空壳，放完以后一帧挂一张、轻轻淡入，主线程每帧都还有空。不在形变里挂载的图照旧直接画。 */
const queue: Array<() => void> = [];
let frame = 0;
const pump = () => {
  frame = 0;
  queue.shift()?.();
  if (queue.length) frame = requestAnimationFrame(pump);
};
const nextSlot = (job: () => void) => {
  queue.push(job);
  if (!frame) frame = requestAnimationFrame(pump);
};

const DeferredChart = defineComponent({
  name: 'DeferredChart',
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    const ready = ref(!motionBusy.value);
    let alive = true;
    let late = false;
    if (!ready.value) {
      void whenMotionIdle().then(() => nextSlot(() => {
        if (!alive) return;
        late = true;
        ready.value = true;
      }));
    }
    onBeforeUnmount(() => { alive = false; });
    const fadeIn = (vnode: VNode) => {
      const el = vnode.el as HTMLElement | null;
      el?.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
    };
    return () => (ready.value
      ? h(VChartBase as Component, late ? { ...attrs, onVnodeMounted: fadeIn } : { ...attrs }, slots)
      : h('div', { class: attrs.class, style: attrs.style, 'aria-hidden': 'true' }));
  },
});

/** 画图的组件一律用这个（类型和 vue-echarts 的一样）。 */
export const VChart = DeferredChart as unknown as typeof VChartBase;

/* 图表主题跟着界面主题走：`<VChart :theme="CHART_THEME" :key="CHART_THEME">`
   主题一变 key 也变，vue-echarts 整个重建，不会出现半新半旧的画布。
   option 里需要 chrome 色（轴文字、tooltip、网格线）时用 `chartPalette`，
   option 必须是 computed 才会在换主题时重算。 */
export const CHART_THEME = computed(() =>
  resolvedTheme.value === 'light' ? 'zeppbridge-light' : 'zeppbridge-dark');

export const chartPalette = computed(() => chartPalettes[resolvedTheme.value]);
