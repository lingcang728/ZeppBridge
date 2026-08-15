import { computed, ref } from 'vue';
import { backend, isDesktop, toUserMessage } from '../lib/bridge';
import { deviceImageFor } from '../lib/deviceCatalog';
import type { DeviceCacheMetadata, DeviceProfile, DeviceProfilesResult } from '../types';

/**
 * The device catalog is deliberately treated as account data, not as a list
 * of products we happen to ship assets for.  Views consume this normalized
 * model so an empty/unknown account never falls back to a made-up watch.
 */
export type DeviceState = '账号已识别' | '最近有数据' | '使用缓存' | '未识别';

export interface DeviceCardModel {
  profile: DeviceProfile;
  canonicalName: string;
  displayName: string;
  image: string;
  kind: string;
  state: DeviceState;
  firmware: string;
  lastData: string;
  hasLocalData: boolean;
}

const profiles = ref<DeviceProfile[]>([]);
const cache = ref<DeviceCacheMetadata | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const initialized = ref(false);
let requestId = 0;
// App and Overview mount together, and Settings can request a manual refresh
// while the startup read is still settling. Share identical bridge calls so
// one component cannot overwrite another with an older response.
const profileRequests = new Map<boolean, Promise<DeviceProfilesResult>>();
let backgroundRefreshAttempted = false;
let backgroundRefreshInFlight: Promise<DeviceProfilesResult> | null = null;

const formatDeviceDate = (value?: string | null): string => {
  if (!value) return '尚未获取';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间未知';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date).replace(/\//g, '-');
};

const stateFor = (profile: DeviceProfile): DeviceState => {
  if (profile.has_local_data) return '最近有数据';
  if (cache.value?.status === 'stale' || cache.value?.status === 'refresh_failed') return '使用缓存';
  if (profile.canonical_name || profile.match_status === 'exact' || profile.match_status === 'alias') return '账号已识别';
  return '未识别';
};

const normalizeResult = (result: DeviceProfilesResult | DeviceProfile[]): DeviceProfilesResult => {
  if (Array.isArray(result)) {
    return {
      profiles: result,
      cache: { status: 'fresh', refreshed: false },
    };
  }
  return {
    profiles: Array.isArray(result?.profiles) ? result.profiles : [],
    cache: result?.cache ?? { status: 'missing', refreshed: false },
  };
};

const requestProfiles = (refresh: boolean): Promise<DeviceProfilesResult> => {
  const existing = profileRequests.get(refresh);
  if (existing) return existing;

  const request = backend.getDeviceProfiles(refresh).then(normalizeResult);
  profileRequests.set(refresh, request);
  const clear = () => {
    if (profileRequests.get(refresh) === request) profileRequests.delete(refresh);
  };
  // Handle both outcomes so a transient failure does not leave a rejected
  // promise cached forever, while avoiding an unhandled rejection.
  void request.then(clear, clear);
  return request;
};

const applyResult = (result: DeviceProfilesResult): void => {
  profiles.value = result.profiles;
  cache.value = result.cache;
  error.value = result.cache.refresh_error || null;
};

const setLoadFailure = (cause: unknown, refresh: boolean): void => {
  const message = toUserMessage(cause, refresh ? '设备识别暂时不可用' : '设备缓存暂时不可用');
  error.value = message;
  const status = refresh ? 'refresh_failed' : 'unavailable';
  cache.value = cache.value
    ? { ...cache.value, status, refreshed: false, refresh_error: message }
    : { status, refreshed: false, refresh_error: message };
};

const hasCanonicalMatch = (profile: DeviceProfile): boolean => Boolean(
  profile.canonical_name?.trim()
  || profile.match_status === 'exact'
  || profile.match_status === 'alias',
);

const needsBackgroundRefresh = (result: DeviceProfilesResult): boolean => {
  if (backgroundRefreshAttempted || result.cache.status === 'refresh_failed') return false;
  if (result.cache.status === 'missing' || result.cache.status === 'stale') return true;
  return result.profiles.length === 0 || result.profiles.every((profile) => !hasCanonicalMatch(profile));
};

const startBackgroundRefresh = (triggerRequest: number): void => {
  if (!isDesktop() || backgroundRefreshAttempted || backgroundRefreshInFlight) return;
  backgroundRefreshAttempted = true;
  const request = requestProfiles(true);
  backgroundRefreshInFlight = request;

  // Do not toggle `loading`: the cache/list is already visible and this
  // refresh is deliberately best-effort. A later explicit load shares this
  // promise and applies the same result under its newer request id.
  void request
    .then(
      (result) => {
        if (requestId === triggerRequest) {
          applyResult(result);
          initialized.value = true;
        }
      },
      (cause) => {
        if (requestId === triggerRequest) setLoadFailure(cause, true);
      },
    )
    .finally(() => {
      if (backgroundRefreshInFlight === request) backgroundRefreshInFlight = null;
    })
    .catch(() => undefined);
};

const load = async (refresh = false): Promise<void> => {
  const currentRequest = ++requestId;
  // A background refresh must not turn an already-rendered cache back into a
  // blocking spinner. Explicit refreshes still expose their normal loading
  // state in Settings.
  const waitingForBackground = !refresh && Boolean(backgroundRefreshInFlight);
  if (!waitingForBackground) loading.value = true;
  error.value = null;

  if (!isDesktop()) {
    profiles.value = [];
    cache.value = { status: 'unavailable', refreshed: false };
    initialized.value = true;
    loading.value = false;
    return;
  }

  try {
    const result = refresh
      ? await requestProfiles(true)
      : await (backgroundRefreshInFlight || requestProfiles(false));
    if (currentRequest !== requestId) return;
    applyResult(result);
    if (!refresh && needsBackgroundRefresh(result)) startBackgroundRefresh(currentRequest);
  } catch (cause) {
    if (currentRequest !== requestId) return;
    // Keep the previous list visible during a transient failure and expose a
    // cache status that prevents an automatic retry loop.
    setLoadFailure(cause, refresh || waitingForBackground);
  } finally {
    if (currentRequest === requestId) {
      initialized.value = true;
      loading.value = false;
    }
  }
};

const models = computed<DeviceCardModel[]>(() => profiles.value.map((profile) => ({
  profile,
  canonicalName: profile.canonical_name?.trim() || profile.name?.trim() || '未识别设备',
  displayName: profile.display_name?.trim() || '未提供',
  image: deviceImageFor(profile.kind, profile.image_key),
  kind: profile.kind || 'unknown',
  state: stateFor(profile),
  firmware: profile.firmware?.trim() || '尚未获取',
  lastData: formatDeviceDate(profile.last_data_at),
  hasLocalData: profile.has_local_data === true,
})));

const maskIdentifier = (value?: string | null): string => {
  const trimmed = value?.trim();
  if (!trimmed) return '未提供';
  if (trimmed.length <= 4) return '•'.repeat(trimmed.length);
  return `••••${trimmed.slice(-4)}`;
};

export const useDevices = () => ({
  profiles,
  models,
  cache,
  loading,
  error,
  initialized,
  load,
  maskIdentifier,
  formatDeviceDate,
});
