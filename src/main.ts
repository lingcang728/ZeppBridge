import { createApp } from "vue";
import { use } from "echarts/core";
import { LineChart, BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import VChart from "vue-echarts";
import App from "./App.vue";
import router from "./router";

use([LineChart, BarChart, GridComponent, TooltipComponent, CanvasRenderer]);

const app = createApp(App);
app.component("VChart", VChart);
app.use(router).mount("#app");
