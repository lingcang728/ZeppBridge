<script setup lang="ts">
import FeatureChapter from './FeatureChapter.vue';
import MotionReel from './MotionReel.vue';
import GlyphTile from '../../components/GlyphTile.vue';
import type { P4Copy } from './p4Copy';
import type { LandingLocale } from '../../composables/useLandingLocale';

defineProps<{ copy: P4Copy; locale: LandingLocale }>();
</script>

<template>
  <FeatureChapter v-for="(chapter, index) in copy.chapters" :key="chapter.id" :chapter="chapter" :index="index" :locale="locale">
    <div v-if="chapter.id === 'records'" class="record-pair">
      <article id="record-sleep">
        <div class="record-heading"><GlyphTile name="sleep" :size="36" /><div><h3>{{ copy.records.sleep.title }}</h3><p>{{ copy.records.sleep.text }}</p></div></div>
        <MotionReel id="sleep" :locale="locale" :title="copy.records.sleep.title" />
      </article>
      <article id="record-workouts">
        <div class="record-heading"><GlyphTile name="training-load" :size="36" /><div><h3>{{ copy.records.workouts.title }}</h3><p>{{ copy.records.workouts.text }}</p></div></div>
        <MotionReel id="workouts" :locale="locale" :title="copy.records.workouts.title" />
      </article>
    </div>
  </FeatureChapter>
</template>

<style scoped>
.record-pair { grid-column: 1 / -1; display: grid; grid-template-columns: 1fr 1fr; gap: 28px; padding-top: 28px; }
.record-pair article { min-width: 0; }
.record-heading { display: flex; gap: 12px; align-items: center; margin-bottom: 20px; }
h3 { margin: 0 0 6px; font-size: 22px; font-weight: 600; }
p { margin: 0; color: var(--muted); font-size: 14px; line-height: 1.65; }
@media(max-width:860px) { .record-pair { grid-template-columns: 1fr; } }
</style>
