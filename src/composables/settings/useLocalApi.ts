import { computed, ref } from 'vue';
import { backend, toUserMessage } from '../../lib/bridge';
import { useMessages } from '../../i18n';
import { errorTextFor } from '../../i18n/errors';
import { backendText } from '../../i18n/backendText';
import { settingsMessages } from '../../views/Settings.i18n';
import type { LocalApiStatus } from '../../types';

/* 本机 API 的界面状态。token 默认遮罩，只有用户点「显示」或「复制」才会向
   后端要明文。 */
export const useLocalApi = () => {
  const t = useMessages(settingsMessages);
  const localApiStatus = ref<LocalApiStatus | null>(null);
  const localApiBusy = ref(false);
  const localApiToken = ref<string | null>(null);
  const localApiTokenVisible = ref(false);
  const localApiMessage = ref<string | null>(null);
  const localApiError = ref<string | null>(null);
  const maskedToken = computed(() => {
    const token = localApiToken.value;
    if (!token) return '••••••••••••••••';
    return `${token.slice(0, 8)}${'•'.repeat(16)}${token.slice(-4)}`;
  });

  const statusError = (status: LocalApiStatus): string =>
    errorTextFor(status.error_code) ?? backendText(status.error, t.value.apiToggleFailed);

  const loadLocalApiStatus = async () => {
    localApiStatus.value = await backend.getLocalApiStatus().catch(() => null);
    if (localApiStatus.value?.error || localApiStatus.value?.error_code) {
      localApiError.value = statusError(localApiStatus.value);
    }
  };

  const ensureLocalApiToken = async (): Promise<string | null> => {
    if (localApiToken.value) return localApiToken.value;
    try {
      localApiToken.value = await backend.revealLocalApiToken();
      return localApiToken.value;
    } catch (error) {
      localApiError.value = toUserMessage(error, t.value.apiTokenReadFailed);
      return null;
    }
  };

  const toggleLocalApi = async () => {
    const next = !localApiStatus.value?.enabled;
    localApiBusy.value = true;
    localApiError.value = null;
    localApiMessage.value = null;
    try {
      localApiStatus.value = await backend.setLocalApiEnabled(next);
      if (localApiStatus.value.error || localApiStatus.value.error_code) {
        localApiError.value = statusError(localApiStatus.value);
      } else if (next) {
        localApiMessage.value = t.value.apiEnabled;
      } else {
        localApiToken.value = null;
        localApiTokenVisible.value = false;
        localApiMessage.value = t.value.apiDisabled;
      }
    } catch (error) {
      localApiError.value = toUserMessage(error, t.value.apiToggleFailed);
    } finally {
      localApiBusy.value = false;
    }
  };

  const toggleTokenVisibility = async () => {
    if (localApiTokenVisible.value) {
      localApiTokenVisible.value = false;
      return;
    }
    localApiError.value = null;
    if (await ensureLocalApiToken()) localApiTokenVisible.value = true;
  };

  const copyLocalApiToken = async () => {
    localApiError.value = null;
    localApiMessage.value = null;
    const token = await ensureLocalApiToken();
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      localApiMessage.value = t.value.apiTokenCopied;
    } catch {
      localApiError.value = t.value.apiTokenCopyFailed;
    }
  };

  const regenerateLocalApiToken = async () => {
    if (!window.confirm(t.value.apiRegenerateConfirm)) return;
    localApiBusy.value = true;
    localApiError.value = null;
    localApiMessage.value = null;
    try {
      localApiToken.value = await backend.rotateLocalApiToken();
      localApiTokenVisible.value = true;
      localApiStatus.value = await backend.getLocalApiStatus();
      localApiMessage.value = t.value.apiTokenRegenerated;
    } catch (error) {
      localApiError.value = toUserMessage(error, t.value.apiRegenerateFailed);
    } finally {
      localApiBusy.value = false;
    }
  };

  const copyLocalApiExample = async () => {
    localApiError.value = null;
    localApiMessage.value = null;
    const baseUrl = localApiStatus.value?.base_url || 'http://127.0.0.1:43921';
    const token = await ensureLocalApiToken();
    if (!token) return;
    try {
      await navigator.clipboard.writeText(
        `curl.exe -H "Authorization: Bearer ${token}" "${baseUrl}/workouts/WORKOUT_ID/series"`,
      );
      localApiMessage.value = t.value.apiExampleCopied;
    } catch {
      localApiError.value = t.value.apiExampleCopyFailed;
    }
  };

  return {
    localApiStatus,
    localApiBusy,
    localApiToken,
    localApiTokenVisible,
    localApiMessage,
    localApiError,
    maskedToken,
    loadLocalApiStatus,
    toggleLocalApi,
    toggleTokenVisibility,
    copyLocalApiToken,
    regenerateLocalApiToken,
    copyLocalApiExample,
  };
};
