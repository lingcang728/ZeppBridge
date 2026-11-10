import { describe, expect, it } from 'vitest';
import { importReportText } from '../importReportText';

const words = {
  added: (n: number) => `added ${n}`,
  health: (n: number) => `health ${n}`,
  nothingNew: 'nothing',
  duplicates: (n: number) => `dup ${n}`,
  unreadable: (n: number) => `bad ${n}`,
};
const report = (added: number, health: number, duplicates = 0, unreadable = 0) =>
  ({ batch_id: null, added, health_added: health, duplicates, unreadable });

describe('importReportText', () => {
  it('says nothing new only when neither workouts nor health came in', () => {
    expect(importReportText(report(0, 0, 3), words)).toBe('nothing · dup 3');
    expect(importReportText(report(0, 12), words)).toBe('health 12');
    expect(importReportText(report(2, 5, 1, 4), words)).toBe('added 2 · health 5 · dup 1 · bad 4');
  });
});
