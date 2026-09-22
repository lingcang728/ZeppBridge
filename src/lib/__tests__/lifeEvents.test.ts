import { describe, expect, it } from 'vitest';
import { lifeEventMessages, overlapsEvent, validLifeEvent } from '../lifeEvents';
import type { LifeEventInput } from '../../types';

const event: LifeEventInput = { id: null, title: 'Resfriado', category: 'health',
  startDate: '2026-09-01', endDate: '2026-09-05', notes: '' };

describe('life events calendar context', () => {
  it('includes either boundary and open ranges without timezone conversion', () => {
    expect(overlapsEvent(event, '2026-09-05', '2026-09-10')).toBe(true);
    expect(overlapsEvent(event, '2026-08-31', '2026-09-01')).toBe(true);
    expect(overlapsEvent(event, '2026-09-06', '2026-09-10')).toBe(false);
    expect(overlapsEvent({ ...event, endDate: null }, '2027-01-01', '2027-02-01')).toBe(true);
    expect(overlapsEvent(event, '2026-08-01', '2026-08-31')).toBe(false);
  });
  it('rejects impossible, reversed and non-calendar dates', () => {
    expect(validLifeEvent(event)).toBe(true);
    for (const startDate of ['2026-02-30', '2026-9-01', '2026-09-01T00:00:00Z']) {
      expect(validLifeEvent({ ...event, startDate })).toBe(false);
    }
    expect(validLifeEvent({ ...event, title: '  ' })).toBe(false);
    expect(validLifeEvent({ ...event, endDate: '2026-08-31' })).toBe(false);
  });
  it('has Spanish translations for every new English label, without fallback', () => {
    function compare(en: Record<string, unknown>, es: Record<string, unknown>) {
      for (const [key, value] of Object.entries(en)) {
        if (typeof value === 'object') compare(value as Record<string, unknown>, es[key] as Record<string, unknown>);
        else { expect(es[key], key).toBeTruthy(); expect(es[key], key).not.toBe(value); }
      }
    }
    compare(lifeEventMessages.en, lifeEventMessages.es);
  });
});
