import { describe, expect, it } from 'vitest';
import { BODY_PARTS, BODY_REGIONS, nearestBodyRegion, splitPart } from '../logbook/body';
import { clockText, daysBetween, paceOf, parseClock, raceDistanceKey } from '../logbook/clock';

describe('body map', () => {
  it('every body part can be clicked on at least one side of the figure', () => {
    const drawn = new Set(BODY_REGIONS.map(region => region.part));
    expect(BODY_PARTS.filter(part => !drawn.has(part))).toEqual([]);
  });

  it('puts the person’s own left on the viewer’s right from the front and on the left from the back', () => {
    const knee = BODY_REGIONS.find(region => region.part === 'knee_l' && region.view === 'front')!;
    const calf = BODY_REGIONS.find(region => region.part === 'calf_l' && region.view === 'back')!;
    expect(knee.cx).toBeGreaterThan(60);
    expect(calf.cx).toBeLessThan(60);
    expect(splitPart('it_band_r')).toEqual(['it_band', 'r']);
    expect(splitPart('neck')).toEqual(['neck', null]);
  });

  it('snaps nearby clicks to the closest region and ignores clicks far off the body', () => {
    expect(nearestBodyRegion('front', 72, 204)?.part).toBe('knee_l');
    expect(nearestBodyRegion('back', 71, 258)?.part).toBe('achilles_r');
    expect(nearestBodyRegion('front', 14, 10)).toBeNull();
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
