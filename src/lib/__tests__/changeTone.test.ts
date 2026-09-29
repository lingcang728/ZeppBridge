import { describe, expect, it } from 'vitest';
import { changeArrow, changeTone } from '../changeTone';

const fact = (fact_id: string, direction: string) => ({ fact_id, comparison: { direction } as never });

describe('changeTone', () => {
  it('does not call more training or more sleep "better"', () => {
    for (const id of ['weekly.workout_count', 'weekly.training_load', 'weekly.sleep_duration', 'run.distance', 'run.training_load']) {
      expect(changeTone(fact(id, 'higher'))).toBe('neutral');
      expect(changeTone(fact(id, 'lower'))).toBe('neutral');
    }
  });

  it('keeps the metrics that do have an agreed direction', () => {
    expect(changeTone(fact('weekly.resting_hr', 'lower'))).toBe('good');
    expect(changeTone(fact('weekly.stress', 'higher'))).toBe('bad');
    expect(changeTone(fact('weekly.hrv', 'higher'))).toBe('good');
    expect(changeTone(fact('run.pace', 'higher'))).toBe('bad');
  });

  it('is flat without a comparison or without change', () => {
    expect(changeTone({ fact_id: 'weekly.hrv', comparison: null as never })).toBe('flat');
    expect(changeTone(fact('weekly.hrv', 'same'))).toBe('flat');
    expect(changeArrow(fact('weekly.training_load', 'higher'))).toBe('↑');
  });
});
