import { afterEach, describe, expect, it } from 'vitest';
import type { Workout } from '../../types';
import { setLocale } from '../../i18n';
import {
  displayableWorkouts,
  hasWorkoutIdentity,
  isDisplayableWorkout,
  workoutDisplayLabel,
  workoutDisplayType,
  workoutDurationMinutes,
} from '../workouts';

const base = (overrides: Partial<Workout> = {}): Workout =>
  ({
    workout_id: 'w-1',
    workout_type: 'run',
    normalized_type: 'run',
    type_source: 'catalog',
    effective_type: 'run',
    start_time: '2026-03-01T08:00:00+08:00',
    end_time: '2026-03-01T08:40:00+08:00',
    source_scope: 'device',
    gps_available: false,
    sample_count: 0,
    ...overrides,
  }) as Workout;

describe('哪些运动可以出现在界面上', () => {
  it('解码出来的空壳不算一条运动', () => {
    // 有 id 有时间但一个指标都没有的记录，多半是解码器的空壳。
    // 让它变成列表行，用户会以为那天真的练过。
    const shell = base({
      end_time: '2026-03-01T08:00:00+08:00',
      distance_meters: undefined,
      calories: undefined,
      avg_hr: undefined,
    });
    expect(isDisplayableWorkout(shell)).toBe(false);
  });

  it('只要有一个真实指标就够了', () => {
    expect(isDisplayableWorkout(base({ calories: 210 }))).toBe(true);
    expect(isDisplayableWorkout(base({ distance_meters: 5000 }))).toBe(true);
    // 时长本身也是一个真实指标。
    expect(isDisplayableWorkout(base())).toBe(true);
  });

  it('0 值不算指标', () => {
    // 云端对没测到的字段返回 0 是常事。把 0 当成「有数据」，
    // 会让一条什么都没记录的运动堂而皇之地出现在概览里。
    const zeros = base({
      end_time: '2026-03-01T08:00:00+08:00',
      distance_meters: 0,
      calories: 0,
      avg_hr: 0,
      max_hr: 0,
    });
    expect(isDisplayableWorkout(zeros)).toBe(false);
  });

  it('时间戳无效的记录不算有身份', () => {
    expect(hasWorkoutIdentity(base({ start_time: 'not a date' }))).toBe(false);
    expect(hasWorkoutIdentity(base({ workout_type: '   ' }))).toBe(false);
  });

  it('筛选保留原顺序', () => {
    const list = [base({ workout_id: 'a', calories: 100 }), base({ workout_id: 'b', calories: 200 })];
    expect(displayableWorkouts(list).map((item) => item.workout_id)).toEqual(['a', 'b']);
  });
});

describe('时长', () => {
  it('按起止时间算，跨时区也对', () => {
    expect(workoutDurationMinutes(base())).toBe(40);
  });

  it('结束不晚于开始时返回 null，而不是负数或 0', () => {
    expect(workoutDurationMinutes(base({ end_time: '2026-03-01T07:00:00+08:00' }))).toBeNull();
    expect(workoutDurationMinutes(base({ end_time: '2026-03-01T08:00:00+08:00' }))).toBeNull();
  });

  it('缺时间就是 null', () => {
    expect(workoutDurationMinutes({ start_time: '2026-03-01T08:00:00+08:00' })).toBeNull();
  });
});

describe('运动类型的显示', () => {
  afterEach(() => setLocale('zh'));

  it('用户的手动指认优先于云端给的类型', () => {
    const overridden = base({ effective_type: 'hiking', workout_type: 'run' });
    expect(workoutDisplayType(overridden)).toBe('hiking');
  });

  it('自定义编号起过名字就用那个名字', () => {
    // Zepp 的自定义训练模板给的是目录里没有的编号。我们不猜它是什么运动，
    // 但用户可以给编号起一次名字。
    const custom = base({
      workout_type: 'unknown:226',
      normalized_type: 'unknown:226',
      effective_type: 'unknown:226',
      custom_label: '壁球',
    });
    expect(workoutDisplayLabel(custom)).toBe('壁球');
  });

  it('没起过名字的编号如实显示为未识别，不猜一个运动', () => {
    const custom = base({
      workout_type: 'unknown:226',
      normalized_type: 'unknown:226',
      effective_type: 'unknown:226',
      custom_label: undefined,
    });
    const label = workoutDisplayLabel(custom);
    expect(label).toContain('未识别');
    expect(label).toContain('226');
  });

  it('目录运动类型按当前语言显示', () => {
    const rucking = base({
      workout_type: 'rucking',
      normalized_type: 'rucking',
      effective_type: 'rucking',
    });
    setLocale('en');
    expect(workoutDisplayLabel(rucking)).toBe('Rucking');
    setLocale('zh');
    expect(workoutDisplayLabel(rucking)).toBe('负重徒步');
  });

  it('已识别的类型不会被自定义名字顶掉', () => {
    // custom_label 只对未识别编号生效；否则一次误填就会把所有跑步改名。
    const known = base({ effective_type: 'run', custom_label: '瞎写的' });
    expect(workoutDisplayLabel(known)).not.toBe('瞎写的');
  });
});
