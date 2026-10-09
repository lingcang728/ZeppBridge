import { describe, expect, it } from 'vitest';
import { WORKOUT_GLYPH } from '../workoutGlyphs';

describe('workout glyphs', () => {
  it('uses one shape per dimension and only changes role between average and max', () => {
    expect(WORKOUT_GLYPH.cadence).toEqual({ icon: 'steps', tone: 'activity', role: 'avg' });
    expect(WORKOUT_GLYPH.cadenceMax).toEqual({ icon: 'steps', tone: 'activity', role: 'max' });
    expect(WORKOUT_GLYPH.power).toEqual({ icon: 'power', tone: 'training', role: 'avg' });
    expect(WORKOUT_GLYPH.powerMax).toEqual({ icon: 'power', tone: 'training', role: 'max' });
    expect(WORKOUT_GLYPH.hr.icon).toBe(WORKOUT_GLYPH.hrMax.icon);
    expect(WORKOUT_GLYPH.pace).toEqual({ icon: 'pace', tone: 'pace', role: 'avg' });
    expect(WORKOUT_GLYPH.paceBest.icon).toBe('pace');
    expect(WORKOUT_GLYPH.time.icon).toBe(WORKOUT_GLYPH.pauses.icon);
  });
});
