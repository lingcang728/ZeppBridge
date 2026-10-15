/**
 * 静默更新的界面一侧（2026-10-14）。流程全在后端（src-tauri/src/updates/silent.rs）：
 * 打开应用就查，有新版本就在后台下载、验签，下好了等用户点「更新」。这里只做三件事：
 *
 * - 打开时叫一次 `update_start`，之后听 `update://state` 把状态抄进 `updateState`；
 * - 左上角标志（BrandMark 外圈）和设置页那一行都读这一份；
 * - 用户点「更新」时叫 `update_apply`（后端会先等同步 / 补拉结束）。
 *
 * 失败一律安静：标志保持原样，原因只在设置页里说。新手引导的示例沙盒里（演示运行时接管了 bridge）
 * 什么都不做，不会去碰真的更新。
 */
import { reactive } from 'vue';
import { demoIpcActive, invoke, listen } from '../lib/bridge/ipc';
import { toUserMessage } from '../lib/bridge';
import { rememberUpdate, restoreUpdateNotice } from './updateNotice';

export type UpdatePhase =
  | 'idle' | 'checking' | 'downloading' | 'ready' | 'applying' | 'up_to_date' | 'failed' | 'unsupported';

/** 和后端 `UpdateView` 同形。 */
export interface UpdateView {
  phase: UpdatePhase;
  version: string | null;
  notes: string | null;
  date: string | null;
  downloaded: number;
  total: number | null;
  waiting_for_sync: boolean;
  portable: boolean;
  error_code: string | null;
}

export interface UpdateUiState extends UpdateView {
  currentVersion: string;
  /** 点「更新」失败时的那句话（已按界面语言取好）。 */
  applyError: string;
}

const initial = (): UpdateView => ({
  phase: 'idle', version: null, notes: null, date: null, downloaded: 0, total: null,
  waiting_for_sync: false, portable: false, error_code: null,
});

export const updateState = reactive<UpdateUiState>({ ...initial(), currentVersion: '', applyError: '' });

/** 下载进度 0–1；拿不到总大小时为 null（界面画不出一圈准的就不画假的）。 */
export const downloadRatio = (view: Pick<UpdateView, 'downloaded' | 'total'>): number | null =>
  view.total && view.total > 0 ? Math.min(1, Math.max(0, view.downloaded / view.total)) : null;

const isDesktopRuntime = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window && !demoIpcActive();

const apply = (view: UpdateView) => { Object.assign(updateState, view); };

let listening: Promise<void> | null = null;
const listenOnce = () => {
  listening ??= listen<UpdateView>('update://state', (event) => apply(event.payload)).then(() => undefined, () => undefined);
  return listening;
};

let versionLoading: Promise<void> | null = null;
const loadCurrentVersion = (): Promise<void> => {
  if (updateState.currentVersion) return Promise.resolve();
  versionLoading ??= (async () => {
    try {
      const { getVersion } = await import('@tauri-apps/api/app');
      updateState.currentVersion = await getVersion();
      restoreUpdateNotice(updateState.currentVersion);
    } catch {
      // Reading the version must not prevent an update; allow a later retry.
    } finally { versionLoading = null; }
  })();
  return versionLoading;
};

/**
 * 打开应用时（和设置页的「检查更新」）调用。后端在查 / 在下 / 下好了时原样返回，不会重复开；
 * 上一次是「已是最新」或失败时重新查一次。
 */
export async function startDesktopUpdate(retries = 2): Promise<void> {
  if (!isDesktopRuntime()) return;
  await listenOnce();
  void loadCurrentVersion();
  try {
    apply(await invoke<UpdateView>('update_start'));
  } catch {
    // IPC 还没就绪（启动早期、刚从新手引导的沙盒回来）：过几秒再试，不让这次打开一直停在「没查过」。
    if (retries > 0) window.setTimeout(() => { void startDesktopUpdate(retries - 1); }, 3000);
  }
}

let watching = false;
/**
 * 顶栏挂上时调用：先补一次当前状态，之后窗口每次回到前台再补一次。事件是主通道，这只是兜底——
 * 页面重载、事件在监听挂上之前推过，都不会让标志停在旧样子。只问本机，不联网。
 */
export function watchDesktopUpdate(): void {
  void refreshDesktopUpdate();
  if (watching || typeof window === 'undefined') return;
  watching = true;
  window.addEventListener('focus', () => { void refreshDesktopUpdate(); });
}

/** 页面晚挂上时补一次当前状态（事件可能在它挂上之前就推过了）。 */
export async function refreshDesktopUpdate(): Promise<void> {
  if (!isDesktopRuntime()) return;
  await listenOnce();
  void loadCurrentVersion();
  try {
    apply(await invoke<UpdateView>('update_view'));
  } catch {
    // 同上。
  }
}

/** 用户点了「更新」。成功时应用会退出 / 重启，这个 Promise 不会再回来。 */
let applying = false;
export async function applyDesktopUpdate(): Promise<void> {
  if (updateState.phase !== 'ready' || applying) return;
  applying = true;
  // Disable every entry immediately, before IPC or version lookup can yield.
  updateState.phase = 'applying';
  updateState.applyError = '';
  try {
    await loadCurrentVersion();
    if (updateState.version && updateState.currentVersion) {
      rememberUpdate({ from: updateState.currentVersion, version: updateState.version, notes: updateState.notes ?? '' });
    }
    await invoke('update_apply');
  } catch (error) {
    // The backend consumes the staged package; a failure must offer a fresh check/download.
    updateState.phase = 'failed';
    updateState.applyError = toUserMessage(error, '');
  } finally { applying = false; }
}
