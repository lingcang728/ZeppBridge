<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import BrandMark from '../../components/BrandMark.vue';
import SegmentTrack from '../../components/SegmentTrack.vue';
import LandingIcon from './LandingIcon.vue';
import LocalePicker from './LocalePicker.vue';
import { landingTheme, toggleLandingTheme } from './theme';
import type { LandingLocale } from '../../composables/useLandingLocale';
import type { LandingCopy } from './types';
export type NavTarget = 'story' | 'privacy' | 'connect' | 'faq' | 'download';
const props = defineProps<{ copy: LandingCopy['nav']; locale: LandingLocale; downloadHref: string; githubHref: string; active: NavTarget }>();
const emit = defineEmits<{ locale: [value: LandingLocale]; go: [target: NavTarget] }>();
const items = computed(() => [
  { value: 'story' as NavTarget, label: props.copy.demo }, { value: 'connect' as NavTarget, label: props.copy.connect },
  { value: 'privacy' as NavTarget, label: props.copy.privacy }, { value: 'faq' as NavTarget, label: props.copy.faq },
]);
const mobileOpen = ref(false);
const toggle = ref<HTMLButtonElement | null>(null);
const menu = ref<HTMLElement | null>(null);
const header = ref<HTMLElement | null>(null);
const scrolled = ref(false);
let scrollFrame = 0;
const onScroll = () => { if (scrollFrame) return; scrollFrame = requestAnimationFrame(() => { scrollFrame = 0; scrolled.value = window.scrollY > 20; }); };
const close = async (restoreFocus = true) => { if (!mobileOpen.value) return; mobileOpen.value = false; if (restoreFocus) { await nextTick(); toggle.value?.focus({ preventScroll: true }); } };
const openMenu = async () => { if (mobileOpen.value) { void close(); return; } mobileOpen.value = true; await nextTick(); menu.value?.querySelector<HTMLElement>('a')?.focus({ preventScroll: true }); };
const go = (target: NavTarget) => { void close(false); emit('go', target); };
const onKeydown = (event: KeyboardEvent) => { if (event.key === 'Escape' && mobileOpen.value) { event.preventDefault(); void close(); } };
const onOutside = (event: Event) => { if (mobileOpen.value && !header.value?.contains(event.target as Node)) void close(false); };
let desktop: MediaQueryList | null = null;
const onDesktop = () => { if (desktop?.matches) void close(false); };
onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true }); window.addEventListener('keydown', onKeydown);
  document.addEventListener('pointerdown', onOutside); document.addEventListener('focusin', onOutside);
  desktop = window.matchMedia('(min-width: 1101px)'); desktop.addEventListener('change', onDesktop); onScroll();
});
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll); window.removeEventListener('keydown', onKeydown);
  document.removeEventListener('pointerdown', onOutside); document.removeEventListener('focusin', onOutside);
  desktop?.removeEventListener('change', onDesktop); cancelAnimationFrame(scrollFrame);
});
const flipTheme = (event: MouseEvent) => { const rect = (event.currentTarget as HTMLElement).getBoundingClientRect(); toggleLandingTheme({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }); };
</script>
<template>
  <header ref="header" :class="['lp-nav', { 'is-scrolled': scrolled, 'menu-open': mobileOpen }]">
    <div class="lp-nav-bar">
      <a class="lp-brand" href="#top" :aria-label="copy.home"><BrandMark :size="26" /><strong>ZeppBridge</strong></a>
      <nav class="lp-links" :aria-label="copy.site"><SegmentTrack :items="items" :model-value="active" :aria-label="copy.site" variant="glass" compact @update:model-value="go($event as NavTarget)" @reselect="go($event as NavTarget)" /></nav>
      <div class="lp-nav-actions">
        <div class="desktop-locale"><LocalePicker :model-value="locale" :label="copy.language" @update:model-value="emit('locale', $event)" /></div>
        <button type="button" class="lp-icon-btn" :aria-label="landingTheme === 'dark' ? copy.toLight : copy.toDark" :title="landingTheme === 'dark' ? copy.toLight : copy.toDark" @click="flipTheme"><LandingIcon :name="landingTheme === 'dark' ? 'sun' : 'moon'" :size="18" /></button>
        <a class="lp-nav-cta" href="#download" @click.prevent="go('download')"><LandingIcon name="download" :size="16" /><span>{{ copy.download }}</span></a>
        <button ref="toggle" type="button" class="lp-icon-btn menu-toggle" :aria-label="copy.site" :aria-expanded="mobileOpen" aria-controls="mobile-site-nav" @click="openMenu"><LandingIcon v-if="mobileOpen" name="x" :size="19" /><svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M5 8h14M5 16h14" /></svg></button>
      </div>
    </div>
    <nav v-if="mobileOpen" id="mobile-site-nav" ref="menu" class="mobile-menu" :aria-label="copy.site">
      <a v-for="item in items" :key="item.value" :href="`#${item.value}`" :aria-current="active === item.value ? 'location' : undefined" @click.prevent="go(item.value)"><span>{{ item.label }}</span><span aria-hidden="true">↗</span></a>
      <a href="#download" :aria-current="active === 'download' ? 'location' : undefined" @click.prevent="go('download')"><span>{{ copy.download }}</span><LandingIcon name="download" :size="17" /></a>
      <div class="mobile-utilities"><LocalePicker :model-value="locale" :label="copy.language" @update:model-value="emit('locale', $event)" /><a :href="githubHref" target="_blank" rel="noopener"><LandingIcon name="github" :size="18" /><span>{{ copy.github }}</span></a></div>
    </nav>
  </header>
</template>
<style scoped>
.lp-nav { position: fixed; top: 14px; right: 24px; left: 24px; z-index: 50; width: min(1340px, calc(100% - 48px)); margin: 0 auto; border: 1px solid var(--lp-line); border-radius: 20px; background: var(--lp-bg); transition: box-shadow .25s ease; }
.is-scrolled { box-shadow: 0 10px 35px -22px rgba(30, 40, 24, .32); }
.lp-nav-bar { display: flex; align-items: center; gap: 20px; min-height: 62px; padding: 8px 12px 8px 18px; }
.lp-brand { display: inline-flex; align-items: center; gap: 9px; flex-shrink: 0; color: var(--lp-ink); font-size: 16px; text-decoration: none; }
.lp-brand strong { font-weight: 680; letter-spacing: -.03em; }
.lp-links { margin: 0 auto; min-width: 0; }
.lp-links :deep(.segment-track) { --seg-font: 12px; }
.lp-nav-actions { display: flex; align-items: center; gap: 5px; margin-left: auto; }
.lp-icon-btn { display: grid; width: 40px; height: 40px; place-items: center; padding: 0; flex-shrink: 0; border: 0; border-radius: 50%; background: transparent; color: var(--lp-muted); cursor: pointer; transition: color .2s ease, background-color .2s ease; }
.lp-icon-btn:hover { background: var(--lp-line); color: var(--lp-ink); }
.lp .lp-nav-cta { display: inline-flex; align-items: center; gap: 7px; min-height: 40px; padding: 0 16px; border-radius: 999px; background: var(--lp-green); color: var(--lp-green-ink); font-size: 13px; font-weight: 650; text-decoration: none; }
.lp-nav-cta:hover { filter: brightness(1.07); }
.menu-toggle, .mobile-menu { display: none; }
@media (max-width: 1100px) {
  .lp-links, .desktop-locale { display: none; }
  .menu-toggle { display: grid; }
  .mobile-menu { display: grid; padding: 12px 18px 18px; border-top: 1px solid var(--lp-line); max-height: calc(100dvh - 100px); overflow-y: auto; }
  .mobile-menu > a { display: flex; align-items: center; justify-content: space-between; gap: 18px; min-height: 48px; padding: 8px 4px; border-bottom: 1px solid var(--lp-line); color: var(--lp-muted); font-size: 15px; text-decoration: none; }
  .mobile-menu > a[aria-current] { color: var(--lp-green); font-weight: 650; }
  .mobile-utilities { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding-top: 18px; }
  .mobile-utilities > a { display: inline-flex; align-items: center; gap: 6px; color: var(--lp-muted); font-size: 13px; text-decoration: none; }
}
@media (max-width: 520px) { .lp-nav { top: 10px; right: 12px; left: 12px; width: calc(100% - 24px); border-radius: 16px; } .lp-nav-bar { min-height: 58px; gap: 8px; padding: 7px 8px 7px 12px; } .lp-brand { font-size: 14px; gap: 7px; } .lp-nav-actions { gap: 0; } .lp .lp-nav-cta { gap: 5px; padding: 0 12px; font-size: 12px; } .mobile-menu { padding: 10px 16px 16px; } .mobile-utilities { gap: 8px; } .mobile-utilities :deep(.lp-locale) { padding-left: 0; } }
@media (max-width: 360px) { .lp-brand strong { display: none; } }
</style>
