import { computed, ref } from 'vue';
import { backend, isDesktop, toUserMessage } from '../../lib/bridge';
import { readAutoSyncSettings } from '../../lib/autoSync';
import type { AppStatus, LoginStatus, SyncOutcome, SyncProgress, SyncReport } from '../../types';
import { IDLE, type DataReady } from '../../lib/dataReady';
import { createLoadSeq } from '../../lib/loadSeq';
import { messagesOf } from '../../i18n';
import { syncControllerMessages } from '../useSyncController.i18n';

/* 同步控制器的模块级单例状态。整个应用只有一份：顶栏、设置页、启动同步、自动同步
   看到的都是这里的同一组 ref（从 useSyncController.ts 搬出来）。 */

export type SyncUiState = 'idle' | 'syncing' | SyncOutcome;

export const copy = () => messagesOf(syncControllerMessages);

/*
 * 状态条上那句话存的是「发生了什么」，不是渲染好的字符串。
 *
 * 存字符串的话，用户切一次语言，横幅上就会留着上一种语言的句子直到下次同步
 * ——而同步结果恰恰是最需要看懂的一句。存成结构，渲染放在 computed 里，
 * 切语言时它自己会重算。
 *
 * `backend` 这一档是后端发来的原文（sync://progress 的进度消息、命令返回的
 * 错误）。后端不按 locale 出文案是刻意的：GUI / CLI / MCP / 导出四个出口对
 * 同一个问题必须给同一份回答。这些句子的语言跟着后端走。
 */
export type SyncNotice =
  | { kind: 'none' }
  | { kind: 'backend'; text: string }
  | { kind: 'progress'; code: string; stream: string; month: string | null; text: string }
  | { kind: 'syncingRecent'; days?: number }
  | { kind: 'backfilling'; days: number }
  | { kind: 'alreadySyncing' }
  | { kind: 'desktopOnly' }
  | { kind: 'reauthNeeded' }
  | { kind: 'verifyFirst' }
  | { kind: 'connectFirst' }
  | { kind: 'cancelling' }
  | {
    kind: 'report';
    outcome: SyncOutcome;
    failedStreams: string[];
    latestAt?: string;
    backendMessage?: string;
    /** 同步本身好了，但旧数据清理没成功（后端 `ui.sync.cleanup_failed`）。 */
    cleanupFailed?: boolean;
  };

export const appStatus = ref<AppStatus | null>(null);
export const statusError = ref<string | null>(null);
/* 同步命令抛错时，顶栏那条红字就是同步横幅那句话。存标记不存句子：存句子的话
   切一次语言它还是上一种语言。渲染在 notice.ts 的 statusErrorText。 */
export const statusErrorFromSync = ref(false);
export const syncState = ref<SyncUiState>('idle');
export const notice = ref<SyncNotice>({ kind: 'none' });
export const syncReport = ref<SyncReport | null>(null);
export const syncProgress = ref<SyncProgress | null>(null);
export const loginStatus = ref<LoginStatus>({ state: 'idle', message: '', page_url: '' });
export const dataRevision = ref(0);
export const streamUpdate = ref({ stream: '', revision: 0 });
/* 装完新版本第一次启动时，后台会把存量原始报文压掉（默认开启）。
   这期间界面要说一句「正在压缩」，压完自己消失——不然用户只会觉得
   「刚装完怎么有点卡」。 */
export const compactionPending = ref(0);
/* 事件（compaction://started）可能在前端开始监听之前就发出去了，所以这里
   同时认状态：refreshStatus() 每次都会带回后台此刻是不是在压缩。 */
export const compactingEvent = ref(false);
export const compacting = computed(() => compactingEvent.value || appStatus.value?.compacting === true);
export const compactionSaved = ref<number | null>(null);
/* 用户在等的那次同步有没有结果（「奶茶好了」）。转换规则在 lib/dataReady.ts。 */
export const dataReady = ref<DataReady>(IDLE);
export const autoSyncEnabled = ref(readAutoSyncSettings().enabled);
export const autoSyncInterval = ref(readAutoSyncSettings().intervalMinutes);

export const applyLoginStatus = (status: LoginStatus) => {
  loginStatus.value = status;
  if (status.state === 'connected') void refreshStatus();
};

/* refreshStatus 有五六个并发入口（登录事件、同步收尾、偏好变更……）。响应乱序
   回来时，旧的 AppStatus 不能盖掉新的——否则顶栏的「上次同步」会短暂退回同步前。 */
const statusLoadSeq = createLoadSeq();

export const refreshStatus = async (opts?: { preserveError?: boolean }): Promise<AppStatus | null> => {
  if (!isDesktop()) return null;
  const seq = statusLoadSeq.next();
  try {
    if (!opts?.preserveError) {
      statusError.value = null;
      statusErrorFromSync.value = false;
    }
    const status = await backend.getAppStatus();
    if (!statusLoadSeq.isCurrent(seq)) return appStatus.value;
    appStatus.value = status;
    return status;
  } catch (error) {
    if (!statusLoadSeq.isCurrent(seq)) return appStatus.value;
    statusError.value = toUserMessage(error, copy().statusUnavailable);
    return null;
  }
};
