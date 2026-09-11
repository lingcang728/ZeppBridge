import type { WorkoutPause } from '../types';

/** Use the union of recorded pauses within the workout, never sample gaps. */
export function workoutTiming(
  startTime: string,
  endTime: string,
  distanceMeters: number | null | undefined,
  pauses: WorkoutPause[],
  reportedMovingSeconds?: number | null,
) {
  const start = Date.parse(startTime);
  const end = Date.parse(endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const intervals = pauses
    .map(pause => [Math.max(start, Date.parse(pause.start_time)), Math.min(end, Date.parse(pause.end_time))])
    .filter(([from, to]) => Number.isFinite(from) && Number.isFinite(to) && to! > from!)
    .sort((a, b) => a[0]! - b[0]!);
  let pausedMs = 0;
  let coveredUntil = start;
  for (const [from, to] of intervals) {
    pausedMs += Math.max(0, to! - Math.max(from!, coveredUntil));
    coveredUntil = Math.max(coveredUntil, to!);
  }
  const elapsedMinutes = (end - start) / 60_000;
  const hasReportedTime = typeof reportedMovingSeconds === 'number'
    && Number.isFinite(reportedMovingSeconds) && reportedMovingSeconds >= 0
    && reportedMovingSeconds <= elapsedMinutes * 60;
  const movingMinutes = hasReportedTime ? reportedMovingSeconds / 60 : elapsedMinutes - pausedMs / 60_000;
  const pausedMinutes = elapsedMinutes - movingMinutes;
  const distanceKm = typeof distanceMeters === 'number' && Number.isFinite(distanceMeters)
    && distanceMeters > 0 ? distanceMeters / 1000 : null;
  return {
    elapsedMinutes, pausedMinutes, movingMinutes,
    movingPace: distanceKm && movingMinutes > 0 ? movingMinutes / distanceKm : null,
    elapsedPace: distanceKm ? elapsedMinutes / distanceKm : null,
  };
}
