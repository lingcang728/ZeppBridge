<script setup lang="ts">
import { defineAsyncComponent } from 'vue';
import { isLandingMode } from './lib/landingMode';

/*
 * 同一份 dist 两种形态：浏览器里是落地页（Cloudflare Pages 部署的就是这个分支），
 * Tauri 里（或浏览器带 ?app-preview=1）是桌面外壳。两边都懒加载：桌面端不下载
 * 落地页，浏览器访客也不下载顶栏、导航、同步控制器那一整块外壳。
 */
const LandingPage = defineAsyncComponent(() => import('./views/LandingPage.vue'));
const AppShell = defineAsyncComponent(() => import('./AppShell.vue'));
const showLanding = isLandingMode();
</script>

<template>
  <LandingPage v-if="showLanding" />
  <AppShell v-else />
</template>

<!-- html / body / #app 的基础规则两种形态都要，所以留在根组件（全局样式）；外壳布局在 AppShell.vue 里引入。 -->
<style src="./styles/base.css"></style>
