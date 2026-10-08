<script setup lang="ts">
import LandingIcon from './LandingIcon.vue';
import type { LandingCopy } from './types';

defineProps<{ copy: LandingCopy['privacy'] }>();
const privacyGuide = 'https://github.com/lingcang728/ZeppBridge/blob/v3/docs/reference/security-and-privacy.md';
</script>

<template>
  <section id="privacy" class="lp-section privacy" aria-labelledby="privacy-title">
    <div class="privacy-intro">
      <div>
        <p class="lp-kicker">{{ copy.kicker }}</p>
        <h2 id="privacy-title" class="lp-h2">{{ copy.heading }}</h2>
      </div>
      <p class="lp-lead">{{ copy.lead }}</p>
    </div>
    <div class="vault">
      <ol class="record-path" :aria-label="copy.heading">
        <li><LandingIcon name="watch" :size="26" /><span>{{ copy.nodes.watch }}</span></li>
        <li><LandingIcon name="cloud" :size="26" /><span>{{ copy.nodes.cloud }}</span></li>
        <li class="local-node"><LandingIcon name="folder" :size="26" /><span>{{ copy.nodes.computer }}</span></li>
      </ol>
      <p class="flow-note">{{ copy.flowNote }}</p>
      <div class="export-path">
        <span class="branch" aria-hidden="true"><LandingIcon name="arrow-right" :size="24" /></span>
        <div>
          <p class="export-label">{{ copy.exportNote }}</p>
          <h3><LandingIcon name="file" :size="20" />{{ copy.nodes.export }}</h3>
        </div>
      </div>
      <div class="services">
        <LandingIcon name="globe" :size="22" />
        <div><h3>{{ copy.services.title }}</h3><p>{{ copy.services.copy }}</p></div>
      </div>
    </div>
    <div class="privacy-details">
      <ul class="points">
        <li v-for="(point, index) in copy.points" :key="point.title">
          <span class="point-index" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span>
          <div><h3>{{ point.title }}</h3><p>{{ point.copy }}</p></div>
        </li>
      </ul>
      <a class="guide" :href="privacyGuide" target="_blank" rel="noopener noreferrer">
        {{ copy.docs }}<LandingIcon name="arrow-right" :size="18" />
      </a>
    </div>
  </section>
</template>

<style scoped>
.privacy-intro { display: grid; grid-template-columns: 1.1fr 1fr; gap: 48px; align-items: end; margin-bottom: 36px; }
.privacy-intro .lp-h2 { font-size: clamp(30px, 3.6vw, 48px); line-height: 1.15; }
.privacy-intro .lp-lead { margin: 0; }
.vault { --v-ink: #eef2ef; --v-muted: #bcc7cb; --v-line: #3b444b; padding: 44px 48px 32px; border: 1px solid #323c41; border-radius: 28px; background: #182127; color: var(--v-ink); }
.record-path { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); align-items: start; margin: 0; padding: 0; list-style: none; }
.record-path li { position: relative; display: grid; justify-items: center; gap: 16px; padding: 20px 16px; text-align: center; font-size: 16px; font-weight: 600; line-height: 1.5; }
.record-path li::after { content: ''; position: absolute; right: -28px; top: 34px; width: 56px; height: 1px; background: var(--v-line); }
.record-path li:last-child::after { display: none; }
.record-path .lp-icon { color: #bdce9b; }
.local-node { border: 1px solid #536749; border-radius: 16px; background: #25342f; }
.flow-note { max-width: 62ch; margin: 24px auto 0; color: var(--v-muted); font-size: 14px; line-height: 1.7; text-align: center; }
.export-path { display: flex; align-items: center; justify-content: flex-end; gap: 18px; margin: 30px 0; padding: 24px 0 0; border-top: 1px dashed var(--v-line); }
.branch { color: #bdce9b; }
.export-label { margin: 0 0 8px; color: var(--v-muted); font-size: 12px; line-height: 1.6; }
.export-path h3 { display: flex; align-items: center; gap: 10px; margin: 0; font-size: 16px; line-height: 1.5; font-weight: 550; }
.services { display: grid; grid-template-columns: auto 1fr; gap: 18px; padding-top: 26px; border-top: 1px solid var(--v-line); }
.services > .lp-icon { margin-top: 2px; color: var(--v-muted); }
.services h3 { margin: 0 0 10px; font-size: 16px; line-height: 1.5; }
.services p { max-width: 78ch; margin: 0; color: var(--v-muted); font-size: 14px; line-height: 1.75; }
.privacy-details { display: grid; grid-template-columns: 1fr auto; gap: 44px; align-items: start; margin-top: 34px; }
.points { display: grid; gap: 24px; margin: 0; padding: 0; list-style: none; }
.points li { display: grid; grid-template-columns: 24px 1fr; gap: 18px; }
.point-index { color: var(--lp-green); font-family: var(--font-mono); font-size: 12px; line-height: 25px; }
.points h3 { margin: 0 0 6px; font-size: 16px; line-height: 1.5; }
.points p { max-width: 76ch; margin: 0; color: var(--lp-muted); font-size: 14px; line-height: 1.75; }
.guide { display: inline-flex; align-items: center; gap: 12px; max-width: 24ch; min-height: 44px; border-bottom: 1px solid var(--lp-line-2); font-size: 14px; line-height: 1.5; text-decoration: none; }
.guide:hover { color: var(--lp-green); }
@media (max-width: 800px) { .privacy-intro { grid-template-columns: 1fr; gap: 20px; }.privacy-details { grid-template-columns: 1fr; gap: 22px; }.vault { padding: 30px 24px 26px; } }
@media (max-width: 540px) {
  .vault { padding: 24px 20px; border-radius: 20px; }
  .record-path { grid-template-columns: 1fr; gap: 20px; }
  .record-path li { grid-template-columns: auto 1fr; align-items: center; justify-items: start; padding: 16px; text-align: left; }
  .record-path li::after { top: auto; right: auto; bottom: -20px; left: 28px; width: 1px; height: 20px; }
  .flow-note { text-align: left; }
  .export-path { justify-content: flex-start; }
  .services { gap: 12px; }
}
</style>
