<script setup lang="ts">
/**
 * 落地页（zeppbridge.pages.dev；浏览器直接打开 dist 时也是它）。
 *
 * 讲法是「让人上手玩一下」，不是一屏屏的功能清单：首屏是可以点的迷你概览（卡片长成
 * 详情、返回缩回原处），往下是能散开、能抽出来的设置卡叠，和能拖动的「交给 AI」图。
 * 这几段都是真的小组件，不是截图，数字全是示例数据——落地页是公开的，不放任何人的真实记录。
 *
 * 文案：zh / en 在 ./landing/copy.ts，其余八种语言懒加载（composables/useLandingLocale.ts）。
 * 主题跟 <html data-theme>（main.ts 在首帧前按系统设好），颜色全部走 tokens.css。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import BrandMark from '../components/BrandMark.vue';
import DesignIcon from '../components/DesignIcon.vue';
import DeviceMarquee from '../components/DeviceMarquee.vue';
import { useLandingLocale } from '../composables/useLandingLocale';
import { COPY } from './landing/copy';
import DeckDemo from './landing/DeckDemo.vue';
import HandoffGraph from './landing/HandoffGraph.vue';
import HeroDemo from './landing/HeroDemo.vue';
import LocaleMenu from './landing/LocaleMenu.vue';
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

/* 往下滚到哪一段，哪一段轻轻浮上来。只动 opacity / transform；减少动态效果时直接显示。 */
const page = ref<HTMLElement | null>(null);
let revealer: IntersectionObserver | null = null;
onMounted(() => {
  initializeLocale();
  void downloads.load();
  const targets = page.value?.querySelectorAll<HTMLElement>('[data-reveal]') ?? [];
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || typeof IntersectionObserver === 'undefined') {
    targets.forEach((el) => el.classList.add('is-in'));
    return;
  }
  revealer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-in');
      revealer?.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });
  targets.forEach((el) => revealer?.observe(el));
});
onBeforeUnmount(() => revealer?.disconnect());
</script>

<template>
  <div ref="page" class="landing">
    <header class="site-nav">
      <div class="nav-inner">
        <a class="brand" href="#top" :aria-label="t.nav.home"><BrandMark :size="30" /><strong>ZeppBridge</strong></a>
        <nav :aria-label="t.nav.site">
          <a href="#connect">{{ t.nav.connect }}</a>
          <a href="#interface">{{ t.nav.motion }}</a>
          <a href="#handoff">{{ t.nav.handoff }}</a>
          <a href="#privacy">{{ t.nav.privacy }}</a>
        </nav>
        <div class="nav-actions">
          <LocaleMenu :model-value="locale" :aria-label="t.nav.language" @update:model-value="setLocale" />
          <a class="nav-link" :href="GITHUB_URL" target="_blank" rel="noopener">{{ t.nav.star }}</a>
          <a class="nav-download" :href="downloads.primary.value.href" rel="noopener" @click="nudge">{{ t.footer.download }}</a>
        </div>
      </div>
    </header>

    <main id="top">
      <section class="hero">
        <div class="hero-copy">
          <h1>{{ t.hero.headlineLead }}<br /><span>{{ t.hero.headlineAccent }}</span></h1>
          <p class="hero-lead">{{ t.hero.lead }}</p>
          <div class="hero-actions">
            <a class="cta-primary" :href="downloads.primary.value.href" rel="noopener" @click="nudge">
              <DesignIcon name="app-icon" :size="26" />
              <span><b>{{ downloads.primary.value.label }}</b><small>{{ downloads.primary.value.hint }}</small></span>
            </a>
            <a class="cta-ghost" :href="GITHUB_URL" target="_blank" rel="noopener">{{ t.hero.github }}</a>
          </div>
        </div>
        <HeroDemo class="hero-demo" :copy="t.demo" />
      </section>

      <section class="devices" :aria-label="t.devicesLabel">
        <DeviceMarquee />
      </section>

      <section id="connect" class="section connect" data-reveal>
        <div class="section-head">
          <h2>{{ t.connect.heading }}</h2>
          <p>{{ t.connect.lead }}</p>
        </div>
        <div class="path-grid">
          <article v-for="(path, index) in t.connect.paths" :key="path.title" :class="['path', { lead: index === 0 }]">
            <span class="path-icon"><DesignIcon :name="path.icon" :size="index === 0 ? 46 : 34" /></span>
            <span v-if="index === 0" class="path-badge">{{ t.connect.recommended }}</span>
            <h3>{{ path.title }}</h3>
            <p>{{ path.copy }}</p>
            <p class="path-detail">{{ path.detail }}</p>
            <DesignIcon v-if="index === 0" class="path-art" name="health-watch" :size="170" />
          </article>
        </div>
      </section>

      <section id="interface" class="section deck-section" data-reveal>
        <DeckDemo :copy="t.deck" />
        <div class="deck-copy">
          <h2>{{ t.deck.heading }}</h2>
          <p>{{ t.deck.lead }}</p>
          <p class="hint">{{ t.deck.hint }}</p>
        </div>
      </section>

      <section id="handoff" class="section handoff" data-reveal>
        <div class="section-head">
          <h2>{{ t.handoff.heading }}</h2>
          <p>{{ t.handoff.lead }}</p>
        </div>
        <HandoffGraph :copy="t.handoff" />
      </section>

      <section id="privacy" class="section privacy" data-reveal>
        <div class="privacy-head">
          <DesignIcon name="private" :size="56" />
          <h2>{{ t.privacy.heading }}</h2>
          <p>{{ t.privacy.lead }}</p>
        </div>
        <article v-for="point in t.privacy.points" :key="point.title" class="privacy-point">
          <DesignIcon :name="point.icon" :size="32" />
          <h3>{{ point.title }}</h3>
          <p>{{ point.copy }}</p>
        </article>
      </section>

      <section id="download" class="section final" data-reveal>
        <h2>{{ t.footer.heading }}</h2>
        <div class="final-actions">
          <a class="cta-primary" :href="downloads.primary.value.href" rel="noopener" @click="nudge">
            <DesignIcon name="app-icon" :size="26" />
            <span><b>{{ downloads.primary.value.label }}</b><small>{{ downloads.primary.value.hint }}</small></span>
          </a>
          <a class="cta-ghost" :href="downloads.secondary.value.href" rel="noopener" @click="nudge">{{ downloads.secondary.value.label }}</a>
        </div>
        <p class="final-links">
          <a :href="downloads.msiHref.value" rel="noopener" @click="nudge">{{ t.downloads.windows.msi }}</a>
          <template v-if="downloads.linux.value.length">
            <span>{{ t.downloads.linux.label }}<em v-if="downloads.linuxIsPreview.value">{{ t.downloads.linux.previewBadge }}</em></span>
            <a v-for="item in downloads.linux.value" :key="item.label" :href="item.url" rel="noopener" @click="nudge">{{ item.label }}</a>
          </template>
        </p>
        <p v-if="downloads.linuxIsPreview.value" class="linux-note">{{ t.downloads.linux.note }}</p>
        <p class="release-status">{{ downloads.statusText.value }}</p>
      </section>
    </main>

    <footer class="site-footer">
      <a class="brand" href="#top"><BrandMark :size="26" /><strong>ZeppBridge</strong></a>
      <p>{{ t.footer.tagline }}</p>
      <p class="disclaimer">{{ t.footer.disclaimer }}</p>
    </footer>

    <Transition name="nudge">
      <aside v-if="showStarNudge" class="star-nudge" aria-live="polite">
        <div><strong>{{ t.hero.starNudge.title }}</strong><p>{{ t.hero.starNudge.copy }}</p></div>
        <a :href="GITHUB_URL" target="_blank" rel="noopener">{{ t.hero.starNudge.action }}</a>
        <button type="button" @click="showStarNudge = false">{{ t.hero.starNudge.dismiss }}</button>
      </aside>
    </Transition>
  </div>
</template>

<style scoped src="./LandingPage.css"></style>
