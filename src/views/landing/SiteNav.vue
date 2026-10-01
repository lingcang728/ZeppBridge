<script setup lang="ts">
/* 顶部悬浮导航：一枚玻璃胶囊（静态模糊），往下滚以后收窄一点；最上面一条细线是阅读进度（只动 scaleX）。 */
import { onBeforeUnmount, onMounted, ref } from 'vue';
import BrandMark from '../../components/BrandMark.vue';
import LandingIcon from './LandingIcon.vue';
import LocalePicker from './LocalePicker.vue';
import { landingTheme, toggleLandingTheme } from './theme';
import type { LandingLocale } from '../../composables/useLandingLocale';
import type { LandingCopy } from './types';
import { magnetic } from './motion';

defineProps<{ copy: LandingCopy['nav']; locale: LandingLocale; downloadHref: string; githubHref: string }>();
const emit = defineEmits<{ locale: [value: LandingLocale]; download: [] }>();

const scrolled = ref(false);
const progress = ref<HTMLElement | null>(null);
let frame = 0;
const onScroll = () => {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    scrolled.value = window.scrollY > 24;
    if (progress.value) progress.value.style.transform = `scaleX(${max > 0 ? Math.min(1, window.scrollY / max) : 0})`;
  });
};
onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
});
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll);
  cancelAnimationFrame(frame);
});

const flipTheme = (event: MouseEvent) => {
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
  toggleLandingTheme({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
};
const pull = magnetic(6);
</script>

<template>
  <header :class="['lp-nav', { 'is-scrolled': scrolled }]">
    <span ref="progress" class="lp-progress" aria-hidden="true"></span>
    <div class="lp-nav-pill">
      <a class="lp-brand" href="#top" :aria-label="copy.home"><BrandMark :size="26" /><strong>ZeppBridge</strong></a>
      <nav class="lp-links" :aria-label="copy.site">
        <a href="#demo">{{ copy.demo }}</a>
        <a href="#ai">{{ copy.ai }}</a>
        <a href="#features">{{ copy.features }}</a>
        <a href="#privacy">{{ copy.privacy }}</a>
      </nav>
      <div class="lp-nav-actions">
        <LocalePicker :model-value="locale" :label="copy.language" @update:model-value="emit('locale', $event)" />
        <button
          type="button"
          class="lp-icon-btn"
          :aria-label="landingTheme === 'dark' ? copy.toLight : copy.toDark"
          :title="landingTheme === 'dark' ? copy.toLight : copy.toDark"
          @click="flipTheme"
        >
          <LandingIcon :name="landingTheme === 'dark' ? 'sun' : 'moon'" :size="18" />
        </button>
        <a class="lp-icon-btn lp-hide-sm" :href="githubHref" target="_blank" rel="noopener" :aria-label="copy.github" :title="copy.github">
          <LandingIcon name="github" :size="18" />
        </a>
        <a class="lp-nav-cta" :href="downloadHref" rel="noopener" v-on="pull" @click="emit('download')">
          <LandingIcon name="download" :size="16" />{{ copy.download }}
        </a>
      </div>
    </div>
  </header>
</template>

<style scoped>
.lp-nav { position: fixed; top: 0; right: 0; left: 0; z-index: 50; display: flex; justify-content: center; padding: 14px 16px 0; pointer-events: none; }
.lp-progress {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 2px;
  background: linear-gradient(90deg, var(--lp-green), var(--lp-teal), var(--lp-violet));
  transform: scaleX(0);
  transform-origin: 0 50%;
  will-change: transform;
}
.lp-nav-pill {
  display: flex;
  align-items: center;
  gap: 18px;
  width: min(1180px, 100%);
  min-height: 58px;
  padding: 0 10px 0 18px;
  border: 1px solid transparent;
  border-radius: 999px;
  pointer-events: auto;
  transition: width .6s var(--lp-ease), border-color .4s ease, background-color .4s ease, box-shadow .4s ease;
}
.is-scrolled .lp-nav-pill {
  width: min(980px, 100%);
  border-color: var(--lp-line);
  background: color-mix(in srgb, var(--lp-bg) 72%, transparent);
  box-shadow: 0 20px 50px -30px rgba(0, 0, 0, .6);
  -webkit-backdrop-filter: blur(18px) saturate(1.4);
  backdrop-filter: blur(18px) saturate(1.4);
}
.lp-brand { display: inline-flex; align-items: center; gap: 10px; color: var(--lp-ink); font-size: 16px; text-decoration: none; }
.lp-links { display: flex; gap: 4px; margin: 0 auto; }
.lp-links a { padding: 8px 14px; border-radius: 999px; color: var(--lp-muted); font-size: 14px; text-decoration: none; transition: color .2s ease, background-color .2s ease; }
.lp-links a:hover { background: var(--lp-line); color: var(--lp-ink); }
.lp-nav-actions { display: flex; align-items: center; gap: 6px; margin-left: auto; }
.lp-icon-btn {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--lp-muted);
  cursor: pointer;
  transition: color .2s ease, background-color .2s ease;
}
.lp-icon-btn:hover { background: var(--lp-line); color: var(--lp-ink); }
.lp-nav-cta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  margin-left: 4px;
  padding: 0 18px;
  border-radius: 999px;
  background: var(--lp-ink);
  color: var(--lp-bg);
  font-size: 14px;
  font-weight: 650;
  text-decoration: none;
  transition: transform .5s var(--lp-ease);
}
@media (max-width: 900px) { .lp-links { display: none; } }
@media (max-width: 520px) {
  .lp-nav { padding: 10px 10px 0; }
  .lp-nav-pill { gap: 6px; padding: 0 6px 0 12px; }
  .lp-brand strong, .lp-hide-sm { display: none; }
}
</style>
