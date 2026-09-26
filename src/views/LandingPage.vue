<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import BrandMark from '../components/BrandMark.vue';
import DesignIcon from '../components/DesignIcon.vue';
import DeviceMarquee from '../components/DeviceMarquee.vue';
import { useLandingLocale } from '../composables/useLandingLocale';
import { isUsableReleasePayload } from '../lib/releaseAssets';
import { COPY } from './landing/landingCopy';
import type { DownloadPlatform, LatestRelease, ReleaseAsset } from './landing/release';

const githubUrl = 'https://github.com/lingcang728/ZeppBridge';
const releaseUrl = `${githubUrl}/releases/latest`;
const releaseEndpoint = '/api/release';

const { locale, initializeLocale, toggleLocale } = useLandingLocale();

// 访客系统探测：Mac 用户默认看到 macOS 版按钮，其余一律 Windows。
// 只做一次静态判断——探测不到就退回 Windows，绝不隐藏另一个平台的入口。
const isMacVisitor = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const platform = `${navigator.platform ?? ''} ${navigator.userAgent ?? ''}`;
  // iPadOS 会伪装成 Mac，但它同样不是 Windows，归到 macOS 一侧不影响判断。
  return /Mac|iPad|iPhone|iPod/i.test(platform);
};

const t = computed(() => COPY[locale.value]);

const latestRelease = ref<LatestRelease | null>(null);
const releaseState = ref<'loading' | 'ready' | 'fallback'>('loading');
const showStarNudge = ref(false);

const isTrustedAssetUrl = (value: string): boolean =>
  value.startsWith(`${githubUrl}/releases/download/`);

const loadLatestRelease = async () => {
  try {
    const response = await fetch(releaseEndpoint, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`release endpoint returned ${response.status}`);
    const payload = await response.json() as LatestRelease;
    /*
     * 判据在 lib/releaseAssets.ts，那里能测。
     *
     * 这里原来写的是 `assets.length !== 3`：2.0.0 给 /api/release 加了四个
     * 可选的 Linux 包之后，这一句立刻把整个下载页打进 fallback——三个 CTA
     * 全部退化成「打开 GitHub Release 页面」，Windows 和 macOS 的直链也跟着
     * 一起没了。页面照样渲染，控制台照样干净。
     */
    if (!isUsableReleasePayload(payload.downloads, isTrustedAssetUrl)) {
      throw new Error('release endpoint returned an invalid asset set');
    }
    latestRelease.value = payload;
    releaseState.value = 'ready';
  } catch {
    releaseState.value = 'fallback';
  }
};

onMounted(() => {
  initializeLocale();
  void loadLatestRelease();
});

const primaryPlatform = computed<DownloadPlatform>(() => (isMacVisitor() ? 'macos' : 'windows'));
const secondaryPlatform = computed<DownloadPlatform>(() => (primaryPlatform.value === 'macos' ? 'windows' : 'macos'));
const primaryDownload = computed(() => t.value.downloads[primaryPlatform.value]);
const secondaryDownload = computed(() => t.value.downloads[secondaryPlatform.value]);
const assetFor = (platform: DownloadPlatform): ReleaseAsset | null => {
  if (!latestRelease.value) return null;
  return platform === 'windows'
    ? latestRelease.value.downloads.windowsExe
    : latestRelease.value.downloads.macosDmg;
};
const primaryAsset = computed(() => assetFor(primaryPlatform.value));
const secondaryAsset = computed(() => assetFor(secondaryPlatform.value));
const primaryHref = computed(() => primaryAsset.value?.url ?? releaseUrl);
const secondaryHref = computed(() => secondaryAsset.value?.url ?? releaseUrl);
const windowsMsiHref = computed(() => latestRelease.value?.downloads.windowsMsi.url ?? releaseUrl);
/*
 * Linux 的四个包。没有就整块不渲染——旧的 latest release 里确实没有它们，
 * 那不是错误，不该在页面上留下四个指向 GitHub 首页的死链接。
 */
const linuxDownloads = computed(() => {
  const downloads = latestRelease.value?.downloads;
  if (!downloads) return [];
  const candidates: Array<{ label: string; asset?: ReleaseAsset }> = [
    { label: '.deb', asset: downloads.linuxDeb },
    { label: '.rpm', asset: downloads.linuxRpm },
    { label: 'AppImage', asset: downloads.linuxAppImage },
    { label: 'Flatpak', asset: downloads.linuxFlatpak },
  ];
  return candidates
    .filter((entry): entry is { label: string; asset: ReleaseAsset } => Boolean(entry.asset))
    .map((entry) => ({ label: entry.label, url: entry.asset.url }));
});
const linuxIsPreview = computed(
  () => latestRelease.value?.downloads.linuxDeb?.preview === true,
);
const releaseStatusText = computed(() => {
  if (releaseState.value === 'ready') {
    return `v${latestRelease.value?.version} · ${t.value.downloads.status.ready}`;
  }
  return t.value.downloads.status[releaseState.value];
});
const revealStarNudge = () => {
  showStarNudge.value = true;
};
</script>

<template>
  <div class="landing-page">
    <header class="landing-nav">
      <a class="landing-brand" href="#top" :aria-label="t.nav.home"><span><BrandMark :size="34" /></span><strong>ZeppBridge</strong></a>
      <nav :aria-label="t.nav.site"><a href="#features">{{ t.nav.features }}</a><a href="#local">{{ t.nav.local }}</a><a href="#connect">{{ t.nav.connect }}</a><a href="#privacy">{{ t.nav.privacy }}</a></nav>
      <div class="nav-actions">
        <button type="button" class="lang-toggle" @click="toggleLocale"><DesignIcon name="handoff" :size="19" />{{ t.languageToggle }}</button>
        <a class="nav-github" :href="githubUrl" target="_blank" rel="noopener">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.8 2.7 5.47 6.04.88-4.37 4.26 1.03 6.02L12 16.58l-5.4 2.85 1.03-6.02-4.37-4.26 6.04-.88L12 2.8Z" /></svg>
          {{ t.nav.star }}
        </a>
      </div>
    </header>

    <main id="top">
      <section class="hero-section">
        <div class="hero-copy">
          <p class="overline"><span></span>LOCAL-FIRST · OPEN SOURCE</p>
          <h1>{{ t.hero.headlineLead }}<br /><em>{{ t.hero.headlineAccent }}</em></h1>
          <p class="hero-lead">{{ t.hero.lead }}</p>
          <div class="hero-actions">
            <div class="download-choice is-primary">
              <a class="primary-cta" :href="primaryHref" :target="primaryAsset ? undefined : '_blank'" rel="noopener" @click="revealStarNudge">
                <DesignIcon name="app-icon" :size="34" />
                <span><b>{{ primaryDownload.label }}</b><small>{{ primaryDownload.hint }}</small></span>
                <DesignIcon name="chevron-right" :size="20" />
              </a>
              <a v-if="primaryPlatform === 'windows'" class="format-link" :href="windowsMsiHref" :target="latestRelease ? undefined : '_blank'" rel="noopener" @click="revealStarNudge">{{ t.downloads.windows.msi }}</a>
            </div>
            <div class="download-choice">
              <a class="alt-cta" :href="secondaryHref" :target="secondaryAsset ? undefined : '_blank'" rel="noopener" @click="revealStarNudge">
                <DesignIcon name="app-icon" :size="24" />
                <span><b>{{ secondaryDownload.label }}</b><small>{{ secondaryDownload.hint }}</small></span>
              </a>
              <a v-if="secondaryPlatform === 'windows'" class="format-link" :href="windowsMsiHref" :target="latestRelease ? undefined : '_blank'" rel="noopener" @click="revealStarNudge">{{ t.downloads.windows.msi }}</a>
            </div>
          </div>
          <div v-if="linuxDownloads.length" class="linux-row">
            <p class="linux-head">
              <strong>{{ t.downloads.linux.label }}</strong>
              <em v-if="linuxIsPreview">{{ t.downloads.linux.previewBadge }}</em>
            </p>
            <div class="linux-links">
              <a
                v-for="item in linuxDownloads"
                :key="item.label"
                :href="item.url"
                rel="noopener"
                @click="revealStarNudge"
              >{{ item.label }}</a>
            </div>
            <p v-if="linuxIsPreview" class="linux-note">{{ t.downloads.linux.note }}</p>
          </div>
          <p class="release-status" :class="`is-${releaseState}`"><i></i>{{ releaseStatusText }}</p>
          <Transition name="star-nudge">
            <aside v-if="showStarNudge" class="star-nudge" aria-live="polite">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.8 2.7 5.47 6.04.88-4.37 4.26 1.03 6.02L12 16.58l-5.4 2.85 1.03-6.02-4.37-4.26 6.04-.88L12 2.8Z" /></svg>
              <div><strong>{{ t.hero.starNudge.title }}</strong><p>{{ t.hero.starNudge.copy }}</p></div>
              <a :href="githubUrl" target="_blank" rel="noopener">{{ t.hero.starNudge.action }}</a>
              <button type="button" @click="showStarNudge = false">{{ t.hero.starNudge.dismiss }}</button>
            </aside>
          </Transition>
          <div class="trust-row"><span v-for="item in t.hero.trust" :key="item.label"><DesignIcon :name="item.icon" :size="23" />{{ item.label }}</span></div>
        </div>

        <div class="hero-stage" :aria-label="t.hero.stageLabel">
          <div class="stage-glow"></div>
          <DeviceMarquee class="hero-marquee" />
          <article class="bridge-core"><DesignIcon name="app-icon" :size="72" /><div><span>LOCAL BRIDGE</span><strong>ZeppBridge</strong><small>{{ t.hero.coreCaption }}</small></div></article>
          <div class="output-stack">
            <article><DesignIcon name="structured-data" :size="37" /><span><b>{{ t.hero.outputs[0].title }}</b><small>{{ t.hero.outputs[0].copy }}</small></span></article>
            <article><DesignIcon name="ai-ready" :size="37" /><span><b>{{ t.hero.outputs[1].title }}</b><small>{{ t.hero.outputs[1].copy }}</small></span></article>
          </div>
          <div class="stage-status"><DesignIcon name="verified" :size="24" /><span><b>{{ t.hero.status.title }}</b><small>{{ t.hero.status.copy }}</small></span></div>
        </div>
      </section>

      <section class="principle-strip" :aria-label="t.principlesLabel">
        <div v-for="item in t.principles" :key="item.title"><DesignIcon :name="item.icon" :size="30" /><span><b>{{ item.title }}</b><small>{{ item.copy }}</small></span></div>
      </section>

      <section id="features" class="content-section feature-section">
        <div class="section-heading"><p>{{ t.features.overline }}</p><h2>{{ t.features.heading }}</h2><span>{{ t.features.lead }}</span></div>
        <div class="capability-grid"><article v-for="item in t.features.items" :key="item.title" :class="`capability-card tone-${item.tone}`"><DesignIcon :name="item.icon" :size="62" /><span><b>{{ item.title }}</b><small>{{ item.copy }}</small></span><DesignIcon name="chevron-right" :size="19" /></article></div>
      </section>

      <section id="local" class="content-section connect-section">
        <div class="connect-intro"><p>{{ t.local.overline }}</p><h2>{{ t.local.heading }}</h2><span>{{ t.local.lead }}</span><div class="connect-art"><DesignIcon name="app-icon" :size="84" /><div class="mini-flow"><i></i><i></i><i></i></div><DesignIcon name="structured-data" :size="84" /></div></div>
        <div class="auth-grid"><article v-for="outlet in t.local.items" :key="outlet.title"><div class="auth-title"><DesignIcon :name="outlet.icon" :size="46" /><span>{{ outlet.tag }}</span></div><h3>{{ outlet.title }}</h3><p>{{ outlet.copy }}</p><DesignIcon name="chevron-right" :size="19" /></article></div>
      </section>

      <section id="connect" class="content-section connect-section">
        <div class="connect-intro"><p>{{ t.connect.overline }}</p><h2>{{ t.connect.heading }}</h2><span>{{ t.connect.lead }}</span><div class="connect-art"><DesignIcon name="zepp-cloud" :size="84" /><div class="mini-flow"><i></i><i></i><i></i></div><DesignIcon name="app-icon" :size="84" /></div></div>
        <div class="auth-grid"><article v-for="method in t.connect.items" :key="method.title"><div class="auth-title"><DesignIcon :name="method.icon" :size="46" /><span>{{ method.tag }}</span></div><h3>{{ method.title }}</h3><p>{{ method.copy }}</p><DesignIcon name="chevron-right" :size="19" /></article></div>
      </section>

      <section id="privacy" class="privacy-section">
        <div class="privacy-copy"><p>{{ t.privacy.overline }}</p><h2>{{ t.privacy.heading }}</h2><span>{{ t.privacy.lead }}</span><div class="privacy-points"><span v-for="point in t.privacy.points" :key="point.label"><DesignIcon :name="point.icon" :size="26" />{{ point.label }}</span></div></div>
        <div class="privacy-vault"><DesignIcon name="private" :size="104" /><div><b>LOCAL VAULT</b><span>{{ t.privacy.vault }}</span></div></div>
      </section>
    </main>

    <footer><a class="landing-brand" href="#top"><span><BrandMark :size="29" /></span><strong>ZeppBridge</strong></a><p>{{ t.footer.tagline }}</p><p class="footer-disclaimer">{{ t.footer.disclaimer }}</p><div><a :href="githubUrl" target="_blank" rel="noopener">GitHub</a><a :href="releaseUrl" target="_blank" rel="noopener">{{ t.footer.download }}</a></div></footer>
  </div>
</template>

<style scoped src="./LandingPage.css"></style>
