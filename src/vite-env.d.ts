/// <reference types="vite/client" />

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

declare module "*.svg?raw" {
  const source: string;
  export default source;
}

/** 构建时由 vite.config.ts 注入：短 SHA + 构建时间（UTC）。 */
declare const __BUILD_STAMP__: string;
