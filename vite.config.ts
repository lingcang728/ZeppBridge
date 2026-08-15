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
