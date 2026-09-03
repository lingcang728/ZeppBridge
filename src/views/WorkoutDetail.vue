<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { VChart } from '../lib/echartsSetup';
import DesignIcon, { type DesignIconName } from '../components/DesignIcon.vue';
import DeviceVisual from '../components/DeviceVisual.vue';
import EmptyState from '../components/EmptyState.vue';
import InsightCard from '../components/InsightCard.vue';
import Icon from '../components/Icon.vue';
import SelectMenu from '../components/SelectMenu.vue';
import SkeletonBlock from '../components/SkeletonBlock.vue';
import { useAiHandoff } from '../composables/useAiHandoff';
import { useSyncController } from '../composables/useSyncController';
import { isTauri, tauriApi, toUserMessage } from '../composables/useTauriApi';
import { AI_PROVIDERS, AI_PROVIDER_BY_ID, type AiProviderId } from '../lib/aiProviders';
import { dataProviderLabel, dataScopeLabel, workoutLabel } from '../lib/labels';
import { formatDate, formatDistance, formatTime, isFiniteNumber } from '../lib/format';
import {
  elevationUnitLabel,
  paceAxisLabel,
  paceMinutesPerBigUnit,
  paceUnitLabel,
  toElevation,
} from '../lib/units';
import { zeppSemanticColors } from '../lib/echartsTheme';
import { formatPaceSeconds } from '../lib/metricSeries';
import { workoutDisplayLabel, workoutDisplayType } from '../lib/workouts';
import { deviceImageFor } from '../lib/deviceCatalog';
import type { DeviceProfile, SportOption, Workout, WorkoutInsight, WorkoutSeries, WorkoutSeriesSample, WorkoutRoutePoint } from '../types';
import { defineMessages, intlLocale, useMessages } from '../i18n';

const messages = defineMessages(
  {
    notProvided: '未提供',
    backToRecent: '返回最近记录',
    loadFailedTitle: '无法读取这条运动',
    loadFailed: '训练数据包详情暂时不可用',
    retry: '重试',
    notFoundTitle: '找不到这条运动记录',
    notFoundMessage: '它可能已被清理，或尚未同步到本机。',
    insightFailed: '无法生成本次运动的洞察',
    thisWorkout: '这次运动',
    aiPrompt: (label: string) => `你是一位专业的运动分析师。下面是我一次${label}的完整记录（来自 ZeppBridge 本机数据库，已脱敏）。
请只基于这条记录里的事实分析这次训练：强度、配速与心率的关系、是否有明显的掉速或异常段落，并给出下一次的具体建议。

约束：
- 这份数据里没有任何人群基准，不要拿我和「一般健康人群」或任何平均水平比较；
- 缺失的项直接说缺失，不要用 0 或估算值填补；
- 不做医学诊断、疾病风险判断或治疗建议。

请以 Markdown 格式输出。`,
    needDesktop: 'AI 交接需要桌面应用环境；当前网页预览不会打开外部网站。',
    attachmentOpened: (provider: string) =>
      `数据包已导出到桌面（zeppbridge-ai-handoff.json），拖入 ${provider} 即可；提示词已复制。`,
    attachmentNotOpened: (provider: string) =>
      `数据包已导出到桌面（zeppbridge-ai-handoff.json）；提示词已复制，可手动打开 ${provider}。`,
    copiedAndOpened: (provider: string) => `已复制这条运动的脱敏数据并打开 ${provider}，粘贴即可。`,
    copiedOnly: (provider: string) => `已复制这条运动的脱敏数据，可手动打开 ${provider} 粘贴。`,
    noCorrection: '不纠正',
    deviceNameMissing: '设备名称未提供',
    notFetchedYet: '尚未获取',
    timeUnknown: '时间未知',
    overrideSaved: '已保存本地运动类型纠正。',
    overrideCleared: '已清除纠正，恢复 ZeppBridge 识别结果。',
    overrideFailed: '保存运动类型纠正失败',
    copied: (format: string) => `已复制 ${format} 数据到剪贴板。`,
    copyFailed: '复制这条记录失败',

    metricDistance: '距离',
    metricDuration: '运动时间',
    metricAvgHr: '平均心率',
    metricAvgPace: '平均配速',
    metricAscent: '累计爬升',
    metricTrainingLoad: '训练负荷',

    statFastest: '最快',
    statAverage: '平均',
    statSlowest: '最慢',
    statMin: '最小',
    statMax: '最大',

    chartHeart: '心率',
    chartPace: '配速',
    chartAltitude: '海拔',
    chartCadence: '步频',
    chartAria: (title: string) => `${title}曲线`,

    decodedRoutePoints: 'GPS 轨迹点',
    decodedSamples: '时序样本',
    decodedPauses: '暂停区间',
    decodedAvgCadence: '平均步频',
    decodedMaxCadence: '最高步频',
    decodedAvgStride: '平均步幅',
    decodedDescent: '累计下降',
    decodedMaxHr: '最大心率',
    decodedAvgPower: '平均功率',
    decodedMaxPower: '最大功率',
    decodedGroundContact: '平均触地时间',
    decodedVerticalOscillation: '平均垂直振幅',
    decodedVerticalRatio: '垂直步幅比',
    decodedBestEquivalentPace: '最佳等效配速',

    heroAria: '训练概览',
    decodedLocally: '本地已解码',
    typeEvidenceAria: '运动类型判定',
    zeppRawCode: (code: string) => `Zepp 原始编号：${code}`,
    zeppBridgeMatch: (label: string) => `ZeppBridge 识别：${label}`,
    customName: (code: string, name: string) => `你给编号 ${code} 起的名字：${name}`,
    myCorrection: '我的纠正',
    correctionAria: '我对这条运动类型的纠正',
    metricListAria: '运动表现总结',

    routeAria: 'GPS 全轨迹',
    routeTitle: 'GPS 全轨迹',
    routeNote: '本地画布 · 不请求地图瓦片',
    routeSvgAria: '按时间与最近配速样本着色的本地 GPS 轨迹',
    routeLegendPace: (count: number) => `有效配速 ${count} 点 · P10–P90`,
    routeLegendNoPace: '有效配速不足 3 个 · 未按速度着色',
    legendFast: '快',
    legendSteady: '稳定',
    legendWarm: '偏慢',
    legendSlow: '慢',
    routeEmptyTitle: '没有可用轨迹',
    routeEmptyBody: '本次记录没有足够的 GPS 点，因此不画路线。',
    chartsEmptyTitle: '暂无逐点曲线',
    chartsEmptyBody: '本次未同步心率、配速、海拔或步频序列。',

    hrZonesAria: '心率区间分布',
    hrZonesTitle: '心率区间分布',
    hrZonesNote: '区间边界来自你在手表上的设定，由 Zepp 随这条运动一起下发；ZeppBridge 没有重新划分。训练状态页那套自选区间模型是另一回事，两边的数字对不上属于正常。',
    hrZoneBelow: (upper: number) => `${upper} 以下`,
    hrZoneBetween: (low: number, high: number) => `${low}–${high}`,
    hrZoneShare: (percent: string) => `${percent}%`,
    hrZoneTotal: (duration: string) => `有心率的时长合计 ${duration}`,
    hrZoneBarAria: '各心率区间的时长占比',
    decodedAria: '已解码参数',
    decodedTitle: '已解码参数',
    decodedNote: '摘要只从本条记录的有效样本计算，异常跳点会被忽略。',

    exportAria: '导出与分享',
    exportTitle: '导出与分享',
    exportSub: '复制本地解码后的结构化数据，不访问地图服务。',
    exportFormatAria: '导出格式',
    exportGo: (format: string) => `复制 ${format} 数据`,

    handoffAria: '交给 AI',
    handoffTitle: '交给 AI',
    handoffSub: '只把这一条运动的脱敏数据和提示词复制到剪贴板，并打开你选的 AI 网站。按天记录的睡眠、步数不在范围内。',
    handoffTarget: '目标工具',
    handoffTargetAria: '交给哪个 AI 工具',
    preparing: '正在准备…',
    handTo: (provider: string) => `交给 ${provider}`,

    provenanceAria: '来源信息',
    provenanceTitle: '来源信息',
    provenanceProvider: '数据来源',
    provenanceScope: '数据范围',
    provenanceSynced: '最近同步',
    provenanceRecordId: '记录 ID',
    provenanceDevice: '设备',
    pageFoot: '数据在本机解码；轨迹使用本地画布，不会发送给地图服务。',
  },
  {
    notProvided: 'Not provided',
    backToRecent: 'Back to recent records',
    loadFailedTitle: 'Could not read this workout',
    loadFailed: 'Workout detail is unavailable right now',
    retry: 'Try again',
    notFoundTitle: 'This workout is not here',
    notFoundMessage: 'It may have been cleaned up, or it has not been synced to this machine yet.',
    insightFailed: 'Could not build an insight for this workout',
    thisWorkout: 'workout',
    aiPrompt: (label: string) => `You are a sports analyst. Below is the complete record of one ${label} of mine, taken from the ZeppBridge local database and de-identified.
Analyze this session using only the facts in this record: the intensity, how pace relates to heart rate, whether there is a clear slowdown or an anomalous stretch, and what specifically to do differently next time.

Constraints:
- There is no population baseline in this data. Do not compare me to "healthy adults" or to any average.
- Where something is missing, say it is missing. Never fill the gap with a zero or an estimate.
- No medical diagnosis, no disease-risk judgement, no treatment advice.

Answer in Markdown.`,
    needDesktop: 'The AI hand-off needs the desktop app; this browser preview will not open external sites.',
    attachmentOpened: (provider: string) =>
      `The data package was written to your desktop (zeppbridge-ai-handoff.json) — drag it into ${provider}. The prompt is on your clipboard.`,
    attachmentNotOpened: (provider: string) =>
      `The data package was written to your desktop (zeppbridge-ai-handoff.json). The prompt is on your clipboard; open ${provider} yourself.`,
    copiedAndOpened: (provider: string) => `De-identified data for this workout copied and ${provider} opened. Paste it in.`,
    copiedOnly: (provider: string) => `De-identified data for this workout copied. Open ${provider} yourself and paste it in.`,
    noCorrection: 'No correction',
    deviceNameMissing: 'Device name not provided',
    notFetchedYet: 'Not fetched yet',
    timeUnknown: 'Time unknown',
    overrideSaved: 'Workout type correction saved locally.',
    overrideCleared: "Correction cleared. Back to ZeppBridge's own match.",
    overrideFailed: 'Could not save the workout type correction',
    copied: (format: string) => `${format} data copied to the clipboard.`,
    copyFailed: 'Could not copy this record',

    metricDistance: 'Distance',
    metricDuration: 'Moving time',
    metricAvgHr: 'Avg heart rate',
    metricAvgPace: 'Avg pace',
    metricAscent: 'Ascent',
    metricTrainingLoad: 'Training load',

    statFastest: 'Fastest',
    statAverage: 'Avg',
    statSlowest: 'Slowest',
    statMin: 'Min',
    statMax: 'Max',

    chartHeart: 'Heart rate',
    chartPace: 'Pace',
    chartAltitude: 'Altitude',
    chartCadence: 'Cadence',
    chartAria: (title: string) => `${title} over the session`,

    decodedRoutePoints: 'GPS track points',
    decodedSamples: 'Time series samples',
    decodedPauses: 'Pause intervals',
    decodedAvgCadence: 'Avg cadence',
    decodedMaxCadence: 'Max cadence',
    decodedAvgStride: 'Avg stride',
    decodedDescent: 'Descent',
    decodedMaxHr: 'Max heart rate',
    decodedAvgPower: 'Avg power',
    decodedMaxPower: 'Max power',
    decodedGroundContact: 'Avg ground contact',
    decodedVerticalOscillation: 'Avg vertical oscillation',
    decodedVerticalRatio: 'Vertical ratio',
    decodedBestEquivalentPace: 'Best equivalent pace',

    heroAria: 'Workout overview',
    decodedLocally: 'Decoded locally',
    typeEvidenceAria: 'How the workout type was decided',
    zeppRawCode: (code: string) => `Zepp raw code: ${code}`,
    zeppBridgeMatch: (label: string) => `ZeppBridge reads it as: ${label}`,
    customName: (code: string, name: string) => `Your name for code ${code}: ${name}`,
    myCorrection: 'My correction',
    correctionAria: 'My correction for this workout type',
    metricListAria: 'Workout performance summary',

    routeAria: 'Full GPS track',
    routeTitle: 'Full GPS track',
    routeNote: 'Drawn locally · no map tiles requested',
    routeSvgAria: 'Local GPS track colored by time and the nearest pace sample',
    routeLegendPace: (count: number) => `${count} valid pace points · P10–P90`,
    routeLegendNoPace: 'Fewer than 3 valid pace points · not colored by speed',
    legendFast: 'Fast',
    legendSteady: 'Steady',
    legendWarm: 'Slower',
    legendSlow: 'Slow',
    routeEmptyTitle: 'No usable track',
    routeEmptyBody: 'This record does not carry enough GPS points, so no route is drawn.',
    chartsEmptyTitle: 'No per-point curves',
    chartsEmptyBody: 'No heart rate, pace, altitude or cadence series was synced for this session.',

    hrZonesAria: 'Heart rate zones',
    hrZonesTitle: 'Heart rate zones',
    hrZonesNote: 'The zone boundaries come from your own settings on the watch and are sent down by Zepp with this workout; ZeppBridge does not re-cut them. The Training Status page uses a separate model you pick yourself, so the two sets of numbers will not agree.',
    hrZoneBelow: (upper: number) => `Below ${upper}`,
    hrZoneBetween: (low: number, high: number) => `${low}-${high}`,
    hrZoneShare: (percent: string) => `${percent}%`,
    hrZoneTotal: (duration: string) => `${duration} with heart rate`,
    hrZoneBarAria: 'Share of time spent in each heart rate zone',
    decodedAria: 'Decoded values',
    decodedTitle: 'Decoded values',
    decodedNote: 'The summary is computed only from valid samples in this record; anomalous jumps are ignored.',

    exportAria: 'Export and share',
    exportTitle: 'Export and share',
    exportSub: 'Copy the locally decoded structured data. No map service is contacted.',
    exportFormatAria: 'Export format',
    exportGo: (format: string) => `Copy ${format} data`,

    handoffAria: 'Hand to AI',
    handoffTitle: 'Hand to AI',
    handoffSub: 'Copies the de-identified data for this one workout, plus the prompt, and opens the AI site you pick. Day-level streams such as sleep and steps stay out.',
    handoffTarget: 'Target tool',
    handoffTargetAria: 'Which AI tool to hand it to',
    preparing: 'Preparing…',
    handTo: (provider: string) => `Hand to ${provider}`,

    provenanceAria: 'Provenance',
    provenanceTitle: 'Provenance',
    provenanceProvider: 'Provider',
    provenanceScope: 'Scope',
    provenanceSynced: 'Last synced',
    provenanceRecordId: 'Record ID',
    provenanceDevice: 'Device',
    pageFoot: 'Decoded on this machine. The track is drawn on a local canvas and never sent to a map service.',
  },
);
const t = useMessages(messages);

type WorkoutMetrics = Workout & {
  pace?: number | string | null;
  duration_minutes?: number | null;
};

interface RouteCanvasPoint extends WorkoutRoutePoint {
  x: number;
  y: number;
  pace: number | null;
  paceDelta: number | null;
  paused: boolean;
}

interface RouteSegment {
  d: string;
  color: string;
  from: RouteCanvasPoint;
  to: RouteCanvasPoint;
}

interface GhostRoad {
  d: string;
  opacity: number;
}

interface ChartStat {
  label: string;
  value: string;
}

const route = useRoute();
const { appStatus, dataRevision } = useSyncController();
const workout = ref<WorkoutMetrics | null>(null);
const series = ref<WorkoutSeries | null>(null);
const device = ref<DeviceProfile>({});
const loading = ref(true);
const error = ref<string | null>(null);
const actionError = ref<string | null>(null);
const exportedNote = ref<string | null>(null);
const activeFormat = ref<'json' | 'csv' | 'gpx'>('json');
const workoutId = computed(() => String(route.params.workoutId || ''));
const displayType = computed(() => workout.value ? workoutDisplayType(workout.value) : 'unknown');
const insight = ref<WorkoutInsight | null>(null);
const insightLoading = ref(false);
const insightError = ref<string | null>(null);

const loadInsight = async (id: string) => {
  if (!isTauri()) return;
  insightLoading.value = true;
  insightError.value = null;
  try {
    insight.value = await tauriApi.getWorkoutInsight(id);
  } catch (error) {
    insight.value = null;
    insightError.value = toUserMessage(error, t.value.insightFailed);
  } finally {
    insightLoading.value = false;
  }
};

/* 「交给 AI」就在这一页完成，不再把用户丢回「交给 AI」大页面再让他确认一遍
   范围。范围就是这一条运动，走的是和导出同一套互斥 ExportScope，所以洞察、
   导出和 AI 数据包读的是同一个库、同一套规则。 */
const { handoffState, handoffError, prepareAndCopy } = useAiHandoff();
const aiProviderId = ref<AiProviderId>('chatgpt');
const aiProvider = computed(() => AI_PROVIDER_BY_ID[aiProviderId.value]);
const aiProviderChoices = computed(() =>
  AI_PROVIDERS.map((provider) => ({ value: provider.id, label: provider.label })));
const aiNote = ref<string | null>(null);

const workoutAiPrompt = computed(() => {
  const label = workout.value ? workoutDisplayLabel(workout.value) : t.value.thisWorkout;
  return t.value.aiPrompt(label);
});

const sendWorkoutToAi = async () => {
  aiNote.value = null;
  if (!workout.value) return;
  if (!isTauri()) {
    aiNote.value = t.value.needDesktop;
    return;
  }
  try {
    const result = await prepareAndCopy(
      aiProvider.value,
      {
        scope: { kind: 'workout', workoutId: workout.value.workout_id },
        dataTypes: ['workouts', 'heart_rate'],
        detail: 'full',
      },
      workoutAiPrompt.value,
      false, // 精确轨迹默认不外发
    );
    const opened = handoffState.value !== 'copied_only';
    if (result.mode === 'attachment') {
      aiNote.value = opened
        ? t.value.attachmentOpened(aiProvider.value.label)
        : t.value.attachmentNotOpened(aiProvider.value.label);
    } else {
      aiNote.value = opened
        ? t.value.copiedAndOpened(aiProvider.value.label)
        : t.value.copiedOnly(aiProvider.value.label);
    }
  } catch {
    // 错误从 handoffError 渲染
  }
};

const openAiHandoff = () => { void sendWorkoutToAi(); };

const typeOverrideBusy = ref(false);
/* 纠正选项直接来自随包运动目录（一百多项），不是一份写死的短名单：目录里有
   「壁球」而名单里没有，用户就永远改不成它。目录被 include_str! 编进二进制，
   所以这里和后端的允许值天然一致。 */
const typeOverrideOptions = ref<SportOption[]>([]);
const typeOverrideChoices = computed(() => [
  { value: '', label: t.value.noCorrection },
  // 后端发来的 label 是中文（那份列表也给 CLI 用），界面按 key 自己查名字。
  //
  // 排序也得在这里做。后端那份是按**中文名**排好的（`sport_catalog::options()`），
  // 英文界面拿着它按 key 换完名字之后，顺序仍然是中文拼音序——一百多项里找
  // 「Squash」，得从头翻到尾。按真正显示出来的那串字排。
  ...typeOverrideOptions.value
    .map((option) => ({ value: option.key, label: workoutLabel(option.key) }))
    .sort((a, b) => a.label.localeCompare(b.label, intlLocale())),
]);

const durationMinutes = computed(() => {
  const item = workout.value;
  if (!item) return null;
  if (isFiniteNumber(item.duration_minutes) && item.duration_minutes >= 0) return item.duration_minutes;
  const start = new Date(item.start_time).getTime();
  const end = new Date(item.end_time).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? (end - start) / 60_000 : null;
});

const formatClock = (minutes?: number | null): string => {
  if (!isFiniteNumber(minutes) || minutes < 0) return t.value.notProvided;
  const totalSeconds = Math.round(minutes * 60);
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
};

/** 入参是每公里分钟；显示时跟随当前距离单位。 */
const paceClock = (minutesPerKm?: number | null): string => {
  if (!isFiniteNumber(minutesPerKm) || minutesPerKm <= 0) return t.value.notProvided;
  const totalSeconds = Math.round(paceMinutesPerBigUnit(minutesPerKm) * 60);
  return `${Math.floor(totalSeconds / 60)}'${String(totalSeconds % 60).padStart(2, '0')}"`;
};

const paceText = (minutes?: number | null): string => {
  const clock = paceClock(minutes);
  return clock === t.value.notProvided ? clock : `${clock} ${paceUnitLabel()}`;
};

const distanceLabel = computed(() => formatDistance(workout.value?.distance_meters, t.value.notProvided));
const rawPace = computed(() => workout.value?.pace);
const paceLabel = computed(() => {
  if (typeof rawPace.value === 'string' && rawPace.value.trim()) return rawPace.value.trim();
  if (isFiniteNumber(rawPace.value)) return paceText(rawPace.value);
  return t.value.notProvided;
});

const numberValue = (value: unknown, digits = 0): string => isFiniteNumber(value)
  ? value.toLocaleString(intlLocale(), { minimumFractionDigits: digits, maximumFractionDigits: digits })
  : t.value.notProvided;

/* 同上：只看 key，不看显示名——名字跟着界面语言变，图标不该跟着变。 */
const workoutArt = computed<DesignIconName>(() => {
  const key = displayType.value.toLowerCase();
  return /cycl|ride|bike|bmx|spinning/.test(key) ? 'outdoor-cycling' : 'outdoor-run';
});
const deviceName = computed(() => device.value.canonical_name || device.value.name || t.value.deviceNameMissing);
/* 这张图必须跟着这条记录**实际**是哪台表走。
   以前这里硬写死了一张 T-Rex 3：戴 Balance 的人打开自己的记录，看到的是别人的表。 */
const deviceImage = computed(() => deviceImageFor(device.value.kind, device.value.image_key));
const deviceKind = computed(() => device.value.kind || 'unknown');

const heroMetrics = computed(() => {
  const item = workout.value;
  if (!item) return [];
  const summary = series.value?.summary;
  const resolvedPace = paceLabel.value !== t.value.notProvided ? paceLabel.value : paceText(summary?.average_pace);
  return [
    { label: t.value.metricDistance, value: distanceLabel.value, tone: 'distance', icon: 'outdoor-run' as DesignIconName },
    { label: t.value.metricDuration, value: formatClock(durationMinutes.value), tone: 'training', icon: 'auto-sync' as DesignIconName },
    { label: t.value.metricAvgHr, value: numberValue(item.avg_hr), unit: isFiniteNumber(item.avg_hr) ? 'bpm' : undefined, tone: 'heart', icon: 'heart-rate' as DesignIconName },
    { label: t.value.metricAvgPace, value: resolvedPace, tone: 'pace', icon: 'body-activity' as DesignIconName },
    { label: t.value.metricAscent, value: isFiniteNumber(summary?.elevation_gain_m) ? numberValue(toElevation(summary.elevation_gain_m)) : t.value.notProvided, unit: isFiniteNumber(summary?.elevation_gain_m) ? elevationUnitLabel() : undefined, tone: 'altitude', icon: 'health-watch' as DesignIconName },
    { label: 'VO₂ Max', value: numberValue(item.vo2max), tone: 'vo2', icon: 'vo2-max' as DesignIconName },
    { label: t.value.metricTrainingLoad, value: numberValue(item.training_load), tone: 'training', icon: 'training-load' as DesignIconName },
  ];
});

const downsample = <T,>(items: T[], max = 800): T[] => {
  if (items.length <= max) return items;
  const step = Math.ceil(items.length / max);
  const sampled = items.filter((_, index) => index % step === 0);
  const last = items[items.length - 1];
  if (sampled[sampled.length - 1] !== last) sampled.push(last);
  return sampled;
};

const rawRoute = computed(() => [...(series.value?.route ?? [])].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()));
const routePoints = computed(() => downsample(rawRoute.value));

const samplesByTime = computed(() => [...(series.value?.samples ?? [])]
  .map((sample) => ({ sample, time: new Date(sample.timestamp).getTime() }))
  .filter((item) => Number.isFinite(item.time))
  .sort((a, b) => a.time - b.time));

const pauses = computed(() => (series.value?.pauses ?? []).map((pause) => ({
  start: new Date(pause.start_time).getTime(),
  end: new Date(pause.end_time).getTime(),
})).filter((pause) => Number.isFinite(pause.start) && Number.isFinite(pause.end) && pause.end > pause.start));

const paceSamples = computed(() => samplesByTime.value.filter((item) => isFiniteNumber(item.sample.pace) && item.sample.pace > 0));

const nearestPace = (timestamp: number): { value: number | null; delta: number | null } => {
  const items = paceSamples.value;
  if (!items.length) return { value: null, delta: null };
  let lo = 0;
  let hi = items.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid].time < timestamp) lo = mid + 1;
    else hi = mid;
  }
  let best = items[lo];
  if (lo > 0 && Math.abs(items[lo - 1].time - timestamp) < Math.abs(best.time - timestamp)) best = items[lo - 1];
  const delta = Math.abs(best.time - timestamp);
  return delta <= 45_000 ? { value: best.sample.pace ?? null, delta } : { value: null, delta };
};

const toSvgPath = (points: Array<{ x: number; y: number }>): string => points
  .map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
  .join(' ');

const offsetPolyline = (points: Array<{ x: number; y: number }>, distance: number) => points.map((point, index) => {
  const prev = points[Math.max(0, index - 1)];
  const next = points[Math.min(points.length - 1, index + 1)];
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: point.x + (-dy / length) * distance, y: point.y + (dx / length) * distance };
});

const buildGhostRoads = (points: Array<{ x: number; y: number }>): GhostRoad[] => {
  if (points.length < 3) return [];
  const step = Math.max(1, Math.ceil(points.length / 48));
  const spine = points.filter((_, index) => index % step === 0);
  if (spine[spine.length - 1] !== points[points.length - 1]) spine.push(points[points.length - 1]);
  if (spine.length < 3) return [];
  const ghosts: GhostRoad[] = [
    { d: toSvgPath(offsetPolyline(spine, 16)), opacity: .13 },
    { d: toSvgPath(offsetPolyline(spine, -13)), opacity: .1 },
    { d: toSvgPath(offsetPolyline(spine, 30)), opacity: .07 },
    { d: toSvgPath(offsetPolyline(spine, -27)), opacity: .06 },
  ];
  for (let index = 3; index < spine.length - 3; index += 5) {
    const prev = spine[index - 1];
    const next = spine[index + 1];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const length = Math.hypot(dx, dy) || 1;
    const side = index % 10 < 5 ? 1 : -1;
    const stub = 16 + (index % 3) * 7;
    const nx = (-dy / length) * side * stub;
    const ny = (dx / length) * side * stub;
    ghosts.push({
      d: `M${spine[index].x.toFixed(1)} ${spine[index].y.toFixed(1)} L${(spine[index].x + nx).toFixed(1)} ${(spine[index].y + ny).toFixed(1)}`,
      opacity: .08,
    });
  }
  return ghosts;
};

const isPaused = (from: number, to: number): boolean => pauses.value.some((pause) => Math.max(from, pause.start) <= Math.min(to, pause.end));
const haversineMeters = (a: WorkoutRoutePoint, b: WorkoutRoutePoint): number => {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;
  const lat1 = a.latitude * rad;
  const lat2 = b.latitude * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
};

const percentile = (values: number[], ratio: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)));
  return sorted[index];
};

const routeColor = (pace: number | null, low: number, high: number, enoughPace: boolean): string => {
  if (!enoughPace || pace === null) return 'var(--route-neutral)';
  const span = Math.max(high - low, 1e-6);
  const ratio = Math.max(0, Math.min(1, (pace - low) / span));
  if (ratio <= .2) return 'var(--route-mint)';
  if (ratio <= .45) return 'var(--route-cyan)';
  if (ratio <= .72) return 'var(--route-amber)';
  return 'var(--route-coral)';
};

const routeCanvas = computed(() => {
  const points = routePoints.value;
  if (points.length < 2) return null;
  const lats = points.map((point) => point.latitude);
  const lons = points.map((point) => point.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const viewW = 1000;
  const viewH = 620;
  const midLat = (minLat + maxLat) / 2;
  const lonFactor = Math.max(Math.cos(midLat * Math.PI / 180), .2);
  const rawW = Math.max(maxLon - minLon, 1e-7) * lonFactor;
  const rawH = Math.max(maxLat - minLat, 1e-7);
  const innerW = viewW - 120;
  const innerH = viewH - 96;
  const scale = Math.min(innerW / rawW, innerH / rawH);
  const usedW = rawW * scale;
  const usedH = rawH * scale;
  const originX = (viewW - usedW) / 2;
  const originY = (viewH - usedH) / 2;
  const project = (latitude: number, longitude: number) => ({
    x: originX + (longitude - minLon) * lonFactor * scale,
    y: originY + (maxLat - latitude) * scale,
  });
  const canvasPoints: RouteCanvasPoint[] = points.map((point) => {
    const time = new Date(point.timestamp).getTime();
    const pace = nearestPace(time);
    const projected = project(point.latitude, point.longitude);
    return {
      ...point,
      x: projected.x,
      y: projected.y,
      pace: pace.value,
      paceDelta: pace.delta,
      paused: Number.isFinite(time) && pauses.value.some((pause) => time >= pause.start && time <= pause.end),
    };
  });
  const validPaces = canvasPoints.map((point) => point.pace).filter((pace): pace is number => isFiniteNumber(pace) && pace > 0 && pace < 60);
  const enoughPace = validPaces.length >= 3;
  const low = enoughPace ? percentile(validPaces, .1) : 0;
  const high = enoughPace ? percentile(validPaces, .9) : 0;
  const segments: RouteSegment[] = [];
  for (let index = 1; index < canvasPoints.length; index += 1) {
    const from = canvasPoints[index - 1];
    const to = canvasPoints[index];
    const fromTime = new Date(from.timestamp).getTime();
    const toTime = new Date(to.timestamp).getTime();
    const seconds = (toTime - fromTime) / 1000;
    const distance = haversineMeters(from, to);
    const jump = !Number.isFinite(seconds) || seconds <= 0 || seconds > 120 || distance > Math.max(500, seconds * 12 + 100);
    const paused = from.paused || to.paused || isPaused(fromTime, toTime);
    const paceMissing = enoughPace && (from.pace === null || to.pace === null || (from.paceDelta ?? Infinity) > 45_000 || (to.paceDelta ?? Infinity) > 45_000);
    if (jump || paused || paceMissing) continue;
    const pace = from.pace !== null && to.pace !== null ? (from.pace + to.pace) / 2 : null;
    segments.push({ d: `M${from.x.toFixed(1)} ${from.y.toFixed(1)} L${to.x.toFixed(1)} ${to.y.toFixed(1)}`, color: routeColor(pace, low, high, enoughPace), from, to });
  }
  const pauseMarkers = pauses.value.map((pause) => {
    const target = canvasPoints.reduce((best, point) => {
      const time = new Date(point.timestamp).getTime();
      const distance = Math.abs(time - pause.start);
      return distance < best.distance ? { point, distance } : best;
    }, { point: canvasPoints[0], distance: Infinity }).point;
    return { x: target.x, y: target.y };
  });
  return {
    viewBox: `0 0 ${viewW} ${viewH}`,
    ghosts: buildGhostRoads(canvasPoints),
    glow: toSvgPath(canvasPoints),
    segments,
    pauseMarkers,
    start: canvasPoints[0],
    end: canvasPoints[canvasPoints.length - 1],
    validPaceCount: validPaces.length,
    enoughPace,
  };
});

const sampleSeries = (key: keyof Pick<WorkoutSeriesSample, 'heart_rate' | 'pace' | 'altitude_m' | 'cadence'>) => downsample(
  (series.value?.samples ?? [])
    .map((sample) => ({ t: new Date(sample.timestamp).getTime(), v: sample[key] }))
    .filter((point): point is { t: number; v: number } => {
      if (!Number.isFinite(point.t) || !isFiniteNumber(point.v)) return false;
      if (key === 'heart_rate') return point.v >= 20 && point.v <= 250;
      if (key === 'pace') return point.v >= 1 && point.v < 60;
      if (key === 'cadence') return point.v > 0 && point.v < 300;
      return point.v >= -500 && point.v <= 10_000;
    }),
);
const heartPoints = computed(() => sampleSeries('heart_rate'));
const pacePoints = computed(() => sampleSeries('pace'));
const altitudePoints = computed(() => sampleSeries('altitude_m'));
/*
 * 图上画的那两条要跟着单位换算，采样本身不动。
 *
 * 分成两份而不是就地改 `pacePoints`：过滤条件（配速 1–60）是按公制定的，
 * 而配速那三个统计值走的是 `paceClock`，它自己已经会换算——两边都换就成了
 * 一次英里、再一次英里。
 */
const paceChartPoints = computed(() => pacePoints.value.map(
  (point) => ({ t: point.t, v: paceMinutesPerBigUnit(point.v) }),
));
const altitudeChartPoints = computed(() => altitudePoints.value.map(
  (point) => ({ t: point.t, v: toElevation(point.v) }),
));
const cadencePoints = computed(() => sampleSeries('cadence'));

const lineOption = (points: { t: number; v: number }[], color: string, unit: string) => {
  if (points.length < 2) return null;
  const avg = points.reduce((sum, p) => sum + p.v, 0) / points.length;
  return {
    animation: false,
    grid: { left: 36, right: 12, top: 12, bottom: 22, containLabel: false },
    xAxis: {
      type: 'time',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#7E856D', fontSize: 10 },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#7E856D', fontSize: 10 },
      splitLine: { show: true, lineStyle: { color: 'rgba(228, 235, 208, 0.08)', type: 'dashed' } },
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#22261A',
      borderColor: 'rgba(228, 235, 208, 0.16)',
      borderWidth: 1,
      textStyle: { color: '#F3F4EC', fontSize: 12 },
      formatter: (params: Array<{ value: [number, number] }>) => {
        const point = Array.isArray(params) ? params[0] : params;
        if (!point) return '';
        const time = new Intl.DateTimeFormat(intlLocale(), { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(point.value[0]));
        return `${time}　<b>${Math.round(point.value[1] * 10) / 10}</b> ${unit}`;
      },
    },
    series: [{
      type: 'line',
      data: points.map((point) => [point.t, point.v]),
      smooth: 0.2,
      showSymbol: false,
      lineStyle: { width: 2, color },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: `${color}40` },
            { offset: 1, color: `${color}00` },
          ],
        },
      },
      markLine: {
        silent: true,
        symbol: 'none',
        lineStyle: {
          type: 'dashed',
          color: 'rgba(243, 244, 236, 0.4)',
          width: 1.2,
        },
        data: [{ yAxis: Math.round(avg) }],
        label: { show: false },
      },
    }],
  };
};

const heartOption = computed(() => lineOption(heartPoints.value, zeppSemanticColors.heart, 'bpm'));
const paceOption = computed(() => lineOption(paceChartPoints.value, zeppSemanticColors.pace, paceAxisLabel()));
const altitudeOption = computed(() => lineOption(altitudeChartPoints.value, zeppSemanticColors.altitude, elevationUnitLabel()));
const cadenceOption = computed(() => lineOption(cadencePoints.value, zeppSemanticColors.cadence, 'spm'));

const statSummary = (points: { v: number }[], mode: 'heart' | 'pace' | 'normal' = 'normal'): ChartStat[] | null => {
  if (points.length < 2) return null;
  const values = points.map((point) => point.v);
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (mode === 'pace') return [
    { label: t.value.statFastest, value: paceClock(min) },
    { label: t.value.statAverage, value: paceClock(avg) },
    { label: t.value.statSlowest, value: paceClock(max) },
  ];
  return [
    { label: t.value.statMin, value: numberValue(min, 0) },
    { label: t.value.statAverage, value: numberValue(avg, 0) },
    { label: t.value.statMax, value: numberValue(max, 0) },
  ];
};

const chartCards = computed(() => [
  { key: 'heart', title: t.value.chartHeart, unit: 'bpm', option: heartOption.value, stats: statSummary(heartPoints.value, 'heart'), icon: 'heart-rate' as DesignIconName, tone: 'heart' },
  { key: 'pace', title: t.value.chartPace, unit: paceAxisLabel(), option: paceOption.value, stats: statSummary(pacePoints.value, 'pace'), icon: 'body-activity' as DesignIconName, tone: 'pace' },
  { key: 'altitude', title: t.value.chartAltitude, unit: elevationUnitLabel(), option: altitudeOption.value, stats: statSummary(altitudeChartPoints.value), icon: 'health-watch' as DesignIconName, tone: 'altitude' },
  { key: 'cadence', title: t.value.chartCadence, unit: 'spm', option: cadenceOption.value, stats: statSummary(cadencePoints.value), icon: 'steps' as DesignIconName, tone: 'cadence' },
].filter((card): card is typeof card & { option: NonNullable<typeof card.option> } => card.option !== null));

/**
 * 手表自己划的心率区间分布。
 *
 * 边界是云端随这条运动一起下发的（`heart_range`），**不是**我们切的：我们手上
 * 没有用户在表上设的那份阈值，自己切只会切出另一套数字。训练状态页那套自选
 * 区间模型（最大心率 / 储备心率 / 阈值）跟这里不是一回事，两边对不上是正常的。
 *
 * 全零的分布在解析层就被当成「这次没有心率数据」丢掉了，所以这里拿到的非空
 * 数组一定有真实秒数，界面不用再判一次。
 */
const hrZones = computed(() => {
  const zones = [...(workout.value?.hr_zones ?? [])].sort((a, b) => a.index - b.index);
  const total = zones.reduce((sum, zone) => sum + zone.seconds, 0);
  if (!zones.length || total <= 0) return null;
  return {
    totalLabel: formatClock(total / 60),
    rows: zones.map((zone, position) => {
      // 第一段是「某个上限以下」，其余每段的下限就是上一段的上限。
      const low = position === 0 ? null : zones[position - 1].upper_bound_bpm;
      const percent = (zone.seconds / total) * 100;
      return {
        index: zone.index,
        range: low === null
          ? t.value.hrZoneBelow(zone.upper_bound_bpm)
          : t.value.hrZoneBetween(low, zone.upper_bound_bpm),
        duration: formatClock(zone.seconds / 60),
        percent,
        percentLabel: t.value.hrZoneShare(percent.toFixed(1)),
      };
    }),
  };
});

const decodedMetrics = computed(() => {
  const item = workout.value;
  const detail = series.value;
  if (!item || !detail) return [];
  const summary = detail.summary;
  return [
    { label: t.value.decodedRoutePoints, value: detail.route.length ? numberValue(detail.route.length) : t.value.notProvided, icon: 'outdoor-run' as DesignIconName },
    { label: t.value.decodedSamples, value: detail.samples.length ? numberValue(detail.samples.length) : t.value.notProvided, icon: 'structured-data' as DesignIconName },
    { label: t.value.decodedPauses, value: detail.pauses.length ? numberValue(detail.pauses.length) : t.value.notProvided, icon: 'auto-sync' as DesignIconName },
    { label: t.value.decodedAvgCadence, value: isFiniteNumber(summary.average_cadence) ? `${numberValue(summary.average_cadence)} spm` : t.value.notProvided, icon: 'steps' as DesignIconName },
    { label: t.value.decodedMaxCadence, value: isFiniteNumber(summary.max_cadence) ? `${numberValue(summary.max_cadence)} spm` : t.value.notProvided, icon: 'training-load' as DesignIconName },
    { label: t.value.decodedAvgStride, value: isFiniteNumber(summary.average_stride_cm) ? `${numberValue(summary.average_stride_cm)} cm` : t.value.notProvided, icon: 'body-activity' as DesignIconName },
    { label: t.value.decodedDescent, value: isFiniteNumber(summary.elevation_loss_m) ? `${numberValue(toElevation(summary.elevation_loss_m))} ${elevationUnitLabel()}` : t.value.notProvided, icon: 'health-watch' as DesignIconName },
    { label: t.value.decodedMaxHr, value: isFiniteNumber(item.max_hr) ? `${numberValue(item.max_hr)} bpm` : t.value.notProvided, icon: 'resting-heart-rate' as DesignIconName },
    // Running power and form only exist on watches that measure them, and only
    // for running; every one of these reads "not provided" rather than 0.
    { label: t.value.decodedAvgPower, value: isFiniteNumber(summary.average_power_watts) ? `${numberValue(summary.average_power_watts)} W` : t.value.notProvided, icon: 'training-load' as DesignIconName },
    { label: t.value.decodedMaxPower, value: isFiniteNumber(summary.max_power_watts) ? `${numberValue(summary.max_power_watts)} W` : t.value.notProvided, icon: 'training-load' as DesignIconName },
    { label: t.value.decodedGroundContact, value: isFiniteNumber(summary.average_ground_contact_ms) ? `${numberValue(summary.average_ground_contact_ms)} ms` : t.value.notProvided, icon: 'body-activity' as DesignIconName },
    { label: t.value.decodedVerticalOscillation, value: isFiniteNumber(summary.average_vertical_oscillation_mm) ? `${(summary.average_vertical_oscillation_mm / 10).toFixed(1)} cm` : t.value.notProvided, icon: 'body-activity' as DesignIconName },
    { label: t.value.decodedVerticalRatio, value: isFiniteNumber(summary.average_vertical_ratio_pct) ? `${summary.average_vertical_ratio_pct.toFixed(1)} %` : t.value.notProvided, icon: 'body-activity' as DesignIconName },
    { label: t.value.decodedBestEquivalentPace, value: isFiniteNumber(summary.best_equivalent_pace_s_per_km) ? `${formatPaceSeconds(summary.best_equivalent_pace_s_per_km)} ${paceUnitLabel()}` : t.value.notProvided, icon: 'outdoor-run' as DesignIconName },
  ];
});

const syncBadge = computed(() => {
  const raw = appStatus.value?.last_cloud_sync_at;
  if (!raw) return t.value.notFetchedYet;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? t.value.timeUnknown : new Intl.DateTimeFormat(intlLocale(), { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(date).replace(/\//g, '-');
});

let detailSeq = 0;
const loadDetail = async () => {
  const seq = ++detailSeq;
  loading.value = true;
  error.value = null;
  if (!isTauri()) { loading.value = false; return; }
  try {
    const emptySeries = { workout_id: workoutId.value, samples: [], route: [], pauses: [], splits: [], summary: {} };
    const [detail, workoutSeries] = await Promise.all([
      tauriApi.getWorkoutDetail(workoutId.value),
      tauriApi.getWorkoutSeries(workoutId.value).catch(() => emptySeries),
    ]);
    if (seq !== detailSeq) return;
    const profile = detail
      ? await tauriApi.getDeviceProfile({ deviceId: detail.device_id, sourceScope: detail.source_scope }).catch(() => ({}))
      : {};
    if (seq !== detailSeq) return;
    workout.value = detail as WorkoutMetrics | null;
    series.value = detail ? workoutSeries : null;
    device.value = profile;
  } catch (cause) {
    if (seq === detailSeq) error.value = toUserMessage(cause, t.value.loadFailed);
  } finally {
    if (seq === detailSeq) loading.value = false;
  }
};

const changeWorkoutOverride = async (value: string | number) => {
  if (!workout.value) return;
  const next = String(value);
  typeOverrideBusy.value = true;
  actionError.value = null;
  try {
    const updated = await tauriApi.setWorkoutTypeOverride(workout.value.workout_id, next || null);
    workout.value = updated as WorkoutMetrics;
    exportedNote.value = next ? t.value.overrideSaved : t.value.overrideCleared;
  } catch (cause) {
    actionError.value = toUserMessage(cause, t.value.overrideFailed);
  } finally {
    typeOverrideBusy.value = false;
  }
};

const exportRecord = async () => {
  if (!workout.value) return;
  actionError.value = null;
  exportedNote.value = null;
  try {
    const csvCell = (value: unknown): string => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = () => {
      const fields: Array<keyof WorkoutSeriesSample> = ['timestamp', 'heart_rate', 'speed', 'pace', 'cadence', 'stride_cm', 'altitude_m'];
      return [fields.join(','), ...(series.value?.samples ?? []).map((sample) => fields.map((field) => csvCell(sample[field])).join(','))].join('\r\n');
    };
    const xmlEscape = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character] ?? character);
    const gpx = () => `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="ZeppBridge" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${xmlEscape(workoutLabel(displayType.value))}</name></metadata><trk><name>${xmlEscape(workout.value?.workout_id)}</name><trkseg>${(series.value?.route ?? []).map((point) => `<trkpt lat="${point.latitude}" lon="${point.longitude}">${isFiniteNumber(point.altitude_m) ? `<ele>${point.altitude_m}</ele>` : ''}<time>${xmlEscape(point.timestamp)}</time></trkpt>`).join('')}</trkseg></trk></gpx>`;
    const payload = activeFormat.value === 'json'
      ? JSON.stringify({ workout: workout.value, series: series.value }, null, 2)
      : activeFormat.value === 'csv' ? csv() : gpx();
    await navigator.clipboard.writeText(payload);
    exportedNote.value = t.value.copied(activeFormat.value.toUpperCase());
  } catch { actionError.value = t.value.copyFailed; }
};

onMounted(() => {
  void loadDetail();
  if (workoutId.value) void loadInsight(workoutId.value);
  if (isTauri()) {
    void tauriApi.getWorkoutTypeOptions()
      .then((options) => { typeOverrideOptions.value = options; })
      .catch(() => { typeOverrideOptions.value = []; });
  }
});
watch([dataRevision, workoutId], () => void loadDetail());
</script>

<template>
  <section class="page workout-page" aria-labelledby="workout-detail-title">
    <div class="page-toolbar">
      <RouterLink class="back-link" to="/recent"><Icon name="arrow-left" :size="14" />{{ t.backToRecent }}</RouterLink>
    </div>

    <div v-if="loading" class="detail-loading" aria-live="polite"><SkeletonBlock height="118px" /><SkeletonBlock height="280px" /></div>
    <EmptyState v-else-if="error" tone="error" icon="warning" :title="t.loadFailedTitle" :message="error"><button class="button button-secondary" type="button" @click="loadDetail">{{ t.retry }}</button></EmptyState>
    <EmptyState v-else-if="!workout" icon="steps" :title="t.notFoundTitle" :message="t.notFoundMessage" />

    <template v-else>
      <section class="workout-hero" :aria-label="t.heroAria">
        <div class="hero-copy">
          <div class="hero-device">
            <DeviceVisual :src="deviceImage" :alt="deviceName" :kind="deviceKind" />
            <span class="device-live"><i></i>{{ deviceName }}</span>
          </div>
          <div class="hero-title-group">
            <span class="source-chip"><DesignIcon name="verified" :size="20" />{{ t.decodedLocally }} · {{ dataScopeLabel(workout.source_scope) }}</span>
            <div class="sport-line">
              <DesignIcon :name="workoutArt" :size="64" />
              <div>
                <p class="hero-kicker">WORKOUT DETAIL</p>
                <h1 id="workout-detail-title">{{ workout ? workoutDisplayLabel(workout) : workoutLabel(displayType) }}</h1>
              </div>
            </div>
            <p class="sport-time"><Icon name="clock" :size="14" />{{ formatDate(workout.start_time, 'short') }} {{ formatTime(workout.start_time) }} · {{ formatClock(durationMinutes) }}</p>
            <div class="type-evidence" :aria-label="t.typeEvidenceAria">
              <span>{{ t.zeppRawCode(workout.zepp_type === undefined || workout.zepp_type === null ? t.notProvided : String(workout.zepp_type)) }}</span>
              <span>{{ t.zeppBridgeMatch(workoutLabel(workout.normalized_type)) }}</span>
              <span v-if="workout.custom_label">{{ t.customName(String(workout.zepp_type), workout.custom_label) }}</span>
              <span class="type-correct">
                {{ t.myCorrection }}
                <SelectMenu
                  class="type-correct-menu"
                  :model-value="workout.user_override || ''"
                  :options="typeOverrideChoices"
                  :disabled="typeOverrideBusy"
                  :aria-label="t.correctionAria"
                  @update:model-value="changeWorkoutOverride"
                />
              </span>
            </div>
          </div>
        </div>
        <div class="hero-signal" aria-hidden="true"><DesignIcon name="health-watch" :size="124" /></div>

        <div class="metric-list" :aria-label="t.metricListAria">
          <div v-for="metric in heroMetrics" :key="metric.label" :class="['metric-tile', `tone-${metric.tone}`]">
            <DesignIcon :name="metric.icon" :size="36" />
            <div><p class="metric-label">{{ metric.label }}</p><p class="metric-value"><strong>{{ metric.value }}</strong><span v-if="metric.unit">{{ metric.unit }}</span></p></div>
          </div>
        </div>
      </section>

      <!-- 不支持这类运动的洞察时整块不渲染：一张只会说「暂不支持」的卡片
           除了占地方和让人困惑之外没有别的作用。 -->
      <InsightCard
        v-if="insightLoading || insightError || insight?.supported"
        :insight="insight"
        :loading="insightLoading"
        :error="insightError"
        @handoff="openAiHandoff"
      />

      <div class="lower">
        <div class="main-col">
          <section class="surface-card series-card" :aria-label="t.routeAria">
            <div class="section-head">
              <span class="section-icon route-tone"><DesignIcon name="outdoor-run" :size="34" /></span>
              <div><p class="section-eyebrow">ROUTE</p><h2>{{ t.routeTitle }}</h2></div>
              <span class="route-note">{{ t.routeNote }}</span>
            </div>
            <div v-if="routeCanvas" class="route-wrap">
              <div class="route-canvas-texture" aria-hidden="true"></div>
              <svg class="route-svg" :viewBox="routeCanvas.viewBox" preserveAspectRatio="xMidYMid meet" role="img" :aria-label="t.routeSvgAria">
                <path v-for="(road, index) in routeCanvas.ghosts" :key="`ghost-${index}`" class="ghost-road" :d="road.d" fill="none" :stroke-opacity="road.opacity" />
                <path class="route-glow" :d="routeCanvas.glow" fill="none" />
                <path v-for="(segment, index) in routeCanvas.segments" :key="`${segment.d}-${index}`" :d="segment.d" fill="none" :stroke="segment.color" stroke-width="5.2" stroke-linecap="round" stroke-linejoin="round" />
                <circle class="route-dot start" :cx="routeCanvas.start.x" :cy="routeCanvas.start.y" r="8" />
                <circle class="route-dot end" :cx="routeCanvas.end.x" :cy="routeCanvas.end.y" r="8" />
                <path class="route-end-mark" :transform="`translate(${routeCanvas.end.x} ${routeCanvas.end.y})`" d="M-3.6-3.6 3.6 3.6 M3.6-3.6-3.6 3.6" />
                <g v-for="(marker, index) in routeCanvas.pauseMarkers" :key="`pause-${index}`" class="pause-mark" :transform="`translate(${marker.x} ${marker.y})`">
                  <circle r="7" />
                  <path d="M-2-2.6 V2.6 M2-2.6 V2.6" />
                </g>
              </svg>
              <div class="route-legend"><span><i class="neutral-dot"></i>{{ routeCanvas.enoughPace ? t.routeLegendPace(routeCanvas.validPaceCount) : t.routeLegendNoPace }}</span><template v-if="routeCanvas.enoughPace"><span><i class="fast-dot"></i>{{ t.legendFast }}</span><span><i class="steady-dot"></i>{{ t.legendSteady }}</span><span><i class="warm-dot"></i>{{ t.legendWarm }}</span><span><i class="slow-dot"></i>{{ t.legendSlow }}</span></template></div>
            </div>
            <div v-else class="route-empty"><DesignIcon name="outdoor-run" :size="58" /><strong>{{ t.routeEmptyTitle }}</strong><p>{{ t.routeEmptyBody }}</p></div>
          </section>

          <div class="chart-grid">
            <section v-for="card in chartCards" :key="card.key" :class="['surface-card', 'chart-card', `chart-${card.tone}`]" :aria-label="card.title">
              <div class="chart-head">
                <span class="chart-icon"><DesignIcon :name="card.icon" :size="34" /></span>
                <p class="card-title">{{ card.title }} <em>{{ card.unit }}</em></p>
                <ul v-if="card.stats" class="chart-stats">
                  <li v-for="stat in card.stats" :key="stat.label"><em>{{ stat.label }}</em><strong>{{ stat.value }}</strong></li>
                </ul>
              </div>
              <VChart class="series-chart" :option="card.option" autoresize role="img" :aria-label="t.chartAria(card.title)" />
            </section>
          </div>
          <section v-if="!chartCards.length" class="surface-card chart-empty"><DesignIcon name="structured-data" :size="42" /><div><strong>{{ t.chartsEmptyTitle }}</strong><p>{{ t.chartsEmptyBody }}</p></div></section>
          <section v-if="hrZones" class="surface-card hr-zone-card" :aria-label="t.hrZonesAria">
            <div class="section-head compact">
              <span class="section-icon heart-tone"><DesignIcon name="heart-rate" :size="32" /></span>
              <div><p class="section-eyebrow">HR ZONES</p><h2>{{ t.hrZonesTitle }}</h2></div>
              <span class="route-note">{{ t.hrZoneTotal(hrZones.totalLabel) }}</span>
            </div>
            <div class="hr-zone-bar" role="img" :aria-label="t.hrZoneBarAria">
              <span v-for="row in hrZones.rows" :key="row.index" :class="['hr-zone-fill', `zone-${row.index}`]" :style="{ width: `${row.percent}%` }"></span>
            </div>
            <ul class="hr-zone-list">
              <li v-for="row in hrZones.rows" :key="row.index">
                <i :class="['hr-zone-dot', `zone-${row.index}`]"></i>
                <span class="hr-zone-range">{{ row.range }}</span>
                <strong>{{ row.duration }}</strong>
                <em>{{ row.percentLabel }}</em>
              </li>
            </ul>
            <p class="mapping-note"><DesignIcon name="verified" :size="20" />{{ t.hrZonesNote }}</p>
          </section>
        </div>

        <div class="side-col">
          <section class="surface-card side-card decoded-card" :aria-label="t.decodedAria">
            <div class="section-head compact"><span class="section-icon data-tone"><DesignIcon name="structured-data" :size="32" /></span><div><p class="section-eyebrow">DECODED</p><h2>{{ t.decodedTitle }}</h2></div></div>
            <div class="decoded-list">
              <div v-for="metric in decodedMetrics" :key="metric.label"><DesignIcon :name="metric.icon" :size="29" /><span>{{ metric.label }}</span><strong>{{ metric.value }}</strong></div>
            </div>
            <p class="mapping-note"><DesignIcon name="verified" :size="20" />{{ t.decodedNote }}</p>
          </section>

          <section class="surface-card side-card" :aria-label="t.exportAria">
            <div class="section-head compact"><span class="section-icon export-tone"><DesignIcon name="document" :size="32" /></span><div><p class="section-eyebrow">EXPORT</p><h2>{{ t.exportTitle }}</h2></div></div>
            <p class="card-sub">{{ t.exportSub }}</p>
            <div class="format-row" role="radiogroup" :aria-label="t.exportFormatAria"><button v-for="format in (['json', 'csv', 'gpx'] as const)" :key="format" type="button" role="radio" :aria-checked="activeFormat === format" :class="['format-pill', { 'is-on': activeFormat === format }]" @click="activeFormat = format">{{ format === 'gpx' ? 'GPX' : format.toUpperCase() }}</button></div>
            <button class="export-go" type="button" @click="exportRecord"><DesignIcon name="cloud-output" :size="27" />{{ t.exportGo(activeFormat.toUpperCase()) }}</button>
            <p v-if="exportedNote" class="action-note ok" role="status"><Icon name="circle-check" :size="13" />{{ exportedNote }}</p><p v-if="actionError" class="action-note bad" role="alert"><Icon name="warning" :size="13" />{{ actionError }}</p>
          </section>

          <section class="surface-card side-card ai-card" :aria-label="t.handoffAria">
            <div class="section-head compact"><span class="section-icon ai-tone"><DesignIcon name="handoff" :size="32" /></span><div><p class="section-eyebrow">HANDOFF</p><h2>{{ t.handoffTitle }}</h2></div></div>
            <p class="card-sub">{{ t.handoffSub }}</p>
            <label class="ai-provider">
              <span>{{ t.handoffTarget }}</span>
              <SelectMenu
                v-model="aiProviderId"
                :options="aiProviderChoices"
                :aria-label="t.handoffTargetAria"
                drop-up
              />
            </label>
            <button class="export-go" type="button" :disabled="handoffState === 'preparing'" @click="sendWorkoutToAi">
              <DesignIcon name="handoff" :size="27" />{{ handoffState === 'preparing' ? t.preparing : t.handTo(aiProvider.label) }}
            </button>
            <p v-if="aiNote" class="action-note ok" role="status"><Icon name="circle-check" :size="13" />{{ aiNote }}</p>
            <p v-if="handoffError" class="action-note bad" role="alert"><Icon name="warning" :size="13" />{{ handoffError }}</p>
          </section>

          <section class="surface-card side-card meta-card" :aria-label="t.provenanceAria">
            <div class="section-head compact"><span class="section-icon source-tone"><DesignIcon name="database" :size="32" /></span><div><p class="section-eyebrow">PROVENANCE</p><h2>{{ t.provenanceTitle }}</h2></div></div>
            <dl><div><dt>{{ t.provenanceProvider }}</dt><dd>{{ dataProviderLabel() }}</dd></div><div><dt>{{ t.provenanceScope }}</dt><dd>{{ dataScopeLabel(workout.source_scope) }}</dd></div><div><dt>{{ t.provenanceSynced }}</dt><dd>{{ syncBadge }}</dd></div><div><dt>{{ t.provenanceRecordId }}</dt><dd>{{ workout.workout_id }}</dd></div><div><dt>{{ t.provenanceDevice }}</dt><dd>{{ deviceName }}</dd></div></dl>
          </section>
        </div>
      </div>
      <p class="page-foot"><DesignIcon name="secure" :size="20" />{{ t.pageFoot }}</p>
    </template>
  </section>
</template>

<style scoped>
.workout-page { width: 100%; display: grid; gap: 16px; align-content: start; }
.detail-loading { display: grid; gap: 12px; }
.page-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 38px; }
.back-link { display: inline-flex; align-items: center; gap: 6px; justify-self: start; color: var(--muted); font-size: 12px; text-decoration: none; }
.back-link:hover { color: var(--accent); }
.ai-provider { display: grid; gap: 6px; margin-bottom: 10px; font-size: 12px; color: var(--muted); }
.ai-provider select { min-height: 34px; padding: 0 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); color: var(--ink); font: inherit; }
.workout-hero { position: relative; overflow: hidden; display: grid; gap: 18px; padding: 22px; border: 1px solid rgba(226,234,242,.1); border-radius: 24px; background: radial-gradient(circle at 88% 18%, rgba(43,179,192,.14), transparent 30%), linear-gradient(145deg, #20242b 0%, #191c21 58%, #171a1f 100%); box-shadow: 0 22px 70px rgba(4,6,8,.22); }
.workout-hero::before { position: absolute; inset: 0; pointer-events: none; content: ''; background: linear-gradient(120deg, rgba(255,255,255,.035), transparent 38%); }
.hero-copy { position: relative; z-index: 1; display: flex; align-items: center; gap: 20px; min-width: 0; }
.hero-device { display: grid; justify-items: center; gap: 7px; flex: 0 0 auto; }
.hero-device :deep(.device-visual) { width: 112px; height: 112px; flex-basis: 112px; border-radius: 22px; background: rgba(11,14,17,.5); box-shadow: inset 0 0 24px rgba(255,255,255,.025); }
.hero-device :deep(.device-visual img) { padding: 8px; }
.device-live { display: inline-flex; align-items: center; gap: 5px; max-width: 132px; overflow: hidden; color: var(--muted); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.device-live i { width: 6px; height: 6px; border-radius: 50%; background: var(--readiness); box-shadow: 0 0 0 4px rgba(61,216,76,.1); }
.hero-title-group { min-width: 0; }
.source-chip { display: inline-flex; align-items: center; gap: 6px; min-height: 27px; padding: 3px 10px 3px 5px; border: 1px solid rgba(125,163,62,.25); border-radius: 999px; background: rgba(125,163,62,.08); color: #b8ce90; font-size: 11px; }
.sport-line { display: flex; align-items: center; gap: 12px; margin-top: 8px; }
.hero-kicker, .section-eyebrow { margin: 0; color: var(--subtle); font-family: var(--font-mono); font-size: 9px; font-weight: 700; letter-spacing: .16em; }
.sport-line h1 { margin: 1px 0 0; color: var(--ink); font-size: clamp(25px, 3vw, 38px); line-height: 1.1; letter-spacing: -.04em; }
.sport-time { display: inline-flex; align-items: center; gap: 6px; margin: 9px 0 0; color: var(--muted); font-size: 12px; }
.type-evidence { display: flex; flex-wrap: wrap; align-items: center; gap: 7px 12px; margin-top: 10px; color: var(--muted); font-size: 11px; }
.type-evidence > span { padding: 5px 8px; border: 1px solid var(--line); border-radius: 8px; background: rgba(255,255,255,.025); }
/* 「我的纠正」这一格是标签 + 选择器；`> span` 的边框不该套在它外面。
   选择器本身不做任何尺寸覆盖——全应用只有一种下拉长相，这是用户点名要的。 */
.type-evidence > .type-correct { display: inline-flex; align-items: center; gap: 7px; padding: 0; border: 0; background: none; }
.type-correct-menu { min-width: 180px; }
.hero-signal { position: absolute; z-index: 0; top: -8px; right: 3%; opacity: .13; filter: saturate(1.4); transform: rotate(5deg); }
.metric-list { position: relative; z-index: 1; display: grid; grid-template-columns: repeat(7, minmax(112px, 1fr)); gap: 9px; }
.metric-tile { display: flex; align-items: center; gap: 8px; min-width: 0; min-height: 78px; padding: 10px; border: 1px solid rgba(226,234,242,.08); border-radius: 15px; background: rgba(11,14,17,.42); }
.metric-tile > .design-icon { flex: 0 0 auto; }
.metric-tile.tone-heart { background: linear-gradient(135deg, rgba(240,97,106,.12), rgba(11,14,17,.45)); } .metric-tile.tone-pace { background: linear-gradient(135deg, rgba(74,168,232,.12), rgba(11,14,17,.45)); } .metric-tile.tone-altitude { background: linear-gradient(135deg, rgba(245,195,59,.11), rgba(11,14,17,.45)); } .metric-tile.tone-training { background: linear-gradient(135deg, rgba(125,163,62,.12), rgba(11,14,17,.45)); } .metric-tile.tone-distance { background: linear-gradient(135deg, rgba(47,169,107,.13), rgba(11,14,17,.45)); } .metric-tile.tone-vo2 { background: linear-gradient(135deg, rgba(139,92,246,.12), rgba(11,14,17,.45)); }
.metric-label { margin: 0; color: var(--muted); font-size: 12px; }
.metric-value { display: flex; align-items: baseline; gap: 5px; margin: 3px 0 0; flex-wrap: wrap; }
.metric-value strong { color: var(--ink); font-family: var(--font-mono); font-size: 15px; font-variant-numeric: tabular-nums; font-weight: 700; letter-spacing: -.02em; }
.metric-value span { color: var(--muted); font-size: 11px; }
.lower { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(310px, .72fr); align-items: start; gap: 16px; }
.main-col, .side-col { display: grid; gap: 16px; min-width: 0; }
.surface-card { min-width: 0; }
.card-title { margin: 0; color: var(--ink); font-size: 14px; font-weight: 700; }
.card-title em { color: var(--subtle); font-size: 12px; font-style: normal; font-weight: 400; }
.card-sub { margin: 0 0 12px; color: var(--muted); font-size: 12px; }
.series-card, .side-card { padding: 16px 18px 18px; border-radius: 19px; }
.section-head { display: flex; align-items: center; gap: 10px; margin-bottom: 13px; }
.section-head h2 { margin: 1px 0 0; font-size: 16px; letter-spacing: -.02em; }
.section-head.compact { margin-bottom: 14px; }
.section-icon { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 13px; background: rgba(47,169,107,.11); }
.section-icon.data-tone { background: rgba(74,168,232,.12); } .section-icon.export-tone { background: rgba(139,92,246,.12); } .section-icon.source-tone { background: rgba(245,195,59,.1); }
.chart-head { display: flex; align-items: flex-start; gap: 8px; min-width: 0; }
.chart-head .card-title { flex: 1 1 auto; min-width: 72px; }
.route-note { color: var(--subtle); font-size: 11px; }
.section-head .route-note { margin-left: auto; }
.route-wrap { position: relative; overflow: hidden; min-height: 320px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: #171a14; }
.route-canvas-texture { position: absolute; inset: 0; pointer-events: none; background:
  radial-gradient(circle at 72% 22%, rgba(136,164,73,.1), transparent 42%),
  radial-gradient(circle at 18% 78%, rgba(47,169,107,.07), transparent 46%),
  repeating-radial-gradient(circle at 40% 45%, rgba(228,235,208,.025) 0 1px, transparent 1px 7px); }
.route-svg { position: absolute; inset: 10px 10px 42px; display: block; width: calc(100% - 20px); height: calc(100% - 52px); }
.ghost-road { stroke: #c8d6a2; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
.route-glow { stroke: rgba(198, 220, 132, .22); stroke-width: 14; stroke-linecap: round; stroke-linejoin: round; }
.route-dot.start { fill: #6ad980; stroke: #12150f; stroke-width: 2; }
.route-dot.end { fill: #e15a63; stroke: #12150f; stroke-width: 2; }
.route-end-mark { fill: none; stroke: #12150f; stroke-width: 1.6; stroke-linecap: round; }
.pause-mark circle { fill: rgba(17,21,24,.88); stroke: var(--route-amber); stroke-width: 1.2; }
.pause-mark path { fill: none; stroke: var(--route-amber); stroke-width: 1.4; stroke-linecap: round; }
.route-legend { position: absolute; right: 10px; bottom: 10px; left: 10px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 5px 8px; border: 1px solid var(--line); border-radius: 8px; background: rgba(14,17,19,.88); color: var(--muted); font-size: 10px; }
.route-legend span { display: inline-flex; align-items: center; gap: 4px; }
.route-legend i { width: 9px; height: 4px; border-radius: 999px; background: var(--route-neutral); }
.route-legend .fast-dot { background: var(--route-mint); }
.route-legend .steady-dot { background: var(--route-cyan); }
.route-legend .warm-dot { background: var(--route-amber); }
.route-legend .slow-dot { background: var(--route-coral); }
.route-empty { display: grid; justify-items: center; gap: 6px; padding: 46px 16px; border: 1px dashed var(--line-strong); border-radius: var(--radius-sm); color: var(--subtle); font-size: 12px; text-align: center; background: radial-gradient(circle at 50% 50%, rgba(47,169,107,.07), transparent 45%); }
.route-empty strong { color: var(--muted); }
.route-empty p { margin: 0; }
.section-icon.heart-tone { background: rgba(240,97,106,.12); }
.hr-zone-bar { display: flex; overflow: hidden; height: 15px; border: 1px solid var(--line); border-radius: 999px; background: rgba(11,14,17,.45); }
.hr-zone-fill { min-width: 0; }
.hr-zone-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px 20px; margin: 13px 0 0; padding: 0; list-style: none; font-variant-numeric: tabular-nums; }
.hr-zone-list li { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.hr-zone-list .hr-zone-range { flex: 1 1 auto; color: var(--muted); }
.hr-zone-list strong { color: var(--ink); font-weight: 600; }
.hr-zone-list em { min-width: 46px; color: var(--subtle); font-style: normal; text-align: right; }
.hr-zone-dot { flex: 0 0 auto; width: 9px; height: 9px; border-radius: 3px; }
/* 六段固定配色：由凉到热，和心率本身的强度方向一致。手表最多下发六段。 */
.zone-0 { background: #4aa8e8; } .zone-1 { background: #2fa96b; } .zone-2 { background: #b7c944; }
.zone-3 { background: #f5c33b; } .zone-4 { background: #ef8f4a; } .zone-5 { background: #f0616a; }
.chart-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.chart-card { overflow: hidden; padding: 12px 14px; min-width: 0; border-radius: 18px; }
.chart-card::before { display: block; height: 2px; margin: -12px -14px 10px; content: ''; background: var(--line); }
.chart-heart::before { background: linear-gradient(90deg, var(--heart), transparent); } .chart-pace::before { background: linear-gradient(90deg, var(--pace), transparent); } .chart-altitude::before { background: linear-gradient(90deg, var(--warning), transparent); } .chart-cadence::before { background: linear-gradient(90deg, var(--readiness), transparent); }
.chart-icon { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 11px; background: rgba(255,255,255,.025); }
.chart-stats { display: grid; grid-template-columns: repeat(3, max-content); justify-content: end; gap: 8px 16px; margin: 1px 0 0 auto; min-width: 0; padding: 0; list-style: none; color: var(--subtle); font-variant-numeric: tabular-nums; }
.chart-stats li { display: grid; gap: 1px; min-width: 0; }
.chart-stats em { color: #7E856D; font-size: 10px; font-style: normal; line-height: 1.2; }
.chart-stats strong { color: #E8EBD8; font-size: 13px; font-weight: 600; line-height: 1.2; white-space: nowrap; }
.series-chart { width: 100%; height: 170px; }
.chart-empty { display: flex; align-items: center; gap: 12px; padding: 20px; color: var(--muted); font-size: 12px; }
.chart-empty strong { color: var(--ink); }
.chart-empty p { margin: 2px 0 0; }
.decoded-list { display: grid; gap: 4px; }
.decoded-list > div { display: grid; grid-template-columns: 34px minmax(0,1fr) auto; align-items: center; gap: 7px; min-height: 43px; padding: 4px 3px; border-bottom: 1px solid var(--line); }
.decoded-list > div:last-child { border-bottom: 0; }
.decoded-list span { color: var(--muted); font-size: 11px; }
.decoded-list strong { color: var(--ink); font-family: var(--font-mono); font-size: 11px; font-variant-numeric: tabular-nums; }
.mapping-note { display: flex; align-items: flex-start; gap: 7px; margin: 12px 0 0; padding: 9px; border-radius: 10px; background: rgba(125,163,62,.08); color: #aeb99b; font-size: 10px; }
.mapping-note .design-icon { flex: 0 0 auto; }
.format-row { display: flex; gap: 8px; flex-wrap: wrap; }
.format-pill { flex: 1; min-width: 58px; padding: 7px 10px; border: 1px solid var(--line); border-radius: 9px; background: var(--surface-raised); color: var(--muted); font-size: 11px; cursor: pointer; }
.format-pill.is-on { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
.export-go { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; min-height: 43px; margin-top: 10px; border: 1px solid rgba(125,163,62,.36); border-radius: 11px; background: var(--action-green); color: #f2f4ee; font-weight: 700; cursor: pointer; }
.export-go:hover { background: var(--action-green-hover); }
.action-note { display: inline-flex; align-items: center; gap: 6px; margin: 10px 0 0; font-size: 12px; }
.action-note.ok { color: var(--readiness); } .action-note.bad { color: var(--danger); }
.meta-card dl { display: grid; gap: 8px; margin: 0; }
.meta-card dl > div { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; min-width: 0; }
.meta-card dt { color: var(--muted); font-size: 12px; } .meta-card dd { margin: 0; color: var(--ink); font-size: 12px; overflow-wrap: anywhere; text-align: right; }
.page-foot { display: flex; align-items: center; justify-content: center; gap: 6px; margin: 2px 0 0; color: var(--subtle); font-size: 11px; }
@media (max-width: 1320px) { .metric-list { grid-template-columns: repeat(4, minmax(130px, 1fr)); } }
@media (max-width: 1180px) { .lower { grid-template-columns: minmax(0, 1fr); } .side-col { grid-template-columns: repeat(2, minmax(0,1fr)); } .decoded-card { grid-row: span 2; } }
@media (max-width: 760px) { .page-toolbar { align-items: flex-start; } .ai-action span { display: none; } .workout-hero { padding: 16px; border-radius: 19px; } .hero-copy { align-items: flex-start; gap: 12px; } .hero-device :deep(.device-visual) { width: 78px; height: 78px; flex-basis: 78px; } .device-live { display: none; } .sport-line > .design-icon { width: 45px !important; height: 45px !important; } .sport-line h1 { font-size: 24px; } .source-chip { font-size: 10px; } .metric-list { grid-template-columns: repeat(2, minmax(0, 1fr)); } .metric-tile { min-height: 70px; } .chart-grid, .side-col { grid-template-columns: minmax(0, 1fr); } .decoded-card { grid-row: auto; } .route-wrap { min-height: 240px; } .route-note { display: none; } .chart-head { flex-wrap: wrap; } .chart-stats { width: 100%; justify-content: flex-start; } }
</style>
