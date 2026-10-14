<script setup lang="ts">
/*
 * 新手引导的聚光框 + 玻璃说明卡（状态在 composables/useTour.ts）。
 *
 * 10-13 重做（用户录屏：框乱跳、说明卡满屏飞、点「下一步」点空、动效一点都不丝滑）：
 * - 压暗是一张整屏 SVG，挖一个圆角洞（以前是 200vmax 的超大阴影，一层上万像素见方的纹理，挪一下就整屏重画）。
 *   换步时洞从上一处**缓入缓出**地挪到下一处（一条 520ms 的 ease-in-out），没有目标就收拢成一个点、整屏压暗。
 * - 说明卡不再在屏幕上滑来滑去：换步先淡出，新位置量好后在那里淡入（像页面切换的渐出渐入）。
 *   卡在原地不动时才能稳稳点到；指针停在卡上时，滚动引起的重量也先不挪它。
 * - 可以上手的步骤（换主题、拨语言、翻牌拖牌、点舞台上的牌）：洞里的点击直接落到页面上，洞外照旧挡住。
 * Esc 跳过（经 onMotionEscape 排在最前），← → 翻步。prefers-reduced-motion 下一律直接落位。
 */
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { useTour, type TargetBox } from '../../composables/useTour';
import { inSandbox } from '../../lib/tour/sandbox';
import { useTourText } from './tour.i18n';
import { autoSupported } from '../../composables/ai/useAutoHandoff';
import { withPlatformKeys } from '../../lib/platformKeys';
import { onMotionEscape } from '../../lib/motion/interrupt';

const t = useTourText();
const { active, box, settling, current, next, prev, skip } = useTour();
const sandbox = inSandbox();

const card = ref<HTMLElement | null>(null);
const cardSize = ref({ width: 360, height: 160 });
const viewport = ref({ width: window.innerWidth, height: window.innerHeight });
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/* ---------- 说明卡上的字：只在卡藏起来的时候换（淡出途中不换字，不出现「旧卡新字」那一帧） ---------- */
type Snap = NonNullable<typeof current.value>;
const snap = shallowRef<Snap | null>(null);
type StepCopy = Record<string, string>;
const text = computed(() => {
  const now = snap.value;
  if (!now) return '';
  const copy = t.value.steps[now.chapter] as StepCopy;
  let line = copy[`s${now.step + 1}`] ?? '';
  // 交给 AI 第 3 步的后半句讲「全自动」开关：只有 Windows 有那个开关，别的系统不说。
  if (now.chapter === 'handoff' && now.step === 2 && copy.s3Auto && autoSupported()) {
    line += /[\u3000-\u9fff]$/.test(line) ? copy.s3Auto : ` ${copy.s3Auto}`;
  }
  return withPlatformKeys(line);
});
const title = computed(() => (snap.value ? t.value.chapter[snap.value.chapter] : ''));
/** 只有一步的就地提示：只给一个「知道了」。 */
const single = computed(() => snap.value?.mode === 'inline' && snap.value.total === 1);

/* ---------- 聚光框：画出来的那一个洞（补间到 box） ---------- */
interface Hole { x: number; y: number; w: number; h: number }
const hole = shallowRef<Hole | null>(null);
const HOLE_MS = 520;
const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
let tweenFrame = 0;
const holeOf = (target: TargetBox | null): Hole => (target
  ? { x: target.x, y: target.y, w: target.width, h: target.height }
  : { x: viewport.value.width / 2, y: viewport.value.height / 2, w: 0, h: 0 });
const tweenHole = (to: Hole) => {
  cancelAnimationFrame(tweenFrame);
  const from = hole.value;
  if (!from || reduced()) { hole.value = to; return; }
  const started = performance.now();
  const step = (now: number) => {
    const p = Math.min(1, (now - started) / HOLE_MS);
    const k = easeInOut(p);
    hole.value = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, w: from.w + (to.w - from.w) * k, h: from.h + (to.h - from.h) * k };
    if (p < 1) tweenFrame = requestAnimationFrame(step);
  };
  tweenFrame = requestAnimationFrame(step);
};

const roundRect = (h: Hole) => {
  const r = Math.min(16, h.w / 2, h.h / 2);
  const { x, y, w, h: hh } = h;
  return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + hh - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + hh}`
    + `H${x + r}A${r} ${r} 0 0 1 ${x} ${y + hh - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
};
const dimPath = computed(() => {
  const { width: vw, height: vh } = viewport.value;
  const h = hole.value;
  const outer = `M0 0H${vw}V${vh}H0Z`;
  return h && h.w > 1 && h.h > 1 ? `${outer}${roundRect(h)}` : outer;
});
const ringPath = computed(() => (hole.value && hole.value.w > 1 && hole.value.h > 1 ? roundRect(hole.value) : ''));

/** 洞外挡住点击：可以上手的步骤挡四块（洞里落到页面上），其余整屏挡。 */
const blockers = computed(() => {
  const h = hole.value;
  const { width: vw, height: vh } = viewport.value;
  if (!snap.value?.interactive || !box.value || !h || h.w < 2 || settling.value) return [{ left: 0, top: 0, width: vw, height: vh }];
  return [
    { left: 0, top: 0, width: vw, height: Math.max(0, h.y) },
    { left: 0, top: h.y + h.h, width: vw, height: Math.max(0, vh - h.y - h.h) },
    { left: 0, top: h.y, width: Math.max(0, h.x), height: h.h },
    { left: h.x + h.w, top: h.y, width: Math.max(0, vw - h.x - h.w), height: h.h },
  ];
});

/* ---------- 说明卡的位置 ---------- */
const GAP = 14;
const EDGE = 16;
const placeFor = (target: TargetBox | null) => {
  const { width: vw, height: vh } = viewport.value;
  const { width, height } = cardSize.value;
  if (!target) return { x: (vw - width) / 2, y: (vh - height) / 2 };
  const x = Math.min(Math.max(target.x + target.width / 2 - width / 2, EDGE), vw - width - EDGE);
  const below = target.y + target.height + GAP;
  const above = target.y - GAP - height;
  if (below + height <= vh - EDGE) return { x, y: below };
  if (above >= EDGE) return { x, y: above };
  // 上下放不下：先放到旁边（可以上手的那一块不该被卡挡住），竖直方向对着目标中间。
  const y = Math.min(Math.max(target.y + target.height / 2 - height / 2, EDGE), vh - height - EDGE);
  if (target.x + target.width + GAP + width <= vw - EDGE) return { x: target.x + target.width + GAP, y };
  if (target.x - GAP - width >= EDGE) return { x: target.x - GAP - width, y };
  // 四周都放不下（目标几乎占满一屏）：贴在目标里面靠下。
  return { x, y: Math.max(EDGE, Math.min(target.y + target.height - height - GAP, vh - height - EDGE)) };
};
const cardAt = ref({ x: 0, y: 0 });
const cardShown = ref(false);
/** 卡停着时位置要小挪（滚动、窗口变化）：滑过去；换步时在藏着的时候直接摆好。 */
const gliding = ref(false);
let hovering = false;
let pendingPlace = false;
let hideTimer = 0;
let showTimer = 0;

const placeNow = (glide: boolean) => {
  const at = placeFor(box.value);
  if (Math.abs(at.x - cardAt.value.x) < 1 && Math.abs(at.y - cardAt.value.y) < 1) return;
  gliding.value = glide && !reduced();
  cardAt.value = at;
};

/* 换步：卡先淡出，字在藏好之后再换。 */
watch(() => current.value?.index, (index, before) => {
  window.clearTimeout(hideTimer);
  window.clearTimeout(showTimer);
  if (index === undefined) { cardShown.value = false; snap.value = null; return; }
  if (before === undefined || !cardShown.value) { snap.value = current.value; return; }
  cardShown.value = false;
  hideTimer = window.setTimeout(() => { snap.value = current.value; }, reduced() ? 0 : 180);
});

/* 量好了（不再 settling）：洞挪过去，卡在新位置淡入。 */
watch([settling, box], ([busy, target], [wasBusy]) => {
  if (!active.value) return;
  if (busy) return;
  // 第一次没有旧洞可挪：从目标外面一圈收进来。
  if (!hole.value && target && !reduced()) hole.value = { x: target.x - 24, y: target.y - 24, w: target.width + 48, h: target.height + 48 };
  tweenHole(holeOf(target));
  if (wasBusy || !cardShown.value) {
    window.clearTimeout(showTimer);
    showTimer = window.setTimeout(() => {
      if (settling.value || !active.value) return;
      snap.value = current.value;
      placeNow(false);
      cardShown.value = true;
    }, reduced() ? 0 : 200);
    return;
  }
  // 同一步里目标挪了（滚动、窗口变化）：指针在卡上就先别挪，移开再说。
  if (hovering) { pendingPlace = true; return; }
  placeNow(true);
});

const onCardEnter = () => { hovering = true; };
const onCardLeave = () => {
  hovering = false;
  if (pendingPlace) { pendingPlace = false; placeNow(true); }
};

/* 每换一步把焦点放回说明卡上的主按钮：键盘用户不用找。 */
watch(cardShown, (shown) => {
  if (shown) card.value?.querySelector<HTMLElement>('[data-primary]')?.focus({ preventScroll: true });
});

/* 引导开始 / 结束：整层淡入；第一次没有旧洞可挪，从目标稍大一圈收进来。 */
watch(active, (now, before) => {
  if (now && !before) {
    hole.value = null;
    cardShown.value = false;
    snap.value = current.value;
  }
  if (!now) {
    cancelAnimationFrame(tweenFrame);
    hole.value = null;
  }
}, { immediate: true });

const onKey = (event: KeyboardEvent) => {
  if (!active.value) return;
  // Esc 不在这里：全局的动效打断、弹层都在更早的 window 捕获监听上，走 onMotionEscape 的 first 才排得到最前。
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    next();
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault();
    prev();
  } else if (event.key === 'Tab') {
    const buttons = [...(card.value?.querySelectorAll<HTMLElement>('button') ?? [])];
    if (!buttons.length) return;
    const index = buttons.indexOf(document.activeElement as HTMLElement);
    event.preventDefault();
    const step = event.shiftKey ? -1 : 1;
    buttons[(index + step + buttons.length) % buttons.length]?.focus();
  }
};
const onResize = () => { viewport.value = { width: window.innerWidth, height: window.innerHeight }; };

let observer: ResizeObserver | null = null;
watch(card, (el) => {
  observer?.disconnect();
  if (!el) return;
  observer = new ResizeObserver(([entry]) => {
    const rect = entry!.target.getBoundingClientRect();
    cardSize.value = { width: rect.width, height: rect.height };
    if (cardShown.value && !hovering) placeNow(true);
  });
  observer.observe(el);
});

let releaseEscape: (() => void) | null = null;
onMounted(() => {
  releaseEscape = onMotionEscape(() => {
    if (!active.value) return false;
    skip();
    return true;
  }, { first: true });
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', onResize);
});
onBeforeUnmount(() => {
  releaseEscape?.();
  window.removeEventListener('keydown', onKey, true);
  window.removeEventListener('resize', onResize);
  observer?.disconnect();
  cancelAnimationFrame(tweenFrame);
  window.clearTimeout(hideTimer);
  window.clearTimeout(showTimer);
});
</script>

<template>
  <div v-if="sandbox" class="tour-sample" :title="t.sampleHint" role="note">{{ t.sample }}</div>
  <Transition name="tour-fade">
    <div v-if="active" class="tour-layer">
      <svg class="tour-dim" :width="viewport.width" :height="viewport.height" aria-hidden="true">
        <path class="tour-shade" :d="dimPath" fill-rule="evenodd" />
        <path v-if="ringPath" class="tour-ring" :class="{ live: snap?.interactive }" :d="ringPath" />
      </svg>
      <div v-for="(b, i) in blockers" :key="i" class="tour-block" :style="{ left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px` }"></div>
      <div class="tour-card-pos" :class="{ gliding }" :style="{ transform: `translate(${cardAt.x}px, ${cardAt.y}px)` }">
        <section
          v-if="snap"
          ref="card"
          class="tour-card"
          :class="{ shown: cardShown }"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tour-card-title"
          aria-describedby="tour-card-text"
          @pointerenter="onCardEnter"
          @pointerleave="onCardLeave"
        >
          <header class="tour-head">
            <p id="tour-card-title" class="tour-title">{{ title }}</p>
            <span v-if="!single" class="tour-progress">{{ t.progress(snap.index + 1, snap.total) }}</span>
          </header>
          <p id="tour-card-text" class="tour-text">{{ text }}</p>
          <p v-if="snap.interactive && box" class="tour-try"><i aria-hidden="true"></i>{{ t.tryIt }}</p>
          <footer class="tour-actions">
            <template v-if="single">
              <button type="button" class="button primary" data-primary :disabled="!cardShown" @click="next">{{ t.gotIt }}</button>
            </template>
            <template v-else>
              <button type="button" class="tour-skip" @click="skip">{{ t.skip }}</button>
              <span class="tour-spacer"></span>
              <button v-if="!snap.first" type="button" class="button secondary" :disabled="!cardShown" @click="prev">{{ t.prev }}</button>
              <button type="button" class="button primary" data-primary :disabled="!cardShown" @click="next">{{ snap.last ? t.done : t.next }}</button>
            </template>
          </footer>
        </section>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.tour-layer { position: fixed; inset: 0; z-index: 9000; pointer-events: none; }
.tour-dim { position: fixed; inset: 0; overflow: visible; pointer-events: none; }
.tour-shade { fill: rgb(0 0 0 / .46); }
.tour-ring { fill: none; stroke: color-mix(in srgb, var(--accent) 70%, transparent); stroke-width: 2; }
/* 可以上手的那一圈亮一点、粗一点：一眼看得出「这里能动」。 */
.tour-ring.live { stroke: var(--accent); stroke-width: 2.5; filter: drop-shadow(0 0 10px color-mix(in srgb, var(--accent) 45%, transparent)); }
.tour-block { position: fixed; pointer-events: auto; }
.tour-card-pos { position: fixed; top: 0; left: 0; pointer-events: none; }
.tour-card-pos.gliding { transition: transform 360ms cubic-bezier(.45, 0, .2, 1); }
.tour-card {
  width: min(360px, calc(100vw - 32px));
  padding: 16px 18px 14px;
  border: 1px solid var(--mat-glass-line);
  border-radius: var(--radius-md);
  background: var(--mat-glass-strong);
  box-shadow: var(--mat-glass-shadow);
  backdrop-filter: blur(18px) saturate(1.2);
  color: var(--ink);
  opacity: 0;
  transform: translateY(8px) scale(.97);
  pointer-events: none;
  /* 渐出：快一点、往下沉一点；渐入：缓入缓出、稍晚一拍（洞先挪到位）。 */
  transition: opacity 180ms cubic-bezier(.4, 0, 1, 1), transform 180ms cubic-bezier(.4, 0, 1, 1);
}
.tour-card.shown {
  opacity: 1;
  transform: none;
  pointer-events: auto;
  transition: opacity 340ms cubic-bezier(.2, .7, .2, 1), transform 420ms cubic-bezier(.2, .8, .2, 1);
}
.tour-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 6px; }
.tour-title { margin: 0; color: var(--accent); font-size: var(--fs-xs); font-weight: 700; letter-spacing: .04em; }
.tour-progress { margin-left: auto; color: var(--subtle); font-family: var(--font-mono); font-size: var(--fs-2xs); }
.tour-text { margin: 0 0 14px; font-size: var(--fs-md); line-height: 1.55; }
.tour-try { display: flex; align-items: center; gap: 8px; margin: -6px 0 12px; color: var(--accent); font-size: var(--fs-xs); font-weight: 650; }
.tour-try i { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 22%, transparent); }
.tour-actions { display: flex; align-items: center; gap: 8px; }
.tour-spacer { flex: 1; }
.tour-skip { padding: 6px 4px; border: 0; background: none; color: var(--muted); font: inherit; font-size: var(--fs-sm); cursor: pointer; }
.tour-skip:hover { color: var(--ink); }
.tour-skip:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: 6px; }
.tour-sample {
  /* 压在引导层下面：说明卡贴到左下角时字不会被它挡住（引导期间它被压暗，但仍看得见）。 */
  position: fixed; left: 16px; bottom: 16px; z-index: 8999;
  padding: 5px 12px; border: 1px solid var(--mat-glass-line); border-radius: 999px;
  background: var(--mat-glass-strong); box-shadow: var(--mat-glass-shadow);
  color: var(--accent); font-size: var(--fs-xs); font-weight: 700; letter-spacing: .06em;
  pointer-events: none;
}
.tour-fade-enter-active { transition: opacity 360ms cubic-bezier(.2, .7, .2, 1); }
.tour-fade-leave-active { transition: opacity 260ms ease; }
.tour-fade-enter-from, .tour-fade-leave-to { opacity: 0; }
@media (max-width: 760px) { .tour-sample { bottom: 86px; } }
@media (prefers-reduced-motion: reduce) {
  .tour-card, .tour-card.shown, .tour-card-pos.gliding { transition: none; }
  .tour-fade-enter-active, .tour-fade-leave-active { transition: none; }
}
</style>
