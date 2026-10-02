<script setup lang="ts">
/**
 * 落地页（浏览器里打开 dist 时显示它；zeppbridge.com 预览站部署的也是它）。2026-10 第二次重做。
 *
 * 这一版的想法只有一个：**页面就是软件**。右边那扇窗口里跑的是同一份前端（演示模式，数据全是合成的），
 * 不是截图也不是仿制品；往下滚，应用自己换到另一页，文字在左边讲这一页是干什么的。导航那枚玻璃胶囊
 * 用的就是应用顶栏的胶囊选择器，窗口里的转场、设置卡叠的飞入飞出、图上的拖动都是本体的。
 *
 * 版式是杂志：暖白的纸、一个橄榄绿、荧光笔划过的那一句、很大的字和很多留白（views/landing/landing.css）。
 * 演示读数全是示例，页面上写明「示例」。
 *
 * 文案：zh / en 在 ./landing/copy.ts，其余八种语言懒加载（composables/useLandingLocale.ts）。
 * 动效约定见 ./landing/motion.ts：只动 transform / opacity，循环动画离屏暂停，减少动态时直接落终态。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import BrandMark from '../components/BrandMark.vue';
import DeviceMarquee from '../components/DeviceMarquee.vue';
import { useLandingLocale } from '../composables/useLandingLocale';
import ConnectPaths from './landing/ConnectPaths.vue';
import { COPY } from './landing/copy';
import FinalCta from './landing/FinalCta.vue';
import { useScrollMotion } from './landing/motion';
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
const showStarNudge = ref(false);
const nudge = () => { showStarNudge.value = true; };

const page = ref<HTMLElement | null>(null);
const story = ref<InstanceType<typeof StorySection> | null>(null);
useScrollMotion(page);

/* 导航胶囊亮哪一项：在故事里就是「演示」（讲到交给 AI / 排计划那两段时是「交给 AI」），过了故事就是「隐私」。 */
const storyIndex = ref(0);
const pastStory = ref(false);
const active = computed<NavTarget>(() => {
  if (pastStory.value) return 'privacy';
  return storyIndex.value === 3 || storyIndex.value === 4 ? 'ai' : 'story';
});
let frame = 0;
const onScroll = () => {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    const top = document.getElementById('devices')?.getBoundingClientRect().top ?? Infinity;
    pastStory.value = top < window.innerHeight * 0.6;
  });
};
const go = (target: NavTarget) => {
  if (target === 'ai') story.value?.scrollToBeat(3);
  else if (target === 'privacy') document.getElementById('privacy')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  else window.scrollTo({ top: 0, behavior: 'smooth' });
};

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
      @download="nudge"
      @go="go"
    />

    <main>
      <StorySection
        ref="story"
        :copy="t"
        :locale="locale"
        :primary="downloads.primary.value"
        :github-href="GITHUB_URL"
        @download="nudge"
        @active="storyIndex = $event"
      />

      <section id="devices" class="lp-section devices" data-reveal>
        <p class="devices-label">{{ t.hero.devices }}</p>
        <DeviceMarquee />
      </section>

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
.devices { padding-top: 120px; width: 100%; max-width: none; }
.devices-label { margin: 0 0 26px; color: var(--lp-subtle); font-family: var(--font-mono); font-size: 12px; letter-spacing: .16em; text-align: center; text-transform: uppercase; }

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
  background: color-mix(in srgb, var(--lp-panel) 92%, transparent);
  box-shadow: 0 30px 60px -20px rgba(20, 30, 14, .45);
  -webkit-backdrop-filter: blur(18px);
  backdrop-filter: blur(18px);
  font-size: 13.5px;
}
.lp-nudge strong { display: block; font-size: 14.5px; }
.lp-nudge p { margin: 3px 0 0; color: var(--lp-muted); line-height: 1.5; }
.lp-nudge a { padding: 8px 14px; border-radius: 999px; background: var(--lp-green); color: var(--lp-green-ink); font-weight: 650; text-decoration: none; white-space: nowrap; }
.lp-nudge button { padding: 8px 10px; border: 0; background: transparent; color: var(--lp-subtle); font: inherit; cursor: pointer; white-space: nowrap; }
.lp-nudge-enter-active, .lp-nudge-leave-active { transition: opacity .3s ease, transform .5s var(--lp-ease); }
.lp-nudge-enter-from, .lp-nudge-leave-to { opacity: 0; transform: translateY(20px) scale(.97); }
@media (max-width: 560px) { .lp-nudge { grid-template-columns: 1fr; } }
</style>
