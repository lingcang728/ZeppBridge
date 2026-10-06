import { describe, expect, it } from 'vitest';
import {
  documentIndexOf, lengthText, setRepeat, setStepLength, setStepTarget, setText, shiftHeartRate, snapSeconds, targetText, workoutToInput,
} from '../edit';
import type { PlanDocument, PlanWorkout } from '../../../types/trainingPlan';

const doc = (): PlanDocument => ({ workouts: [
  { date: '2026-10-07', sport: 'walking', name: 'Walk', steps: [] },
  { date: '2026-10-07', sport: 'running', name: 'Intervals', focus: 'Speed', description: 'Even reps', steps: [
    { kind: 'warmup', duration: '10 min', target: 'hr 110-130' },
    { repeat: 3, steps: [{ kind: 'interval', duration: '4min', target: 'hr 160-170' }, { kind: 'recovery', duration: '2min' }] },
  ] },
] });

describe('structured plan edits write back the plan text format', () => {
  it('formats lengths and targets the way the parser reads them', () => {
    expect(lengthText({ type: 'time', seconds: 180 })).toBe('3min');
    expect(lengthText({ type: 'time', seconds: 90 })).toBe('90s');
    expect(lengthText({ type: 'distance', meters: 5000 })).toBe('5km');
    expect(lengthText({ type: 'distance', meters: 400 })).toBe('400m');
    expect(targetText({ type: 'heart_rate', low: 128, high: 138 })).toBe('hr 128-138');
    expect(targetText({ type: 'pace', fast: 300, slow: 330 })).toBe('pace 5:00-5:30');
    expect(targetText({ type: 'power', low: 150, high: 180 })).toBe('power 150-180');
    expect(targetText({ type: 'open' })).toBeUndefined();
  });

  it('changing one step inside a repeat changes every round (it is written once)', () => {
    const next = setStepLength(doc(), 1, [1, 0], { type: 'time', seconds: 180 });
    const repeat = next.workouts[1]!.steps[1] as { repeat: number; steps: { duration: string }[] };
    expect(repeat.steps[0]!.duration).toBe('3min');
    expect(repeat.repeat).toBe(3);
    expect((doc().workouts[1]!.steps[1] as { steps: { duration: string }[] }).steps[0]!.duration).toBe('4min');
  });

  it('switches a target type and can drop the target entirely', () => {
    const paced = setStepTarget(doc(), 1, [0], { type: 'pace', fast: 330, slow: 360 });
    expect((paced.workouts[1]!.steps[0] as { target?: string }).target).toBe('pace 5:30-6:00');
    const open = setStepTarget(doc(), 1, [0], { type: 'open' });
    expect('target' in (open.workouts[1]!.steps[0] as object)).toBe(false);
  });

  it('clamps repeats to 1–50 and clears empty purpose / description so validation can flag them', () => {
    expect((setRepeat(doc(), 1, 1, 80).workouts[1]!.steps[1] as { repeat: number }).repeat).toBe(50);
    expect(setText(doc(), 1, 'focus', '   ').workouts[1]!.focus).toBeUndefined();
    expect(setText(doc(), 1, 'description', 'Relax').workouts[1]!.description).toBe('Relax');
  });

  it('maps the k-th validated workout of a day back to its index in the draft, skipping blocked ones', () => {
    expect(documentIndexOf(doc(), '2026-10-07', 0, new Set([0]))).toBe(1);
    expect(documentIndexOf(doc(), '2026-10-07', 1, new Set([0]))).toBeNull();
  });

  it('snaps dragged durations and heart rates', () => {
    expect(snapSeconds(100)).toBe(90);
    expect(snapSeconds(10)).toBe(30);
    expect(snapSeconds(250)).toBe(240);
    expect(shiftHeartRate({ type: 'heart_rate', low: 160, high: 170 }, 7)).toEqual({ type: 'heart_rate', low: 165, high: 175 });
    expect(shiftHeartRate({ type: 'heart_rate', low: 160, high: 170 }, 80, 190)).toEqual({ type: 'heart_rate', low: 180, high: 190 });
  });

  it('turns a sent workout back into text that round-trips', () => {
    const sent: PlanWorkout = { date: '2026-10-08', sport: 'cycling', variant: 'indoor', name: 'Ride', focus: 'Base', description: 'Easy', steps: [
      { type: 'step', intensity: 'active', length: { type: 'time', seconds: 3600 }, target: { type: 'power', low: 150, high: 180 } },
      { type: 'repeat', times: 2, steps: [{ intensity: 'interval', length: { type: 'distance', meters: 1000 }, target: { type: 'open' } }] },
    ] };
    expect(workoutToInput(sent)).toEqual({ date: '2026-10-08', sport: 'cycling', variant: 'indoor', name: 'Ride', focus: 'Base', description: 'Easy', steps: [
      { kind: 'active', duration: '60min', target: 'power 150-180' },
      { repeat: 2, steps: [{ kind: 'interval', duration: '1km' }] },
    ] });
  });
});
