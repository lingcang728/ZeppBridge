import type { DesignIconName } from '../components/DesignIcon.vue';
import type { GlyphTone } from './glyphs';

/** 同一维度共用一只图标；平均 / 最大 / 最小只靠深浅分开。 */
export type MetricRole = 'avg' | 'max' | 'min' | 'none';

export interface WorkoutGlyph {
  icon: DesignIconName;
  tone: GlyphTone;
  role: MetricRole;
}

export const WORKOUT_GLYPH = {
  distance: { icon: 'outdoor-run', tone: 'activity', role: 'none' },
  time: { icon: 'auto-sync', tone: 'training', role: 'none' },
  route: { icon: 'outdoor-run', tone: 'activity', role: 'none' },
  samples: { icon: 'structured-data', tone: 'neutral', role: 'none' },
  pauses: { icon: 'auto-sync', tone: 'training', role: 'none' },
  cadence: { icon: 'steps', tone: 'activity', role: 'avg' },
  cadenceMax: { icon: 'steps', tone: 'activity', role: 'max' },
  stride: { icon: 'stride', tone: 'activity', role: 'avg' },
  ascent: { icon: 'health-watch', tone: 'altitude', role: 'none' },
  descent: { icon: 'health-watch', tone: 'altitude', role: 'none' },
  hr: { icon: 'heart-rate', tone: 'heart', role: 'avg' },
  hrMax: { icon: 'heart-rate', tone: 'heart', role: 'max' },
  power: { icon: 'power', tone: 'training', role: 'avg' },
  powerMax: { icon: 'power', tone: 'training', role: 'max' },
  contact: { icon: 'contact', tone: 'activity', role: 'avg' },
  oscillation: { icon: 'oscillation', tone: 'activity', role: 'avg' },
  ratio: { icon: 'ratio', tone: 'activity', role: 'avg' },
  pace: { icon: 'pace', tone: 'pace', role: 'avg' },
  paceBest: { icon: 'pace', tone: 'pace', role: 'max' },
} as const satisfies Record<string, WorkoutGlyph>;
