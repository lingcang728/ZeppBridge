<script setup lang="ts">
import FeatureMedia from './FeatureMedia.vue';
import Icon from '../../components/Icon.vue';
import { FEATURE_SCENES } from './featureScenes';
import type { LandingLocale } from '../../composables/useLandingLocale';
import type { JourneyCopy } from './journeyCopy';
defineProps<{ journey: JourneyCopy; locale: LandingLocale }>();
</script>
<template>
  <section id="features" class="lp-section features" :aria-label="journey.nav[0]">
    <article v-for="(scene, i) in FEATURE_SCENES" :id="'feature-' + scene.id" :key="scene.id" :class="['feature-story', 'chapter-' + i]" data-reveal :aria-labelledby="'title-' + scene.id">
      <div class="feature-text"><Icon class="feature-icon" :name="scene.icon" :size="32" /><h2 :id="'title-' + scene.id">{{ journey.chapters[i][0] }}</h2><p>{{ journey.chapters[i][1] }}</p><ul><li v-for="bullet in journey.chapters[i].slice(2)" :key="bullet">{{ bullet }}</li></ul></div>
      <FeatureMedia :scene="scene.id" :locale="locale" :title="journey.chapters[i][0]" />
    </article>
  </section>
</template>
<style scoped>
.features { padding-top: 80px; }
.feature-story { display: grid; grid-template-columns: minmax(0,.68fr) minmax(0,1.32fr); align-items: center; gap: clamp(36px,5vw,92px); padding: 100px 0; }
.feature-text { min-width: 0; }
.feature-icon { color: var(--muted); margin-bottom: 26px; }
.feature-text h2 { margin: 0; font-size: clamp(30px,3.25vw,49px); font-weight: 600; letter-spacing: -.045em; line-height: 1.2; text-wrap: balance; }
.feature-text > p { margin: 24px 0 0; font-size: 18px; color: var(--lp-muted); line-height: 1.7; max-width: 32em; }
.feature-text ul { list-style: none; padding: 0; margin: 26px 0 0; display: grid; gap: 12px; font-size: 15px; color: var(--lp-muted); line-height: 1.65; }
.feature-text li { padding-left: 16px; border-left: 2px solid var(--line-strong); }
.chapter-1, .chapter-4 { grid-template-columns: 1fr; gap: 46px; }
.chapter-1 .feature-text, .chapter-4 .feature-text { max-width: 750px; margin: 0 auto; text-align: center; }
.chapter-1 ul, .chapter-4 ul { display: flex; justify-content: center; flex-wrap: wrap; gap: 16px 32px; }
.chapter-1 li, .chapter-4 li { padding: 0; border: 0; }
.chapter-3 { grid-template-columns: minmax(0,1.32fr) minmax(0,.68fr); }
.chapter-3 .feature-text { grid-column: 2; grid-row: 1; }
.chapter-3 :deep(.feature-media) { grid-column: 1; grid-row: 1; }
@media(max-width:900px) { .feature-story { grid-template-columns: 1fr; padding: 64px 0; gap: 32px; } .feature-text { max-width: 660px; } .chapter-3 .feature-text, .chapter-3 :deep(.feature-media) { grid-column: auto; grid-row: auto; } .feature-text h2 { font-size: clamp(30px,6vw,44px); } .feature-text > p { font-size: 17px; } .feature-icon { margin-bottom: 18px; } .chapter-1 .feature-text, .chapter-4 .feature-text { text-align: left; margin: 0; } .chapter-1 ul, .chapter-4 ul { display: grid; justify-content: start; gap: 12px; } .chapter-1 li, .chapter-4 li { padding-left: 16px; border-left: 2px solid var(--line-strong); } }
</style>
