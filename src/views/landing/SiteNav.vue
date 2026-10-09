<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import BrandMark from '../../components/BrandMark.vue';
import Icon, { type IconName } from '../../components/Icon.vue';
import GlassRim from '../../components/shell/GlassRim.vue';
import SegmentTrack from '../../components/SegmentTrack.vue';
import CapsuleWheel from '../../components/CapsuleWheel.vue';
import { landingThemeMode, pickLandingTheme } from './theme';
import { LANDING_LOCALES, LOCALE_LABELS, ensureLandingCopy, type LandingLocale } from '../../composables/useLandingLocale';
import { locale as appLocale, setLocale } from '../../i18n';
import { shownLocale } from '../../lib/motion/localeTarget';
import type { ThemeMode } from '../../composables/useTheme';
import type { LandingCopy } from './types';
import type { JourneyCopy } from './journeyCopy';
export type NavTarget = 'features' | 'try-app' | 'docs' | 'download';
const props = defineProps<{ copy: LandingCopy; journey: JourneyCopy; locale: LandingLocale; active: NavTarget }>();
const emit = defineEmits<{ locale: [value: LandingLocale]; go: [target: NavTarget | 'top'] }>();
const menu = ref(false), wheel = ref<{ $el: HTMLElement }>(), track = ref<{ $el: HTMLElement }>();
const items = computed(() => (['features', 'try-app', 'docs', 'download'] as const).map((value, i) => ({ value, label: props.journey.nav[i] })));
const themes = computed(() => [
  { value: 'dark', label: props.copy.nav.toDark, icon: 'moon' as IconName },
  { value: 'light', label: props.copy.nav.toLight, icon: 'sun' as IconName },
  { value: 'system', label: props.journey.system, icon: 'monitor' as IconName },
]);
const languages = LANDING_LOCALES.map(value => ({ value, label: LOCALE_LABELS[value] }));
const go = (value: string | number) => { menu.value = false; emit('go', String(value) as NavTarget); };
const theme = (value: string | number) => {
  const index = themes.value.findIndex(t => t.value === value), box = track.value?.$el.querySelectorAll('.segment-item')[index]?.getBoundingClientRect();
  pickLandingTheme(value as ThemeMode, box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : undefined);
};
const language = async (value: string | number) => {
  await ensureLandingCopy(value as LandingLocale);
  const box = wheel.value?.$el.getBoundingClientRect();
  const { switchLocaleWithAsh } = await import('../../lib/motion/ashSwitch');
  await switchLocaleWithAsh(value as LandingLocale, box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : undefined);
};
onMounted(() => setLocale(props.locale));
watch(() => props.locale, value => { if (appLocale.value !== value) setLocale(value); });
watch(appLocale, value => { if (value !== props.locale) emit('locale', value); }, { flush: 'sync' });
</script>
<template>
  <header class="lp-nav" @keydown.esc="menu = false">
    <div class="lp-nav-bar">
      <a class="lp-brand" href="#top" :aria-label="copy.nav.home" @click.prevent="emit('go', 'top')"><BrandMark :size="38" /><strong>ZeppBridge</strong></a>
      <SegmentTrack class="lp-links" variant="glass" :items="items" :model-value="active" :aria-label="copy.nav.site" @update:model-value="go" @reselect="go" />
      <div class="lp-nav-actions glass-control is-lens-host has-rim">
        <GlassRim />
        <SegmentTrack ref="track" class="theme-toggle" variant="bare" icon-only :items="themes" :model-value="landingThemeMode" :aria-label="journey.system" @update:model-value="theme" @reselect="theme" />
        <span class="nav-divider" aria-hidden="true"></span>
        <CapsuleWheel ref="wheel" class="locale-wheel" variant="bare" loop :span="144" :fit-peek="12" :items="languages" :model-value="shownLocale" :aria-label="copy.nav.language" @update:model-value="language" />
        <button class="lp-icon-btn mobile-toggle" type="button" :aria-label="copy.nav.site" :aria-expanded="menu" aria-controls="mobile-nav" @click="menu = !menu"><Icon :name="menu ? 'x' : 'dots'" /></button>
      </div>
    </div>
    <nav v-if="menu" id="mobile-nav" class="lp-mobile-links glass-control is-lens-host has-rim" :aria-label="copy.nav.site"><GlassRim /><a v-for="item in items" :key="item.value" :href="'#' + item.value" @click.prevent="go(item.value)">{{ item.label }}<Icon name="arrow-right" /></a></nav>
  </header>
</template>
