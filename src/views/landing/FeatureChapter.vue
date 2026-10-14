<script setup lang="ts">
import { computed, ref } from 'vue';
import MotionReel from './MotionReel.vue';
import type { FeatureChapterCopy } from './p4Copy';
import type { LandingLocale } from '../../composables/useLandingLocale';

const props = defineProps<{ chapter: FeatureChapterCopy; index: number; locale: LandingLocale }>();
const selected = ref(0);
const current = computed(() => props.chapter.points[selected.value]!);
const advance = () => { selected.value = (selected.value + 1) % props.chapter.points.length; };
const select = (index: number) => { selected.value = index; };
const key = (event: KeyboardEvent, index: number) => {
  const count = props.chapter.points.length;
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : ['ArrowDown', 'ArrowRight'].includes(event.key) ? (index + 1) % count : ['ArrowUp', 'ArrowLeft'].includes(event.key) ? (index + count - 1) % count : null;
  if (next === null) return;
  event.preventDefault(); select(next);
  document.getElementById(`${props.chapter.id}-point-${next}`)?.focus({ preventScroll: true });
};
</script>

<template>
  <section :id="chapter.id" class="lp-section feature-chapter" :aria-labelledby="chapter.id + '-title'">
    <div class="chapter-copy">
      <p class="chapter-name"><span>{{ String(index + 1).padStart(2, '0') }}</span>{{ chapter.name }}</p>
      <h2 :id="chapter.id + '-title'">{{ chapter.title }}</h2>
      <p class="chapter-lead">{{ chapter.lead }}</p>
      <div class="chapter-points" role="tablist" :aria-label="chapter.name">
        <button v-for="(point, i) in chapter.points" :id="`${chapter.id}-point-${i}`" :key="point.id" type="button" role="tab"
          :aria-selected="selected === i" :tabindex="selected === i ? 0 : -1" :aria-controls="chapter.id + '-stage'"
          @click="select(i)" @keydown="key($event, i)">
          <span class="point-marker" aria-hidden="true"></span><span><strong>{{ point.title }}</strong><small>{{ point.text }}</small></span>
        </button>
      </div>
    </div>
    <div :id="chapter.id + '-stage'" class="chapter-stage" role="tabpanel" :aria-labelledby="`${chapter.id}-point-${selected}`">
      <MotionReel :key="current.id" :id="current.scene" :locale="locale" :title="current.title" auto-advance @complete="advance" />
    </div>
    <slot />
  </section>
</template>

<style scoped>
.feature-chapter { display: grid; grid-template-columns: minmax(290px, .72fr) minmax(0, 1.8fr); align-items: center; gap: 32px 48px; padding-top: 108px; padding-bottom: 20px; }
.chapter-copy { min-width: 0; }
.chapter-name { display: flex; gap: 12px; align-items: center; margin: 0 0 22px; font-size: 14px; color: var(--muted); }
.chapter-name span { font-size: 12px; color: var(--accent); font-variant-numeric: tabular-nums; }
h2 { margin: 0; font-size: clamp(32px, 3.1vw, 48px); line-height: 1.22; letter-spacing: -.035em; font-weight: 650; text-wrap: balance; }
.chapter-lead { margin: 22px 0 24px; color: var(--muted); font-size: 16px; line-height: 1.8; }
.chapter-points { display: grid; gap: 4px; }
.chapter-points button { display: flex; align-items: start; gap: 12px; width: 100%; padding: 12px 14px 12px 0; border: 0; border-radius: 12px; background: transparent; color: var(--muted); text-align: left; cursor: pointer; transition: background 180ms, color 180ms; }
.chapter-points button[aria-selected='true'] { background: var(--surface); color: var(--ink); }
.chapter-points button:hover { color: var(--ink); }
.point-marker { width: 3px; height: 22px; border-radius: 999px; margin-top: 1px; flex-shrink: 0; background: transparent; }
[aria-selected='true'] .point-marker { background: var(--accent); }
strong { display: block; font-size: 16px; line-height: 1.5; font-weight: 600; }
small { display: block; margin-top: 4px; color: var(--muted); font-size: 13px; line-height: 1.65; }
.chapter-stage { min-width: 0; position: relative; align-self: center; }
@media (min-width:1800px) { .feature-chapter { width: min(1680px, calc(100% - 160px)); gap: 64px; } }
@media (max-width:1000px) { .feature-chapter { grid-template-columns: 1fr; padding-top: 72px; gap: 24px; } .chapter-stage { position: static; } .chapter-points { grid-template-columns: 1fr 1fr; gap: 8px; } .chapter-lead { max-width: 42em; } }
@media (max-width:540px) { .chapter-points { grid-template-columns: 1fr; } }
</style>
