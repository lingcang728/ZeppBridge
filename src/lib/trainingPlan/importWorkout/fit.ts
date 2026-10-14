/**
 * 训练文件 `.fit`（Garmin Connect、TrainingPeaks、intervals.icu 导出的 workout）：只读三种消息——
 * file_id（确认是训练文件）、workout（运动、名字）、workout_step（每一步）。
 *
 * FIT 的步骤是平铺的，重复组是一条「回到第 j 步、共做 N 次」的步骤；这里收拢成书写格式的重复组，
 * 重复组套重复组手表写不出来，整份拒绝。
 *
 * 目标的编码（FIT Profile）：
 *   - 功率：值 ≥ 1000 是「瓦数 + 1000」，< 1000 是 %FTP；只给区间编号（target_value 1–7、自定义为 0）是功率区间。
 *   - 心率：值 ≥ 100 是「次 / 分 + 100」，< 100 是最大心率百分比；只给编号是心率区间。
 *   - 速度：米 / 秒 × 1000，换成每公里配速。
 * 区间编号、最大心率百分比换算不了（边界在原平台），整份拒绝；%FTP 要用户给 FTP。
 */
import {
  durationText, distanceText, hrTarget, NeedValue, Notes, paceTarget, powerTarget, run, step, Unsupported, workoutOf,
  type ImportOptions, type ImportResult,
} from './common';
import type { PlanSport, PlanStepInput, PlanVariant } from '../../../types/trainingPlan';

type Value = number | string | null;
type Message = Map<number, Value>;
interface Definition { global: number; little: boolean; fields: { num: number; size: number; type: number }[]; devBytes: number }

/** 只认这几个全局消息号。 */
const FILE_ID = 0;
const WORKOUT = 26;
const WORKOUT_STEP = 27;
const FILE_TYPE_WORKOUT = 5;

const INVALID: Record<number, number> = { 0x00: 0xff, 0x01: 0x7f, 0x02: 0xff, 0x83: 0x7fff, 0x84: 0xffff, 0x85: 0x7fffffff, 0x86: 0xffffffff, 0x0a: 0, 0x8b: 0, 0x8c: 0 };

const readField = (view: DataView, at: number, size: number, type: number, little: boolean): Value => {
  const base = type & 0x9f;
  if (base === 0x07) {
    const bytes = new Uint8Array(view.buffer, view.byteOffset + at, size);
    const end = bytes.indexOf(0);
    return new TextDecoder().decode(end >= 0 ? bytes.subarray(0, end) : bytes) || null;
  }
  let value: number;
  switch (base) {
    case 0x00: case 0x02: case 0x0a: case 0x0d: value = view.getUint8(at); break;
    case 0x01: value = view.getInt8(at); break;
    case 0x83: value = view.getInt16(at, little); break;
    case 0x84: case 0x8b: value = view.getUint16(at, little); break;
    case 0x85: value = view.getInt32(at, little); break;
    case 0x86: case 0x8c: value = view.getUint32(at, little); break;
    case 0x88: return view.getFloat32(at, little);
    case 0x89: return view.getFloat64(at, little);
    default: return null; // 64 位整数、字节数组：这三种消息里用不到。
  }
  return INVALID[base] === value ? null : value;
};

/** 读出 FIT 里所有 file_id / workout / workout_step 消息，按出现顺序。 */
const readMessages = (buffer: ArrayBuffer): { global: number; fields: Message }[] => {
  const view = new DataView(buffer);
  const headerSize = view.getUint8(0);
  if (buffer.byteLength < 12 || (headerSize !== 12 && headerSize !== 14)) throw new Error('header');
  if (String.fromCharCode(...new Uint8Array(buffer, 8, 4)) !== '.FIT') throw new Error('signature');
  const end = Math.min(buffer.byteLength, headerSize + view.getUint32(4, true));
  const definitions = new Map<number, Definition>();
  const out: { global: number; fields: Message }[] = [];
  let at = headerSize;
  while (at < end) {
    const header = view.getUint8(at++);
    const compressed = (header & 0x80) !== 0;
    const local = compressed ? (header >> 5) & 0x03 : header & 0x0f;
    if (!compressed && (header & 0x40)) {
      const little = view.getUint8(at + 1) === 0;
      const global = view.getUint16(at + 2, little);
      const count = view.getUint8(at + 4);
      at += 5;
      const fields = [];
      for (let i = 0; i < count; i += 1, at += 3) fields.push({ num: view.getUint8(at), size: view.getUint8(at + 1), type: view.getUint8(at + 2) });
      let devBytes = 0;
      if (header & 0x20) {
        const devCount = view.getUint8(at++);
        for (let i = 0; i < devCount; i += 1, at += 3) devBytes += view.getUint8(at + 1);
      }
      definitions.set(local, { global, little, fields, devBytes });
      continue;
    }
    const definition = definitions.get(local);
    if (!definition) throw new Error('data before definition');
    const fields: Message = new Map();
    for (const field of definition.fields) {
      if (at + field.size > end) throw new Error('truncated');
      fields.set(field.num, readField(view, at, field.size, field.type, definition.little));
      at += field.size;
    }
    at += definition.devBytes;
    if ([FILE_ID, WORKOUT, WORKOUT_STEP].includes(definition.global)) out.push({ global: definition.global, fields });
  }
  return out;
};

/** 是不是 FIT：头里的签名。 */
export const looksLikeFit = (buffer: ArrayBuffer) =>
  buffer.byteLength >= 12 && String.fromCharCode(...new Uint8Array(buffer, 8, 4)) === '.FIT';

const num = (message: Message, field: number): number | null => {
  const value = message.get(field);
  return typeof value === 'number' ? value : null;
};
const text = (message: Message, field: number): string => {
  const value = message.get(field);
  return typeof value === 'string' ? value : '';
};

/** FIT sport → 能发到手表的大类；sub_sport 只在能对上时给子类型。 */
const sportOf = (sport: number | null, sub: number | null): { sport: PlanSport; variant?: PlanVariant } => {
  switch (sport) {
    case 1: return { sport: 'running', variant: sub === 1 ? 'treadmill' : sub === 4 ? 'track' : undefined };
    case 2: return { sport: 'cycling', variant: sub === 6 ? 'indoor' : undefined };
    case 5: return { sport: sub === 18 ? 'open_water_swim' : 'pool_swim' };
    default: throw new Unsupported('unsupported_sport');
  }
};

const KIND: Record<number, string> = { 0: 'active', 1: 'rest', 2: 'warmup', 3: 'cooldown', 4: 'recovery', 5: 'interval' };

export const parseFit = (buffer: ArrayBuffer, options: ImportOptions): ImportResult => run((notes: Notes) => {
  const messages = readMessages(buffer);
  const fileId = messages.find((m) => m.global === FILE_ID);
  if (fileId && num(fileId.fields, 0) !== FILE_TYPE_WORKOUT) throw new Unsupported('not_a_workout');
  const workout = messages.find((m) => m.global === WORKOUT)?.fields;
  if (!workout) throw new Unsupported('not_a_workout');
  const kind = sportOf(num(workout, 4), num(workout, 11));
  const rows = messages.filter((m) => m.global === WORKOUT_STEP).map((m) => m.fields);

  const target = (row: Message): string | undefined => {
    const type = num(row, 3);
    const zone = num(row, 4) ?? 0;
    const low = num(row, 5);
    const high = num(row, 6);
    const custom = zone === 0 && low !== null && high !== null;
    switch (type) {
      case null:
      case 2: return undefined; // 不设目标
      case 0: // 速度 → 配速
      case 12:
        if (!custom || !low || !high) throw new Unsupported('zone_targets');
        return paceTarget(1_000_000 / high, 1_000_000 / low, notes);
      case 1: // 心率
      case 13:
        if (!custom || low! < 100 || high! < 100) throw new Unsupported('zone_targets');
        return hrTarget(low! - 100, high! - 100);
      case 4: // 功率
      case 7: case 8: case 9: case 10:
        if (!custom) throw new Unsupported('zone_targets');
        if (low! >= 1000 && high! >= 1000) return powerTarget(low! - 1000, high! - 1000, notes);
        if (!options.ftp) throw new NeedValue('ftp');
        return powerTarget((low! / 100) * options.ftp, (high! / 100) * options.ftp, notes);
      default: // 踏频、坡度、阻力、泳姿：手表收不下
        notes.add('targets_dropped');
        return undefined;
    }
  };
  const single = (row: Message): PlanStepInput => {
    const type = num(row, 1) ?? 5;
    const value = num(row, 2);
    // 只有按时间、按距离结束的步骤写得进手表计划；「直到按下圈键」、按心率 / 功率 / 卡路里结束的写不了。
    if (!value || (type !== 0 && type !== 31 && type !== 1)) throw new Unsupported('unsupported_step');
    const duration = type === 1 ? distanceText(value / 100) : durationText(value / 1000, notes);
    return step(KIND[num(row, 7) ?? 0] ?? 'active', duration, target(row), text(row, 0) || text(row, 8));
  };

  /** 平铺的步骤 → 书写格式；`start[i]` 记第 i 条 FIT 步骤落在输出里的哪一节，重复步骤据此把一段收拢。 */
  const steps: PlanStepInput[] = [];
  const start: number[] = [];
  rows.forEach((row, index) => {
    start[index] = steps.length;
    if (num(row, 1) !== 6) { steps.push(single(row)); return; }
    const from = num(row, 2);
    const times = num(row, 4);
    if (from === null || times === null || from >= index || times < 1) throw new Error('bad repeat');
    const body = steps.splice(start[from]!);
    if (!body.length || body.some((node) => 'repeat' in node)) throw new Unsupported('unsupported_step');
    steps.push({ repeat: times, steps: body });
  });
  return workoutOf(kind.sport, kind.variant, text(workout, 8), '', steps);
});
