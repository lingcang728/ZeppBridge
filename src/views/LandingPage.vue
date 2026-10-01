<script setup lang="ts">
/**
 * 落地页（浏览器里打开 dist 时显示它；zeppbridge.com 预览站部署的也是它）。2026-10 整页重写。
 *
 * 两个亮点分量一样：**01 把手腕上的记录同步到你的电脑**、**02 把电脑里的数据直接交给 AI**。
 * 首屏两句对仗的标题把这两件事并排说出来，往下两章各自有能上手玩的演示（翻牌计数、应用窗口、
 * 打包进对话框）。深色为主，浅色可切（views/landing/theme.ts）。演示读数全是示例，页面上标着「示例」。
 * 首屏保留了原来那段两排手表并排滚动（components/DeviceMarquee.vue）。
 *
 * 文案：zh / en 在 ./landing/copy.ts，其余八种语言懒加载（composables/useLandingLocale.ts）。
 * 动效约定见 ./landing/motion.ts：只动 transform / opacity，循环动画离屏暂停，减少动态时直接落终态。
 */
import { computed, onMounted, ref } from 'vue';
import BrandMark from '../components/BrandMark.vue';
import { useLandingLocale } from '../composables/useLandingLocale';
import AiHandoff from './landing/AiHandoff.vue';
import AppDemo from './landing/AppDemo.vue';
import BentoGrid from './landing/BentoGrid.vue';
import ConnectPaths from './landing/ConnectPaths.vue';
import { COPY } from './landing/copy';
import FinalCta from './landing/FinalCta.vue';
import FlapBoard from './landing/FlapBoard.vue';
import HeroSection from './landing/HeroSection.vue';
import { useScrollMotion } from './landing/motion';
import PrivacyFlow from './landing/PrivacyFlow.vue';
import SiteNav from './landing/SiteNav.vue';
import { GITHUB_URL, useDownloads } from './landing/useDownloads';

const { locale, initializeLocale, setLocale, landingCopyFor } = useLandingLocale();

const t = computed(() => {
  const value = locale.value;
  if (value === 'zh' || value === 'en') return COPY[value];
  // 语言包没到的时候先给英文，比白屏或半生不熟的另一种语言强。
  return landingCopyFor(value) ?? COPY.en;
});

const downloads = useDownloads(t);
const showStarNudge = ref(false);
const nudge = () => { showStarNudge.value = true; };

const page = ref<HTMLElement | null>(null);
useScrollMotion(page);
onMounted(() => {
  initializeLocale();
  void downloads.load();
});
</script>

<template>
  <div ref="page" class="lp">
    <SiteNav
      :copy="t.nav"
      :locale="locale"
      :download-href="downloads.primary.value.href"
      :github-href="GITHUB_URL"
      @locale="setLocale"
      @download="nudge"
    />

    <main>
      <HeroSection
        :copy="t.hero"
        :sample="t.sample"
        :download="downloads.primary.value"
        :github-href="GITHUB_URL"
        @download="nudge"
      />
      <FlapBoard :copy="t.flap" :chapter="t.chapters.sync" :sample="t.sample" />
      <AppDemo :copy="t.demo" :sample="t.sample" />
      <AiHandoff :copy="t.ai" :chapter="t.chapters.ai" :sample="t.sample" />
      <BentoGrid :copy="t.bento" />
      <PrivacyFlow :copy="t.privacy" />
      <ConnectPaths :copy="t.connect" />
      <FinalCta
        :copy="t.final"
        :downloads="t.downloads"
        :primary="downloads.primary.value"
        :secondary="downloads.secondary.value"
        :msi-href="downloads.msiHref.value"
        :linux="downloads.linux.value"
        :linux-is-preview="downloads.linuxIsPreview.value"
        :status="downloads.statusText.value"
        @download="nudge"
      />
    </main>

    <footer class="lp-footer">
      <a class="lp-footer-brand" href="#top"><BrandMark :size="24" /><strong>ZeppBridge</strong></a>
      <p>{{ t.footer.tagline }}</p>
      <p class="lp-disclaimer">{{ t.footer.disclaimer }}</p>
      <a class="lp-footer-link" :href="GITHUB_URL" target="_blank" rel="noopener">{{ t.footer.source }} ↗</a>
    </footer>

    <Transition name="lp-nudge">
      <aside v-if="showStarNudge" class="lp-nudge" aria-live="polite">
        <div><strong>{{ t.hero.starNudge.title }}</strong><p>{{ t.hero.starNudge.copy }}</p></div>
        <a :href="GITHUB_URL" target="_blank" rel="noopener">{{ t.hero.starNudge.action }}</a>
        <button type="button" @click="showStarNudge = false">{{ t.hero.starNudge.dismiss }}</button>
      </aside>
    </Transition>
  </div>
</template>

<style src="./landing/landing.css"></style>
<style scoped>
.lp-footer { display: grid; justify-items: center; gap: 10px; width: min(1180px, calc(100% - 40px)); margin: 120px auto 0; padding: 40px 0 56px; border-top: 1px solid var(--lp-line); color: var(--lp-subtle); font-size: 14px; text-align: center; }
.lp-footer p { margin: 0; }
.lp-footer-brand { display: inline-flex; align-items: center; gap: 10px; color: var(--lp-ink); text-decoration: none; }
.lp-disclaimer { max-width: 40em; font-size: 12.5px; }
.lp-footer-link { color: var(--lp-muted); text-decoration: none; }
.lp-footer-link:hover { color: var(--lp-ink); }

.lp-nudge {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 60;
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 12px;
  width: min(520px, calc(100% - 40px));
  padding: 16px 18px;
  border: 1px solid var(--lp-line-2);
  border-radius: 20px;
  background: color-mix(in srgb, var(--lp-panel) 90%, transparent);
  box-shadow: 0 30px 60px -20px rgba(0, 0, 0, .6);
  -webkit-backdrop-filter: blur(18px);
  backdrop-filter: blur(18px);
  font-size: 13.5px;
}
.lp-nudge strong { display: block; font-size: 14.5px; }
.lp-nudge p { margin: 3px 0 0; color: var(--lp-muted); line-height: 1.5; }
.lp-nudge a { padding: 8px 14px; border-radius: 999px; background: var(--lp-ink); color: var(--lp-bg); font-weight: 650; text-decoration: none; white-space: nowrap; }
.lp-nudge button { padding: 8px 10px; border: 0; background: transparent; color: var(--lp-subtle); font: inherit; cursor: pointer; white-space: nowrap; }
.lp-nudge-enter-active, .lp-nudge-leave-active { transition: opacity .3s ease, transform .5s var(--lp-ease); }
.lp-nudge-enter-from, .lp-nudge-leave-to { opacity: 0; transform: translateY(20px) scale(.97); }
@media (max-width: 560px) { .lp-nudge { grid-template-columns: 1fr; } }
</style>
