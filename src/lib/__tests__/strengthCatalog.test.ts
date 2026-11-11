import { describe, expect, it } from 'vitest';
import {
  resolveStrengthExerciseLabel,
  resolveStrengthMuscleLabel,
  strengthCatalogMessages,
} from '../strengthCatalog.i18n';

const RUST_RAW = import.meta.glob('../../../src-tauri/crates/core/src/decoder/strength.rs', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const rustSource = Object.values(RUST_RAW)[0] ?? '';

describe('strengthCatalog parity with Rust decoder/strength.rs', () => {
  it('covers all 9 muscle groups and all 125 standard exercises in zh/en/es', () => {
    const muscleBlock = rustSource.match(/STRENGTH_MUSCLE_GROUPS:\s*\[&str;\s*\d+\]\s*=\s*\[([\s\S]*?)\];/)?.[1] ?? '';
    const rustMuscles = [...muscleBlock.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
    expect(rustMuscles.length).toBe(9);

    const catalogBlock = rustSource.match(/STRENGTH_ACTION_CATALOG:\s*\[\(i32,\s*&str,\s*Option<&str>\);\s*\d+\]\s*=\s*\[([\s\S]*?)\];/)?.[1] ?? '';
    const rustExercises = [...catalogBlock.matchAll(/\(\s*\d+,\s*"([a-z0-9_]+)"/g)].map((m) => m[1]);
    expect(rustExercises.length).toBe(125);

    for (const locale of ['zh', 'en', 'es'] as const) {
      const bundle = strengthCatalogMessages[locale];
      expect(Object.keys(bundle.muscles).sort()).toEqual([...rustMuscles].sort());
      expect(Object.keys(bundle.exercises).sort()).toEqual([...rustExercises].sort());
      for (const key of rustExercises) {
        expect(bundle.exercises[key as keyof typeof bundle.exercises].trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('resolves known keys and renders unknown firmware codes honestly as #code', () => {
    expect(resolveStrengthExerciseLabel('biceps_curl', 65, strengthCatalogMessages.zh)).toBe('二头弯举');
    expect(resolveStrengthExerciseLabel('biceps_curl', 65, strengthCatalogMessages.en)).toBe('Biceps curls');
    expect(resolveStrengthExerciseLabel(null, 1030, strengthCatalogMessages.zh)).toBe('#1030');
    expect(resolveStrengthExerciseLabel('unmapped_future_key', 1451, strengthCatalogMessages.en)).toBe('#1451');
    expect(resolveStrengthMuscleLabel('biceps', strengthCatalogMessages.zh)).toBe('肱二头肌');
    expect(resolveStrengthMuscleLabel(null, strengthCatalogMessages.en)).toBeNull();
  });
});
