<script setup lang="ts">
import { computed, ref } from 'vue';
import MotionReel from './MotionReel.vue';
import { REEL_IDS } from './reel';
import type { LandingLocale } from '../../composables/useLandingLocale';
import type { JourneyCopy } from './journeyCopy';

const props = defineProps<{ journey: JourneyCopy; locale: LandingLocale }>();
const active = ref<string>('glass');
const stories = computed(() => REEL_IDS.map(id => props.journey.motions.find(item => item.id === id)!).filter(Boolean));
const current = computed(() => props.journey.motions.find((item) => item.id === active.value) ?? props.journey.motions[0]);
const advance = () => { active.value = stories.value[(stories.value.findIndex(item => item.id === active.value) + 1) % stories.value.length]!.id; };
const key = (event: KeyboardEvent) => {
  const index = stories.value.findIndex(item => item.id === active.value);
  const last = stories.value.length - 1;
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? last : ['ArrowRight', 'ArrowDown'].includes(event.key) ? (index + 1) % (last + 1) : ['ArrowLeft', 'ArrowUp'].includes(event.key) ? (index + last) % (last + 1) : null;
  if (next === null) return;
  event.preventDefault(); active.value = stories.value[next]!.id;
  document.getElementById('motion-' + active.value)?.focus({ preventScroll: true });
};
</script>

<template>
  <section id="motion" class="lp-section motion-stage" aria-labelledby="motion-title">
    <h2 id="motion-title" class="lp-h2" data-reveal>{{ journey.motionTitle }}</h2>
    <p class="lp-lead" data-reveal>{{ journey.motionLead }}</p>
    <div class="motion-layout" data-reveal>
      <div class="motion-list" role="tablist" :aria-label="journey.motionTitle">
        <button
          v-for="(item, index) in stories"
          :id="'motion-' + item.id"
          :key="item.id"
          class="motion-step"
          type="button"
          role="tab"
          :aria-selected="active === item.id"
          :tabindex="active === item.id ? 0 : -1"
          aria-controls="motion-player"
          @click="active = item.id"
          @keydown="key"
        >
          <strong><small>{{ String(index + 1).padStart(2, '0') }}</small>{{ item.title }}</strong>
          <span>{{ item.text }}</span>
        </button>
      </div>
      <div id="motion-player" class="motion-frame" role="tabpanel" :aria-labelledby="'motion-' + active">
        <MotionReel v-if="current" :id="current.id" :locale="locale" :title="current.title" auto-advance @complete="advance" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.motion-stage { padding-top: 72px; }
.motion-layout { display: grid; grid-template-columns: minmax(240px, 340px) minmax(0, 1fr); gap: 28px; align-items: start; margin-top: 36px; }
.motion-list { display: grid; gap: 8px; }
.motion-step { display: grid; gap: 4px; width: 100%; padding: 14px 16px; border: 0; border-radius: 14px; background: transparent; color: var(--muted); text-align: left; cursor: pointer; font: inherit; }
.motion-step strong { color: var(--ink); font-size: 16px; font-weight: 600; }
.motion-step strong small { display: inline-block; width: 32px; font-size: 11px; font-weight: 400; color: var(--subtle); }
.motion-step { transition: background 240ms ease, color 240ms ease, transform 300ms var(--lp-ease); }
.motion-step:hover { background: color-mix(in srgb, var(--surface) 60%, transparent); }
.motion-step:active { transform: scale(.98); }
.motion-step span { font-size: 14px; line-height: 1.55; }
.motion-step[aria-selected='true'] { background: var(--surface); color: var(--ink); }
.motion-frame { position: sticky; top: 80px; min-width: 0; }
@media (max-width: 860px) {
  .motion-layout { grid-template-columns: 1fr; }
  .motion-list { grid-auto-flow: column; grid-auto-columns: minmax(220px, 70%); overflow-x: auto; padding-bottom: 8px; }
  .motion-frame { position: static; }
}
</style>
