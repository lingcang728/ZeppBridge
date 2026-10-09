<script setup lang="ts">
import { ref } from 'vue';
import DeviceMarquee from '../../components/DeviceMarquee.vue';
import { landingTheme } from './theme';
import { useInView } from './motion';
import type { LandingLocale } from '../../composables/useLandingLocale';
import type { JourneyCopy } from './journeyCopy';
defineProps<{ journey: JourneyCopy; locale: LandingLocale }>();
const ribbon = ref<HTMLElement | null>(null), live = useInView(ribbon);
</script>
<template>
  <section class="hero-landing" aria-labelledby="landing-title">
    <div class="hero-copy lp-wrap"><h1 id="landing-title">{{ journey.title[0] }}<span>{{ journey.title[1] }}</span></h1><p>{{ journey.lead }}</p></div>
    <div class="hero-stage lp-wrap" aria-hidden="true">
      <div class="hero-window"><img :src="'/landing/media/hero-overview-' + locale + '-' + landingTheme + '.webp'" alt="" width="2560" height="1600" fetchpriority="high" /></div>
      <div class="hero-card hero-sleep"><img :src="'/landing/media/hero-sleep-' + locale + '-' + landingTheme + '.webp'" alt="" width="800" height="600" /></div>
      <div class="hero-card hero-steps"><img :src="'/landing/media/hero-steps-' + locale + '-' + landingTheme + '.webp'" alt="" width="800" height="500" /></div>
    </div>
    <div ref="ribbon" :class="['device-ribbon', { 'ribbon-running': live }]"><DeviceMarquee /></div>
  </section>
</template>
<style scoped>
.hero-landing { padding-top: 156px; }
.hero-copy { text-align: center; }
h1 { margin: 0; font-size: clamp(44px, 5.7vw, 88px); line-height: 1.12; letter-spacing: -.055em; font-weight: 650; }
h1 span { display: block; color: var(--lp-muted); margin-top: .13em; }
.hero-copy p { font-size: clamp(17px, 1.6vw, 21px); max-width: 34em; line-height: 1.7; margin: 28px auto 0; color: var(--lp-muted); text-wrap: balance; }
.hero-stage { position: relative; margin-top: 64px; max-width: 1140px; padding: 0 90px; perspective: 1400px; }
.hero-window { overflow: hidden; border-radius: 24px; box-shadow: var(--lp-shadow); border: 1px solid var(--line); transform: rotateX(5deg); animation: window-in 1.3s cubic-bezier(.16,1,.3,1) both; }
.hero-stage img { display: block; width: 100%; height: auto; }
.hero-card { position: absolute; width: 30%; border-radius: 24px; overflow: hidden; border: 1px solid var(--line); box-shadow: var(--lp-shadow); animation: card-in 1.5s cubic-bezier(.16,1,.3,1) both; }
.hero-sleep { left: 0; top: 22%; transform: rotate(-6deg); animation-delay: .14s; }
.hero-steps { right: 0; bottom: 8%; transform: rotate(5deg); animation-delay: .28s; }
.device-ribbon { width: min(1500px, 100%); margin: 76px auto 0; }
.device-ribbon :deep(.device-marquee) { gap: 38px; }
.device-ribbon :deep(img) { width: 92px; height: 92px; filter: drop-shadow(0 10px 14px rgba(0,0,0,.18)); }
.device-ribbon :deep(.marquee-pass) { gap: 42px; padding-right: 42px; }
.device-ribbon :deep(.marquee-track) { animation-play-state: paused; }
.device-ribbon.ribbon-running :deep(.marquee-track) { animation-play-state: running; }
@keyframes window-in { from { opacity: 0; transform: translateY(80px) rotateX(12deg) scale(.93); } }
@keyframes card-in { from { opacity: 0; translate: 0 110px; scale: .72; } }
@media(max-width:720px) { .hero-landing { padding-top: 130px; } h1 { font-size: clamp(35px,7.7vw,56px); letter-spacing: -.045em; } .hero-copy p { font-size: 17px; } .hero-stage { margin-top: 44px; padding: 0 22px; } .hero-window { border-radius: 13px; } .hero-card { width: 35%; border-radius: 12px; } .device-ribbon { margin-top: 46px; } .device-ribbon :deep(.device-marquee) { gap: 28px; } .device-ribbon :deep(img) { width: 65px; height: 65px; } }
@media(prefers-reduced-motion:reduce) { .hero-window, .hero-card { animation: none; transform: none; } .device-ribbon :deep(.marquee-row:nth-child(2)) { display: none; } }
</style>
