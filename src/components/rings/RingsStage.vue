<script setup lang="ts">
/* 年轮舞台：照搬 Lumina 的粒子引擎（lib/rings/lumina/engine.ts）和它的界面层（UI.tsx：顶部提示胶囊、终幕爆闪）。
   手势识别没搬——那要从外网加载 MediaPipe，应用的 CSP 不允许。

   不自动往下走（用户 2026-10-22：「不要顿一下就自己轮播，让用户自己点，点一下切一个」）：
   飞入星海 → 停在年份数字上；点星海空白处（轻点，拖动不算）进下一幕：数字 → 年轮 → 终幕光带 → 回年轮 → …
   年轮那一幕里点中一颗星，弹出那次运动的卡片（从那颗星长出来），不切幕。右下角只留「重播」。
   换年份是拳击式切换（收缩、弹开、冲击波、镜头一抖），之后停在新年份的数字上。
   键盘照旧（不显示）：空格下一幕，F 回年轮，R 重播。离开页面、窗口隐藏、滚出视野时停帧，不白占 GPU。 */
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, shallowRef, watch } from 'vue';
import ModalDialog from '../ModalDialog.vue';
import { RingsLuminaEngine } from '../../lib/rings/lumina/engine';
import { lessMotion } from '../../lib/motion/lessMotion';
import { clockText } from '../../lib/logbook/clock';
import { journalDay, kmText } from '../../lib/logbook/display';
import { workoutLabel } from '../../lib/labels';
import { useRingsText } from './rings.i18n';
import type { RingStar, RingYear } from '../../types/rings';

const props = defineProps<{ years: RingYear[]; selected: number; finaleText: string }>();
const emit = defineEmits<{ (event: 'open-workout', id: string): void }>();
const t = useRingsText();

type Stage = 'idle' | 'year' | 'shape' | 'finale';
const stage = ref<Stage>('idle');
const host = ref<HTMLElement | null>(null);
const engine = shallowRef<RingsLuminaEngine | null>(null);
const flash = ref(0);

const toYear = () => { engine.value?.setPhase('year'); stage.value = 'year'; };
const toShape = () => { engine.value?.setPhase('shape'); stage.value = 'shape'; };
const bloom = () => {
  if (!engine.value || stage.value === 'idle') return;
  engine.value.setPhase('finale');
  stage.value = 'finale';
  flash.value += 1;
};
/** 下一幕：数字 → 年轮 → 终幕 → 回年轮。飞入途中点一下就跳过飞入。 */
const advance = () => {
  if (stage.value === 'idle') engine.value?.skipIntro();
  else if (stage.value === 'year' || stage.value === 'finale') toShape();
  else bloom();
};
const replay = () => {
  if (!engine.value) return;
  star.value = null;
  if (lessMotion()) { toYear(); return; }
  engine.value.replay();
  stage.value = 'idle';
};

watch(() => [props.years, props.selected, props.finaleText] as const, ([years, selected, text], old) => {
  const e = engine.value;
  if (!e) return;
  e.setData(years as RingYear[], selected as number, text as string);
  if (old && old[1] !== selected && stage.value !== 'idle') { star.value = null; toYear(); }
  else if (old && stage.value === 'finale' && old[2] !== text) e.setPhase('finale');
});

/* 星星：悬停亮起来、跟一张小签；点一下弹出那次运动的卡片，从那颗星长出来、关的时候缩回去。 */
const stars = computed<RingStar[]>(() => props.years.find(y => y.year === props.selected)?.stars ?? []);
const hover = ref<{ index: number; x: number; y: number } | null>(null);
const star = ref<number | null>(null);
const anchor = ref<HTMLElement | null>(null);
const anchorAt = ref({ x: 0, y: 0 });
const starOf = (index: number | null) => (index === null ? null : stars.value[index] ?? null);
const starLine = (s: RingStar) => [
  journalDay(s.date),
  s.distance_m ? `${kmText(s.distance_m / 1000)} km` : '',
  s.duration_s ? clockText(s.duration_s) : '',
].filter(Boolean).join(' · ');
const rank = (s: RingStar) => (s.duration_s ? 1 + stars.value.filter(o => (o.duration_s ?? 0) > s.duration_s!).length : null);
const local = (x: number, y: number) => {
  const box = host.value?.getBoundingClientRect();
  return box ? { x: x - box.left, y: y - box.top } : { x, y };
};
function pickAt(event: PointerEvent) {
  if (stage.value !== 'shape' || !engine.value) return null;
  return engine.value.pickStar(event.clientX, event.clientY);
}
function openStar(index: number) {
  const point = engine.value?.starPoint(index);
  if (point) anchorAt.value = local(point.x, point.y);
  hover.value = null;
  engine.value?.setHover(null);
  star.value = index;
}
const closeStar = () => { star.value = null; };
const openWorkout = () => {
  const s = starOf(star.value);
  star.value = null;
  if (s) emit('open-workout', s.workout_id);
};

/* 轻点（按下到抬起挪动不到 6px、不到 350ms）才算点击；拖着转镜头不算。 */
let down: { x: number; y: number; at: number } | null = null;
const onPointerDown = (event: PointerEvent) => { if (event.button === 0) down = { x: event.clientX, y: event.clientY, at: performance.now() }; };
const onPointerUp = (event: PointerEvent) => {
  const start = down;
  down = null;
  if (!start || event.button !== 0) return;
  if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6 || performance.now() - start.at > 350) return;
  const hit = pickAt(event);
  if (hit !== null) openStar(hit);
  else advance();
};
const onPointerMove = (event: PointerEvent) => {
  if (event.buttons) { if (hover.value) { hover.value = null; engine.value?.setHover(null); } return; }
  const hit = pickAt(event);
  engine.value?.setHover(hit);
  hover.value = hit === null ? null : { index: hit, ...local(event.clientX, event.clientY) };
};
const onPointerLeave = () => { down = null; hover.value = null; engine.value?.setHover(null); };
watch(stage, () => { hover.value = null; engine.value?.setHover(null); });

/* 键盘（Lumina 的键盘模式）：空格下一幕、F 年轮、R 重播。输入框里打字、卡片开着时不算。 */
const onKey = (event: KeyboardEvent) => {
  const target = event.target as HTMLElement | null;
  if (star.value !== null) return;
  if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(target.tagName))) return;
  const k = event.key.toLowerCase();
  if (k === ' ') { event.preventDefault(); advance(); }
  else if (k === 'f' || k === '0') { if (stage.value !== 'idle') toShape(); }
  else if (k === 'r') replay();
};

/* 停帧：页面缓存起来、窗口隐藏、滚出视野。 */
let visible = true;
let active = true;
const sync = () => {
  const e = engine.value;
  if (!e) return;
  if (visible && active && document.visibilityState === 'visible') e.start(); else e.stop();
};
let observer: IntersectionObserver | null = null;

onMounted(() => {
  if (!host.value) return;
  const reduced = lessMotion();
  const e = new RingsLuminaEngine(host.value, { reducedMotion: reduced, onIntroDone: toYear });
  e.setData(props.years, props.selected, props.finaleText);
  engine.value = e;
  if (reduced) toYear();
  observer = new IntersectionObserver(entries => { visible = entries.some(entry => entry.isIntersecting); sync(); });
  observer.observe(host.value);
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('keydown', onKey);
  sync();
});
onActivated(() => { active = true; window.addEventListener('keydown', onKey); sync(); });
onDeactivated(() => { active = false; window.removeEventListener('keydown', onKey); sync(); });
onBeforeUnmount(() => {
  observer?.disconnect();
  document.removeEventListener('visibilitychange', sync);
  window.removeEventListener('keydown', onKey);
  engine.value?.dispose();
  engine.value = null;
});

const yearOf = () => props.years.find(y => y.year === props.selected) ?? null;
const hint = (s: Stage) => {
  if (s === 'idle') return t.value.hintIdle;
  if (s === 'year') return t.value.hintYear;
  if (s === 'finale') return t.value.hintFinale;
  const y = yearOf();
  if (y?.data_days === 0) return t.value.blankYear;
  return y?.in_progress ? `${t.value.hintShape} · ${t.value.growing}` : t.value.hintShape;
};
const subHint = (s: Stage) => {
  if (s === 'idle') return t.value.tapSkip;
  if (s === 'shape' && stars.value.length) return `${t.value.starHint} · ${t.value.tapHint}`;
  return t.value.tapHint;
};

defineExpose({
  /** 截一帧给分享图（像素，不含任何原始数据）。 */
  capture: (width: number, height: number) => engine.value?.capture(width, height) ?? null,
  /** 还在飞入 / 年份数字时先落成年轮，等粒子聚拢再截（截到半路是一团散沙）。 */
  settle: async () => {
    if (!engine.value || stage.value === 'shape' || stage.value === 'finale') return;
    if (stage.value === 'idle') { engine.value.skipIntro(); await new Promise(resolve => window.setTimeout(resolve, 60)); }
    toShape();
    await new Promise(resolve => window.setTimeout(resolve, 1800));
  },
  stage,
});
</script>

<template>
  <div class="rings-stage">
    <div ref="host" :class="['stage-canvas', { 'on-star': hover }]"
      @pointerdown="onPointerDown" @pointerup="onPointerUp" @pointermove="onPointerMove" @pointerleave="onPointerLeave" />
    <div class="stage-ui">
      <Transition name="flash"><div v-if="stage === 'finale'" :key="flash" class="finale-flash" /></Transition>
      <div class="hint-row">
        <Transition name="hint" mode="out-in">
          <div :key="stage" class="hint">{{ hint(stage) }}<small>{{ subHint(stage) }}</small></div>
        </Transition>
      </div>
      <Transition name="tip">
        <div v-if="hover && starOf(hover.index)" class="star-tip" :style="{ left: `${hover.x}px`, top: `${hover.y}px` }">
          <b>{{ workoutLabel(starOf(hover.index)!.kind) }}</b>{{ starLine(starOf(hover.index)!) }}
        </div>
      </Transition>
      <span ref="anchor" class="star-anchor" :style="{ left: `${anchorAt.x}px`, top: `${anchorAt.y}px` }" aria-hidden="true"></span>
      <div class="stage-actions">
        <button type="button" class="stage-button quiet" @click="replay">{{ t.replay }}</button>
      </div>
    </div>
    <ModalDialog v-if="starOf(star)" labelledby="ring-star-title" :max-width="380" :origin="anchor" @close="closeStar">
      <div class="star-card">
        <span class="sc-kind">{{ journalDay(starOf(star)!.date) }}</span>
        <h2 id="ring-star-title">{{ workoutLabel(starOf(star)!.kind) }}</h2>
        <dl>
          <div v-if="starOf(star)!.duration_s"><dd>{{ clockText(starOf(star)!.duration_s!) }}</dd></div>
          <div v-if="starOf(star)!.distance_m"><dd>{{ kmText(starOf(star)!.distance_m! / 1000) }}</dd><dt>km</dt></div>
        </dl>
        <p v-if="rank(starOf(star)!)" class="sc-rank">{{ t.starRank(rank(starOf(star)!)!) }}</p>
        <footer>
          <button type="button" class="button button-secondary" @click="closeStar">{{ t.close }}</button>
          <button type="button" class="button button-primary" @click="openWorkout">{{ t.starOpen }}</button>
        </footer>
      </div>
    </ModalDialog>
  </div>
</template>

<style scoped>
/* 舞台永远是 Lumina 的深空（#050510），不跟深浅主题走。 */
.rings-stage { position: relative; overflow: hidden; border-radius: var(--radius-lg); background: #050510; isolation: isolate; }
.stage-canvas { position: absolute; inset: 0; touch-action: none; }
.stage-ui { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; pointer-events: none; }
.finale-flash { position: absolute; inset: 0; mix-blend-mode: screen; opacity: 0;
  background: radial-gradient(circle at 50% 46%, rgba(255, 248, 224, .96), rgba(255, 226, 150, .42) 32%, rgba(255, 200, 120, 0) 66%); }
.flash-enter-active { animation: finale-flash .5s ease-out; }
@keyframes finale-flash { from { opacity: .9; } to { opacity: 0; } }
.hint-row { display: flex; justify-content: center; width: 100%; margin-top: 28px; }
.hint { max-width: 80%; padding: .8rem 2.4rem; border: 1px solid rgba(255, 255, 255, .15); border-radius: 30px;
  background: linear-gradient(135deg, rgba(255, 255, 255, .1), rgba(255, 255, 255, .05)); backdrop-filter: blur(12px);
  color: rgba(255, 255, 255, .95); font-size: 1.3rem; text-align: center; text-shadow: 0 2px 10px rgba(0, 0, 0, .5); }
.hint-enter-active, .hint-leave-active { transition: opacity .5s ease, translate .5s ease; }
.hint-enter-from { opacity: 0; translate: 0 -20px; }
.hint-leave-to { opacity: 0; translate: 0 20px; }
.hint small { display: block; margin-top: 4px; color: rgba(255, 255, 255, .5); font-size: .78rem; letter-spacing: .02em; text-shadow: none; }
.stage-canvas { cursor: grab; }
.stage-canvas:active { cursor: grabbing; }
.stage-canvas.on-star { cursor: pointer; }
.star-tip { position: absolute; z-index: 2; display: grid; gap: 2px; padding: 8px 12px; border: 1px solid rgba(255, 226, 150, .25); border-radius: 12px; transform: translate(14px, -50%);
  background: rgba(14, 12, 24, .72); backdrop-filter: blur(10px); color: rgba(255, 244, 220, .78); font-size: .78rem; white-space: nowrap; pointer-events: none; }
.star-tip b { color: rgba(255, 236, 190, .98); font-size: .86rem; font-weight: 650; }
.tip-enter-active, .tip-leave-active { transition: opacity .16s ease, translate .16s ease; }
.tip-enter-from, .tip-leave-to { opacity: 0; translate: -4px 0; }
.star-anchor { position: absolute; width: 1px; height: 1px; pointer-events: none; }
.stage-actions { position: absolute; right: 24px; bottom: 24px; display: flex; gap: 10px; pointer-events: auto; }
.stage-button { padding: 8px 18px; border: 1px solid rgba(255, 255, 255, .18); border-radius: 999px; cursor: pointer;
  background: linear-gradient(135deg, rgba(255, 226, 150, .22), rgba(255, 200, 120, .08)); color: rgba(255, 244, 220, .95);
  font: inherit; font-size: .9rem; backdrop-filter: blur(12px); }
.stage-button:hover { background: linear-gradient(135deg, rgba(255, 226, 150, .34), rgba(255, 200, 120, .14)); }
.stage-button.quiet { background: rgba(255, 255, 255, .06); color: rgba(255, 255, 255, .7); }
.star-card { display: grid; gap: 10px; }
.star-card h2 { margin: 0; color: var(--ink); font-size: var(--fs-xl); }
.sc-kind { color: var(--muted); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
.star-card dl { display: flex; flex-wrap: wrap; gap: 8px 24px; margin: 0; }
.star-card dl div { display: flex; align-items: baseline; gap: 6px; }
.star-card dt { color: var(--subtle); font-size: var(--fs-xs); }
.star-card dd { margin: 0; color: var(--ink); font-family: var(--font-mono); font-size: 28px; font-variant-numeric: tabular-nums; }
.sc-rank { margin: 0; color: var(--kintsugi); font-size: var(--fs-sm); }
.star-card footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }
@media (max-width: 720px) {
  .hint { font-size: 1rem; padding: .6rem 1.4rem; }
}
</style>
