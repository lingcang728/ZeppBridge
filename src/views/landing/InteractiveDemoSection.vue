<script setup lang="ts">
import { ref } from 'vue';
import StageWindow from './StageWindow.vue';
import Icon from '../../components/Icon.vue';
import GlassRim from '../../components/shell/GlassRim.vue';
import SegmentTrack from '../../components/SegmentTrack.vue';
import { FEATURE_SCENES } from './featureScenes';
import type { LandingLocale } from '../../composables/useLandingLocale';
import type { LandingCopy } from './types';
import type { JourneyCopy } from './journeyCopy';
defineProps<{ copy: LandingCopy; journey: JourneyCopy; locale: LandingLocale }>();
const route = ref('/'), current = ref('/'), expanded = ref(false), stage = ref<InstanceType<typeof StageWindow>>();
const navigate = (value: string | number) => { route.value = String(value); stage.value?.activate(); };
</script>
<template>
  <section id="try-app" class="lp-section interactive-demo" aria-labelledby="demo-title">
    <div class="demo-heading"><h2 id="demo-title" class="lp-h2">{{ journey.demo[0] }}</h2><p class="lp-lead">{{ journey.demo[1] }}</p></div>
    <div class="demo-toolbar">
      <SegmentTrack class="demo-shortcuts" variant="glass" :items="FEATURE_SCENES.map((s, i) => ({ value: s.route, label: copy.rebuild.stories[[0,1,3,4,5][i]]?.eyebrow ?? s.id, icon: s.icon }))" :model-value="current" :aria-label="journey.nav[1]" @update:model-value="navigate" @reselect="navigate" />
      <button class="reset-demo glass-control is-lens-host has-rim" type="button" @click="stage?.reset()"><GlassRim /><Icon name="refresh" :size="17" /><span>{{ journey.demo[3] }}</span></button>
    </div>
    <StageWindow ref="stage" :route="route" :locale="locale" :copy="copy.hero.stage" :retry-label="copy.rebuild.retry" :active-label="journey.demo[2]" :expanded="expanded" @expand="expanded = true" @route="current = $event" />
  </section>
</template>
<style scoped>
.interactive-demo { padding-top: 100px; }
.demo-heading { max-width: 780px; margin-bottom: 38px; }
.demo-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-bottom: 22px; }
.reset-demo { display: flex; align-items: center; gap: 9px; min-height: 42px; padding: 10px 16px; border-radius: 999px; color: var(--ink); cursor: pointer; font: inherit; font-size: 14px; white-space: nowrap; }
.demo-shortcuts { min-width: 0; max-width: 100%; }
@media(max-width:800px) { .demo-toolbar { flex-wrap: wrap; } .demo-shortcuts { overflow-x: auto; } .interactive-demo { padding-top: 64px; } .reset-demo { margin-left: auto; } }
</style>
