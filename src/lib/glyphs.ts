import type { IconName } from '../components/Icon.vue';
import type { DesignIconName } from '../components/DesignIcon.vue';

/** 图标底座的颜色语义。和 tokens.css 的类别色一一对应，不在这里写颜色值。 */
export type GlyphTone =
  | 'neutral'
  | 'accent'
  | 'heart'
  | 'sleep'
  | 'activity'
  | 'training'
  | 'pace'
  | 'calories'
  | 'altitude';

export interface GlyphSpec {
  /** 用 SVG 图形画；`image` 为真时仍用原来的品牌图片。 */
  glyph?: IconName;
  tone: GlyphTone;
  image?: boolean;
  /** 永远不画底座（箭头这类行内符号）。 */
  bare?: boolean;
}

/**
 * 旧 3D 图标名 → 图形 + 类别色。
 *
 * 颜色按「这是什么数据」给，不按「图标长什么样」给：身体状态卡是恢复 / 心率，
 * 所以是心率红；训练状态是训练负荷，所以是训练青柠——卡片上的曲线用同一个色。
 */
const GLYPHS: Record<DesignIconName, GlyphSpec> = {
  'ai-ready': { glyph: 'spark', tone: 'accent' },
  'app-icon': { tone: 'accent', image: true },
  'auto-sync': { glyph: 'clock', tone: 'training' },
  'body-activity': { glyph: 'activity', tone: 'activity' },
  'brand-mark': { tone: 'accent', image: true },
  'browser-login': { glyph: 'globe', tone: 'neutral' },
  'chevron-right': { glyph: 'chevron-right', tone: 'neutral', bare: true },
  'cloud-output': { glyph: 'export', tone: 'accent' },
  database: { glyph: 'database', tone: 'neutral' },
  document: { glyph: 'file', tone: 'neutral' },
  handoff: { glyph: 'send', tone: 'accent' },
  'health-watch': { glyph: 'mountain', tone: 'altitude' },
  'heart-rate': { glyph: 'heart', tone: 'heart' },
  maintenance: { glyph: 'wrench', tone: 'neutral' },
  'manual-entry': { glyph: 'edit', tone: 'neutral' },
  'outdoor-cycling': { glyph: 'bike', tone: 'activity' },
  'outdoor-run': { glyph: 'run', tone: 'activity' },
  overview: { glyph: 'grid', tone: 'neutral' },
  private: { glyph: 'lock', tone: 'accent' },
  profile: { glyph: 'user', tone: 'neutral' },
  recovery: { glyph: 'battery-heart', tone: 'heart' },
  'resting-heart-rate': { glyph: 'heart-rest', tone: 'heart' },
  secure: { glyph: 'shield', tone: 'accent' },
  settings: { glyph: 'gear', tone: 'neutral' },
  sleep: { glyph: 'moon', tone: 'sleep' },
  'sleep-waves': { glyph: 'moon', tone: 'sleep' },
  steps: { glyph: 'steps', tone: 'activity' },
  'structured-data': { glyph: 'braces', tone: 'neutral' },
  'training-load': { glyph: 'gauge', tone: 'training' },
  verified: { glyph: 'circle-check', tone: 'accent' },
  'vo2-max': { glyph: 'vo2', tone: 'training' },
  'zepp-cloud': { tone: 'accent', image: true },
};

export const glyphFor = (name: DesignIconName): GlyphSpec => GLYPHS[name];
