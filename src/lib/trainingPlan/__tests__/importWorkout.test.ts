import { describe, expect, it } from 'vitest';
import { importWorkout } from '../importWorkout';
import { templatesFrom, withTemplate, withoutTemplate, MAX_TEMPLATES } from '../templates';
import { addWorkout } from '../reshape';

const bytes = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;

/* ── 一个最小的 FIT 写入器：每条消息一个定义 + 一条数据，字段 [编号, 基础类型, 值]。 ───────── */
type Field = [number, 'enum' | 'u16' | 'u32' | 'str', number | string];
const SIZE = { enum: 1, u16: 2, u32: 4 } as const;
const TYPE = { enum: 0x00, u16: 0x84, u32: 0x86, str: 0x07 } as const;
const fitFile = (messages: { global: number; fields: Field[] }[]): ArrayBuffer => {
  const body: number[] = [];
  const le = (value: number, size: number) => { for (let i = 0; i < size; i += 1) body.push((value >>> (8 * i)) & 0xff); };
  messages.forEach((message, local) => {
    const l = local % 16;
    body.push(0x40 | l, 0, 0); le(message.global, 2); body.push(message.fields.length);
    const encoded = message.fields.map(([, kind, value]) => (kind === 'str' ? [...new TextEncoder().encode(String(value)), 0] : null));
    message.fields.forEach(([num, kind], i) => body.push(num, kind === 'str' ? encoded[i]!.length : SIZE[kind], TYPE[kind]));
    body.push(l);
    message.fields.forEach(([, kind, value], i) => (kind === 'str' ? body.push(...encoded[i]!) : le(Number(value), SIZE[kind])));
  });
  const out = new Uint8Array(14 + body.length + 2);
  const view = new DataView(out.buffer);
  out[0] = 14; out[1] = 0x20; view.setUint16(2, 2132, true); view.setUint32(4, body.length, true);
  out.set([...'.FIT'].map((c) => c.charCodeAt(0)), 8);
  out.set(body, 14);
  return out.buffer;
};
const fileId: { global: number; fields: Field[] } = { global: 0, fields: [[0, 'enum', 5]] };
const workoutMsg = (sport: number, sub: number, name: string) => ({ global: 26, fields: [[4, 'enum', sport], [11, 'enum', sub], [8, 'str', name]] as Field[] });
/** workout_step：时长类型 / 时长值、目标类型 / 区间号 / 自定义低高、强度。 */
const stepMsg = (durationType: number, duration: number, targetType: number, zone: number, low: number, high: number, intensity: number) => ({
  global: 27,
  fields: [[1, 'enum', durationType], [2, 'u32', duration], [3, 'enum', targetType], [4, 'u32', zone], [5, 'u32', low], [6, 'u32', high], [7, 'enum', intensity]] as Field[],
});

describe('导入 .zwo', () => {
  const zwo = (sport: string, body: string) => bytes(`<?xml version="1.0"?>
<workout_file><author>me</author><name>Over-unders &amp; ramps</name><description>Sweet spot</description>
<sportType>${sport}</sportType><workout>${body}</workout></workout_file>`);

  it('骑行：按 FTP 换算成瓦数，单个值写成 ±3% 的区间，间歇组收成重复组', () => {
    const file = zwo('bike', `
      <Warmup Duration="600" PowerLow="0.5" PowerHigh="0.75"/>
      <SteadyState Duration="300" Power="0.9" Cadence="90"/>
      <IntervalsT Repeat="4" OnDuration="60" OffDuration="90" OnPower="1.2" OffPower="0.5"/>
      <FreeRide Duration="45"/>
      <Cooldown Duration="300" PowerLow="0.6" PowerHigh="0.4"><textevent timeoffset="10" message="easy"/></Cooldown>`);
    expect(importWorkout(file, {})).toEqual({ ok: false, need: 'ftp' });
    const result = importWorkout(file, { ftp: 250 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workout).toEqual({
      sport: 'cycling', name: 'Over-unders & ramps', description: 'Sweet spot',
      steps: [
        { kind: 'warmup', duration: '10min', target: 'power 125-188' },
        { kind: 'active', duration: '5min', target: 'power 218-232' },
        { repeat: 4, steps: [
          { kind: 'interval', duration: '1min', target: 'power 291-309' },
          { kind: 'recovery', duration: '90s', target: 'power 121-129' },
        ] },
        { kind: 'active', duration: '45s' },
        { kind: 'cooldown', duration: '5min', target: 'power 100-150' },
      ],
    });
    expect(result.notes.sort()).toEqual(['single_value_band', 'targets_dropped']);
    expect(result.workout.focus, '训练目的文件里没有：留空让用户补，不编').toBeUndefined();
  });

  it('跑步：按阈值配速换算（倍数越大越快），可以按距离写', () => {
    const file = bytes(`<workout_file><name>Tempo</name><sportType>run</sportType><durationType>distance</durationType>
      <workout><SteadyState Duration="2000" PowerLow="0.95" PowerHigh="1.0"/></workout></workout_file>`);
    expect(importWorkout(file, { ftp: 250 })).toEqual({ ok: false, need: 'threshold_pace' });
    const result = importWorkout(file, { thresholdPace: 270 });
    expect(result.ok && result.workout.steps).toEqual([{ kind: 'active', duration: '2km', target: 'pace 4:30-4:44' }]);
  });

  it('没有步骤、不是训练文件都如实拒绝', () => {
    expect(importWorkout(zwo('bike', ''), { ftp: 250 })).toEqual({ ok: false, failure: 'empty' });
    expect(importWorkout(bytes('{"workouts":[]}'), {})).toEqual({ ok: false, failure: 'unreadable' });
  });
});

describe('导入训练 .fit', () => {
  it('平铺的步骤和「回到第 j 步」收成重复组；瓦数、心率按偏移解码，速度换成配速', () => {
    const file = fitFile([
      fileId,
      workoutMsg(1, 1, 'Track 6x400'),
      stepMsg(0, 600_000, 1, 0, 230, 245, 2), // 热身 10 分钟，心率 130–145
      stepMsg(1, 40_000, 0, 0, 4545, 5000, 5), // 400 米，4.545–5.0 m/s → 3:20–3:40 / km
      stepMsg(0, 90_000, 2, 0, 0, 0, 4), // 恢复 90 秒，不设目标
      stepMsg(6, 1, 0, 6, 0, 0, 0), // 回到第 1 步，共 6 次
      stepMsg(0, 300_000, 4, 0, 1150, 1180, 3), // 放松 5 分钟，150–180 瓦
    ]);
    const result = importWorkout(file, {});
    expect(result).toEqual({
      ok: true, notes: [],
      workout: {
        sport: 'running', variant: 'treadmill', name: 'Track 6x400',
        steps: [
          { kind: 'warmup', duration: '10min', target: 'hr 130-145' },
          { repeat: 6, steps: [
            { kind: 'interval', duration: '400m', target: 'pace 3:20-3:40' },
            { kind: 'recovery', duration: '90s' },
          ] },
          { kind: 'cooldown', duration: '5min', target: 'power 150-180' },
        ],
      },
    });
  });

  it('%FTP 要先问 FTP；区间编号、按心率结束的步骤、不是训练的文件都拒绝', () => {
    const ftp = fitFile([fileId, workoutMsg(2, 6, 'FTP'), stepMsg(0, 600_000, 4, 0, 88, 94, 0)]);
    expect(importWorkout(ftp, {})).toEqual({ ok: false, need: 'ftp' });
    const sized = importWorkout(ftp, { ftp: 200 });
    expect(sized.ok && sized.workout).toMatchObject({ sport: 'cycling', variant: 'indoor', steps: [{ target: 'power 176-188' }] });

    const zones = fitFile([fileId, workoutMsg(1, 0, 'Z2'), stepMsg(0, 600_000, 1, 2, 0, 0, 0)]);
    expect(importWorkout(zones, {})).toEqual({ ok: false, failure: 'zone_targets' });
    const untilHr = fitFile([fileId, workoutMsg(1, 0, 'HR'), stepMsg(2, 140, 2, 0, 0, 0, 0)]);
    expect(importWorkout(untilHr, {})).toEqual({ ok: false, failure: 'unsupported_step' });
    const activity = fitFile([{ global: 0, fields: [[0, 'enum', 4]] }, workoutMsg(1, 0, 'x')]);
    expect(importWorkout(activity, {})).toEqual({ ok: false, failure: 'not_a_workout' });
    const strength = fitFile([fileId, workoutMsg(10, 0, 'Gym'), stepMsg(0, 60_000, 2, 0, 0, 0, 0)]);
    expect(importWorkout(strength, {})).toEqual({ ok: false, failure: 'unsupported_sport' });
  });

  it('重复组套重复组写不进手表计划', () => {
    const nested = fitFile([fileId, workoutMsg(1, 0, 'Nested'),
      stepMsg(0, 60_000, 2, 0, 0, 0, 5), stepMsg(6, 0, 0, 3, 0, 0, 0), stepMsg(6, 0, 0, 2, 0, 0, 0)]);
    expect(importWorkout(nested, {})).toEqual({ ok: false, failure: 'unsupported_step' });
  });

  it('截断的文件是读不出来，不是空训练', () => {
    const file = fitFile([fileId, workoutMsg(1, 0, 'Cut'), stepMsg(0, 60_000, 2, 0, 0, 0, 0)]);
    expect(importWorkout(file.slice(0, file.byteLength - 12), {})).toEqual({ ok: false, failure: 'unreadable' });
  });
});

describe('训练模板', () => {
  const workout = { date: '2026-10-14', sport: 'running', name: 'Easy', focus: '有氧', description: 'z2', steps: [{ kind: 'active', duration: '40min' }] };

  it('存的时候去掉日期，同样的再存一次只挪到最前，最多留 30 条', () => {
    let list = withTemplate([], workout, new Date('2026-10-13T10:00:00Z'));
    expect(list[0]!.workout).not.toHaveProperty('date');
    list = withTemplate(list, { ...workout, name: 'Long' }, new Date('2026-10-13T11:00:00Z'));
    list = withTemplate(list, { ...workout, date: '2026-11-01' }, new Date('2026-10-13T12:00:00Z'));
    expect(list.map((row) => row.workout.name)).toEqual(['Easy', 'Long']);
    for (let i = 0; i < 40; i += 1) list = withTemplate(list, { ...workout, name: `W${i}` }, new Date(1_700_000_000_000 + i));
    expect(list).toHaveLength(MAX_TEMPLATES);
    expect(withoutTemplate(list, list[0]!.id)).toHaveLength(MAX_TEMPLATES - 1);
  });

  it('坏的存储内容不弄丢好的那几条', () => {
    const good = withTemplate([], workout, new Date());
    expect(templatesFrom(JSON.stringify([...good, { id: 'x' }, null]))).toHaveLength(1);
    expect(templatesFrom('not json')).toEqual([]);
  });

  it('放到某一天：计划范围外就把范围撑开', () => {
    const doc = { from: '2026-10-14', to: '2026-10-20', workouts: [] };
    const next = addWorkout(doc, withTemplate([], workout, new Date())[0]!.workout, '2026-10-22');
    expect(next).toMatchObject({ from: '2026-10-14', to: '2026-10-22', workouts: [{ date: '2026-10-22', name: 'Easy' }] });
    expect(doc.workouts, '不改原文').toHaveLength(0);
  });
});
