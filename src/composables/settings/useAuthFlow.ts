import { computed, ref } from 'vue';
import { deviceStateLabel } from '../useDevices';
import { useSyncController } from '../useSyncController';
import { backend, toUserMessage } from '../../lib/bridge';
import { locale, useMessages } from '../../i18n';
import { errorTextFor } from '../../i18n/errors';
import { backendText } from '../../i18n/backendText';
import { settingsMessages } from '../../views/Settings.i18n';
import type { LoginStatus } from '../../types';
import type { SettingsFeedback } from './useSettingsFeedback';

const DEFAULT_REGION_HOST = 'https://api-mifit-us3.zepp.com';
const idleStatus = (): LoginStatus => ({ state: 'idle', message: '', page_url: '' });

/**
 * 认证与账号：网页登录、手动填写、验证、退出。
 *
 * 认证区块和账号区块读的是同一份登录状态（账号卡上的「重新验证」和认证卡上的
 * 「使用」按钮是同一个动作），所以由设置页创建一份、两个区块共用。
 */
export const createAuthFlow = (feedback: SettingsFeedback) => {
  const t = useMessages(settingsMessages);
  const { appStatus, refreshStatus, runSync } = useSyncController();
  const { dataMessage, dataError } = feedback;

  const reconnecting = ref(false);
  const loginStatus = ref<LoginStatus>(idleStatus());
  const loginError = ref<string | null>(null);
  const loginBusy = ref(false);
  let unlistenLogin: (() => void) | undefined;
  /** 挂载代次：detach 一次就作废之前所有还没回来的 attach（R16）。 */
  let attachGen = 0;

  // 手动认证
  const showManualAuth = ref(false);
  const manualAppToken = ref('');
  const manualUserId = ref('');
  const manualRegionHost = ref(DEFAULT_REGION_HOST);
  const manualAuthBusy = ref(false);

  const connected = computed(() => appStatus.value?.connection_state === 'connected');
  const configuredOnly = computed(() => appStatus.value?.connection_state === 'configured');
  const accountRecognized = computed(() => connected.value || configuredOnly.value);
  const loginInProgress = computed(() => ['waiting', 'extracting', 'verifying'].includes(String(loginStatus.value.state)));

  /* 登录窗口那几行进度和失败原因原本直接显示后端字符串——全是中文。后端现在
     给的是稳定码，这里按界面语言取文案，取不到才回落到那句中文原文。 */
  const loginMessage = computed(() => {
    const status = loginStatus.value;
    if (!status.message && !status.code) return '';
    return errorTextFor(status.code) ?? backendText(status.message, '');
  });

  const connectionLabel = computed(() => {
    if (loginInProgress.value) {
      if (loginStatus.value.state === 'extracting') return t.value.connExtracting;
      if (loginStatus.value.state === 'verifying') return t.value.connVerifying;
      return t.value.connWaiting;
    }
    if (loginStatus.value.state === 'failed' && !accountRecognized.value) return t.value.connFailed;
    if (connected.value || configuredOnly.value) return deviceStateLabel('account');
    return deviceStateLabel('unknown');
  });

  /*
   * `replay`：进设置页时补读的当前状态。后端的 login.status 在整个会话里粘在
   * connected 上，而 0 条写入的账号 last_cloud_sync_at 永远是空——以前每进一次
   * 设置页就会因为这次补读起一趟看得见的同步。首次同步只跟着真正的「刚连上」走：
   * 实时事件，而且此前不是 connected（命令返回值和事件可能各送一次同一个结果）。
   */
  const applyLoginStatus = async (status: LoginStatus, opts?: { replay?: boolean }) => {
    const justConnected = status.state === 'connected' && loginStatus.value.state !== 'connected';
    loginStatus.value = status;
    if (status.state === 'connected') {
      reconnecting.value = false;
      loginError.value = null;
      await refreshStatus();
      if (justConnected && !opts?.replay && !appStatus.value?.last_cloud_sync_at) {
        void runSync('incremental', undefined, { silent: true, waited: true });
      }
    }
    if (status.state === 'failed') {
      // status.message 是后端的中文原文，只能兜底；先按码取当前语言的说法。
      loginError.value = errorTextFor(status.code)
        ?? backendText(status.message, t.value.loginIncomplete);
    }
  };

  const startLogin = async () => {
    loginError.value = null;
    loginBusy.value = true;
    reconnecting.value = true;
    try {
      // 登录窗标题支持十种界面语言，原样透传；后端认不出的标记回落英文。
      await applyLoginStatus(await backend.startWebLogin(locale.value));
    } catch (error) {
      loginStatus.value = { state: 'failed', message: toUserMessage(error, t.value.loginWindowFailed), page_url: '' };
      loginError.value = toUserMessage(error, t.value.loginWindowFailed);
    } finally {
      loginBusy.value = false;
    }
  };

  const cancelLogin = async () => {
    loginBusy.value = true;
    try {
      await applyLoginStatus(await backend.cancelWebLogin());
      reconnecting.value = false;
      loginError.value = null;
    } catch (error) {
      loginError.value = toUserMessage(error, t.value.loginCancelFailed);
    } finally {
      loginBusy.value = false;
    }
  };

  // 手动认证
  const submitManualAuth = async () => {
    if (!manualAppToken.value || !manualUserId.value || !manualRegionHost.value) {
      loginError.value = t.value.fillAllFields;
      return;
    }
    manualAuthBusy.value = true;
    loginError.value = null;
    try {
      await backend.manualAuth(
        manualAppToken.value.trim(),
        manualUserId.value.trim(),
        manualRegionHost.value.trim(),
      );
      await refreshStatus();
      loginStatus.value = idleStatus();
      reconnecting.value = false;
      showManualAuth.value = false;
      manualAppToken.value = '';
      manualUserId.value = '';
      manualRegionHost.value = DEFAULT_REGION_HOST;
      dataMessage.value = t.value.manualAuthDone;
    } catch (error) {
      loginError.value = toUserMessage(error, t.value.manualAuthFailed);
    } finally {
      manualAuthBusy.value = false;
    }
  };

  const verifyAndSync = async () => {
    try {
      await backend.verifyAuth();
      await refreshStatus();
      await runSync('incremental');
    } catch (error) {
      dataError.value = toUserMessage(error, t.value.verifyFailed);
    }
  };

  const clearAuth = async () => {
    if (!window.confirm(t.value.clearAuthConfirm)) return;
    dataError.value = null;
    try {
      await backend.clearAuth();
      await refreshStatus();
      reconnecting.value = false;
      loginStatus.value = idleStatus();
      dataMessage.value = t.value.authCleared;
    } catch (error) {
      dataError.value = toUserMessage(error, t.value.clearAuthFailed);
    }
  };

  /** 挂上登录状态推送，并补读一次当前状态。 */
  const attach = async () => {
    detach();
    const gen = attachGen;
    try {
      const off = await backend.listen<LoginStatus>('login://status', (payload) => { void applyLoginStatus(payload); });
      // 卸载后才回来的监听立刻撤掉，不留孤儿订阅。
      if (gen !== attachGen) { off(); return; }
      unlistenLogin = off;
      const current = await backend.getLoginStatus();
      if (gen === attachGen) await applyLoginStatus(current, { replay: true });
    } catch {
      // Browser preview has no login IPC.
    }
  };
  const detach = () => {
    attachGen += 1;
    unlistenLogin?.();
    unlistenLogin = undefined;
  };

  return {
    reconnecting,
    loginStatus,
    loginError,
    loginBusy,
    showManualAuth,
    manualAppToken,
    manualUserId,
    manualRegionHost,
    manualAuthBusy,
    connected,
    configuredOnly,
    accountRecognized,
    loginInProgress,
    loginMessage,
    connectionLabel,
    startLogin,
    cancelLogin,
    submitManualAuth,
    verifyAndSync,
    clearAuth,
    attach,
    detach,
  };
};

export type AuthFlow = ReturnType<typeof createAuthFlow>;
