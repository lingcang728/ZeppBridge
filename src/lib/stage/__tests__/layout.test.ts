import { describe, expect, it } from 'vitest';
import { CLASSIC_TWO_COL, GAP, NARROW_W, solve, STRIP_W, THUMB_W, TILT, transformOf, type LayoutInput } from '../layout';
import { COLUMN_SNAP, GRID_SNAP, ROW_SNAP, type StageState } from '../state';

const input = (state: StageState, over: Partial<LayoutInput> = {}): LayoutInput => ({
  width: 1200,
  height: 700,
  state,
  cards: ['a', 'b', 'c', 'd', 'm'],
  contentH: { a: 500, b: 900, c: 300, d: 400, m: 320 },
  lastW: {},
  pip: new Set(['m']),
  stripOpen: false,
  ...over,
});
const pair = (snap: number): StageState => ({ stage: { ids: ['a', 'b'], snap }, strip: [{ ids: ['c'], snap: 0 }, { ids: ['d'], snap: 0 }], hidden: ['m'] });

describe('stage layout', () => {
  it('splits a pair by its ratio next to the strip and caps heights at the stage', () => {
    const out = solve(input(pair(1)));
    const [a, b] = [out.placements.get('a')!, out.placements.get('b')!];
    const avail = 1200 - STRIP_W;
    expect(a.x).toBe(STRIP_W);
    expect(a.w).toBeCloseTo(((avail - GAP) * 2) / 3, 0);
    expect(b.x + b.w).toBeCloseTo(1200, 0);
    expect(a.h).toBe(500);
    expect(b.h).toBe(700);
    expect(out.stripShown).toBe(true);
  });

  it('tilts strip cards and scales them to the thumbnail width', () => {
    const c = solve(input(pair(0))).placements.get('c')!;
    expect(c.mode).toBe('strip');
    expect(c.tilt).toBe(TILT);
    expect(c.w * c.scale).toBeCloseTo(THUMB_W, 3);
  });

  it('full screen hides the strip unless it is called out, and then the card moves right instead of being covered', () => {
    const full: StageState = { stage: { ids: ['a'], snap: 2 }, strip: [{ ids: ['c'], snap: 0 }], hidden: [] };
    const closed = solve(input(full));
    expect(closed.placements.get('a')).toMatchObject({ x: 0, w: 1200 });
    expect(closed.stripShown).toBe(false);
    expect(closed.placements.get('c')!.opacity).toBe(0);
    const open = solve(input(full, { stripOpen: true }));
    expect(open.placements.get('a')).toMatchObject({ x: STRIP_W, w: 1200 - STRIP_W });
    expect(open.stageX).toBe(STRIP_W);
    expect(open.placements.get('c')!.opacity).toBe(1);
  });

  it('strip groups never cut into each other while they fit, and lower groups sit on top when squeezed', () => {
    const many: StageState = { stage: { ids: ['a'], snap: 0 }, strip: ['b', 'c', 'd', 'm'].map((id) => ({ ids: [id], snap: 0 })), hidden: [] };
    const roomy = solve(input(many, { height: 2000 }));
    const tiles = ['b', 'c', 'd', 'm'].map((id) => roomy.placements.get(id)!);
    for (const [i, t] of tiles.slice(0, -1).entries()) expect(t.y + t.h * t.scale).toBeLessThan(tiles[i + 1].y);
    const tight = solve(input(many, { height: 300 }));
    const z = ['b', 'c', 'd', 'm'].map((id) => tight.placements.get(id)!.z);
    expect(z).toEqual([...z].sort((p, q) => p - q));
  });

  it('honours dragged heights, the group width and per-side resize roles', () => {
    const state = pair(0);
    state.stage.span = 0.8;
    state.stage.heights = { a: 260, b: 9999 };
    const out = solve(input(state));
    const [a, b] = [out.placements.get('a')!, out.placements.get('b')!];
    const avail = 1200 - STRIP_W;
    expect(a.h).toBe(260);
    expect(b.h).toBe(700);
    expect(b.x + b.w - a.x).toBeCloseTo(avail * 0.8, 0);
    expect(a.x - STRIP_W).toBeCloseTo((avail * 0.2) / 2, 0);
    expect(a.sides).toEqual({ left: 'outer', right: 'seam' });
    expect(b.sides).toEqual({ left: 'seam', right: 'outer' });
    const single = solve(input({ stage: { ids: ['a'], snap: 0, heights: { a: 10 } }, strip: [], hidden: [] })).placements.get('a')!;
    expect(single.sides).toEqual({ left: 'sym', right: 'sym' });
    expect(single.h).toBe(160);
  });

  it('stacks the two small cards of a trio in one column; text cards are never cut, the column grows instead', () => {
    const trio: StageState = { stage: { ids: ['a', 'b', 'c'], snap: 1 }, strip: [], hidden: [] };
    const fits = solve(input(trio, { contentH: { a: 400, b: 300, c: 300 } }));
    const [a, b, c] = ['a', 'b', 'c'].map((id) => fits.placements.get(id)!);
    expect(a.x).toBeGreaterThan(b.x);
    expect(c.y).toBeCloseTo(b.h + GAP, 1);
    expect(c.y + c.h).toBeLessThanOrEqual(700);
    // 两张文字卡加起来比舞台高：各自完整，往下长（2026-11-14 概要卡被切掉一截）。
    const tall = solve(input(trio, { contentH: { a: 400, b: 450, c: 400 } }));
    expect(tall.placements.get('b')!.h).toBe(450);
    expect(tall.placements.get('c')).toMatchObject({ y: 450 + GAP, h: 400 });
  });

  it('narrow windows show one card in front, the pip card in a corner and the rest behind', () => {
    const state: StageState = { stage: { ids: ['a', 'm', 'b'], snap: 0 }, strip: [{ ids: ['c'], snap: 0 }], hidden: [] };
    const out = solve(input(state, { width: NARROW_W - 1 }));
    expect(out.narrow).toBe(true);
    expect(out.tabs).toEqual(['a', 'b']);
    expect(out.placements.get('a')).toMatchObject({ mode: 'stage', x: 0, w: NARROW_W - 1, opacity: 1 });
    const [front, pip] = [out.placements.get('a')!, out.placements.get('m')!];
    expect(pip.mode).toBe('pip');
    // 画中画压在前卡右下角，前卡底下留出够它让开的滚动余量。
    const pipH = pip.h * pip.scale;
    expect(pip.y + pipH).toBeCloseTo(front.y + front.h - 10, 0);
    expect(pip.x + pip.w * pip.scale).toBeCloseTo(NARROW_W - 1 - 10, 0);
    expect(front.pad).toBeGreaterThanOrEqual(pipH);
    expect(front.h).toBeCloseTo(Math.min(700 - 44, 500 + front.pad!), 0);
    expect(out.placements.get('b')).toMatchObject({ mode: 'behind', opacity: 0 });
    expect(out.stripShown).toBe(false);
    expect(solve(input(state, { width: NARROW_W - 1, front: 'b' })).placements.get('b')!.mode).toBe('stage');
  });

  it('uses a dragged ratio instead of the preset split', () => {
    const state = pair(0);
    state.stage.ratio = 0.6;
    const out = solve(input(state));
    expect(out.placements.get('a')!.w).toBeCloseTo((1200 - STRIP_W - GAP) * 0.6, 0);
  });

  it('main on top spans the stage and splits the two below by the ratio', () => {
    const trio: StageState = { stage: { ids: ['c', 'a', 'b'], snap: 2, ratio: 0.5 }, strip: [], hidden: ['m'] };
    const out = solve(input(trio));
    const [c, a, b] = ['c', 'a', 'b'].map((id) => out.placements.get(id)!);
    expect(c).toMatchObject({ x: STRIP_W, y: 0, w: 1200 - STRIP_W, h: 300 });
    expect(a.y).toBe(300 + GAP);
    expect(a.w).toBeCloseTo(b.w, 0);
    expect(b.x + b.w).toBeCloseTo(1200, 0);
    expect(out.canvasH).toBeGreaterThanOrEqual(b.y + b.h);
  });

  it('classic view lays every card out in the old two columns without overlap, hidden ones too', () => {
    const columns = { c: 'full', d: 'side', m: 'float' } as const;
    const out = solve(input(pair(0), { view: 'classic', columns, width: CLASSIC_TWO_COL + 200 }));
    expect(out.classic).toBe(true);
    const tiles = ['a', 'b', 'c', 'd', 'm'].map((id) => out.placements.get(id)!);
    expect(tiles.every((t) => t.mode === 'classic' && t.tilt === 0 && t.scale === 1)).toBe(true);
    expect(out.placements.get('c')).toMatchObject({ x: 0, y: 0, w: CLASSIC_TWO_COL + 200 });
    expect(out.placements.get('d')!.x).toBeGreaterThan(out.placements.get('a')!.x + out.placements.get('a')!.w);
    for (const [i, t] of tiles.entries()) for (const u of tiles.slice(i + 1)) {
      const apart = t.x + t.w <= u.x || u.x + u.w <= t.x || t.y + t.h <= u.y || u.y + u.h <= t.y;
      expect(apart).toBe(true);
    }
    // 「哪栏矮放哪栏」：侧栏只有 d（400），主栏 a + b（1400），m 进侧栏。
    expect(out.placements.get('m')!.x).toBe(out.placements.get('d')!.x);
    expect(out.canvasH).toBeGreaterThanOrEqual(1400);
    const narrow = solve(input(pair(0), { view: 'classic', columns, width: CLASSIC_TWO_COL - 1 }));
    expect(new Set(['a', 'b', 'd', 'm'].map((id) => narrow.placements.get(id)!.x))).toEqual(new Set([0]));
  });

  it('tilts each card around its own left edge so strip cards never drift into the next one', () => {
    expect(transformOf({ x: 1, y: 2, h: 100, scale: 0.5, tilt: 38 })).toBe('translate(1px, 27px) perspective(280px) rotateY(38deg) translate(0px, -25px) scale(0.5)');
    expect(transformOf({ x: 0, y: 0, h: 100, scale: 1, tilt: 0 })).toBe('translate(0px, 50px) perspective(1100px) rotateY(0deg) translate(0px, -50px) scale(1)');
  });
});

describe('four cards and filling the stage (user 2026-11-14)', () => {
  const four = (snap: number, extra: Partial<StageState['stage']> = {}): StageState => ({ stage: { ids: ['a', 'b', 'c', 'd'], snap, ...extra }, strip: [], hidden: [] });
  const grow = new Map(['a', 'b', 'c', 'd'].map((id) => [id, 50] as const));
  const box = (out: ReturnType<typeof solve>, id: string) => out.placements.get(id)!;
  const avail = 1200 - STRIP_W;

  it('grid: two rows of two on a shared seam, every card on stage', () => {
    const out = solve(input(four(GRID_SNAP), { contentH: { a: 200, b: 260, c: 220, d: 180 } }));
    const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((id) => box(out, id));
    expect([a, b, c, d].every((p) => p.mode === 'stage')).toBe(true);
    expect(a.x).toBe(STRIP_W);
    expect(b.x).toBeCloseTo(a.x + a.w + GAP, 0);
    expect(c.x).toBe(a.x);
    expect(c.w).toBe(a.w);
    // 第二行从第一行最高那张下面开始。
    expect(c.y).toBeCloseTo(260 + GAP, 0);
    expect(a.sides).toEqual({ left: 'outer', right: 'seam' });
    expect(d.sides).toEqual({ left: 'seam', right: 'outer' });
  });

  it('one over three: the lead card takes the row, the seams follow the saved splits', () => {
    const out = solve(input(four(ROW_SNAP, { splits: [0.25, 0.5] }), { contentH: { a: 200, b: 200, c: 200, d: 200 } }));
    const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((id) => box(out, id));
    expect(a.w).toBeCloseTo(avail, 0);
    const row = avail - 2 * GAP;
    expect(b.w).toBeCloseTo(row * 0.25, 0);
    expect(c.w).toBeCloseTo(row * 0.25, 0);
    expect(d.w).toBeCloseTo(row * 0.5, 0);
    expect(d.x + d.w).toBeCloseTo(1200, 0);
    expect(c.sides).toEqual({ left: 'seam', right: 'seam' });
    // 坏的缝回到三等分。
    const broken = solve(input(four(ROW_SNAP, { splits: [0.6, 0.62] }), { contentH: { a: 200, b: 200, c: 200, d: 200 } }));
    expect(box(broken, 'b').w).toBeCloseTo(row / 3, 0);
  });

  it('big left: the lead card has its own column, the other three stack beside it', () => {
    const out = solve(input(four(COLUMN_SNAP), { contentH: { a: 300, b: 150, c: 150, d: 150 } }));
    const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((id) => box(out, id));
    expect(a.w).toBeCloseTo((avail - GAP) * 0.6, 0);
    expect(b.x).toBe(c.x);
    expect(d.y).toBeCloseTo(c.y + c.h + GAP, 0);
  });

  it('charts and maps soak up the spare height, text cards keep their own', () => {
    const state: StageState = { stage: { ids: ['a', 'b'], snap: 0 }, strip: [], hidden: [] };
    const out = solve(input(state, { contentH: { a: 300, b: 300 }, grow: new Map([['a', 50]]) }));
    expect(box(out, 'a').h).toBe(700);
    expect(box(out, 'a').extra).toBe(400);
    expect(box(out, 'b').h).toBe(300);
    expect(box(out, 'b').extra).toBeUndefined();
  });

  it('a column with a chart fills to the stage height; a dragged height is left alone', () => {
    const out = solve(input(four(COLUMN_SNAP), { contentH: { a: 300, b: 150, c: 150, d: 150 }, grow: new Map([['c', 50]]) }));
    const [b, c, d] = ['b', 'c', 'd'].map((id) => box(out, id));
    expect(d.y + d.h).toBeCloseTo(700, 0);
    expect(c.h).toBeCloseTo(700 - 2 * GAP - 300, 0);
    expect(b.h).toBe(150);
    const pinned = solve(input(four(COLUMN_SNAP, { heights: { c: 200 } }), { contentH: { a: 300, b: 150, c: 150, d: 150 }, grow }));
    expect(box(pinned, 'c').h).toBe(200);
    expect(box(pinned, 'c').fill).toBe(true);
    expect(box(pinned, 'c').extra).toBeUndefined();
  });

  it('grid rows share the spare height only where a chart can use it', () => {
    const out = solve(input(four(GRID_SNAP), { contentH: { a: 200, b: 260, c: 220, d: 180 }, grow: new Map([['c', 50]]) }));
    const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((id) => box(out, id));
    expect(a.h).toBe(200);
    expect(b.h).toBe(260);
    expect(c.y + c.h).toBeCloseTo(700, 0);
    expect(d.h).toBe(180);
  });

  it('a column too tall for the stage shrinks its charts only when that makes it fit', () => {
    const tall = { a: 300, b: 300, c: 300, d: 300 };
    const fits = solve(input(four(COLUMN_SNAP), { contentH: tall, grow }));
    // 右列三张 300 → 放进 700 − 2×16 = 668 要每张缩 77 > 50：缩到底也放不下，就都不缩，列往下长（反正要滚）。
    const [b, c] = ['b', 'c'].map((id) => box(fits, id));
    expect(b.h).toBe(300);
    expect(b.extra).toBeUndefined();
    expect(c.y).toBeCloseTo(300 + GAP, 0);
    const gentle = solve(input(four(COLUMN_SNAP), { contentH: { a: 300, b: 240, c: 240, d: 240 }, grow }));
    expect(box(gentle, 'd').y + box(gentle, 'd').h).toBeCloseTo(700, 0);
    expect(box(gentle, 'b').extra).toBeCloseTo(668 / 3 - 240, 0);
  });

  it('an overflowing column shrinks its chart before it cuts a text card (big-left, 2026-11-14)', () => {
    // 右列：文字 260 + 图 300（能缩 120）+ 文字 160 = 720 > 668：图缩 52，两张文字卡完整。
    const out = solve(input(four(COLUMN_SNAP), { contentH: { a: 300, b: 260, c: 300, d: 160 }, grow: new Map([['c', 120]]) }));
    const [b, c, d] = ['b', 'c', 'd'].map((id) => box(out, id));
    expect(b.h).toBe(260);
    expect(d.h).toBe(160);
    expect(c.extra).toBeCloseTo(-52, 0);
    expect(d.y + d.h).toBeCloseTo(700, 0);
  });

  it('a chart in the big slot follows the small column when that column has to grow', () => {
    const out = solve(input(four(COLUMN_SNAP), { contentH: { a: 300, b: 400, c: 300, d: 300 }, grow: new Map([['a', 50]]) }));
    const d = box(out, 'd');
    expect(d.y + d.h).toBeCloseTo(400 + 300 + 300 + 2 * GAP, 0);
    expect(box(out, 'a').h).toBeCloseTo(d.y + d.h, 0);
  });

  it('never fills in the narrow layout or past the stage when content already overflows', () => {
    const state: StageState = { stage: { ids: ['a'], snap: 0 }, strip: [], hidden: [] };
    expect(box(solve(input(state, { width: 700, grow })), 'a').extra).toBeUndefined();
    expect(box(solve(input(state, { contentH: { a: 900 }, grow })), 'a').h).toBe(700);
  });
});
