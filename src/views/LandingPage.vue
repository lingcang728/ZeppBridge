<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useLandingLocale } from '../composables/useLandingLocale';
import { COPY } from './landing/copy';
import HeroLanding from './landing/HeroLanding.vue';
import FeatureShowcase from './landing/FeatureShowcase.vue';
import { JOURNEY } from './landing/journeyCopy';
import InteractiveDemoSection from './landing/InteractiveDemoSection.vue';
import FinalCta from './landing/FinalCta.vue';
import DocumentationFooter from './landing/DocumentationFooter.vue';
import { useDownloads } from './landing/useDownloads';
import SiteNav, { type NavTarget } from './landing/SiteNav.vue';
import { scrollToSection, useScrollMotion } from './landing/motion';
const { locale, localeLoadError, initializeLocale, setLocale, landingCopyFor } = useLandingLocale();
const t = computed(() => locale.value === 'zh' || locale.value === 'en' ? COPY[locale.value] : landingCopyFor(locale.value) ?? COPY.en);
const journey = computed(() => JOURNEY[locale.value]);
const downloads = useDownloads(t);
const page = ref<HTMLElement | null>(null);
useScrollMotion(page);
const active = ref<NavTarget>('features');
const targets: NavTarget[] = ['features','try-app','docs','download'];
let intent: string | null = null;
let observer: IntersectionObserver | null = null;
let timer = 0;
let historyTimer = 0;
const observe = () => {
 if (intent) return;
 let current: NavTarget = 'features';
 for (const id of targets) if ((document.getElementById(id)?.getBoundingClientRect().top ?? Infinity) <= innerHeight*.4) current=id;
 active.value=current;
};
const go = (id: string, writeHistory = true) => {
 intent=id;
 if(id === 'top') active.value='features';
 if (targets.includes(id as NavTarget)) active.value=id as NavTarget;
 scrollToSection(id, writeHistory && location.hash !== '#'+id ? 'push' : 'none');
 clearTimeout(timer);
 timer=window.setTimeout(() => { intent=null; observe(); },1200);
};
const interrupt = () => { intent=null; clearTimeout(timer); requestAnimationFrame(observe); };
const keyInterrupt = (event: KeyboardEvent) => { if (['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' '].includes(event.key) && !(event.target as HTMLElement).closest('button,input,[role="menu"]')) interrupt(); };
const history = () => { clearTimeout(historyTimer); historyTimer=window.setTimeout(() => { const id=location.hash.slice(1); if (document.getElementById(id)) go(id,false); },80); };
onMounted(() => {
 initializeLocale();
 void downloads.load();
 observer=new IntersectionObserver(observe,{ rootMargin:'-15% 0px -60% 0px',threshold:[0,.1,1] });
 targets.forEach(id=>{ const el=document.getElementById(id); if(el) observer?.observe(el); });
 window.addEventListener('wheel',interrupt,{passive:true}); window.addEventListener('touchstart',interrupt,{passive:true}); window.addEventListener('keydown',keyInterrupt); window.addEventListener('hashchange',history); window.addEventListener('popstate',history);
 if(location.hash) history();
});
onBeforeUnmount(() => { observer?.disconnect(); clearTimeout(timer); clearTimeout(historyTimer); window.removeEventListener('wheel',interrupt); window.removeEventListener('touchstart',interrupt); window.removeEventListener('keydown',keyInterrupt); window.removeEventListener('hashchange',history); window.removeEventListener('popstate',history); });
</script>
<template>
<div id="top" ref="page" class="lp">
<a class="lp-skip" href="#features">{{ t.rebuild.nav[0] }}</a>
<SiteNav :copy="t" :journey="journey" :locale="locale" :active="active" @locale="setLocale" @go="go" />
<main>
<p v-if="localeLoadError" class="locale-load-error lp-wrap" role="status">{{ COPY.en.rebuild.languageFallback }}</p>
<HeroLanding :journey="journey" :locale="locale" />
<FeatureShowcase :journey="journey" :locale="locale" />
<InteractiveDemoSection :copy="t" :journey="journey" :locale="locale" />
<DocumentationFooter :journey="journey" />
<FinalCta :copy="t" :journey="journey" :windows="downloads.windows.value" :macos="downloads.macos.value" :linux="downloads.linux.value" :available="downloads.state.value === 'ready'" />
</main>
</div>
</template>
<style src="./landing/landing.css"></style>
