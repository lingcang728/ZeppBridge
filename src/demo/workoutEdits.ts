import type { DemoData } from './dataset';
import type { DemoHandler } from './operations';
import type { Workout } from '../types';

/** The public demo keeps edits in this page's synthetic data only. */
export const createDemoWorkoutEdits = (data: DemoData): Record<string, DemoHandler> => {
  const hidden = new Map<string, Workout>();
  const edits = new Map<string, { before: { workout: Workout; hidden: boolean }[]; revision: number }>();
  const revisions = new Map<string, number>();
  let revision = 0;
  const find = (id: string) => data.workouts.find(w => w.workout_id === id) ?? hidden.get(id);
  const put = (workout: Workout, hide: boolean) => {
    const index = data.workouts.findIndex(w => w.workout_id === workout.workout_id);
    if (index >= 0) data.workouts.splice(index, 1);
    hidden.delete(workout.workout_id);
    if (hide) hidden.set(workout.workout_id, workout);
    else {
      data.workouts.push(workout);
      data.workouts.sort((a, b) => b.start_time.localeCompare(a.start_time) || a.workout_id.localeCompare(b.workout_id));
    }
  };
  return {
    get_hidden_workout_page: args => {
      const all = [...hidden.values()].sort((a, b) => b.start_time.localeCompare(a.start_time));
      const offset = Number(args.offset ?? 0), limit = Number(args.limit ?? 200);
      return { items: all.slice(offset, offset + limit), total: all.length };
    },
    edit_workouts: args => {
      const ids = [...new Set(args.workoutIds as string[])];
      if (!ids.length || ids.some(id => !find(id))) throw new Error('Unknown sample workout');
      const before = ids.map(id => ({ workout: structuredClone(find(id)!), hidden: hidden.has(id) }));
      revision += 1;
      for (const id of ids) {
        const workout = structuredClone(find(id)!);
        if (args.changeType) {
          workout.user_override = args.workoutType as string | null;
          workout.effective_type = workout.user_override ?? workout.normalized_type;
        }
        put(workout, typeof args.hidden === 'boolean' ? args.hidden : hidden.has(id));
        revisions.set(id, revision);
      }
      const id = `demo-edit-${revision}`;
      edits.set(id, { before, revision });
      return { id, changed: ids.length };
    },
    undo_workout_edit: args => {
      const edit = edits.get(String(args.id));
      if (!edit || edit.before.some(item => revisions.get(item.workout.workout_id) !== edit.revision)) throw new Error('Sample edit has changed');
      revision += 1;
      for (const item of edit.before) {
        put(item.workout, item.hidden);
        revisions.set(item.workout.workout_id, revision);
      }
      edits.delete(String(args.id));
      return edit.before.length;
    },
    get_workout_detail_coverage: () => ({ pending: 0, persisted: data.workouts.length + hidden.size, empty_from_cloud: 0, request_failed: 0, parse_failed: 0, unavailable: 0, ready: 0 }),
    start_workout_detail_backfill: () => ({ pending: 0, persisted: data.workouts.length + hidden.size, empty_from_cloud: 0, request_failed: 0, parse_failed: 0, unavailable: 0, ready: 0 }),
  };
};
