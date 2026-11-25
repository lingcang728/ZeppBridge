/**
 * 睡前日志的标签与心情：Zepp 的编号 → 颜色、双色图标、名字的键。
 *
 * 图标是 24×24 的双色小画：`m` 实色、`t` 三成透明的底、`h` 六成、`w` 白、`s` / `s2` 描边。每个图标用属性写颜色，
 * 不共用 `<style>` 类名（一页里几十个 svg 的样式会互相覆盖）。
 */
import type { BedtimeCode, WakeMood } from '../../types/sleepJournal';

export interface BedtimeTag { code: BedtimeCode; color: string; key: BedtimeKey; paths: string }

export type BedtimeKey =
  | 'alcohol' | 'reading' | 'music' | 'lateWorkout' | 'lateMeal' | 'lateWork' | 'other' | 'screens' | 'games'
  | 'tidying' | 'shower' | 'caffeine' | 'anxious' | 'stressed' | 'unwell' | 'tired' | 'lateWater' | 'noise';

export const BEDTIME_TAGS: BedtimeTag[] = [
  { code: '1', color: '#8b5cf6', key: 'alcohol', paths: '<path class="t" d="M6.5 3h11l-.7 5.6a4.8 4.8 0 0 1-9.6 0z"/><path class="m" d="M7.2 6.5h9.6l-.3 2.1a4.5 4.5 0 0 1-9 0z"/><rect class="m" x="11.1" y="13" width="1.8" height="6" rx=".9"/><rect class="m" x="8" y="18.6" width="8" height="2.2" rx="1.1"/>' },
  { code: '2', color: '#22a06b', key: 'reading', paths: '<path class="m" d="M2.5 5.2c3.2-1.2 6.4-1.1 9 .9v14c-2.6-1.8-5.8-1.9-9-.8z"/><path class="t" d="M21.5 5.2c-3.2-1.2-6.4-1.1-9 .9v14c2.6-1.8 5.8-1.9 9-.8z"/>' },
  { code: '3', color: '#e0559a', key: 'music', paths: '<path class="t" d="M9.5 6.5l10-2.5v3l-10 2.5z"/><path class="s" d="M9.5 17V6.5l10-2.5v10.5"/><circle class="m" cx="7" cy="17.2" r="3"/><circle class="m" cx="17" cy="14.8" r="3"/>' },
  { code: '4', color: '#e5484d', key: 'lateWorkout', paths: '<path class="t" d="M17.5 2.5a4 4 0 1 0 4 5.2 3.2 3.2 0 0 1-4-5.2z"/><path class="m" d="M2.5 13.5c2.6.2 4.6-1.4 5.6-4.3l3.4 1.1c.9 2.1 3 3.3 6 3.4 1.9.1 3.5 1.2 3.5 3.2v1.1H2.5z"/><rect class="t" x="2.5" y="18" width="18.5" height="2.6" rx="1.3"/>' },
  { code: '5', color: '#f08a24', key: 'lateMeal', paths: '<path class="s2" d="M9.5 3.5c-1 1.2 1 2 0 3.3M14 3.5c-1 1.2 1 2 0 3.3"/><path class="m" d="M2.5 10.5h19a9.5 8.5 0 0 1-19 0z"/><rect class="t" x="2" y="9" width="20" height="2.6" rx="1.3"/>' },
  { code: '6', color: '#64748b', key: 'lateWork', paths: '<rect class="t" x="4" y="4.5" width="16" height="11" rx="2"/><rect class="m" x="6" y="6.5" width="12" height="7" rx="1"/><path class="m" d="M2 17h20l-1.2 2.2a1.6 1.6 0 0 1-1.4.8H4.6a1.6 1.6 0 0 1-1.4-.8z"/>' },
  { code: '7', color: '#8a8f98', key: 'other', paths: '<circle class="t" cx="12" cy="12" r="10"/><circle class="m" cx="7.5" cy="12" r="1.8"/><circle class="m" cx="12" cy="12" r="1.8"/><circle class="m" cx="16.5" cy="12" r="1.8"/>' },
  { code: '8', color: '#12a594', key: 'screens', paths: '<rect class="m" x="6" y="2" width="12" height="20" rx="3"/><rect class="w" x="7.8" y="4.2" width="8.4" height="13.6" rx="1.4"/><path class="m" d="M14.6 7.2a2.6 2.6 0 1 0 2 3.6 2 2 0 0 1-2-3.6z"/>' },
  { code: '9', color: '#6366f1', key: 'games', paths: '<path class="t" d="M7 7h10a5 5 0 0 1 4.8 6.3l-1 3.6a2.6 2.6 0 0 1-4.4 1.1L14.6 16H9.4l-1.8 2a2.6 2.6 0 0 1-4.4-1.1l-1-3.6A5 5 0 0 1 7 7z"/><path class="s" d="M7.5 10v4M5.5 12h4"/><circle class="m" cx="15.5" cy="11" r="1.4"/><circle class="m" cx="17.8" cy="13.4" r="1.4"/>' },
  { code: '10', color: '#d4a017', key: 'tidying', paths: '<path class="m" d="M10 3l1.9 5.1L17 10l-5.1 1.9L10 17l-1.9-5.1L3 10l5.1-1.9z"/><path class="h" d="M18 13l1 2.5 2.5 1-2.5 1L18 20l-1-2.5-2.5-1 2.5-1z"/>' },
  { code: '11', color: '#0ea5c6', key: 'shower', paths: '<rect class="t" x="11" y="2" width="2" height="4" rx="1"/><path class="m" d="M4.5 11a7.5 7.5 0 0 1 15 0z"/><path class="s2" d="M7 14l-1 3M12 14v3.5M17 14l1 3M9.5 19l-.6 2M14.5 19l.6 2"/>' },
  { code: '12', color: '#9a5b34', key: 'caffeine', paths: '<path class="s2" d="M9 2.5c-.8 1 .8 1.8 0 3M12.5 2.5c-.8 1 .8 1.8 0 3"/><path class="m" d="M4 8h13v6.5A5.5 5.5 0 0 1 11.5 20h-2A5.5 5.5 0 0 1 4 14.5z"/><path class="s" d="M17 10h1.3a2.5 2.5 0 0 1 0 5H17"/><rect class="t" x="3" y="20.2" width="15" height="2" rx="1"/>' },
  { code: '13', color: '#a855f7', key: 'anxious', paths: '<circle class="t" cx="12" cy="12" r="10"/><path class="s" d="M5.5 12c1.4-3 2.8-3 4.2 0s2.8 3 4.2 0 2.8-3 4.2 0"/>' },
  { code: '14', color: '#c2410c', key: 'stressed', paths: '<path class="t" d="M2.5 17a9.5 9.5 0 0 1 19 0z"/><path class="s" d="M12 17l5.2-6.2"/><circle class="m" cx="12" cy="17" r="2.4"/>' },
  { code: '15', color: '#dc2626', key: 'unwell', paths: '<rect class="t" x="9" y="2" width="6" height="14" rx="3"/><rect class="m" x="11" y="7" width="2" height="10" rx="1"/><circle class="m" cx="12" cy="17.5" r="4"/>' },
  { code: '16', color: '#ca8a04', key: 'tired', paths: '<rect class="t" x="2" y="7" width="17" height="10" rx="2.5"/><rect class="m" x="20" y="10" width="2" height="4" rx="1"/><rect class="m" x="4" y="9" width="4" height="6" rx="1"/>' },
  { code: '17', color: '#3b82f6', key: 'lateWater', paths: '<path class="t" d="M5 3h14l-1.6 16.4A2.8 2.8 0 0 1 14.6 22H9.4a2.8 2.8 0 0 1-2.8-2.6z"/><path class="m" d="M6.2 10h11.6l-1 9.4a1.4 1.4 0 0 1-1.4 1.3H8.6a1.4 1.4 0 0 1-1.4-1.3z"/>' },
  { code: '18', color: '#78716c', key: 'noise', paths: '<path class="m" d="M3 9h4l5-4.5v15L7 15H3z"/><path class="s" d="M15.5 9a4 4 0 0 1 0 6M18.5 6.2a8 8 0 0 1 0 11.6"/>' },
];

export const TAG_BY_CODE = new Map(BEDTIME_TAGS.map((tag) => [tag.code, tag]));

/** 首页打卡先摆的 8 个（最常见的），其余收在「更多」后面。 */
export const FREQUENT: BedtimeCode[] = ['2', '3', '8', '12', '4', '5', '1', '14'];

export type MoodKey = 'sad' | 'drained' | 'sleepy' | 'calm' | 'great';
export interface MoodLook { code: WakeMood; color: string; key: MoodKey }
/** 显示顺序：难过 → 很好（编号是 Zepp 的 sf 码）。 */
export const MOODS: MoodLook[] = [
  { code: '5', color: '#7aa7f5', key: 'sad' },
  { code: '1', color: '#a9b6c6', key: 'drained' },
  { code: '2', color: '#aab5fb', key: 'sleepy' },
  { code: '3', color: '#4cc38a', key: 'calm' },
  { code: '4', color: '#ffc53d', key: 'great' },
];
export const MOOD_BY_CODE = new Map(MOODS.map((mood) => [mood.code, mood]));

/** 图标的 svg 内部：把类名换成写死的颜色属性。 */
export const tagSvg = (tag: BedtimeTag): string => tag.paths
  .replace(/class="m"/g, `fill="${tag.color}"`)
  .replace(/class="t"/g, `fill="${tag.color}" fill-opacity=".3"`)
  .replace(/class="h"/g, `fill="${tag.color}" fill-opacity=".6"`)
  .replace(/class="w"/g, 'fill="#fff" fill-opacity=".85"')
  .replace(/class="s"/g, `fill="none" stroke="${tag.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`)
  .replace(/class="s2"/g, `fill="none" stroke="${tag.color}" stroke-width="1.8" stroke-linecap="round" stroke-opacity=".6"`);

const FACE_INK = '#3b2c20';
const STROKE = `fill="none" stroke="${FACE_INK}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"`;
const FEATURES: Record<WakeMood, string> = {
  '4': `<path ${STROKE} d="M13.5 20.5q3-3.6 6 0M28.5 20.5q3-3.6 6 0"/><path fill="${FACE_INK}" d="M15 27h18a9 9 0 0 1-18 0z"/><path fill="#ff7a7a" d="M19.5 32.6a4.6 3 0 0 1 9 0 9 9 0 0 1-9 0z"/><circle cx="12" cy="27" r="3" fill="#ff8a7a" opacity=".55"/><circle cx="36" cy="27" r="3" fill="#ff8a7a" opacity=".55"/>`,
  '3': `<path ${STROKE} d="M13.5 21q3 3 6 0M28.5 21q3 3 6 0"/><path ${STROKE} d="M18 30q6 4.2 12 0"/><circle cx="12.5" cy="27" r="2.6" fill="#ff8a7a" opacity=".35"/><circle cx="35.5" cy="27" r="2.6" fill="#ff8a7a" opacity=".35"/>`,
  // 困：眯着的眼、小嘴，右上两个「z」画成折线（不用文字：字体和语言都不影响）。
  '2': `<path ${STROKE} d="M13.5 22.5h6M28.5 22.5h6"/><path fill="${FACE_INK}" opacity=".18" d="M12.5 19h8v3.5h-8zM27.5 19h8v3.5h-8z"/><ellipse cx="24" cy="31" rx="2.6" ry="3" fill="${FACE_INK}"/><path fill="none" stroke="#5b63c9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M35 6h5l-5 6h5M41.5 1.5h3.5l-3.5 4h3.5"/>`,
  '1': `<path ${STROKE} d="M13.5 20.5l6 2M34.5 20.5l-6 2"/><circle cx="17" cy="25" r="1.9" fill="${FACE_INK}"/><circle cx="31" cy="25" r="1.9" fill="${FACE_INK}"/><path ${STROKE} d="M17 32.5q2.3-2 4.6 0t4.6 0t4.6 0"/>`,
  '5': `<path ${STROKE} d="M13.5 18.5l6-2M34.5 18.5l-6-2"/><circle cx="17" cy="23.5" r="2.1" fill="${FACE_INK}"/><circle cx="31" cy="23.5" r="2.1" fill="${FACE_INK}"/><path ${STROKE} d="M17.5 33q6.5-5 13 0"/><path fill="#cfe4ff" stroke="#5a8fe6" stroke-width="1" d="M33 27.5q2.6 3.6 2.6 5.2a2.6 2.6 0 0 1-5.2 0q0-1.6 2.6-5.2z"/>`,
};
/** 心情小脸的 svg 内部（48×48）。 */
export const faceSvg = (code: WakeMood): string => {
  const mood = MOOD_BY_CODE.get(code)!;
  return `<circle cx="24" cy="24" r="22" fill="${mood.color}"/><ellipse cx="17" cy="13.5" rx="9" ry="5.5" fill="#fff" opacity=".35"/>${FEATURES[code]}`;
};

/** 按 Zepp 的编号排好、去重。 */
export const sortCodes = (codes: Iterable<BedtimeCode>): BedtimeCode[] =>
  [...new Set(codes)].sort((a, b) => Number(a) - Number(b));
