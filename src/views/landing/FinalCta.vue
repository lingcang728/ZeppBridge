<script setup lang="ts">
import LandingIcon from './LandingIcon.vue';
import type { LandingCopy } from './types';

defineProps<{
  copy: LandingCopy['final'];
  downloads: LandingCopy['downloads'];
  primary: { label: string; hint: string; href: string };
  secondary: { label: string; hint: string; href: string };
  msiHref: string;
  linux: Array<{ label: string; url: string }>;
  linuxIsPreview: boolean;
  status: string;
}>();
const emit = defineEmits<{ download: [] }>();
const releases = 'https://github.com/lingcang728/ZeppBridge/releases/latest';
const installGuide = 'https://github.com/lingcang728/ZeppBridge#download-and-install';
</script>

<template>
  <section id="download" class="lp-section final" aria-labelledby="download-title">
    <div class="download-intro">
      <div>
        <p class="lp-kicker">{{ copy.kicker }}</p>
        <h2 id="download-title" class="lp-h2">{{ copy.heading }}</h2>
        <p class="lp-lead">{{ copy.lead }}</p>
      </div>
      <div class="download-actions">
        <a class="lp-btn lp-btn-primary" :href="primary.href" rel="noopener" @click="emit('download')">
          <LandingIcon name="download" :size="20" />
          <span>{{ primary.label }}<small>{{ primary.hint }}</small></span>
        </a>
        <a class="lp-btn lp-btn-ghost" :href="secondary.href" rel="noopener" @click="emit('download')">
          <LandingIcon name="laptop" :size="20" />
          <span>{{ secondary.label }}<small>{{ secondary.hint }}</small></span>
        </a>
        <p class="download-status" role="status" aria-live="polite">{{ status }}</p>
      </div>
    </div>

    <p class="channel-note"><LandingIcon name="check" :size="18" /><span>{{ copy.facts.channel }}</span></p>
    <div class="platform-details">
      <div class="install-notes">
        <p class="systems">{{ copy.facts.systems }}</p>
        <p>{{ copy.facts.windows }}</p>
        <p>{{ copy.facts.macos }}</p>
        <a class="text-link" :href="installGuide" target="_blank" rel="noopener noreferrer">
          {{ copy.docs }}<LandingIcon name="arrow-right" :size="17" />
        </a>
      </div>
      <div class="other-builds">
        <a class="msi-link" :href="msiHref" rel="noopener" @click="emit('download')">
          <LandingIcon name="download" :size="17" /><span>{{ downloads.windows.msi }}</span>
        </a>
        <div class="linux-builds">
          <h3>{{ downloads.linux.label }}<span v-if="linuxIsPreview" class="preview-badge">{{ downloads.linux.previewBadge }}</span></h3>
          <div class="package-links" v-if="linux.length">
            <a v-for="item in linux" :key="item.label" :href="item.url" rel="noopener" @click="emit('download')">{{ item.label }}</a>
          </div>
          <a v-else class="text-link" :href="releases" target="_blank" rel="noopener noreferrer">GitHub Releases<LandingIcon name="arrow-right" :size="16" /></a>
          <p v-if="linuxIsPreview || !linux.length">{{ downloads.linux.note }}</p>
        </div>
        <p class="ai-note">{{ copy.facts.ai }}</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.final { padding-bottom: 32px; }
.download-intro { display: grid; grid-template-columns: 1.2fr 1fr; gap: 64px; align-items: center; padding: 40px 0; border-top: 1px solid var(--lp-line-2); }
.download-intro .lp-h2 { max-width: 15em; font-size: clamp(32px, 4vw, 54px); line-height: 1.12; }
.download-actions { display: grid; gap: 14px; justify-items: stretch; align-content: center; }
.download-actions .lp-btn { min-height: 68px; padding: 16px 24px; line-height: 1.45; border-radius: 16px; text-align: left; }
.download-actions .lp-btn > span { min-width: 0; }
.download-actions .lp-btn-primary { color: var(--lp-green-ink); }
.download-actions .lp-btn:active { transform: translateY(1px); }
.download-actions small { margin-top: 3px; }
.download-status { min-height: 2.8em; margin: 0; color: var(--lp-muted); font-size: 12px; line-height: 1.6; }
.channel-note { display: grid; grid-template-columns: auto 1fr; align-items: start; gap: 12px; margin: 0; padding: 24px 0; border-top: 1px solid var(--lp-line); border-bottom: 1px solid var(--lp-line); color: var(--lp-muted); font-size: 14px; line-height: 1.75; }
.channel-note .lp-icon { margin-top: 4px; color: var(--lp-green); }
.platform-details { display: grid; grid-template-columns: 1.2fr 1fr; gap: 64px; margin-top: 28px; }
.install-notes p, .other-builds p { margin: 0 0 16px; color: var(--lp-muted); font-size: 13px; line-height: 1.75; }
.install-notes .systems { color: var(--lp-ink); font-size: 14px; font-weight: 550; }
.text-link, .msi-link { display: inline-flex; align-items: center; gap: 10px; min-height: 44px; color: var(--lp-ink); font-size: 13px; line-height: 1.5; text-decoration: none; }
.text-link { border-bottom: 1px solid var(--lp-line-2); }
.text-link:hover, .msi-link:hover, .package-links a:hover { color: var(--lp-green); }
.msi-link { margin-bottom: 14px; }
.linux-builds { padding: 22px 0 6px; border-top: 1px solid var(--lp-line); }
.linux-builds h3 { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin: 0 0 8px; font-size: 16px; }
.preview-badge { padding: 3px 9px; border: 1px solid var(--lp-line-2); border-radius: 999px; color: var(--lp-muted); font-size: 11px; font-weight: 500; }
.package-links { display: flex; flex-wrap: wrap; gap: 8px 18px; margin-bottom: 8px; }
.package-links a { display: inline-flex; align-items: center; min-height: 44px; font-size: 13px; text-decoration: underline; text-underline-offset: 4px; text-decoration-color: var(--lp-line-2); }
.other-builds .ai-note { margin: 8px 0 0; padding-top: 18px; border-top: 1px solid var(--lp-line); }
@media (max-width: 800px) { .download-intro, .platform-details { grid-template-columns: 1fr; gap: 28px; }.download-intro { padding: 30px 0; }.download-actions { max-width: 440px; }.platform-details { gap: 20px; } }
@media (max-width: 420px) { .download-actions .lp-btn { padding: 14px 18px; }.download-intro .lp-h2 { font-size: 32px; } }
</style>
