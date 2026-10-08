<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import BrandMark from '../components/BrandMark.vue';
import DeviceMarquee from '../components/DeviceMarquee.vue';
import { useLandingLocale } from '../composables/useLandingLocale';
import ConnectPaths from './landing/ConnectPaths.vue';
import { COPY } from './landing/copy';
import FinalCta from './landing/FinalCta.vue';
import FaqSection from './landing/FaqSection.vue';
import { scrollToSection, useScrollMotion } from './landing/motion';
import PrivacyFlow from './landing/PrivacyFlow.vue';
import SiteNav, { type NavTarget } from './landing/SiteNav.vue';
import StorySection from './landing/StorySection.vue';
import { GITHUB_URL, useDownloads } from './landing/useDownloads';

const { locale, initializeLocale, setLocale, landingCopyFor } = useLandingLocale();

const t = computed(() => {
  const value = locale.value;
  if (value === 'zh' || value === 'en') return COPY[value];
  // 语言包没到的时候先给英文，比白屏或半生不熟的另一种语言强。
  return landingCopyFor(value) ?? COPY.en;
});

const downloads = useDownloads(t);

const page = ref<HTMLElement | null>(null);
useScrollMotion(page);

const active = ref<NavTarget>('story');
const sections: NavTarget[] = ['story', 'privacy', 'connect', 'faq', 'download'];
let frame = 0;
const onScroll = () => {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    active.value = 'story';
    for (const section of sections) {
      if ((document.getElementById(section)?.getBoundingClientRect().top ?? Infinity) < window.innerHeight * .4) active.value = section;
    }
  });
};
const go = (target: NavTarget) => scrollToSection(target);

onMounted(() => {
  initializeLocale();
  void downloads.load();
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
});
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll);
  cancelAnimationFrame(frame);
});
</script>

<template>
  <div id="top" ref="page" class="lp">
    <SiteNav
      :copy="t.nav"
      :locale="locale"
      :download-href="downloads.primary.value.href"
      :github-href="GITHUB_URL"
      :active="active"
      @locale="setLocale"
      @go="go"
    />

    <main>
      <StorySection
        :copy="t"
        :locale="locale"
        :primary="downloads.primary.value"
        :github-href="GITHUB_URL"
      />

      <section id="devices" class="lp-section devices" data-reveal>
        <div class="devices-heading"><p class="devices-label">{{ t.hero.devices }}</p><a href="#connect" @click.prevent="go('connect')">{{ t.nav.connect }} ↗</a></div>
        <DeviceMarquee />
        <p class="devices-note">{{ t.faq.items[1]?.answer }}</p>
      </section>

      <PrivacyFlow :copy="t.privacy" />
      <ConnectPaths :copy="t.connect" />
      <FaqSection :copy="t.faq" />
      <FinalCta
        :copy="t.final"
        :downloads="t.downloads"
        :primary="downloads.primary.value"
        :secondary="downloads.secondary.value"
        :msi-href="downloads.msiHref.value"
        :linux="downloads.linux.value"
        :linux-is-preview="downloads.linuxIsPreview.value"
        :status="downloads.statusText.value"
      />
    </main>

    <footer class="lp-footer">
      <a class="lp-footer-brand" href="#top" @click.prevent="scrollToSection('top')"><BrandMark :size="24" /><strong>ZeppBridge</strong></a>
      <p class="lp-footer-tagline">{{ t.footer.tagline }}</p>
      <p class="lp-disclaimer">{{ t.footer.disclaimer }}</p>
      <a class="lp-footer-link" :href="GITHUB_URL" target="_blank" rel="noopener">{{ t.footer.source }} ↗</a>
    </footer>

  </div>
</template>

<style src="./landing/landing.css"></style>
<style scoped>
.devices { padding-top: 70px; }
.devices-heading { display: flex; justify-content: space-between; align-items: baseline; gap: 20px; padding-bottom: 18px; border-bottom: 1px solid var(--lp-line); }
.devices-label { margin: 0; color: var(--lp-muted); font-size: 14px; font-weight: 600; }
.devices-heading a { color: var(--lp-green); font-size: 13px; text-decoration: none; }
.devices-note { max-width: 72em; margin: 22px 0 0; color: var(--lp-subtle); font-size: 12px; line-height: 1.7; }
.devices :deep(.device-marquee) { display: block; margin-top: 22px; mask-image: none; -webkit-mask-image: none; }
.devices :deep(.marquee-row) { display: block; overflow: visible; }
.devices :deep(.marquee-row:nth-child(2)), .devices :deep(.marquee-pass:nth-child(2)) { display: none; }
.devices :deep(.marquee-track) { display: block; width: 100%; animation: none; }
.devices :deep(.marquee-pass) { display: grid; grid-template-columns: repeat(auto-fit, minmax(64px,1fr)); gap: 18px; padding: 0; }
.devices :deep(img) { width: 64px; height: 64px; filter: none; opacity: .85; }
.devices :deep(.marquee-pass img:nth-child(n+13)) { display: none; }
.lp-footer { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 16px 30px; width: min(1280px,calc(100% - 48px)); margin: 100px auto 0; padding: 32px 0 42px; border-top: 1px solid var(--lp-line); color: var(--lp-subtle); font-size: 13px; }
.lp-footer p { margin: 0; }
.lp-footer-brand { display: inline-flex; align-items: center; gap: 10px; color: var(--lp-ink); text-decoration: none; }
.lp-disclaimer { grid-column: 1 / -1; grid-row: 2; max-width: 80em; font-size: 11px; line-height: 1.7; }
.lp-footer-link { color: var(--lp-muted); text-decoration: none; }
.lp-footer-link:hover { color: var(--lp-ink); }
@media (max-width: 720px) {
  .devices { padding-top: 48px; }
  .devices :deep(.marquee-pass) { grid-template-columns: repeat(auto-fit,minmax(48px,1fr)); gap: 12px; }
  .devices :deep(img) { width: 48px; height: 48px; }
  .lp-footer { grid-template-columns: 1fr auto; width: calc(100% - 32px); margin-top: 64px; gap: 15px; }
  .lp-footer-tagline { grid-column: 1 / -1; grid-row: 2; }
  .lp-disclaimer { grid-row: 3; }
}
</style>
