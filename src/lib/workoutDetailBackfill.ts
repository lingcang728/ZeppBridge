import type { WorkoutDetailCoverage } from './bridge/types';

export type BackfillExit = 'complete' | 'stopped' | 'stalled' | 'limit';

/** Each backend call is a bounded batch. Never spin on another channel's queue. */
export async function runDetailBackfill(options: {
  fetchBatch: (retry: boolean) => Promise<WorkoutDetailCoverage>;
  retry: boolean;
  shouldStop: () => boolean;
  onProgress: (coverage: WorkoutDetailCoverage) => void;
  betweenBatches: () => Promise<void>;
  maxBatches?: number;
}): Promise<BackfillExit> {
  let previous: WorkoutDetailCoverage | null = null;
  const limit = options.maxBatches ?? 100;
  for (let batch = 0; batch < limit; batch += 1) {
    if (options.shouldStop()) return 'stopped';
    const next = await options.fetchBatch(batch === 0 && options.retry);
    options.onProgress(next);
    if (options.shouldStop()) return 'stopped';
    if (next.ready <= 0) return 'complete';
    if (previous && (Object.keys(next) as (keyof WorkoutDetailCoverage)[])
      .every((key) => next[key] === previous![key])) return 'stalled';
    previous = { ...next };
    if (batch + 1 < limit) await options.betweenBatches();
  }
  return 'limit';
}
