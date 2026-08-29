import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import "./styles/fonts.css";

// ECharts 的注册刻意不在这里：见 lib/echartsSetup.ts。放在入口会把整个图表
// 引擎钉进首屏 bundle，连只看落地页的访客也要下载一遍。
const app = createApp(App);
app.use(router).mount("#app");
