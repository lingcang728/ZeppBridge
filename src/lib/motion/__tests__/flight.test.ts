import { describe, expect, it } from 'vitest';
import { createFlight, handoffFrames } from '../flight';
import { HANDOFF_SPAN, turnedEase } from '../timing';

describe('handoffFrames', () => {
  it('holds, crosses in a short span at the given point, then holds', () => {
    expect(handoffFrames(0, 1, 0.4)).toEqual([
      { opacity: 0, offset: 0 },
      { opacity: 0, offset: 0.4 },
      { opacity: 1, offset: 0.4 + HANDOFF_SPAN },
      { opacity: 1, offset: 1 },
    ]);
  });

  it('starts at the very beginning without a duplicate first frame', () => {
    const frames = handoffFrames(1, 0, 0, 0.2);
    expect(frames).toEqual([{ opacity: 1, offset: 0 }, { opacity: 0, offset: 0.2 }, { opacity: 0, offset: 1 }]);
  });

  it('clamps a late handoff to the end of the timeline', () => {
    const frames = handoffFrames(0, 1, 0.95, 0.2);
    expect(frames[frames.length - 1]).toEqual({ opacity: 1, offset: 1 });
    expect(frames.every((frame, i) => i === 0 || Number(frame.offset) >= Number(frames[i - 1]!.offset))).toBe(true);
  });

  it('never goes outside 0..1', () => {
    for (const at of [-0.5, 0, 0.5, 1, 2]) {
      for (const frame of handoffFrames(0, 1, at)) {
        expect(Number(frame.offset)).toBeGreaterThanOrEqual(0);
        expect(Number(frame.offset)).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('turnedEase', () => {
  it('plays the same curve backwards in time', () => {
    expect(turnedEase('cubic-bezier(.4, .6, .2, 1)')).toBe('cubic-bezier(0.8, 0, 0.6, 0.4)');
  });

  it('leaves keywords alone', () => {
    expect(turnedEase('linear')).toBe('linear');
  });
});

describe('createFlight.startFromEnd', () => {
  it('seeks to duration before flipping playbackRate negative so WAAPI does not finish at t=0', () => {
    const events: string[] = [];
    let currentTime = 0;
    let rate = 1;
    const listeners = new Map<string, Array<() => void>>();
    const fakeAnim = {
      playState: 'running',
      pending: true,
      get currentTime() { return currentTime; },
      set currentTime(value: number) {
        events.push(`time:${value}`);
        currentTime = value;
      },
      get playbackRate() { return rate; },
      set playbackRate(value: number) {
        events.push(`rate:${value}`);
        rate = value;
        // Simulate Chromium WAAPI: setting negative rate while still at 0 immediately finishes reverse playback.
        if (rate < 0 && currentTime <= 0) {
          for (const fn of listeners.get('finish') ?? []) fn();
        }
      },
      addEventListener(type: string, fn: () => void) {
        listeners.set(type, [...(listeners.get(type) ?? []), fn]);
      },
      cancel() {
        events.push('cancel');
      },
    };
    const fakeEl = { animate: () => fakeAnim as unknown as Animation } as unknown as Element;

    let landedCount = 0;
    const flight = createFlight({ duration: 650, onLand: () => { landedCount += 1; } });
    flight.add(fakeEl, [{ opacity: 0 }, { opacity: 1 }]);
    flight.startFromEnd();

    expect(events.slice(0, 2)).toEqual(['time:650', 'rate:-1']);
    expect(landedCount).toBe(0);
    expect(flight.direction).toBe(-1);
    expect(flight.progress()).toBe(1);
  });
});

