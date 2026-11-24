/**
 * 发牌桌一张牌的牌面：一次运动是「距离（或时长）+ 配速（或心率）+ 轨迹缩略 / 心率小线」，
 * 一晚是「睡了多久 + 哪里不对（HRV 低、静息心率高…）或 HRV」。左上角写这张牌在这手里的角色（这次 / PR / 前一天…）。
 */
import type { IconName } from '../Icon.vue';
import { AI_TASK_CATEGORY_META } from '../../lib/aiTask/categories';
import { formatDistance, formatDuration } from '../../lib/format';
import { formatPaceSeconds } from '../../lib/metricSeries';
import { paceUnitLabel } from '../../lib/units';
import { familyOf, paceOf, type HandCard } from '../../lib/cards/hands';
import { routeSketch, sparkPath } from '../../lib/cards/faceValue';
import { displayDateTimeFormatter, parseDisplayDate } from '../../lib/dateTime';
import type { HandLines } from '../../types/hands';
import type { useHandsText } from './hands.i18n';

type HandsText = ReturnType<typeof useHandsText>['value'];

export interface HandFace {
  top: string;
  title: string;
  value: string | null;
  note: string | null;
  sketch: { kind: 'route' | 'line'; d: string } | null;
  icon: IconName;
  tint: string;
  /** 读屏用：日期 + 读数。 */
  label: string;
}

const md = (date: string) => displayDateTimeFormatter({ month: 'numeric', day: 'numeric' }).format(parseDisplayDate(date));
const ICON: Record<string, IconName> = { run: 'run', ride: 'bike', swim: 'swim' };

export const handFace = (card: HandCard, t: HandsText, lines?: HandLines | null): HandFace => {
  const top = t.role[card.role];
  const title = md(card.date);
  if (card.kind === 'night') {
    const n = card.night;
    const value = n.duration_min !== null ? formatDuration(n.duration_min) : null;
    const note = card.flags?.length ? card.flags.map((flag) => t.flag[flag]).join(' · ') : n.hrv !== null ? t.hrvNote(Math.round(n.hrv)) : null;
    return { top, title, value, note, sketch: null, icon: 'moon', tint: AI_TASK_CATEGORY_META.sleep.tint, label: [title, value, note].filter(Boolean).join(', ') };
  }
  const w = card.workout;
  const family = familyOf(w.workout_type);
  const hasDistance = (w.distance_m ?? 0) > 0;
  const value = hasDistance ? formatDistance(w.distance_m ?? undefined) : formatDuration(w.duration_s / 60);
  const pace = family === 'run' ? paceOf(w) : null;
  const note = pace !== null ? `${formatPaceSeconds(pace)}${paceUnitLabel()}`
    : w.avg_hr !== null ? `${Math.round(w.avg_hr)} bpm`
      : hasDistance ? formatDuration(w.duration_s / 60) : null;
  const route = lines?.route.length ? routeSketch(lines.route) : null;
  const hr = !route && lines?.hr.length ? sparkPath(lines.hr) : null;
  const sketch = route ? { kind: 'route' as const, d: route } : hr ? { kind: 'line' as const, d: hr } : null;
  return {
    top, title, value, note, sketch, icon: ICON[family] ?? 'activity', tint: AI_TASK_CATEGORY_META.workout.tint,
    label: [top, title, value, note].filter(Boolean).join(', '),
  };
};
