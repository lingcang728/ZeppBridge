<script setup lang="ts">
/**
 * 首屏右侧的迷你概览：点一张卡，一块板从卡的位置长满整个窗口，详情在它上面浮出来；
 * 点返回，详情先退、板缩回原来那张卡。和应用里「从哪里来回哪里去」是同一套做法
 * （src/lib/motion/ghost.ts）：形变只落在一块没有子节点的实色板上，真实内容只动
 * opacity / transform。
 *
 * 动画放到一半再点别的：先把正在放的取消，从当下状态重来，不排队。Esc 等于返回。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import type { LandingCopy } from './types';
import { heartSeries, hourlySteps, linePath, sleepMinutes, sleepStages, stepsTotal } from './sampleData';

const props = defineProps<{ copy: LandingCopy['demo'] }>();

type Kind = 'heart' | 'steps' | 'sleep';
const open = ref<Kind | null>(null);
const shown = ref<Kind | null>(null);
const stage = ref<HTMLElement | null>(null);
const plate = ref<HTMLElement | null>(null);
const detail = ref<HTMLElement | null>(null);
const cards: Partial<Record<Kind, HTMLElement>> = {};
let generation = 0;

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const EASE = 'cubic-bezier(.2, .9, .22, 1)';

const insetFor = (card: HTMLElement): string => {
  const box = card.getBoundingClientRect();
  const host = stage.value!.getBoundingClientRect();
  const top = box.top - host.top;
  const left = box.left - host.left;
  const right = host.right - box.right;
  const bottom = host.bottom - box.bottom;
  const radius = Number.parseFloat(getComputedStyle(card).borderTopLeftRadius) || 18;
  return `inset(${top}px ${right}px ${bottom}px ${left}px round ${radius}px)`;
};
const FULL = 'inset(0px 0px 0px 0px round 0px)';

const stopAll = () => {
  for (const el of [plate.value, detail.value]) el?.getAnimations().forEach((animation) => animation.cancel());
};

const openCard = async (kind: Kind) => {
  const mine = ++generation;
  stopAll();
  const card = cards[kind];
  if (!card || !plate.value) return;
  open.value = kind;
  shown.value = kind;
  plate.value.style.visibility = 'visible';
  // 板就是详情页的底：长满以后留着，返回时再缩回去。
  if (reduced()) return;
  const from = insetFor(card);
  const grow = plate.value.animate(
    [{ clipPath: from, opacity: 1 }, { clipPath: FULL, opacity: 1 }],
    { duration: 380, easing: EASE, fill: 'forwards' },
  );
  // nextTick 而不是等一帧：详情刚插进 DOM、还没画出来就先把它藏好，否则会闪一帧。
  await nextTick();
  detail.value?.animate(
    [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 0, transform: 'translateY(10px)', offset: 0.55 }, { opacity: 1, transform: 'none' }],
    { duration: 520, easing: 'ease-out' },
  );
  await grow.finished.catch(() => undefined);
  if (mine !== generation) return;
};

const closeCard = async () => {
  const kind = open.value;
  if (!kind) return;
  const mine = ++generation;
  stopAll();
  open.value = null;
  const card = cards[kind];
  if (reduced() || !card || !plate.value) {
    shown.value = null;
    if (plate.value) plate.value.style.visibility = 'hidden';
    return;
  }
  const to = insetFor(card);
  plate.value.style.visibility = 'visible';
  const fade = detail.value?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: 'forwards' });
  const shrink = plate.value.animate(
    [{ clipPath: FULL, opacity: 1 }, { clipPath: to, opacity: 1 }],
    { duration: 420, easing: EASE, fill: 'forwards' },
  );
  await fade?.finished.catch(() => undefined);
  if (mine !== generation) return;
  shown.value = null;
  await shrink.finished.catch(() => undefined);
  if (mine !== generation) return;
  const out = plate.value.animate([{ clipPath: to, opacity: 1 }, { clipPath: to, opacity: 0 }], { duration: 160, fill: 'forwards' });
  await out.finished.catch(() => undefined);
  if (mine !== generation) return;
  stopAll();
  plate.value.style.visibility = 'hidden';
  card.animate([{ transform: 'scale(.97)' }, { transform: 'none' }], { duration: 280, easing: 'cubic-bezier(.2, 1.4, .4, 1)' });
};

const onKey = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && open.value) void closeCard();
};
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  generation += 1;
  stopAll();
});

const heartNow = heartSeries[heartSeries.length - 3];
const sparkHeart = linePath(heartSeries, 200, 44);
const detailHeart = linePath(heartSeries, 400, 150, 8);
const stepPeak = Math.max(...hourlySteps.map((value) => value ?? 0));
const sleepTotal = sleepStages.reduce((sum, [, minutes]) => sum + minutes, 0);
const sleepHours = Math.floor(sleepMinutes / 60);
const sleepRest = sleepMinutes % 60;
const nf = new Intl.NumberFormat();
const detailText = computed(() => (shown.value ? props.copy[shown.value].detail : ''));
const detailTitle = computed(() => (shown.value ? props.copy[shown.value].title : ''));
</script>

<template>
  <figure class="demo" :aria-label="copy.label">
    <div class="demo-window">
      <header class="demo-bar">
        <span class="demo-dots" aria-hidden="true"><i /><i /><i /></span>
        <b>{{ copy.greeting }}</b>
        <span class="demo-sample">{{ copy.sample }}</span>
      </header>
      <div ref="stage" class="demo-stage">
        <div class="demo-grid" :class="{ receded: open }" :inert="open ? true : undefined">
          <button :ref="(el) => { if (el) cards.heart = el as HTMLElement }" type="button" class="demo-card tone-heart" @click="openCard('heart')">
            <span class="card-title">{{ copy.heart.title }}</span>
            <span class="card-figure"><strong>{{ heartNow }}</strong><small>{{ copy.heart.unit }}</small></span>
            <svg class="spark" viewBox="0 0 200 44" preserveAspectRatio="none" aria-hidden="true"><path :d="sparkHeart" /></svg>
          </button>
          <button :ref="(el) => { if (el) cards.steps = el as HTMLElement }" type="button" class="demo-card tone-steps" @click="openCard('steps')">
            <span class="card-title">{{ copy.steps.title }}</span>
            <span class="card-figure"><strong>{{ nf.format(stepsTotal) }}</strong><small>{{ copy.steps.unit }}</small></span>
            <span class="mini-bars" aria-hidden="true">
              <i v-for="(value, hour) in hourlySteps" :key="hour" :style="{ transform: `scaleY(${value === null ? 0.04 : Math.max(0.08, value / stepPeak)})` }" :class="{ empty: value === null }" />
            </span>
          </button>
          <button :ref="(el) => { if (el) cards.sleep = el as HTMLElement }" type="button" class="demo-card tone-sleep wide" @click="openCard('sleep')">
            <span class="card-title">{{ copy.sleep.title }}</span>
            <span class="card-figure"><strong>{{ sleepHours }}</strong><small>{{ copy.sleep.hours }}</small><strong>{{ sleepRest }}</strong><small>{{ copy.sleep.minutes }}</small></span>
            <span class="stage-strip" aria-hidden="true">
              <i v-for="(entry, index) in sleepStages" :key="index" :class="`st-${entry[0]}`" :style="{ flexGrow: entry[1] }" />
            </span>
          </button>
        </div>
        <div ref="plate" class="demo-plate" aria-hidden="true" />
        <section v-if="shown" ref="detail" class="demo-detail" :class="`tone-${shown}`" aria-live="polite">
          <button type="button" class="demo-back" @click="closeCard">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" /></svg>{{ copy.back }}
          </button>
          <h3>{{ detailTitle }}</h3>
          <div v-if="shown === 'heart'" class="detail-chart">
            <p class="detail-figure"><strong>{{ heartNow }}</strong> {{ copy.heart.unit }}</p>
            <svg viewBox="0 0 400 150" preserveAspectRatio="none" aria-hidden="true">
              <path class="area" :d="`${detailHeart} L400 150 L0 150 Z`" /><path class="line" :d="detailHeart" />
            </svg>
          </div>
          <div v-else-if="shown === 'steps'" class="detail-chart">
            <p class="detail-figure"><strong>{{ nf.format(stepsTotal) }}</strong> {{ copy.steps.unit }}</p>
            <span class="big-bars" aria-hidden="true">
              <i v-for="(value, hour) in hourlySteps" :key="hour" :class="{ empty: value === null }" :style="{ transform: `scaleY(${value === null ? 0.02 : Math.max(0.05, value / stepPeak)})` }" />
            </span>
          </div>
          <div v-else class="detail-chart">
            <p class="detail-figure"><strong>{{ sleepHours }}</strong> {{ copy.sleep.hours }} <strong>{{ sleepRest }}</strong> {{ copy.sleep.minutes }}</p>
            <span class="hypno" aria-hidden="true">
              <i v-for="(entry, index) in sleepStages" :key="index" :class="`st-${entry[0]}`" :style="{ width: `${(entry[1] / sleepTotal) * 100}%` }" />
            </span>
          </div>
          <p class="detail-copy">{{ detailText }}</p>
        </section>
      </div>
    </div>
    <figcaption class="demo-hint">{{ copy.hint }}</figcaption>
  </figure>
</template>

<style scoped>
.demo { margin: 0; display: grid; gap: 12px; justify-items: center; }
.demo-window { width: 100%; max-width: 560px; border-radius: 24px; overflow: hidden; background: var(--canvas); box-shadow: var(--mat-rim), 0 40px 90px -40px rgba(0, 0, 0, .55), 0 0 0 1px var(--mat-line); }
.demo-bar { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--mat-line); font-size: 13px; }
.demo-dots { display: inline-flex; gap: 6px; }
.demo-dots i { width: 10px; height: 10px; border-radius: 50%; background: var(--mat-line-hover); }
.demo-sample { margin-left: auto; padding: 3px 10px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); font-size: 11.5px; font-weight: 600; }
.demo-stage { position: relative; height: 340px; }
.demo-grid { position: absolute; inset: 0; display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 12px; padding: 14px; transition: opacity 260ms ease, transform 420ms cubic-bezier(.2, .9, .22, 1); }
.demo-grid.receded { opacity: .15; transform: scale(.97); }
.demo-card { position: relative; display: grid; align-content: start; gap: 6px; padding: 16px; overflow: hidden; border: 0; border-radius: 18px; background: var(--mat-card); box-shadow: var(--mat-rim), var(--mat-shadow); color: var(--ink); text-align: left; font: inherit; cursor: pointer; transition: transform 180ms ease; }
.demo-card:hover { transform: translateY(-2px); }
.demo-card:active { transform: scale(.98); }
.demo-card:focus-visible, .demo-back:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.demo-card.wide { grid-column: 1 / -1; }
.card-title { color: var(--muted); font-size: 12.5px; font-weight: 600; }
.card-figure { display: flex; align-items: baseline; gap: 4px; }
.card-figure strong { font-size: 30px; font-weight: 700; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
.card-figure small { margin-right: 6px; color: var(--muted); font-size: 12px; }
.spark { position: absolute; right: 12px; bottom: 12px; left: 12px; height: 44px; }
.spark path { fill: none; stroke: var(--heart); stroke-width: 2; vector-effect: non-scaling-stroke; }
.mini-bars, .big-bars { display: grid; grid-template-columns: repeat(24, 1fr); align-items: end; gap: 2px; }
.mini-bars { position: absolute; right: 14px; bottom: 14px; left: 14px; height: 44px; }
.mini-bars i, .big-bars i { height: 100%; border-radius: 3px 3px 1px 1px; background: var(--activity); transform-origin: bottom; }
.mini-bars i.empty, .big-bars i.empty { background: var(--mat-line-hover); }
.stage-strip { display: flex; gap: 2px; height: 16px; margin-top: 8px; }
.stage-strip i, .hypno i { display: block; border-radius: 3px; }
.st-deep { background: var(--sleep-deep); }
.st-light { background: var(--sleep-light); }
.st-rem { background: var(--sleep-rem); }
.st-awake { background: var(--sleep-awake); }
.demo-plate { position: absolute; inset: 0; visibility: hidden; background: var(--mat-card-solid); pointer-events: none; }
.demo-detail { position: absolute; inset: 0; display: grid; align-content: start; gap: 10px; padding: 16px 20px; }
.demo-detail h3 { margin: 0; font-size: 18px; }
.demo-back { justify-self: start; display: inline-flex; align-items: center; gap: 4px; padding: 5px 12px 5px 8px; border: 0; border-radius: 999px; background: var(--cap-track); box-shadow: var(--cap-track-shadow); color: var(--ink); font: inherit; font-size: 12.5px; cursor: pointer; }
.demo-back svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.detail-figure { margin: 0; color: var(--muted); font-size: 13px; }
.detail-figure strong { color: var(--ink); font-size: 28px; font-variant-numeric: tabular-nums; }
.detail-chart svg { width: 100%; height: 150px; }
.detail-chart .line { fill: none; stroke: var(--heart); stroke-width: 2.2; vector-effect: non-scaling-stroke; }
.detail-chart .area { fill: var(--heart-wash); }
.big-bars { height: 150px; }
.hypno { display: flex; gap: 2px; height: 56px; margin-top: 8px; }
.detail-copy { margin: 0; max-width: 46ch; color: var(--muted); font-size: 13px; line-height: 1.6; }
.demo-hint { color: var(--subtle); font-size: 13px; }

@media (max-width: 560px) {
  .demo-stage { height: 300px; }
  .card-figure strong { font-size: 24px; }
}
@media (prefers-reduced-motion: reduce) {
  .demo-grid, .demo-card { transition: none; }
}
</style>
