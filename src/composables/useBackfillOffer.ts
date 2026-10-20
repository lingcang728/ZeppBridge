/**
 * 就地补拉（3.0.4「补拉引导」）：「交给 AI」第一次选 1 年 / 全部、概览上本机历史不满一年时，
 * 在原地给 1 / 2 / 3 / 10 年几个选项。跑的是设置页同一个补拉循环（useHistoryBackfill，模块级，离开页面照跑），
 * 不另起一套。用户说「先不用」就记下来，同一处不再问。
 */
import { computed, ref } from 'vue';
import { useHistoryBackfill } from './useHistoryBackfill';
import { useSyncController } from './useSyncController';
import { backend, isDesktop } from '../lib/bridge';
import type { BackfillChoice } from '../lib/backfillRange';
import type { UserPrefs } from '../types';

export type OfferYears = 1 | 2 | 3 | 10;
const CHOICE: Record<OfferYears, BackfillChoice> = { 1: '1y', 2: '2y', 3: '3y', 10: 'all' };
/** 同步本来就有一两天的滞后：本机最早一天比要的起点晚不到一周，不算缺。 */
const SLACK_DAYS = 7;

const dismissKey = (place: string) => `zb.backfillOffer.dismissed.${place}`;
const readDismissed = (place: string): boolean => {
  try { return window.localStorage.getItem(dismissKey(place)) === '1'; } catch { return false; }
};

const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / 86_400_000;

export const useBackfillOffer = (place: string) => {
  const { appStatus } = useSyncController();
  const prefs = ref<UserPrefs | null>(null);
  const backfill = useHistoryBackfill(() => prefs.value, (next) => { prefs.value = next; });
  const dismissed = ref(readDismissed(place));
  const earliest = computed(() => appStatus.value?.coverage?.earliest_day ?? null);

  /** 本机最早一天明显晚于 `start`，账本也还没往那么早问过：值得问一句。 */
  const shortOf = (start: string): boolean => {
    const first = earliest.value;
    if (!isDesktop() || !first || dayNumber(first) - dayNumber(start) <= SLACK_DAYS) return false;
    const asked = backfill.ledger.value?.requested_from;
    return !asked || asked > start;
  };

  const dismiss = () => {
    dismissed.value = true;
    try { window.localStorage.setItem(dismissKey(place), '1'); } catch { /* 记不住只是下次再问一遍 */ }
  };

  /** 在后台补拉 `years` 年；不等它跑完（循环是模块级的）。 */
  const start = async (years: OfferYears) => {
    if (backfill.busy.value) return;
    if (!prefs.value) {
      try { prefs.value = await backend.getUserPrefs(); } catch { prefs.value = null; }
    }
    backfill.startChoice.value = CHOICE[years];
    void backfill.runBackfill();
  };

  return {
    earliest, dismissed, shortOf, dismiss, start,
    busy: backfill.busy, error: backfill.error, message: backfill.message, stop: backfill.stopBackfill,
  };
};
