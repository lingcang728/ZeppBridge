/**
 * 台前调度的手势判定（纯函数）：拖动从哪一刻算起、松手落在哪、拖边 / 拖角之后组的比例、整组宽和卡高变成多少。
 */
import { GAP, MIN_H, ratioPresets, ratioRange, SPAN_MIN, SPLIT_MIN, SPLIT_PRESETS, STRIP_W, type Rect, type SideRole, type Sides } from './layout';
import { COLUMN_SNAP, FULL_SNAP, GRID_SNAP, ROW_SNAP, TOP_SNAP, type SizePatch } from './state';

/** 按下后移动超过这么多像素才算拖（不到就是点击）。 */
export const DRAG_SLOP = 6;
export const passedSlop = (dx: number, dy: number): boolean => Math.hypot(dx, dy) >= DRAG_SLOP;

export type Drop = { kind: 'strip' } | { kind: 'stage'; index: number; onto: string | null } | { kind: 'none' };

/**
 * 松手的位置（画布坐标）落在哪：左边侧栏那一条 → 收进侧栏；舞台上某张卡上 → 那张的位置（拖来的卡换到那儿）；
 * 舞台空白处 → 按左右半边插在最前或最后。
 */
export const dropAt = (
  point: { x: number; y: number },
  canvas: { width: number; height: number; stageX: number; narrow: boolean },
  stage: ReadonlyArray<{ id: string } & Rect>,
  dragging: string,
): Drop => {
  if (point.x < 0 || point.y < -40 || point.x > canvas.width || point.y > canvas.height + 40) return { kind: 'none' };
  if (!canvas.narrow && point.x < Math.max(canvas.stageX, STRIP_W) - 8) return { kind: 'strip' };
  if (canvas.narrow && point.x < 40) return { kind: 'strip' };
  const others = stage.filter((r) => r.id !== dragging);
  const hit = others.findIndex((r) => point.x >= r.x && point.x <= r.x + r.w && point.y >= r.y && point.y <= r.y + r.h);
  if (hit >= 0) return { kind: 'stage', index: stage.findIndex((r) => r.id === others[hit].id), onto: others[hit].id };
  const mid = canvas.stageX + (canvas.width - canvas.stageX) / 2;
  return { kind: 'stage', index: point.x < mid ? 0 : stage.length, onto: null };
};

/** 往里拖到起始宽度的这一成以下就收进侧栏（iPad：全屏卡从右下角往回拽就缩回去）。 */
export const TUCK_RATIO = 0.55;
/** 离预设档这么近就吸过去（无级，但常用的几档好对准）。 */
export const MAGNET = 0.015;

/**
 * 能拖的地方（2026-11-13 用户：左右下三边 + 两个下角，顶边挂在舞台顶线上）。
 * 角 = 那一侧的边 + 下边一起。
 */
export type Handle = 'left' | 'right' | 'bottom' | 'bl' | 'br';
export const HANDLES: readonly Handle[] = ['left', 'right', 'bottom', 'bl', 'br'];
/** 这个把手动的是哪一侧（没有 = 只动高）。 */
export const handleSide = (handle: Handle): 'left' | 'right' | null =>
  handle === 'left' || handle === 'bl' ? 'left' : handle === 'right' || handle === 'br' ? 'right' : null;
export const handleVertical = (handle: Handle): boolean => handle === 'bottom' || handle === 'bl' || handle === 'br';

export interface ResizeContext {
  /** 舞台上几张、拖的是第几张、组的档（3 张时分主卡在左 / 右 / 上，1 张时 2 = 全屏）。 */
  count: number; index: number; snap: number;
  id: string;
  sides: Sides;
  /** 侧栏占着时舞台的可用宽（全屏时也按这个算比例：退出全屏侧栏就回来了）。 */
  avail: number;
  /** 整个画布宽。 */
  width: number;
  /** 按下时整组的宽（两三张）。 */
  groupW: number;
  /** 按下时这张卡的宽、高（排版像素）。 */
  startW: number; startH: number;
  /** 舞台高（卡最高拉到这么高）。 */
  maxH: number;
  /** 按下时 4 张「上一下三」下面一排两条缝的位置（layout.splitsOf）。 */
  splits?: readonly [number, number];
}

/** 这张卡宽 w 时组的比例（组宽 groupW）；null = 这张卡的宽不决定比例（「主卡在上」那张占整行）。 */
export const ratioFor = (c: Pick<ResizeContext, 'count' | 'index' | 'snap' | 'avail'> & { groupW?: number }, w: number): number | null => {
  if (c.count === 1) return w / Math.max(1, c.avail);
  if (c.count === 3 && c.snap === TOP_SNAP && c.index === 0) return null;
  // 4 张上一下三：主卡占整行、下面三张拖的是缝的位置（splitOutcome），都不走比例。
  if (c.count === 4 && c.snap === ROW_SNAP) return null;
  const share = w / Math.max(1, (c.groupW ?? c.avail) - GAP);
  // 决定比例的是左边那张（2 张）/ 大卡（3 张左右排、4 张左大右三）/ 下面左边那张（主卡在上）/ 左列（田字）。
  if (c.count === 4 && c.snap === GRID_SNAP) return c.index % 2 === 0 ? share : 1 - share;
  if (c.count === 4 && c.snap === COLUMN_SNAP) return c.index === 0 ? share : 1 - share;
  const lead = c.count === 3 && c.snap === TOP_SNAP ? 1 : 0;
  return c.index === lead ? share : 1 - share;
};

/**
 * 4 张上一下三拖下面一排的缝：右边沿动第 index-1 条，左边沿动第 index-2 条（主卡是 0 号）；
 * 每张最窄 SPLIT_MIN，靠近 1/3、1/2、2/3 吸一下。
 */
const splitOutcome = (c: ResizeContext, side: 'left' | 'right', grow: number): Resize => {
  const cuts: [number, number] = [...(c.splits ?? [1 / 3, 2 / 3])];
  const k = side === 'right' ? c.index - 1 : c.index - 2;
  if (k < 0 || k > 1) return { kind: 'none' };
  const row = Math.max(1, c.groupW - 2 * GAP);
  const raw = cuts[k] + (side === 'right' ? grow : -grow) / row;
  const [lo, hi] = k === 0 ? [SPLIT_MIN, cuts[1] - SPLIT_MIN] : [cuts[0] + SPLIT_MIN, 1 - SPLIT_MIN];
  cuts[k] = magnet(Math.min(hi, Math.max(lo, raw)), SPLIT_PRESETS);
  return { kind: 'size', patch: { splits: cuts } };
};

const magnet = (value: number, presets: readonly number[]): number =>
  presets.find((preset) => Math.abs(preset - value) <= MAGNET) ?? value;

export type Resize = { kind: 'size'; patch: SizePatch } | { kind: 'tuck' } | { kind: 'full' } | { kind: 'none' };

/** 一条边往外拖了 grow（像素，往外为正）之后的横向结果。 */
const horizontal = (c: ResizeContext, role: SideRole, grow: number, side: 'left' | 'right'): Resize => {
  const full = c.count === 1 && c.snap === FULL_SNAP;
  // 只看指针本身走了多远：往里拽过这张卡宽的四成五就收进侧栏。
  const pointerW = role === 'sym' ? c.startW + 2 * grow : c.startW + grow;
  if (pointerW < c.startW * TUCK_RATIO) return { kind: 'tuck' };
  if (role === 'sym') {
    if (!full && pointerW > c.avail + 48) return { kind: 'full' };
    if (full && pointerW >= c.width - 24) return { kind: 'none' };
    const [lo, hi] = ratioRange(1, 0);
    return { kind: 'size', patch: { ratio: magnet(Math.min(hi, Math.max(lo, pointerW / Math.max(1, c.avail))), ratioPresets(1, 0)) } };
  }
  if (role === 'seam') {
    if (c.count === 4 && c.snap === ROW_SNAP) return splitOutcome(c, side, grow);
    const raw = ratioFor(c, pointerW);
    if (raw == null) return { kind: 'none' };
    const [lo, hi] = ratioRange(c.count, c.snap);
    return { kind: 'size', patch: { ratio: magnet(Math.min(hi, Math.max(lo, raw)), ratioPresets(c.count, c.snap)) } };
  }
  // 最外侧：整组居中，两边一起长。
  const span = (c.groupW + 2 * grow) / Math.max(1, c.avail);
  const clamped = Math.min(1, Math.max(SPAN_MIN, span));
  return { kind: 'size', patch: { span: clamped > 1 - MAGNET * 2 ? 1 : Math.round(clamped * 1000) / 1000 } };
};

/**
 * 拖把手 dx / dy（指针位移，排版像素）之后的结果：收进侧栏 / 全屏 / 新的比例、整组宽、这张卡的高。
 * 拖动中每帧都调它，算出的状态直接拿去排版（预览 = 真排版），松手提交同一份 → 零跳变。
 */
export const resizeOutcome = (c: ResizeContext, handle: Handle, dx: number, dy: number): Resize => {
  const side = handleSide(handle);
  let patch: SizePatch = {};
  if (side) {
    const role = c.sides[side];
    const grow = side === 'right' ? dx : -dx;
    const out = horizontal(c, role, grow, side);
    if (out.kind === 'tuck' || out.kind === 'full') return out;
    if (out.kind === 'size') patch = { ...out.patch };
  }
  if (handleVertical(handle)) {
    const h = Math.round(Math.min(c.maxH, Math.max(MIN_H, c.startH + dy)));
    patch.heights = { [c.id]: h };
  }
  return Object.keys(patch).length ? { kind: 'size', patch } : { kind: 'none' };
};
