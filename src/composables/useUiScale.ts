import { computed, readonly, ref } from 'vue';
import { isDesktop } from '../lib/bridge';
import { lessMotion } from '../lib/motion/lessMotion';
import { captureZoomGhost, type ZoomGhost } from '../lib/motion/zoomGhost';
import { sameZoom, scaleFromTransform, ZOOM_COMMIT_TIMEOUT_MS, ZOOM_EASE, zoomLeg } from '../lib/uiZoom';

export const UI_SCALES = [80, 90, 100, 110, 125] as const;
export type UiScale = (typeof UI_SCALES)[number];

// 默认使用 100%：通过字号 token 放大 DOM 和图表文字，避免整体 zoom 影响图表指针坐标。
// 界面缩放选项、快捷键和已保存的用户选择仍然有效，需要时可以调整整体大小。
export const DEFAULT_UI_SCALE: UiScale = 100;

const STORAGE_KEY = 'zeppbridge-ui-scale';
const scale = ref<UiScale>(DEFAULT_UI_SCALE);
let initialized = false;

const isUiScale = (value: number): value is UiScale =>
  (UI_SCALES as readonly number[]).includes(value);

const readScale = (): UiScale => {
  if (typeof window === 'undefined') return DEFAULT_UI_SCALE;
  const saved = Number(window.localStorage.getItem(STORAGE_KEY));
  return isUiScale(saved) ? saved : DEFAULT_UI_SCALE;
};

const applyCssZoom = (factor: number) => {
  const root = document.documentElement;
  root.style.zoom = factor === 1 ? '' : String(factor);
  root.style.setProperty('--ui-scale', String(factor));
};

/*
 * 桌面端走 webview 原生缩放（等同浏览器 Ctrl +/-）。根元素 CSS zoom 会让
 * getBoundingClientRect 返回已缩放的像素，再当 CSS px 写回就被缩两次——
 * 80% 时主题菜单、导航滑块、日期弹层全部错位。原生缩放下坐标系是一套，
 * 这一类问题从根上消失。浏览器预览没有 webview API，才退回 CSS zoom。
 */
let nativeBroken = false;
const useNative = () => isDesktop() && !nativeBroken;

/** 真改倍率。`done` 在新倍率真生效的那一刻调（原生：resize 那一帧；CSS zoom：立即）。 */
const applyFactor = (factor: number, done: () => void = () => undefined) => {
  if (!useNative()) {
    applyCssZoom(factor);
    done();
    return;
  }
  applyCssZoom(1);
  void import('@tauri-apps/api/webview')
    .then(({ getCurrentWebview }) => getCurrentWebview().setZoom(factor))
    .catch(() => {
      nativeBroken = true;
      applyCssZoom(factor);
      done();
    });
};

/*
 * 切换过渡：「连续缩放再落定」。原生缩放没法逐帧插值，所以先给 body 做
 * transform: scale(目标 / 已生效倍率)（视口顶边居中为原点：body 铺满视口、自己不滚，
 * 滚动在里面的 #main-content，顶边那一行内容放大前后都钉在顶上，和原生缩放保留 scrollTop 一致），
 * 放完再真改倍率；生效那一帧（resize 回调里，绘制之前）撤掉 transform，同时把改之前拍下的
 * 旧画面（lib/motion/zoomGhost.ts）盖上去淡出，盖住重排带来的换行差异。
 *
 * 连点 / 拖动 / Ctrl ± 连按：放的途中换目标，从 body 此刻的计算缩放接着走（不从头放、
 * 不倒放已放完的动画）；改倍率在途（等 resize）时来的目标先记下，落定后从新倍率接着走。
 * 减弱动效（系统设置或低特效）直接切。
 */
let applied = 1;
let leg: Animation | null = null;
let committing = false;
let queued: number | null = null;
let ghost: ZoomGhost | null = null;

const clearBody = () => {
  const style = document.body?.style;
  if (!style) return;
  style.removeProperty('transform-origin');
  style.removeProperty('will-change');
};

const cancelLeg = () => {
  leg?.cancel();
  leg = null;
  clearBody();
};

/** 等原生倍率真生效：视口 CSS 尺寸或 DPR 变了就算；resize 不来就兜底超时。只调 `land` 一次。 */
const whenZoomLands = (land: () => void) => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const dpr = window.devicePixelRatio;
  let landed = false;
  let timer = 0;
  const finish = () => {
    if (landed) return;
    landed = true;
    window.removeEventListener('resize', onResize);
    window.clearTimeout(timer);
    land();
  };
  /* resize 在渲染更新里、样式 / 布局 / 绘制之前派发：在这里撤 transform，新倍率的第一帧就是落定后的样子。 */
  const onResize = () => {
    if (window.innerWidth !== width || window.innerHeight !== height || window.devicePixelRatio !== dpr) finish();
  };
  window.addEventListener('resize', onResize);
  timer = window.setTimeout(finish, ZOOM_COMMIT_TIMEOUT_MS);
  return finish;
};

const commit = (factor: number) => {
  if (sameZoom(factor, applied)) {
    cancelLeg();
    return;
  }
  committing = true;
  ghost?.dispose();
  const shot = captureZoomGhost(factor / applied);
  let settled = false;
  const land = () => {
    if (settled) return;
    settled = true;
    cancelLeg();
    applied = factor;
    committing = false;
    ghost = shot;
    shot?.reveal();
    if (queued !== null) {
      const next = queued;
      queued = null;
      transition(next);
    }
  };
  if (useNative()) {
    const landNow = whenZoomLands(land);
    applyFactor(factor, landNow);
  } else {
    applyFactor(factor, land);
  }
};

function transition(factor: number) {
  if (committing) {
    queued = factor;
    return;
  }
  const body = document.body;
  if (!body || typeof body.animate !== 'function' || lessMotion()) {
    cancelLeg();
    ghost?.dispose();
    ghost = null;
    if (!sameZoom(factor, applied)) {
      applied = factor;
      applyFactor(factor);
    }
    return;
  }
  /* 先读此刻的计算缩放，再撤旧的一段：从画面上的位置接着走。 */
  const current = leg ? scaleFromTransform(getComputedStyle(body).transform) : 1;
  leg?.cancel();
  leg = null;
  const plan = zoomLeg(applied, current, factor);
  if (plan.durationMs === 0) {
    commit(factor);
    return;
  }
  body.style.transformOrigin = '50% 0';
  body.style.willChange = 'transform';
  const animation = body.animate(
    [{ transform: `scale(${plan.from})` }, { transform: `scale(${plan.to})` }],
    { duration: plan.durationMs, easing: ZOOM_EASE, fill: 'forwards' },
  );
  leg = animation;
  animation.finished.then(
    () => { if (leg === animation) commit(factor); },
    () => undefined,
  );
}

const applyScale = (value: UiScale, animate: boolean) => {
  if (typeof document === 'undefined') return;
  const factor = value / 100;
  if (animate) {
    transition(factor);
    return;
  }
  cancelLeg();
  applied = factor;
  applyFactor(factor);
};

const setScale = (value: UiScale) => {
  scale.value = value;
  if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, String(value));
  applyScale(value, true);
};

const bumpScale = (direction: 1 | -1) => {
  const index = UI_SCALES.indexOf(scale.value);
  const next = UI_SCALES[Math.min(UI_SCALES.length - 1, Math.max(0, index + direction))];
  if (next !== scale.value) setScale(next);
};

const resetScale = () => {
  if (scale.value !== DEFAULT_UI_SCALE) setScale(DEFAULT_UI_SCALE);
};

const initializeScale = () => {
  if (initialized) return;
  initialized = true;
  scale.value = readScale();
  applyScale(scale.value, false);
};

export const useUiScale = () => ({
  scale: readonly(scale),
  scaleLabel: computed(() => `${scale.value}%`),
  initializeScale,
  setScale,
  bumpScale,
  resetScale,
});
