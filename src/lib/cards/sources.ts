/**
 * 牌桌的牌从哪来（精修批次 7.2）：一项指标（指标卡），或一整类（「你的过去」的某一行、睡眠详情）。
 * 两种都只回答「这一天有没有记录、读数是多少」，牌桌不管数据从哪个接口来。
 */
import { backend } from '../bridge';
import type { AiTaskCategory } from '../bridge/types';
import { dayKey, daysBetween } from '../aiTask/bridgeScale';
import { daysBetweenInclusive, WORKOUT_PREFIX } from './deck';
import type { DeckDay } from './deck';
import { formatDistance, formatDuration } from '../format';
import { workoutDisplayLabel, workoutDurationMinutes, workoutIcon } from '../workouts';

export interface DeckSource {
  /** 收集箱里的项：指标名，或 `cat:<类别>`。 */
  key: string;
  category: AiTaskCategory;
  label: string;
  /** 牌面数值的颜色（和这一项在别处的颜色一致）。 */
  tint: string;
  /** 读数怎么写（跟卡片自己的格式一致）；没有就只说「有记录」。 */
  format: ((value: number) => string) | null;
  unit?: string;
  /** 取 `[start, end]` 每一天（旧 → 新），没有记录的日子照样给一格（has: false），不补 0。 */
  loadDays: (start: string, end: string) => Promise<DeckDay[]>;
  /** `workouts`：一次运动一张牌（只有「这一天前后」一层，不分 7 天 / 1 个月 / 6 个月）。 */
  kind?: 'days' | 'workouts';
  /** 收集箱里的一张牌是不是这一副里的、是哪一张（默认：键相同，id 是日期）。 */
  idOfPick?: (pick: { key: string; date: string }) => string | null;
  /** 不在收集箱里、但已经算「选上了」的牌（运动：任务里已经勾上的那几次）。 */
  extraBoxed?: () => string[];
  /** 把一张「已经选上」的牌拿出来时，顺带从别处撤掉（运动：从任务的运动列表里去掉）。 */
  release?: (id: string) => void;
}

export const metricSource = (options: {
  metric: string; category: AiTaskCategory; label: string; tint: string; format: (value: number) => string; unit?: string;
}): DeckSource => ({
  key: options.metric,
  category: options.category,
  label: options.label,
  tint: options.tint,
  format: options.format,
  unit: options.unit,
  loadDays: async (start, end) => {
    // 指标序列只能「从今天往回 N 天」地取：取到 start 为止，再截到 end。
    const [series] = await backend.getMetricSeries([options.metric], daysBetween(start, deckToday()) + 1);
    const byDate = new Map((series?.points ?? []).filter((p) => Number.isFinite(p.value)).map((p) => [p.date, p.value]));
    return daysBetweenInclusive(start, end, (date) => (byDate.has(date) ? { value: byDate.get(date)!, has: true } : null));
  },
});

export const categorySource = (options: {
  category: AiTaskCategory; label: string; tint: string; format: ((value: number) => string) | null; unit?: string;
}): DeckSource => ({
  key: `cat:${options.category}`,
  category: options.category,
  label: options.label,
  tint: options.tint,
  format: options.format,
  unit: options.unit,
  loadDays: async (start, end) => {
    const rows = await backend.aiTaskDayStrip(daysBetween(start, end) + 1, end);
    const cells = rows.find((row) => row.category === options.category)?.cells ?? [];
    const byDate = new Map(cells.map((cell) => [cell.date, cell]));
    return daysBetweenInclusive(start, end, (date) => {
      const cell = byDate.get(date);
      return cell ? { value: cell.value, has: cell.has || cell.value !== null } : null;
    });
  },
});

const ICONS = { 'body-activity': 'activity', 'outdoor-cycling': 'bike', 'outdoor-run': 'run' } as const;

/**
 * 「你的过去」运动那一行（第三轮 B3，用户 10-07 选「一次运动一张牌」）：这段时间里的每一次运动一张牌，
 * 牌面是运动图标、日期、时长 · 距离；放进收集箱的键是 `workout:<运动 id>`，交给任务时写进 workout_ids。
 * 任务里已经勾上的运动在牌上显示为「已在箱中」。只用现有的运动列表接口，不加后端命令。
 */
export const workoutSource = (options: { label: string; tint: string; picked: () => string[]; release: (id: string) => void }): DeckSource => ({
  key: 'workout',
  category: 'workout',
  label: options.label,
  tint: options.tint,
  format: null,
  kind: 'workouts',
  idOfPick: (pick) => (pick.key.startsWith(WORKOUT_PREFIX) ? pick.key.slice(WORKOUT_PREFIX.length) : null),
  extraBoxed: options.picked,
  release: options.release,
  loadDays: async (start, end) => {
    const page = await backend.getWorkoutPage(400, 0);
    return page.items
      .map((workout) => ({ workout, date: dayKey(new Date(workout.start_time)) }))
      .filter(({ date }) => date >= start && date <= end)
      .sort((a, b) => a.workout.start_time.localeCompare(b.workout.start_time))
      .map(({ workout, date }) => {
        const minutes = workoutDurationMinutes(workout);
        const meters = workout.distance_meters ?? 0;
        const text = [minutes !== null ? formatDuration(minutes) : null, meters > 0 ? formatDistance(meters) : null].filter(Boolean).join(' · ');
        return {
          date, value: null, has: true, id: workout.workout_id, pickKey: `${WORKOUT_PREFIX}${workout.workout_id}`,
          icon: ICONS[workoutIcon(workout)], text: text || workoutDisplayLabel(workout),
        };
      });
  },
});

/** 牌桌的「今天」：和条带一样用本地日。 */
export const deckToday = (): string => dayKey();
