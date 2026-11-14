/**
 * 界面缩放（80–125%）切换过渡的纯函数部分（composables/useUiScale.ts 用）。
 *
 * 原生缩放（webview setZoom）没法逐帧插值，所以过渡是「连续缩放再落定」：先给 body 做
 * transform: scale(目标 / 已生效倍率)，放完再真改倍率，生效那一帧撤掉 transform；
 * 重排造成的换行差异由一块冻结的旧画面（幽灵板）用很短的淡出盖住。
 * 这里只放算术：插值起止、时长、从计算样式读回当前位置、幽灵板几何。
 */
import { OPEN_EASE, paced } from './motion/timing';

/** 一次完整的缩放（任意两档之间）的时长；短距离按比例缩短，但不短于 MIN。 */
export const ZOOM_MS = paced(320);
export const ZOOM_MIN_MS = paced(180);
/** 和卡 ↔ 页展开同一条曲线（10-03 用户认可的 iOS 节奏）：后半程长长地减速落定，不回弹。 */
export const ZOOM_EASE = OPEN_EASE;
/** 落定那一下的交叉淡出（幽灵板 → 真页面）。 */
export const ZOOM_SETTLE_MS = 120;
/** 等原生缩放真生效（resize）的兜底：超过这么久就当它已经生效。 */
export const ZOOM_COMMIT_TIMEOUT_MS = 400;

/** 最大跨度（80% ↔ 125%）的对数距离：时长按这个归一。 */
const FULL_SPAN = Math.log(125 / 80);

/** 从 getComputedStyle(el).transform 读回当前的等比缩放（none / 解析不了 → 1）。 */
export const scaleFromTransform = (transform: string | null | undefined): number => {
  if (!transform || transform === 'none') return 1;
  const matrix = transform.match(/^matrix\(([^)]+)\)$/);
  if (matrix) {
    const [a, b] = matrix[1].split(',').map((part) => Number.parseFloat(part));
    const value = Math.hypot(a, b);
    return Number.isFinite(value) && value > 0 ? value : 1;
  }
  const matrix3d = transform.match(/^matrix3d\(([^)]+)\)$/);
  if (matrix3d) {
    const [a, b] = matrix3d[1].split(',').map((part) => Number.parseFloat(part));
    const value = Math.hypot(a, b);
    return Number.isFinite(value) && value > 0 ? value : 1;
  }
  const scale = transform.match(/^scale\(([^,)]+)/);
  if (scale) {
    const value = Number.parseFloat(scale[1]);
    return Number.isFinite(value) && value > 0 ? value : 1;
  }
  return 1;
};

export interface ZoomLeg {
  /** body 上 transform 的起点缩放（相对已生效倍率）。 */
  from: number;
  /** 终点缩放（目标倍率 / 已生效倍率）。 */
  to: number;
  durationMs: number;
}

/**
 * 从「当前画面上的缩放」走到目标倍率的一段。
 * `applied` 是已生效的倍率（原生 / CSS zoom），`current` 是 body 此刻的 transform 缩放（没在动就是 1），
 * `target` 是新目标倍率。连点 / 连按时 current 是半路的计算值：从那里接着走，不从头放。
 */
export const zoomLeg = (applied: number, current: number, target: number): ZoomLeg => {
  const to = target / applied;
  const from = current > 0 && Number.isFinite(current) ? current : 1;
  const distance = Math.abs(Math.log(to / from));
  const share = Math.min(1, distance / FULL_SPAN);
  const durationMs = distance < 1e-4 ? 0 : Math.round(ZOOM_MIN_MS + (ZOOM_MS - ZOOM_MIN_MS) * Math.sqrt(share));
  return { from: round(from), to: round(to), durationMs };
};

/**
 * 幽灵板（冻结的旧画面）在新倍率下的几何。旧画面按旧倍率排版、最后一帧被 transform 放大了
 * ratio = 新 / 旧 倍；落定后同一块画面要在新倍率下原样出现：盒子宽高是旧视口（= 新视口 × ratio），
 * 不再叠 transform，顶边对齐、水平居中（与 transform-origin 一致）。百分比相对视口（position: fixed）。
 */
export const ghostBox = (ratio: number): { width: string; height: string; marginLeft: string } => {
  const r = round(ratio);
  return {
    width: `calc(100% * ${r})`,
    height: `calc(100% * ${r})`,
    marginLeft: `calc(-50% * ${r})`,
  };
};

/** 倍率是否已经在这一档（浮点容差）。 */
export const sameZoom = (a: number, b: number): boolean => Math.abs(a - b) < 1e-4;

const round = (value: number) => Number(value.toFixed(5));
