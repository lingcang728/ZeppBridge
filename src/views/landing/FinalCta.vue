<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import Icon from '../../components/Icon.vue';
import SegmentTrack from '../../components/SegmentTrack.vue';
import { GITHUB_URL, isMobileVisitor } from './useDownloads';
import type { LandingCopy } from './types';
import type { JourneyCopy } from './journeyCopy';
const props = defineProps<{ copy: LandingCopy; journey: JourneyCopy; windows: { label: string; hint: string; href: string }; macos: { label: string; hint: string; href: string }; linux: Array<{label: string; url: string}>; available: boolean }>();
const platform = ref('windows');
onMounted(() => { if (!isMobileVisitor()) { if (/Mac/i.test(navigator.platform)) platform.value = 'macos'; else if (/Linux/i.test(navigator.platform)) platform.value = 'linux'; } });
const selected = computed(() => platform.value === 'macos' ? props.macos : props.windows);
const items = [{ value: 'windows', label: 'Windows' }, { value: 'macos', label: 'macOS' }, { value: 'linux', label: 'Linux' }];
</script>
<template>
  <section id="download" class="lp-section final" aria-labelledby="download-title">
    <h2 id="download-title" data-reveal>{{ journey.downloadTitle }}</h2>
    <p class="lp-lead" data-reveal>{{ journey.downloadLead }}</p>
    <p class="install-line">{{ journey.install }}</p>
    <div class="platform-switch"><SegmentTrack v-model="platform" variant="glass" :items="items" :aria-label="journey.nav.download" /></div>
    <div class="download-actions">
      <template v-if="available && platform === 'linux' && linux.length"><a v-for="item in linux" :key="item.label" class="lp-btn lp-btn-primary download-button" :href="item.url"><Icon name="export" :size="22" />{{ item.label }}</a></template>
      <a v-else-if="available && platform !== 'linux'" class="lp-btn lp-btn-primary download-button" :href="selected.href"><Icon name="export" :size="22" />{{ selected.label }}</a>
      <button v-else class="lp-btn download-button unavailable-download" type="button" disabled><Icon name="export" :size="22" />{{ journey.downloadPending }}</button>
      <a class="star-button lp-btn" :href="GITHUB_URL" target="_blank" rel="noopener noreferrer"><Icon name="star" :size="20" /><span>Star on GitHub</span><Icon name="external" :size="16" /></a>
    </div>
  </section>
</template>
<style scoped>
.final { padding-top: 120px; padding-bottom: 120px; text-align: center; }
h2 { margin: 0 auto; max-width: 16em; font-size: clamp(36px, 4.4vw, 64px); line-height: 1.14; letter-spacing: -.04em; font-weight: 600; text-wrap: balance; }
.final .lp-lead { margin: 18px auto 0; }
.install-line { margin: 10px auto 0; max-width: 36em; color: var(--subtle); font-size: 15px; line-height: 1.6; }
.platform-switch { display: flex; justify-content: center; gap: 8px; width: max-content; max-width: 100%; margin: 28px auto 22px; }
.download-actions { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 18px; }
.download-button { min-height: 62px; padding: 18px 28px; font-size: 17px; border-radius: 999px; }
.download-button:hover svg { animation: download-bounce .65s ease; }
.unavailable-download { color: var(--muted); background: var(--surface); cursor: default; }
.star-button { display: inline-flex; align-items: center; gap: 12px; min-height: 62px; padding: 18px 26px; border-radius: 999px; text-decoration: none; font-size: 17px; transition: transform .35s cubic-bezier(.16,1,.3,1); }
.star-button:hover { transform: translateY(-4px); } .star-button:hover svg:first-of-type { animation: star-turn .75s cubic-bezier(.16,1,.3,1); color: var(--accent); }
.star-button:active { transform: scale(.97); }
@keyframes star-turn { 0% { transform: rotate(-25deg) scale(.8); } 55% { transform: rotate(24deg) scale(1.25); } }
@keyframes download-bounce { 40% { transform: translateY(4px); } 70% { transform: translateY(-3px); } }
@media(max-width:720px) { .final { padding-top: 90px; padding-bottom: 90px; } .download-actions { flex-direction: column; } .download-button { font-size: 15px; } }
</style>
