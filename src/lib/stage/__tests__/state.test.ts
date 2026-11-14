import { describe, expect, it } from 'vitest';
import {
  addToStage, bringGroup, cycle, focusCard, FULL_SNAP, fullscreen, hide, locate, MAX_ON_STAGE, removeFromStage, ROW_SNAP, setSize,
  setSnap, snapFor, solo, swapOnStage, TOP_SNAP, type StageState,
} from '../state';

const base = (): StageState => ({
  stage: { ids: ['a', 'b'], snap: 1 },
  strip: [{ ids: ['c'], snap: 0 }, { ids: ['d', 'e'], snap: 2 }, { ids: ['f'], snap: 0 }],
  hidden: ['h'],
});
const all = (s: StageState) => [...s.stage.ids, ...s.strip.flatMap((g) => g.ids), ...s.hidden].sort();

describe('stage state', () => {
  it('never loses or duplicates a card, whatever the action', () => {
    const actions: Array<(s: StageState) => StageState> = [
      (s) => bringGroup(s, 1), (s) => cycle(s, 1), (s) => cycle(s, -1), (s) => addToStage(s, 'c'), (s) => addToStage(s, 'f', 0),
      (s) => removeFromStage(s, 'a'), (s) => solo(s, 'e'), (s) => fullscreen(s, 'c'), (s) => hide(s, 'b'), (s) => focusCard(s, 'h'),
      (s) => swapOnStage(s, 'a', 'b'), (s) => setSnap(s, 9),
    ];
    let s = base();
    for (let round = 0; round < 3; round += 1) {
      for (const act of actions) {
        s = act(s);
        expect(all(s)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'h']);
        expect(s.stage.ids.length).toBeGreaterThan(0);
        expect(s.stage.ids.length).toBeLessThanOrEqual(MAX_ON_STAGE);
      }
    }
  });

  it('bringing a strip group swaps it with the stage, which goes to the top of the strip', () => {
    const s = bringGroup(base(), 1);
    expect(s.stage).toEqual({ ids: ['d', 'e'], snap: 2 });
    expect(s.strip.map((g) => g.ids)).toEqual([['a', 'b'], ['c'], ['f']]);
  });

  it('cycling forward then back returns to the same state', () => {
    expect(cycle(cycle(base(), 1), -1)).toEqual(base());
  });

  it('takes up to four cards (user 2026-11-14), then replaces the card at the drop slot', () => {
    const four = addToStage(addToStage(base(), 'c'), 'd');
    expect(four.stage.ids).toEqual(['a', 'b', 'c', 'd']);
    const replaced = addToStage(four, 'f', 1);
    expect(replaced.stage.ids).toEqual(['a', 'f', 'c', 'd']);
    expect(replaced.strip[0].ids).toEqual(['b']);
  });

  it('gives a wide lead card the full-width row when the count changes', () => {
    const wide = (id: string) => id === 'a';
    expect(snapFor(['a', 'b', 'c'], wide)).toBe(TOP_SNAP);
    expect(snapFor(['b', 'a', 'c'], wide)).toBe(0);
    expect(snapFor(['a', 'b', 'c', 'd'], wide)).toBe(ROW_SNAP);
    expect(addToStage(addToStage(base(), 'c', undefined, wide), 'f', undefined, wide).stage.snap).toBe(ROW_SNAP);
    expect(removeFromStage(addToStage(base(), 'c', undefined, wide), 'c', wide).stage.snap).toBe(0);
  });

  it('keeps the seams of a one-over-three row, and drops them when the row breaks up', () => {
    const four = setSize(addToStage(addToStage(base(), 'c'), 'f'), { splits: [0.25, 0.6] });
    expect(four.stage.splits).toEqual([0.25, 0.6]);
    expect(swapOnStage(four, 'a', 'b').stage.splits).toEqual([0.25, 0.6]);
    expect(removeFromStage(four, 'f').stage.splits).toBeUndefined();
    expect(setSnap(four, 0).stage.splits).toBeUndefined();
  });

  it('pulling a card out of a group keeps the rest on stage', () => {
    const s = removeFromStage(base(), 'a');
    expect(s.stage.ids).toEqual(['b']);
    expect(s.strip[0].ids).toEqual(['a']);
  });

  it('tucking the only stage card brings the top strip group up', () => {
    const single = solo(base(), 'a');
    const tucked = removeFromStage(fullscreen(single, 'a'), 'a');
    expect(tucked.stage.ids).toEqual(['b']);
    expect(locate(tucked, 'a')).toEqual({ at: 'strip', group: 0, index: 0 });
    expect(tucked.strip[0].snap).toBe(0);
  });

  it('a lone card with an empty strip stays put', () => {
    const lone: StageState = { stage: { ids: ['a'], snap: 0 }, strip: [], hidden: [] };
    expect(removeFromStage(lone, 'a')).toBe(lone);
  });

  it('solo keeps the rest of the group together in the strip', () => {
    const s = solo({ ...base(), stage: { ids: ['a', 'b', 'c'], snap: 0 }, strip: [] }, 'b');
    expect(s.stage.ids).toEqual(['b']);
    expect(s.strip[0].ids).toEqual(['a', 'c']);
  });

  it('fullscreen uses the full snap', () => {
    expect(fullscreen(base(), 'f').stage).toEqual({ ids: ['f'], snap: FULL_SNAP });
  });

  it('hiding the whole stage refills it from the strip', () => {
    const s = hide(hide(base(), 'a'), 'b');
    expect(s.stage.ids).toEqual(['c']);
    expect(s.hidden).toEqual(['h', 'a', 'b']);
  });

  it('focusing a hidden card restores it alone on stage', () => {
    const s = focusCard(base(), 'h');
    expect(s.stage.ids).toEqual(['h']);
    expect(s.hidden).toEqual([]);
    expect(s.strip[0].ids).toEqual(['a', 'b']);
  });

  it('clamps snaps to what the card count allows', () => {
    expect(setSnap(base(), 9).stage.snap).toBe(2);
    expect(setSnap({ ...base(), stage: { ids: ['a', 'b', 'c'], snap: 0 } }, 5).stage.snap).toBe(2);
  });
});
