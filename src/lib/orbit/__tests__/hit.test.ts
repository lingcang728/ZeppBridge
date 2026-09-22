import { describe, expect, it } from 'vitest';
import { JOIN_MARGIN, LEAVE_MARGIN, classifyDrop, dragIntentFor, hitThresholds } from '../hit';
import { candidateRadius, memberRadius } from '../slots';

const W = 800;
const H = 600;

describe('orbit drop hit-testing', () => {
  it('derives join/leave thresholds from the ring radii with the contract margins', () => {
    const t = hitThresholds(W, H);
    expect(t.memberR).toBeCloseTo(memberRadius(W, H), 6);
    expect(t.candidateR).toBeCloseTo(candidateRadius(W, H), 6);
    expect(t.join).toBeCloseTo(t.memberR + JOIN_MARGIN, 6);
    expect(t.leave).toBeCloseTo(t.candidateR + LEAVE_MARGIN, 6);
    expect(JOIN_MARGIN).toBe(48);
    expect(LEAVE_MARGIN).toBe(40);
    // The hysteresis dead band exists: leave is strictly beyond join.
    expect(t.leave).toBeGreaterThan(t.join);
  });

  it('classifies inside the join radius as join', () => {
    const t = hitThresholds(W, H);
    expect(classifyDrop(0, t)).toBe('join');
    expect(classifyDrop(t.join - 0.001, t)).toBe('join');
  });

  it('classifies beyond the leave radius as leave', () => {
    const t = hitThresholds(W, H);
    expect(classifyDrop(t.leave + 0.001, t)).toBe('leave');
    expect(classifyDrop(10_000, t)).toBe('leave');
  });

  it('keeps the band between the two thresholds neutral (hysteresis)', () => {
    const t = hitThresholds(W, H);
    expect(classifyDrop(t.join, t)).toBe('keep'); // boundary is strict
    expect(classifyDrop((t.join + t.leave) / 2, t)).toBe('keep');
    expect(classifyDrop(t.leave, t)).toBe('keep');
  });

  it('dragIntentFor mirrors the drop class, neutral inside the band', () => {
    const t = hitThresholds(W, H);
    expect(dragIntentFor(0, t)).toBe('join');
    expect(dragIntentFor(t.leave + 1, t)).toBe('leave');
    expect(dragIntentFor((t.join + t.leave) / 2, t)).toBeNull();
  });

  it('scales thresholds with the canvas size', () => {
    const small = hitThresholds(400, 300);
    const large = hitThresholds(1600, 1200);
    expect(small.memberR).toBeCloseTo(90, 6);
    expect(large.memberR).toBeCloseTo(360, 6);
    expect(small.join).toBeLessThan(large.join);
  });
});
