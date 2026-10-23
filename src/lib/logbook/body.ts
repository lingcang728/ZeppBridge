/**
 * 人形图（伤病、酸痛共用）：能点的身体部位，以及它们画在正面 / 背面哪儿。
 *
 * 部位名单和后端 `storage/logbook/mod.rs` 的 `BODY_PARTS` 是同一份（tests/logbook-body-parts.test.mjs 守着），
 * 后端只收名单里的。每个人形宽 120、高 300，中线 x = 60。
 *
 * 左右是**这个人自己**的左右：正面图里他的左边在看的人右手边，背面图里在左手边。
 * 所以区域只写看的人右半边的一份，另一半按中线镜像，后缀由「哪一面」决定。
 */
export const BODY_PARTS = [
  'neck', 'shoulder_l', 'shoulder_r', 'upper_back', 'lower_back', 'chest', 'abdomen',
  'hip_l', 'hip_r', 'glute_l', 'glute_r', 'quad_l', 'quad_r', 'hamstring_l', 'hamstring_r',
  'knee_l', 'knee_r', 'shin_l', 'shin_r', 'calf_l', 'calf_r', 'achilles_l', 'achilles_r',
  'ankle_l', 'ankle_r', 'foot_l', 'foot_r', 'it_band_l', 'it_band_r',
] as const;
export type BodyPart = (typeof BODY_PARTS)[number];
export type BodyView = 'front' | 'back';

export interface BodyRegion {
  part: BodyPart;
  view: BodyView;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/** 中线上的部位：一面一个，不分左右。 */
const MIDLINE: [string, BodyView, number, number, number][] = [
  ['neck', 'front', 38, 6, 5],
  ['chest', 'front', 70, 19, 11],
  ['abdomen', 'front', 102, 14, 17],
  ['neck', 'back', 38, 6, 5],
  ['upper_back', 'back', 74, 19, 14],
  ['lower_back', 'back', 108, 13, 11],
];
/** 分左右的部位：只写看的人右半边那一份（cx > 60）。 */
const SIDED: [string, BodyView, number, number, number, number][] = [
  ['shoulder', 'front', 84, 53, 8, 7],
  ['hip', 'front', 71, 133, 8, 6],
  ['quad', 'front', 69, 166, 7.5, 21],
  ['it_band', 'front', 79.5, 168, 3, 21],
  ['knee', 'front', 70, 204, 6.5, 6.5],
  ['shin', 'front', 70, 234, 4.5, 20],
  ['ankle', 'front', 69, 266, 4.5, 4],
  ['foot', 'front', 72, 280, 7, 4],
  ['shoulder', 'back', 84, 53, 8, 7],
  ['glute', 'back', 70, 140, 10, 10],
  ['hamstring', 'back', 69, 176, 7.5, 20],
  ['it_band', 'back', 79.5, 168, 3, 21],
  ['calf', 'back', 71, 228, 6, 17],
  ['achilles', 'back', 69.5, 257, 2.5, 8],
];

export const BODY_REGIONS: BodyRegion[] = [
  ...MIDLINE.map(([part, view, cy, rx, ry]) => ({ part: part as BodyPart, view, cx: 60, cy, rx, ry })),
  ...SIDED.flatMap(([base, view, cx, cy, rx, ry]) => {
    // 看的人右手边：正面是这个人的左，背面是这个人的右。
    const near = view === 'front' ? 'l' : 'r';
    const far = near === 'l' ? 'r' : 'l';
    return [
      { part: `${base}_${near}` as BodyPart, view, cx, cy, rx, ry },
      { part: `${base}_${far}` as BodyPart, view, cx: 120 - cx, cy, rx, ry },
    ];
  }),
];

export const isBodyPart = (value: string): value is BodyPart => (BODY_PARTS as readonly string[]).includes(value);

/** `knee_l` → `['knee', 'l']`；中线部位 side 为 null。 */
export const splitPart = (part: string): [string, 'l' | 'r' | null] => {
  const match = /^(.*)_(l|r)$/.exec(part);
  return match ? [match[1], match[2] as 'l' | 'r'] : [part, null];
};

/**
 * 点哪儿都算数：取离指针最近的部位。在某个椭圆里面按「离中心多近」比（小部位叠在大部位上也点得中），
 * 在外面按到椭圆边的近似距离比；超过 `reach` 个单位（手、头顶、身体外的空白）就不算。
 */
export function nearestBodyRegion(view: BodyView, x: number, y: number, reach = 10): BodyRegion | null {
  let best: BodyRegion | null = null;
  let bestScore = Infinity;
  for (const region of BODY_REGIONS) {
    if (region.view !== view) continue;
    const dx = x - region.cx;
    const dy = y - region.cy;
    const k = Math.hypot(dx / region.rx, dy / region.ry);
    const score = k <= 1 ? k - 1 : Math.hypot(dx, dy) * (1 - 1 / k);
    if (score < bestScore) { bestScore = score; best = region; }
  }
  return best && bestScore <= reach ? best : null;
}
