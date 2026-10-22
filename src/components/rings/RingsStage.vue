<script setup lang="ts">
/* 年轮舞台：照搬 Lumina 的粒子引擎（lib/rings/lumina/engine.ts）和它的界面层（UI.tsx：顶部提示胶囊、
   终幕爆闪、左下角操作说明）。手势识别没搬——那要从外网加载 MediaPipe，应用的 CSP 不允许；键盘与鼠标照旧。

   幕次自动走：飞入星海 → 年份数字 → 年轮切片；换年份是拳击式切换（收缩、弹开、冲击波、镜头一抖）；
   空格 / 「绽放」进终幕，F 回年轮，R 重播。离开页面、窗口隐藏、滚出视野时停帧，不白占 GPU。 */
import { onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, shallowRef, watch } from 'vue';
import { RingsLuminaEngine } from '../../lib/rings/lumina/engine';
import { lessMotion } from '../../lib/motion/lessMotion';
import { useRingsText } from './rings.i18n';
import type { RingYear } from '../../types/rings';

const props = defineProps<{ years: RingYear[]; selected: number; finaleText: string }>();
const t = useRingsText();

type Stage = 'idle' | 'year' | 'shape' | 'finale';
const stage = ref<Stage>('idle');
const host = ref<HTMLElement | null>(null);
const engine = shallowRef<RingsLuminaEngine | null>(null);
const flash = ref(0);
let timer = 0;

const toShape = () => { window.clearTimeout(timer); engine.value?.setPhase('shape'); stage.value = 'shape'; };
const toYear = (hold: number) => {
  window.clearTimeout(timer);
  engine.value?.setPhase('year');
  stage.value = 'year';
  timer = window.setTimeout(toShape, hold);
};
const bloom = () => {
  if (!engine.value || stage.value === 'idle') return;
  window.clearTimeout(timer);
  engine.value.setPhase('finale');
  stage.value = 'finale';
  flash.value += 1;
};
const replay = () => {
  window.clearTimeout(timer);
  if (!engine.value) return;
  if (lessMotion()) { toYear(2800); return; }
  engine.value.replay();
  stage.value = 'idle';
};

watch(() => [props.years, props.selected, props.finaleText] as const, ([years, selected, text], old) => {
  const e = engine.value;
  if (!e) return;
  e.setData(years as RingYear[], selected as number, text as string);
  if (old && old[1] !== selected && stage.value !== 'idle') toYear(2200);
  else if (old && stage.value === 'finale' && old[2] !== text) e.setPhase('finale');
});

/* 键盘（Lumina 的键盘模式）：空格绽放、F 年轮、R 重播。输入框里打字不算。 */
const onKey = (event: KeyboardEvent) => {
  const target = event.target as HTMLElement | null;
  if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
  const k = event.key.toLowerCase();
  if (k === ' ') { event.preventDefault(); bloom(); }
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
  const e = new RingsLuminaEngine(host.value, { reducedMotion: reduced, onIntroDone: () => toYear(2800) });
  e.setData(props.years, props.selected, props.finaleText);
  engine.value = e;
  if (reduced) toYear(2800);
  observer = new IntersectionObserver(entries => { visible = entries.some(entry => entry.isIntersecting); sync(); });
  observer.observe(host.value);
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('keydown', onKey);
  sync();
});
onActivated(() => { active = true; window.addEventListener('keydown', onKey); sync(); });
onDeactivated(() => { active = false; window.removeEventListener('keydown', onKey); sync(); });
onBeforeUnmount(() => {
  window.clearTimeout(timer);
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

defineExpose({
  /** 截一帧给分享图（像素，不含任何原始数据）。 */
  capture: (width: number, height: number) => engine.value?.capture(width, height) ?? null,
  /** 还在飞入 / 年份数字时先落成年轮，等粒子聚拢再截（截到半路是一团散沙）。 */
  settle: async () => {
    if (!engine.value || stage.value === 'shape' || stage.value === 'finale') return;
    toShape();
    await new Promise(resolve => window.setTimeout(resolve, 1800));
  },
  stage,
});
</script>

<template>
  <div class="rings-stage">
    <div ref="host" class="stage-canvas" />
    <div class="stage-ui">
      <Transition name="flash"><div v-if="stage === 'finale'" :key="flash" class="finale-flash" /></Transition>
      <div class="hint-row">
        <Transition name="hint" mode="out-in">
          <div :key="stage" class="hint">{{ hint(stage) }}</div>
        </Transition>
      </div>
      <div class="keys">
        <div>{{ t.keys }}</div>
        <div>{{ t.mouse }}</div>
      </div>
      <div class="stage-actions">
        <button v-if="stage === 'shape' || stage === 'year'" type="button" class="stage-button" @click="bloom">{{ t.bloom }}</button>
        <button v-else-if="stage === 'finale'" type="button" class="stage-button" @click="toShape">{{ t.backToRings }}</button>
        <button type="button" class="stage-button quiet" @click="replay">{{ t.replay }}</button>
      </div>
    </div>
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
.keys { position: absolute; bottom: 24px; left: 24px; padding: 10px 16px; border-radius: 10px; background: rgba(0, 0, 0, .25);
  color: rgba(255, 255, 255, .45); font-size: .8rem; line-height: 1.6; }
.stage-actions { position: absolute; right: 24px; bottom: 24px; display: flex; gap: 10px; pointer-events: auto; }
.stage-button { padding: 8px 18px; border: 1px solid rgba(255, 255, 255, .18); border-radius: 999px; cursor: pointer;
  background: linear-gradient(135deg, rgba(255, 226, 150, .22), rgba(255, 200, 120, .08)); color: rgba(255, 244, 220, .95);
  font: inherit; font-size: .9rem; backdrop-filter: blur(12px); }
.stage-button:hover { background: linear-gradient(135deg, rgba(255, 226, 150, .34), rgba(255, 200, 120, .14)); }
.stage-button.quiet { background: rgba(255, 255, 255, .06); color: rgba(255, 255, 255, .7); }
@media (max-width: 720px) {
  .keys { display: none; }
  .hint { font-size: 1rem; padding: .6rem 1.4rem; }
}
</style>
