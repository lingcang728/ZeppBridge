/**
 * 台前调度的布局求解：给定舞台宽高、状态和每张卡的内容高，算出每张卡此刻画在哪、多大、斜多少。
 * 纯函数，不碰 DOM。
 *
 * 每张卡始终只有一个元素（StageWindow），位置全靠这里给的 Placement（transformOf 拼成 transform，原点左上角）；
 * w / h 是排版尺寸（内容按它折行），画出来的大小是 w·scale × h·scale。
 * 侧栏里的缩略卡就是真卡本身缩小——不拷贝，所以不会重放动画、图表也不重画。
 *
 * 两种排法（prefs.ts 的 StageView）：'stage' 台前调度；'classic' 老版两栏（概要、洞察通栏，下面主栏 + 侧栏），
 * 给不喜欢新版的人退回去用（2026-11-13 用户：这是实验性版本，必须允许回退）。
 */
import { FULL_SNAP, TOP_SNAP, type StageGroup, type StageState } from './state';

export const STRIP_W = 184;
export const THUMB_W = 132;
export const THUMB_X = 24;
export const GAP = 16;
/** 侧栏里组与组之间的空（2026-11-13 用户：名字胶囊压在卡上，名字去掉，靠斜着的卡本身认）。 */
export const STRIP_GAP = 16;
/** 舞台宽度低于这个就是窄窗口：舞台只放一张，组变成一叠，侧栏收成左边一条。 */
export const NARROW_W = 860;
/** 侧栏缩略卡的斜度（像 iPadOS 台前调度那样右缘明显往后退；曾是 18°，缩到 132px 宽后几乎看不出斜）。 */
export const TILT = 38;
export const PERSPECTIVE = 1100;
/** 侧栏里的缩略卡已经缩到 132px 宽：透视距离要近得多，斜着才看得出来。 */
export const STRIP_PERSPECTIVE = 280;
/** 卡在侧栏里的排版宽（没上过舞台的卡）。 */
export const DEFAULT_W = 560;
const DEFAULT_H = 360;
const PIP_W = 150;
const PIP_LAYOUT_W = 300;
/** 画中画离前卡边缘的距离。 */
const PIP_INSET = 10;
export const TAB_H = 44;
/** 老版两栏：画布宽于这个才分两栏（老版是视口 1180，这里量的是画布本身）。 */
export const CLASSIC_TWO_COL = 900;
/** 缩略卡最多露多高（宽的几成），再长的卡只露上半截、底下淡出。 */
const THUMB_CROP = 1.1;
/** 拖下边能拉到的最矮（排版像素）。最高是舞台高。 */
export const MIN_H = 160;
/** 两三张时整组最窄占舞台可用宽的几成。 */
export const SPAN_MIN = 0.5;

/** 单张：标准 / 宽 / 全屏（舞台宽的几成）。 */
export const SINGLE = [0.66, 0.84, 1] as const;
/** 两张：左右的比例。 */
export const PAIR = [[1, 1], [2, 1], [1, 2]] as const;

export type Mode = 'stage' | 'strip' | 'classic' | 'behind' | 'pip' | 'hidden';
/**
 * 舞台上一张卡左 / 右边拖起来管什么（2026-11-13 用户：左右下三边都能拖，顶边挂在舞台顶线上）：
 * sym = 单张居中，两边一起长；seam = 和邻居共用的那条缝，拖比例；outer = 整组最外侧，拖整组宽（整组居中）。
 */
export type SideRole = 'sym' | 'seam' | 'outer';
export interface Sides { left: SideRole; right: SideRole }
/** 老版两栏里卡排在哪：通栏 / 主栏 / 侧栏 / 哪栏矮放哪栏。 */
export type Column = 'full' | 'main' | 'side' | 'float';

export interface Placement {
  x: number; y: number; w: number; h: number;
  scale: number; tilt: number; z: number; opacity: number;
  mode: Mode;
  /** 窗口底部多留的滚动余量（窄窗口里画中画压在前卡右下角，最后几行要能滚出来）。 */
  pad?: number;
  /** 能拖边调大小时，左右两边各管什么（没有 = 不能调）。 */
  sides?: Sides;
  /** 缩略卡只露了上半截：底部淡出，别像被一刀切掉。 */
  crop?: boolean;
  /** 用户拉过下边：窗口高是拉的，内容按列排、能伸的（图表）吃掉多出来的高。 */
  fill?: boolean;
}
export interface Rect { x: number; y: number; w: number; h: number; pad?: number }

export interface LayoutInput {
  width: number;
  height: number;
  state: StageState;
  /** 能显示的卡，按注册表顺序。 */
  cards: readonly string[];
  /** 量到的内容高（按卡此刻的排版宽）。 */
  contentH: Readonly<Record<string, number>>;
  /** 卡上一次在舞台上的排版宽（侧栏沿用它，回舞台时少一次重排）。 */
  lastW: Readonly<Record<string, number>>;
  pip: ReadonlySet<string>;
  view?: 'stage' | 'classic';
  /** 老版两栏里每张卡的栏位（没写的进主栏）。 */
  columns?: Readonly<Record<string, Column>>;
  /** 自动隐藏的侧栏此刻被叫出来了（指针靠到左边缘 / 窄窗口点了边条）。 */
  stripOpen: boolean;
  /** 窄窗口：组里哪一张在最前面。 */
  front?: string;
}
export interface Layout {
  placements: Map<string, Placement>;
  narrow: boolean;
  classic: boolean;
  /** 侧栏在不在画面里（全屏 / 窄窗口时自动收起，叫出来才在）。 */
  stripShown: boolean;
  /** 侧栏平时就让开了（全屏 / 窄窗口）：左边缘该给一个能把它叫出来的把手。 */
  stripAuto: boolean;
  stageX: number;
  canvasH: number;
  /** 窄窗口里组的切换标签。 */
  tabs: string[];
}

/* ── 比例（拖边无级调，2026-11-13 用户：别跳回几个固定档） ──────────────── */

/** 1 张：占舞台宽的几成；2 张：左边那张的份额；3 张（左 / 右）：大卡的份额；3 张（在上）：下面左边那张的份额。 */
export const ratioRange = (count: number, snap: number): readonly [number, number] =>
  count === 1 ? [0.4, 1] : count === 2 ? [0.25, 0.75] : snap === TOP_SNAP ? [0.25, 0.75] : [0.4, 0.75];
export const defaultRatio = (count: number, snap: number): number => {
  if (count === 1) return SINGLE[Math.min(snap, 1)];
  if (count === 2) { const [a, b] = PAIR[snap] ?? PAIR[0]; return a / (a + b); }
  return 2 / 3;
};
/** 预设档：拖到附近吸一下（菜单里点档也回到它们）。 */
export const ratioPresets = (count: number, snap: number): number[] =>
  count === 1 ? [SINGLE[0], SINGLE[1], 1] : count === 2 ? PAIR.map(([a, b]) => a / (a + b)) : snap === TOP_SNAP ? [1 / 3, 1 / 2, 2 / 3] : [1 / 2, 2 / 3];
export const ratioOf = (g: StageGroup): number => {
  const [lo, hi] = ratioRange(g.ids.length, g.snap);
  return Math.min(hi, Math.max(lo, g.ratio ?? defaultRatio(g.ids.length, g.snap)));
};
/** 两三张时整组占可用宽的几成（单张不用它，单张的宽就是 ratio）。 */
export const spanOf = (g: StageGroup): number => (g.ids.length < 2 ? 1 : Math.min(1, Math.max(SPAN_MIN, g.span ?? 1)));

const r1 = (n: number) => Math.round(n * 10) / 10;
/** 用户拉过的高（拉过的优先于内容高）。 */
const pinned = (input: LayoutInput, id: string) => input.state.stage.heights?.[id];
/** 卡在舞台上的高：拉过就用拉的（夹在 MIN_H 和 hardCap 之间），没拉过按内容高（最多到 cap）。 */
const heightOf = (input: LayoutInput, id: string, cap: number, hardCap = cap) => {
  const user = pinned(input, id);
  if (user != null) return Math.min(hardCap, Math.max(Math.min(MIN_H, hardCap), user));
  return Math.min(cap, Math.max(120, input.contentH[id] ?? DEFAULT_H));
};
const at = (x: number, y: number, w: number, h: number, mode: Mode, z = 3): Placement => ({ x: r1(x), y: r1(y), w: r1(w), h: r1(h), scale: 1, tilt: 0, z, opacity: 1, mode });

type StageRect = Rect & { mode: Mode; sides?: Sides };

/** 舞台上那一组各自的矩形（舞台坐标，左上角 = 画布左上角）。 */
export const stageRects = (input: LayoutInput, narrow: boolean): Map<string, StageRect> => {
  const out = new Map<string, StageRect>();
  const g = input.state.stage;
  const { ids, snap } = g;
  const H = input.height;
  if (!ids.length) return out;
  if (narrow) {
    const front = ids.includes(input.front ?? '') ? input.front! : (ids.find((id) => !input.pip.has(id)) ?? ids[0]);
    const pips = ids.filter((id) => id !== front && input.pip.has(id));
    const top = ids.length - pips.length > 1 ? TAB_H : 0;
    // 画中画缩在前卡右下角（曾在右上角，压住力量卡那排统计的最后一格）；前卡底下留出同样高的滚动余量，
    // 滚到底时最后几行从它底下露出来。窄窗口不认拉过的高。
    const contentOf = (id: string, cap: number) => Math.min(cap, Math.max(120, input.contentH[id] ?? DEFAULT_H));
    const pipH = pips.map((id) => contentOf(id, H * 0.8));
    const pad = pips.length ? Math.max(...pipH) * (PIP_W / PIP_LAYOUT_W) + PIP_INSET * 2 : 0;
    const frontH = Math.min(H - top, Math.max(120, (input.contentH[front] ?? DEFAULT_H) + pad));
    out.set(front, { x: 0, y: top, w: input.width, h: frontH, mode: 'stage', pad: pad || undefined });
    for (const id of ids) {
      if (id === front) continue;
      const pip = pips.indexOf(id);
      if (pip >= 0) {
        const h = pipH[pip];
        out.set(id, { x: input.width - PIP_W - PIP_INSET, y: top + frontH - h * (PIP_W / PIP_LAYOUT_W) - PIP_INSET, w: PIP_LAYOUT_W, h, mode: 'pip' });
      } else out.set(id, { x: 0, y: top, w: input.width, h: contentOf(id, H - top), mode: 'behind' });
    }
    return out;
  }
  const full = ids.length === 1 && snap === FULL_SNAP;
  // 全屏时把侧栏叫出来：卡往右让开（2026-11-13 用户：别盖在卡上）。
  const x0 = full && !input.stripOpen ? 0 : STRIP_W;
  const avail = input.width - x0;
  const ratio = ratioOf(g);
  const stage = (x: number, y: number, w: number, h: number, left: SideRole, right: SideRole): StageRect =>
    ({ x, y, w, h, mode: 'stage', sides: { left, right } });
  if (ids.length === 1) {
    const w = full ? avail : Math.min(avail, Math.max(Math.min(avail, 360), avail * ratio));
    out.set(ids[0], stage(x0 + (avail - w) / 2, 0, w, heightOf(input, ids[0], H), 'sym', 'sym'));
    return out;
  }
  const groupW = avail * spanOf(g);
  const gx = x0 + (avail - groupW) / 2;
  const span = groupW - GAP;
  if (ids.length === 2) {
    const w1 = span * ratio;
    out.set(ids[0], stage(gx, 0, w1, heightOf(input, ids[0], H), 'outer', 'seam'));
    out.set(ids[1], stage(gx + w1 + GAP, 0, span - w1, heightOf(input, ids[1], H), 'seam', 'outer'));
    return out;
  }
  if (snap === TOP_SNAP) {
    // 主卡在上：占上面整行（内容高最多舞台高的六成，拉的最多八成），另两张在下面左右排；画布不够高就往下长，页面接着滚。
    const h0 = heightOf(input, ids[0], H * 0.6, H * 0.8);
    const y1 = h0 + GAP;
    const cap = Math.max(H - y1, H * 0.6);
    const w1 = span * ratio;
    out.set(ids[0], stage(gx, 0, groupW, h0, 'outer', 'outer'));
    out.set(ids[1], stage(gx, y1, w1, heightOf(input, ids[1], cap, H), 'outer', 'seam'));
    out.set(ids[2], stage(gx + w1 + GAP, y1, span - w1, heightOf(input, ids[2], cap, H), 'seam', 'outer'));
    return out;
  }
  // 三张：一大两小，小的上下叠在一列；主卡在左（0）或在右（1）。
  const mainW = span * ratio;
  const colW = span - mainW;
  const mainX = snap === 1 ? gx + colW + GAP : gx;
  const colX = snap === 1 ? gx : gx + mainW + GAP;
  const mainSides: [SideRole, SideRole] = snap === 1 ? ['seam', 'outer'] : ['outer', 'seam'];
  const colSides: [SideRole, SideRole] = snap === 1 ? ['outer', 'seam'] : ['seam', 'outer'];
  out.set(ids[0], stage(mainX, 0, mainW, heightOf(input, ids[0], H), ...mainSides));
  const cap = H - GAP;
  let [h1, h2] = [heightOf(input, ids[1], H), heightOf(input, ids[2], H)];
  if (h1 + h2 > cap) {
    // 拉过高的那张说了算，另一张让；都没拉过就照旧（矮的那张完整露出来）。
    const [p1, p2] = [pinned(input, ids[1]) != null, pinned(input, ids[2]) != null];
    if (p1 && !p2) h2 = Math.max(120, cap - h1);
    else if (p2 && !p1) h1 = Math.max(120, cap - h2);
    else if (h1 <= cap / 2) h2 = cap - h1;
    else if (h2 <= cap / 2) h1 = cap - h2;
    else [h1, h2] = [cap / 2, cap / 2];
  }
  out.set(ids[1], stage(colX, 0, colW, h1, ...colSides));
  out.set(ids[2], stage(colX, h1 + GAP, colW, h2, ...colSides));
  return out;
};

/** 缩略卡的排版尺寸：沿用上次在舞台上的宽，高最多到宽的 1.1（太长的卡只露上半截）。 */
const thumbBox = (input: LayoutInput, id: string, visualCap = Infinity) => {
  const w = input.lastW[id] ?? DEFAULT_W;
  const content = input.contentH[id] ?? DEFAULT_H;
  const h = Math.min(content, w * THUMB_CROP, (visualCap * w) / THUMB_W);
  return { w, h, crop: content > h + 1 };
};
/** 侧栏缩略卡画出来最矮多高：组多了先把每张压到这么高，还放不下才让各组互相压一点。 */
const THUMB_MIN_H = 56;

/**
 * 层次：舞台 200（画中画 210、叠在后面的 150）；侧栏 100 起，越往下的组越靠前——放不下互相压的时候，
 * 下一组盖住上一组的下半截，每组的上半截（标题那一行）都露着。窄窗口的侧栏叫出来时压在舞台上面（300 起）。
 */
const stripLayout = (input: LayoutInput, shown: boolean, zBase: number, placements: Map<string, Placement>) => {
  const groups = input.state.strip;
  if (!groups.length) return;
  const cap = Math.max(THUMB_MIN_H, (input.height - 8) / groups.length - STRIP_GAP);
  const slots = groups.map((g) => {
    const box = thumbBox(input, g.ids[0], cap);
    const scale = THUMB_W / box.w;
    return { box, scale, visual: box.h * scale + STRIP_GAP + (g.ids.length - 1) * 6 };
  });
  const total = slots.reduce((sum, slot) => sum + slot.visual, 0);
  // 放不下就让各组互相压一点（最后一组完整露出来），像一叠斜着的牌。
  const squeeze = total > input.height && groups.length > 1
    ? (input.height - slots[slots.length - 1].visual) / (total - slots[slots.length - 1].visual)
    : 1;
  let y = 8;
  groups.forEach((group, index) => {
    const slot = slots[index];
    const x = shown ? THUMB_X : -THUMB_W - 80;
    group.ids.forEach((id, depth) => {
      const box = depth === 0 ? slot.box : thumbBox(input, id, cap);
      const scale = THUMB_W / box.w;
      // 一组几张：后面的往右下错开一点、垫在下面，像一小叠牌。
      placements.set(id, {
        x: r1(x + depth * 7), y: r1(y + depth * 6), w: r1(box.w), h: r1(box.h), scale, tilt: TILT,
        z: zBase + index * 4 - depth, opacity: shown ? (depth === 0 ? 1 : 0.92) : 0, mode: 'strip', crop: box.crop || undefined,
      });
    });
    y += slot.visual * squeeze;
  });
};

/**
 * 老版两栏（「全部卡片」）：通栏的卡在上（概要、洞察），下面主栏 + 侧栏（侧栏 ≈ 老版 0.72fr : 1.4fr，最窄 310），
 * 「哪栏矮放哪栏」的卡最后排进较矮的那栏；画布窄就单栏。每张卡按内容全高，不截断，页面自己滚。
 */
const classicLayout = (input: LayoutInput, placements: Map<string, Placement>): number => {
  const W = input.width;
  const column = (id: string): Column => input.columns?.[id] ?? 'main';
  const two = W >= CLASSIC_TWO_COL;
  const sideW = two ? Math.max(310, ((W - GAP) * 0.72) / 2.12) : W;
  const mainW = two ? W - GAP - sideW : W;
  const put = (id: string, x: number, y: number, w: number) => {
    const h = Math.max(60, input.contentH[id] ?? DEFAULT_H);
    placements.set(id, { ...at(x, y, w, h, 'classic', 100) });
    return h + GAP;
  };
  let y = 0;
  for (const id of input.cards) if (column(id) === 'full') y += put(id, 0, y, W);
  const order = (c: Column) => input.cards.filter((id) => column(id) === c);
  if (!two) {
    for (const id of [...order('main'), ...order('side'), ...order('float')]) y += put(id, 0, y, W);
    return Math.max(0, y - GAP);
  }
  let mainY = y;
  let sideY = y;
  for (const id of order('main')) mainY += put(id, 0, mainY, mainW);
  for (const id of order('side')) sideY += put(id, mainW + GAP, sideY, sideW);
  for (const id of order('float')) {
    if (mainY <= sideY) mainY += put(id, 0, mainY, mainW);
    else sideY += put(id, mainW + GAP, sideY, sideW);
  }
  return Math.max(0, Math.max(mainY, sideY) - GAP);
};

export const solve = (input: LayoutInput): Layout => {
  const placements = new Map<string, Placement>();
  if (input.view === 'classic') {
    const canvasH = classicLayout(input, placements);
    return { placements, narrow: input.width < NARROW_W, classic: true, stripShown: false, stripAuto: false, stageX: 0, canvasH, tabs: [] };
  }
  const narrow = input.width < NARROW_W;
  const stage = stageRects(input, narrow);
  const full = input.state.stage.ids.length === 1 && input.state.stage.snap === FULL_SNAP;
  const stripAuto = narrow || full;
  const stripShown = !stripAuto || input.stripOpen;
  let canvasH = input.height;
  const tabs = narrow ? input.state.stage.ids.filter((id) => !input.pip.has(id)) : [];

  for (const [id, rect] of stage) {
    const z = rect.mode === 'pip' ? 210 : rect.mode === 'behind' ? 150 : 200;
    const p = at(rect.x, rect.y, rect.w, rect.h, rect.mode, z);
    if (rect.pad) p.pad = r1(rect.pad);
    if (rect.sides) p.sides = rect.sides;
    if (rect.mode === 'stage' && !narrow && input.state.stage.heights?.[id] != null) p.fill = true;
    if (rect.mode === 'pip') p.scale = PIP_W / PIP_LAYOUT_W;
    if (rect.mode === 'behind') p.opacity = 0;
    placements.set(id, p);
    canvasH = Math.max(canvasH, p.y + p.h);
  }
  stripLayout(input, stripShown, narrow ? 300 : 100, placements);
  for (const id of input.state.hidden) {
    const box = thumbBox(input, id);
    placements.set(id, { x: -THUMB_W - 80, y: 8, w: box.w, h: box.h, scale: THUMB_W / box.w, tilt: TILT, z: 0, opacity: 0, mode: 'hidden' });
  }
  const stageX = narrow || (full && !input.stripOpen) ? 0 : STRIP_W;
  return { placements, narrow, classic: false, stripShown, stripAuto, stageX, canvasH: Math.ceil(canvasH), tabs: tabs.length > 1 ? tabs : [] };
};

/**
 * 每张卡自己的透视：消失点在卡的左缘正中（曾把透视放在最外层、消失点在画布左上角，侧栏越往下的卡被投影得越往下，
 * 和下一组叠在一起——2026-11-13 用户截图的「穿模」「重影」）。左缘贴着不动，右缘往里收、上下对称地往中间缩。
 * 所有卡同一串函数（不斜的 rotateY(0) 透视不起作用），飞行时逐项插值。
 */
export const transformOf = (p: Pick<Placement, 'x' | 'y' | 'h' | 'scale' | 'tilt'>): string => {
  const half = r1((p.h * p.scale) / 2);
  return `translate(${p.x}px, ${r1(p.y + half)}px) perspective(${p.tilt ? STRIP_PERSPECTIVE : PERSPECTIVE}px) rotateY(${p.tilt}deg) translate(0px, ${-half}px) scale(${Math.round(p.scale * 10000) / 10000})`;
};
