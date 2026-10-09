<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useLandingLocale } from '../composables/useLandingLocale';
import { COPY } from './landing/copy';
import HeroLanding from './landing/HeroLanding.vue';
import MotionStage from './landing/MotionStage.vue';
import RecordBoard from './landing/RecordBoard.vue';
import AiStage from './landing/AiStage.vue';
import SettingsBoard from './landing/SettingsBoard.vue';
import { JOURNEY } from './landing/journeyCopy';
import InteractiveDemoSection from './landing/InteractiveDemoSection.vue';
import FinalCta from './landing/FinalCta.vue';
import { useDownloads } from './landing/useDownloads';
import SiteNav, { type NavTarget } from './landing/SiteNav.vue';
import { scrollToSection, useScrollMotion } from './landing/motion';

const { locale, localeLoadError, initializeLocale, setLocale, landingCopyFor } = useLandingLocale();
const t = computed(() => (locale.value === 'zh' || locale.value === 'en' ? COPY[locale.value] : landingCopyFor(locale.value) ?? COPY.en));
const journey = computed(() => JOURNEY[locale.value]);
const downloads = useDownloads(t);
const page = ref<HTMLElement | null>(null);
useScrollMotion(page);
const active = ref<NavTarget | ''>('');
const away = ref(false);
const targets: NavTarget[] = ['motion', 'records', 'ai', 'connect', 'try-app', 'download'];
let intent: string | null = null;
let observer: IntersectionObserver | null = null;
let tryObserver: IntersectionObserver | null = null;
let timer = 0;
let historyTimer = 0;

const observe = () => {
  if (intent) return;
  let current: NavTarget | '' = '';
  for (const id of targets) {
    const top = document.getElementById(id)?.getBoundingClientRect().top ?? Infinity;
    if (top <= innerHeight * 0.4) current = id;
  }
  active.value = current;
};
const go = (id: string, writeHistory = true) => {
  intent = id;
  if (id === 'top') active.value = '';
  if (targets.includes(id as NavTarget)) active.value = id as NavTarget;
  scrollToSection(id, writeHistory && location.hash !== `#${id}` ? 'push' : 'none');
  clearTimeout(timer);
  timer = window.setTimeout(() => { intent = null; observe(); }, 1200);
};
const interrupt = () => { intent = null; clearTimeout(timer); requestAnimationFrame(observe); };
const keyInterrupt = (event: KeyboardEvent) => {
  if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key) && !(event.target as HTMLElement).closest('button,input,a,[role="menu"],[role="listbox"]')) interrupt();
};
const history = () => {
  clearTimeout(historyTimer);
  historyTimer = window.setTimeout(() => {
    const id = location.hash.slice(1);
    if (document.getElementById(id)) go(id, false);
  }, 80);
};

onMounted(() => {
  initializeLocale();
  void downloads.load();
  observer = new IntersectionObserver(observe, { rootMargin: '-15% 0px -60% 0px', threshold: [0, 0.1, 1] });
  targets.forEach((id) => { const el = document.getElementById(id); if (el) observer?.observe(el); });
  tryObserver = new IntersectionObserver((entries) => {
    away.value = entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.35);
  }, { threshold: [0, 0.35, 0.6] });
  const trial = document.getElementById('try-app');
  if (trial) tryObserver.observe(trial);
  window.addEventListener('wheel', interrupt, { passive: true });
  window.addEventListener('touchstart', interrupt, { passive: true });
  window.addEventListener('keydown', keyInterrupt);
  window.addEventListener('hashchange', history);
  window.addEventListener('popstate', history);
  if (location.hash) history();
});
onBeforeUnmount(() => {
  observer?.disconnect();
  tryObserver?.disconnect();
  clearTimeout(timer);
  clearTimeout(historyTimer);
  window.removeEventListener('wheel', interrupt);
  window.removeEventListener('touchstart', interrupt);
  window.removeEventListener('keydown', keyInterrupt);
  window.removeEventListener('hashchange', history);
  window.removeEventListener('popstate', history);
});
</script>

<template>
  <div id="top" ref="page" class="lp">
    <a class="lp-skip" href="#motion">{{ journey.nav.motion }}</a>
    <SiteNav :copy="t" :journey="journey" :locale="locale" :active="active" :away="away" @locale="setLocale" @go="go" />
    <main>
      <p v-if="localeLoadError" class="locale-load-error lp-wrap" role="status">{{ COPY.en.rebuild.languageFallback }}</p>
      <HeroLanding :journey="journey" :locale="locale" />
      <MotionStage :journey="journey" :locale="locale" />
      <RecordBoard :journey="journey" :locale="locale" />
      <AiStage :journey="journey" :locale="locale" />
      <SettingsBoard :journey="journey" :locale="locale" />
      <InteractiveDemoSection :copy="t" :journey="journey" :locale="locale" @back="go('top')" />
      <FinalCta :copy="t" :journey="journey" :windows="downloads.windows.value" :macos="downloads.macos.value" :linux="downloads.linux.value" :available="downloads.state.value === 'ready'" />
    </main>
  </div>
</template>

<style src="./landing/landing.css"></style>
