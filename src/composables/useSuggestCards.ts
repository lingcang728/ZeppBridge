/**
 * 首页建议卡的开关和「关过 / 今天出过」：记在这台电脑的浏览器存储里（不进数据库、不加迁移）。
 *
 * - 开关：设置 → AI 里一行，关了首页一张建议卡都不出；
 * - 关掉一张（×）或点了它：这一次（`key`，如 `workout_done:<运动 id>`）再也不出；这一类（触发码）今天也不再出别的；
 * - 记不住（隐私模式、存储被清）就当没关过，下次照样提示，不报错。
 * 旧记录只留 30 天。
 */
import { ref } from 'vue';
import type { SuggestionCode } from '../types/hands';

const KEY = 'zeppbridge-suggest-cards';
const KEEP_DAYS = 30;

interface Stored {
  enabled: boolean;
  /** 关过 / 点过的 key → 哪一天。 */
  closed: Record<string, string>;
  /** 触发码 → 今天关过 / 点过（一天只出一次）。 */
  codes: Partial<Record<SuggestionCode | 'plan_tomorrow', string>>;
}

const localDay = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const read = (): Stored => {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? 'null');
    if (raw && typeof raw === 'object') {
      const value = raw as Partial<Stored>;
      return {
        enabled: value.enabled !== false,
        closed: value.closed && typeof value.closed === 'object' ? value.closed : {},
        codes: value.codes && typeof value.codes === 'object' ? value.codes : {},
      };
    }
  } catch {
    // 读不到就当第一次。
  }
  return { enabled: true, closed: {}, codes: {} };
};

const state = ref<Stored>(read());

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
  state,
});
