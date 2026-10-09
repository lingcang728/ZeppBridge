<script setup lang="ts">
import { ref } from 'vue';
import StageWindow from './StageWindow.vue';
import Icon from '../../components/Icon.vue';
import type { LandingLocale } from '../../composables/useLandingLocale';
import type { LandingCopy } from './types';
import type { JourneyCopy } from './journeyCopy';

defineProps<{ copy: LandingCopy; journey: JourneyCopy; locale: LandingLocale }>();
const emit = defineEmits<{ back: [] }>();
const route = ref('/');
const expanded = ref(false);
const stage = ref<InstanceType<typeof StageWindow>>();
</script>

<template>
  <section id="try-app" class="lp-section interactive-demo" aria-labelledby="demo-title">
    <div class="demo-heading" data-reveal><h2 id="demo-title" class="lp-h2">{{ journey.demoTitle }}</h2><p class="lp-lead">{{ journey.demoLead }}</p></div>
    <div class="demo-toolbar">
      <button class="demo-back" type="button" @click="emit('back')"><Icon name="arrow-left" :size="16" />{{ journey.back }}</button>
      <button class="reset-demo" type="button" @click="stage?.reset()">{{ journey.demoReset }}</button>
    </div>
    <StageWindow ref="stage" :route="route" :locale="locale" :copy="copy.hero.stage" :retry-label="copy.rebuild.retry" :active-label="journey.demoStart" :expanded="expanded" @expand="expanded = true" />
  </section>
</template>

<style scoped>
.interactive-demo { padding-top: 88px; }
.demo-back { display: inline-flex; align-items: center; gap: 8px; min-height: 40px; padding: 8px 12px; border: 0; border-radius: 999px; background: transparent; color: var(--ink); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }
.demo-back:hover { background: var(--surface); }
.demo-heading { max-width: 40em; margin-bottom: 28px; }
.demo-toolbar { position: sticky; top: 8px; z-index: 4; display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 14px; padding: 6px; border: 1px solid var(--line); border-radius: 999px; min-width: 0; background: color-mix(in srgb, var(--bg) 82%, transparent); backdrop-filter: blur(20px); }
.reset-demo { flex: 0 0 auto; min-height: 40px; padding: 8px 14px; border: 1px solid var(--line); border-radius: 999px; background: transparent; color: var(--ink); font: inherit; font-size: 14px; cursor: pointer; }
@media (max-width: 800px) { .interactive-demo { padding-top: 56px; } .demo-toolbar { flex-wrap: wrap; } .reset-demo { margin-left: auto; } }
</style>
