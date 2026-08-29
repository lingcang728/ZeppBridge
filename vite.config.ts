import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

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
  build: {
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
