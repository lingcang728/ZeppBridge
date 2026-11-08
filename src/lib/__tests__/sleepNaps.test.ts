import { describe, expect, it } from 'vitest';
import { groupNaps } from '../sleepNaps';

const slice = (stage: string, from: string, to: string) => ({
  stage,
  start_time: `2026-11-06T${from}:00Z`,
  end_time: `2026-11-06T${to}:00Z`,
});

describe('groupNaps', () => {
  it('splits slices into naps at a waking gap and totals each stage', () => {
    const naps = groupNaps([
      slice('light', '04:02', '04:12'),
      slice('deep', '04:12', '04:14'),
      slice('rem', '04:14', '04:20'),
      slice('awake', '04:20', '04:22'),
      // 下午另一段：隔了几个小时。
      slice('light', '12:18', '12:30'),
    ]);
    expect(naps).toHaveLength(2);
    expect(naps[0].start).toBe('2026-11-06T04:02:00Z');
    expect(naps[0].end).toBe('2026-11-06T04:22:00Z');
    expect(naps[0].minutes).toEqual({ deep: 2, light: 10, rem: 6, awake: 2 });
    expect(naps[0].asleepMinutes).toBe(18);
    // 这一段没有深睡、REM：是 null，不是 0。
    expect(naps[1].minutes).toEqual({ deep: null, light: 12, rem: null, awake: null });
  });

  it('gives nothing for no slices', () => {
    expect(groupNaps([])).toEqual([]);
  });
});
