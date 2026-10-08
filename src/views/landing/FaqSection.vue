<script setup lang="ts">
import LandingIcon from './LandingIcon.vue';
import type { LandingCopy } from './types';

defineProps<{ copy: LandingCopy['faq'] }>();
const projectDocs = 'https://github.com/lingcang728/ZeppBridge/blob/v3/README.md';
</script>

<template>
  <section id="faq" class="lp-section faq" aria-labelledby="faq-title">
    <div class="faq-intro">
      <h2 id="faq-title" class="lp-h2">{{ copy.heading }}</h2>
      <p class="lp-lead">{{ copy.lead }}</p>
      <a class="faq-guide" :href="projectDocs" target="_blank" rel="noopener noreferrer">
        {{ copy.docs }}<LandingIcon name="arrow-right" :size="18" />
      </a>
    </div>
    <div class="faq-list">
      <details v-for="item in copy.items" :key="item.question">
        <summary><span>{{ item.question }}</span><LandingIcon name="chevron-down" :size="18" /></summary>
        <p>{{ item.answer }}</p>
      </details>
    </div>
  </section>
</template>

<style scoped>
.faq { display: grid; grid-template-columns: .85fr 1.3fr; gap: 72px; align-items: start; }
.faq .lp-h2 { font-size: clamp(30px, 3.4vw, 46px); line-height: 1.15; }
.faq .lp-lead { font-size: 15px; }
.faq-guide { display: inline-flex; align-items: center; gap: 12px; min-height: 44px; margin-top: 20px; border-bottom: 1px solid var(--lp-line-2); font-size: 14px; line-height: 1.5; text-decoration: none; }
.faq-guide:hover { color: var(--lp-green); }
.faq-list { border-top: 1px solid var(--lp-line-2); }
.faq-list details { border-bottom: 1px solid var(--lp-line); }
.faq-list summary { display: flex; align-items: center; justify-content: space-between; gap: 20px; min-height: 68px; padding: 20px 0; font-size: 16px; font-weight: 550; line-height: 1.6; list-style: none; cursor: pointer; }
.faq-list summary::-webkit-details-marker { display: none; }
.faq-list summary .lp-icon { color: var(--lp-muted); transition: transform .2s ease; }
.faq-list details[open] summary .lp-icon { transform: rotate(180deg); }
.faq-list details[open] summary { color: var(--lp-green); }
.faq-list details p { margin: 0; padding: 0 36px 24px 0; color: var(--lp-muted); font-size: 14px; line-height: 1.8; }
@media (max-width: 800px) { .faq { grid-template-columns: 1fr; gap: 28px; }.faq-intro .lp-lead { max-width: 45ch; }.faq-guide { margin-top: 12px; } }
@media (prefers-reduced-motion: reduce) { .faq-list summary .lp-icon { transition: none; } }
</style>
