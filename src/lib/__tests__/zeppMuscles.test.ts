import { describe, expect, it } from 'vitest';
import { levelOf, muscleLoad, positionShapeKeys, rowShapes, type MuscleRowInput } from '../anatomy/zeppMuscles';
import { BACK_SHAPES, FRONT_SHAPES } from '../anatomy/paths';

const row = (over: Partial<MuscleRowInput>): MuscleRowInput => ({
  id: 'r', sets: 1, mainPositions: [], subPositions: [], primaryGroup: null, secondaryGroups: [], ...over,
});

describe('zepp muscle positions on the anatomy figure', () => {
  it('only points at shapes the figure actually has', () => {
    const drawn = new Set([
      ...FRONT_SHAPES.map((s) => `front:${s.slug}:${s.side}`),
      ...BACK_SHAPES.map((s) => `back:${s.slug}:${s.side}`),
    ]);
    const all = positionShapeKeys(Array.from({ length: 50 }, (_, i) => i));
    expect(all.filter((key) => !drawn.has(key))).toEqual([]);
  });

  it('draws the deltoid on both figures and honours the verified single-side ids', () => {
    // 「哑铃前平举（左）」= [4, 38]：正面图和背面图上的左三角肌。
    expect(positionShapeKeys([4, 38]).sort()).toEqual(['back:deltoids:l', 'front:deltoids:l']);
    expect(positionShapeKeys([20])).toEqual(['back:upper-back:r']);
    // 没有单侧动作核过的号两侧都亮，不按奇偶猜。
    expect(positionShapeKeys([14]).sort()).toEqual(['front:quadriceps:l', 'front:quadriceps:r']);
    // 髋屈肌、48/49 素材里没有，不画。
    expect(positionShapeKeys([32, 46, 48])).toEqual([]);
  });

  it('falls back to the nine muscle groups when the catalog gave no positions', () => {
    const shapes = rowShapes(row({ primaryGroup: 'shoulders', secondaryGroups: ['shoulders', 'triceps'] }));
    expect(shapes.primary.has('front:deltoids:l')).toBe(true);
    expect(shapes.secondary.has('front:deltoids:l')).toBe(false);
    expect(shapes.secondary.has('back:triceps:r')).toBe(true);
  });
});

describe('muscle load', () => {
  it('scores primary sets 1 and secondary sets 0.5, primary wins within a row', () => {
    const load = muscleLoad([
      row({ id: 'a', sets: 4, mainPositions: [5, 6], subPositions: [22, 23, 5] }),
      row({ id: 'b', sets: 2, mainPositions: [22, 23] }),
    ]);
    const chest = load.byShape.get('front:chest:l')!;
    expect(chest.score).toBe(4);
    expect(chest.secondaryOnly).toBe(false);
    const triceps = load.byShape.get('back:triceps:l')!;
    expect(triceps.score).toBe(2 + 4 * 0.5);
    expect([...triceps.rows].sort()).toEqual(['a', 'b']);
    expect(load.byRow.get('a')!.secondary.has('front:chest:l')).toBe(false);
  });

  it('marks muscles that were only ever secondary and skips empty rows', () => {
    const load = muscleLoad([row({ id: 'a', sets: 1, mainPositions: [3, 4, 38, 39], subPositions: [34, 35] }), row({ id: 'z', sets: 0, mainPositions: [5] })]);
    expect(load.byShape.get('back:trapezius:l')!.secondaryOnly).toBe(true);
    expect(load.byShape.has('front:chest:l')).toBe(false);
    expect(load.byRow.has('z')).toBe(false);
  });

  it('levels: > 0 light, ≥ 3 medium, ≥ 6 full', () => {
    expect([0, 0.5, 2.5, 3, 5.5, 6, 20].map(levelOf)).toEqual([0, 1, 1, 2, 2, 3, 3]);
  });
});
