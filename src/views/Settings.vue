<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import BackupPanel from '../components/BackupPanel.vue';
import DesignIcon from '../components/DesignIcon.vue';
import DeviceVisual from '../components/DeviceVisual.vue';
import HistoryArchivePanel from '../components/HistoryArchivePanel.vue';
import Icon from '../components/Icon.vue';
import SelectMenu from '../components/SelectMenu.vue';
import { deviceStateLabel, useDeviceAssignment, useDevices } from '../composables/useDevices';
import { useSyncController } from '../composables/useSyncController';
import { AUTO_SYNC_INTERVALS } from '../lib/autoSync';
import { UI_SCALES, useUiScale, type UiScale } from '../composables/useUiScale';
import { backend, toUserMessage } from '../lib/bridge';
import { regionShortName } from '../lib/deviceCopy';
import type {
  CapabilityItem,
  CapabilityOverview,
  CapabilityProbe,
  LocalApiStatus,
  LoginStatus,
  UserPrefs,
  WorkoutCodeLabel,
} from '../types';
import { checkForDesktopUpdate, downloadAndInstallDesktopUpdate, updateState } from '../services/updateService';
import { intlLocale, locale, LOCALES, LOCALE_LABELS, setLocale } from '../i18n';

const {
  appStatus,
  statusError,
  syncState,
  syncMessage,
  isSyncing,
  autoSyncEnabled,
  autoSyncInterval,
  setAutoSyncInterval,
  refreshStatus,
  runSync,
  setAutoSyncEnabled,
  markDataChanged,
} = useSyncController();
const { scale, setScale } = useUiScale();
const {
  models: deviceModels,
  cache: deviceCache,
  loading: devicesLoading,
  error: deviceError,
  load: loadDevices,
  maskIdentifier,
} = useDevices();

const reconnecting = ref(false);
const loginStatus = ref<LoginStatus>({ state: 'idle', message: '', page_url: '' });
const loginError = ref<string | null>(null);
const loginBusy = ref(false);
let unlistenLogin: (() => void) | undefined;

// HAR导入和手动认证
const showManualAuth = ref(false);
const manualAppToken = ref('');
const manualUserId = ref('');
const manualRegionHost = ref('https://api-mifit-us3.zepp.com');
const manualAuthBusy = ref(false);

const dataBusy = ref<string | null>(null);
const dataMessage = ref<string | null>(null);
const dataError = ref<string | null>(null);
const localApiStatus = ref<LocalApiStatus | null>(null);
const deviceRefreshBusy = ref(false);
const deviceRefreshMessage = ref<string | null>(null);
const deviceRefreshError = ref<string | null>(null);
const diagnosticBusy = ref(false);

/* 设备型号指认与未识别运动编号命名。
   两者都是「本机推不出来，就问用户」，而不是让应用去猜：
   有些账号的设备响应里根本没有任何产品名字段（只有 deviceSource / deviceType
   这类数字），Zepp 的自定义训练模板也只给编号不给名字。 */
/* 指认动作本身住在设备二级页（/devices/:deviceKey）；这里只显示它留下的结果，
   状态共享自 useDeviceAssignment，两处不会各说各话。 */
const { assignError: deviceAssignError, assignMessage: deviceAssignMessage } = useDeviceAssignment();
const unknownCodes = ref<WorkoutCodeLabel[]>([]);
const codeDrafts = ref<Record<number, string>>({});
const codeBusy = ref<number | null>(null);
const codeError = ref<string | null>(null);
const codeMessage = ref<string | null>(null);

/* 一块板子上的所有数据流，按「已获取 → 云端有但本机没收 → 还没拿到」排。
   状态分三档而不是两档：「云端有、本机未收录」既不是拿到了，也不是没有，
   压成任何一档都会骗人。 */
const capabilityBoard = computed(() => [
  ...capabilityAvailable.value.map((row) => ({ ...row, state: 'on', lamp: 'on', note: undefined as string | undefined })),
  ...capabilityNotIngested.value.map((row) => ({ ...row, state: 'pending', lamp: 'pending' })),
  ...capabilityMissing.value.map((row) => ({ ...row, state: 'off', lamp: 'off', note: undefined as string | undefined })),
]);

const compactBusy = ref(false);
const compactMessage = ref<string | null>(null);
const compactError = ref<string | null>(null);

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
};

const runCompactPayloads = async () => {
  compactBusy.value = true;
  compactError.value = null;
  compactMessage.value = null;
  try {
    const result = await backend.compactRawPayloads();
    if (!result.compacted && !result.skipped) {
      compactMessage.value = '没有需要压缩的历史报文——它们已经是压缩形态了。';
    } else {
      const saved = result.bytesBefore - result.bytesAfter;
      const skipped = result.skipped ? `，跳过 ${result.skipped} 条（压完没变小或校验没通过）` : '';
      compactMessage.value = `已压缩 ${result.compacted} 条报文，${formatBytes(result.bytesBefore)} → ${formatBytes(result.bytesAfter)}，省下 ${formatBytes(saved)}${skipped}。`;
    }
    try {
      storageEstimate.value = await backend.getStorageEstimate(historyDays.value);
    } catch {
      // 估算刷新失败不影响压缩本身已经完成的事实
    }
  } catch (error) {
    compactError.value = toUserMessage(error, '压缩历史报文失败');
  } finally {
    compactBusy.value = false;
  }
};

const MCP_TOOLS = [
  { name: 'list_workouts', detail: '运动记录列表，最新在前' },
  { name: 'get_workout_insight', detail: '一次运动和你自己基线的比较' },
  { name: 'get_metric_series', detail: '按天的指标序列，每条带单位' },
  { name: 'get_sleep_detail', detail: '一晚睡眠的分期明细' },
  { name: 'get_data_health', detail: '每条流的抓取/解析/写入状态' },
];

/* 与其在界面上写一大篇配置教程，不如给用户一段能直接丢给 AI 的话。
   配置细节因工具、因操作系统、因安装路径而异，AI 看着他的实际情况给指引，
   比这里写死的四步准得多；用户本来也就是要截图去问 AI 的。 */
const MCP_SETUP_PROMPT = `我在用一个叫 ZeppBridge 的 Windows 桌面应用，它把我的 Amazfit / Zepp 手表数据同步到本机的一个 SQLite 数据库里。
它附带一个 MCP 程序（zeppbridge-mcp），我想把它配置到你这里，这样你就能直接查我的运动和健康数据，不用我每次导出再粘贴。

关于它的已知信息：
- MCP 程序要从 ZeppBridge 的 GitHub Release 页下载 zeppbridge-tools 压缩包，解压后里面有 zeppbridge-mcp 可执行文件。我可能还没下载。
- 它是 stdio 类型的 MCP server，只读本机数据库，不联网、不监听端口、不需要任何 token 或 API key。
- 典型配置形状是：{"mcpServers": {"zeppbridge": {"command": "<zeppbridge-mcp 的完整路径>", "args": []}}}
- 它提供五个只读工具：list_workouts（运动列表）、get_workout_insight（单次运动与个人基线的比较）、get_metric_series（按天的指标序列）、get_sleep_detail（一晚睡眠明细）、get_data_health（每条数据流的抓取/解析/写入状态）。

请告诉我：
1. 针对你（我现在正在用的这个工具）具体应该把配置写到哪个文件、用什么命令添加；
2. Windows 上路径要怎么写（反斜杠要不要转义）；
3. 配完怎么验证生效。

如果你需要我提供什么信息（比如我用的是哪个客户端、文件放在哪），直接问我。`;

const MCP_CONFIG_EXAMPLE = `{
  "mcpServers": {
    "zeppbridge": {
      "command": "<zeppbridge-mcp 的路径>",
      "args": []
    }
  }
}`;

const mcpMessage = ref<string | null>(null);
const copyMcpPrompt = async () => {
  try {
    await navigator.clipboard.writeText(MCP_SETUP_PROMPT);
    mcpMessage.value = '已复制。粘给你正在用的 AI，它会照着你的机器给出配置步骤。';
  } catch {
    mcpMessage.value = '复制失败，请手动选中上面那段文字。';
  }
};

const copyMcpConfig = async () => {
  try {
    await navigator.clipboard.writeText(MCP_CONFIG_EXAMPLE);
    mcpMessage.value = '配置已复制。把 command 换成你本机 zeppbridge-mcp 的实际路径。';
  } catch {
    mcpMessage.value = '复制失败，请手动选中上面的配置。';
  }
};

const RETENTION_CHOICES = [30, 90, 180, 365].map((days) => ({ value: days, label: `${days} 天` }));
const HISTORY_CHOICES = [7, 30, 90, 365].map((days) => ({ value: days, label: `最近 ${days} 天` }));
const EXPORT_FORMAT_CHOICES = [
  { value: 'json', label: 'JSON', hint: '结构化数据' },
  { value: 'csv', label: 'CSV', hint: '表格数据' },
  { value: 'gpx', label: 'GPX', hint: '运动轨迹' },
];

const unnamedCodeCount = computed(() => unknownCodes.value.filter((entry) => !entry.label).length);

const deviceKeyFor = (model: { profile: { device_id?: string | null; serial?: string | null } }): string =>
  (model.profile.device_id || model.profile.serial || '').trim();

const loadCorrections = async () => {
  const codes = await backend.getUnknownWorkoutCodes().catch(() => [] as WorkoutCodeLabel[]);
  unknownCodes.value = codes;
  codeDrafts.value = Object.fromEntries(codes.map((entry) => [entry.zeppType, entry.label]));
};

/* 起名字的快捷入口。这些只是「少打几个字」，不是对编号的识别结论——
   点一下只是把文本填进输入框，用户仍然可以改成任何名字。 */
const CODE_NAME_SUGGESTIONS = ['力量训练', '核心训练', 'HIIT', '拉伸放松', '康复训练', '自定义训练'];



const saveCodeLabel = async (zeppType: number) => {
  codeBusy.value = zeppType;
  codeError.value = null;
  codeMessage.value = null;
  try {
    const draft = (codeDrafts.value[zeppType] || '').trim();
    unknownCodes.value = await backend.setWorkoutCodeLabel(zeppType, draft || null);
    codeDrafts.value = Object.fromEntries(unknownCodes.value.map((entry) => [entry.zeppType, entry.label]));
    codeMessage.value = draft
      ? `编号 ${zeppType} 以后都显示为「${draft}」。`
      : `已清除编号 ${zeppType} 的自定义名称。`;
    markDataChanged();
  } catch (error) {
    codeError.value = toUserMessage(error, '无法保存自定义运动名称');
  } finally {
    codeBusy.value = null;
  }
};

/* 这里曾有三个只写 localStorage、没有任何后端行为的开关（本地数据加密 /
   启动解锁保护 / 匿名使用洞察）。一个默认打开、写着「加密保护」却什么都不做的
   开关，和把缺失值填成 0 的曲线是同一种错误，所以它们被删掉，而不是留成
   「计划中」继续占位。顺手清掉旧安装遗留的偏好值。 */
const STALE_PRIVACY_PREF_KEYS = [
  'zeppbridge-pref-encrypt',
  'zeppbridge-pref-launch-lock',
  'zeppbridge-pref-anon',
];
const clearStalePrivacyPrefs = () => {
  for (const key of STALE_PRIVACY_PREF_KEYS) window.localStorage.removeItem(key);
};

/* 本机 API 的界面状态。token 默认遮罩，只有用户点「显示」或「复制」才会向
   后端要明文。 */
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

/* 默认导出格式持久化 */
const defaultExportFormat = ref(window.localStorage.getItem('zeppbridge-default-export-format') || 'json');
const onExportFormatChange = () => {
  window.localStorage.setItem('zeppbridge-default-export-format', defaultExportFormat.value);
};

/* 隐私政策弹窗 */
const privacyModalOpen = ref(false);
const updateNotesOpen = ref(false);

/** 卡片上只放第一行；完整说明在弹窗里，免得把一整篇 Release notes 压成一段。 */
const releaseTeaser = computed(() => {
  const notes = updateState.notes.trim();
  if (!notes) return '本次 Release 未填写更新说明。';
  const firstLine = notes
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? notes;
  return firstLine.length > 60 ? `${firstLine.slice(0, 60)}…` : firstLine;
});

/* 一发现新版本就把「更新了什么」摆到用户面前。
   只报一个版本号的话，用户没有任何依据判断这次该不该更新。 */
watch(() => updateState.status, (status) => {
  if (status === 'available') updateNotesOpen.value = true;
});
const updateBusy = computed(() => ['checking', 'downloading', 'installing'].includes(updateState.status));
const updateProgress = computed(() => updateState.totalBytes
  ? Math.min(100, Math.round(updateState.downloadedBytes / updateState.totalBytes * 100))
  : null);
const updateStatusLabel = computed(() => ({
  idle: '尚未检查',
  checking: '正在检查 GitHub Release',
  available: `发现新版本 ${updateState.version}`,
  downloading: updateProgress.value === null ? '正在下载更新' : `正在下载 ${updateProgress.value}%`,
  installing: '正在安装，完成后会自动重启',
  failed: '更新失败',
  upToDate: '当前已是最新版本',
}[updateState.status]));

const formatUpdateBytes = (bytes: number) => bytes < 1024 * 1024
  ? `${(bytes / 1024).toFixed(1)} KB`
  : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/* 弹窗全程不关：下载和安装的进度都显示在更新说明下面。
   用户想干别的可以点「在后台继续」把弹窗收起来，下载不受影响。 */
const installUpdate = async () => {
  await downloadAndInstallDesktopUpdate();
};

const connected = computed(() => appStatus.value?.connection_state === 'connected');
const configuredOnly = computed(() => appStatus.value?.connection_state === 'configured');
const accountRecognized = computed(() => connected.value || configuredOnly.value);
const unknownDeviceDetected = computed(() => accountRecognized.value && (
  deviceModels.value.length === 0
  || deviceModels.value.some((model) => model.profile.match_status === 'unknown')
));
const loginInProgress = computed(() => ['waiting', 'extracting', 'verifying'].includes(String(loginStatus.value.state)));
const retentionDays = ref(appStatus.value?.retention_days ?? 365);
const historyDays = ref(appStatus.value?.history_sync_days ?? 30);
const storageEstimate = ref(appStatus.value?.storage ?? null);
const prefsBusy = ref(false);
/** 完整偏好（含归档开关）。AppStatus 只带保留期与补拉窗口。 */
const userPrefs = ref<UserPrefs | null>(null);

const connectionLabel = computed(() => {
  if (loginInProgress.value) {
    if (loginStatus.value.state === 'extracting') return '正在提取登录信息';
    if (loginStatus.value.state === 'verifying') return '正在验证';
    return '等待登录';
  }
  if (loginStatus.value.state === 'failed') return '登录失败';
  if (connected.value || configuredOnly.value) return '账号已识别';
  return '未识别';
});

const accountLabel = computed(() => appStatus.value?.masked_user_id || '未识别');
const accountInitial = computed(() => accountLabel.value.match(/[A-Za-z0-9]/)?.[0]?.toUpperCase() || '未');
const regionLabel = computed(() => regionShortName(appStatus.value?.region_host));
const regionHost = computed(() => appStatus.value?.region_host || '未提供');

const formatDateTime = (value?: string): string => {
  if (!value) return '尚无记录';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间未知';
  return new Intl.DateTimeFormat(intlLocale(), {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(date).replace(/\//g, '-');
};

/* 保留天数是「往回保留最近 N 天」，不是「N 天后清理」，而且清理只在每次成功
   同步之后执行。所以这里显示会被保留的最早日期，不再显示一个算错的未来日期。 */
const retentionCutoffDate = computed(() => {
  const date = new Date();
  date.setDate(date.getDate() - Number(retentionDays.value || 30));
  return new Intl.DateTimeFormat(intlLocale(), { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date).replace(/\//g, '-');
});

const dataSources = computed(() => [
  {
    kind: 'cloud' as const,
    name: 'Zepp Cloud',
    sub: '云服务',
    icon: 'cloud' as const,
    state: accountRecognized.value ? ('account' as const) : ('unknown' as const),
  },
  ...deviceModels.value.map((model) => ({
    kind: 'device' as const,
    name: model.canonicalName,
    sub: model.displayName,
    model,
    state: model.state,
  })),
]);

const refreshDevices = async () => {
  deviceRefreshBusy.value = true;
  deviceRefreshMessage.value = null;
  deviceRefreshError.value = null;
  try {
    await loadDevices(true);
    const refreshError = deviceCache.value?.refresh_error || deviceError.value;
    if (refreshError || deviceCache.value?.status === 'refresh_failed') {
      deviceRefreshError.value = `重新识别失败，已回退到本机缓存${refreshError ? `：${refreshError}` : '。'}`;
    } else if (deviceCache.value?.refreshed) {
      deviceRefreshMessage.value = `设备识别完成，共发现 ${deviceModels.value.length} 个实体设备。`;
    } else {
      deviceRefreshMessage.value = '未获得新的设备列表，当前显示本机缓存。';
    }
  } finally {
    deviceRefreshBusy.value = false;
  }
};

const applyLoginStatus = async (status: LoginStatus) => {
  loginStatus.value = status;
  if (status.state === 'connected') {
    reconnecting.value = false;
    loginError.value = null;
    await refreshStatus();
    if (!appStatus.value?.last_cloud_sync_at) void runSync('incremental');
  }
  if (status.state === 'failed') {
    loginError.value = status.message || '登录未完成';
  }
};

const startLogin = async () => {
  loginError.value = null;
  loginBusy.value = true;
  reconnecting.value = true;
  try {
    await applyLoginStatus(await backend.startWebLogin());
  } catch (error) {
    loginStatus.value = { state: 'failed', message: toUserMessage(error, '无法打开登录窗口'), page_url: '' };
    loginError.value = toUserMessage(error, '无法打开登录窗口');
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
    loginError.value = toUserMessage(error, '无法取消登录');
  } finally {
    loginBusy.value = false;
  }
};

// HAR导入
const importHar = async () => {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      multiple: false,
      filters: [{ name: 'HAR文件', extensions: ['har', 'json'] }],
    });
    if (!selected) return;
    loginBusy.value = true;
    loginError.value = null;
    try {
      const harPath = typeof selected === 'string' ? selected : (selected as { path: string }).path;
      await backend.importFromHar(harPath);
      await refreshStatus();
      loginError.value = null;
      dataMessage.value = 'HAR文件导入成功，认证信息已保存。';
    } catch (error) {
      loginError.value = toUserMessage(error, 'HAR导入失败');
    } finally {
      loginBusy.value = false;
    }
  } catch (error) {
    loginError.value = toUserMessage(error, '无法打开文件选择器');
  }
};

// 手动认证
const submitManualAuth = async () => {
  if (!manualAppToken.value || !manualUserId.value || !manualRegionHost.value) {
    loginError.value = '请填写所有必填字段';
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
    showManualAuth.value = false;
    manualAppToken.value = '';
    manualUserId.value = '';
    manualRegionHost.value = 'https://api-mifit-us3.zepp.com';
    dataMessage.value = '手动认证成功，认证信息已保存。';
  } catch (error) {
    loginError.value = toUserMessage(error, '手动认证失败');
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
    dataError.value = toUserMessage(error, '验证未完成');
  }
};

const clampDays = (value: number) => Math.min(365, Math.max(1, Math.round(value) || 1));

const clearAuth = async () => {
  if (!window.confirm('确定清除认证信息吗？本地健康数据会保留。')) return;
  dataError.value = null;
  try {
    await backend.clearAuth();
    await refreshStatus();
    reconnecting.value = false;
    loginStatus.value = { state: 'idle', message: '', page_url: '' };
    dataMessage.value = '认证已清除，本地健康数据仍保留。';
  } catch (error) {
    dataError.value = toUserMessage(error, '无法清除认证信息');
  }
};

const reprocessLocalData = async () => {
  dataBusy.value = 'reprocess';
  dataError.value = null;
  dataMessage.value = null;
  try {
    const result = await backend.reprocessLocalData();
    dataMessage.value = `本地数据已重新解析，共 ${result.total_records} 条标准化记录；云端同步时间未改变。`;
    markDataChanged();
    await refreshStatus();
  } catch (error) {
    dataError.value = toUserMessage(error, '重新解析本地数据失败');
  } finally {
    dataBusy.value = null;
  }
};

const cleanupData = async () => {
  if (!window.confirm(`确定清理 ${retentionDays.value} 天以前的本地数据吗？此操作无法撤销。`)) return;
  dataBusy.value = 'cleanup';
  dataError.value = null;
  try {
    await backend.cleanupOldData(retentionDays.value);
    dataMessage.value = `已清理 ${retentionDays.value} 天以前的数据。`;
    storageEstimate.value = await backend.getStorageEstimate(retentionDays.value).catch(() => null);
    markDataChanged();
  } catch (error) {
    dataError.value = toUserMessage(error, '清理旧数据失败');
  } finally {
    dataBusy.value = null;
  }
};

const openDataFolder = async () => {
  try { await backend.openDataFolder(); }
  catch (error) { dataError.value = toUserMessage(error, '无法打开数据文件夹'); }
};

const ensureLocalApiToken = async (): Promise<string | null> => {
  if (localApiToken.value) return localApiToken.value;
  try {
    localApiToken.value = await backend.revealLocalApiToken();
    return localApiToken.value;
  } catch (error) {
    localApiError.value = toUserMessage(error, '无法读取本机 API 访问令牌');
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
    if (localApiStatus.value.error) {
      localApiError.value = localApiStatus.value.error;
    } else if (next) {
      localApiMessage.value = '本机 API 已启用，无需重启应用。';
    } else {
      localApiToken.value = null;
      localApiTokenVisible.value = false;
      localApiMessage.value = '本机 API 已关闭，端口已释放。';
    }
  } catch (error) {
    localApiError.value = toUserMessage(error, '无法切换本机 API');
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
    localApiMessage.value = '访问令牌已复制到剪贴板。';
  } catch {
    localApiError.value = '无法写入剪贴板，请点击「显示」后手动复制。';
  }
};

const regenerateLocalApiToken = async () => {
  if (!window.confirm('重新生成后，旧令牌会立即失效，所有已经配置过它的本机程序都需要更新。确定吗？')) return;
  localApiBusy.value = true;
  localApiError.value = null;
  localApiMessage.value = null;
  try {
    localApiToken.value = await backend.rotateLocalApiToken();
    localApiTokenVisible.value = true;
    localApiStatus.value = await backend.getLocalApiStatus();
    localApiMessage.value = '已生成新的访问令牌，旧令牌已失效。';
  } catch (error) {
    localApiError.value = toUserMessage(error, '无法重新生成访问令牌');
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
    localApiMessage.value = '带鉴权的调用示例已复制（其中包含你的访问令牌）。';
  } catch {
    localApiError.value = '无法复制调用示例，请手动拼接接口地址与 Authorization 头。';
  }
};

/* 用户自己写的一句说明。
 *
 * 只发字段结构和编号时，收到报告的人经常判断不出这是哪一款表；
 * 「我的表是 Balance 2，但显示未识别」这一句往往比十个字段都管用。
 * 自由文本会在后端过一遍脱敏（本机路径、邮箱、长串标识）并截到 500 字。 */
const DIAGNOSTIC_NOTE_MAX = 500;
/* 让用户自己说要报什么。
   本机的自动检测只能发现「有未识别的设备或运动编号」；用户遇到的可能是
   别的（数据对不上、某项一直是空）。以前这些人会被「无需提交报告」顶回去，
   而界面上又没有任何地方能说明情况。 */
const REPORT_CATEGORIES = [
  { value: 'device', label: '设备没有被识别', hint: '型号显示错误或显示「未识别」' },
  { value: 'workout', label: '运动类型没有被识别', hint: '显示成「未知运动」或认错了项目' },
  { value: 'data', label: '数据对不上', hint: '某项一直是空，或和 Zepp App 里的数字不一样' },
  { value: 'other', label: '其它问题', hint: '在下面写清楚就行' },
];
const diagnosticCategory = ref<string>('');
const diagnosticNote = ref('');
const diagnosticResult = ref<{ reportId: string; submittedAt: string } | null>(null);
const diagnosticError = ref<string | null>(null);

const submitDiagnosticReport = async () => {
  const confirmed = window.confirm(
    '只会发送应用版本、系统类型、解析器版本、未识别设备的产品级提示与字段结构、固件版本、型号类编号（deviceSource / deviceType，只有整数，描述的是「哪一款表」而不是「哪一台表」）、未知运动编号和数量，以及你在上面写的那段说明（会自动去掉本机路径、邮箱和长串标识）。不会发送 Zepp 账号、Token、序列号、设备 ID、MAC 地址、GPS、健康数值或原始响应。确认提交吗？',
  );
  if (!confirmed) return;
  diagnosticBusy.value = true;
  diagnosticError.value = null;
  diagnosticResult.value = null;
  dataError.value = null;
  dataMessage.value = null;
  try {
    const note = diagnosticNote.value.trim();
    const result = await backend.submitDiagnosticReport(
      note || undefined,
      diagnosticCategory.value || undefined,
    );
    diagnosticResult.value = { reportId: result.reportId, submittedAt: result.submittedAt };
    diagnosticNote.value = '';
    diagnosticCategory.value = '';
  } catch (error) {
    diagnosticError.value = toUserMessage(error, '错误报告提交失败');
  } finally {
    diagnosticBusy.value = false;
  }
};

const savePrefs = async () => {
  const retention = clampDays(Number(retentionDays.value));
  const history = clampDays(Number(historyDays.value));
  retentionDays.value = retention;
  historyDays.value = history;
  if (retention < (appStatus.value?.retention_days ?? 365)) {
    if (!window.confirm(`下次成功同步将删除 ${retention} 天以前的本地数据，不可恢复。确定吗？`)) return;
  }
  prefsBusy.value = true;
  try {
    const prefs = await backend.setUserPrefs(retention, history);
    userPrefs.value = prefs;
    retentionDays.value = prefs.retention_days;
    historyDays.value = prefs.history_sync_days;
    try {
      storageEstimate.value = await backend.getStorageEstimate(history);
    } catch {
      dataError.value = '设置已保存，但磁盘空间估算暂时不可用';
    }
    dataMessage.value = '已保存本地保留与历史补拉设置。';
    await refreshStatus();
  } catch (error) {
    dataError.value = toUserMessage(error, '无法保存设置');
  } finally {
    prefsBusy.value = false;
  }
};

/** 归档面板改了偏好，回写到设置页自己的几个 ref，避免两处说法不一致。 */
const applyPrefsChange = (prefs: UserPrefs) => {
  userPrefs.value = prefs;
  retentionDays.value = prefs.retention_days;
  historyDays.value = prefs.history_sync_days;
  void refreshStatus();
};

const confirmHistorySync = async () => {
  if (isSyncing.value) {
    dataError.value = '当前有同步进行中，请稍后再补拉';
    return;
  }
  const days = clampDays(Number(historyDays.value));
  historyDays.value = days;
  if (days >= 90) {
    const minutes = Math.max(2, Math.round(0.75 + days * 0.05));
    const extra = days >= 365 ? '\n一年是上限，更早的云端记录不会进入本机。' : '';
    if (!window.confirm(`补拉 ${days} 天大约需要 ${minutes}–${minutes + 3} 分钟（估算）。请保持应用打开，可随时取消。${extra}`)) return;
  }
  if (storageEstimate.value && !storageEstimate.value.allow_long_history && days >= 90) {
    dataError.value = storageEstimate.value.message;
    return;
  }
  if (storageEstimate.value?.warn_tight_space && !window.confirm(`${storageEstimate.value.message}\n仍要按 ${days} 天补拉吗？建议先选 30 天。`)) return;
  await runSync('history', days);
};

onMounted(async () => {
  clearStalePrivacyPrefs();
  void loadCapabilityOverview();
  void loadDevices();
  void loadCorrections();
  localApiStatus.value = await backend.getLocalApiStatus().catch(() => null);
  if (localApiStatus.value?.error) localApiError.value = localApiStatus.value.error;
  const status = await refreshStatus();
  retentionDays.value = status?.retention_days ?? 365;
  historyDays.value = status?.history_sync_days ?? 30;
  storageEstimate.value = status?.storage ?? null;
  userPrefs.value = await backend.getUserPrefs().catch(() => null);
  try {
    unlistenLogin = await backend.listen<LoginStatus>('login://status', (payload) => { void applyLoginStatus(payload); });
    await applyLoginStatus(await backend.getLoginStatus());
  } catch {
    // Browser preview has no login IPC.
  }
});
onUnmounted(() => {
  unlistenLogin?.();
});
/* ── 设备能力总览 ─────────────────────────
 * 能力是关于这个账号的事实，和心率一样应该顺带拿到，而不是让用户按一下按钮才知道。
 * 十五项由库里已有的数据直接判定（零请求）；只有血压、体重、情绪三项在本地
 * 没有任何痕迹，需要真实请求，那部分在同步时静默完成、每周一次。 */
const capabilityOverview = ref<CapabilityOverview | null>(null);
const capabilityError = ref<string | null>(null);
const probeBusy = ref(false);
const probeResults = ref<CapabilityProbe[] | null>(null);

const streamLabels: Record<string, string> = {
  heart_rate: '心率',
  sleep: '睡眠',
  workouts: '运动',
  steps: '步数',
  daily_activity: '日常活动',
  stress: '压力',
  // 这一行数的是 daily_metrics 里 spo2_* 那几项（ODI、夜间评分、实测时长），
  // 全部来自夜间测量；身体状态页画的是 metric_samples 里的逐条读数，两者
  // 是不同的东西。都叫「血氧」会让人以为「有数据」却看不到曲线。
  spo2: '夜间血氧指标',
  respiratory_rate: '呼吸率',
  hrv: 'HRV (SDNN)',
  hrv_rmssd: 'HRV (RMSSD)',
  recovery: '恢复与能量',
  training_load: '训练负荷',
  vo2max: 'VO₂max',
  lactate_threshold: '乳酸阈值',
  pai: 'PAI 活力指数',
  blood_pressure: '血压',
  weight: '体重',
  emotion: '情绪',
  second_heart_rate: '逐秒心率索引',
  spo2_files: '逐条血氧原始文件索引',
};

const surfaceLabels: Record<string, string> = {
  v2_events: '/v2/users/me/events',
  user_events: '/users/{id}/events',
  user_events_day: '/users/{id}/events/dateString',
  file_info_events: '/users/me/fileInfo/events',
};

const capabilityRow = (item: CapabilityItem) => ({
  key: item.stream,
  label: streamLabels[item.stream] ?? item.stream,
  detail:
    item.status === 'available' && item.ingested !== false
      ? `${item.records} ${item.recordsUnit}${item.latestDate ? ` · 至 ${item.latestDate}` : ''}`
      : item.status === 'available'
        // 数量前面必须写清是云端的，否则读起来就像本机已经有了。
        ? `云端 ${item.records} ${item.recordsUnit}${item.latestDate ? ` · 至 ${item.latestDate}` : ''}`
        : (item.note ?? ''),
  note: item.ingested === false ? (item.note ?? null) : null,
});

/* 三分，不是两分。
 *
 * 「云端有」和「本机有」是两件事：血压和体重目前只做探测，不做归一化——
 * 缺少可核对的报文样本，贸然解析只会产出没人能验证的数字。把它们和真正
 * 收录了的数据流并排放在「可提供给 AI」里，会让人以为 ZeppBridge 已经
 * 存着他的血压，那是这个产品最不该给出的错觉。 */
const capabilityAvailable = computed(() =>
  (capabilityOverview.value?.items ?? [])
    .filter((item) => item.status === 'available' && item.ingested !== false)
    .map(capabilityRow),
);

const capabilityNotIngested = computed(() =>
  (capabilityOverview.value?.items ?? [])
    .filter((item) => item.status === 'available' && item.ingested === false)
    .map(capabilityRow),
);

const capabilityMissing = computed(() =>
  (capabilityOverview.value?.items ?? [])
    .filter((item) => item.status !== 'available')
    .map(capabilityRow),
);

const capabilityCheckedAt = computed(() => {
  const raw = capabilityOverview.value?.probedAt;
  if (!raw) return null;
  const then = new Date(raw).getTime();
  if (!Number.isFinite(then)) return null;
  const days = Math.floor((Date.now() - then) / 86400000);
  return days <= 0 ? '今天检测' : `${days} 天前检测`;
});

const loadCapabilityOverview = async () => {
  capabilityError.value = null;
  try {
    capabilityOverview.value = await backend.getCapabilityOverview();
  } catch (error) {
    capabilityError.value = toUserMessage(error);
  }
};

/** One line per probed endpoint — for diagnosing, not for reading. */
const probeDiagnostics = computed(() => {
  if (!probeResults.value) return [];
  return probeResults.value.map((probe) => {
    const name = `${probe.eventType}${probe.subType ? '/' + probe.subType : ''}`;
    const surface = surfaceLabels[probe.surface] ?? probe.surface;
    const result =
      probe.status === 'available'
        ? `${probe.records} 条${probe.latestDate ? `，最新 ${probe.latestDate}` : ''}`
        : probe.status === 'empty'
          ? '无数据'
          : probe.status === 'unavailable'
            ? '接口拒绝'
            : '请求失败';
    return `${name} @ ${surface} — ${result}`;
  });
});

const runCapabilityProbe = async () => {
  probeBusy.value = true;
  capabilityError.value = null;
  try {
    probeResults.value = await backend.probeDataCapabilities();
    await loadCapabilityOverview();
  } catch (error) {
    capabilityError.value = toUserMessage(error);
  } finally {
    probeBusy.value = false;
  }
};

</script>

<template>
  <section class="page settings-page" aria-labelledby="settings-title">
    <header class="page-header">
      <div>
        <h1 id="settings-title">设置</h1>
        <p class="page-intro">管理认证方式、同步行为、隐私与默认导出偏好，确保本地数据安全。</p>
      </div>
      <!-- 语言开关标签是双语的，而且不跟着界面语言变：一个看不懂中文的人
           必须能在中文界面上找到它，反过来也一样。 -->
      <div class="locale-switch">
        <p class="advanced-label">语言 · Language</p>
        <div class="scale-options" role="radiogroup" aria-label="语言 · Language">
          <button
            v-for="option in LOCALES"
            :key="option"
            type="button"
            role="radio"
            :aria-checked="locale === option"
            @click="setLocale(option)"
          >{{ LOCALE_LABELS[option] }}</button>
        </div>
      </div>
    </header>

    <div v-if="statusError" class="alert danger" role="alert">
      <Icon name="warning" :size="15" />{{ statusError }}
      <button type="button" @click="() => refreshStatus()">重试</button>
    </div>
    <div v-if="syncState !== 'idle'" :class="['alert', syncState === 'failed' ? 'danger' : 'success']" role="status">
      <Icon :name="syncState === 'failed' ? 'warning' : 'info'" :size="15" />{{ syncMessage }}
    </div>
    <div v-if="loginError" class="alert danger" role="alert"><Icon name="warning" :size="15" />{{ loginError }}</div>
    <div v-if="dataMessage" class="alert success"><Icon name="circle-check" :size="15" />{{ dataMessage }}</div>
    <div v-if="dataError" class="alert danger" role="alert"><Icon name="warning" :size="15" />{{ dataError }}</div>

    <!-- 1. 认证方式 -->
    <section class="settings-card" aria-labelledby="auth-title">
      <h2 id="auth-title">1. 认证方式</h2>
      <div class="auth-grid">
        <div :class="['auth-card', { current: connected || configuredOnly }]">
          <div class="auth-head">
            <span class="auth-icon"><Icon name="globe" :size="18" /></span>
            <div>
              <strong>官方网页登录</strong>
              <p>通过官方页面登录，自动抓取 appToken</p>
            </div>
          </div>
          <button v-if="loginInProgress" class="auth-action" type="button" :disabled="loginBusy" @click="cancelLogin">取消登录</button>
          <button v-else-if="connected && !reconnecting" class="auth-action is-current" type="button" @click="startLogin">
            当前使用 <Icon name="circle-check" :size="14" />
          </button>
          <button v-else class="auth-action" type="button" :disabled="loginBusy" @click="startLogin">
            {{ loginBusy ? '正在打开…' : loginStatus.state === 'failed' ? '重试连接' : '使用' }}
          </button>
        </div>
        <div class="auth-card">
          <div class="auth-head">
            <span class="auth-icon"><Icon name="file" :size="18" /></span>
            <div>
              <strong>HAR 导入</strong>
              <p>适合高级用户与调试，快速导入 HAR 文件</p>
            </div>
          </div>
          <button class="auth-action" type="button" :disabled="loginBusy" @click="importHar">使用</button>
        </div>
        <div class="auth-card">
          <div class="auth-head">
            <span class="auth-icon"><Icon name="edit" :size="18" /></span>
            <div>
              <strong>手动填写</strong>
              <p>手动填写 appToken、user_id 等信息</p>
            </div>
          </div>
          <button class="auth-action" type="button" @click="showManualAuth = !showManualAuth">{{ showManualAuth ? '收起' : '使用' }}</button>
        </div>
      </div>
      <p v-if="loginInProgress && loginStatus.message" class="hint-line"><Icon name="info" :size="13" />{{ loginStatus.message }}</p>

      <!-- 手动认证表单 -->
      <div v-if="showManualAuth" class="manual-auth-form">
        <h3>手动输入认证信息</h3>
        <p class="form-hint">从 mitmproxy/Charles 抓包或浏览器开发者工具获取。需要三个字段：</p>
        <div class="form-group">
          <label for="manual-apptoken">App Token *</label>
          <input id="manual-apptoken" v-model="manualAppToken" type="text" placeholder="从 HTTP 请求头 apptoken 字段复制" :disabled="manualAuthBusy" />
        </div>
        <div class="form-group">
          <label for="manual-userid">User ID *</label>
          <input id="manual-userid" v-model="manualUserId" type="text" placeholder="从 URL 路径 /users/{user_id}/ 提取" :disabled="manualAuthBusy" />
        </div>
        <div class="form-group">
          <label for="manual-host">Region Host *</label>
          <input id="manual-host" v-model="manualRegionHost" type="text" placeholder="https://api-mifit-us3.zepp.com" :disabled="manualAuthBusy" />
        </div>
        <div class="form-actions">
          <button class="button primary" type="button" :disabled="manualAuthBusy" @click="submitManualAuth">
            {{ manualAuthBusy ? '保存中...' : '保存认证' }}
          </button>
          <button class="button secondary" type="button" :disabled="manualAuthBusy" @click="showManualAuth = false">取消</button>
        </div>
      </div>
    </section>

    <!-- 2 列网格：账户与区域 + 连接设备 -->
    <div class="two-col">
      <!-- 2. 账户与区域 -->
      <section id="account-section" class="settings-card account-card" aria-labelledby="account-title">
        <h2 id="account-title">2. 账户与区域</h2>
        <div class="account-strip">
          <span class="account-avatar">{{ accountInitial }}</span>
          <div class="account-meta">
            <strong>{{ accountLabel }}</strong>
            <span :title="regionHost">区域 {{ regionLabel }} · 上次同步 {{ formatDateTime(appStatus?.last_cloud_sync_at) }}</span>
          </div>
          <span :class="['account-state', { on: accountRecognized }]"><i class="dot"></i>{{ connectionLabel }}</span>
          <button v-if="configuredOnly" class="kv-btn" type="button" :disabled="isSyncing" @click="verifyAndSync">验证并同步</button>
          <button v-else class="kv-btn" type="button" :disabled="loginBusy" @click="startLogin">重新认证</button>
        </div>
      </section>

      <!-- 3. 连接设备 / 数据来源 -->
      <section class="settings-card" aria-labelledby="devices-title">
        <div class="section-heading-row">
          <h2 id="devices-title">3. 连接设备 / 数据来源</h2>
          <button class="button secondary identify-button" type="button" :disabled="deviceRefreshBusy" @click="refreshDevices">
            <Icon name="sync" :size="14" :class="{ spinning: deviceRefreshBusy }" />
            {{ deviceRefreshBusy ? '正在识别…' : '重新识别设备' }}
          </button>
        </div>
        <div v-if="deviceRefreshError" class="alert danger device-alert" role="alert"><Icon name="warning" :size="14" />{{ deviceRefreshError }}</div>
        <div v-if="deviceRefreshMessage" class="alert success device-alert" role="status"><Icon name="circle-check" :size="14" />{{ deviceRefreshMessage }}</div>
        <div v-if="deviceError && !deviceRefreshError" class="alert warning device-alert" role="status"><Icon name="info" :size="14" />设备识别：{{ deviceError }}</div>

        <div v-if="devicesLoading" class="source-list source-list-loading">
          <div class="source-row skeleton-row"></div>
          <div class="source-row skeleton-row"></div>
        </div>
        <div v-else class="source-list">
          <div v-if="!deviceModels.length" class="device-empty">
            <Icon name="watch" :size="16" />尚未识别实体设备；Zepp Cloud 仍可作为云服务同步。
          </div>
          <template v-for="source in dataSources" :key="source.name">
          <div class="source-row">
            <span class="source-icon">
              <DeviceVisual v-if="source.kind === 'device'" :src="source.model.image" :alt="source.name" :kind="source.model.kind" compact />
              <DesignIcon v-else name="zepp-cloud" :size="32" />
            </span>
            <div class="source-copy">
              <strong>{{ source.name }}</strong>
              <span>{{ source.sub }}</span>
              <span v-if="source.kind === 'device'">固件 {{ source.model.firmware }} · 最近数据 {{ source.model.lastData }}</span>
              <span v-if="source.kind === 'device'">设备 ID {{ maskIdentifier(source.model.profile.device_id || source.model.profile.serial) }}</span>
            </div>
            <span :class="['source-state', { on: source.state !== 'unknown' }]"><i class="dot"></i>{{ deviceStateLabel(source.state) }}</span>
            <!-- 入口对每台设备都在。识别对了不代表用户同意，识别错了更不能没有退路。 -->
            <RouterLink
              v-if="source.kind === 'device' && deviceKeyFor(source.model)"
              class="button secondary assign-trigger"
              :to="`/devices/${encodeURIComponent(deviceKeyFor(source.model))}`"
            >
              <Icon name="watch" :size="14" />查看 / 换型号
            </RouterLink>
          </div>
          </template>
        </div>
        <div v-if="unknownDeviceDetected && !devicesLoading" class="diagnostic-panel unknown-device-report" role="status">
          <strong>检测到未识别设备</strong>
          <p>
            有些 Zepp 账号的设备响应里<strong>没有任何产品名字段</strong>，只有内部编号，本机无法推断型号——这种情况下「重新识别设备」再点多少次也不会变。
            你可以在上面直接指认型号：那会被如实标注成「你指认的型号」，不会伪装成自动识别结果。
          </p>
          <p>提交错误报告可以帮我把这台设备的编号补进内置目录，之后所有人都不用手动指认。报告只含固定白名单字段，无需 GitHub 账号。</p>
          <p v-if="deviceAssignError" class="api-error" role="alert">{{ deviceAssignError }}</p>
          <p v-else-if="deviceAssignMessage" class="hint-line ok">{{ deviceAssignMessage }}</p>
          <div class="diagnostic-note">
            <span>要反馈什么<em>（本机没自动检测到问题时，选一个就能提交）</em></span>
            <SelectMenu
              v-model="diagnosticCategory"
              :options="REPORT_CATEGORIES"
              placeholder="不指定（只发送自动检测到的问题）"
              aria-label="要反馈的问题类型"
            />
          </div>
          <label class="diagnostic-note">
            <span>补充说明<em>（选填，但很有用）</em></span>
            <textarea
              v-model="diagnosticNote"
              rows="3"
              :maxlength="DIAGNOSTIC_NOTE_MAX"
              placeholder="例如：我的表是 Amazfit Balance 2，但这里显示未识别；或者：户外骑行被识别成了未知运动。"
            ></textarea>
            <small>{{ diagnosticNote.length }} / {{ DIAGNOSTIC_NOTE_MAX }} · 发送前会自动去掉本机路径、邮箱和长串标识</small>
          </label>
          <button class="button secondary" type="button" :disabled="diagnosticBusy" @click="submitDiagnosticReport">
            <Icon name="send" :size="14" />{{ diagnosticBusy ? '正在安全提交…' : '提交错误报告' }}
          </button>
          <div v-if="diagnosticResult" class="diagnostic-done" role="status">
            <strong><Icon name="circle-check" :size="14" />已收到，谢谢</strong>
            <p>报告编号 <code>{{ diagnosticResult.reportId }}</code>，提交时间 {{ formatDateTime(diagnosticResult.submittedAt) }}。</p>
            <p class="diagnostic-done-note">发出去的就是上面列出的那几类字段和你写的那段说明，没有别的。</p>
          </div>
          <p v-if="diagnosticError" class="api-error" role="alert">{{ diagnosticError }}</p>
        </div>
      </section>

    </div>

    <section class="settings-card" aria-labelledby="capability-title">
      <div class="section-heading-row">
        <h2 id="capability-title">你的设备能提供什么</h2>
        <span v-if="capabilityCheckedAt" class="capability-checked">{{ capabilityCheckedAt }}</span>
      </div>
      <p class="section-description">
        以下是 ZeppBridge 目前能从你的账号读到的数据。这份清单在同步时自动更新，无需手动操作。
      </p>
      <div v-if="capabilityError" class="alert danger device-alert" role="alert">
        <Icon name="warning" :size="14" />{{ capabilityError }}
      </div>

      <!-- 三列竖排会让最长的那一列决定整块高度，右边两列下面全是空的。
           改成一格一条数据流的指示灯：亮 = 本机已有，暗 = 还没拿到。
           横向铺开，多少条流都能把宽度用满，也一眼看得出「亮了几个」。 -->
      <div v-if="capabilityOverview" class="capability-board">
        <p class="capability-legend">
          <span class="legend-item"><i class="lamp on"></i>已获取 {{ capabilityAvailable.length }}</span>
          <span v-if="capabilityNotIngested.length" class="legend-item"><i class="lamp pending"></i>云端有、本机未收录 {{ capabilityNotIngested.length }}</span>
          <span class="legend-item"><i class="lamp off"></i>暂未获取 {{ capabilityMissing.length }}</span>
        </p>

        <ul class="capability-grid">
          <li
            v-for="row in capabilityBoard"
            :key="row.key"
            :class="['capability-cell', row.state]"
          >
            <span class="cell-head">
              <i :class="['lamp', row.lamp]" aria-hidden="true"></i>
              <strong>{{ row.label }}</strong>
            </span>
            <span class="cell-detail">{{ row.detail }}</span>
            <span v-if="row.note" class="cell-note">{{ row.note }}</span>
          </li>
          <li v-if="!capabilityBoard.length" class="capability-cell off">
            <span class="cell-head"><i class="lamp off" aria-hidden="true"></i><strong>尚未同步</strong></span>
            <span class="cell-detail">完成一次同步后这里会亮起来。</span>
          </li>
        </ul>
      </div>

      <details class="probe-diagnostics">
        <summary>接口诊断详情</summary>
        <p class="probe-selfcheck">
          「暂未获取到」不等于设备不支持：Zepp 的接口对不存在的数据流也返回空响应，
          只有接口明确拒绝时才会写成「你的设备不提供」。
        </p>
        <button class="button secondary identify-button" type="button" :disabled="probeBusy" @click="runCapabilityProbe">
          <Icon name="sync" :size="14" :class="{ spinning: probeBusy }" />
          {{ probeBusy ? '正在检测…' : '立即重新检测' }}
        </button>
        <ul>
          <li v-for="line in probeDiagnostics" :key="line">{{ line }}</li>
        </ul>
      </details>
    </section>

    <section v-if="unknownCodes.length" class="settings-card" aria-labelledby="codes-title">
      <div class="section-heading-row">
        <h2 id="codes-title">未识别的运动编号</h2>
        <span v-if="unnamedCodeCount" class="capability-checked">{{ unnamedCodeCount }} 个还没有名字</span>
      </div>
      <p class="section-description">
        Zepp 的自定义训练模板只给编号、不给名字，内置目录里也查不到它们。
        与其猜一个运动名塞给你，不如你给这个编号起一次名字——之后所有同编号的记录都会用它，
        并且在运动详情里如实标注成「你起的名字」。
      </p>
      <div class="code-list">
        <div v-for="entry in unknownCodes" :key="entry.zeppType" class="code-row">
          <div class="code-head">
            <span class="code-badge" aria-hidden="true">{{ entry.zeppType }}</span>
            <div class="code-meta">
              <strong>Zepp 编号 {{ entry.zeppType }}</strong>
              <span>本机 {{ entry.records }} 条记录会一起改名</span>
            </div>
            <span v-if="entry.label" class="code-preview">现在显示为「{{ entry.label }}」</span>
            <span v-else class="code-preview muted">现在显示为「未识别运动（编号 {{ entry.zeppType }}）」</span>
          </div>
          <div class="code-input-row">
            <input
              v-model="codeDrafts[entry.zeppType]"
              type="text"
              maxlength="24"
              :aria-label="`编号 ${entry.zeppType} 的自定义名称`"
              placeholder="给它起个名字，例如：我的核心训练"
              :disabled="codeBusy === entry.zeppType"
              @keyup.enter="saveCodeLabel(entry.zeppType)"
            />
            <button
              class="button primary"
              type="button"
              :disabled="codeBusy === entry.zeppType"
              @click="saveCodeLabel(entry.zeppType)"
            >{{ codeBusy === entry.zeppType ? '保存中…' : '保存' }}</button>
          </div>
          <div class="code-suggestions">
            <button
              v-for="name in CODE_NAME_SUGGESTIONS"
              :key="name"
              type="button"
              class="filter-chip"
              :disabled="codeBusy === entry.zeppType"
              @click="codeDrafts[entry.zeppType] = name"
            >{{ name }}</button>
          </div>
        </div>
      </div>
      <p v-if="codeError" class="api-error" role="alert">{{ codeError }}</p>
      <p v-else-if="codeMessage" class="hint-line ok">{{ codeMessage }}</p>
      <p class="retain-note">名字只保存在本机，不会回传 Zepp，也不会被重新解析覆盖。留空并保存即可清除。</p>
    </section>

    <!-- 隐私与安全这一块最高，早先和「本地数据保留」「导出偏好」并排在三栏里，
         网格拉平行高，右边两张卡片下面就空出小半屏没有意义的留白。
         现在它单独一行，另外两块自己配一对。 -->
    <div class="one-col">
      <!-- 4. 隐私安全 -->
      <section id="privacy-section" class="settings-card" aria-labelledby="privacy-title">
        <h2 id="privacy-title">4. 隐私与安全</h2>
        <ul class="fact-list">
          <li>
            <span class="toggle-icon"><Icon name="lock" :size="14" /></span>
            <div>
              <strong>本地数据库未加密</strong>
              <span>健康数据以明文 SQLite 保存在程序目录的 data 文件夹，依赖 Windows / macOS 的账户与磁盘加密保护。ZeppBridge 不提供整库加密，也不会假装提供。</span>
            </div>
          </li>
          <li>
            <span class="toggle-icon"><Icon name="shield" :size="14" /></span>
            <div>
              <strong>Zepp 令牌只进系统凭据存储</strong>
              <span>Windows 凭据管理器 / macOS 钥匙串保存令牌，auth.json 里只有账号与区域等元数据，令牌不会写进日志、导出或错误报告。</span>
            </div>
          </li>
          <li>
            <span class="toggle-icon"><Icon name="user" :size="14" /></span>
            <div>
              <strong>没有埋点，没有使用统计</strong>
              <span>应用不会自动上报任何使用行为。只有你亲手点击「提交错误报告」时，才会发送下面列出的那几类脱敏字段。</span>
            </div>
          </li>
        </ul>
        <button class="privacy-link-btn" type="button" @click="privacyModalOpen = true">
          <Icon name="shield" :size="13" />查看本地隐私与脱敏原则
        </button>
        <div class="diagnostic-panel">
          <strong>设备或运动没有识别？</strong>
          <p>无需注册 GitHub 或复制数据。确认后只把产品级字段结构、固件版本、型号类编号（整数，只说明是哪一款表）、未知运动编号和数量发送到 ZeppBridge 的私有错误报告库；绝不发送账号、Token、序列号、设备 ID、MAC 地址、GPS、健康数值、原始响应或本机路径。</p>
          <div class="diagnostic-note">
            <span>要反馈什么<em>（本机没自动检测到问题时，选一个就能提交）</em></span>
            <SelectMenu
              v-model="diagnosticCategory"
              :options="REPORT_CATEGORIES"
              placeholder="不指定（只发送自动检测到的问题）"
              aria-label="要反馈的问题类型"
            />
          </div>
          <label class="diagnostic-note">
            <span>补充说明<em>（选填，但很有用）</em></span>
            <textarea
              v-model="diagnosticNote"
              rows="3"
              :maxlength="DIAGNOSTIC_NOTE_MAX"
              placeholder="例如：我的表是 Amazfit Balance 2，但这里显示未识别；或者：户外骑行被识别成了未知运动。"
            ></textarea>
            <small>{{ diagnosticNote.length }} / {{ DIAGNOSTIC_NOTE_MAX }} · 发送前会自动去掉本机路径、邮箱和长串标识</small>
          </label>
          <button class="button secondary" type="button" :disabled="diagnosticBusy" @click="submitDiagnosticReport">
            <Icon name="send" :size="14" />{{ diagnosticBusy ? '正在安全提交…' : '提交错误报告' }}
          </button>
          <div v-if="diagnosticResult" class="diagnostic-done" role="status">
            <strong><Icon name="circle-check" :size="14" />已收到，谢谢</strong>
            <p>报告编号 <code>{{ diagnosticResult.reportId }}</code>，提交时间 {{ formatDateTime(diagnosticResult.submittedAt) }}。</p>
            <p class="diagnostic-done-note">发出去的就是上面列出的那几类字段和你写的那段说明，没有别的。</p>
          </div>
          <p v-if="diagnosticError" class="api-error" role="alert">{{ diagnosticError }}</p>
        </div>
      </section>

    </div>

    <!-- 5. MCP -->
    <section class="settings-card mcp-card" aria-labelledby="mcp-title">
      <div class="section-heading-row">
        <h2 id="mcp-title">5. MCP（让 AI 工具直接问本机数据）</h2>
        <span class="capability-checked">只读 · 不监听端口</span>
      </div>
      <p class="section-description">
        <strong>不知道 MCP 是什么可以跳过，它不影响 ZeppBridge 的任何功能。</strong>
        一句话说：「交给 AI」是你导出数据粘给 AI；MCP 是<strong>让 AI 自己来问</strong>——
        配好之后直接对它说「看看我最近一个月的睡眠」，它自己去你本机的库里查。
        只对装在你电脑上的 AI 编程工具有用（Claude Code、Codex、Grok 这类）。
      </p>

      <div class="mcp-handoff">
        <p class="mcp-sub">
          配置步骤因工具而异，与其在这里写一大篇，不如<strong>把下面这段复制给你正在用的 AI</strong>，让它照着你的机器给你指引。
        </p>
        <pre class="mcp-config"><code>{{ MCP_SETUP_PROMPT }}</code></pre>
        <div class="inline-actions">
          <button class="button primary" type="button" @click="copyMcpPrompt">
            <Icon name="copy" :size="14" />复制这段去问 AI
          </button>
          <button class="button secondary" type="button" @click="copyMcpConfig">
            <Icon name="copy" :size="14" />只复制配置片段
          </button>
        </div>
        <p v-if="mcpMessage" class="hint-line ok" role="status">{{ mcpMessage }}</p>
      </div>

      <p class="mcp-sub">配好之后，AI 能问到这五件事：</p>
      <div class="mcp-tools">
        <div v-for="tool in MCP_TOOLS" :key="tool.name" class="mcp-tool">
          <code>{{ tool.name }}</code>
          <span>{{ tool.detail }}</span>
        </div>
      </div>

      <p class="retain-note">
        <code>zeppbridge-mcp</code> 随 Release 的工具压缩包一起分发，和桌面应用同一个版本。
        它读的是同一个本机数据库，所以看到的数据和你在这个界面里看到的完全一致。
      </p>
    </section>

    <div class="two-col paired">
      <!-- 6. 数据保留 -->
      <section class="settings-card" aria-labelledby="retention-title">
        <h2 id="retention-title">6. 本地数据保留</h2>
        <div class="field-row">
          <span class="kv-label">保留时长</span>
          <SelectMenu
            v-model="retentionDays"
            :options="RETENTION_CHOICES"
            aria-label="本地数据保留天数"
            @update:model-value="savePrefs"
          />
        </div>
        <p class="retain-note">保留最近 {{ retentionDays }} 天的本地数据；清理在每次<strong>成功同步之后</strong>执行，不会在后台自行发生。</p>
        <p class="hint-line">{{ storageEstimate?.message || `下次成功同步后，${retentionCutoffDate} 以前的数据会被清理` }}</p>
        <div class="inline-actions">
          <button class="button secondary" type="button" :disabled="Boolean(dataBusy)" @click="cleanupData">
            {{ dataBusy === 'cleanup' ? '正在清理…' : '立即清理' }}
          </button>
          <button class="button secondary" type="button" :disabled="Boolean(dataBusy)" @click="reprocessLocalData">
            {{ dataBusy === 'reprocess' ? '正在解析…' : '重新解析' }}
          </button>
        </div>
      </section>

      <!-- 7. 导出默认值 -->
      <section class="settings-card" aria-labelledby="export-title">
        <h2 id="export-title">7. 导出与补拉偏好</h2>
        <div class="field-row">
          <span class="kv-label">默认导出格式</span>
          <SelectMenu
            v-model="defaultExportFormat"
            :options="EXPORT_FORMAT_CHOICES"
            aria-label="默认导出格式"
            @update:model-value="onExportFormatChange"
          />
        </div>
        <div class="field-row">
          <span class="kv-label">历史补拉范围</span>
          <SelectMenu
            v-model="historyDays"
            :options="HISTORY_CHOICES"
            aria-label="历史补拉天数"
            @update:model-value="savePrefs"
          />
        </div>
        <p class="retain-note">设置「交给 AI」页面的默认格式与云端补拉窗口。</p>
        <div class="inline-actions">
          <button class="button primary" type="button" :disabled="isSyncing || (!connected && !configuredOnly) || prefsBusy" @click="confirmHistorySync">
            开始历史补拉
          </button>
        </div>
      </section>
    </div>

    <!-- 历史补拉的账本要和「补拉范围」一起看，所以留在正文；
         数据库快照是灾难恢复工具，进「高级与维护」。 -->
    <div class="one-col wide-panels">
      <HistoryArchivePanel :prefs="userPrefs" @prefs-changed="applyPrefsChange" />
    </div>

    <!-- 8. 软件更新 -->
    <section class="settings-card update-card" aria-labelledby="update-title">
      <div class="update-head">
        <div>
          <h2 id="update-title">8. 软件更新</h2>
          <p>每天最多静默检查一次，也可随时手动检查。</p>
        </div>
        <button class="button secondary" type="button" :disabled="updateBusy" @click="checkForDesktopUpdate(true)">
          <Icon name="sync" :size="14" :class="{ spinning: updateState.status === 'checking' }" />
          {{ updateState.status === 'checking' ? '检查中…' : '检查更新' }}
        </button>
      </div>
      <div :class="['update-state', `is-${updateState.status}`]" role="status" aria-live="polite">
        <i aria-hidden="true"></i>
        <div>
          <strong>{{ updateStatusLabel }}</strong>
          <p v-if="updateState.status === 'failed'">{{ updateState.error }}</p>
          <p v-else-if="updateState.status === 'available'">当前 {{ updateState.currentVersion }}<template v-if="updateState.sizeBytes"> · {{ formatUpdateBytes(updateState.sizeBytes) }}</template></p>
          <p v-else>版本 {{ updateState.currentVersion || '读取中' }}</p>
        </div>
      </div>
      <progress v-if="updateState.status === 'downloading' && updateProgress !== null" :value="updateProgress" max="100">{{ updateProgress }}%</progress>
      <div v-if="updateState.status === 'available'" class="update-release">
        <div>
          <strong>ZeppBridge {{ updateState.version }}</strong>
          <p class="release-teaser">{{ releaseTeaser }}</p>
        </div>
        <button class="button primary" type="button" @click="updateNotesOpen = true">看看更新了什么</button>
      </div>
    </section>

    <!-- 9. 自动同步 -->
    <section class="settings-card sync-card" aria-labelledby="sync-title">
      <div class="sync-lead">
        <span class="sync-icon"><Icon name="monitor" :size="20" /></span>
        <div>
          <h2 id="sync-title">9. 自动同步</h2>
          <p class="sync-desc">应用打开期间每 {{ autoSyncInterval }} 分钟自动同步云端记录<br />保持开启可获得连续的时序数据。</p>
        </div>
      </div>
      <div class="sync-controls">
        <div class="interval-options" role="radiogroup" aria-label="自动同步间隔" :class="{ 'is-disabled': !autoSyncEnabled }">
          <button
            v-for="minutes in AUTO_SYNC_INTERVALS"
            :key="minutes"
            type="button"
            role="radio"
            :aria-checked="autoSyncInterval === minutes"
            :disabled="!autoSyncEnabled"
            @click="setAutoSyncInterval(minutes)"
          >{{ minutes }} 分钟</button>
        </div>
        <span class="sync-toggle-label">{{ autoSyncEnabled ? '同步已开启' : '同步已关闭' }}</span>
        <button class="switch" type="button" role="switch" :aria-checked="autoSyncEnabled" @click="setAutoSyncEnabled(!autoSyncEnabled)"><span></span></button>
        <button class="button secondary sync-now" type="button" :disabled="isSyncing || !connected" @click="runSync('incremental')">
          <Icon name="sync" :size="14" />{{ isSyncing ? '正在同步…' : '立即同步' }}
        </button>
      </div>
    </section>

    <!-- 高级维护 -->
    <details class="advanced settings-card">
      <summary>
        <span>
          <strong>高级与维护</strong>
          <em>缩放、数据文件夹与认证清除，仅在需要时使用。</em>
        </span>
        <Icon name="chevron-down" :size="16" />
      </summary>
      <div class="advanced-content">
        <div class="advanced-block">
          <p class="advanced-label">界面缩放</p>
          <p class="section-description">100% 为设计基准，也可使用 Ctrl + / Ctrl -。</p>
          <div class="scale-options" role="radiogroup" aria-label="界面缩放">
            <button
              v-for="option in UI_SCALES"
              :key="option"
              type="button"
              role="radio"
              :aria-checked="scale === option"
              @click="setScale(option as UiScale)"
            >{{ option }}%</button>
          </div>
        </div>
        <div class="advanced-block">
          <p class="advanced-label">数据与认证</p>
          <p class="section-description">数据保存在程序目录的 data 文件夹，当前保留 {{ retentionDays }} 天。</p>
          <div class="inline-actions">
            <button class="button secondary" type="button" @click="openDataFolder"><Icon name="folder" :size="15" />打开数据文件夹</button>
            <button class="button danger-button" type="button" @click="clearAuth">清除认证</button>
          </div>
        </div>
        <div class="advanced-block">
          <p class="advanced-label">数据健康检查</p>
          <p class="section-description">
            每条数据流从云端取回、被解析、写进本机这三步分别走到哪一步，覆盖了哪些日期，来自哪个来源。
            平时不需要看；同步结果和你预期对不上时来这里找原因。
          </p>
          <div class="inline-actions">
            <RouterLink class="button secondary" to="/health-check"><Icon name="database" :size="15" />打开数据健康检查</RouterLink>
          </div>
        </div>
        <div class="advanced-block">
          <p class="advanced-label">压缩历史报文</p>
          <p class="section-description">
            云端原始报文是这个库里最占地方的东西，它们是 JSON 文本，压缩后通常只剩五分之一。
            <strong>这件事默认自动做</strong>：装完新版本第一次启动时，后台会把存量报文压掉，顶部会显示「正在压缩」，压完自动消失。
            这个按钮只是让你手动再跑一次（比如上次被中断了）。
            压之前会先解压回来逐字比对，对不上的那条就跳过不动——原始报文是重放的唯一依据，宁可不压。
            压完会执行一次 VACUUM，磁盘上的文件才会真正变小。
          </p>
          <div class="inline-actions">
            <button class="button secondary" type="button" :disabled="compactBusy" @click="runCompactPayloads">
              {{ compactBusy ? '正在压缩…（大库需要几分钟）' : '压缩历史报文' }}
            </button>
          </div>
          <p v-if="compactError" class="api-error" role="alert">{{ compactError }}</p>
          <p v-else-if="compactMessage" class="hint-line ok" role="status">{{ compactMessage }}</p>
        </div>
        <div class="advanced-block">
          <p class="advanced-label">数据库快照与恢复</p>
          <p class="section-description">
            灾难恢复用的整库副本，只能由 ZeppBridge 自己读回来。数据库升级前会自动生成一份，平时不需要手动做。
          </p>
          <BackupPanel />
        </div>
        <div class="advanced-block">
          <p class="advanced-label">本机 REST API</p>
          <p class="section-description">
            给本机上的其他程序（脚本、看板、自建工具）读取已标准化的运动序列 JSON 用。
            如果你没有这类需求，保持关闭即可。
          </p>
      <section class="settings-card api-card" aria-labelledby="api-title">
        <div class="api-head">
          <span class="api-icon"><Icon name="braces" :size="20" /></span>
          <div>
            <h2 id="api-title">本机 REST API</h2>
            <p>让本机上的其他程序读取已标准化的运动序列 JSON。默认关闭，需要你显式启用。</p>
          </div>
          <span :class="['api-state', { on: localApiStatus?.running }]">
            <i aria-hidden="true"></i>{{ localApiStatus?.running ? '正在监听' : (localApiStatus?.enabled ? '已启用但未监听' : '已关闭') }}
          </span>
        </div>

        <div class="toggle-row api-toggle">
          <div class="toggle-copy">
            <strong>启用本机 API</strong>
            <span>开关立即生效，不需要重启应用；关闭后 {{ localApiStatus?.address || '127.0.0.1:43921' }} 会立刻释放。</span>
          </div>
          <button
            class="switch"
            type="button"
            role="switch"
            aria-label="启用本机 REST API"
            :aria-checked="Boolean(localApiStatus?.enabled)"
            :disabled="localApiBusy"
            @click="toggleLocalApi"
          ><span></span></button>
        </div>

        <template v-if="localApiStatus?.enabled">
          <div class="api-endpoint">
            <code>{{ localApiStatus?.base_url || 'http://127.0.0.1:43921' }}/workouts/{id}/series</code>
            <button class="button secondary" type="button" :disabled="localApiBusy" @click="copyLocalApiExample">
              <Icon name="copy" :size="14" />复制带鉴权示例
            </button>
          </div>

          <div class="api-token">
            <span class="kv-label">访问令牌</span>
            <code>{{ localApiTokenVisible && localApiToken ? localApiToken : maskedToken }}</code>
            <div class="inline-actions">
              <button class="button secondary" type="button" :disabled="localApiBusy" @click="toggleTokenVisibility">
                {{ localApiTokenVisible ? '隐藏' : '显示' }}
              </button>
              <button class="button secondary" type="button" :disabled="localApiBusy" @click="copyLocalApiToken">
                <Icon name="copy" :size="14" />复制
              </button>
              <button class="button secondary" type="button" :disabled="localApiBusy" @click="regenerateLocalApiToken">
                重新生成
              </button>
            </div>
          </div>
          <p class="api-note">每个请求都必须带 <code>Authorization: Bearer &lt;令牌&gt;</code>，否则返回 401。重新生成后旧令牌立即失效。</p>
        </template>

        <p v-if="localApiError" class="api-error" role="alert">{{ localApiError }}</p>
        <p v-else-if="localApiMessage" class="hint-line ok">{{ localApiMessage }}</p>
        <p class="api-note">仅绑定 127.0.0.1，只读、不开放浏览器跨域、不返回任何凭据；退出 ZeppBridge 后停止。</p>
      </section>
        </div>
        <details class="diag-fold">
          <summary>同步诊断</summary>
          <div class="stream-list">
            <div v-for="stream in appStatus?.streams" :key="stream.stream" class="stream-row">
              <strong>{{ stream.stream }}</strong>
              <span>{{ stream.status }}</span>
              <span>{{ formatDateTime(stream.last_cloud_sync_at) }}</span>
            </div>
            <p v-if="!appStatus?.streams?.length" class="section-description">尚无同步诊断。</p>
          </div>
        </details>
      </div>
    </details>

    <!-- 更新说明弹窗。
         发现新版本时自动弹一次：只给一个版本号，用户没法判断这次值不值得更新。
         Release 说明是 Markdown，这里按纯文本原样显示（保留换行），不做渲染——
         更新说明是别处写的内容，不该在这里当富文本执行。 -->
    <div v-if="updateNotesOpen" class="modal-backdrop" @click.self="updateNotesOpen = false">
      <div class="privacy-modal surface-card pad">
        <div class="modal-head">
          <div class="modal-title-row">
            <Icon name="sync" :size="18" class="shield-ic" />
            <h3>ZeppBridge {{ updateState.version }} 更新了什么</h3>
          </div>
          <button type="button" class="close-btn" @click="updateNotesOpen = false"><Icon name="x" :size="16" /></button>
        </div>
        <p class="modal-sub">
          你现在是 {{ updateState.currentVersion || '未知版本' }}
          <template v-if="updateState.date"> · 发布于 {{ updateState.date.slice(0, 10) }}</template>
          <template v-if="updateState.sizeBytes"> · {{ formatUpdateBytes(updateState.sizeBytes) }}</template>
        </p>
        <div class="modal-body">
          <pre class="release-notes">{{ updateState.notes || '本次 Release 未填写更新说明。' }}</pre>
        </div>
        <!-- 下载进度就放在更新说明下面：等待的这几十秒里，用户正好可以把上面
             的说明读完，而不是盯着一个没有反馈的按钮猜它有没有在动。 -->
        <div v-if="updateState.status === 'downloading' || updateState.status === 'installing'" class="update-progress">
          <div class="progress-head">
            <strong>{{ updateState.status === 'installing' ? '正在安装…' : '正在下载更新' }}</strong>
            <span v-if="updateState.status === 'downloading' && updateProgress !== null">{{ updateProgress }}%</span>
          </div>
          <div class="progress-track" role="progressbar" :aria-valuenow="updateProgress ?? undefined" aria-valuemin="0" aria-valuemax="100">
            <i :class="{ indeterminate: updateProgress === null || updateState.status === 'installing' }"
               :style="updateState.status === 'downloading' && updateProgress !== null ? { width: `${updateProgress}%` } : undefined"></i>
          </div>
          <p class="progress-note">
            <template v-if="updateState.status === 'installing'">安装完应用会自己重启，本地健康数据不会被删除。</template>
            <template v-else-if="updateState.totalBytes">
              {{ formatUpdateBytes(updateState.downloadedBytes) }} / {{ formatUpdateBytes(updateState.totalBytes) }}
              · 下载完会自动安装，这期间可以继续读上面的更新说明
            </template>
            <template v-else>下载完会自动安装，这期间可以继续读上面的更新说明。</template>
          </p>
        </div>

        <p v-else-if="updateState.status === 'failed'" class="progress-note bad" role="alert">
          更新失败：{{ updateState.error }}
        </p>
        <p v-else class="progress-note">安装时应用会自动重启，本地健康数据不会被删除。</p>

        <div class="modal-foot">
          <button
            type="button"
            class="button secondary"
            @click="updateNotesOpen = false"
          >{{ updateState.status === 'downloading' || updateState.status === 'installing' ? '在后台继续' : '稍后再说' }}</button>
          <button
            v-if="updateState.status !== 'downloading' && updateState.status !== 'installing'"
            type="button"
            class="button primary"
            @click="installUpdate"
          >{{ updateState.status === 'failed' ? '重试' : '下载并安装' }}</button>
        </div>
      </div>
    </div>

    <!-- 隐私政策弹窗 -->
    <div v-if="privacyModalOpen" class="modal-backdrop" @click.self="privacyModalOpen = false">
      <div class="privacy-modal surface-card pad">
        <div class="modal-head">
          <div class="modal-title-row">
            <Icon name="shield" :size="18" class="shield-ic" />
            <h3>ZeppBridge 本地隐私保障原则</h3>
          </div>
          <button type="button" class="close-btn" @click="privacyModalOpen = false"><Icon name="x" :size="16" /></button>
        </div>
        <div class="modal-body">
          <p><strong>1. 本地处理优先：</strong>所有健康与运动时序数据仅存储在本地 SQLite 数据库中，解析与脱敏完全在本地完成。</p>
          <p><strong>2. 认证凭据严格隔离：</strong>App Token 与 User ID 等凭据不与任何第三方分享，AI 导出时自动执行不可逆脱敏。</p>
          <p><strong>3. 敏感定位控制：</strong>GPS 经纬度数据默认不注入 AI 剪贴板，严格保障家庭与常用运动路线隐私。</p>
          <p><strong>4. 错误报告由你决定：</strong>只有点击并确认「提交错误报告」后，才发送固定白名单的产品级诊断；不会发送账号、设备 ID、运动详情或健康数据，也不会自动创建 GitHub Issue。</p>
          <p><strong>5. 透明开源：</strong>端到端代码开源，无暗中网络回传逻辑。</p>
        </div>
        <div class="modal-foot">
          <button type="button" class="button primary" @click="privacyModalOpen = false">我知道了</button>
        </div>
      </div>
    </div>

  </section>
</template>

<style scoped>
.page { width: 100%; min-width: 0; margin: 0; display: grid; gap: 14px; }
.page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 0; min-width: 0; }
.locale-switch { flex: 0 0 auto; text-align: right; }
.locale-switch .advanced-label { margin-bottom: 6px; }
.locale-switch .scale-options { justify-content: flex-end; }
.locale-switch .scale-options button { min-width: 62px; }
h1, h2, h3, p { margin-top: 0; }
h1 { font-size: 24px; font-weight: 700; color: var(--ink); }
h2 { margin-bottom: 14px; font-size: 15px; font-weight: 700; color: var(--ink); }
h3 { margin-bottom: 4px; font-size: 13px; font-weight: 700; color: var(--ink); }
.page-intro, .section-description { margin-bottom: 0; color: var(--muted); font-size: 12px; }
.section-description { margin: 0 0 var(--space-3); }
.settings-card { padding: 18px 20px; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface); min-width: 0; }
.api-head { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 12px; }
.api-head h2 { margin-bottom: 4px; }
.api-head p, .api-note, .api-error { margin: 0; color: var(--subtle); font-size: 11px; line-height: 1.5; }
.api-icon { display: grid; width: 38px; height: 38px; place-items: center; border-radius: 10px; background: var(--accent-soft); color: var(--accent); }
.api-state { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; white-space: nowrap; }
.api-state.on { color: var(--accent); }
.api-state i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.api-endpoint { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 10px; margin-top: 14px; padding: 10px 12px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface-raised); }
.api-endpoint code { overflow: hidden; color: var(--ink); font-family: var(--font-mono); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.api-note, .api-error { margin-top: 9px; }
.api-note code { padding: 1px 5px; border-radius: 4px; background: var(--surface-raised); font-family: var(--font-mono); font-size: 10px; }
.api-toggle { margin-top: 12px; border-bottom: 0; }
.api-token { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 10px 12px; margin-top: 10px; padding: 10px 12px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface-raised); }
.api-token code { overflow: hidden; color: var(--ink); font-family: var(--font-mono); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.api-token .inline-actions { grid-column: 1 / -1; }
.fact-list { display: grid; gap: 12px; margin: 0; padding: 0; list-style: none; }
.fact-list li { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 10px; align-items: start; }
.fact-list strong { display: block; margin-bottom: 3px; color: var(--ink); font-size: 12px; font-weight: 500; }
.fact-list span { color: var(--subtle); font-size: 11px; line-height: 1.55; }
.code-list { display: grid; gap: 10px; margin-top: 12px; }
.code-row { display: grid; gap: 10px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface-raised); }
.code-head { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; }
.code-badge { display: grid; place-items: center; width: 34px; height: 34px; border: 1px solid var(--line); border-radius: 10px; color: var(--muted); font-family: var(--font-mono); font-size: 11px; }
.code-meta { display: grid; gap: 2px; }
.code-meta strong { color: var(--ink); font-size: 12px; font-weight: 500; }
.code-meta span { color: var(--subtle); font-size: 11px; }
.code-preview { color: var(--accent); font-size: 11px; text-align: right; }
.code-preview.muted { color: var(--muted); }
.code-input-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
.code-suggestions { display: flex; flex-wrap: wrap; gap: 6px; }
.code-suggestions .filter-chip { padding: 3px 10px; border: 1px solid var(--line); border-radius: 999px; background: transparent; color: var(--muted); font-size: 11px; cursor: pointer; }
.code-suggestions .filter-chip:hover { border-color: var(--accent); color: var(--accent); }
.assign-trigger { justify-self: end; }
.api-error { color: var(--danger); }
.update-head, .update-release { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 14px; }
.update-head h2 { margin-bottom: 4px; }
.update-head p, .update-state p, .update-release p { margin: 0; color: var(--subtle); font-size: 11px; line-height: 1.5; }
.update-state { display: grid; grid-template-columns: 7px minmax(0, 1fr); align-items: center; gap: 11px; margin-top: 14px; padding: 11px 12px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface-raised); }
.update-state i { width: 7px; height: 7px; border-radius: 50%; background: var(--muted); }
.update-state.is-available i, .update-state.is-upToDate i { background: var(--accent); }
.update-state.is-checking i, .update-state.is-downloading i, .update-state.is-installing i { background: var(--warning); }
.update-state.is-failed i { background: var(--danger); }
.update-state strong, .update-release strong { color: var(--ink); font-size: 12px; }
.update-card progress { width: 100%; height: 6px; margin-top: 10px; accent-color: var(--accent); }
.update-release { margin-top: 10px; padding: 11px 12px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface-raised); }
.diagnostic-note { display: grid; gap: 6px; margin: 10px 0; font-size: 12px; color: var(--muted); }
.diagnostic-note em { font-style: normal; color: var(--subtle); }
.diagnostic-note textarea { width: 100%; min-height: 68px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); color: var(--ink); font: inherit; resize: vertical; }
.diagnostic-note small { color: var(--subtle); font-size: 11px; }
.diagnostic-done { display: grid; gap: 4px; margin-top: 10px; padding: 10px 12px; border: 1px solid rgba(125,163,62,.34); border-radius: 10px; background: rgba(125,163,62,.1); color: var(--ink); font-size: 12px; }
.diagnostic-done strong { display: inline-flex; align-items: center; gap: 6px; color: #b9da77; }
.diagnostic-done code { font-family: var(--font-mono); font-size: 11px; }
.diagnostic-done-note { color: var(--muted); }
.section-heading-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.section-heading-row h2 { margin-bottom: 14px; }
.identify-button { flex: 0 0 auto; }
.device-alert { margin: 0 0 10px; }
.account-card h2 { margin-bottom: 10px; }
.account-strip {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  min-height: 58px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
}
.account-avatar { display: grid; width: 36px; height: 36px; flex: 0 0 36px; place-items: center; border-radius: 9px; background: var(--accent-soft); color: var(--accent); font-family: var(--font-mono); font-size: 15px; font-weight: 700; }
.account-meta { display: grid; min-width: 0; gap: 1px; flex: 1; }
.account-meta strong { overflow: hidden; color: var(--ink); font-family: var(--font-mono); font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.account-meta span { overflow: hidden; color: var(--subtle); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.account-state { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; white-space: nowrap; }
.account-state.on { color: var(--accent); }
.account-state .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
/* Deliberately the same surface, radius, gap and type scale as `.source-row`
   above: these two cards sit one under the other and describe the same
   devices, so they have to read as one system rather than two. */
.release-teaser { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.update-progress { display: grid; gap: 7px; margin-top: 14px; }
.progress-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; color: var(--ink); font-size: 13px; }
.progress-head span { color: var(--accent); font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.progress-track { height: 6px; overflow: hidden; border-radius: 3px; background: rgba(232, 238, 244, .1); }
.progress-track i { display: block; height: 100%; border-radius: 3px; background: var(--accent); transition: width 220ms ease; }
/* 拿不到总大小时用一条来回跑的条，而不是假装一个百分比。 */
.progress-track i.indeterminate { width: 40%; animation: progress-slide 1.2s ease-in-out infinite; }
@keyframes progress-slide {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(250%); }
}
@media (prefers-reduced-motion: reduce) {
  .progress-track i.indeterminate { animation: none; width: 100%; opacity: .5; }
}
.progress-note { margin: 10px 0 0; color: var(--muted); font-size: 12px; line-height: 1.7; }
.progress-note.bad { color: var(--danger); }
.modal-sub { margin: 0 0 10px; color: var(--muted); font-size: 12px; }
.release-notes {
  margin: 0;
  padding: 14px 16px;
  max-height: 46vh;
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
  color: var(--ink);
  font-family: var(--font-sans);
  font-size: 12.5px;
  line-height: 1.85;
  white-space: pre-wrap;
  word-break: break-word;
}

.mcp-handoff { margin-bottom: var(--space-4); }
.mcp-handoff .mcp-config { max-height: 200px; overflow: auto; white-space: pre-wrap; font-size: 11.5px; line-height: 1.75; }
.mcp-handoff .inline-actions { margin-top: 10px; }
.mcp-tools { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: var(--space-2); margin-bottom: var(--space-3); }
.mcp-tool { display: grid; gap: 2px; padding: 9px 11px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface-raised); min-width: 0; }
.mcp-tool code { color: var(--ink); font-family: var(--font-mono); font-size: 12px; }
.mcp-tool span { color: var(--muted); font-size: 11px; }
.mcp-sub { margin: 0 0 6px; color: var(--muted); font-size: 12px; }
.mcp-config { margin: 0; padding: 12px 14px; overflow-x: auto; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface-raised); color: var(--ink); font-family: var(--font-mono); font-size: 12px; line-height: 1.6; }

.capability-board { display: grid; gap: var(--space-3); }
.capability-legend { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 0; color: var(--muted); font-size: 12px; }
.legend-item { display: inline-flex; align-items: center; gap: 6px; }
.lamp { width: 8px; height: 8px; flex: 0 0 8px; border-radius: 50%; background: var(--subtle); }
.lamp.on { background: #7da33e; box-shadow: 0 0 0 3px rgba(125,163,62,.16); }
.lamp.pending { background: #f5c33b; box-shadow: 0 0 0 3px rgba(245,195,59,.14); }
.lamp.off { background: rgba(232,238,244,.18); }

.capability-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(196px, 1fr));
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}
.capability-cell {
  display: grid;
  align-content: start;
  gap: 3px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
  min-width: 0;
}
.capability-cell.off { opacity: .62; }
.cell-head { display: flex; align-items: center; gap: 7px; min-width: 0; }
.cell-head strong { overflow: hidden; color: var(--ink); font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.cell-detail { color: var(--muted); font-size: 11px; }
.cell-note { color: var(--subtle); font-size: 11px; line-height: 1.5; }
@media (max-width: 720px) { .capability-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); } }
.capability-heading {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0 0 var(--space-2);
  color: var(--ink);
  font-size: 13px;
  font-weight: 700;
}
.capability-heading em {
  padding: 1px 8px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface-raised);
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 11px;
  font-style: normal;
  font-weight: 400;
}
.capability-list { display: grid; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
.capability-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
}
.capability-copy { display: grid; gap: 1px; min-width: 0; flex: 1; }
.capability-copy strong { color: var(--ink); font-size: 13px; font-weight: 400; }
.capability-copy span { color: var(--subtle); font-size: 11px; overflow-wrap: anywhere; }
.capability-empty {
  padding: 8px 10px;
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius-sm);
  color: var(--subtle);
  font-size: 12px;
}
.capability-checked { color: var(--muted); font-size: 12px; white-space: nowrap; }
.capability-yes { color: var(--accent); flex: 0 0 auto; }
.capability-no { color: var(--faint); flex: 0 0 auto; }
.capability-pending { color: var(--warning); flex: 0 0 auto; }
.capability-why { color: var(--subtle); font-size: 10px; line-height: 1.5; }
.probe-diagnostics { margin-top: 16px; }
.probe-diagnostics > summary { color: var(--muted); font-size: 12px; cursor: pointer; }
.probe-diagnostics ul { margin: 8px 0 0; padding-left: 18px; }
.probe-diagnostics li,
.probe-selfcheck { color: var(--muted); font-size: 11px; line-height: 1.7; overflow-wrap: anywhere; }
.device-empty { display: flex; align-items: center; gap: 7px; min-height: 60px; padding: 10px; border: 1px dashed var(--line-strong); border-radius: var(--radius-sm); color: var(--muted); font-size: 12px; }
.two-col { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); gap: 14px; align-items: start; }
/* 成对的两块卡片等高对齐；高度由内容较多的一块决定，而不是被第三块撑开。 */
.two-col.paired { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: stretch; }
.one-col { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; }
.wide-panels { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
.three-col { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.two-col > *, .three-col > * { min-width: 0; }

/* 认证方式 */
.auth-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.auth-card {
  display: grid;
  gap: 12px;
  align-content: start;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface-raised);
  transition: border-color 140ms ease;
}
.auth-card.current { border-color: rgba(205, 220, 124, .30); }
.auth-head { display: flex; align-items: flex-start; gap: 10px; min-width: 0; }
.auth-icon {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--warning);
}
.auth-card.current .auth-icon { color: var(--accent); }
.auth-head strong { display: block; font-size: 13px; margin-bottom: 3px; color: var(--ink); }
.auth-head p { margin: 0; color: var(--subtle); font-size: 11px; line-height: 1.5; }
.auth-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 34px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--surface);
  color: var(--muted);
  font-size: 12px;
  cursor: pointer;
  transition: all 140ms ease;
}
.auth-action:hover:not(:disabled) { color: var(--accent); border-color: var(--accent); }
.auth-action:disabled { opacity: .5; cursor: not-allowed; }
.auth-action.is-current { border-color: rgba(205, 220, 124, .35); background: var(--accent-soft); color: var(--accent); font-weight: 600; }
.hint-line { display: inline-flex; align-items: center; gap: 6px; margin: 12px 0 0; color: var(--muted); font-size: 12px; }
.hint-line.ok { color: var(--accent); }
.hint-line.ok svg { color: var(--accent); }

/* 账户与区域 */
.kv-list { display: grid; }
.kv-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 36px;
  padding: 6px 0;
  border-bottom: 1px solid var(--line);
}
.kv-row:last-child { border-bottom: 0; }
.kv-label { flex: 0 0 96px; color: var(--muted); font-size: 12px; }
.kv-value { flex: 1; min-width: 0; color: var(--ink); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kv-value.mono { font-family: var(--font-mono); font-size: 12px; }
.kv-btn {
  padding: 5px 14px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface-raised);
  color: var(--accent);
  font-size: 12px;
  cursor: pointer;
}
.kv-btn:hover:not(:disabled) { border-color: var(--accent); }

/* 数据来源 */
.source-list { display: grid; gap: 8px; }
.source-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
}
.source-icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  border-radius: 9px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--muted);
}
.source-icon :deep(.device-visual) { width: 36px; max-width: 100%; height: 36px; max-height: 100%; min-width: 0; min-height: 0; flex: 0 0 36px; border: 0; border-radius: 9px; background: transparent; }
.source-icon :deep(.device-visual img) { padding: 3px; }
.source-copy { flex: 1; min-width: 0; display: grid; gap: 1px; }
.source-copy strong { font-size: 13px; color: var(--ink); }
.source-copy span { color: var(--subtle); font-size: 11px; }
.source-copy span + span { font-family: var(--font-mono); font-size: 10px; }
.source-state { display: inline-flex; align-items: center; gap: 5px; color: var(--subtle); font-size: 12px; }
.source-state .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--subtle); }
.source-state.on { color: var(--accent); }
.source-state.on .dot { background: var(--accent); }
.source-list-loading { opacity: .65; }
.skeleton-row { min-height: 58px; background: linear-gradient(90deg, var(--surface-raised), var(--surface-hover), var(--surface-raised)); background-size: 200% 100%; animation: device-shimmer 1.4s ease-in-out infinite; }
@keyframes device-shimmer { from { background-position: 0 0; } to { background-position: -200% 0; } }

/* 开关与字段 */
.toggle-list { display: grid; }
.toggle-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 52px;
  padding: 8px 0;
  border-bottom: 1px solid var(--line);
}
.toggle-row:last-child { border-bottom: 0; }
.toggle-icon {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  flex: 0 0 26px;
  border-radius: 7px;
  border: 1px solid var(--line);
  background: var(--surface-raised);
  color: var(--accent);
}
.toggle-copy { flex: 1; min-width: 0; display: grid; gap: 1px; }
.toggle-copy strong { font-size: 12px; color: var(--ink); }
.toggle-copy span { color: var(--subtle); font-size: 11px; }
.switch { width: 42px; height: 24px; flex: 0 0 42px; padding: 2px; border: 1px solid var(--line-strong); border-radius: 999px; background: var(--surface-raised); cursor: pointer; }
.switch span { display: block; width: 18px; height: 18px; border-radius: 50%; background: var(--muted); transition: transform 150ms ease, background-color 150ms ease; }
.switch[aria-checked='true'] { border-color: var(--accent); background: var(--accent-soft); }
.switch[aria-checked='true'] span { transform: translateX(18px); background: var(--accent); }

.privacy-link-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  padding: 6px 0;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  cursor: pointer;
  transition: color 140ms ease;
}
.privacy-link-btn:hover { color: var(--accent); }
.diagnostic-panel { display: grid; gap: 7px; margin-top: 12px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: rgba(255,255,255,.025); }
.diagnostic-panel strong { color: var(--ink); font-size: 12px; }
.diagnostic-panel p { margin: 0; color: var(--subtle); font-size: 11px; line-height: 1.55; }
.diagnostic-panel .button { justify-self: start; }

.field-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 44px;
  padding: 6px 0;
}
/* 这些下拉现在是 SelectMenu，不是原生 select；宽度在这里定，其余样式在组件里。 */
.field-row .select-menu { min-width: 180px; flex: 0 0 auto; }
.retain-note { margin: 6px 0 8px; color: var(--muted); font-size: 12px; line-height: 1.6; }
.inline-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.button { display: inline-flex; min-height: 32px; align-items: center; justify-content: center; gap: 6px; padding: 5px 14px; border: 1px solid transparent; border-radius: 9px; background: transparent; font-size: 12px; cursor: pointer; }
.button:disabled { opacity: .5; cursor: not-allowed; }
.button.primary { background: var(--accent); color: var(--accent-ink); font-weight: 600; }
.button.secondary { border-color: var(--line-strong); color: var(--muted); background: var(--surface-raised); }
.button.secondary:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.danger-button { border-color: rgba(240, 97, 106, .35); color: var(--danger); }

/* 自动同步 */
.sync-card { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.sync-lead { display: flex; align-items: flex-start; gap: 12px; min-width: 0; }
.sync-lead h2 { margin-bottom: 4px; }
.sync-icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  border-radius: 11px;
  border: 1px solid var(--line);
  background: var(--surface-raised);
  color: var(--accent);
}
.sync-desc { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.6; }
.sync-controls { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.sync-toggle-label { color: var(--muted); font-size: 12px; }
.sync-now { min-height: 36px; border-radius: 10px; }
.interval-options { display: flex; flex-wrap: wrap; gap: 6px; }
.interval-options button { min-width: 58px; min-height: 28px; padding: 3px 10px; border: 1px solid var(--line); border-radius: 8px; background: transparent; color: var(--ink); font-size: 12px; cursor: pointer; }
.interval-options button[aria-checked='true'] { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
.interval-options.is-disabled { opacity: .5; }
.interval-options.is-disabled button { cursor: not-allowed; }

/* 高级 */
.advanced > summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; cursor: pointer; list-style: none; }
.advanced > summary::-webkit-details-marker { display: none; }
.advanced > summary span { display: grid; gap: 2px; min-width: 0; }
.advanced > summary strong { font-size: 14px; font-weight: 700; color: var(--ink); }
.advanced > summary em { color: var(--muted); font-size: 12px; font-style: normal; }
.advanced[open] > summary > svg { transform: rotate(180deg); }
.advanced-content { display: grid; gap: 16px; margin-top: 12px; border-top: 1px solid var(--line); padding-top: 12px; }
.advanced-block { display: grid; gap: 6px; }
.advanced-label { margin: 0; color: var(--ink); font-size: 13px; font-weight: 600; }
.diag-fold { border-top: 1px solid var(--line); padding-top: 8px; }
.diag-fold > summary { cursor: pointer; color: var(--muted); font-size: 12px; list-style: none; }
.diag-fold > summary::-webkit-details-marker { display: none; }
.diag-fold[open] > summary { color: var(--ink); }
.scale-options { display: flex; flex-wrap: wrap; gap: 6px; }
.scale-options button { min-width: 48px; min-height: 30px; padding: 4px 8px; border: 1px solid var(--line); border-radius: 8px; background: transparent; color: var(--ink); font-variant-numeric: tabular-nums; font-family: 'Inter', var(--font-sans); font-size: 12px; cursor: pointer; }
.scale-options button[aria-checked='true'] { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
.stream-list { display: grid; gap: 2px; margin-top: 6px; }
.stream-row { display: grid; grid-template-columns: 110px minmax(0, 1fr) auto; gap: 12px; padding: 7px 0; border-bottom: 1px solid var(--line); color: var(--muted); font-size: 12px; }
.stream-row strong { font-weight: 600; color: var(--ink); }
.alert { display: flex; align-items: flex-start; gap: 7px; padding: 9px 12px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); color: var(--muted); font-size: 12px; }
.alert.success { color: var(--accent); }
.alert.danger { color: var(--danger); }
.alert.warning { color: var(--warning); }
.alert button { margin-left: auto; border: 0; background: transparent; color: inherit; cursor: pointer; font-size: 12px; }
code { color: var(--muted); font-family: var(--font-mono); font-size: 12px; }
.manual-auth-form { margin-top: 16px; padding: 16px; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface-raised); }
.manual-auth-form h3 { margin: 0 0 8px; font-size: 14px; font-weight: 700; color: var(--ink); }
.manual-auth-form .form-hint { margin: 0 0 12px; color: var(--muted); font-size: 12px; }
.manual-auth-form .form-group { margin-bottom: 12px; }
.manual-auth-form .form-group:last-of-type { margin-bottom: 16px; }
.manual-auth-form label { display: block; margin-bottom: 4px; color: var(--ink); font-size: 12px; font-weight: 500; }
.manual-auth-form input { width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 9px; background: var(--surface); color: var(--ink); font-family: var(--font-mono); font-size: 12px; }
.manual-auth-form input:focus { outline: none; border-color: var(--accent); }
.manual-auth-form input:disabled { opacity: 0.5; cursor: not-allowed; }
.manual-auth-form .form-actions { display: flex; gap: 8px; }

/* 隐私政策弹窗 */
.modal-backdrop { position: fixed; inset: 0; z-index: 100; background: rgba(0, 0, 0, .7); display: grid; place-items: center; padding: 20px; }
.privacy-modal { max-width: 520px; width: 100%; border: 1px solid var(--line-strong); border-radius: var(--radius-md); background: var(--surface-raised); box-shadow: 0 12px 36px rgba(0, 0, 0, .5); }
.modal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; padding-bottom: 10px; border-bottom: 1px solid var(--line); }
.modal-title-row { display: flex; align-items: center; gap: 8px; }
.shield-ic { color: var(--accent); }
.close-btn { display: grid; place-items: center; width: 28px; height: 28px; border: 0; border-radius: 6px; background: transparent; color: var(--muted); cursor: pointer; }
.close-btn:hover { background: var(--surface-hover); color: var(--ink); }
.modal-body { display: grid; gap: 10px; color: var(--muted); font-size: 12px; line-height: 1.6; }
.modal-body strong { color: var(--ink); }
.modal-foot { display: flex; justify-content: flex-end; margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--line); }

@media (max-width: 1080px) {
  .three-col { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 860px) {
  .two-col { grid-template-columns: minmax(0, 1fr); }
  .auth-grid { grid-template-columns: minmax(0, 1fr); }
  .account-strip { flex-wrap: wrap; }
  .account-meta { flex: 1 1 160px; }
}
@media (prefers-reduced-motion: reduce) { .switch span { transition: none; } .skeleton-row { animation: none; } }
</style>
