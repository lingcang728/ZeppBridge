/**
 * 力量训练卡的几个纯函数（2026-11-13 用户测试反馈）。
 */
import { KILOGRAMS_PER_POUND } from './units';
import type { StrengthWeightUnit } from '../types';

/**
 * 单组用时拆成「分 + 秒」，秒的小数位按实际需要给（用户：整数秒也显示成 1分00.00秒，很丑）：
 * 整数秒不带小数（38 秒、1分12秒）；真有零头才到十分位 / 百分位，尾零去掉（22.46、22.5）。
 * 和 Zepp App 一样到百分之一秒、截断不进位（22467 ms → 22.46）。没有用时（null / ≤0）给 null。
 */
export function splitSetDuration(ms: number | null | undefined): { minutes: number; seconds: number; digits: 0 | 1 | 2 } | null {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return null;
  const totalCs = Math.floor(ms / 10);
  const minutes = Math.floor(totalCs / 6000);
  const cs = totalCs % 6000;
  const digits = cs % 100 === 0 ? 0 : cs % 10 === 0 ? 1 : 2;
  return { minutes, seconds: cs / 100, digits };
}

/**
 * 总训练量用哪个单位显示（用户：组里写的是 kg，总数却是 lb，看不懂）：
 * 带重量的各组都用同一个单位记的，就用那个单位；混着记的才按设置（`preferred`）。
 */
export function volumeUnitFor(units: ReadonlyArray<StrengthWeightUnit | null | undefined>, preferred: 'kg' | 'lb'): 'kg' | 'lb' {
  const seen = new Set(units.filter((unit): unit is StrengthWeightUnit => unit === 'kg' || unit === 'lb'));
  return seen.size === 1 ? [...seen][0] as 'kg' | 'lb' : preferred;
}

/** 千克换成显示单位。 */
export const kgIn = (kg: number, unit: 'kg' | 'lb'): number => (unit === 'lb' ? kg / KILOGRAMS_PER_POUND : kg);
