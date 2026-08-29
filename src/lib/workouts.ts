import { isFiniteNumber } from './format';
import type { Workout } from '../types';

/**
 * A workout is safe to surface only when its identity and timestamp are
 * present, and at least one metric came from the source record. Empty decoder
 * shells must not become list rows or overview highlights.
 */
export const hasWorkoutIdentity = (workout: Partial<Workout>): boolean => {
  const hasType = typeof workout.workout_type === 'string' && workout.workout_type.trim().length > 0;
  const timestamp = typeof workout.start_time === 'string' ? Date.parse(workout.start_time) : Number.NaN;
  return hasType && Number.isFinite(timestamp);
};

export const workoutDurationMinutes = (workout: Partial<Workout>): number | null => {
  const start = typeof workout.start_time === 'string' ? Date.parse(workout.start_time) : Number.NaN;
  const end = typeof workout.end_time === 'string' ? Date.parse(workout.end_time) : Number.NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return (end - start) / 60_000;
};

export const hasWorkoutMetric = (workout: Partial<Workout>): boolean => {
  if (isFiniteNumber(workout.distance_meters) && workout.distance_meters > 0) return true;
  if (isFiniteNumber(workout.calories) && workout.calories > 0) return true;
  if (isFiniteNumber(workout.avg_hr) && workout.avg_hr > 0) return true;
  if (isFiniteNumber(workout.max_hr) && workout.max_hr > 0) return true;
  if (isFiniteNumber(workout.training_load) && workout.training_load > 0) return true;
  if (isFiniteNumber(workout.vo2max) && workout.vo2max > 0) return true;
  return workoutDurationMinutes(workout) !== null;
};

export const isDisplayableWorkout = (workout: Workout): boolean =>
  hasWorkoutIdentity(workout) && hasWorkoutMetric(workout);

export const displayableWorkouts = (workouts: Workout[]): Workout[] => workouts.filter(isDisplayableWorkout);

export const workoutDisplayType = (workout: Partial<Workout>): string =>
  (workout.effective_type || workout.user_override || workout.normalized_type || workout.workout_type || 'unknown')
    .trim()
    .toLowerCase();

export const workoutTypeKey = (workout: Workout): string => workoutDisplayType(workout);
