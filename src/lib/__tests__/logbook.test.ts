import { describe, expect, it } from 'vitest';
import { BODY_PARTS, BODY_PART_PLACES, splitPart } from '../logbook/body';
import { BACK_SHAPES, FRONT_SHAPES } from '../anatomy/paths';
import { clockText, daysBetween, paceOf, parseClock, raceDistanceKey } from '../logbook/clock';

describe('body map', () => {
  const drawn = new Set([...FRONT_SHAPES, ...BACK_SHAPES].map(shape => `${shape.slug}:${shape.side}`));

  it('every body part lands on at least one drawn shape or marker', () => {
    const missing = BODY_PARTS.filter((part) => {
      const place = BODY_PART_PLACES[part];
      return !place.markers.length && !place.shapes.some(s => drawn.has(`${s.slug}:${s.side}`));
    });
    expect(missing).toEqual([]);
  });

  it('no two parts claim the same shape', () => {
    const owner = new Map<string, string>();
    for (const part of BODY_PARTS) for (const s of BODY_PART_PLACES[part].shapes) {
      const key = `${s.slug}:${s.side}`;
      expect(owner.get(key), key).toBeUndefined();
      owner.set(key, part);
    }
  });

  it('puts the person’s own left on the viewer’s right from the front and on the left from the back', () => {
    const elbow = BODY_PART_PLACES.elbow_l.markers;
    expect(elbow.find(m => m.view === 'front')!.cx).toBeGreaterThan(364);
    expect(elbow.find(m => m.view === 'back')!.cx).toBeLessThan(1083.5);
    expect(BODY_PART_PLACES.achilles_r.markers[0].cx).toBeGreaterThan(1083.5);
    expect(BODY_PART_PLACES.knee_l.shapes).toEqual([{ slug: 'knees', side: 'l' }]);
    expect(splitPart('it_band_r')).toEqual(['it_band', 'r']);
    expect(splitPart('neck')).toEqual(['neck', null]);
  });
});

describe('race clock', () => {
  it('reads what people type and refuses what it cannot read', () => {
    expect(parseClock('1:45:00')).toBe(6300);
    expect(parseClock('45:30')).toBe(2730);
    expect(parseClock('2730')).toBe(2730);
    expect(parseClock('1:75:00')).toBeNull();
    expect(parseClock('abc')).toBeNull();
    expect(parseClock('')).toBeNull();
    expect(parseClock('0:00')).toBeNull();
  });

  it('writes clocks, paces, countdowns and distance names', () => {
    expect(clockText(6300)).toBe('1:45:00');
    expect(clockText(1338)).toBe('22:18');
    expect(paceOf(2806, 10000)).toBeCloseTo(280.6);
    expect(paceOf(2806, null)).toBeNull();
    expect(daysBetween('2026-10-22', '2026-11-29')).toBe(38);
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(raceDistanceKey(21097)).toBe('half');
    expect(raceDistanceKey(15000)).toBeNull();
  });
});
