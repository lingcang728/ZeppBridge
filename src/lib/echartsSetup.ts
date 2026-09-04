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
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import VChart from 'vue-echarts';
import { zeppThemeDark } from './echartsTheme';

use([
  LineChart,
  BarChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  VisualMapComponent,
  CanvasRenderer,
]);
registerTheme('zeppbridge-dark', zeppThemeDark);

export { VChart };
export const CHART_THEME = 'zeppbridge-dark';
