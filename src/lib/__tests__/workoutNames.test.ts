/**
 * 运动名文案模块是从随包目录生成的（scripts/assets/build-workout-names.mjs）：目录改了没重跑，
 * 界面会和 CLI / 导出说不一样的名字。七种语言没覆盖的键回落英文名，不显示内部 key。
 */
import { afterEach, describe, expect, it } from 'vitest';
import catalog from '../../assets/workouts/catalog.json';
import { workoutNameMessages } from '../workoutNames.i18n';
import { workoutLabel } from '../labels';
import { setLocale } from '../../i18n';

const tables = workoutNameMessages as unknown as { zh: Record<string, string>; en: Record<string, string>; es: Record<string, string> };

describe('lib/workoutNames', () => {
  afterEach(() => setLocale('zh'));

  it('matches the bundled catalog for zh / en / es', () => {
    for (const sport of catalog.sports) {
      expect(tables.zh[sport.key], sport.key).toBe(catalog.sports.find((s) => s.key === sport.key)!.label_zh);
      expect(tables.en[sport.key], sport.key).toBe(catalog.sports.find((s) => s.key === sport.key)!.label_en);
    }
    expect(Object.keys(tables.zh).length).toBe(new Set(catalog.sports.map((s) => s.key)).size);
  });

  it('names a workout by key in the current language', () => {
    expect(workoutLabel('trail_running')).toBe('越野跑');
    setLocale('en');
    expect(workoutLabel('trail_running')).toBe('Trail Running');
  });
});
