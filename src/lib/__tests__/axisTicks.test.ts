import { afterEach, describe, expect, it, vi } from 'vitest';
import { axisTickProblems, gateAxisTicks, sleepHourTicks } from '../axisTicks';
import { timeTicks } from '../miniChart';

/* vi.stubEnv 写的就是 process.env.TZ，Node 会随之换时区（vue-tsc 不认 process 这个全局）。 */
afterEach(() => { vi.unstubAllEnvs(); });

const pad = (n: number) => String(n).padStart(2, '0');
const clock = (ms: number) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

describe('轴标签门禁', () => {
  it('夏令时结束那晚 01:00 出现两次，睡眠轴只画一个', () => {
    vi.stubEnv('TZ', 'America/New_York');
    const from = Date.UTC(2026, 10, 1, 3, 0); // 23:00 EDT
    const to = Date.UTC(2026, 10, 1, 9, 0); // 04:00 EST
    const ticks = sleepHourTicks(from, to - from, clock);
    expect(ticks.filter((tick) => tick.label === '01:00')).toHaveLength(1);
    expect(axisTickProblems(ticks)).toEqual([]);
  });

  it('各时区、各种跨度的睡眠轴和心率轴都单调、不重复', () => {
    for (const tz of ['Asia/Shanghai', 'America/New_York', 'Europe/London', 'Australia/Lord_Howe', 'Asia/Kolkata']) {
      vi.stubEnv('TZ', tz);
      for (let day = 0; day < 366; day += 7) {
        for (const hours of [3, 5.5, 8, 11, 14]) {
          const from = Date.UTC(2026, 0, 1, 13) + day * 86_400_000;
          const span = hours * 3_600_000;
          expect(axisTickProblems(sleepHourTicks(from, span, clock)), `${tz} ${day} ${hours}`).toEqual([]);
          const hr = gateAxisTicks(timeTicks(from, from + span, 420).map((at) => ({ at, label: clock(at) })));
          expect(axisTickProblems(hr), `${tz} ${day} ${hours} hr`).toEqual([]);
        }
      }
    }
  });

  it('门禁丢掉重复和倒退的刻度，保留原顺序', () => {
    const gated = gateAxisTicks([
      { at: 1, label: '22:00' }, { at: 2, label: '01:00' }, { at: 3, label: '01:00' }, { at: 1.5, label: '03:00' }, { at: 4, label: '04:00' },
    ]);
    expect(gated.map((tick) => tick.label)).toEqual(['22:00', '01:00', '04:00']);
  });
});
