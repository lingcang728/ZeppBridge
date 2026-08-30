import { computed, ref } from 'vue';
import { backend, isDesktop, toUserMessage } from '../lib/bridge';
import { deviceImageFor } from '../lib/deviceCatalog';
import type { DeviceCacheMetadata, DeviceProfile, DeviceProfilesResult } from '../types';
import { defineMessages, intlLocale, messagesOf } from '../i18n';

/**
 * The device catalog is deliberately treated as account data, not as a list
 * of products we happen to ship assets for.  Views consume this normalized
 * model so an empty/unknown account never falls back to a made-up watch.
 */
/*
 * 设备状态存的是码，不是中文。
 *
 * 早先它是中文字符串联合类型，于是界面里到处写着 `state !== '未识别'` 这种
 * 判断——一翻译就全断，而且断得没有声音：条件永远为真，指示灯一直亮着。
 * 现在比较的是码，显示交给 deviceStateLabel()。
 */
export type DeviceState = 'account' | 'user_assigned' | 'recent_data' | 'cached' | 'unknown';

const messages = defineMessages(
  {
    stateAccount: '账号已识别',
    stateUserAssigned: '你指认的型号',
    stateRecentData: '最近有数据',
    stateCached: '使用缓存',
    stateUnknown: '未识别',
    notFetchedYet: '尚未获取',
    timeUnknown: '时间未知',
    unidentifiedDevice: '未识别设备',
    notProvided: '未提供',
    identifyUnavailable: '设备识别暂时不可用',
    cacheUnavailable: '设备缓存暂时不可用',
    noLocalIdentifier: '这台设备没有可用的本机标识，无法保存指认。',
    assignmentCleared: '已撤销型号指认，恢复成自动识别结果。',
    assignmentSaved: '已记录你的型号指认。界面会把它标成「你指认的型号」，不会当成自动识别结果。',
    assignmentContributed: (reportId: string) =>
      `已记录你的型号指认，并把型号编号交给了 ZeppBridge（编号 ${reportId}）。下一版目录会让同款设备自动识别。`,
    assignmentContributionFailed: (reason: string) =>
      `已记录你的型号指认（只在本机）。补充目录没发送成功：${reason}`,
    networkUnavailable: '网络不可用',
    assignmentFailed: '无法保存型号指认',
  },
  {
    stateAccount: 'Known from account',
    stateUserAssigned: 'Model you picked',
    stateRecentData: 'Has recent data',
    stateCached: 'From cache',
    stateUnknown: 'Not identified',
    notFetchedYet: 'Not fetched yet',
    timeUnknown: 'Time unknown',
    unidentifiedDevice: 'Unidentified device',
    notProvided: 'Not provided',
    identifyUnavailable: 'Device identification is unavailable right now',
    cacheUnavailable: 'The device cache is unavailable right now',
    noLocalIdentifier: 'This device carries no local identifier, so the pick cannot be saved.',
    assignmentCleared: 'Pick withdrawn. Back to the automatic match.',
    assignmentSaved: 'Your pick is saved. It shows up as "Model you picked" — never passed off as an automatic match.',
    assignmentContributed: (reportId: string) =>
      `Your pick is saved, and the model numbers went to ZeppBridge (report ${reportId}). The next catalog release will identify this model on its own.`,
    assignmentContributionFailed: (reason: string) =>
      `Your pick is saved on this machine. Sending the catalog contribution failed: ${reason}`,
    networkUnavailable: 'Network unavailable',
    assignmentFailed: 'Could not save the model pick',
  },
);

const copy = () => messagesOf(messages);

const DEVICE_STATE_KEYS = {
  account: 'stateAccount',
  user_assigned: 'stateUserAssigned',
  recent_data: 'stateRecentData',
  cached: 'stateCached',
  unknown: 'stateUnknown',
} as const;

/** 设备状态在界面上的说法。跟着当前语言走。 */
export const deviceStateLabel = (state: DeviceState): string => copy()[DEVICE_STATE_KEYS[state]];

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
  /** 本机用来记住「你指认的型号」的键；为空表示这台设备没有可用标识。 */
  deviceKey: string;
  /** 当前型号是不是用户手动指认的。和 state 分开：一台设备可以既「最近有数据」
   *  又是「你指认的型号」，早先只报前者，于是用户再也找不到改型号的入口。 */
  userAssigned: boolean;
  matchStatus: string;
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
  if (!value) return copy().notFetchedYet;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return copy().timeUnknown;
  return new Intl.DateTimeFormat(intlLocale(), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date).replace(/\//g, '-');
};

const stateFor = (profile: DeviceProfile): DeviceState => {
  if (profile.has_local_data) return 'recent_data';
  if (cache.value?.status === 'stale' || cache.value?.status === 'refresh_failed') return 'cached';
  if (profile.match_status === 'user_assigned') return 'user_assigned';
  if (profile.canonical_name || profile.match_status === 'exact' || profile.match_status === 'alias') return 'account';
  return 'unknown';
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
  const message = toUserMessage(cause, refresh ? copy().identifyUnavailable : copy().cacheUnavailable);
  error.value = message;
  const status = refresh ? 'refresh_failed' : 'unavailable';
  cache.value = cache.value
    ? { ...cache.value, status, refreshed: false, refresh_error: message }
    : { status, refreshed: false, refresh_error: message };
};

const hasCanonicalMatch = (profile: DeviceProfile): boolean => Boolean(
  profile.canonical_name?.trim()
  || profile.match_status === 'exact'
  || profile.match_status === 'alias'
  || profile.match_status === 'user_assigned',
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

/**
 * 本机写过库之后的重读。**不能走 `load(false)`**：那条路会复用
 * `profileRequests` 里已经在飞的请求，或者 `backgroundRefreshInFlight`——
 * 两者都是在写入之前发出的，结果里没有刚保存的指认，用户看到的就是
 * 「提交完型号依然没改过来」（C4 的表象，只不过那次的根因在后端）。
 *
 * 这里直接问一次后端，并照常抢 `requestId`：顺带让那条抢跑的后台刷新
 * 结果失效，免得它稍后再把旧数据盖回来。
 */
const reloadAfterLocalWrite = async (): Promise<void> => {
  if (!isDesktop()) return;
  const currentRequest = ++requestId;
  loading.value = true;
  error.value = null;
  try {
    const result = normalizeResult(await backend.getDeviceProfiles(false));
    if (currentRequest !== requestId) return;
    applyResult(result);
  } catch (cause) {
    if (currentRequest !== requestId) return;
    setLoadFailure(cause, false);
  } finally {
    if (currentRequest === requestId) {
      initialized.value = true;
      loading.value = false;
    }
  }
};

const models = computed<DeviceCardModel[]>(() => profiles.value.map((profile) => ({
  profile,
  canonicalName: profile.canonical_name?.trim() || profile.name?.trim() || copy().unidentifiedDevice,
  displayName: profile.display_name?.trim() || copy().notProvided,
  image: deviceImageFor(profile.kind, profile.image_key),
  kind: profile.kind || 'unknown',
  state: stateFor(profile),
  firmware: profile.firmware?.trim() || copy().notFetchedYet,
  lastData: formatDeviceDate(profile.last_data_at),
  hasLocalData: profile.has_local_data === true,
  deviceKey: (profile.device_id || profile.serial || '').trim(),
  userAssigned: profile.match_status === 'user_assigned',
  matchStatus: profile.match_status || 'unknown',
})));

const maskIdentifier = (value?: string | null): string => {
  const trimmed = value?.trim();
  if (!trimmed) return copy().notProvided;
  if (trimmed.length <= 4) return '•'.repeat(trimmed.length);
  return `••••${trimmed.slice(-4)}`;
};

/* 型号指认的状态放在模块级共享。
 *
 * 设置页的行内选择器和设备二级页说的是同一件事，各存一份 busy/error 只会让
 * 两处显示不一致。 */
const assignBusy = ref(false);
const assignError = ref<string | null>(null);
const assignMessage = ref<string | null>(null);

const assignModel = async (deviceKey: string, catalogId: string, contribute = false): Promise<void> => {
  if (!deviceKey) {
    assignError.value = copy().noLocalIdentifier;
    return;
  }
  assignBusy.value = true;
  assignError.value = null;
  assignMessage.value = null;
  try {
    await backend.setDeviceModelOverride(deviceKey, catalogId || null);
    await reloadAfterLocalWrite();
    if (!catalogId) {
      assignMessage.value = copy().assignmentCleared;
      return;
    }
    assignMessage.value = copy().assignmentSaved;
    if (!contribute) return;
    // 补目录的提交失败不该让指认看起来没保存成功：本机的那一半已经写好了。
    try {
      const result = await backend.submitDeviceModelAssignment();
      assignMessage.value = copy().assignmentContributed(result.reportId);
    } catch (cause) {
      assignMessage.value = copy().assignmentContributionFailed(toUserMessage(cause, copy().networkUnavailable));
    }
  } catch (cause) {
    assignError.value = toUserMessage(cause, copy().assignmentFailed);
  } finally {
    assignBusy.value = false;
  }
};

const clearAssignFeedback = () => {
  assignError.value = null;
  assignMessage.value = null;
};

export const useDeviceAssignment = () => ({
  assignBusy,
  assignError,
  assignMessage,
  assignModel,
  clearAssignFeedback,
});

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
