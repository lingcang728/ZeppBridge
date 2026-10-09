<script setup lang="ts">
import GlyphTile from '../../components/GlyphTile.vue';
import MotionReel from './MotionReel.vue';
import type { DesignIconName } from '../../components/DesignIcon.vue';
import type { LandingLocale } from '../../composables/useLandingLocale';
import type { JourneyCopy } from './journeyCopy';
defineProps<{ journey: JourneyCopy; locale: LandingLocale }>();
const icons: Record<string, DesignIconName> = { plan: 'document', arrange: 'overview', prompt: 'handoff', types: 'training-load' };
</script>

<template>
  <section id="ai" class="lp-section ai-stage" aria-labelledby="ai-title">
    <h2 id="ai-title" class="lp-h2" data-reveal>{{ journey.aiTitle }}</h2>
    <p class="lp-lead" data-reveal>{{ journey.aiLead }}</p>
    <div id="ai-plan" class="ai-playback"><MotionReel id="ai" :locale="locale" :title="journey.aiTitle" /></div>
    <ul class="ai-beats">
      <li v-for="beat in journey.beats" :id="beat.id === 'arrange' ? 'ai-arrange' : beat.id === 'prompt' ? 'ai-prompt' : beat.id === 'types' ? 'ai-types' : undefined" :key="beat.id" data-reveal>
        <GlyphTile :name="icons[beat.id]" :size="32" /><div><h3>{{ beat.title }}</h3><p>{{ beat.text }}</p></div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.ai-stage { padding-top: 96px; }
.ai-playback { margin-top: 36px; }
.ai-beats { list-style: none; margin: 22px 0 0; padding: 0; display: grid; grid-template-columns: repeat(4, 1fr); gap: 28px; }
.ai-beats li { display: flex; gap: 12px; align-items: start; min-width: 0; }
.ai-beats h3 { margin: 0 0 6px; font-size: 16px; font-weight: 600; }
.ai-beats p { margin: 0; color: var(--muted); line-height: 1.65; font-size: 14px; }
@media(max-width:860px) { .ai-stage { padding-top: 72px; } .ai-beats { grid-template-columns: 1fr 1fr; gap: 20px; } }
@media(max-width:480px) { .ai-beats { grid-template-columns: 1fr; } }
</style>
