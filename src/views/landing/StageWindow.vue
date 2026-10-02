<script setup lang="ts">
/**
 * 页面里那扇「真的 ZeppBridge」：同一份前端以演示模式（`?demo=1`，数据全是合成的）跑在一个 iframe 里，
 * 按 1280×800 的桌面尺寸渲染，再整体缩放到窗口宽度——看到的就是桌面应用本体，不是仿制品：
 * 导航胶囊、液态玻璃、设置卡叠的飞入飞出、图里的拖动，全是本体的。
 *
 * 外层页面用 postMessage 指挥它换到某一页（走真路由、真转场）、跟着主题和语言变（见 demo/host.ts）。
 *
 * 防滚轮陷阱：默认盖一层透明的罩子，鼠标滚轮照常滚整页；点一下罩子才把窗口交给访客玩，
 * 指针离开窗口一会儿就收回。这样既不会在滚页面时被应用「吃掉」，也不会不小心拖到里面的东西。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import BrandMark from '../../components/BrandMark.vue';
import { landingTheme } from './theme';
import type { LandingLocale } from '../../composables/useLandingLocale';
import type { LandingCopy } from './types';

const LOGICAL_W = 1280;
const LOGICAL_H = 800;
/** 与 demo/host.ts 约定的消息来源，两边都只认同源消息。 */
const SITE = 'zeppbridge-site';
const DEMO = 'zeppbridge-demo';

const props = defineProps<{
  /** 应用该显示哪一页（应用内路由，如 `/ai`）。 */
  route: string;
  /** 到了这一页以后，把应用里的滚动区滚到哪个元素（CSS 选择器）；没有就回到顶。 */
  scrollTo?: string | null;
  locale: LandingLocale;
  copy: LandingCopy['hero']['stage'];
  sample: string;
}>();
const emit = defineEmits<{ handoff: []; ready: [] }>();

const box = ref<HTMLElement | null>(null);
const frame = ref<HTMLIFrameElement | null>(null);
const width = ref(0);
const src = ref<string | null>(null);
const ready = ref(false);
const failed = ref(false);
const playing = ref(false);
const appPath = ref<string | null>(null);

const scale = computed(() => (width.value > 0 ? width.value / LOGICAL_W : 0.5));
const height = computed(() => Math.round(LOGICAL_H * scale.value));

const post = (payload: Record<string, unknown>) => {
  frame.value?.contentWindow?.postMessage({ source: SITE, ...payload }, window.location.origin);
};

/** 把应用带到想要的那一页；已经在那儿了只做滚动。 */
const sync = () => {
  if (!ready.value) return;
  if (appPath.value !== props.route) post({ type: 'go', to: props.route });
  else post({ type: 'scroll', selector: props.scrollTo ?? null });
};

const onMessage = (event: MessageEvent) => {
  if (event.origin !== window.location.origin) return;
  const data = event.data as { source?: string; type?: string; path?: string };
  if (data?.source !== DEMO) return;
  if (data.type === 'ready') {
    ready.value = true;
    appPath.value = data.path ?? null;
    emit('ready');
    sync();
  } else if (data.type === 'route') {
    appPath.value = data.path ?? null;
    window.setTimeout(() => post({ type: 'scroll', selector: props.scrollTo ?? null }), 420);
  } else if (data.type === 'handoff' || data.type === 'open-url') {
    emit('handoff');
  }
};

watch(() => [props.route, props.scrollTo], () => { playing.value = false; sync(); });
watch(landingTheme, (value) => post({ type: 'theme', value }));
watch(() => props.locale, (value) => post({ type: 'locale', value }));

/* 量宽度；离视口远的时候先不加载（首屏那一屏一定在视口里，立刻加载）。 */
let sizer: ResizeObserver | null = null;
let near: IntersectionObserver | null = null;
let timeout = 0;
const load = () => {
  if (src.value) return;
  src.value = `/?demo=1&theme=${landingTheme.value}&lang=${props.locale}&route=${encodeURIComponent(props.route)}`;
  // 8 秒还没等到应用说「我好了」，就当它打不开（脚本被拦、旧浏览器……），给一句明白话。
  timeout = window.setTimeout(() => { if (!ready.value) failed.value = true; }, 8000);
};
onMounted(() => {
  window.addEventListener('message', onMessage);
  if (box.value && typeof ResizeObserver !== 'undefined') {
    sizer = new ResizeObserver((entries) => { width.value = entries[0]?.contentRect.width ?? 0; });
    sizer.observe(box.value);
    width.value = box.value.getBoundingClientRect().width;
  }
  if (box.value && typeof IntersectionObserver !== 'undefined') {
    near = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) { load(); near?.disconnect(); } }, { rootMargin: '700px' });
    near.observe(box.value);
  } else load();
});
onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage);
  sizer?.disconnect();
  near?.disconnect();
  window.clearTimeout(timeout);
  window.clearTimeout(leaveTimer);
});

/* 点一下接管，离开一会儿收回。 */
let leaveTimer = 0;
const activate = () => { playing.value = true; };
const release = () => { playing.value = false; };
const onLeave = () => {
  window.clearTimeout(leaveTimer);
  leaveTimer = window.setTimeout(release, 900);
};
const onEnter = () => window.clearTimeout(leaveTimer);
</script>

<template>
  <figure ref="box" class="win" @pointerleave="onLeave" @pointerenter="onEnter">
    <div class="frame" :style="{ height: `${height}px` }">
      <iframe
        v-if="src"
        ref="frame"
        class="app"
        :src="src"
        title="ZeppBridge"
        :tabindex="playing ? 0 : -1"
        :style="{ width: `${LOGICAL_W}px`, height: `${LOGICAL_H}px`, transform: `scale(${scale})`, pointerEvents: playing ? 'auto' : 'none' }"
        :class="{ shown: ready }"
      ></iframe>

      <div v-if="!ready" class="skeleton" aria-live="polite">
        <template v-if="failed">
          <p class="fail">{{ copy.unavailable }}</p>
        </template>
        <template v-else>
          <span class="mark"><BrandMark :size="40" /></span>
          <p>{{ copy.loading }}</p>
        </template>
      </div>

      <button v-if="ready && !playing" type="button" class="shield" @click="activate">
        <span class="hint"><i aria-hidden="true"></i>{{ copy.hint }}</span>
      </button>
      <button v-if="playing" type="button" class="exit" @click="release">{{ copy.exit }}</button>

      <!-- 盖在应用上的东西（对话演出）放进窗口框里：定位和圆角裁切都以应用窗口为准，不会探出框外。 -->
      <slot />
    </div>
    <figcaption><span class="lp-sample">{{ sample }}</span>{{ copy.note }}</figcaption>
  </figure>
</template>

<style scoped>
.win { position: relative; display: grid; gap: 14px; margin: 0; width: 100%; }
.frame {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--lp-line-2);
  border-radius: 22px;
  background: var(--lp-bg-2);
  box-shadow: var(--lp-shadow);
  /* 只有圆角裁切 + 缩放的 iframe：整块是一个合成层，滚动页面时不重排。 */
  isolation: isolate;
  contain: layout paint;
}
.app {
  position: absolute;
  top: 0;
  left: 0;
  border: 0;
  background: transparent;
  transform-origin: 0 0;
  opacity: 0;
  transition: opacity .6s var(--lp-ease);
}
.app.shown { opacity: 1; }

.skeleton { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: 14px; color: var(--lp-subtle); font-size: 14px; text-align: center; }
.skeleton p { margin: 0; max-width: 24em; }
.mark { display: grid; width: 72px; height: 72px; place-items: center; border-radius: 22px; background: var(--lp-panel); box-shadow: 0 0 0 1px var(--lp-line) inset, var(--lp-shadow); animation: breathe 1.6s ease-in-out infinite; }
.fail { color: var(--lp-muted); line-height: 1.6; }
@keyframes breathe { 50% { transform: scale(.94); opacity: .7; } }

/* 罩子：透明，盖在应用上。滚轮不被应用吃掉；点一下才开始玩。 */
.shield { position: absolute; inset: 0; z-index: 3; display: flex; align-items: flex-end; justify-content: center; padding: 0 0 22px; border: 0; background: transparent; cursor: pointer; }
.hint {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 18px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--lp-bg) 82%, transparent);
  box-shadow: 0 0 0 1px var(--lp-line-2) inset, 0 12px 30px -12px rgba(0, 0, 0, .35);
  -webkit-backdrop-filter: blur(12px) saturate(1.3);
  backdrop-filter: blur(12px) saturate(1.3);
  color: var(--lp-ink);
  font-size: 14.5px;
  font-weight: 650;
  transition: transform .5s var(--lp-ease);
}
.shield:hover .hint { transform: translateY(-3px); }
.hint i { width: 9px; height: 9px; border-radius: 50%; background: var(--lp-green); box-shadow: 0 0 0 0 var(--lp-glow); animation: ping 2s ease-out infinite; }
@keyframes ping { 70% { box-shadow: 0 0 0 10px transparent; } 100% { box-shadow: 0 0 0 0 transparent; } }

.exit { position: absolute; right: 14px; bottom: 14px; z-index: 4; padding: 8px 14px; border: 0; border-radius: 999px; background: color-mix(in srgb, var(--lp-bg) 82%, transparent); box-shadow: 0 0 0 1px var(--lp-line-2) inset; -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); color: var(--lp-muted); font: inherit; font-size: 13px; cursor: pointer; }
.exit:hover { color: var(--lp-ink); }
figcaption { display: flex; align-items: center; gap: 10px; color: var(--lp-subtle); font-size: 13.5px; line-height: 1.5; }

@media (prefers-reduced-motion: reduce) { .mark, .hint i { animation: none; } }
</style>
