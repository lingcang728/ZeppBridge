/**
 * 台前调度（运动详情页，2026-11-13）的状态：舞台上的一组卡、左侧栏里的若干组、藏起来的卡。
 * 只有纯数据和纯函数：每个动作都返回新状态，不改传进来的那份；界面（useWorkoutStage）只负责存和画。
 *
 * - 一「组」是一起进出舞台的 1–3 张卡（iPad 台前调度里拼在一起的几个窗口）。
 * - 侧栏顺序 = 最近用过的在上：从舞台退下来的组插到最前面。
 * - 舞台永远不空（只要还有卡没藏）。
 */
export interface StageGroup {
  ids: string[];
  /** 档：1 张是 标准 / 宽 / 全屏，2 张是 1:1 / 2:1 / 1:2，3 张是 主卡在左 / 在右 / 在上（layout.ts）。 */
  snap: number;
  /**
   * 拖边拖出来的连续比例（2026-11-13 用户：缩放要无级，松手别跳回几个固定档）：
   * 1 张是占舞台宽的几成，2 张是左边那张的份额，3 张是大卡的份额。有它就不看 snap 里的比例（3 张时 snap 仍管大卡在哪边）。
   */
  ratio?: number;
  /** 两三张时整组占舞台可用宽的几成（拖最外侧的左 / 右边），整组居中；没有就是占满。 */
  span?: number;
  /** 拖下边拉出来的高（排版像素，夹在 layout.ts 的范围里）；没有的卡按内容高。 */
  heights?: Record<string, number>;
}
export interface StageState {
  stage: StageGroup;
  strip: StageGroup[];
  hidden: string[];
}

export const MAX_ON_STAGE = 3;
/** 单张卡的「全屏」档：侧栏让开，卡占满舞台。 */
export const FULL_SNAP = 2;
/** 每种张数都有三档：1 张 标准 / 宽 / 全屏，2 张 1:1 / 2:1 / 1:2，3 张 主卡在左 / 在右 / 在上。 */
export const snapCount = (_cards: number): number => 3;
/** 3 张时「主卡在上」：主卡占上面整行，另两张在下面左右排（运动详情的概要卡默认这样）。 */
export const TOP_SNAP = 2;

/** 只留这几张卡自己的高。 */
const heightsOf = (g: { heights?: Record<string, number> }, ids: readonly string[]): Record<string, number> | undefined => {
  if (!g.heights) return undefined;
  const out: Record<string, number> = {};
  for (const id of ids) {
    const h = g.heights[id];
    if (typeof h === 'number' && Number.isFinite(h)) out[id] = h;
  }
  return Object.keys(out).length ? out : undefined;
};
/** 组的一份拷贝（可选字段没有就不带 key，存档和比较都干净）。 */
const make = (ids: string[], snap: number, extra: Partial<StageGroup> = {}): StageGroup => {
  const out: StageGroup = { ids: [...ids], snap };
  if (extra.ratio != null && Number.isFinite(extra.ratio)) out.ratio = extra.ratio;
  if (extra.span != null && Number.isFinite(extra.span)) out.span = extra.span;
  const heights = heightsOf(extra, ids);
  if (heights) out.heights = heights;
  return out;
};
const group = (g: StageGroup): StageGroup => make(g.ids, g.snap, g);
const copy = (s: StageState): StageState => ({
  stage: group(s.stage),
  strip: s.strip.map(group),
  hidden: [...s.hidden],
});

const clampSnap = (g: StageGroup): StageGroup =>
  make(g.ids, Math.min(Math.max(0, Math.round(g.snap) || 0), snapCount(g.ids.length) - 1), g);

/** 把一张卡从所有位置拿掉（空掉的侧栏组一起去掉）。 */
const take = (s: StageState, id: string): StageState => {
  const out = copy(s);
  if (out.stage.ids.includes(id)) out.stage = clampSnap({ ids: out.stage.ids.filter((x) => x !== id), snap: 0, heights: out.stage.heights });
  out.strip = out.strip
    .map((g) => (g.ids.includes(id) ? clampSnap({ ids: g.ids.filter((x) => x !== id), snap: 0 }) : g))
    .filter((g) => g.ids.length > 0);
  out.hidden = out.hidden.filter((x) => x !== id);
  return out;
};

/** 舞台空了就把侧栏最上面那组请上来。 */
const fill = (s: StageState): StageState => {
  if (s.stage.ids.length || !s.strip.length) return s;
  const [next, ...rest] = s.strip;
  return { ...s, stage: next, strip: rest };
};

export type Where = { at: 'stage'; index: number } | { at: 'strip'; group: number; index: number } | { at: 'hidden' } | null;

export const locate = (s: StageState, id: string): Where => {
  const onStage = s.stage.ids.indexOf(id);
  if (onStage >= 0) return { at: 'stage', index: onStage };
  for (let group = 0; group < s.strip.length; group += 1) {
    const index = s.strip[group].ids.indexOf(id);
    if (index >= 0) return { at: 'strip', group, index };
  }
  return s.hidden.includes(id) ? { at: 'hidden' } : null;
};

/** 点侧栏的一组：它上舞台，原来的那组退到侧栏最前面。 */
export const bringGroup = (s: StageState, group: number): StageState => {
  const picked = s.strip[group];
  if (!picked) return s;
  const out = copy(s);
  out.strip.splice(group, 1);
  if (out.stage.ids.length) out.strip.unshift(clampSnap(out.stage));
  out.stage = clampSnap(picked);
  return out;
};

/** ← / →：→ 请侧栏最上面那组、当前组排到最后；← 反过来。两者互逆，连按能把所有组轮一遍。 */
export const cycle = (s: StageState, dir: 1 | -1): StageState => {
  if (!s.strip.length) return s;
  const out = copy(s);
  if (dir > 0) {
    const next = out.strip.shift()!;
    out.strip.push(out.stage);
    out.stage = next;
  } else {
    const next = out.strip.pop()!;
    out.strip.unshift(out.stage);
    out.stage = next;
  }
  return out;
};

/**
 * 把一张卡放上舞台、并进当前这组（拖进来，或菜单里「放到旁边」）。
 * 已满三张就换掉落点那张（被换下的单独退到侧栏最前面）；at 省略时放最后。
 */
export const addToStage = (s: StageState, id: string, at?: number): StageState => {
  if (s.stage.ids.includes(id)) {
    if (at == null) return s;
    const ids = s.stage.ids.filter((x) => x !== id);
    ids.splice(Math.min(Math.max(0, at), ids.length), 0, id);
    return { ...copy(s), stage: make(ids, s.stage.snap, s.stage) };
  }
  const out = take(s, id);
  const ids = [...out.stage.ids];
  if (ids.length >= MAX_ON_STAGE) {
    const slot = Math.min(Math.max(0, at ?? ids.length - 1), ids.length - 1);
    const [replaced] = ids.splice(slot, 1, id);
    out.strip.unshift({ ids: [replaced], snap: 0 });
    out.stage = make(ids, out.stage.snap, { heights: out.stage.heights });
    return out;
  }
  ids.splice(Math.min(Math.max(0, at ?? ids.length), ids.length), 0, id);
  out.stage = make(ids, 0, { heights: out.stage.heights });
  return out;
};

/** 把舞台上的一张卡收进侧栏（拖回侧栏 / 角柄往里拖 / 菜单）。只剩它一张时换侧栏最上面那组上来；侧栏空着就不动。 */
export const removeFromStage = (s: StageState, id: string): StageState => {
  if (!s.stage.ids.includes(id)) return s;
  if (s.stage.ids.length === 1) {
    if (!s.strip.length) return s;
    const out = copy(s);
    const next = out.strip.shift()!;
    out.strip.unshift({ ids: [id], snap: out.stage.snap === FULL_SNAP ? 0 : out.stage.snap });
    out.stage = next;
    return out;
  }
  const out = copy(s);
  out.stage = make(out.stage.ids.filter((x) => x !== id), 0, { heights: out.stage.heights });
  out.strip.unshift({ ids: [id], snap: 0 });
  return out;
};

/** 只看这一张：它单独留在舞台上，同组的其余几张仍是一组，退到侧栏最前面。 */
export const solo = (s: StageState, id: string, snap = 0): StageState => {
  const where = locate(s, id);
  if (!where) return s;
  const others = s.stage.ids.filter((x) => x !== id);
  const out = take(s, id);
  out.strip = out.strip.filter((g) => g.ids.length > 0);
  if (where.at === 'stage') {
    out.stage = { ids: [], snap: 0 };
    if (others.length) out.strip.unshift(clampSnap({ ids: others, snap: 0 }));
  } else if (out.stage.ids.length) {
    out.strip.unshift(clampSnap(out.stage));
  }
  out.stage = clampSnap({ ids: [id], snap });
  return out;
};

export const fullscreen = (s: StageState, id: string): StageState => solo(s, id, FULL_SNAP);

/** 菜单里挑档：回到固定比例（拖出来的比例、整组宽作废；拉过的高保留）。 */
export const setSnap = (s: StageState, snap: number): StageState =>
  ({ ...copy(s), stage: clampSnap(make(s.stage.ids, snap, { heights: s.stage.heights })) });

/** 拖边的结果：比例 / 整组宽 / 某几张的高（null = 回到按内容高）。范围由 layout.ts 夹。退出全屏时顺手回到普通档。 */
export interface SizePatch { ratio?: number; span?: number; heights?: Record<string, number | null> }
const round3 = (n: number) => Math.round(n * 1000) / 1000;
export const setSize = (s: StageState, patch: SizePatch): StageState => {
  const g = s.stage;
  const snap = g.ids.length === 1 && g.snap === FULL_SNAP && (patch.ratio != null || patch.span != null) ? 0 : g.snap;
  const heights: Record<string, number> = { ...(g.heights ?? {}) };
  for (const [id, h] of Object.entries(patch.heights ?? {})) {
    if (h == null) delete heights[id];
    else heights[id] = Math.round(h);
  }
  const extra: Partial<StageGroup> = {
    ratio: patch.ratio != null ? round3(patch.ratio) : g.ratio,
    span: patch.span != null ? (patch.span >= 0.999 ? undefined : round3(patch.span)) : g.span,
    heights,
  };
  return { ...copy(s), stage: clampSnap(make(g.ids, snap, extra)) };
};

/** 只改比例（老接口，等于 setSize({ ratio })）。 */
export const setRatio = (s: StageState, ratio: number): StageState => setSize(s, { ratio });

/** 舞台上两张换位置（拖到另一张上松手）。 */
export const swapOnStage = (s: StageState, a: string, b: string): StageState => {
  const ids = [...s.stage.ids];
  const [i, j] = [ids.indexOf(a), ids.indexOf(b)];
  if (i < 0 || j < 0 || i === j) return s;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  return { ...copy(s), stage: clampSnap(make(ids, s.stage.snap, s.stage)) };
};

/** 藏起来：哪都不出现，只在「已隐藏」里能找回。 */
export const hide = (s: StageState, id: string): StageState => {
  if (!locate(s, id) || s.hidden.includes(id)) return s;
  const out = take(s, id);
  out.hidden.push(id);
  return fill(out);
};

/** 想看某一张：在舞台上就不动；在侧栏就请它那组上来；藏着的先找回来再单独上舞台。 */
export const focusCard = (s: StageState, id: string): StageState => {
  const where = locate(s, id);
  if (!where || where.at === 'stage') return s;
  if (where.at === 'strip') return bringGroup(s, where.group);
  return solo({ ...copy(s), hidden: s.hidden.filter((x) => x !== id), strip: [{ ids: [id], snap: 0 }, ...copy(s).strip] }, id);
};
