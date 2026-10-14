<script setup lang="ts">
import GlyphTile from '../../components/GlyphTile.vue';
import LiveFrame from './LiveFrame.vue';
import type { DesignIconName } from '../../components/DesignIcon.vue';
import type { LandingLocale } from '../../composables/useLandingLocale';
import type { JourneyCopy } from './journeyCopy';

defineProps<{ journey: JourneyCopy; locale: LandingLocale }>();
const routes: Record<string, string> = { overview: '/', sleep: '/sleep', workouts: '/workouts' };
const icons: Record<string, DesignIconName> = {
  overview: 'overview',
  sleep: 'sleep',
  workouts: 'training-load',
};
</script>

<template>
  <section id="records" class="lp-section record-board" aria-labelledby="records-title">
    <h2 id="records-title" class="lp-h2">{{ journey.recordsTitle }}</h2>
    <div class="record-grid">
      <article v-for="item in journey.records" :id="'record-' + item.id" :key="item.id" class="record-card" :class="'record-' + item.id">
        <div class="record-copy" data-reveal>
          <GlyphTile :name="icons[item.id]" :size="36" />
          <h3>{{ item.title }}</h3>
          <p>{{ item.text }}</p>
        </div>
        <LiveFrame :route="routes[item.id] ?? '/'" :locale="locale" :title="item.title" />
      </article>
    </div>
  </section>
</template>

<style scoped>
.record-board { padding-top: 96px; }
.record-grid { display: grid; gap: 22px; margin-top: 36px; }
.record-card { display: grid; gap: 16px; min-width: 0; }
.record-copy { display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto; column-gap: 12px; align-items: center; }
.record-copy h3 { margin: 0; font-size: 22px; font-weight: 600; letter-spacing: -.03em; }
.record-copy p { grid-column: 2; margin: 0; color: var(--muted); line-height: 1.6; }
.record-overview { grid-column: 1 / -1; grid-template-columns: minmax(220px, 320px) minmax(0, 1fr); align-items: center; gap: 28px; }
@media (min-width: 861px) {
  .record-grid { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 860px) {
  .record-overview { grid-template-columns: 1fr; }
  .record-board { padding-top: 72px; }
}
</style>
