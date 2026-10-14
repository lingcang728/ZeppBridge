import { computed, ref } from 'vue';
import { backend, toUserMessage } from '../../lib/bridge';
import { useMessages } from '../../i18n';
import { errorTextFor } from '../../i18n/errors';
import { backendText } from '../../i18n/backendText';
import { settingsMessages } from '../../views/Settings.i18n';
import type { OfficialStatus } from '../../types';
import type { SettingsFeedback } from './useSettingsFeedback';
import { applyOfficialStatus } from '../sync/run';

const idle = (): OfficialStatus => ({
  state: 'idle', message_code: null, message: null, user_id_masked: null, nickname: null, connected_at: null,
  authorize_url: null,
});

/**
 * Zepp 官方授权：在系统浏览器里授权（Google / 小米 / Facebook / Apple 都能用），
 * 桌面端自己去中转站领令牌。和旧通道的网页登录是两套，互不影响。
 */
export const createOfficialAuth = (feedback: SettingsFeedback) => {
  const t = useMessages(settingsMessages);
  const status = ref<OfficialStatus>(idle());
  const busy = ref(false);
  /** 已经按码本地化好的失败说明（后端原文只兜底）。 */
  const failureText = ref<string | null>(null);
  let unlisten: (() => void) | undefined;
  /** 挂载代次：detach 一次就作废之前所有还没回来的 attach（R16）。 */
  let attachGen = 0;
  let copiedTimer: number | undefined;

  const waiting = computed(() => status.value.state === 'waiting');
  const connected = computed(() => status.value.state === 'connected');
  const needsReauth = computed(() => status.value.state === 'needs_reauth');

  const apply = (next: OfficialStatus) => {
    status.value = next;
    // 全局状态（顶栏、自动同步、首次同步）由同步控制器统一处理，这里只渲染。
    applyOfficialStatus(next);
    if (next.state === 'failed') {
      // 后端的中文原文只兜底；先按码取当前语言的说法。
      failureText.value = errorTextFor(next.message_code ?? undefined)
        ?? backendText(next.message ?? '', t.value.officialFailed);
    } else if (next.state !== 'idle') {
      failureText.value = null;
    }
  };

  const start = async () => {
    failureText.value = null;
    busy.value = true;
    try {
      apply(await backend.startOfficialLogin());
    } catch (cause) {
      failureText.value = toUserMessage(cause, t.value.officialFailed);
    } finally {
      busy.value = false;
    }
  };

  const cancel = async () => {
    busy.value = true;
    try {
      apply(await backend.cancelOfficialLogin());
      failureText.value = null;
    } catch (cause) {
      failureText.value = toUserMessage(cause, t.value.officialFailed);
    } finally {
      busy.value = false;
    }
  };

  const disconnect = async () => {
    if (!window.confirm(t.value.officialDisconnectConfirm)) return;
    busy.value = true;
    try {
      apply(await backend.disconnectOfficial());
      feedback.dataMessage.value = t.value.officialDisconnected;
    } catch (cause) {
      failureText.value = toUserMessage(cause, t.value.officialFailed);
    } finally {
      busy.value = false;
    }
  };

  /** 「复制授权链接」：在无痕窗口里打开就能换一个 Zepp 账号登录。 */
  const linkCopied = ref(false);
  const copyLink = async () => {
    const url = status.value.authorize_url;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      linkCopied.value = true;
      window.clearTimeout(copiedTimer);
      copiedTimer = window.setTimeout(() => { linkCopied.value = false; }, 2400);
    } catch (cause) {
      failureText.value = toUserMessage(cause, t.value.officialFailed);
    }
  };

  /* 设置页卸载时 listen 可能还没回来：回来时发现代次已变，就立刻把刚挂上的监听撤掉，
     不留一份没人管的订阅（以前卸载后才完成的 attach 会把监听永久挂在那里）。 */
  const attach = async () => {
    detach();
    const gen = attachGen;
    try {
      const off = await backend.listen<OfficialStatus>('official://status', apply);
      if (gen !== attachGen) { off(); return; }
      unlisten = off;
      const current = await backend.getOfficialStatus();
      if (gen === attachGen) apply(current);
    } catch {
      // 浏览器预览没有桌面端命令。
    }
  };
  const detach = () => {
    attachGen += 1;
    unlisten?.();
    unlisten = undefined;
    clearTimeout(copiedTimer);
  };

  return {
    status, busy, failureText, waiting, connected, needsReauth, linkCopied,
    start, cancel, disconnect, copyLink, attach, detach,
  };
};

export type OfficialAuth = ReturnType<typeof createOfficialAuth>;
