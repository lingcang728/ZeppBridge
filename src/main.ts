import { createApp } from "vue";
import { registerTheme, use } from "echarts/core";
import { LineChart, BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent, LegendComponent, MarkLineComponent, VisualMapComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import VChart from "vue-echarts";
import App from "./App.vue";
import router from "./router";
import { zeppThemeDark } from "./lib/echartsTheme";
import "./styles/fonts.css";

use([LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent, MarkLineComponent, VisualMapComponent, CanvasRenderer]);
registerTheme("zeppbridge-dark", zeppThemeDark);

const app = createApp(App);
app.component("VChart", VChart);
app.use(router).mount("#app");
