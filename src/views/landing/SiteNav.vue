<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import BrandMark from '../../components/BrandMark.vue';
import Icon from '../../components/Icon.vue';
import SegmentTrack from '../../components/SegmentTrack.vue';
import CapsuleWheel from '../../components/CapsuleWheel.vue';
import { landingThemeMode, pickLandingTheme } from './theme';
import { LANDING_LOCALES, LOCALE_LABELS, ensureLandingCopy, type LandingLocale } from '../../composables/useLandingLocale';
import { locale as appLocale, setLocale } from '../../i18n';
import type { ThemeMode } from '../../composables/useTheme';
import type { LandingCopy } from './types';
import type { JourneyCopy } from './journeyCopy';

export type NavTarget = 'motion' | 'records' | 'ai' | 'connect' | 'try-app' | 'download';

const props = defineProps<{ copy: LandingCopy; journey: JourneyCopy; locale: LandingLocale; active: NavTarget | ''; away: boolean }>();
const emit = defineEmits<{ locale: [value: LandingLocale]; go: [target: string] }>();
const product = ref(false);
const menu = ref(false);
const languages = ref(false);
const root = ref<HTMLElement | null>(null);
const themeTrack = ref<{ $el: HTMLElement }>();
const localeWheel = ref<{ $el: HTMLElement }>();
const localeOptions = LANDING_LOCALES.map(value => ({ value, label: LOCALE_LABELS[value] }));
const highlight = ref({ x: 0, width: 0 });
const light = (event: Event) => {
  const item = event.currentTarget as HTMLElement;
  const nav = item.closest('nav')!.getBoundingClientRect();
  const box = item.getBoundingClientRect();
  highlight.value = { x: box.left - nav.left, width: box.width };
};

const columns = computed(() => [
  {
    label: props.journey.groups.records,
    links: [
      { id: 'record-overview', label: props.journey.links.overview },
      { id: 'record-sleep', label: props.journey.links.sleep },
      { id: 'record-workouts', label: props.journey.links.workouts },
    ],
  },
  {
    label: props.journey.groups.ai,
    links: [
      { id: 'ai', label: props.journey.links.ask },
      { id: 'ai-plan', label: props.journey.links.plan },
      { id: 'ai-arrange', label: props.journey.links.arrange },
    ],
  },
  {
    label: props.journey.groups.connect,
    links: [
      { id: 'set-mcp', label: props.journey.links.mcp },
      { id: 'set-api', label: props.journey.links.api },
      { id: 'connect', label: props.journey.links.settings },
    ],
  },
]);
const themes = computed(() => [
  { value: 'dark' as ThemeMode, label: props.journey.themes[0], icon: 'moon' as const },
  { value: 'light' as ThemeMode, label: props.journey.themes[1], icon: 'sun' as const },
  { value: 'system' as ThemeMode, label: props.journey.themes[2], icon: 'monitor' as const },
]);
const productOn = computed(() => props.active === 'records' || props.active === 'ai' || props.active === 'connect');

const go = (id: string) => { product.value = false; menu.value = false; languages.value = false; emit('go', id); };
const theme = (value: string | number) => {
  const box = themeTrack.value?.$el.getBoundingClientRect();
  pickLandingTheme(value as ThemeMode, box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : undefined);
};
const language = async (value: string | number) => {
  await ensureLandingCopy(value as LandingLocale);
  const box = localeWheel.value?.$el.getBoundingClientRect();
  const { switchLocaleWithAsh } = await import('../../lib/motion/ashSwitch');
  await switchLocaleWithAsh(value as LandingLocale, box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : undefined);
  languages.value = false;
};
const outside = (event: MouseEvent) => {
  if (!root.value?.contains(event.target as Node)) { product.value = false; languages.value = false; }
};

onMounted(() => { setLocale(props.locale); document.addEventListener('pointerdown', outside); });
onBeforeUnmount(() => document.removeEventListener('pointerdown', outside));
watch(() => props.locale, (value) => { if (appLocale.value !== value) setLocale(value); });
watch(appLocale, (value) => { if (value !== props.locale) emit('locale', value); }, { flush: 'sync' });
watch(() => props.away, (away) => { if (away) { product.value = false; menu.value = false; languages.value = false; } });
</script>

<template>
  <header ref="root" :class="['lp-nav', { 'is-away': away }]" :inert="away || undefined" :aria-hidden="away ? 'true' : undefined" @keydown.esc="product = false; menu = false; languages = false">
    <div class="lp-nav-bar">
      <a class="lp-brand" href="#top" :aria-label="copy.nav.home" @click.prevent="go('top')"><BrandMark :size="28" /><strong>ZeppBridge</strong></a>
      <nav class="lp-links" :aria-label="copy.nav.site" @pointerleave="highlight.width = 0" @focusout="highlight.width = 0">
        <i class="nav-light" aria-hidden="true" :style="{ opacity: highlight.width ? 1 : 0, transform: `translateX(${highlight.x}px) scaleX(${highlight.width / 100})` }"></i>
        <div class="lp-menu">
          <button class="product-toggle" type="button" :aria-expanded="product" aria-controls="product-menu" :aria-current="productOn ? 'true' : undefined" @pointerenter="light" @focus="light" @click="product = !product">{{ journey.nav.product }}<Icon name="chevron-down" :size="12" :class="{ turned: product }" /></button>
          <Transition name="nav-panel">
          <div v-if="product" id="product-menu" class="lp-mega">
            <div v-for="column in columns" :key="column.label">
              <p>{{ column.label }}</p>
              <a v-for="link in column.links" :key="link.id" :href="'#' + link.id" @click.prevent="go(link.id)">{{ link.label }}</a>
            </div>
          </div>
          </Transition>
        </div>
        <a class="lp-link" href="#motion" :aria-current="active === 'motion' ? 'true' : undefined" @pointerenter="light" @focus="light" @click.prevent="go('motion')">{{ journey.nav.motion }}</a>
        <a class="lp-link" href="#try-app" :aria-current="active === 'try-app' ? 'true' : undefined" @pointerenter="light" @focus="light" @click.prevent="go('try-app')">{{ journey.nav.try }}</a>
      </nav>
      <div class="lp-nav-actions">
        <div class="site-preferences">
          <SegmentTrack ref="themeTrack" class="site-theme" variant="bare" icon-only :items="themes" :model-value="landingThemeMode" :aria-label="journey.system" @update:model-value="theme" />
          <span class="preference-divider" aria-hidden="true"></span>
          <CapsuleWheel ref="localeWheel" class="site-locale" variant="bare" plain loop :span="128" :items="localeOptions" :model-value="locale" :aria-label="copy.nav.language" @update:model-value="language" />
        </div>
        <a class="lp-btn lp-btn-primary nav-download" href="#download" @click.prevent="go('download')"><Icon class="nav-download-icon" name="export" :size="16" /><span class="nav-download-label">{{ journey.nav.download }}</span></a>
        <button class="lp-icon-btn mobile-toggle" type="button" :aria-label="journey.nav.menu" :aria-expanded="menu" aria-controls="mobile-nav" @click="menu = !menu"><Icon :name="menu ? 'x' : 'dots'" :size="18" /></button>
      </div>
    </div>
    <Transition name="nav-panel"><nav v-if="menu" id="mobile-nav" class="lp-mobile-links" :aria-label="copy.nav.site">
      <a href="#motion" @click.prevent="go('motion')">{{ journey.nav.motion }}</a>
      <a href="#try-app" @click.prevent="go('try-app')">{{ journey.nav.try }}</a>
      <template v-for="column in columns" :key="column.label">
        <p class="mobile-group">{{ column.label }}</p>
        <a v-for="link in column.links" :key="link.id" :href="'#' + link.id" @click.prevent="go(link.id)">{{ link.label }}</a>
      </template>
      <a href="#download" @click.prevent="go('download')">{{ journey.nav.download }}</a>
    </nav></Transition>
  </header>
</template>

<style scoped>
.lp-nav { background: color-mix(in srgb, var(--bg) 72%, transparent); backdrop-filter: blur(24px) saturate(1.3); -webkit-backdrop-filter: blur(24px) saturate(1.3); border-bottom-color: color-mix(in srgb, var(--line) 65%, transparent); box-shadow: inset 0 -1px 0 color-mix(in srgb, var(--ink) 3%, transparent); }
.lp-links { position: relative; }
.lp-link, .product-toggle { position: relative; transition: color 180ms ease, transform 240ms var(--lp-ease); }
.lp-link:active, .product-toggle:active { transform: scale(.96); }
.lp-link:hover, .product-toggle:hover { background: transparent; }
.product-toggle { display: flex; align-items: center; gap: 6px; }
.product-toggle svg { transition: transform 300ms var(--lp-ease); }
.product-toggle svg.turned { transform: rotate(180deg); }
.nav-light { position: absolute; top: 0; left: 0; width: 100px; height: 100%; border-radius: 24px; background: color-mix(in srgb, var(--ink) 7%, transparent); box-shadow: inset 0 1px 0 color-mix(in srgb, var(--ink) 8%, transparent); transform-origin: 0 50%; transition: transform 360ms var(--lp-ease), opacity 220ms ease; pointer-events: none; }
.lp-mega, .lp-mobile-links { background: color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter: blur(32px) saturate(1.25); }
.lp-mega { padding: 24px; gap: 24px; }
.lp-mega a { padding: 10px 8px; margin-inline: -8px; border-radius: 9px; transition: background 180ms ease, transform 250ms var(--lp-ease); }
.lp-mega a:hover { background: var(--surface); transform: translateX(3px); }
.nav-panel-enter-active { transition: opacity 220ms ease, transform 420ms var(--lp-ease); }
.nav-panel-leave-active { transition: opacity 160ms ease, transform 220ms ease; }
.nav-panel-enter-from, .nav-panel-leave-to { opacity: 0; transform: translateY(-10px) scale(.98); }
.site-preferences { display: flex; align-items: center; padding: 2px; border: 1px solid var(--line); border-radius: 999px; background: color-mix(in srgb, var(--surface) 55%, transparent); }
.preference-divider { width: 1px; height: 16px; margin-inline: 2px; background: var(--line); }
.site-theme { --seg-pad: 1px; }
.site-theme :deep(.segment-item) { min-height: 30px; width: 30px; padding: 0; }
.site-locale { font-size: 12px; }
@media(max-width:720px) { .lp-brand strong { display: none; } .site-locale { max-width: 100px; } }
@media(max-width:380px) { .site-locale { max-width: 82px; } .site-theme :deep(.segment-item) { width: 27px; } .lp-nav-actions { gap: 3px; } }
</style>
