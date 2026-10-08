<script setup lang="ts">
import LandingIcon from './LandingIcon.vue';
import type { LandingCopy } from './types';

defineProps<{ copy: LandingCopy['connect'] }>();
const connectionGuide = 'https://github.com/lingcang728/ZeppBridge/blob/v3/docs/guides/connection.md';
</script>

<template>
  <section id="connect" class="lp-section connect" aria-labelledby="connect-title">
    <p class="lp-kicker">{{ copy.kicker }}</p>
    <h2 id="connect-title" class="lp-h2">{{ copy.heading }}</h2>
    <p class="lp-lead">{{ copy.lead }}</p>
    <div class="connection-layout">
      <article class="recommended-path">
        <div class="path-label"><LandingIcon name="check" :size="18" /><span>{{ copy.recommended }}</span></div>
        <h3>{{ copy.paths[0].title }}</h3>
        <p class="path-copy">{{ copy.paths[0].copy }}</p>
        <p class="path-detail">{{ copy.paths[0].detail }}</p>
        <a class="guide" :href="connectionGuide" target="_blank" rel="noopener noreferrer">
          {{ copy.docs }}<LandingIcon name="arrow-right" :size="18" />
        </a>
      </article>
      <div class="alternatives">
        <p class="alternatives-label">{{ copy.advanced }}</p>
        <article v-for="(path, index) in copy.paths.slice(1)" :key="path.title" class="alternative">
          <span class="path-number" aria-hidden="true">{{ index + 2 }}</span>
          <div><h3>{{ path.title }}</h3><p>{{ path.copy }}</p><p class="path-detail">{{ path.detail }}</p></div>
        </article>
      </div>
    </div>
    <div class="connection-notes"><p>{{ copy.note }}</p><p class="edition">{{ copy.edition }}</p></div>
  </section>
</template>

<style scoped>
.connect .lp-h2 { font-size: clamp(30px, 3.6vw, 48px); line-height: 1.15; }
.connection-layout { display: grid; grid-template-columns: 1.1fr 1fr; gap: 52px; margin-top: 38px; }
.recommended-path { padding: 32px 36px; border: 1px solid var(--lp-line-2); border-radius: 22px; background: var(--lp-panel); }
.path-label { display: inline-flex; align-items: center; gap: 9px; padding-bottom: 20px; color: var(--lp-green); font-size: 13px; font-weight: 650; }
.recommended-path h3 { margin: 0; font-size: clamp(22px, 2vw, 28px); line-height: 1.3; letter-spacing: -.02em; }
.path-copy { margin: 18px 0 12px; font-size: 17px; line-height: 1.65; }
.path-detail { color: var(--lp-muted); font-size: 14px; line-height: 1.75; }
.guide { display: inline-flex; align-items: center; gap: 12px; min-height: 44px; margin-top: 16px; border-bottom: 1px solid var(--lp-line-2); font-size: 14px; line-height: 1.5; text-decoration: none; }
.guide:hover { color: var(--lp-green); }
.alternatives { padding: 8px 0; }
.alternatives-label { margin: 0 0 16px; color: var(--lp-muted); font-size: 12px; font-weight: 650; letter-spacing: .07em; }
.alternative { display: grid; grid-template-columns: 28px 1fr; gap: 16px; padding: 22px 0; border-top: 1px solid var(--lp-line); }
.path-number { color: var(--lp-subtle); font-family: var(--font-mono); font-size: 13px; line-height: 25px; }
.alternative h3 { margin: 0; font-size: 18px; line-height: 1.4; }
.alternative p { margin: 10px 0 0; font-size: 14px; line-height: 1.75; }
.connection-notes { display: grid; grid-template-columns: 1.1fr 1fr; gap: 52px; margin-top: 26px; padding-top: 24px; border-top: 1px solid var(--lp-line); }
.connection-notes p { margin: 0; color: var(--lp-muted); font-size: 14px; line-height: 1.75; }
.connection-notes .edition { font-size: 13px; }
@media (max-width: 800px) { .connection-layout, .connection-notes { grid-template-columns: 1fr; gap: 24px; }.recommended-path { padding: 26px; }.connection-notes { gap: 16px; } }
@media (max-width: 420px) { .recommended-path { padding: 22px; }.alternative { gap: 10px; } }
</style>
