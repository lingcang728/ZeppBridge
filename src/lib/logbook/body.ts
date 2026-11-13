/**
 * 人形图（伤病、酸痛共用）：能点的身体部位，以及它们画在正面 / 背面哪儿。
 *
 * 部位名单和后端 `storage/logbook/mod.rs` 的 `BODY_PARTS` 是同一份（tests/logbook-body-parts.test.mjs 守着），
 * 后端只收名单里的。画在 lib/anatomy 的人体分块图上（改编自 react-native-body-highlighter）。
 *
 * 左右是**这个人自己**的左右：正面图里他的左边在看的人右手边，背面图里在左手边。
 * 素材的块本来就按这个人自己的左右分好了，部位后缀直接对上。
 */
import type { AnatomyMarker, AnatomySide, AnatomySlug, AnatomyView } from '../anatomy/types';

export const BODY_PARTS = [
  'neck', 'shoulder_l', 'shoulder_r', 'upper_back', 'lower_back', 'chest', 'abdomen',
  'hip_l', 'hip_r', 'glute_l', 'glute_r', 'quad_l', 'quad_r', 'hamstring_l', 'hamstring_r',
  'knee_l', 'knee_r', 'shin_l', 'shin_r', 'calf_l', 'calf_r', 'achilles_l', 'achilles_r',
  'ankle_l', 'ankle_r', 'foot_l', 'foot_r', 'it_band_l', 'it_band_r',
  'head', 'upper_arm_l', 'upper_arm_r', 'elbow_l', 'elbow_r', 'forearm_l', 'forearm_r',
  'wrist_l', 'wrist_r', 'hand_l', 'hand_r',
] as const;
export type BodyPart = (typeof BODY_PARTS)[number];
/** `knee_l` → `['knee', 'l']`；中线部位 side 为 null。 */
export const splitPart = (part: string): [string, 'l' | 'r' | null] => {
  const match = /^(.*)_(l|r)$/.exec(part);
  return match ? [match[1], match[2] as 'l' | 'r'] : [part, null];
};

/** 人体分块图（lib/anatomy）上，一个部位由哪些块组成；素材里没有形状的部位画成小椭圆。 */
export interface BodyPartPlace {
  shapes: Array<{ slug: AnatomySlug; side: AnatomySide }>;
  markers: AnatomyMarker[];
}

/* 正面图中线 x = 364，背面 x = 1083.5（素材坐标，见 lib/anatomy/paths.ts）。
   标记点只写这个人**左边**那一份：正面图里在看的人右手边，背面图里在左手边；右边按中线镜像。 */
const MIRROR: Record<AnatomyView, number> = { front: 728, back: 2167 };
const LEFT_MARKERS: Record<string, Array<[AnatomyView, number, number, number, number]>> = {
  elbow: [['front', 528, 497, 15, 15], ['back', 912, 527, 15, 15]],
  wrist: [['front', 600, 690, 12, 12], ['back', 850, 690, 12, 12]],
  hip: [['front', 466, 655, 20, 15]],
  it_band: [['front', 481, 800, 9, 70], ['back', 966, 850, 9, 75]],
  achilles: [['back', 1004, 1240, 9, 24]],
};
/** 部位基本名 → 素材里的块（两侧同名，侧由部位后缀决定；中线部位三份都要）。 */
const SLUGS: Record<string, AnatomySlug[]> = {
  head: ['head', 'hair'], neck: ['neck'], chest: ['chest'], abdomen: ['abs', 'obliques'],
  upper_back: ['trapezius', 'upper-back'], lower_back: ['lower-back'], shoulder: ['deltoids'],
  upper_arm: ['biceps', 'triceps'], forearm: ['forearm'], hand: ['hands'], glute: ['gluteal'],
  quad: ['quadriceps'], hamstring: ['hamstring'], knee: ['knees'], shin: ['tibialis'],
  calf: ['calves'], ankle: ['ankles'], foot: ['feet'],
};

export const BODY_PART_PLACES: Readonly<Record<BodyPart, BodyPartPlace>> = Object.fromEntries(
  BODY_PARTS.map((part) => {
    const [base, side] = splitPart(part);
    const sides: AnatomySide[] = side ? [side] : ['l', 'r', 'c'];
    const shapes = (SLUGS[base] ?? []).flatMap((slug) => sides.map((s) => ({ slug, side: s })));
    const markers = (LEFT_MARKERS[base] ?? []).map(([view, cx, cy, rx, ry]) => ({
      id: `${part}-${view}`, view, cx: side === 'r' ? MIRROR[view] - cx : cx, cy, rx, ry,
    }));
    return [part, { shapes, markers }];
  }),
) as Record<BodyPart, BodyPartPlace>;

export const isBodyPart = (value: string): value is BodyPart => (BODY_PARTS as readonly string[]).includes(value);
