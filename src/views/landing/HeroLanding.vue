<script setup lang="ts">
import { ref, watch } from 'vue';
import DeviceRibbon from './DeviceRibbon.vue';
import { landingTheme } from './theme';
import { useInView } from './motion';
import type { LandingLocale } from '../../composables/useLandingLocale';
import type { JourneyCopy } from './journeyCopy';

const props = defineProps<{ journey: JourneyCopy; locale: LandingLocale }>();
const ribbon = ref<HTMLElement | null>(null);
const live = useInView(ribbon);
const mainIndex = ref(0);
const sleepIndex = ref(0);
const stepsIndex = ref(0);

// 主题分色的 hero-*.webp 还没拍。现有素材是 feature-{overview,sleep,workouts}-{zh,en}.webp。
const fileOf = (kind: 'overview' | 'sleep' | 'steps') => (kind === 'steps' ? 'workouts' : kind);
const stems = (kind: 'overview' | 'sleep' | 'steps') => {
  const theme = landingTheme.value;
  const file = fileOf(kind);
  const names = [
    `hero-${kind}-${props.locale}-${theme}`,
    `feature-${file}-${props.locale}-${theme}`,
    `feature-${file}-${props.locale}`,
  ];
  for (const lang of ['en', 'zh'] as const) {
    if (props.locale !== lang) names.push(`feature-${file}-${lang}`);
  }
  return names.map((name) => `/landing/media/${name}.webp`);
};
const src = (kind: 'overview' | 'sleep' | 'steps', index: number) => stems(kind)[index] ?? '';
const miss = (kind: 'overview' | 'sleep' | 'steps') => {
  const cursor = kind === 'overview' ? mainIndex : kind === 'sleep' ? sleepIndex : stepsIndex;
  if (cursor.value < stems(kind).length) cursor.value += 1;
};

watch(() => [props.locale, landingTheme.value], () => { mainIndex.value = 0; sleepIndex.value = 0; stepsIndex.value = 0; });
</script>

<template>
  <section class="hero-landing" aria-labelledby="landing-title">
    <div class="hero-copy lp-wrap">
      <h1 id="landing-title">{{ journey.title[0] }}<span>{{ journey.title[1] }}</span></h1>
      <p>{{ journey.lead }}</p>
      <div class="hero-actions">
        <a class="lp-btn lp-btn-primary" href="#download">{{ journey.nav.download }}</a>
        <p>{{ journey.downloadPending }}</p>
      </div>
    </div>
    <div class="hero-stage lp-wrap">
      <div class="hero-window"><img v-if="src('overview', mainIndex)" :src="src('overview', mainIndex)" alt="" width="2560" height="1600" fetchpriority="high" @error="miss('overview')" /></div>
      <div v-if="src('sleep', sleepIndex)" class="hero-card hero-sleep"><img :src="src('sleep', sleepIndex)" alt="" width="800" height="600" @error="miss('sleep')" /></div>
      <div v-if="src('steps', stepsIndex)" class="hero-card hero-steps"><img :src="src('steps', stepsIndex)" alt="" width="800" height="500" @error="miss('steps')" /></div>
    </div>
    <div ref="ribbon" :class="['device-ribbon', { 'ribbon-running': live }]"><DeviceRibbon /></div>
  </section>
</template>

<style scoped>
.hero-landing { padding-top: 28px; }
.hero-copy { text-align: center; }
h1 { margin: 0; font-size: clamp(40px, 5.2vw, 76px); line-height: 1.12; letter-spacing: -.05em; font-weight: 650; }
h1 span { display: block; color: var(--lp-muted); margin-top: .12em; }
.hero-copy > p { font-size: clamp(16px, 1.5vw, 19px); max-width: 36em; line-height: 1.65; margin: 18px auto 0; color: var(--lp-muted); text-wrap: balance; }
.hero-actions { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 14px 18px; margin-top: 22px; }
.hero-actions p { margin: 0; color: var(--subtle); font-size: 14px; }
.hero-stage { position: relative; margin-top: 48px; max-width: 1140px; padding: 0 90px; perspective: 1400px; }
.hero-window { overflow: hidden; border-radius: 22px; box-shadow: var(--lp-shadow); border: 1px solid var(--line); transform: rotateX(5deg); animation: window-in 1.1s cubic-bezier(.16,1,.3,1) both; }
.hero-stage img { display: block; width: 100%; height: auto; }
.hero-card { position: absolute; width: 30%; border-radius: 18px; overflow: hidden; border: 1px solid var(--line); box-shadow: var(--lp-shadow); animation: card-in 1.2s cubic-bezier(.16,1,.3,1) both; }
.hero-sleep { left: 0; top: 22%; transform: rotate(-6deg); animation-delay: .12s; }
.hero-steps { right: 0; bottom: 8%; transform: rotate(5deg); animation-delay: .22s; }
.device-ribbon { width: min(1500px, 100%); margin: 64px auto 0; }
.device-ribbon :deep(.device-marquee) { gap: 38px; }
.device-ribbon :deep(img) { width: 92px; height: 92px; filter: drop-shadow(0 10px 14px rgba(0,0,0,.18)); }
.device-ribbon :deep(.marquee-pass) { gap: 42px; padding-right: 42px; }
.device-ribbon :deep(.marquee-track) { animation-play-state: paused; }
.device-ribbon.ribbon-running :deep(.marquee-track) { animation-play-state: running; }
@keyframes window-in { from { opacity: 0; transform: translateY(48px) rotateX(10deg) scale(.96); } }
@keyframes card-in { from { opacity: 0; translate: 0 48px; scale: .9; } }
@media (max-width: 720px) {
  h1 { font-size: clamp(32px, 8vw, 48px); letter-spacing: -.04em; }
  .hero-stage { margin-top: 32px; padding: 0 22px; }
  .hero-window { border-radius: 12px; }
  .hero-card { width: 34%; border-radius: 12px; }
  .device-ribbon { margin-top: 36px; }
  .device-ribbon :deep(img) { width: 64px; height: 64px; }
}
@media (prefers-reduced-motion: reduce) {
  .hero-window, .hero-card { animation: none; transform: none; }
  .device-ribbon :deep(.marquee-row:nth-child(2)) { display: none; }
}
</style>
