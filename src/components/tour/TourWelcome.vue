<script setup lang="ts">
/*
 * 引导沙盒的第一屏：一句问候**一笔一笔写出来**（像苹果开机那句 hello），写完停一会、淡去，
 * 再写下一种语言的；下面是玻璃语言轮，已按系统语言选好（首次启动时 i18n 就是用 pickLocale 定的语言）。
 * 拨语言走和顶栏一样的灰烬换语言（lib/motion/ashSwitch.ts，限定在这一层里），问候也立刻换成那种语言、重新写一遍。
 * 「开始看看」进第一章，「跳过」直接回到应用。
 *
 * 写字（10-13 第二版，用户：「不要等写完再全部填色，要像 iOS 欢迎那样灵动」）：笔尖从左往右走，
 * 描边沿着笔画画出来，墨跟着笔尖一路洇开——填色不是最后整体浮上来，而是紧跟在笔尖后面一段一段填满。
 * 做法：同一句画两层，上层是描边（stroke-dashoffset 画线），下层是填色；两层各套一张横向渐变遮罩，
 * 遮罩里的渐变条只做 translateX，描边那张在前、填色那张晚一拍跟上，边是柔的，像墨刚落下还没干。
 * 写完描边退淡，只剩字本身；整句跟着轻轻放大一点点落定。字体用系统自带的手写体（Windows 的
 * Segoe Script / Ink Free、中文楷体；macOS 的 Snell Roundhand / 楷体），没有就退到 cursive。
 *
 * 毛玻璃底画在 ::before 上，不放在这一层自己身上：祖先带 backdrop-filter 时语言轮的玻璃透镜
 * 看不见背后、直接不挂（useGlassLens 的 isolatedFromPage），语言轮就成了平的。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import CapsuleWheel from '../CapsuleWheel.vue';
import { locale, LOCALE_LABELS, LOCALES, type Locale } from '../../i18n';
import { useTourText } from './tour.i18n';
import { onMotionEscape } from '../../lib/motion/interrupt';

const emit = defineEmits<{ (event: 'start'): void; (event: 'skip'): void }>();
const t = useTourText();

/* 问候本身不翻译：每种语言说它自己的那一句。 */
const GREETINGS = ['你好', 'Hello', 'Hola', 'Bonjour', 'Hallo', 'Olá', 'Hoi', 'Привет', 'नमस्ते', 'Ciao'];
const GREETING_OF: Record<Locale, number> = { zh: 0, en: 1, es: 2, fr: 3, de: 4, 'pt-BR': 5, 'pt-PT': 5, nl: 6, ru: 7, 'hi-IN': 8, it: 9 };
const LANG_OF = ['zh', 'en', 'es', 'fr', 'de', 'pt', 'nl', 'ru', 'hi', 'it'];

const greeting = ref(GREETING_OF[locale.value] ?? 1);
const word = computed(() => GREETINGS[greeting.value] ?? '');
const svg = ref<SVGSVGElement | null>(null);
const inkEl = ref<SVGTextElement | null>(null);
const lineEl = ref<SVGTextElement | null>(null);
const leadBar = ref<SVGRectElement | null>(null);
const inkBar = ref<SVGRectElement | null>(null);
const box = ref({ x: -300, y: -80, width: 600, height: 160 });
/** 写完了：这时灰烬换语言可以把它碎掉（还在写的时候，画到灰里的会是整句实心字，和屏上半句对不上）。 */
const written = ref(false);

const WRITE_MS = 2100;
/** 墨比笔尖晚多久跟上。 */
const INK_LAG_MS = 260;
const HOLD_MS = 1600;
const FADE_MS = 420;
/** 遮罩的柔边占字宽的比例。 */
const SOFT = 0.16;
let timer = 0;
let running: Animation[] = [];
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const wait = (ms: number) => new Promise<void>((resolve) => { timer = window.setTimeout(resolve, ms); });
let cycle = 0;

const fit = () => {
  const el = inkEl.value;
  if (!el) return;
  try {
    const b = el.getBBox();
    if (b.width) box.value = { x: b.x - 24, y: b.y - 12, width: b.width + 48, height: b.height + 24 };
  } catch {
    // 还没布局好：沿用上一次的框。
  }
};

/* 渐变条：两倍字宽的实心段，右端 SOFT 宽的柔边。起点时整条在字的左边（右端刚好在字的左缘），
   走完「字宽 + 柔边」后柔边整个越过字的右缘、实心段盖满整句。 */
const softWidth = computed(() => box.value.width * SOFT);
const barWidth = computed(() => box.value.width * 2 + softWidth.value);
const barX = computed(() => box.value.x - barWidth.value);
const softStop = computed(() => `${(2 / (2 + SOFT)) * 100}%`);

const stopAll = () => {
  for (const a of running) a.cancel();
  running = [];
};

/** 写一句：笔尖从左走到右，描边一路画出来，墨紧跟在后面填满；写完描边退淡。 */
const write = async () => {
  written.value = false;
  await nextTick();
  fit();
  await nextTick();
  const host = svg.value;
  const ink = inkEl.value;
  const line = lineEl.value;
  const lead = leadBar.value;
  const fill = inkBar.value;
  if (!host || !ink || !line || !lead || !fill) return;
  stopAll();
  if (reduced()) {
    running = [host.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, fill: 'forwards' })];
    written.value = true;
    return;
  }
  const travel = `translateX(${box.value.width + softWidth.value}px)`;
  // 先慢后快再收住：起笔落得稳，中段一气呵成，收笔放慢。
  const pen = 'cubic-bezier(.55, .08, .32, 1)';
  running = [
    host.animate([{ opacity: 1, transform: 'scale(.985)' }, { opacity: 1, transform: 'none' }], { duration: WRITE_MS + INK_LAG_MS + 300, easing: 'cubic-bezier(.2, .7, .2, 1)', fill: 'forwards' }),
    lead.animate([{ transform: 'none' }, { transform: travel }], { duration: WRITE_MS, easing: pen, fill: 'forwards' }),
    fill.animate([{ transform: 'none' }, { transform: travel }], { duration: WRITE_MS, delay: INK_LAG_MS, easing: pen, fill: 'both' }),
    line.animate([{ strokeDashoffset: 1800 }, { strokeDashoffset: 0 }], { duration: WRITE_MS * 1.05, easing: pen, fill: 'forwards' }),
    line.animate([{ strokeOpacity: 1 }, { strokeOpacity: 1, offset: 0.78 }, { strokeOpacity: 0.28 }], { duration: WRITE_MS + INK_LAG_MS + 500, easing: 'ease-out', fill: 'forwards' }),
  ];
  const settle = running[2]!;
  void settle.finished.then(() => { written.value = true; }, () => undefined);
};

const fadeOut = async () => {
  const host = svg.value;
  written.value = false;
  if (!host || reduced()) return;
  const a = host.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-6px)' }], { duration: FADE_MS, easing: 'cubic-bezier(.4, 0, 1, 1)', fill: 'forwards' });
  running.push(a);
  await a.finished.catch(() => undefined);
};

/** 轮播：写 → 停 → 淡出 → 下一句。`to` 给了就直接写那一句（拨了语言）。 */
const loop = async (to?: number) => {
  const mine = ++cycle;
  window.clearTimeout(timer);
  if (to !== undefined && to !== greeting.value) {
    await fadeOut();
    if (mine !== cycle) return;
    greeting.value = to;
  }
  for (;;) {
    await write();
    if (mine !== cycle || reduced()) return;
    await wait(WRITE_MS + INK_LAG_MS + HOLD_MS);
    if (mine !== cycle) return;
    await fadeOut();
    if (mine !== cycle) return;
    greeting.value = (greeting.value + 1) % GREETINGS.length;
  }
};

/* 拨了语言：问候换成那种语言，重新写一遍。 */
watch(locale, (value) => {
  const index = GREETING_OF[value];
  if (index !== undefined) void loop(index);
});

const root = ref<HTMLElement | null>(null);
const wheel = ref<{ $el: HTMLElement } | null>(null);
const items = computed(() => LOCALES.map((code) => ({ value: code, label: LOCALE_LABELS[code] })));
const onLocale = (value: string | number) => {
  const rect = wheel.value?.$el.getBoundingClientRect();
  const origin = rect?.width ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : undefined;
  // 只动这一层里的字：压在毛玻璃底下的应用、顶栏导航都不参与（见 ashSwitch.ts 的 scope）。
  void import('../../lib/motion/ashSwitch').then(({ switchLocaleWithAsh }) => switchLocaleWithAsh(String(value) as Locale, origin, root.value ?? undefined));
};

const startButton = ref<HTMLElement | null>(null);
let releaseEscape: (() => void) | null = null;

onMounted(() => {
  releaseEscape = onMotionEscape(() => { emit('skip'); return true; }, { first: true });
  startButton.value?.focus({ preventScroll: true });
  // 手写体是系统字体，第一次量字宽前等它就绪（拿不到也不等太久）。
  const ready = document.fonts?.load ? document.fonts.load('80px "Segoe Script"').catch(() => undefined) : Promise.resolve();
  void Promise.race([ready, new Promise((resolve) => window.setTimeout(resolve, 400))]).then(() => loop());
});
onBeforeUnmount(() => {
  cycle += 1;
  window.clearTimeout(timer);
  stopAll();
  releaseEscape?.();
});
</script>

<template>
  <div ref="root" class="welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-greeting">
    <div class="welcome-greeting" aria-live="off">
      <svg ref="svg" class="hand" :viewBox="`${box.x} ${box.y} ${box.width} ${box.height}`" preserveAspectRatio="xMidYMid meet" role="img" :aria-label="word">
        <defs>
          <linearGradient id="welcome-pen-fade" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stop-color="#fff" />
            <stop :offset="softStop" stop-color="#fff" />
            <stop offset="1" stop-color="#fff" stop-opacity="0" />
          </linearGradient>
          <mask id="welcome-pen-lead" maskUnits="userSpaceOnUse" :x="box.x" :y="box.y" :width="box.width" :height="box.height">
            <rect ref="leadBar" class="pen-bar" :x="barX" :y="box.y" :width="barWidth" :height="box.height" fill="url(#welcome-pen-fade)" />
          </mask>
          <mask id="welcome-pen-ink" maskUnits="userSpaceOnUse" :x="box.x" :y="box.y" :width="box.width" :height="box.height">
            <rect ref="inkBar" class="pen-bar" :x="barX" :y="box.y" :width="barWidth" :height="box.height" fill="url(#welcome-pen-fade)" />
          </mask>
        </defs>
        <text id="welcome-greeting" ref="inkEl" :lang="LANG_OF[greeting]" x="0" y="0" text-anchor="middle" dominant-baseline="central"
          :data-ash-skip="written ? undefined : ''" mask="url(#welcome-pen-ink)"
          :class="['hand-text', 'hand-ink', { cjk: greeting === 0, wide: greeting >= 7 }]">{{ word }}</text>
        <text ref="lineEl" :lang="LANG_OF[greeting]" x="0" y="0" text-anchor="middle" dominant-baseline="central" aria-hidden="true"
          data-ash-skip mask="url(#welcome-pen-lead)"
          :class="['hand-text', 'hand-line', { cjk: greeting === 0, wide: greeting >= 7 }]">{{ word }}</text>
      </svg>
    </div>
    <p class="welcome-pick">{{ t.welcomePick }}</p>
    <CapsuleWheel ref="wheel" class="welcome-wheel" loop :span="260" :items="items" :model-value="locale" :aria-label="t.welcomePick" @update:model-value="onLocale" />
    <div class="welcome-actions">
      <button ref="startButton" type="button" class="button primary welcome-start" @click="emit('start')">{{ t.welcomeStart }}</button>
      <button type="button" class="welcome-skip" @click="emit('skip')">{{ t.welcomeSkip }}</button>
    </div>
  </div>
</template>

<style scoped>
.welcome {
  position: fixed; inset: 0; z-index: 9002;
  display: grid; place-content: center; justify-items: center; gap: 18px;
  padding: 24px;
  text-align: center;
}
/* 毛玻璃底单独一层（不是语言轮的祖先），透镜才看得见背后。 */
.welcome::before {
  content: '';
  position: absolute; inset: 0; z-index: -1;
  background: color-mix(in srgb, var(--bg) 72%, transparent);
  -webkit-backdrop-filter: blur(28px) saturate(1.15);
  backdrop-filter: blur(28px) saturate(1.15);
}
.welcome-greeting { position: relative; display: grid; height: clamp(96px, 16vw, 168px); width: min(680px, 90vw); place-items: center; }
.hand { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; opacity: 0; }
.pen-bar { transform-box: view-box; }
.hand-text {
  font-family: 'Segoe Script', 'Snell Roundhand', 'Ink Free', 'Bradley Hand', 'Segoe Print', 'KaiTi', 'STKaiti', 'Kaiti SC', cursive;
  font-size: 120px;
  font-weight: 700;
}
.hand-ink { fill: var(--ink); stroke: none; }
.hand-line {
  fill: none;
  stroke: var(--ink);
  stroke-width: 2px;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 1800;
  stroke-dashoffset: 1800;
}
/* 中文用楷体（手写体里没有汉字），笔画粗一点更像写的。 */
.hand-text.cjk { font-family: 'KaiTi', 'STKaiti', 'Kaiti SC', 'Segoe Script', cursive; font-weight: 400; }
.hand-line.cjk { stroke-width: 2.4px; }
.hand-text.wide { font-size: 104px; }
.welcome-pick { margin: 6px 0 0; color: var(--muted); font-size: var(--fs-sm); }
.welcome-wheel { width: min(320px, 86vw); }
.welcome-actions { display: grid; justify-items: center; gap: 10px; margin-top: 10px; }
.welcome-start { min-width: 200px; min-height: 44px; font-size: var(--fs-md); }
.welcome-skip { padding: 6px 10px; border: 0; background: none; color: var(--muted); font: inherit; font-size: var(--fs-sm); cursor: pointer; }
.welcome-skip:hover { color: var(--ink); }
.welcome-skip:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: 6px; }
@media (prefers-reduced-motion: reduce) {
  .hand-text { mask: none; }
  .hand-line { stroke-dashoffset: 0; stroke-opacity: .28; }
}
</style>
