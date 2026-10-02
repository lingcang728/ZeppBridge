<script setup lang="ts">
/**
 * 首屏 + 五个片段：左边是文字，右边是**真的 ZeppBridge**（StageWindow），随着往下滚，应用自己换到另一页。
 *
 *   首屏   概览（标题、下载按钮）
 *   01     同步（翻牌计数）       → 概览
 *   02     如实（没测到就是没测到） → 心率页，昨天下午那段空白
 *   03     交给 AI                → 交给 AI 页，点「交给」会演一段对话
 *   04     排计划                 → 交给 AI 页下半，AI 排的一周
 *   05     你说了算               → 设置页，一叠卡片
 *
 * 宽屏：整段用 sticky 钉在视口里，文字在左边淡入淡出，应用在右边换页；窄屏：文字一段一段往下排，
 * 应用窗口钉在上面。哪个片段亮着由滚动位置决定（IntersectionObserver，不监听 scroll）。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import FlapBoard from './FlapBoard.vue';
import HandoffOverlay from './HandoffOverlay.vue';
import LandingIcon from './LandingIcon.vue';
import StageWindow from './StageWindow.vue';
import type { LandingLocale } from '../../composables/useLandingLocale';
import type { LandingCopy } from './types';
import { magnetic } from './motion';

interface Scene { route: string; scrollTo: string | null }
/** 第 0 项是首屏，其后每项对应 copy.beats 里的一个片段。 */
const SCENES: Scene[] = [
  { route: '/', scrollTo: null },
  { route: '/', scrollTo: null },
  { route: '/heart', scrollTo: null },
  { route: '/ai', scrollTo: null },
  { route: '/ai', scrollTo: '.plan-section' },
  { route: '/settings', scrollTo: null },
];

const props = defineProps<{
  copy: LandingCopy;
  locale: LandingLocale;
  primary: { label: string; hint: string; href: string };
  githubHref: string;
}>();
const emit = defineEmits<{ download: []; active: [index: number] }>();

const active = ref(0);
const scene = computed(() => SCENES[active.value] ?? SCENES[0]);
const chatOpen = ref(false);
const root = ref<HTMLElement | null>(null);
const pull = magnetic(10);

watch(active, (index) => { chatOpen.value = false; emit('active', index); });

/* 谁亮着：宽屏看 .anchor（撑出滚动长度的空块），窄屏看文字块本身。 */
let observer: IntersectionObserver | null = null;
const targets = (): HTMLElement[] => {
  const wide = window.matchMedia('(min-width: 980px)').matches;
  return [...(root.value?.querySelectorAll<HTMLElement>(wide ? '[data-anchor]' : '[data-beat]') ?? [])];
};
const observe = () => {
  observer?.disconnect();
  if (typeof IntersectionObserver === 'undefined') return;
  observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) active.value = Number((entry.target as HTMLElement).dataset.index ?? 0);
    }
  }, { rootMargin: '-45% 0px -45% 0px' });
  for (const node of targets()) observer.observe(node);
};
let media: MediaQueryList | null = null;
onMounted(() => {
  observe();
  media = window.matchMedia('(min-width: 980px)');
  media.addEventListener('change', observe);
});
onBeforeUnmount(() => { observer?.disconnect(); media?.removeEventListener('change', observe); });

/* 导航点「交给 AI」时滚到对应片段。 */
const scrollToBeat = (index: number) => {
  const node = root.value?.querySelector<HTMLElement>(`[data-anchor][data-index="${index}"], [data-beat][data-index="${index}"]`);
  const wide = window.matchMedia('(min-width: 980px)').matches;
  const target = wide ? root.value?.querySelector<HTMLElement>(`[data-anchor][data-index="${index}"]`) : node;
  target?.scrollIntoView({ behavior: 'smooth', block: wide ? 'center' : 'start' });
};
defineExpose({ scrollToBeat });
</script>

<template>
  <section id="story" ref="root" class="story">
    <div class="pin">
      <div class="inner">
        <div class="texts">
          <!-- 首屏 -->
          <article :class="['beat', 'hero', { on: active === 0 }]" data-beat data-index="0" :aria-hidden="active !== 0">
            <p class="eyebrow"><span class="dot" aria-hidden="true"></span>{{ copy.hero.eyebrow }}</p>
            <h1>{{ copy.hero.titleLead }}<br><span class="lp-mark">{{ copy.hero.titleAccent }}</span></h1>
            <p class="lead">{{ copy.hero.lead }}</p>
            <div class="cta">
              <a class="lp-btn lp-btn-primary" :href="primary.href" rel="noopener" v-on="pull" @click="emit('download')">
                <LandingIcon name="download" :size="20" />
                <span>{{ primary.label }}<small>{{ primary.hint }}</small></span>
              </a>
              <a class="lp-btn lp-btn-ghost" :href="githubHref" target="_blank" rel="noopener">
                <LandingIcon name="github" :size="19" /><span>{{ copy.hero.github }}</span>
              </a>
            </div>
            <p class="meta">{{ copy.hero.meta }}</p>
          </article>

          <!-- 五个片段 -->
          <article v-for="(beat, i) in copy.beats" :key="beat.kicker" :class="['beat', { on: active === i + 1 }]" data-beat :data-index="i + 1" :aria-hidden="active !== i + 1">
            <p class="lp-kicker">{{ beat.kicker }}</p>
            <h2>{{ beat.title }}</h2>
            <p class="body">{{ beat.body }}</p>
            <FlapBoard v-if="i === 0" class="flap" :copy="copy.flap" :sample="copy.sample" :active="active === 1" />
          </article>
        </div>

        <div class="stage">
          <StageWindow :route="scene.route" :scroll-to="scene.scrollTo" :locale="locale" :copy="copy.hero.stage" :sample="copy.sample"
            @handoff="chatOpen = true">
            <HandoffOverlay :open="chatOpen" :copy="copy.handoff" :sample="copy.sample" @close="chatOpen = false" />
          </StageWindow>
        </div>
      </div>
    </div>

    <!-- 宽屏下撑出滚动长度的空块：每个片段占大约一屏。 -->
    <div class="anchors" aria-hidden="true">
      <i v-for="n in SCENES.length" :key="n" data-anchor :data-index="n - 1"></i>
    </div>
  </section>
</template>

<style scoped>
.story { position: relative; padding-top: 76px; }
.inner { display: grid; grid-template-columns: minmax(0, 33fr) minmax(0, 67fr); gap: clamp(28px, 3.4vw, 56px); align-items: center; width: min(1280px, calc(100% - 48px)); margin: 0 auto; }
.texts { position: relative; min-width: 0; container-type: inline-size; }
/* 窗口比版心再往右探出一截：宽屏上它是页面里最大的东西。 */
.stage { position: relative; min-width: 0; margin-right: calc(-1 * max(0px, (100vw - 1280px) / 2 - 24px)); }

/* 文字块 */
.beat h1, .beat h2 { margin: 0; letter-spacing: -.035em; line-height: 1.04; text-wrap: balance; }
.hero h1 { font-size: clamp(34px, 12.6cqw, 64px); font-weight: 700; }
.beat h2 { font-size: clamp(25px, 8.6cqw, 42px); font-weight: 700; line-height: 1.12; }
.eyebrow { display: inline-flex; align-items: center; gap: 10px; margin: 0 0 22px; color: var(--lp-muted); font-family: var(--font-mono); font-size: 12px; letter-spacing: .1em; text-transform: uppercase; }
.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--lp-green); box-shadow: 0 0 0 4px var(--lp-glow); }
.lead, .body { margin: 22px 0 0; color: var(--lp-muted); font-size: clamp(15.5px, 1.2vw, 18px); line-height: 1.72; text-wrap: pretty; }
.cta { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 32px; }
.meta { margin: 18px 0 0; color: var(--lp-subtle); font-family: var(--font-mono); font-size: 12px; letter-spacing: .04em; line-height: 1.6; }
.flap { margin-top: 26px; max-width: 460px; }

.anchors { display: none; }

/* 宽屏：整段钉在视口里，文字淡入淡出。 */
@media (min-width: 980px) {
  .story { height: calc(100vh * (1 + 0.82 * 5)); }
  .pin { position: sticky; top: 0; height: 100vh; display: grid; align-items: center; }
  .inner { padding-top: 12px; }
  .texts { min-height: min(560px, 72vh); }
  .beat { position: absolute; top: 50%; left: 0; right: 0; opacity: 0; transform: translateY(calc(-50% + 22px)); pointer-events: none; transition: opacity .55s var(--lp-ease), transform .7s var(--lp-ease); }
  .beat.on { opacity: 1; transform: translateY(-50%); pointer-events: auto; }
  .anchors { position: absolute; inset: 0; display: block; pointer-events: none; }
  .anchors i { position: absolute; left: 0; width: 1px; height: calc(100vh * 0.82); }
  .anchors i:nth-child(1) { top: 0; }
  .anchors i:nth-child(2) { top: calc(100vh * 0.82 * 1); }
  .anchors i:nth-child(3) { top: calc(100vh * 0.82 * 2); }
  .anchors i:nth-child(4) { top: calc(100vh * 0.82 * 3); }
  .anchors i:nth-child(5) { top: calc(100vh * 0.82 * 4); }
  .anchors i:nth-child(6) { top: calc(100vh * 0.82 * 5); height: 100vh; }
}

/* 窄屏：应用窗口钉在文字上面，文字一段一段往下排。 */
@media (max-width: 979px) {
  .inner { display: flex; flex-direction: column-reverse; align-items: stretch; gap: 0; width: calc(100% - 32px); }
  .texts { width: 100%; }
  .stage { position: sticky; top: 72px; z-index: 5; margin: 0 0 28px; padding-bottom: 8px; background: linear-gradient(var(--lp-bg) 80%, transparent); }
  .beat { position: relative; padding: 56px 0; opacity: 1; }
  .beat.hero { padding-top: 24px; }
  .flap { max-width: none; }
}
@media (prefers-reduced-motion: reduce) {
  .beat { transition: none; }
}
</style>
