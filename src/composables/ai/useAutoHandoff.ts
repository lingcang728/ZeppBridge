/**
 * 交给 AI 的最后一步（计划 12.1，10-13）：不装浏览器插件。
 *
 * - 交出去的 `.md` 以「文件」放进系统剪贴板（同资源管理器 / 访达里复制文件）：任何浏览器的对话框里 Ctrl+V（⌘V）就附上
 *   （Chrome / Edge / Arc / Firefox / Safari 都认 paste 事件里的文件）。放不进去（比如 Linux 没有图形会话）就退回拖文件。
 * - 「全自动」（默认关，设置「交给 AI 工具」卡）：打开网站后等它到前台，替你粘文件、粘开场白、回车；
 *   每一下之前都核对前台窗口，按 Esc / 切走窗口就停，文件还在剪贴板里。
 *
 * 状态是模块级单例：回执卡和设置卡都读它。
 */
import { ref } from 'vue';
import { backend, isDesktop } from '../../lib/bridge';
import type { AiProvider } from '../../lib/aiProviders';

const KEY = 'zeppbridge.ai.autoPaste';
const readOn = () => {
  try { return window.localStorage.getItem(KEY) === '1'; } catch { return false; }
};

/** 全自动开关（只在 Windows 上有，见 `autoSupported`）。 */
export const autoPasteOn = ref(readOn());
export const setAutoPaste = (on: boolean) => {
  autoPasteOn.value = on;
  try { window.localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* 隐私模式不记，只管这一次 */ }
};
/** 替用户按键只做了 Windows（clipboard_files.rs）。 */
export const autoSupported = () => isDesktop() && /Windows/i.test(navigator.userAgent);

/**
 * 这一次交出去的文件进没进剪贴板：`file` = 进了，按 Ctrl+V 就行；`none` = 没进（不支持 / 失败），照旧拖文件。
 * 全自动的进度：waiting → file → filled / sent；停下是 aborted / timeout。
 */
export type ClipState = 'none' | 'file';
export type AutoStage = 'idle' | 'waiting' | 'file' | 'filled' | 'sent' | 'aborted' | 'timeout';
export const clip = ref<ClipState>('none');
export const autoStage = ref<AutoStage>('idle');

let ticket: number | null = null;
let listening: Promise<unknown> | null = null;
const listenOnce = () => {
  listening ??= backend.listen<{ ticket: number; stage: AutoStage }>('ai-handoff://auto', (event) => {
    if (event.ticket === ticket) autoStage.value = event.stage;
  }).catch(() => { listening = null; });
  return listening;
};

/** 文件进剪贴板。成功返回 true；失败（没有图形会话、剪贴板被占）返回 false，调用方退回复制开场白。 */
export const copyFileToClipboard = async (mdPath: string): Promise<boolean> => {
  try {
    await backend.aiHandoffCopyFile(mdPath);
    clip.value = 'file';
    return true;
  } catch {
    clip.value = 'none';
    return false;
  }
};

/** 全自动：在打开网站**之前**调（它先把文件放进剪贴板，再开始等那个网页到前台）。 */
export const startAutoPaste = async (provider: AiProvider, mdPath: string, kickoff: string): Promise<boolean> => {
  if (!autoPasteOn.value || !autoSupported()) return false;
  await listenOnce();
  try {
    autoStage.value = 'waiting';
    ticket = await backend.aiHandoffAutopaste({ provider: provider.id, mdPath, kickoff, send: true });
    clip.value = 'file';
    return true;
  } catch {
    autoStage.value = 'idle';
    ticket = null;
    return false;
  }
};

/** 新的一次交接开始：上一回的进度清掉，还在等前台的那一次收回。 */
export const resetAutoPaste = () => {
  if (autoStage.value === 'waiting') void backend.aiHandoffCancel().catch(() => undefined);
  ticket = null;
  autoStage.value = 'idle';
  clip.value = 'none';
};
