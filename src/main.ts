// 必须第一个：路由器和落地页开关在被导入时就要知道这次是不是演示（见 demo/early.ts）。
import "./demo/early";
import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import { initializeLocale } from "./i18n";
import { initializeTheme } from "./composables/useTheme";
import { isLandingMode } from "./lib/landingMode";
import { applyLandingTheme } from "./views/landing/theme";
import "./styles/fonts.css";
import "./styles/tokens.css";
import "./styles/material.css";

// ECharts 的注册刻意不在这里：见 lib/echartsSetup.ts。放在入口会把整个图表
// 引擎钉进首屏 bundle，连只看落地页的访客也要下载一遍。

// 主题在渲染前把解析结果写进 <html data-theme>，深浅两套 token
// 都在 styles/tokens.css 里跟着这个属性走，不会先闪一帧另一套。
// 落地页（浏览器里打开）有自己的主题：默认深色，见 views/landing/theme.ts。
if (isLandingMode()) applyLandingTheme();
else initializeTheme();

const demo = window.__ZB_DEMO__?.demo === true;

const mount = () => {
  const app = createApp(App);
  app.use(router).mount("#app");
  if (demo) void import("./demo/bootstrap").then((module) => module.startDemoHost(router));
};

// 语言要在第一次渲染之前定下来，否则界面会先闪一下另一种语言。nl/de/fr/ru/pt/hi
// 的文案在语言包 chunk 里：等它到了再挂载，不然第一帧是英文。包是本地文件，通常
// 几毫秒；加一个上限，万一读不到也不让窗口一直空着（缺的键回落英文）。
let mounted = false;
const mountOnce = () => {
  if (mounted) return;
  mounted = true;
  mount();
};
// 演示模式要先装好假运行时（动态 import 的 chunk），再定主题 / 语言，最后才能挂载；兜底时间也放宽。
const ready = demo
  ? import("./demo/runtime")
    .then((module) => module.installDemoRuntime())
    .then(() => import("./demo/bootstrap"))
    .then((module) => module.prepareDemoAppearance())
  : Promise.resolve();
void ready.then(() => initializeLocale()).then(mountOnce, mountOnce);
window.setTimeout(mountOnce, demo ? 6000 : 800);

/* 窗口真的看不见（最小化 / 被完全挡住）时给 <html> 挂一个类，material.css 据此暂停动画。
   不再看焦点：以前窗口可见但没焦点（第二屏、系统另存为对话框、启动瞬间 WebView2 还没
   拿到焦点）也算后台，那时挂载的卡片 card-enter 冻在第一帧 opacity: 0，整页是透明的。 */
const syncBackgrounded = () => {
  document.documentElement.classList.toggle("is-backgrounded", document.hidden);
};
document.addEventListener("visibilitychange", syncBackgrounded);
syncBackgrounded();
