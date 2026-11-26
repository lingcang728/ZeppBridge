/**
 * 睡前日志与睡醒心情的全局状态：首页打卡、今日一问「昨晚」那一条、睡眠列表上的标记、睡眠页的睡前因素都读这一份。
 *
 * - 记在醒来那天下（和 Zepp 一样）。一处改了，别处立刻跟着变：同一张表。
 * - 在这里记的只存本机，不写回 Zepp（同步只把 Zepp App 里记的拉回来）。
 * - 点一下就存的地方（今日一问那一条、列表上的浮层）走 `saveSoon`：连点几下只存最后一次。
 */
import { ref, shallowRef, triggerRef } from 'vue';
import { backend, isDesktop } from '../lib/bridge';
import type { BedtimeCode, SleepFactors, SleepJournalEntry, SleepJournalPrompt, WakeMood } from '../types/sleepJournal';
import { sortCodes } from '../components/sleepJournal/journalCodes';

const prompt = ref<SleepJournalPrompt | null>(null);
/** 醒来那天 → 那一晚。只放读到过的日期。 */
const entries = shallowRef(new Map<string, SleepJournalEntry>());
const factors = ref<SleepFactors | null>(null);
/** 每存一次加一：睡前因素据此重读。 */
const saves = ref(0);
let promptSeq = 0;
let factorsSeq = 0;
const timers = new Map<string, number>();
const SAVE_DELAY = 700;

const put = (entry: SleepJournalEntry) => {
  entries.value.set(entry.date, entry);
  triggerRef(entries);
};

/** 没记过 / 记了又清空：界面上当没记。 */
export const isBlank = (entry: SleepJournalEntry | null | undefined) => !entry || (!entry.behaviors.length && !entry.mood);

export const useSleepJournal = () => {
  const loadPrompt = async () => {
    if (!isDesktop()) return;
    const mine = ++promptSeq;
    try {
      const next = await backend.sleepJournalPrompt();
      if (mine === promptSeq) prompt.value = next;
    } catch {
      // 读不到就不问：这张卡不是必需的。
    }
  };

  const loadRange = async (from: string, to: string) => {
    if (!isDesktop()) return;
    try {
      const list = await backend.sleepJournalList(from, to);
      for (const entry of list) entries.value.set(entry.date, entry);
      triggerRef(entries);
    } catch {
      // 标记读不到就不画，不影响列表本身。
    }
  };

  const loadFactors = async () => {
    if (!isDesktop()) return;
    const mine = ++factorsSeq;
    try {
      const next = await backend.sleepJournalFactors();
      if (mine === factorsSeq) factors.value = next;
    } catch {
      if (mine === factorsSeq) factors.value = null;
    }
  };

  const entry = (date: string): SleepJournalEntry | null => entries.value.get(date) ?? null;

  const save = async (date: string, behaviors: Iterable<BedtimeCode>, mood: WakeMood | null) => {
    const pendingTimer = timers.get(date);
    if (pendingTimer) { window.clearTimeout(pendingTimer); timers.delete(date); }
    const saved = await backend.sleepJournalSave({ date, behaviors: sortCodes(behaviors), mood });
    put(saved);
    saves.value += 1;
    return saved;
  };

  /** 先在界面上改好，过一会儿再存（连点只存最后一次）。 */
  const saveSoon = (date: string, behaviors: Iterable<BedtimeCode>, mood: WakeMood | null) => {
    const codes = sortCodes(behaviors);
    const previous = entries.value.get(date);
    put({ date, behaviors: codes, mood, source: 'local', updated_at: previous?.updated_at ?? '' });
    window.clearTimeout(timers.get(date));
    timers.set(date, window.setTimeout(() => {
      timers.delete(date);
      void save(date, codes, mood).catch(() => { /* 本机没存上：下次打开照旧读库里的 */ });
    }, SAVE_DELAY));
  };

  /** 关掉今天这一问（只今天）。 */
  const dismiss = async () => {
    prompt.value = null;
    try { await backend.sleepJournalDismiss(); } catch { /* 下次再问一遍也无妨 */ }
  };

  /** 这周别问（到下周一）。 */
  const snooze = async () => {
    prompt.value = null;
    try { await backend.sleepJournalSnooze(); } catch { /* 同上 */ }
  };

  return { prompt, entries, factors, saves, loadPrompt, loadRange, loadFactors, entry, save, saveSoon, dismiss, snooze };
};
