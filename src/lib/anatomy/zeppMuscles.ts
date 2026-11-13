/* 力量训练 → 人体分块图：Zepp 肌肉位置号落到图上哪几块，以及一次训练里每块练了多少（#163）。
 *
 * 位置号来自 Zepp 动作目录的 mainPositions / subPositions（后端原样下发）。对照依据是 #163 里
 * felipepmdias 整理的表，再用目录里的单侧动作核过（2026-11-13）：
 * - 3/4 和 38/39 不是三角肌前束 / 后束，而是同一块三角肌分别画在 Zepp 正面图和背面图上
 *   （「哑铃前平举（左）」给的是 [4, 38]，右是 [3, 39]）。
 * - 左右**不按奇偶**：单侧动作证实左 = 4、11、19、22、38，右 = 3、10、20、23、39。
 *   其余成对的号没有单侧动作可核，两侧一起上色，不猜。
 * - 16/17 只出现在「小腿后侧肌群」上，画背面小腿；30/31 出现在「小腿前侧肌群」和「站姿提踵」上，
 *   画正面看得到的小腿（暂定）。
 * - 32/33、46/47（髋屈肌）、44/45（髂胫束 / 阔筋膜张肌）、48/49 素材里没有对应的块，不画。
 *
 * 计分照 Strava：主练每组记 1，辅助每组记 0.5；同一组里一块肌肉既是主练又是辅助只算主练。 */
import type { AnatomySide, AnatomySlug, AnatomyView } from './types';
import { shapeKey } from './types';

type Place = [AnatomyView, AnatomySlug];

/** 位置号 → 图上的块（视图、部位、哪一侧）。 */
export const POSITION_SHAPES: ReadonlyMap<number, ReadonlyArray<string>> = (() => {
  const map = new Map<number, string[]>();
  const pair = (ids: [number, number], places: Place[], sides?: { l: number; r: number }) => {
    for (const id of ids) {
      const side: AnatomySide[] = sides ? [id === sides.l ? 'l' : 'r'] : ['l', 'r'];
      const keys = places.flatMap(([view, slug]) => side.map((s) => shapeKey(view, slug, s)));
      // 正面颈部中间还有一块不分左右的。
      if (!sides) for (const [view, slug] of places) if (slug === 'neck' && view === 'front') keys.push(shapeKey(view, slug, 'c'));
      map.set(id, keys);
    }
  };
  pair([1, 2], [['front', 'abs']]);
  pair([7, 8], [['front', 'obliques']]);
  pair([5, 6], [['front', 'chest']]);
  pair([10, 11], [['front', 'biceps']], { l: 11, r: 10 });
  pair([22, 23], [['front', 'triceps'], ['back', 'triceps']], { l: 22, r: 23 });
  pair([12, 13], [['front', 'forearm']]);
  pair([24, 25], [['back', 'forearm']]);
  pair([3, 4], [['front', 'deltoids']], { l: 4, r: 3 });
  pair([38, 39], [['back', 'deltoids']], { l: 38, r: 39 });
  pair([40, 41], [['front', 'neck'], ['back', 'neck']]);
  pair([19, 20], [['back', 'upper-back']], { l: 19, r: 20 });
  pair([34, 35], [['front', 'trapezius'], ['back', 'trapezius']]);
  pair([36, 37], [['back', 'lower-back']]);
  pair([26, 27], [['back', 'gluteal']]);
  pair([14, 15], [['front', 'quadriceps']]);
  pair([28, 29], [['back', 'hamstring']]);
  pair([16, 17], [['back', 'calves']]);
  pair([30, 31], [['front', 'calves']]);
  pair([42, 43], [['front', 'adductors'], ['back', 'adductors']]);
  return map;
})();

/** 拿不到位置号（目录不可用、只有九大肌群）时，按大肌群点亮一组块，两侧都亮。 */
const GROUP_PLACES: Record<string, Place[]> = {
  chest: [['front', 'chest']],
  back: [['back', 'upper-back'], ['back', 'trapezius'], ['back', 'lower-back']],
  shoulders: [['front', 'deltoids'], ['back', 'deltoids']],
  biceps: [['front', 'biceps']],
  triceps: [['front', 'triceps'], ['back', 'triceps']],
  forearms: [['front', 'forearm'], ['back', 'forearm']],
  core: [['front', 'abs'], ['front', 'obliques']],
  glutes: [['back', 'gluteal']],
  legs: [['front', 'quadriceps'], ['back', 'hamstring'], ['front', 'calves'], ['back', 'calves']],
};

export const groupShapeKeys = (group: string | null | undefined): string[] =>
  (group ? (GROUP_PLACES[group] ?? []) : []).flatMap(([view, slug]) => [shapeKey(view, slug, 'l'), shapeKey(view, slug, 'r')]);

export const positionShapeKeys = (positions: readonly number[]): string[] => {
  const out = new Set<string>();
  for (const p of positions) for (const key of POSITION_SHAPES.get(p) ?? []) out.add(key);
  return [...out];
};

/** 一行（一组，或汇总流里的一个动作）练到的块。 */
export interface MuscleRowInput {
  id: string;
  /** 这一行算几组。 */
  sets: number;
  mainPositions: readonly number[];
  subPositions: readonly number[];
  primaryGroup: string | null;
  secondaryGroups: readonly string[];
}

export interface RowShapes {
  primary: Set<string>;
  secondary: Set<string>;
}

/** 有位置号用位置号（更细、分左右），否则退回大肌群。 */
export function rowShapes(row: MuscleRowInput): RowShapes {
  const fromPositions = row.mainPositions.length > 0 || row.subPositions.length > 0;
  const primary = new Set(fromPositions ? positionShapeKeys(row.mainPositions) : groupShapeKeys(row.primaryGroup));
  const secondaryList = fromPositions
    ? positionShapeKeys(row.subPositions)
    : row.secondaryGroups.flatMap((group) => groupShapeKeys(group));
  const secondary = new Set(secondaryList.filter((key) => !primary.has(key)));
  return { primary, secondary };
}

/** 档位门槛（分数 = 主练组数 + 0.5 × 辅助组数）：> 0 一档，≥ 3 二档，≥ 6 三档。 */
export const LEVEL_THRESHOLDS = [3, 6] as const;

export const levelOf = (score: number): 0 | 1 | 2 | 3 =>
  score <= 0 ? 0 : score >= LEVEL_THRESHOLDS[1] ? 3 : score >= LEVEL_THRESHOLDS[0] ? 2 : 1;

export interface ShapeLoad {
  score: number;
  primarySets: number;
  secondarySets: number;
  level: 0 | 1 | 2 | 3;
  /** 只当过辅助肌。 */
  secondaryOnly: boolean;
  /** 练到这块的行。 */
  rows: Set<string>;
}

export interface MuscleLoad {
  byShape: Map<string, ShapeLoad>;
  byRow: Map<string, RowShapes>;
}

export function muscleLoad(rows: readonly MuscleRowInput[]): MuscleLoad {
  const byShape = new Map<string, ShapeLoad>();
  const byRow = new Map<string, RowShapes>();
  const bump = (key: string, rowId: string, sets: number, primary: boolean) => {
    const cur = byShape.get(key) ?? { score: 0, primarySets: 0, secondarySets: 0, level: 0, secondaryOnly: true, rows: new Set<string>() };
    if (primary) cur.primarySets += sets;
    else cur.secondarySets += sets;
    cur.score = cur.primarySets + cur.secondarySets * 0.5;
    cur.rows.add(rowId);
    byShape.set(key, cur);
  };
  for (const row of rows) {
    if (!(row.sets > 0)) continue;
    const shapes = rowShapes(row);
    byRow.set(row.id, shapes);
    for (const key of shapes.primary) bump(key, row.id, row.sets, true);
    for (const key of shapes.secondary) bump(key, row.id, row.sets, false);
  }
  for (const load of byShape.values()) {
    load.level = levelOf(load.score);
    load.secondaryOnly = load.primarySets === 0;
  }
  return { byShape, byRow };
}
