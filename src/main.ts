import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import { initializeLocale } from "./i18n";
import { initializeTheme } from "./composables/useTheme";
import "./styles/fonts.css";
import "./styles/tokens.css";

// ECharts 的注册刻意不在这里：见 lib/echartsSetup.ts。放在入口会把整个图表
// 引擎钉进首屏 bundle，连只看落地页的访客也要下载一遍。

// 语言要在第一次渲染之前定下来，否则界面会先闪一下另一种语言。
// 这里只是把探测结果写进 <html lang>；文案本身跟着各模块的 chunk 走。
initializeLocale();
// 同理，主题在渲染前把解析结果写进 <html data-theme>，深浅两套 token
// 都在 styles/tokens.css 里跟着这个属性走，不会先闪一帧另一套。
initializeTheme();

const app = createApp(App);
app.use(router).mount("#app");
