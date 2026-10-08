<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import SegmentTrack from '../../components/SegmentTrack.vue';
import HandoffOverlay from './HandoffOverlay.vue';
import LandingIcon from './LandingIcon.vue';
import StageWindow from './StageWindow.vue';
import { scrollToSection } from './motion';
import type { LandingLocale } from '../../composables/useLandingLocale';
import type { LandingCopy } from './types';
const SCENES = [
  { key: 'sync', route: '/', scrollTo: null },
  { key: 'missing', route: '/heart', scrollTo: null },
  { key: 'handoff', route: '/ai', scrollTo: null },
  { key: 'plan', route: '/ai/plan', scrollTo: null },
  { key: 'settings', route: '/settings', scrollTo: null },
] as const;
const props = defineProps<{ copy: LandingCopy; locale: LandingLocale; primary: { label: string; hint: string; href: string }; githubHref: string }>();
const active = ref(0);
const chatOpen = ref(false);
const stage = ref<InstanceType<typeof StageWindow> | null>(null);
const scene = computed(() => SCENES[active.value] ?? SCENES[0]);
const items = computed(() => props.copy.explore.tabs.map((label, value) => ({ value, label })));
const select = (index: number, updateHash = true) => {
  if (index < 0 || index >= SCENES.length) return;
  chatOpen.value = false;
  void stage.value?.release(false);
  active.value = index;
  if (updateHash) history.replaceState(null, '', `#demo-${SCENES[index]!.key}`);
};
const readHash = () => { const index = SCENES.findIndex((item) => `#demo-${item.key}` === location.hash); if (index >= 0) select(index, false); };
const closeChat = () => { chatOpen.value = false; void stage.value?.release(); };
onMounted(() => { readHash(); window.addEventListener('hashchange', readHash); });
onBeforeUnmount(() => window.removeEventListener('hashchange', readHash));
</script>

<template>
  <section class="story-shell">
    <div class="hero lp-wrap">
      <div class="hero-title"><p class="eyebrow"><span aria-hidden="true"></span>{{ copy.hero.eyebrow }}</p><h1>{{ copy.hero.titleLead }}<br><span class="lp-mark">{{ copy.hero.titleAccent }}</span></h1></div>
      <div class="hero-summary">
        <p class="lead">{{ copy.hero.lead }}</p>
        <div class="cta">
          <a class="lp-btn lp-btn-primary" :href="primary.href" rel="noopener"><LandingIcon name="download" :size="19" /><span>{{ primary.label }}<small>{{ primary.hint }}</small></span></a>
          <a class="lp-btn lp-btn-ghost" href="#story" @click.prevent="scrollToSection('story')"><LandingIcon name="arrow-right" :size="18" /><span>{{ copy.hero.demo }}</span></a>
        </div>
        <p class="meta">{{ copy.hero.meta }}</p>
        <a class="source-link" :href="githubHref" target="_blank" rel="noopener">{{ copy.hero.github }} <span aria-hidden="true">↗</span></a>
      </div>
    </div>
    <div id="story" class="explore lp-wrap" tabindex="-1" aria-labelledby="explore-title">
      <div class="explore-head"><div><p class="lp-kicker">{{ copy.explore.kicker }}</p><h2 id="explore-title">{{ copy.explore.title }}</h2></div><p>{{ copy.explore.lead }}</p></div>
      <div class="explore-selector"><SegmentTrack :items="items" :model-value="active" :aria-label="copy.explore.title" variant="inset" @update:model-value="select(Number($event))" @reselect="select(Number($event))" /><span class="chapter-count" aria-hidden="true">{{ String(active + 1).padStart(2, '0') }} / 05</span></div>
      <div class="explore-body">
        <div class="chapter-copy" aria-live="polite" aria-atomic="true">
          <article v-for="(beat, index) in copy.beats" v-show="active === index" :key="index" :id="`demo-${SCENES[index]!.key}`" :aria-hidden="active !== index"><p class="chapter-kicker">{{ beat.kicker }}</p><h3>{{ beat.title }}</h3><p class="chapter-text">{{ beat.body }}</p></article>
          <div class="edition"><span class="lp-sample">{{ copy.sample }}</span><p>{{ copy.hero.edition }}</p></div>
        </div>
        <div class="stage"><StageWindow ref="stage" :route="scene.route" :scroll-to="scene.scrollTo" :locale="locale" :copy="copy.hero.stage" :sample="copy.sample" :suspended="chatOpen" @handoff="chatOpen = true" /></div>
      </div>
    </div>
    <HandoffOverlay :open="chatOpen" :copy="copy.handoff" :sample="copy.sample" @close="closeChat" />
  </section>
</template>

<style scoped>
.story-shell { padding-top: 128px; }
.hero { display: grid; grid-template-columns: 1.04fr 1fr; gap: clamp(38px, 6vw, 100px); align-items: start; padding: 18px 0 56px; }
.hero-title, .hero-summary { min-width: 0; }
.eyebrow { display: flex; align-items: center; gap: 10px; margin: 0 0 26px; color: var(--lp-muted); font-size: 12px; letter-spacing: .06em; line-height: 1.6; }
.eyebrow > span { flex: 0 0 6px; height: 6px; border-radius: 50%; background: var(--lp-green); }
h1 { margin: 0; font-size: clamp(38px, 4.4vw, 64px); line-height: 1.16; font-weight: 690; letter-spacing: -.045em; text-wrap: balance; }
.lead { margin: 0; max-width: 36em; color: var(--lp-muted); font-size: clamp(16px, 1.35vw, 19px); line-height: 1.75; text-wrap: pretty; }
.cta { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 25px; }
.meta { margin: 16px 0 0; color: var(--lp-subtle); font-size: 12px; line-height: 1.7; }
.source-link { display: inline-flex; align-items: center; gap: 7px; margin-top: 12px; color: var(--lp-muted); font-size: 12.5px; text-decoration-thickness: 1px; text-underline-offset: 4px; }
.explore { border-top: 1px solid var(--lp-line-2); padding-top: 28px; }
.explore-head { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; align-items: end; margin-bottom: 26px; }
.explore-head .lp-kicker { margin-bottom: 10px; }
.explore-head h2 { margin: 0; font-size: clamp(23px, 2.5vw, 34px); font-weight: 650; line-height: 1.25; letter-spacing: -.025em; }
.explore-head > p { margin: 0; max-width: 36em; justify-self: end; color: var(--lp-muted); font-size: 14px; line-height: 1.7; }
.explore-selector { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 24px; }
.explore-selector :deep(.segment-track) { max-width: 100%; --seg-font: 14px; }
.chapter-count { flex: 0 0 auto; color: var(--lp-subtle); font-family: var(--font-mono); font-size: 11px; letter-spacing: .12em; }
.explore-body { display: grid; grid-template-columns: minmax(0, .32fr) minmax(0, .68fr); gap: clamp(24px, 3.5vw, 54px); align-items: start; }
.chapter-copy { padding-top: 26px; min-width: 0; }
.chapter-kicker { margin: 0 0 18px; color: var(--lp-green); font-family: var(--font-mono); font-size: 12px; letter-spacing: .08em; }
.chapter-copy h3 { margin: 0; font-size: clamp(24px, 2.4vw, 34px); line-height: 1.32; letter-spacing: -.035em; font-weight: 650; text-wrap: balance; }
.chapter-text { margin: 18px 0 0; color: var(--lp-muted); font-size: 15px; line-height: 1.85; }
.edition { margin-top: 30px; padding-top: 20px; border-top: 1px solid var(--lp-line); }
.edition p { margin: 10px 0 0; color: var(--lp-subtle); font-size: 12px; line-height: 1.7; }
.stage { min-width: 0; }
@media (max-width: 980px) { .story-shell { padding-top: 118px; } .hero { gap: 32px; padding-bottom: 44px; } h1 { font-size: clamp(34px, 4.7vw, 46px); } .cta .lp-btn { padding: 12px 18px; font-size: 14px; } .explore-body { grid-template-columns: minmax(0, .36fr) minmax(0, .64fr); gap: 24px; } .chapter-copy { padding-top: 8px; } .chapter-copy h3 { font-size: 25px; } }
@media (max-width: 720px) {
  .story-shell { padding-top: 98px; }
  .hero { grid-template-columns: 1fr; gap: 24px; padding: 12px 0 36px; }
  h1 { font-size: clamp(34px, 8.4vw, 48px); line-height: 1.2; }
  .eyebrow { margin-bottom: 19px; font-size: 11px; }
  .lead { font-size: 16px; }
  .cta { margin-top: 23px; gap: 10px; }
  .cta .lp-btn { padding: 12px 18px; }
  .explore { padding-top: 24px; }
  .explore-head { grid-template-columns: 1fr; gap: 12px; margin-bottom: 22px; }
  .explore-head > p { justify-self: start; font-size: 13px; }
  .explore-selector { align-items: start; }
  .chapter-count { display: none; }
  .explore-body { display: flex; flex-direction: column; gap: 24px; }
  .chapter-copy { width: 100%; padding-top: 0; }
  .chapter-kicker { margin-bottom: 10px; }
  .chapter-copy h3 { max-width: 22em; font-size: 25px; }
  .chapter-text { margin-top: 13px; font-size: 14px; line-height: 1.8; }
  .edition { margin-top: 18px; padding-top: 14px; display: flex; align-items: start; gap: 10px; }
  .edition .lp-sample { flex-shrink: 0; }
  .edition p { margin: 1px 0 0; }
  .stage { width: 100%; }
}
</style>
