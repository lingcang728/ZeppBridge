import { describe, expect, it } from 'vitest';
import { dropAt, passedSlop, ratioFor, resizeOutcome, type ResizeContext } from '../gestures';
import { GAP, MIN_H, STRIP_W } from '../layout';
import { COLUMN_SNAP, GRID_SNAP, ROW_SNAP } from '../state';

const canvas = { width: 1200, height: 700, stageX: STRIP_W, narrow: false };
const stage = [
  { id: 'a', x: STRIP_W, y: 0, w: 600, h: 500 },
  { id: 'b', x: STRIP_W + 616, y: 0, w: 400, h: 300 },
];
const avail = 1200 - STRIP_W;
const one: ResizeContext = {
  count: 1, index: 0, snap: 0, id: 'a', sides: { left: 'sym', right: 'sym' },
  avail, width: 1200, groupW: avail, startW: 670, startH: 400, maxH: 700,
};

describe('stage gestures', () => {
  it('only counts as a drag past the slop', () => {
    expect(passedSlop(3, 4)).toBe(false);
    expect(passedSlop(6, 0)).toBe(true);
  });

  it('drops into the strip, onto a card, or into empty stage space', () => {
    expect(dropAt({ x: 40, y: 200 }, canvas, stage, 'c')).toEqual({ kind: 'strip' });
    expect(dropAt({ x: STRIP_W + 700, y: 100 }, canvas, stage, 'c')).toEqual({ kind: 'stage', index: 1, onto: 'b' });
    expect(dropAt({ x: STRIP_W + 700, y: 600 }, canvas, stage, 'c')).toEqual({ kind: 'stage', index: 2, onto: null });
    expect(dropAt({ x: STRIP_W + 100, y: 600 }, canvas, stage, 'c')).toEqual({ kind: 'stage', index: 0, onto: null });
    expect(dropAt({ x: -20, y: 100 }, canvas, stage, 'c')).toEqual({ kind: 'none' });
  });

  it('ignores the card being dragged when hit-testing', () => {
    expect(dropAt({ x: STRIP_W + 100, y: 100 }, canvas, stage, 'a')).toEqual({ kind: 'stage', index: 0, onto: null });
  });

  it('a centred card grows on both sides from either edge, steplessly, and snaps only right next to a preset', () => {
    const right = resizeOutcome(one, 'right', 45, 0);
    const left = resizeOutcome(one, 'left', -45, 0);
    expect(right).toEqual(left);
    expect(right.kind === 'size' && right.patch.ratio).toBeCloseTo(760 / avail, 5);
    expect(resizeOutcome({ ...one, startW: 0 }, 'right', (avail * 0.84 + 6) / 2, 0)).toEqual({ kind: 'size', patch: { ratio: 0.84 } });
  });

  it('tucks when dragged far inward and goes full when dragged past the stage', () => {
    expect(resizeOutcome({ ...one, startW: 860 }, 'right', -230, 0)).toEqual({ kind: 'tuck' });
    expect(resizeOutcome({ ...one, startW: 860 }, 'right', 170, 0)).toEqual({ kind: 'full' });
    // 全屏往里拖：退出全屏，按拖到的宽给比例；拖一点点还是全屏。
    const full = { ...one, snap: 2, startW: 1200 };
    const out = resizeOutcome(full, 'left', 200, 0);
    expect(out.kind === 'size' && out.patch.ratio).toBeCloseTo(800 / avail, 5);
    expect(resizeOutcome(full, 'right', -5, 0)).toEqual({ kind: 'none' });
  });

  it('the bottom edge sets only this card height, clamped; a corner sets width and height together', () => {
    expect(resizeOutcome(one, 'bottom', 300, 120)).toEqual({ kind: 'size', patch: { heights: { a: 520 } } });
    expect(resizeOutcome(one, 'bottom', 0, -900)).toEqual({ kind: 'size', patch: { heights: { a: MIN_H } } });
    expect(resizeOutcome(one, 'bottom', 0, 900)).toEqual({ kind: 'size', patch: { heights: { a: 700 } } });
    const corner = resizeOutcome(one, 'br', 45, 50);
    expect(corner.kind === 'size' && corner.patch.heights).toEqual({ a: 450 });
    expect(corner.kind === 'size' && corner.patch.ratio).toBeCloseTo(760 / avail, 5);
  });

  it('in a group the seam drags the ratio and the outer edge drags the group width', () => {
    const pair: ResizeContext = { ...one, count: 2, sides: { left: 'outer', right: 'seam' }, startW: 500, groupW: avail };
    expect(resizeOutcome(pair, 'right', 400, 0)).toEqual({ kind: 'size', patch: { ratio: 0.75 } });
    const seam = resizeOutcome(pair, 'right', 50, 0);
    expect(seam.kind === 'size' && seam.patch.ratio).toBeCloseTo(550 / (avail - GAP), 5);
    // 最外侧往里拖 100：整组居中，两边各收 100。
    const outer = resizeOutcome(pair, 'left', 100, 0);
    expect(outer.kind === 'size' && outer.patch.span).toBeCloseTo((avail - 200) / avail, 2);
    expect(outer.kind === 'size' && outer.patch.ratio).toBeUndefined();
    // 拉回到几乎满宽就吸回 1；最窄夹在一半。
    expect(resizeOutcome({ ...pair, groupW: avail - 30 }, 'left', -14, 0)).toEqual({ kind: 'size', patch: { span: 1 } });
    expect(resizeOutcome({ ...pair, groupW: avail * 0.6 }, 'left', 220, 0)).toEqual({ kind: 'size', patch: { span: 0.5 } });
    expect(resizeOutcome(pair, 'left', 240, 0)).toEqual({ kind: 'tuck' });
  });

  it('maps a card width to the group ratio from whichever card is dragged', () => {
    const c = { count: 2, index: 1, snap: 0, avail: 1000 };
    expect(ratioFor(c, (1000 - GAP) / 4)).toBeCloseTo(0.75, 5);
    expect(ratioFor({ ...c, groupW: 800 }, (800 - GAP) / 4)).toBeCloseTo(0.75, 5);
    expect(ratioFor({ ...c, count: 3, snap: 2, index: 0 }, 900)).toBeNull();
    expect(ratioFor({ ...c, count: 3, snap: 2, index: 1 }, (1000 - GAP) / 2)).toBeCloseTo(0.5, 5);
    expect(ratioFor({ ...c, count: 3, snap: 0, index: 2 }, (1000 - GAP) / 3)).toBeCloseTo(2 / 3, 5);
  });
});

describe('four-card seams (user 2026-11-14)', () => {
  const four = (snap: number, index: number, sides: ResizeContext['sides'], startW: number): ResizeContext => ({
    count: 4, index, snap, id: 'x', sides, avail, width: 1200, groupW: avail, startW, startH: 300, maxH: 700, splits: [1 / 3, 2 / 3],
  });
  const row = avail - 2 * GAP;

  it('grid: both columns share one seam', () => {
    const left = (avail - GAP) / 2;
    expect(ratioFor(four(GRID_SNAP, 2, { left: 'outer', right: 'seam' }, left), left)).toBeCloseTo(0.5, 3);
    expect(ratioFor(four(GRID_SNAP, 3, { left: 'seam', right: 'outer' }, left), left * 0.8)).toBeCloseTo(0.6, 3);
  });

  it('one over three: each inner edge moves its own seam and never squeezes a card below the minimum', () => {
    const middle = four(ROW_SNAP, 2, { left: 'seam', right: 'seam' }, row / 3);
    const moveRight = resizeOutcome(middle, 'right', row * 0.1, 0);
    expect(moveRight.kind === 'size' && moveRight.patch.splits?.[1]).toBeCloseTo(2 / 3 + 0.1, 2);
    const moveLeft = resizeOutcome(middle, 'left', row * 0.05, 0);
    expect(moveLeft.kind === 'size' && moveLeft.patch.splits?.[0]).toBeCloseTo(1 / 3 + 0.05, 2);
    const squeeze = resizeOutcome(four(ROW_SNAP, 1, { left: 'outer', right: 'seam' }, row / 3), 'right', row * 0.4, 0);
    expect(squeeze.kind === 'size' && squeeze.patch.splits?.[0]).toBeCloseTo(2 / 3 - 0.2, 3);
    // 拖到 1/2 附近吸过去。
    const wideRight = { ...four(ROW_SNAP, 2, { left: 'seam', right: 'seam' }, row * 0.3), splits: [0.3, 0.6] as const };
    const snapIn = resizeOutcome(wideRight, 'right', -row * 0.09, 0);
    expect(snapIn.kind === 'size' && snapIn.patch.splits?.[1]).toBe(1 / 2);
  });

  it('big left: the stacked cards move the main seam', () => {
    const colW = (avail - GAP) * 0.4;
    // 左边沿往左拖 50（dx 为负）：小卡变宽、大卡变窄。
    const out = resizeOutcome(four(COLUMN_SNAP, 3, { left: 'seam', right: 'outer' }, colW), 'left', -50, 0);
    expect(out.kind === 'size' && out.patch.ratio).toBeCloseTo(1 - (colW + 50) / (avail - GAP), 2);
  });
});
