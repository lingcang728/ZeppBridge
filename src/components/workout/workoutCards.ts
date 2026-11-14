/**
 * 运动详情台前调度的卡片注册表（2026-11-13）：有哪些卡、侧栏里的排序、图标。
 * 哪张卡这次能显示由页面（WorkoutDetail）按数据决定——没有数据的卡直接不出现，不放空卡。
 * 卡的内容由页面按 id 填进 StageShell 的同名插槽。
 */
import type { DesignIconName } from '../DesignIcon.vue';
import type { GlyphTone } from '../../lib/glyphs';
import type { Column } from '../../lib/stage/layout';

export const WORKOUT_CARDS = [
  'summary', 'insight', 'strength-sets', 'strength-map', 'route', 'climbs',
  'chart-heart', 'chart-pace', 'chart-altitude', 'chart-cadence', 'hr-zones', 'series-status',
  'decoded', 'export', 'feel', 'provenance',
] as const;
export type WorkoutCardId = (typeof WORKOUT_CARDS)[number];

/**
 * 舞台上能伸的卡 → 放不下时最多能缩多少像素（2026-11-14 用户：舞台下面空一大块）。
 * 一列 / 一行剩下的高交给它们（--fill-extra 加到图或地图的高上）；放不下时跟着缩，但不超过这里的数：
 * 图本身最矮 170（WorkoutChartCard），CSS 底线 120，所以最多缩 50；地图画布 320 → 底线 160。缩过了底线量高就减不准。
 * 文字卡不在里面——拉长了里面只会空一截。肌肉图按宽定大小，拉高也只是空白，也不在里面。
 */
const CHART_SHRINK = 50;
export const GROW_CARDS: ReadonlyMap<string, number> = new Map([
  ['route', 160], ['chart-heart', CHART_SHRINK], ['chart-pace', CHART_SHRINK], ['chart-altitude', CHART_SHRINK], ['chart-cadence', CHART_SHRINK],
]);
/** 横向的宽卡：组里打头的是它时默认让它占整行（3 张主卡在上、4 张上一下三），不被塞进窄列。 */
export const WIDE_CARDS: ReadonlySet<string> = new Set(['summary', 'insight', 'strength-sets', 'route', 'chart-heart', 'chart-pace', 'chart-altitude', 'chart-cadence']);

/** 窄窗口里同组时缩成舞台右上角画中画的卡（翻逐组明细时肌肉图一直看得见）。 */
export const PIP_CARDS: ReadonlySet<string> = new Set(['strength-map']);

/**
 * 老版两栏（「全部卡片」）里各卡的栏位，照 2026-11-13 之前的页面：概要（原头图）、洞察通栏；
 * 解码、导出、感受在右侧栏；数据来源排进较矮的那栏；其余在主栏。
 */
export const CLASSIC_COLUMNS: Readonly<Record<string, Column>> = {
  summary: 'full', insight: 'full', decoded: 'side', export: 'side', feel: 'side', provenance: 'float',
};

export interface StageCard {
  id: string;
  title: string;
  icon: DesignIconName;
  tone: GlyphTone;
}

export const CARD_GLYPHS: Record<string, { icon: DesignIconName; tone: GlyphTone }> = {
  summary: { icon: 'outdoor-run', tone: 'activity' },
  insight: { icon: 'training-load', tone: 'accent' },
  'strength-sets': { icon: 'power', tone: 'training' },
  'strength-map': { icon: 'body-activity', tone: 'training' },
  route: { icon: 'outdoor-run', tone: 'activity' },
  climbs: { icon: 'health-watch', tone: 'altitude' },
  'hr-zones': { icon: 'heart-rate', tone: 'heart' },
  'series-status': { icon: 'structured-data', tone: 'neutral' },
  decoded: { icon: 'structured-data', tone: 'pace' },
  export: { icon: 'document', tone: 'sleep' },
  feel: { icon: 'recovery', tone: 'heart' },
  provenance: { icon: 'database', tone: 'altitude' },
};

/** 按注册表顺序排（侧栏默认顺序就是它）。 */
export const inCardOrder = (ids: Iterable<string>): string[] => {
  const set = new Set(ids);
  return WORKOUT_CARDS.filter((id) => set.has(id));
};
