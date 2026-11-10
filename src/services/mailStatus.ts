/**
 * 来信提醒（用户 2026-11-10 定）：三样新东西会让左上角的 Z 变成信封——
 *
 *   作者一对一回信（`letterBox.ts` 的 hasNewAuthorReply，拆开那封就算看过）；
 *   新一周的数据来信（看过的最新一封 id 记在本机；第一次运行以当时最新一封为基线，老信不提醒）；
 *   到了日子还没拆的时间胶囊（后端算，拆了就没了）。
 *
 * 回执盖章不提醒。结果写进 `mailState`，顶栏只读那一格。
 */
import { reactive, watch, watchEffect } from 'vue';
import { backend, isDesktop } from '../lib/bridge';
import { useSyncController } from '../composables/useSyncController';
import { hasNewAuthorReply, loadLetterBox } from './letterBox';
import { mailState } from './mailState';

const WEEKLY_SEEN_KEY = 'zeppbridge.letters.weeklySeen';

const readWeeklySeen = (): number | null => {
  try {
    const raw = Number(window.localStorage.getItem(WEEKLY_SEEN_KEY));
    return window.localStorage.getItem(WEEKLY_SEEN_KEY) !== null && Number.isFinite(raw) ? raw : null;
  } catch { return null; }
};
const writeWeeklySeen = (id: number) => {
  try { window.localStorage.setItem(WEEKLY_SEEN_KEY, String(id)); } catch { /* 存不了就只在这次打开里 */ }
};

const status = reactive<{ latestWeekly: number | null; dueCapsules: number[]; weeklySeen: number | null }>({
  latestWeekly: null, dueCapsules: [], weeklySeen: null,
});

const weeklyUnseen = () => status.latestWeekly !== null && status.weeklySeen !== null && status.latestWeekly > status.weeklySeen;

/** 问一次后端（顺手寄出上一周的来信）。读不到就维持原样，不因为一次失败把信封收回去。 */
export async function refreshMail(): Promise<void> {
  if (!isDesktop()) return;
  try {
    const next = await backend.dataLettersMailStatus();
    status.latestWeekly = next.latest_weekly_id;
    status.dueCapsules = next.due_capsule_ids;
    if (status.weeklySeen === null && next.latest_weekly_id !== null) {
      // 第一次：当前最新那封算看过，之后来的新信才提醒。
      status.weeklySeen = next.latest_weekly_id;
      writeWeeklySeen(next.latest_weekly_id);
    }
  } catch { /* 下次再问 */ }
}

/** 拆开了一封每周来信。 */
export function markWeeklySeen(id: number): void {
  if (status.weeklySeen !== null && id <= status.weeklySeen) return;
  status.weeklySeen = id;
  writeWeeklySeen(id);
}

let started = false;
/** 后端就绪后调一次：读本机信匣、问一次状态；之后每次同步落地、窗口回到眼前（隔十分钟以上）再问。 */
export function startMailWatch(): void {
  if (started || !isDesktop()) return;
  started = true;
  status.weeklySeen = readWeeklySeen();
  watchEffect(() => {
    mailState.tab = hasNewAuthorReply() ? 'replies' : weeklyUnseen() || status.dueCapsules.length ? 'mine' : null;
  });
  void loadLetterBox().then(refreshMail);
  const { dataRevision } = useSyncController();
  watch(dataRevision, () => { void refreshMail(); });
  let lastAsked = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || Date.now() - lastAsked < 10 * 60_000) return;
    lastAsked = Date.now();
    void refreshMail();
  });
}
