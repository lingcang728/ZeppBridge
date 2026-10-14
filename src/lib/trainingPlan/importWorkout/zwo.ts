/**
 * Zwift 的 `.zwo`（intervals.icu、TrainerRoad 等也导出这种）：一个 XML，`<workout>` 里按顺序排着
 * Warmup / SteadyState / IntervalsT / Ramp / Cooldown / FreeRide / MaxEffort。
 *
 * 强度一律是**相对值**：骑行是 FTP 的倍数，跑步是阈值配速对应速度的倍数。所以换算要用户的 FTP 或阈值配速，
 * 没给就返回 `need`，不替用户假设。只给一个值（SteadyState）的按 ±3% 写成区间（手表要区间）。
 * 踏频这类手表收不下的目标去掉并记一笔。不用 DOMParser：这几个标签扁平、属性简单，正则够用，测试也能在 node 里跑。
 */
import {
  durationText, distanceText, NeedValue, Notes, paceTarget, powerTarget, run, step, workoutOf,
  type ImportOptions, type ImportResult,
} from './common';
import type { PlanStepInput } from '../../../types/trainingPlan';

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (text: string) => text
  .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
  .replace(/&(amp|lt|gt|quot|apos);/g, (_, name: string) => ENTITIES[name]!);

const tagText = (xml: string, tag: string) => {
  const found = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i').exec(xml);
  return found ? decode(found[1]!.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).trim() : '';
};

const attributes = (text: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const match of text.matchAll(/([A-Za-z_][\w-]*)\s*=\s*"([^"]*)"/g)) out[match[1]!.toLowerCase()] = decode(match[2]!);
  return out;
};

const CADENCE = ['cadence', 'cadencelow', 'cadencehigh', 'cadenceresting'];
const BLOCKS = /<(Warmup|Cooldown|Ramp|SteadyState|SolidState|IntervalsT|FreeRide|Freeride|MaxEffort)\b([^>]*?)\/?>/g;

/** 是不是 .zwo：有 `<workout_file>`。 */
export const looksLikeZwo = (text: string) => /<workout_file[\s>]/i.test(text);

export const parseZwo = (xml: string, options: ImportOptions): ImportResult => run((notes: Notes) => {
  const body = /<workout>([\s\S]*?)<\/workout>/i.exec(xml)?.[1];
  if (body === undefined) throw new Error('no workout');
  const running = tagText(xml, 'sportType').toLowerCase() === 'run';
  const byDistance = tagText(xml, 'durationType').toLowerCase() === 'distance';

  const length = (value: string | undefined) => {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('bad duration');
    return byDistance ? distanceText(amount) : durationText(amount, notes);
  };
  /** 相对强度 → 书写格式。跑步：配速（秒 / 公里）= 阈值配速 ÷ 倍数。 */
  const intensity = (low: number, high: number): string => {
    if (!Number.isFinite(low) || !Number.isFinite(high) || low <= 0 || high <= 0) throw new Error('bad power');
    if (running) {
      const threshold = options.thresholdPace;
      if (!threshold) throw new NeedValue('threshold_pace');
      return paceTarget(threshold / Math.max(low, high), threshold / Math.min(low, high), notes);
    }
    if (!options.ftp) throw new NeedValue('ftp');
    return powerTarget(low * options.ftp, high * options.ftp, notes);
  };
  const range = (attrs: Record<string, string>, low: string, high: string, single: string) => {
    const one = Number(attrs[single]);
    const lo = attrs[low] !== undefined ? Number(attrs[low]) : one;
    const hi = attrs[high] !== undefined ? Number(attrs[high]) : one;
    return intensity(lo, hi);
  };

  const steps: PlanStepInput[] = [];
  for (const match of body.matchAll(BLOCKS)) {
    const kind = match[1]!.toLowerCase();
    const attrs = attributes(match[2]!);
    if (CADENCE.some((key) => key in attrs)) notes.add('targets_dropped');
    switch (kind) {
      case 'warmup':
      case 'cooldown':
      case 'ramp':
        steps.push(step(kind === 'ramp' ? 'active' : kind, length(attrs.duration), range(attrs, 'powerlow', 'powerhigh', 'power')));
        break;
      case 'steadystate':
      case 'solidstate':
        steps.push(step('active', length(attrs.duration), range(attrs, 'powerlow', 'powerhigh', 'power')));
        break;
      case 'intervalst': {
        const times = Math.round(Number(attrs.repeat ?? 1));
        if (!Number.isFinite(times) || times < 1) throw new Error('bad repeat');
        steps.push({
          repeat: times,
          steps: [
            step('interval', length(attrs.onduration), range(attrs, 'poweronlow', 'poweronhigh', 'onpower')),
            step('recovery', length(attrs.offduration), range(attrs, 'powerofflow', 'poweroffhigh', 'offpower')),
          ],
        });
        break;
      }
      case 'maxeffort':
        steps.push(step('interval', length(attrs.duration)));
        break;
      default: // FreeRide：不设目标。
        steps.push(step('active', length(attrs.duration)));
    }
  }
  return workoutOf(running ? 'running' : 'cycling', undefined, tagText(xml, 'name'), tagText(xml, 'description'), steps);
});
