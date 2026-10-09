<script setup lang="ts">
import Icon from '../../components/Icon.vue';
import type { JourneyCopy } from './journeyCopy';
defineProps<{ journey: JourneyCopy }>();
</script>
<template>
  <section id="docs" class="lp-section documentation" aria-labelledby="docs-title">
    <h2 id="docs-title" class="lp-h2">{{ journey.nav[2] }}</h2>
    <div class="guide-steps"><details v-for="(step, i) in journey.guide" :key="step[0]"><summary><span class="guide-number">{{ i + 1 }}</span><div><h3>{{ step[0] }}</h3><p>{{ step[1] }}</p></div><Icon name="plus" :size="22" /></summary><p class="guide-detail">{{ step[2] }}</p></details></div>
  </section>
</template>
<style scoped>
.documentation { padding-top: 140px; max-width: 1000px; }
.guide-steps { margin-top: 36px; }
details { border-bottom: 1px solid var(--line); padding: 30px 0; }
summary { list-style: none; cursor: pointer; display: grid; grid-template-columns: 56px 1fr 24px; gap: 24px; align-items: center; }
summary::-webkit-details-marker { display: none; }
.guide-number { font-size: 32px; font-weight: 500; color: var(--subtle); font-variant-numeric: tabular-nums; }
h3 { font-size: 24px; margin: 0; font-weight: 550; letter-spacing: -.02em; }
summary p { font-size: 17px; margin: 12px 0 0; line-height: 1.6; color: var(--muted); }
.guide-detail { margin: 24px 48px 0 80px; color: var(--muted); font-size: 16px; line-height: 1.85; animation: detail-in .35s ease; }
summary svg { transition: transform .3s ease; } details[open] summary svg { transform: rotate(45deg); }
@keyframes detail-in { from { opacity: 0; transform: translateY(-6px); } }
@media(max-width:720px) { .documentation { padding-top: 90px; } summary { grid-template-columns: 28px 1fr 20px; gap: 14px; } h3 { font-size: 21px; } summary p { font-size: 16px; } .guide-number { font-size: 24px; } .guide-detail { margin-left: 42px; margin-right: 0; } }
</style>
