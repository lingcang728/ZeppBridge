<script setup lang="ts">
/* 首屏：两句对仗的标题（同步到电脑 / 交给 AI，分量一样），底下两枚并列的亮点、下载按钮，
 * 右侧一叠轮播的示例通知，最下面是保留下来的两排手表滚动带。
 * 背景是两团缓慢漂移的光和一条走着光点的心电线——都只动 transform / 一条描边的偏移。 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import DeviceMarquee from '../../components/DeviceMarquee.vue';
import LandingIcon, { type LandingIconName } from './LandingIcon.vue';
import { magnetic, prefersReducedMotion, useInView } from './motion';
import type { LandingCopy } from './types';

const props = defineProps<{
  copy: LandingCopy['hero'];
  sample: string;
  download: { label: string; hint: string; href: string };
  githubHref: string;
}>();
const emit = defineEmits<{ download: [] }>();

/** 拉丁文按词、中日文按字拆开，标题一个个浮上来。标点粘在前一个字上：每个字是单独的块，
    不粘的话浏览器的避头规则管不到它，「。」会被单独挤到下一行。 */
const CLOSING = /^[，。、；：！？」』）》,.;:!?)]$/;
const pieces = (text: string) => {
  if (/\s/.test(text.trim())) return text.split(/(\s+)/);
  const out: string[] = [];
  for (const char of Array.from(text)) {
    if (CLOSING.test(char) && out.length) out[out.length - 1] += char;
    else out.push(char);
  }
  return out;
};
const lead = computed(() => pieces(props.copy.titleLead));
const accent = computed(() => pieces(props.copy.titleAccent));

/* —— 示例通知轮播：最新的从上面落下，旧的往下退、缩小、变淡，最多叠三张。 —— */
const TOAST_ICONS: LandingIconName[] = ['check', 'moon', 'sparkle', 'watch', 'eye-off'];
const stage = ref<HTMLElement | null>(null);
const inView = useInView(stage);
const head = ref(0);
const shown = computed(() => {
  const total = props.copy.toasts.length;
  return [0, 1, 2].map((depth) => {
    const index = (head.value - depth + total * 4) % total;
    return { key: `${head.value - depth}`, depth, index, toast: props.copy.toasts[index], icon: TOAST_ICONS[index % TOAST_ICONS.length] };
  });
});
let timer = 0;
const tick = () => {
  if (inView.value && !document.hidden) head.value += 1;
  timer = window.setTimeout(tick, 2900);
};
onMounted(() => {
  if (!prefersReducedMotion()) timer = window.setTimeout(tick, 1600);
});
onBeforeUnmount(() => window.clearTimeout(timer));
watch(() => props.copy.toasts, () => { head.value = 0; });

const pull = magnetic(10);
</script>

<template>
  <section id="top" class="hero">
    <div class="hero-bg" aria-hidden="true">
      <span class="aurora a1"></span>
      <span class="aurora a2"></span>
      <span class="grid"></span>
      <svg class="pulse" viewBox="0 0 1600 240" preserveAspectRatio="none">
        <defs>
          <linearGradient id="lp-pulse-fade" x1="0" x2="1">
            <stop offset="0" stop-color="currentColor" stop-opacity="0" />
            <stop offset=".25" stop-color="currentColor" stop-opacity=".9" />
            <stop offset=".75" stop-color="currentColor" stop-opacity=".9" />
            <stop offset="1" stop-color="currentColor" stop-opacity="0" />
          </linearGradient>
        </defs>
        <path
          class="pulse-base"
          d="M0 140 H420 l18 -10 l14 10 H560 l16 -96 l22 170 l18 -110 l14 36 H860 l20 -12 l16 12 H1080 l16 -80 l20 140 l16 -88 l12 28 H1600"
          stroke="url(#lp-pulse-fade)"
        />
        <path
          class="pulse-run"
          d="M0 140 H420 l18 -10 l14 10 H560 l16 -96 l22 170 l18 -110 l14 36 H860 l20 -12 l16 12 H1080 l16 -80 l20 140 l16 -88 l12 28 H1600"
        />
      </svg>
    </div>

    <div class="hero-inner">
      <p class="hero-eyebrow"><span class="live-dot"></span>{{ copy.eyebrow }}</p>
      <h1 class="hero-title">
        <span class="line">
          <span v-for="(piece, index) in lead" :key="`a${index}${piece}`" class="w" :style="{ '--d': index }">{{ piece }}</span>
        </span>
        <span class="line lp-accent-line">
          <span
            v-for="(piece, index) in accent"
            :key="`b${index}${piece}`"
            class="w lp-accent"
            :style="{ '--d': lead.length + index }"
          >{{ piece }}</span>
        </span>
      </h1>
      <p class="hero-lead">{{ copy.lead }}</p>

      <ul class="pillars">
        <li class="pillar">
          <span class="flow">
            <LandingIcon name="watch" :size="18" />
            <span class="rail"><i></i><i></i><i></i></span>
            <LandingIcon name="laptop" :size="18" />
          </span>
          {{ copy.pillars[0] }}
        </li>
        <li class="pillar is-ai">
          <span class="flow">
            <LandingIcon name="laptop" :size="18" />
            <span class="rail"><i></i><i></i><i></i></span>
            <LandingIcon name="sparkle" :size="18" />
          </span>
          {{ copy.pillars[1] }}
        </li>
      </ul>

      <div class="hero-cta">
        <a class="lp-btn lp-btn-primary" :href="download.href" rel="noopener" v-on="pull" @click="emit('download')">
          <LandingIcon name="download" :size="20" />
          <span>{{ download.label }}<small>{{ download.hint }}</small></span>
        </a>
        <a class="lp-btn lp-btn-ghost" :href="githubHref" target="_blank" rel="noopener">
          <LandingIcon name="github" :size="19" />{{ copy.github }}
        </a>
      </div>
      <p class="hero-meta">{{ copy.meta }}</p>
    </div>

    <div class="ask" aria-hidden="true">
      <span class="lp-sample ask-tag">{{ sample }}</span>
      <div class="ask-card">
        <span class="ask-file"><LandingIcon name="file" :size="14" />{{ copy.ask.file }}</span>
        <p>{{ copy.ask.question }}<span class="ask-caret"></span></p>
        <span class="ask-send"><LandingIcon name="sparkle" :size="15" /></span>
      </div>
    </div>

    <div ref="stage" class="toasts" aria-hidden="true">
      <span class="lp-sample toast-tag">{{ sample }}</span>
      <TransitionGroup name="toast" tag="div" class="toast-stack">
        <article v-for="item in shown" :key="item.key" class="toast" :data-depth="item.depth">
          <span :class="['toast-icon', `t${item.index % 5}`]"><LandingIcon :name="item.icon" :size="17" /></span>
          <div>
            <strong>{{ item.toast.title }}</strong>
            <p>{{ item.toast.body }}</p>
          </div>
        </article>
      </TransitionGroup>
    </div>

    <div class="hero-devices">
      <p class="devices-label">{{ copy.devices }}</p>
      <DeviceMarquee />
    </div>
  </section>
</template>

<style scoped>
.hero {
  position: relative;
  display: grid;
  min-height: 100svh;
  padding: 150px 0 40px;
  overflow: hidden;
}

/* ── 背景 ── */
.hero-bg { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
.aurora {
  position: absolute;
  width: 62vw;
  height: 62vw;
  border-radius: 50%;
  opacity: .9;
  will-change: transform;
}
.a1 {
  top: -32vw;
  left: -14vw;
  background: radial-gradient(closest-side, var(--lp-glow), transparent 70%);
  animation: drift-a 22s ease-in-out infinite alternate;
}
.a2 {
  top: -18vw;
  right: -22vw;
  background: radial-gradient(closest-side, var(--lp-glow-2), transparent 70%);
  animation: drift-b 26s ease-in-out infinite alternate;
}
@keyframes drift-a { to { transform: translate(10vw, 6vw) scale(1.12); } }
@keyframes drift-b { to { transform: translate(-8vw, 10vw) scale(.92); } }
.grid {
  position: absolute;
  inset: 0;
  background-image: linear-gradient(var(--lp-line) 1px, transparent 1px), linear-gradient(90deg, var(--lp-line) 1px, transparent 1px);
  background-size: 64px 64px;
  -webkit-mask-image: radial-gradient(ellipse 70% 55% at 50% 35%, #000 20%, transparent 75%);
  mask-image: radial-gradient(ellipse 70% 55% at 50% 35%, #000 20%, transparent 75%);
  opacity: .55;
}
.pulse { position: absolute; top: 46%; left: 0; width: 100%; height: 240px; color: var(--lp-green); overflow: visible; }
.pulse path { fill: none; stroke-width: 1.6; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
.pulse-base { opacity: .16; }
.pulse-run {
  stroke: var(--lp-green);
  stroke-width: 2.4;
  stroke-dasharray: 160 2400;
  stroke-dashoffset: 160;
  animation: run 4.8s cubic-bezier(.5, .1, .5, .9) infinite;
}
@keyframes run { to { stroke-dashoffset: -2400; } }

/* ── 文字 ── */
.hero-inner { position: relative; z-index: 1; display: grid; justify-items: center; width: min(1080px, calc(100% - 40px)); margin: 0 auto; text-align: center; }
.hero-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 28px;
  padding: 7px 16px;
  border: 1px solid var(--lp-line-2);
  border-radius: 999px;
  background: color-mix(in srgb, var(--lp-panel) 50%, transparent);
  color: var(--lp-muted);
  font-size: 13px;
  animation: rise .9s var(--lp-ease) both;
}
.live-dot { position: relative; width: 7px; height: 7px; border-radius: 50%; background: var(--lp-green); }
.live-dot::after { content: ''; position: absolute; inset: 0; border-radius: inherit; background: inherit; animation: ping 2s ease-out infinite; }
@keyframes ping { to { transform: scale(3); opacity: 0; } }
.hero-title { display: grid; gap: .08em; margin: 0; font-size: clamp(34px, 7.2vw, 96px); font-weight: 760; letter-spacing: -.035em; line-height: 1.04; }
.line { display: block; }
.w { display: inline-block; white-space: pre; animation: rise-word 1s var(--lp-ease) both; animation-delay: calc(120ms + var(--d) * 45ms); }
@keyframes rise-word { from { opacity: 0; transform: translateY(.45em) rotate(2deg); } }
@keyframes rise { from { opacity: 0; transform: translateY(24px); } }
.hero-lead { max-width: 40em; margin: 28px 0 0; color: var(--lp-muted); font-size: clamp(16px, 1.4vw, 19px); line-height: 1.7; animation: rise 1s var(--lp-ease) .55s both; text-wrap: pretty; }

.pillars { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; margin: 30px 0 0; padding: 0; list-style: none; animation: rise 1s var(--lp-ease) .7s both; }
.pillar {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  padding: 8px 18px 8px 10px;
  border: 1px solid var(--lp-line-2);
  border-radius: 999px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--lp-panel-2) 90%, transparent), color-mix(in srgb, var(--lp-panel) 70%, transparent));
  color: var(--lp-ink);
  font-size: 15px;
  font-weight: 600;
}
.flow { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 999px; background: color-mix(in srgb, var(--lp-green) 14%, transparent); color: var(--lp-green); }
.is-ai .flow { background: color-mix(in srgb, var(--lp-violet) 16%, transparent); color: var(--lp-violet); }
.rail { position: relative; display: block; width: 34px; height: 2px; border-radius: 2px; background: color-mix(in srgb, currentColor 25%, transparent); overflow: hidden; }
.rail i { position: absolute; top: -1px; left: 0; width: 6px; height: 4px; border-radius: 2px; background: currentColor; animation: travel 1.6s linear infinite; }
.rail i:nth-child(2) { animation-delay: .53s; }
.rail i:nth-child(3) { animation-delay: 1.06s; }
@keyframes travel { from { transform: translateX(-6px); opacity: 0; } 20% { opacity: 1; } 80% { opacity: 1; } to { transform: translateX(34px); opacity: 0; } }

.hero-cta { display: flex; flex-wrap: wrap; justify-content: center; gap: 14px; margin-top: 34px; animation: rise 1s var(--lp-ease) .85s both; }
.hero-cta .lp-btn-primary { min-height: 58px; padding: 0 28px 0 22px; text-align: left; }
.hero-meta { margin: 18px 0 0; color: var(--lp-subtle); font-family: var(--font-mono); font-size: 12.5px; animation: rise 1s var(--lp-ease) 1s both; }

/* ── 两侧的示例：右边是同步来的通知（亮点 01），左边是正要发给 AI 的问题（亮点 02）。
   放在按钮两侧那一排的高度，不压标题；窗口不够宽时右边那叠挪到按钮下面，左边那张收起。 ── */
.toasts { position: absolute; top: 560px; right: max(28px, calc((100vw - 1400px) / 2)); z-index: 1; width: 300px; animation: rise 1.2s var(--lp-ease) 1.1s both; }
.ask { position: absolute; top: 590px; left: max(28px, calc((100vw - 1400px) / 2)); z-index: 1; width: 290px; animation: rise 1.2s var(--lp-ease) 1.25s both; }
.ask-tag { position: absolute; top: -30px; left: 4px; }
.ask-card {
  display: grid;
  gap: 10px;
  padding: 14px 16px;
  border: 1px solid color-mix(in srgb, var(--lp-violet) 35%, var(--lp-line-2));
  border-radius: 20px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--lp-violet) 10%, var(--lp-panel-2)), var(--lp-panel));
  box-shadow: 0 24px 50px -24px rgba(0, 0, 0, .6), 0 0 40px -18px var(--lp-violet);
  animation: float 6s ease-in-out infinite;
}
@keyframes float { 50% { transform: translateY(-8px) rotate(-.6deg); } }
.ask-file { display: inline-flex; align-items: center; gap: 6px; justify-self: start; padding: 4px 9px; border-radius: 9px; background: color-mix(in srgb, var(--lp-violet) 18%, transparent); color: var(--lp-violet); font-family: var(--font-mono); font-size: 11px; }
.ask-card p { margin: 0; color: var(--lp-ink); font-size: 14px; line-height: 1.5; }
.ask-caret { display: inline-block; width: 2px; height: 1em; margin-left: 2px; vertical-align: -2px; background: var(--lp-violet); animation: caret 1s steps(1) infinite; }
@keyframes caret { 50% { opacity: 0; } }
.ask-send { display: grid; justify-self: end; width: 30px; height: 30px; place-items: center; border-radius: 50%; background: var(--lp-violet); color: #fff; }
.toast-tag { position: absolute; top: -30px; right: 4px; }
.toast-stack { position: relative; height: 170px; }
.toast {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  display: flex;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid var(--lp-line-2);
  border-radius: 20px;
  background: linear-gradient(180deg, var(--lp-panel-2), var(--lp-panel));
  box-shadow: 0 24px 50px -24px rgba(0, 0, 0, .6);
  transition: transform .8s var(--lp-ease), opacity .8s var(--lp-ease);
}
.toast[data-depth='1'] { transform: translateY(16px) scale(.94); opacity: .8; }
.toast[data-depth='2'] { transform: translateY(30px) scale(.88); opacity: .45; }
/* 后面两张只露出边：字藏起来，不和最上面那张叠成一团。 */
.toast > * { transition: opacity .5s ease; }
.toast:not([data-depth='0']) > * { opacity: 0; }
.toast[data-depth='0'] { z-index: 3; }
.toast[data-depth='1'] { z-index: 2; }
.toast strong { display: block; color: var(--lp-ink); font-size: 14px; }
.toast p { margin: 3px 0 0; color: var(--lp-muted); font-size: 12.5px; line-height: 1.45; }
.toast-icon { display: grid; flex: 0 0 34px; height: 34px; place-items: center; border-radius: 11px; background: color-mix(in srgb, var(--lp-green) 16%, transparent); color: var(--lp-green); }
.toast-icon.t1 { background: color-mix(in srgb, var(--sleep-light) 18%, transparent); color: var(--sleep-light); }
.toast-icon.t2 { background: color-mix(in srgb, var(--lp-violet) 18%, transparent); color: var(--lp-violet); }
.toast-icon.t3 { background: color-mix(in srgb, var(--heart) 16%, transparent); color: var(--heart); }
.toast-icon.t4 { background: var(--lp-line); color: var(--lp-muted); }
.toast-enter-from { transform: translateY(-26px) scale(1.04) !important; opacity: 0 !important; }
.toast-leave-active { position: absolute; }
.toast-leave-to { transform: translateY(48px) scale(.82) !important; opacity: 0 !important; }

/* ── 设备滚动带（保留下来的那一段） ── */
.hero-devices { position: relative; z-index: 1; align-self: end; margin-top: 80px; animation: rise 1.2s var(--lp-ease) 1.2s both; }
.devices-label { margin: 0 0 22px; color: var(--lp-subtle); font-family: var(--font-mono); font-size: 12px; letter-spacing: .14em; text-align: center; text-transform: uppercase; }

@media (max-width: 1280px) {
  .ask { display: none; }
  .toasts { position: relative; top: auto; right: auto; width: min(340px, calc(100% - 40px)); margin: 56px auto 0; }
}
@media (max-width: 720px) {
  .hero { padding-top: 112px; }
  .pillar { font-size: 14px; }
  .hero-devices { margin-top: 56px; }
}
</style>
