/**
 * 收集箱（精修批次 7.3）：从指标卡、「你的过去」的牌桌上挑出来的「哪一项 × 哪一天」。
 *
 * 全局单例。存在本机库里（`card_collection_get/set`，app_meta 的一个键），重启还在；
 * 改动攒 300ms 再整份写一次。点箱子上的箭头 → 新开一个任务、只勾这些「类别 × 天」、去交给 AI；
 * 真正交出去之后（`clearAfterHandoff`）才清空——中途反悔回来，牌还在箱子里。
 */
import { computed, ref } from 'vue';
import { backend, isDesktop } from '../lib/bridge';
import type { AiTaskCategory, CardPick } from '../lib/bridge/types';
import { WORKOUT_PREFIX } from '../lib/cards/deck';

const picks = ref<CardPick[]>([]);
/** 这个任务是从收集箱开的：交出去后清空箱子。 */
const handedToTask = ref(false);
/** 开着几张牌桌（第三轮 A4）：开着的时候箱子哪怕是空的也跟着牌桌滑进来，等着接牌。 */
const tables = ref(0);
/** 有一张（或一叠）牌正被拖着悬在箱子上方（1B·B2）：箱子亮起「松手放进来」。 */
const dropHover = ref(false);
let loaded = false;
let saveTimer = 0;

const keyOf = (pick: Pick<CardPick, 'key' | 'date'>) => `${pick.key}@${pick.date}`;

const load = async () => {
  if (loaded) return;
  loaded = true;
  if (!isDesktop()) return;
  try {
    const stored = await backend.cardCollectionGet();
    // 加载途中已经挑了牌：合在一起，别把刚挑的冲掉。
    const seen = new Set(picks.value.map(keyOf));
    picks.value = [...picks.value, ...stored.filter((pick) => !seen.has(keyOf(pick)))];
  } catch {
    // 读不出来就当空箱子：只是界面状态。
  }
};

const save = () => {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    if (!isDesktop()) return;
    void backend.cardCollectionSet(picks.value).catch(() => undefined);
  }, 300);
};

const has = (key: string, date: string) => picks.value.some((pick) => pick.key === key && pick.date === date);

/** 把这几天放进箱子（已在的不重复）。返回真正新放进去的天数。 */
const add = (key: string, category: AiTaskCategory, dates: string[]): number => {
  const seen = new Set(picks.value.map(keyOf));
  const fresh = dates.filter((date) => !seen.has(keyOf({ key, date }))).map((date) => ({ key, category, date }));
  if (!fresh.length) return 0;
  picks.value = [...picks.value, ...fresh];
  save();
  return fresh.length;
};

const remove = (key: string, dates: string[]) => {
  const drop = new Set(dates.map((date) => keyOf({ key, date })));
  const next = picks.value.filter((pick) => !drop.has(keyOf(pick)));
  if (next.length === picks.value.length) return;
  picks.value = next;
  save();
};

const clear = () => {
  if (!picks.value.length) return;
  picks.value = [];
  save();
};

/** 运动牌：一次运动一张，键是 `workout:<运动 id>`（第三轮 B3），日期是那次运动的本地日。 */
export { WORKOUT_PREFIX } from '../lib/cards/deck';
const isWorkout = (key: string) => key.startsWith(WORKOUT_PREFIX);

/** 按项归拢：每一项一组（运动牌合成一组「运动」），组内按天升序；组按第一次放进来的顺序。 */
const groups = computed(() => {
  const byKey = new Map<string, { key: string; category: AiTaskCategory; dates: string[]; items: Array<{ key: string; date: string }> }>();
  for (const pick of picks.value) {
    const groupKey = isWorkout(pick.key) ? 'workout' : pick.key;
    const group = byKey.get(groupKey) ?? { key: groupKey, category: pick.category, dates: [], items: [] };
    group.dates.push(pick.date);
    group.items.push({ key: pick.key, date: pick.date });
    byKey.set(groupKey, group);
  }
  for (const group of byKey.values()) {
    group.dates.sort();
    group.items.sort((a, b) => a.date.localeCompare(b.date));
  }
  return [...byKey.values()];
});

/** 交给任务时用：每一类挑了哪几天（同一类的几项合在一起；运动牌不在这里，见 workoutIds）。 */
const byCategory = (): Map<AiTaskCategory, string[]> => {
  const out = new Map<AiTaskCategory, string[]>();
  for (const pick of picks.value) {
    if (isWorkout(pick.key)) continue;
    out.set(pick.category, [...(out.get(pick.category) ?? []), pick.date]);
  }
  return out;
};

/** 箱子里的运动牌：交给任务时写进 `workout_ids`。 */
const workoutIds = (): string[] => picks.value.filter((pick) => isWorkout(pick.key)).map((pick) => pick.key.slice(WORKOUT_PREFIX.length));

export const useCardCollection = () => {
  void load();
  return {
    picks,
    groups,
    count: computed(() => picks.value.length),
    has,
    add,
    remove,
    clear,
    byCategory,
    workoutIds,
    handedToTask,
    /** 有牌桌开着（箱子空的也要露面接牌）。 */
    tableOpen: computed(() => tables.value > 0),
    dropHover,
    /** 牌桌开 / 收：成对调用。 */
    setTableOpen: (open: boolean) => { tables.value = Math.max(0, tables.value + (open ? 1 : -1)); },
    /** 任务真的交出去了：如果它是从收集箱开的，清空箱子。 */
    clearAfterHandoff: () => {
      if (!handedToTask.value) return;
      handedToTask.value = false;
      clear();
    },
  };
};
