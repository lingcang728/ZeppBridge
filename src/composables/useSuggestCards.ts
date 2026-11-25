/**
 * 首页「今日一问」的开关、手动换到的那一问和「用过 / 今天关过」：记在这台电脑的浏览器存储里（不进数据库、不加迁移）。
 *
 * - 开关：设置 → AI 里一行，关了首页不出这张卡；
 * - 用了某个后端触发的那一问（刚练完、昨晚睡得差、很久没动）：这一次（`key`，如 `workout_done:<运动 id>`）再也不出，
 *   这一类（触发码）今天也不再出别的；
 * - 卡上的刷新键换到的那一问记到当天，第二天重新按推荐来；
 * - 卡上的 ×：不再让卡消失，而是缩成「我的指标」标题右边的一枚小胶囊（当天有效），点胶囊原路展开；
 *   胶囊和卡之间的形变由卡这一头（SuggestCards）放，`suggestMorph` 标着正在往哪边飞（飞的时候胶囊先藏着），
 *   `suggestChip` 是胶囊元素（有能问的就一直挂着占位，没缩小时藏起来，形变才量得到终点）；
 * - 记不住（隐私模式、存储被清）就当没关过，下次照样提示，不报错。
 * 旧记录只留 30 天。
 */
import { ref, shallowRef } from 'vue';
import type { SuggestionCode } from '../types/hands';

const KEY = 'zeppbridge-suggest-cards';
const KEEP_DAYS = 30;

interface Stored {
  enabled: boolean;
  /** 关过 / 点过的 key → 哪一天。 */
  closed: Record<string, string>;
  /** 触发码 → 今天关过 / 点过（一天只出一次）。 */
  codes: Partial<Record<SuggestionCode | 'plan_tomorrow', string>>;
  /** 今天手动换到的那一问（模板名）和哪一天。 */
  pick: { day: string; template: string } | null;
  /** 哪一天把卡缩成了小胶囊。 */
  mini: string | null;
}

/** 旧版存储里的 quiet：哪一天按了卡上的 ×（那天整张卡不出、也没有入口叫回来）。读进来当成那天缩成了胶囊，下次写时丢掉。 */
type Legacy = Partial<Stored> & { quiet?: unknown };

const localDay = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const read = (): Stored => {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? 'null');
    if (raw && typeof raw === 'object') {
      const value = raw as Legacy;
      return {
        enabled: value.enabled !== false,
        closed: value.closed && typeof value.closed === 'object' ? value.closed : {},
        codes: value.codes && typeof value.codes === 'object' ? value.codes : {},
        pick: value.pick && typeof value.pick === 'object' && typeof value.pick.day === 'string' && typeof value.pick.template === 'string' ? value.pick : null,
        mini: typeof value.mini === 'string' ? value.mini : typeof value.quiet === 'string' ? value.quiet : null,
      };
    }
  } catch {
    // 读不到就当第一次。
  }
  return { enabled: true, closed: {}, codes: {}, pick: null, mini: null };
};

const state = ref<Stored>(read());

/** 今天有没有能问的（首页那张卡挂着时写；胶囊据此决定出不出）。 */
export const suggestAvailable = ref(false);
/** 卡 ↔ 胶囊的形变正在往哪边飞：'to-chip' 缩小、'from-chip' 从胶囊长回来。 */
export const suggestMorph = ref<'idle' | 'to-chip' | 'from-chip'>('idle');
/** 胶囊元素（SuggestChip 挂上时写）。 */
export const suggestChip = shallowRef<HTMLElement | null>(null);

const write = (next: Stored) => {
  const cutoff = localDay(new Date(Date.now() - KEEP_DAYS * 86_400_000));
  const closed = Object.fromEntries(Object.entries(next.closed).filter(([, day]) => day >= cutoff));
  state.value = { ...next, closed };
  try { window.localStorage.setItem(KEY, JSON.stringify(state.value)); } catch { /* 记不住就下次再提示 */ }
};

export const useSuggestCards = () => ({
  enabled: () => state.value.enabled,
  setEnabled: (enabled: boolean) => write({ ...state.value, enabled }),
  /** 这一张该不该出：开着、这一次没关过、这一类今天没关过。 */
  visible: (code: SuggestionCode | 'plan_tomorrow', key: string, today = localDay()) =>
    state.value.enabled && !state.value.closed[key] && state.value.codes[code] !== today,
  /** 关掉（或点了）这一张。 */
  close: (code: SuggestionCode | 'plan_tomorrow', key: string, today = localDay()) =>
    write({ ...state.value, closed: { ...state.value.closed, [key]: today }, codes: { ...state.value.codes, [code]: today } }),
  /** 今天手动换到的那一问；不是今天换的就是 null（按推荐来）。 */
  picked: (today = localDay()) => (state.value.pick?.day === today ? state.value.pick.template : null),
  pick: (template: string, today = localDay()) => write({ ...state.value, pick: { day: today, template } }),
  /** 今天这张卡出不出（缩成胶囊也算出，胶囊和卡由 minimized 分）。 */
  showToday: () => state.value.enabled,
  /** 今天缩成了小胶囊。 */
  minimized: (today = localDay()) => state.value.mini === today,
  minimize: (today = localDay()) => write({ ...state.value, mini: today }),
  restore: () => write({ ...state.value, mini: null }),
  state,
});
