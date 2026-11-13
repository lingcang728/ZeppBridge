/* 人体分块图的共用类型。路径数据在 paths.ts（改编自 react-native-body-highlighter，MIT）。 */

export type AnatomyView = 'front' | 'back';
/** 这个人自己的左右；`c` 是中线上的整块（头、颈中段）。 */
export type AnatomySide = 'l' | 'r' | 'c';

export type AnatomySlug =
  | 'chest' | 'obliques' | 'abs' | 'biceps' | 'triceps' | 'neck' | 'trapezius' | 'deltoids'
  | 'adductors' | 'quadriceps' | 'knees' | 'tibialis' | 'calves' | 'forearm' | 'hands' | 'ankles'
  | 'feet' | 'head' | 'hair' | 'upper-back' | 'lower-back' | 'gluteal' | 'hamstring';

export interface AnatomyShape {
  slug: AnatomySlug;
  side: AnatomySide;
  d: string;
}

/** 素材里没有形状的部位（肘、腕、髋、跟腱、髂胫束）画成小椭圆。坐标是该视图的 viewBox 坐标。 */
export interface AnatomyMarker {
  id: string;
  view: AnatomyView;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/** 一块区域在图上的样子。没给就是没练 / 没选的底色。 */
export interface AnatomyRegionState {
  /** 负荷档位 1–3（力量卡）。 */
  level?: 0 | 1 | 2 | 3;
  /** 只当过辅助肌：加斜线。 */
  hatched?: boolean;
  /** 伤病选中。 */
  selected?: boolean;
  /** 以前伤过、淡淡标出。 */
  marked?: boolean;
  /** 联动时不相关的部分变淡。 */
  dim?: boolean;
  /** 指针或焦点正停在上面。 */
  hot?: boolean;
}

/** 图上一块能交互的区域：形状由若干 (slug, side) 拼成，或是一个椭圆标记。 */
export interface AnatomyRegion {
  /** 交互和状态用的键，调用方自己定（力量卡是肌肉，伤病图是身体部位）。 */
  key: string;
  label: string;
  shapes: Array<{ slug: AnatomySlug; side: AnatomySide }>;
  markers?: AnatomyMarker[];
}

export const shapeKey = (view: AnatomyView, slug: AnatomySlug, side: AnatomySide) => `${view}:${slug}:${side}`;
