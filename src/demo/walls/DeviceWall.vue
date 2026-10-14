<script setup lang="ts">
import DeviceMarquee from '../../components/DeviceMarquee.vue';

/**
 * 宣传片的「设备墙」：应用里设备目录的两排设备英雄图（DeviceMarquee）放大铺满，反向滚动。
 * 接在「每一块表，都认得」那镜，后面是真的指认轮播。只在演示 iframe 里由 presentation.wall('devices') 挂上。
 */
</script>

<template>
  <div class="film-wall devices" aria-hidden="true">
    <DeviceMarquee />
  </div>
</template>

<style scoped>
.film-wall { position: fixed; inset: 0; z-index: 9000; display: grid; align-content: center; overflow: hidden; background: var(--bg); }
.film-wall :deep(.device-marquee) { gap: 44px; mask-image: none; }
.film-wall :deep(.marquee-pass) { gap: 54px; padding-right: 54px; }
.film-wall :deep(.marquee-track) { animation-duration: 26s; }
.film-wall :deep(.dir-rtl .marquee-track) { animation-duration: 30s; }
.film-wall :deep(img) { width: 210px; height: 210px; object-fit: contain; filter: drop-shadow(0 18px 24px rgba(0, 0, 0, .45)); }
</style>
