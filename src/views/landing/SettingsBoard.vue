<script setup lang="ts">
import GlyphTile from '../../components/GlyphTile.vue';
import LiveFrame from './LiveFrame.vue';
import type { DesignIconName } from '../../components/DesignIcon.vue';
import type { LandingLocale } from '../../composables/useLandingLocale';
import type { JourneyCopy } from './journeyCopy';

defineProps<{ journey: JourneyCopy; locale: LandingLocale }>();
const icons: Record<string, DesignIconName> = {
  mcp: 'structured-data',
  api: 'database',
  timezone: 'browser-login',
  units: 'settings',
  time: 'auto-sync',
  year: 'document',
  range: 'overview',
  events: 'manual-entry',
};
</script>

<template>
  <section id="connect" class="lp-section settings-board" aria-labelledby="settings-title">
    <h2 id="settings-title" class="lp-h2" data-reveal>{{ journey.settingsTitle }}</h2>
    <p class="lp-lead" data-reveal>{{ journey.settingsLead }}</p>
    <LiveFrame class="settings-media" route="/settings" :locale="locale" :title="journey.settingsTitle" />
    <ul class="settings-grid">
      <li v-for="item in journey.settings" :id="'set-' + item.id" :key="item.id" data-reveal>
        <GlyphTile :name="icons[item.id]" :size="32" />
        <div><h3>{{ item.title }}</h3><p>{{ item.text }}</p></div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.settings-board { padding-top: 96px; }
.settings-media { margin-top: 36px; }
.settings-grid { list-style: none; margin: 28px 0 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 22px 32px; }
.settings-grid li { display: grid; grid-template-columns: auto 1fr; gap: 12px; align-items: start; min-width: 0; }
.settings-grid h3 { margin: 0 0 4px; font-size: 16px; font-weight: 600; }
.settings-grid p { margin: 0; color: var(--muted); line-height: 1.55; font-size: 14px; }
@media (min-width: 1100px) { .settings-grid { grid-template-columns: 1fr 1fr 1fr 1fr; } }
@media (max-width: 640px) { .settings-grid { grid-template-columns: 1fr; } .settings-board { padding-top: 72px; } }
</style>
