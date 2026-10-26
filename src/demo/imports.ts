import type { DemoData } from './dataset';
import type { DemoHandler } from './operations';
import type { ImportBatch, ImportSourceKey } from '../types/imports';

/** 演示：最早的三条运动当作一批 Strava 导入；再导入时演示数据里没有新文件，只报「本机已有」。 */
export const createDemoImports = (data: DemoData): Record<string, DemoHandler> => {
  const oldest = [...data.workouts].sort((a, b) => a.start_time.localeCompare(b.start_time)).slice(0, 3);
  const sources = new Map<string, ImportSourceKey>(oldest.map(w => [w.workout_id, 'strava']));
  const batches: ImportBatch[] = oldest.length ? [{
    id: 1, source: 'strava', file_name: 'export_12345678.zip', imported_at: new Date().toISOString(),
    added: oldest.length, duplicates: 2, unreadable: 1, undone_at: null,
    first_start: oldest[0].start_time, last_start: oldest[oldest.length - 1].start_time,
  }] : [];
  return {
    import_batches: () => structuredClone(batches),
    workout_import_sources: () => Object.fromEntries(sources),
    import_workouts: args => ({ batch_id: null, added: 0, duplicates: (args.paths as string[]).length, unreadable: 0 }),
    undo_import_batch: args => {
      const batch = batches.find(b => b.id === Number(args.batchId));
      if (!batch || batch.undone_at) return 0;
      const ids = [...sources.keys()];
      for (const id of ids) {
        const index = data.workouts.findIndex(w => w.workout_id === id);
        if (index >= 0) data.workouts.splice(index, 1);
        sources.delete(id);
      }
      batch.undone_at = new Date().toISOString();
      return ids.length;
    },
  };
};
