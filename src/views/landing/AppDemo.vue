<script setup lang="ts">
/* 第 01 章的主演示：一扇「ZeppBridge 窗口」，可以点标签换心率 / 睡眠 / 步数，图会重新画出来；
 * 心率那页有个开关，拨一下看「没戴表的两小时」诚实地留空和被补 0 的区别。
 * 窗口跟着指针轻轻倾斜（只动 transform）。数据全是确定函数生成的示例。 */
import { computed, ref } from 'vue';
import BrandMark from '../../components/BrandMark.vue';
import LandingIcon from './LandingIcon.vue';
import { prefersReducedMotion, useSeen } from './motion';
import type { LandingCopy } from './types';

const props = defineProps<{ copy: LandingCopy['demo']; chapter?: string; sample: string }>();

type Tab = 'heart' | 'sleep' | 'steps';
const TABS: Tab[] = ['heart', 'sleep', 'steps'];
const tab = ref<Tab>('heart');
const zeroFill = ref(false);
const tabIndex = computed(() => TABS.indexOf(tab.value));

/* —— 示例数据 —— */
const W = 640;
const H = 200;
/** 一天 96 个点（每 15 分钟），夜里低、傍晚跑步那段高；13:00–15:00 没戴表 → null。 */
const heart: (number | null)[] = Array.from({ length: 96 }, (_, i) => {
  const hour = i / 4;
  if (hour >= 13 && hour < 15) return null;
  const base = hour < 6.5 ? 52 : hour < 8 ? 64 : 72;
  const wave = Math.sin(i * 0.7) * 4 + Math.sin(i * 0.23) * 5;
  const run = hour >= 18 && hour < 19.25 ? 70 - Math.abs(hour - 18.6) * 70 : 0;
  return Math.round(base + wave + Math.max(0, run));
});
const HR_MIN = 40;
const HR_MAX = 150;
const x = (i: number, n: number) => (i / (n - 1)) * W;
const yHr = (v: number) => H - ((v - HR_MIN) / (HR_MAX - HR_MIN)) * H;
const pathOf = (values: (number | null)[], zero: boolean) => {
  let d = '';
  let pen = false;
  values.forEach((v, i) => {
    if (v === null && !zero) { pen = false; return; }
    const y = v === null ? H : yHr(v);
    d += `${pen ? 'L' : 'M'}${x(i, values.length).toFixed(1)} ${y.toFixed(1)} `;
    pen = true;
  });
  return d.trim();
};
const honestPath = pathOf(heart, false);
const zeroPath = pathOf(heart, true);
const gapX = x(52, 96);
const gapW = x(60, 96) - gapX;

/** 睡眠阶段（0 清醒 1 REM 2 浅睡 3 深睡），按分钟起止，23:48 起共 432 分钟。 */
const sleepBlocks: Array<[number, number, number]> = [
  [0, 0, 12], [2, 12, 40], [3, 40, 95], [2, 95, 130], [1, 130, 152], [2, 152, 190], [3, 190, 228], [2, 228, 262],
  [1, 262, 290], [0, 290, 296], [2, 296, 336], [3, 336, 352], [2, 352, 384], [1, 384, 418], [0, 418, 432],
];
const SLEEP_TOTAL = 432;
const laneH = H / 4;
const sleepColors = ['var(--sleep-awake)', 'var(--sleep-rem)', 'var(--sleep-light)', 'var(--sleep-deep)'];

/** 每小时步数，睡着的时段是 null（不画柱子，不是 0）。 */
const steps: (number | null)[] = Array.from({ length: 24 }, (_, h) => {
  if (h < 7) return null;
  const table = [0, 0, 0, 0, 0, 0, 0, 420, 1260, 380, 210, 520, 890, 310, 260, 180, 640, 920, 3100, 1260, 520, 380, 160, null];
  return table[h] ?? null;
});
const STEP_MAX = 3200;
const barW = W / 24 - 8;

/* —— 进场：窗口滚进来时从后仰的样子立起来；之后跟指针倾斜。 —— */
const shell = ref<HTMLElement | null>(null);
const seen = useSeen(shell, 0.25);
const tilt = ref({ x: 0, y: 0 });
const onMove = (event: PointerEvent) => {
  if (event.pointerType !== 'mouse' || prefersReducedMotion()) return;
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
  tilt.value = { x: ((event.clientY - box.top) / box.height - 0.5) * -4, y: ((event.clientX - box.left) / box.width - 0.5) * 5 };
};
const onLeave = () => { tilt.value = { x: 0, y: 0 }; };
const tiltStyle = computed(() => ({ transform: `perspective(1600px) rotateX(${tilt.value.x.toFixed(2)}deg) rotateY(${tilt.value.y.toFixed(2)}deg)` }));

const heading = computed(() => {
  if (tab.value === 'heart') return { value: props.copy.heart.value, unit: props.copy.heart.unit, caption: props.copy.heart.caption };
  if (tab.value === 'sleep') return { value: props.copy.sleep.value, unit: '', caption: props.copy.sleep.caption };
  return { value: props.copy.steps.value, unit: props.copy.steps.unit, caption: props.copy.steps.caption };
});
</script>

<template>
  <section id="demo" class="lp-section demo">
    <div class="lp-center" data-reveal>
      <p v-if="chapter" class="lp-chapter">{{ chapter }}</p>
      <h2 class="lp-h2">{{ copy.heading }}</h2>
      <p class="lp-lead">{{ copy.lead }}</p>
    </div>

    <div ref="shell" :class="['stage', { 'is-up': seen }]" @pointermove="onMove" @pointerleave="onLeave">
      <div class="glow" aria-hidden="true"></div>
      <div class="window lp-panel" :style="tiltStyle">
        <div class="titlebar">
          <span class="lights"><i></i><i></i><i></i></span>
          <span class="title">{{ copy.window }}</span>
          <span class="lp-sample">{{ sample }}</span>
        </div>
        <div class="body">
          <aside class="side" aria-hidden="true">
            <span class="side-brand"><BrandMark :size="22" /></span>
            <span v-for="(item, index) in copy.nav" :key="item" :class="['side-item', { on: index === 0 }]">{{ item }}</span>
            <span class="side-sync"><span class="dot"></span>07:12</span>
          </aside>
          <div class="main">
            <div class="tabs" role="tablist" :style="{ '--tab': tabIndex }">
              <span class="tab-thumb" aria-hidden="true"></span>
              <button
                v-for="key in TABS"
                :key="key"
                type="button"
                role="tab"
                :aria-selected="tab === key"
                :class="['tab', { on: tab === key }]"
                @click="tab = key"
              >{{ copy.tabs[key] }}</button>
            </div>

            <Transition name="swap" mode="out-in">
              <div :key="tab" class="readout">
                <p class="value"><strong>{{ heading.value }}</strong><span v-if="heading.unit">{{ heading.unit }}</span></p>
                <p class="caption">{{ heading.caption }}</p>
              </div>
            </Transition>

            <div :class="['chart', { 'has-lanes': tab === 'sleep' }]">
              <ul v-if="tab === 'sleep'" class="lanes" aria-hidden="true">
                <li v-for="(stage, index) in copy.sleep.stages" :key="stage" :style="{ color: sleepColors[index] }">{{ stage }}</li>
              </ul>
              <Transition name="swap" mode="out-in">
                <svg v-if="tab === 'heart'" key="heart" :viewBox="`0 0 ${W} ${H}`" class="svg" preserveAspectRatio="none" aria-hidden="true">
                  <rect :x="gapX" y="0" :width="gapW" :height="H" :class="['gap', { zero: zeroFill }]" />
                  <path :d="honestPath" :class="['hr', { drawn: seen, faded: zeroFill }]" pathLength="1" />
                  <path :d="zeroPath" :class="['hr-zero', { on: zeroFill }]" pathLength="1" />
                </svg>
                <svg v-else-if="tab === 'sleep'" key="sleep" :viewBox="`0 0 ${W} ${H}`" class="svg" preserveAspectRatio="none" aria-hidden="true">
                  <rect
                    v-for="(block, index) in sleepBlocks"
                    :key="index"
                    class="sleep-block"
                    :x="(block[1] / SLEEP_TOTAL) * W"
                    :y="block[0] * laneH + 6"
                    :width="((block[2] - block[1]) / SLEEP_TOTAL) * W"
                    :height="laneH - 12"
                    rx="5"
                    :fill="sleepColors[block[0]]"
                    :style="{ '--k': index }"
                  />
                </svg>
                <svg v-else key="steps" :viewBox="`0 0 ${W} ${H}`" class="svg" preserveAspectRatio="none" aria-hidden="true">
                  <template v-for="(value, hour) in steps" :key="hour">
                    <rect
                      v-if="value !== null"
                      class="bar"
                      :x="hour * (W / 24) + 4"
                      :y="H - Math.max(3, (value / STEP_MAX) * H)"
                      :width="barW"
                      :height="Math.max(3, (value / STEP_MAX) * H)"
                      rx="4"
                      :style="{ '--k': hour }"
                    />
                    <circle v-else class="empty" :cx="hour * (W / 24) + 4 + barW / 2" :cy="H - 2" r="1.6" />
                  </template>
                </svg>
              </Transition>
            </div>

            <div v-if="tab === 'heart'" class="gap-row">
              <span class="gap-label">{{ copy.gap.label }}</span>
              <div class="seg" role="radiogroup" :aria-label="copy.gap.label">
                <button type="button" role="radio" :aria-checked="!zeroFill" :class="{ on: !zeroFill }" @click="zeroFill = false">
                  <LandingIcon name="check" :size="14" />{{ copy.gap.honest }}
                </button>
                <button type="button" role="radio" :aria-checked="zeroFill" :class="{ on: zeroFill, bad: zeroFill }" @click="zeroFill = true">{{ copy.gap.zero }}</button>
              </div>
              <Transition name="swap" mode="out-in">
                <p :key="String(zeroFill)" :class="['gap-note', { bad: zeroFill }]">{{ zeroFill ? copy.gap.zeroNote : copy.gap.honestNote }}</p>
              </Transition>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.stage { position: relative; margin-top: 64px; perspective: 1800px; }
.glow {
  position: absolute;
  inset: 8% 10% -6%;
  border-radius: 50%;
  background: radial-gradient(closest-side, var(--lp-glow), transparent 70%);
  opacity: 0;
  transition: opacity 1.4s ease .2s;
}
.is-up .glow { opacity: .8; }
.window {
  overflow: hidden;
  border-radius: 22px;
  transform-origin: 50% 0;
  opacity: 0;
  translate: 0 60px;
  scale: .94;
  rotate: x 14deg;
  transition: transform .5s var(--lp-ease), opacity 1s var(--lp-ease), translate 1.2s var(--lp-ease), scale 1.2s var(--lp-ease), rotate 1.2s var(--lp-ease);
}
.is-up .window { opacity: 1; translate: 0 0; scale: 1; rotate: x 0deg; }
.titlebar { display: flex; align-items: center; gap: 14px; height: 44px; padding: 0 16px; border-bottom: 1px solid var(--lp-line); }
.lights { display: flex; gap: 7px; }
.lights i { width: 11px; height: 11px; border-radius: 50%; background: var(--lp-line-2); }
.lights i:first-child { background: #ff5f57; }
.lights i:nth-child(2) { background: #febc2e; }
.lights i:nth-child(3) { background: #28c840; }
.title { flex: 1; color: var(--lp-subtle); font-size: 13px; text-align: center; }
.body { display: grid; grid-template-columns: 190px minmax(0, 1fr); min-height: 460px; }
.side { display: flex; flex-direction: column; gap: 4px; padding: 18px 12px; border-right: 1px solid var(--lp-line); }
.side-brand { margin: 0 0 14px 8px; }
.side-item { padding: 9px 12px; border-radius: 10px; color: var(--lp-muted); font-size: 14px; }
.side-item.on { background: var(--lp-line); color: var(--lp-ink); }
.side-sync { display: inline-flex; align-items: center; gap: 8px; margin-top: auto; padding: 8px 12px; color: var(--lp-subtle); font-family: var(--font-mono); font-size: 12px; }
.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--lp-green); box-shadow: 0 0 0 4px color-mix(in srgb, var(--lp-green) 20%, transparent); }
.main { display: grid; align-content: start; gap: 18px; padding: 24px 28px 26px; min-width: 0; }

.tabs { position: relative; display: inline-grid; grid-template-columns: repeat(3, 1fr); justify-self: start; padding: 4px; border-radius: 999px; background: var(--lp-line); }
.tab-thumb {
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 4px;
  width: calc((100% - 8px) / 3);
  border-radius: 999px;
  background: var(--lp-panel-2);
  box-shadow: 0 6px 16px -8px rgba(0, 0, 0, .6), 0 0 0 1px var(--lp-line-2) inset;
  transform: translateX(calc(var(--tab) * 100%));
  transition: transform .5s var(--lp-ease);
}
.tab { position: relative; min-width: 92px; min-height: 34px; padding: 0 16px; border: 0; border-radius: 999px; background: transparent; color: var(--lp-muted); font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; transition: color .3s ease; }
.tab.on { color: var(--lp-ink); }

.readout { min-height: 74px; }
.value { display: flex; align-items: baseline; gap: 8px; margin: 0; }
.value strong { font-size: clamp(34px, 4vw, 48px); font-weight: 720; letter-spacing: -.03em; font-variant-numeric: tabular-nums; }
.value span { color: var(--lp-muted); font-size: 15px; }
.caption { margin: 4px 0 0; color: var(--lp-subtle); font-size: 13.5px; }

.chart { position: relative; height: 220px; }
.svg { width: 100%; height: 100%; overflow: visible; }
.hr, .hr-zero { fill: none; stroke-width: 2.2; stroke-linejoin: round; stroke-linecap: round; vector-effect: non-scaling-stroke; }
.hr { stroke: var(--heart); stroke-dasharray: 1; stroke-dashoffset: 1; transition: opacity .4s ease; }
.hr.drawn { animation: draw 1.8s cubic-bezier(.4, .1, .2, 1) both; }
@keyframes draw { to { stroke-dashoffset: 0; } }
.hr.faded { opacity: .12; }
.hr-zero { stroke: var(--danger); stroke-dasharray: 1; stroke-dashoffset: 1; opacity: 0; transition: stroke-dashoffset 1.1s cubic-bezier(.4, .1, .2, 1), opacity .3s ease; }
.hr-zero.on { stroke-dashoffset: 0; opacity: 1; }
.gap { fill: color-mix(in srgb, var(--lp-ink) 5%, transparent); stroke: var(--lp-line-2); stroke-dasharray: 4 5; transition: fill .4s ease; }
.gap.zero { fill: color-mix(in srgb, var(--danger) 10%, transparent); }
.sleep-block { transform-box: fill-box; transform-origin: 0 50%; animation: grow-x .6s var(--lp-ease) both; animation-delay: calc(var(--k) * 45ms); }
@keyframes grow-x { from { transform: scaleX(0); opacity: 0; } }
.chart.has-lanes { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 12px; }
.lanes { display: grid; grid-template-rows: repeat(4, 1fr); margin: 0; padding: 0; list-style: none; font-size: 11.5px; text-align: right; }
.lanes li { display: flex; align-items: center; justify-content: flex-end; white-space: nowrap; }
.bar { fill: var(--lp-teal); transform-box: fill-box; transform-origin: 50% 100%; animation: grow-y .7s var(--lp-ease) both; animation-delay: calc(var(--k) * 28ms); }
@keyframes grow-y { from { transform: scaleY(0); } }
.empty { fill: var(--lp-subtle); opacity: .5; }

.gap-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; }
.gap-label { color: var(--lp-muted); font-size: 13.5px; }
.seg { display: inline-flex; padding: 3px; border-radius: 999px; background: var(--lp-line); }
.seg button { display: inline-flex; align-items: center; gap: 6px; min-height: 30px; padding: 0 14px; border: 0; border-radius: 999px; background: transparent; color: var(--lp-muted); font: inherit; font-size: 13px; cursor: pointer; transition: background-color .3s ease, color .3s ease; }
.seg button.on { background: var(--lp-panel-2); color: var(--lp-green); box-shadow: 0 0 0 1px var(--lp-line-2) inset; }
.seg button.bad { color: var(--danger); }
.gap-note { flex-basis: 100%; margin: 0; color: var(--lp-subtle); font-size: 13px; }
.gap-note.bad { color: color-mix(in srgb, var(--danger) 80%, var(--lp-muted)); }

.swap-enter-active, .swap-leave-active { transition: opacity .25s ease, transform .35s var(--lp-ease); }
.swap-enter-from { opacity: 0; transform: translateY(8px); }
.swap-leave-to { opacity: 0; transform: translateY(-6px); }

@media (max-width: 860px) {
  .body { grid-template-columns: 1fr; }
  .side { display: none; }
  .main { padding: 20px 18px 22px; }
  .chart { height: 180px; }
}
@media (prefers-reduced-motion: reduce) {
  .window { opacity: 1; translate: none; scale: none; rotate: none; }
  .hr { stroke-dashoffset: 0; }
}
</style>
