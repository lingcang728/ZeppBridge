import { afterEach, describe, expect, it } from 'vitest';
import { eventSpanLabel, layoutEpochLabels, lifeEventMessages, overlapsEvent, validLifeEvent } from '../lifeEvents';
import { setLocale } from '../../i18n';
import type { LifeEventInput } from '../../types';

const event: LifeEventInput = { id: null, title: 'Resfriado', category: 'health',
  startDate: '2026-09-01', endDate: '2026-09-05', notes: '', epoch: false };

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

describe('eventSpanLabel', () => {
  afterEach(() => setLocale('zh'));
  it('single day, a span, and an ongoing event each read differently', () => {
    setLocale('en');
    expect(eventSpanLabel({ ...event, endDate: event.startDate })).toBe('9/1');
    expect(eventSpanLabel(event)).toBe('9/1–9/5');
    expect(eventSpanLabel({ ...event, endDate: null })).toBe('from 9/1');
  });
});

describe('layoutEpochLabels', () => {
  // 每个字 10px；30 个点、绘图区 290px，相邻两点 10px。
  const measure = (text: string) => text.length * 10;

  it('puts names that would touch on separate lines instead of stacking them', () => {
    const slots = layoutEpochLabels([
      { from: 0, to: 29, text: 'aaaaaaaaaaaa' },
      { from: 6, to: 29, text: 'bbbbbbbbbbbb' },
    ], 30, 290, measure);
    expect(slots.map((slot) => slot?.lane)).toEqual([0, 1]);
  });

  it('reuses the first line once the earlier name has ended', () => {
    const slots = layoutEpochLabels([
      { from: 0, to: 29, text: 'aaaa' },
      { from: 12, to: 29, text: 'bbbb' },
    ], 30, 290, measure);
    expect(slots.map((slot) => slot?.lane)).toEqual([0, 0]);
  });

  it('never lets a name run past its own band, and drops one that no line can hold', () => {
    const slots = layoutEpochLabels([
      { from: 0, to: 29, text: 'a'.repeat(40) },
      { from: 1, to: 29, text: 'bbbbbbbbbb' },
      { from: 2, to: 29, text: 'cccccccccc' },
      { from: 20, to: 22, text: 'dddddddddd' },
    ], 30, 290, measure);
    expect(slots[0]).toEqual({ lane: 0, width: 290 - 12 });
    expect(slots[1]?.lane).toBe(1);
    expect(slots[2]).toBeNull();
    // 只有两个点宽（20px）的区带写不下字。
    expect(slots[3]).toBeNull();
  });
});
