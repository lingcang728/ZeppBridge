import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

/*
 * 构建标识：短 SHA + 构建时间。
 *
 * 同一个版本号会被构建很多次（修 bug 时尤其如此），只看 "v1.1.2" 分不清
 * 手上跑的是哪一次。缺了这个，"我还是看到中文" 这种反馈就只能靠猜是不是
 * 旧包——已经因此来回三次了。
 */
const buildStamp = () => {
  // @ts-expect-error process is a nodejs global
  const injected: string | undefined = process.env.ZEPPBRIDGE_BUILD_SHA;
  let sha = "unknown";
  if (injected && injected.trim()) {
    // CI 显式传进来的 SHA 优先。
    //
    // 光靠 `git rev-parse` 会在两种真实情况下静默退化成 "unknown"：Flatpak
    // 的构建沙箱、以及从压缩包构建。而 Flatpak 恰恰是最没被实机验证过的
    // 渠道，最需要能从用户的报告里定位到具体那一次构建。
    sha = injected.trim().slice(0, 7);
  } else {
    try {
      sha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
    } catch {
      // 不在 git 工作树里时就留 unknown，不要让构建失败。
    }
  }
  // 用本地时间，不用 UTC：这一行是给人对着自己的钟看的。
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const at = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    + ` ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return `${sha} · ${at}`;
};

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [vue()],

  // Tauri serves the bundled frontend from its asset protocol rather than
  // from an HTTP origin. Relative URLs keep imported WebP/PNG assets inside
  // the bundle (and still work from Vite's dev server) instead of resolving
  // to the host/root path where WebView2 reports a broken image. Keep every
  // icon as a local emitted file rather than a data URL, because the desktop
  // CSP intentionally does not allow arbitrary inline image payloads.
  base: './',
  define: {
    __BUILD_STAMP__: JSON.stringify(buildStamp()),
  },
  build: {
    // 产物的语法基线，显式钉死。
    //
    // Vite 6 的默认值是 `'modules'`，展开就是下面这一行。Vite 7 起默认
    // 换成了 `baseline-widely-available`（现在解析成 chrome111 / edge111 /
    // firefox114 / safari16.4），也就是说**升一次 vite 就会悄悄抬高用户
    // 那台机器的门槛**。
    //
    // 这个应用跑在系统 WebView 里：Windows 的 WebView2 是常青版无所谓，
    // 但 macOS 的 WKWebView 跟着系统走，而 tauri.conf.json 里写的最低系统
    // 版本是 11.0 —— Big Sur 最高只能升到 Safari 16.6，离 16.4 只差两个
    // 小版本。Linux 的 WebKitGTK 更说不准。
    //
    // 钉在这里以后，升 vite 就只是升构建工具，产物一个字节的语法都不动。
    // 要抬高基线是另一件事，得单独决定、单独说明，不该是升级的副作用。
    target: ['es2020', 'edge88', 'firefox78', 'chrome87', 'safari14'],
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        // 给 chunk 起稳定的名字，体积预算脚本才能按角色而不是按哈希文件名
        // 来判断——一次性文件名意味着每次构建都要人工去看一眼。
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          // ECharts 是整个前端里最大的一块，而且只有图表页会用到。
          // 把它和首屏绑在一起，等于让每次冷启动都付一遍这个代价。
          if (id.includes('echarts') || id.includes('zrender')) return 'charts';
          if (id.includes('/vue/') || id.includes('vue-router') || id.includes('@vue/')) {
            return 'vue';
          }
          return 'vendor';
        },
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
