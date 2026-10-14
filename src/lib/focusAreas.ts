/**
 * 概览「我关注」的三个区块与概览模块的对应（纯函数，不碰 Vue、不出文案）。
 *
 * 关注的是区块，不是每一张卡：睡眠、日常状态（心率 / 步数 / 身体 / 活动）、训练。
 * 跨区块的模块（最近记录、这一周、生活事件、数据来源）不属于任何一个区块，
 * 不参与筛选，也永远排在原位。
 */

export type FocusArea = 'sleep' | 'daily' | 'training';

/** 受「我关注」影响的概览模块。 */
export type FocusModule = 'heart' | 'steps' | 'sleep' | 'body' | 'training';

/** 区块顺序（设置里那行和首次提问的芯片都按这个顺序）。 */
export const FOCUS_AREAS: readonly FocusArea[] = ['sleep', 'daily', 'training'];

/** 每个模块属于哪个区块。 */
export const MODULE_AREA: Record<FocusModule, FocusArea> = {
  heart: 'daily',
  steps: 'daily',
  sleep: 'sleep',
  body: 'daily',
  training: 'training',
};

/** 模块的固有顺序：没筛选时页面就是这个顺序，筛选后选中的按它靠前。 */
const MODULE_ORDER: readonly FocusModule[] = ['heart', 'steps', 'sleep', 'body', 'training'];

const isArea = (value: unknown): value is FocusArea =>
  (FOCUS_AREAS as readonly string[]).includes(value as FocusArea);

/** 只留认识的区块、去重、保持点选顺序。 */
export const normalizeAreas = (value: unknown): FocusArea[] => {
  if (!Array.isArray(value)) return [];
  const out: FocusArea[] = [];
  for (const item of value) if (isArea(item) && !out.includes(item)) out.push(item);
  return out;
};

export interface FocusSplit {
  /** 选中的区块里的模块，按固有顺序。 */
  matched: FocusModule[];
  /** 没选中的区块里的模块，收在「查看全部」后面。 */
  folded: FocusModule[];
}

/**
 * 选择怎么影响布局。`null` = 不筛（一个都没选 / 三个全选）：页面就是今天的原样。
 * 全选和没选是同一种「没有偏好」，不给一套把所有模块排一遍的伪布局。
 */
export const focusSplit = (areas: readonly string[]): FocusSplit | null => {
  const picked = normalizeAreas(areas);
  if (picked.length === 0 || picked.length === FOCUS_AREAS.length) return null;
  const matched = MODULE_ORDER.filter((module) => picked.includes(MODULE_AREA[module]));
  const folded = MODULE_ORDER.filter((module) => !picked.includes(MODULE_AREA[module]));
  return { matched, folded };
};

/**
 * 滑块上的一格：「均衡」= 没有偏好（页面原样），其余三格各对应一个区块。
 * 滑块一次只停在一格上；旧版多选存下的两个区块读成「均衡」，用户一拖就换成单选。
 */
export type FocusChoice = 'all' | FocusArea;
export const FOCUS_CHOICES: readonly FocusChoice[] = ['all', ...FOCUS_AREAS];

export const focusChoiceOf = (areas: readonly string[]): FocusChoice => {
  const picked = normalizeAreas(areas);
  return picked.length === 1 ? picked[0]! : 'all';
};

export const areasForChoice = (choice: FocusChoice): FocusArea[] => (choice === 'all' ? [] : [choice]);

/** 区块在界面语言里的名字（菜单 / 芯片 / 那行提问共用一份）。 */
export const FOCUS_AREA_KEYS: Record<FocusArea, string> = {
  sleep: 'areaSleep',
  daily: 'areaDaily',
  training: 'areaTraining',
};
