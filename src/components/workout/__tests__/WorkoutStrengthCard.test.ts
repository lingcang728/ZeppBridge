import { describe, expect, it, vi } from 'vitest';
import { createSSRApp, h, shallowRef } from 'vue';
import { renderToString } from '@vue/server-renderer';
import type { StrengthCatalogAction, StrengthWorkoutDetail } from '../../../types';

// 当前语言的 Zepp 动作目录（#163）：1107 是 1001 起的新动作，静态表里没有。
vi.mock('../../../composables/useStrengthCatalog', () => ({
  useStrengthCatalog: () =>
    shallowRef(
      new Map<number, StrengthCatalogAction>([
        [1107, { action_code: 1107, name: '辅助背屈伸', primary_groups: ['back'], secondary_groups: [], main_positions: [34, 35, 36, 37], sub_positions: [] }],
        [14, { action_code: 14, name: 'Lateral Raises', primary_groups: ['shoulders'], secondary_groups: ['back'], main_positions: [3, 4, 38, 39], sub_positions: [34, 35] }],
      ]),
    ),
}));

import WorkoutStrengthCard from '../WorkoutStrengthCard.vue';

const set = (over: Partial<StrengthWorkoutDetail['sets'][number]>) => ({
  set_index: 1,
  action_code: 0,
  exercise_key: null,
  muscle_group: null,
  reps: 12,
  weight_value: null,
  weight_unit: 'kg' as const,
  weight_kg: null,
  duration_ms: null,
  avg_hr: null,
  calories_kcal: null,
  ...over,
});

const strength: StrengthWorkoutDetail = {
  total_sets: 4,
  total_reps: 46,
  total_volume_kg: 349.98,
  rest_seconds: 36,
  sets: [
    set({ set_index: 1, action_code: 65, exercise_key: 'biceps_curl', muscle_group: 'biceps', weight_value: 21, weight_kg: 21, duration_ms: 22467, avg_hr: 88, calories_kcal: 3 }),
    set({ set_index: 2, action_code: 14, exercise_key: 'lateral_raises', muscle_group: 'shoulders', weight_value: 18, weight_unit: 'lb', weight_kg: 8.165, duration_ms: 23371, avg_hr: 89, calories_kcal: 3 }),
    set({ set_index: 3, action_code: 1107, duration_ms: 61234, exercise_name: 'Assisted Back Extension' }),
    set({ set_index: 4, action_code: 4242, reps: 10 }),
  ],
  exercise_groups: [],
};

const text = async () =>
  (await renderToString(createSSRApp({ render: () => h(WorkoutStrengthCard, { strength }) })))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');

describe('workout strength card', () => {
  it('shows set times like the Zepp app: hundredths, truncated, with a running total', async () => {
    const out = await text();
    // 22467 ms → 22.46（截断不进位），23371 → 23.37，累计 45.83。
    expect(out).toContain('22.46 秒 22.46 秒');
    expect(out).toContain('23.37 秒 45.83 秒');
    expect(out).toContain('3 千卡');
    // 第 4 组没有用时：不拿 0 顶，累计也就此打住。
    expect(out).toMatch(/#4242 徒手 × 10 — — — —/);
  });

  it('names new action codes from the Zepp catalog and only falls back to #code when nobody knows', async () => {
    const out = await text();
    expect(out).toContain('二头弯举');
    expect(out).toContain('辅助背屈伸');
    expect(out).not.toContain('#1107');
    expect(out).toContain('#4242');
    // 新动作的主肌群来自目录；侧平举的辅助肌群（斜方肌 → 背部）单列一行。
    expect(out).toContain('背部 1 组 辅助肌群 背部 1 组');
  });

  it('drops .00 on whole seconds, names unknown codes plainly and keeps the volume in the unit the sets use', async () => {
    const lbOnly: StrengthWorkoutDetail = {
      ...strength,
      total_volume_kg: 81.65,
      sets: [
        set({ set_index: 1, action_code: 14, weight_value: 18, weight_unit: 'lb', weight_kg: 8.165, reps: 10, duration_ms: 60000 }),
        set({ set_index: 2, action_code: 2999, reps: 8, duration_ms: 38000 }),
      ],
    };
    const out = (await renderToString(createSSRApp({ render: () => h(WorkoutStrengthCard, { strength: lbOnly }) })))
      .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(out).toContain('1分00秒 1分00秒');
    expect(out).toContain('38 秒 1分38秒');
    expect(out).not.toContain('.00');
    expect(out).toContain('未识别动作 #2999');
    // 各组都记 lb：总训练量也用 lb（81.65 kg = 180 lb），不随设置换成 kg。
    expect(out).toContain('180 lb');
  });
});
