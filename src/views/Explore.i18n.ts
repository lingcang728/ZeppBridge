import type { IconName } from '../components/Icon.vue';
import type { ExportDataType } from '../types';
import { defineMessages, messagesOf } from '../i18n';

/*
 * 「交给 AI」这一页的文案单独放一个文件。
 *
 * 六个提示词模板每个都是一整段话，塞回 `.vue` 的 `<script setup>` 里会把这一页
 * 的逻辑推到三百行以后，谁改都得先翻过去。文件仍然只被这一页 import，所以它
 * 跟着 Explore 的 chunk 走，不进首屏。
 *
 * 提示词本身也翻译：英文用户拿到一段中文提示词，AI 会照着中文回答。
 */
export interface PromptTemplate {
  id: string;
  name: string;
  sub: string;
  category: string;
  icon: IconName;
  types: ExportDataType[];
  prompt: string;
}

const TEMPLATE_SHAPE: Array<{
  id: string;
  category: string;
  icon: IconName;
  types: ExportDataType[];
}> = [
  {
    id: 'performance',
    category: 'summary',
    icon: 'bars',
    types: ['heart_rate', 'sleep', 'workouts', 'steps', 'daily_activity', 'hrv', 'recovery', 'training_load'],
  },
  {
    id: 'training',
    category: 'training',
    icon: 'activity',
    types: ['workouts', 'heart_rate', 'training_load', 'vo2max', 'lactate_threshold'],
  },
  {
    id: 'recovery',
    category: 'recovery',
    icon: 'heart',
    types: ['hrv', 'hrv_rmssd', 'heart_rate', 'sleep', 'stress', 'spo2', 'respiratory_rate', 'recovery'],
  },
  {
    id: 'sleep',
    category: 'sleep',
    icon: 'moon',
    types: ['sleep', 'heart_rate', 'hrv', 'spo2', 'respiratory_rate', 'stress'],
  },
  {
    id: 'activity',
    category: 'summary',
    icon: 'steps',
    types: ['steps', 'daily_activity', 'workouts', 'heart_rate', 'pai'],
  },
  {
    id: 'weekly',
    category: 'training',
    icon: 'clock',
    types: ['heart_rate', 'sleep', 'workouts', 'steps', 'daily_activity', 'hrv', 'recovery', 'training_load'],
  },
];

export const exploreMessages = defineMessages(
  {
    title: '交给 AI',
    intro: '选择模板、检查感知摘要并导出数据，一键将穿戴洞察发送到前沿 AI 工具。',

    workoutScopeBanner: (workoutId: string) =>
      `当前只导出运动记录 ${workoutId} 这一条：包含它本身与它进行期间的逐点指标，睡眠、步数等按天记录的数据不在范围内。日期范围暂不生效。`,
    backToDateRange: '改回按日期范围',

    categoryTitle: '模板分类',
    categoryAria: '模板分类',
    categoryAll: '全部模板',
    categorySummary: '总结',
    categoryTraining: '训练',
    categoryRecovery: '恢复',
    categorySleep: '睡眠',

    templateListTitle: '模板列表',
    templateSearchPlaceholder: '搜索模板…',
    templateSearchAria: '搜索模板',
    noTemplates: '没有匹配的模板。',

    currentTemplate: '当前模板',
    copyPromptTitle: '复制提示词文本到剪贴板',
    copyPrompt: '复制提示词',
    promptEditor: '提示词编辑',
    promptEditorHint: '（数据已自动对齐）',
    injected: (count: number) => `已注入 ${count} 类数据源`,
    promptEditorAria: '提示词编辑',

    summaryTitle: '数据感知摘要',
    summaryHint: '按需精准注入',
    cellRange: '时间范围',
    cellCount: '记录条数',
    cellCountSub: '已同步记录',
    cellTypes: '数据类型',
    cellTypesValue: (count: number) => `${count} 类`,
    cellTypesSub: '已选入数据包',
    cellSize: '数据体积',
    cellSizeSub: '预估大小',

    thisWorkout: '这一条运动',
    onlyThisWorkout: '仅这一条运动',
    approxMinutes: (minutes: number) => `（约 ${minutes} 分钟）`,
    rangeDays: (days: number) => `（${days} 天）`,

    quickRange: '快捷范围：',
    range7: '7 天',
    range30: '30 天',
    startDate: '起始日期',
    endDate: '结束日期',
    datePickerAria: '日期选择',

    secureNote: '已采用本地脱敏隔离，仅在本地生成结构化数据与提示词。',
    secureOk: '安全可靠',
    exportFile: (format: string) => `导出 ${format} 文件`,
    copyPromptOnly: '只复制提示词',
    preparing: '正在准备…',
    handTo: (provider: string) => `交给 ${provider}`,
    promptCopied: '提示词已复制（不含数据）。',
    copyFailed: '复制失败，请重试。',
    retryOpen: (provider: string) => `重试打开 ${provider}`,

    packTitle: '打包与发送',
    packSub: '选择导出格式与目标 AI 工具。',
    // issue #28：报告者导出了全部历史，才发现 JSON 里只有训练摘要，觉得
    // 「被含糊地误导了」。他要的是逐次训练的 .fit——现在有了，是单独一种
    // 导出格式。这段文案仍然保留：按下导出**之前**就该说清会拿到什么。
    packContentsTitle: '这个导出包里有什么',
    packContentsIncluded:
      '包含：训练摘要（类型、起止时间、距离、卡路里、平均/最高心率、训练负荷）、'
      + '每日指标（步数、静息心率、HRV、血氧、压力、呼吸率、PAI、VO₂max）、'
      + '睡眠会话与阶段时间轴。选「完整」时还会带上运动的逐秒序列和逐条心率读数。',
    packContentsExcluded:
      '不包含：`.tcx`、账号信息、令牌、设备序列号。GPS 轨迹在 GPX 和 FIT 里都有，'
      + '且只覆盖带轨迹的运动。选 FIT 时是一次运动一个文件，写进你选的文件夹。',
    formatGroup: '导出格式',
    formatAria: '导出格式',
    formatJsonSub: '完整结构化数据',
    formatCsvSub: '汇总表（不含逐点序列）',
    formatGpxSub: '仅含 GPS 轨迹的运动',
    formatFitSub: '每条运动一个文件，存进你选的文件夹',
    detailGroup: '详细程度',
    detailAria: '详细程度',
    streamsGroup: '数据流',
    selectedCount: (selected: number, total: number) => `已选 ${selected} / ${total} 项`,
    selectNone: '全不选',
    selectAll: '全选',
    noTypesSelected: '尚未选择数据类型，导出会被拒绝。',
    estimatedSize: '数据包预估体积',
    targetGroup: '目标 AI 工具',
    targetAria: '目标 AI 工具',
    providerIconAlt: (provider: string) => `${provider} 图标`,
    sendHint: '≤ 2 MiB 自动随提示词复制到剪贴板；> 2 MiB 会直接导出 JSON 到桌面，拖入对话即可。',

    needDesktop: 'AI 交接需要桌面应用环境；当前网页预览不会打开外部网站。',
    needValidDates: '请先选择有效的日期范围。',
    needDataTypes: '请至少选择一种数据类型。',
    stillReading: '正在读取本机记录，请稍候再试。',
    nothingInScope: '当前范围没有可交接的已同步记录。',
    previewDesktopOnly: '请从 ZeppBridge 桌面应用打开，数据感知需要读取本地记录。',
    previewFailed: '无法读取本机导出感知数据',
    attachmentNotice: '数据包已导出到桌面（zeppbridge-ai-handoff.json），拖入 AI 对话框即可。提示词已复制到剪贴板。',
    attachmentOpened: (notice: string, provider: string) => `${notice} 已打开 ${provider}。`,
    attachmentNotOpened: (notice: string, provider: string) => `${notice} 可在浏览器中打开 ${provider} 进行分析。`,
    copiedAndOpened: (provider: string) => `已复制脱敏数据并打开 ${provider}，粘贴即可开始分析。`,
    copiedOnly: (provider: string) => `已复制脱敏数据，可手动打开 ${provider} 进行粘贴。`,
    reopened: (provider: string) => `已打开 ${provider}，请在网站内粘贴提交。`,

    templates: {
      performance: {
        name: '表现总结',
        sub: '生成整体表现的清晰摘要',
        prompt: `你是一位专业的运动健康分析师，擅长将可穿戴设备数据转化为易懂的洞察。
基于以下来自 ZeppBridge 的多源数据（已按时间顺序整理），
为我生成一份结构清晰、重点突出的整体表现总结。
请包含总体概览、关键趋势、亮点表现、潜在风险与可执行建议。
若数据不足，请如实说明并给出改进数据采集的建议。

请以 Markdown 格式输出，使用表格、列表与要点来提升可读性。
语言风格专业、简洁、积极。`,
      },
      training: {
        name: '训练洞察',
        sub: '深入分析训练负荷与趋势',
        prompt: `你是一位经验丰富的耐力训练教练。
基于以下来自 ZeppBridge 的训练数据（含心率、训练负荷与 VO₂max），
分析我的训练结构、强度分布与负荷趋势，
指出训练安排中的问题，并给出下一周期的调整建议。

请以 Markdown 格式输出，语言专业、直接。`,
      },
      recovery: {
        name: '恢复与准备度',
        sub: '评估恢复、HRV 与准备度',
        prompt: `你是一位专注于运动恢复的生理学专家。
基于以下来自 ZeppBridge 的 HRV、静息心率、睡眠与压力数据，
评估我的恢复状况与训练准备度，
识别疲劳积累的信号，并给出恢复优化建议。

请以 Markdown 格式输出。`,
      },
      sleep: {
        name: '睡眠分析',
        sub: '睡眠质量与规律性洞察',
        prompt: `你是一位睡眠健康顾问。
基于以下来自 ZeppBridge 的睡眠分期、时长与心率数据，
分析我的睡眠质量、规律性与影响因素，
并给出具体、可执行的睡眠改善建议。

请以 Markdown 格式输出。`,
      },
      activity: {
        name: '活动概览',
        sub: '日常活动与趋势概览',
        prompt: `你是一位健康生活方式顾问。
基于以下来自 ZeppBridge 的步数、运动与心率数据，
概览我的日常活动水平与变化趋势，
并给出提升日常活动量的实用建议。

请以 Markdown 格式输出。`,
      },
      weekly: {
        name: '每周表现复盘',
        sub: '周度复盘与细致建议',
        prompt: `你是一位私人健康教练，每周为我做一次数据复盘。
基于以下来自 ZeppBridge 的本周数据，只和我自己此前的记录比较，
总结本周变化，指出做得好的地方与值得留意的地方，并给出下周行动清单。

约束：
- 这份数据里没有任何人群基准，不要拿我和「一般健康人群」或任何平均水平比较；
- 缺失的项直接说缺失，不要用 0 或估算值填补；
- 不做医学诊断、疾病风险判断或治疗建议。

请以 Markdown 格式输出。`,
      },
    },
  },
  {
    title: 'Hand to AI',
    intro: 'Pick a template, check what the package actually contains, and send your wearable data to the AI tool of your choice.',

    workoutScopeBanner: (workoutId: string) =>
      `Exporting workout ${workoutId} and nothing else: the workout itself plus the per-point metrics recorded while it was running. Day-level streams such as sleep and steps stay out. The date range is inactive.`,
    backToDateRange: 'Back to a date range',

    categoryTitle: 'Categories',
    categoryAria: 'Template categories',
    categoryAll: 'All templates',
    categorySummary: 'Summary',
    categoryTraining: 'Training',
    categoryRecovery: 'Recovery',
    categorySleep: 'Sleep',

    templateListTitle: 'Templates',
    templateSearchPlaceholder: 'Search templates…',
    templateSearchAria: 'Search templates',
    noTemplates: 'No template matches.',

    currentTemplate: 'Current template',
    copyPromptTitle: 'Copy the prompt text to the clipboard',
    copyPrompt: 'Copy prompt',
    promptEditor: 'Prompt',
    promptEditorHint: ' (data is aligned automatically)',
    injected: (count: number) => `${count} data streams attached`,
    promptEditorAria: 'Prompt editor',

    summaryTitle: 'What the package contains',
    summaryHint: 'Only what you tick',
    cellRange: 'Time range',
    cellCount: 'Records',
    cellCountSub: 'synced records',
    cellTypes: 'Data types',
    cellTypesValue: (count: number) => `${count}`,
    cellTypesSub: 'in the package',
    cellSize: 'Size',
    cellSizeSub: 'estimated',

    thisWorkout: 'This workout',
    onlyThisWorkout: 'this workout only',
    approxMinutes: (minutes: number) => `(about ${minutes} min)`,
    rangeDays: (days: number) => `(${days} days)`,

    quickRange: 'Quick range:',
    range7: '7 days',
    range30: '30 days',
    startDate: 'Start date',
    endDate: 'End date',
    datePickerAria: 'Date picker',

    secureNote: 'Everything is built locally: the structured data and the prompt are generated on this machine.',
    secureOk: 'Local only',
    exportFile: (format: string) => `Export ${format} file`,
    copyPromptOnly: 'Copy prompt only',
    preparing: 'Preparing…',
    handTo: (provider: string) => `Hand to ${provider}`,
    promptCopied: 'Prompt copied (no data included).',
    copyFailed: 'Copying failed. Try again.',
    retryOpen: (provider: string) => `Open ${provider} again`,

    packTitle: 'Package and send',
    packSub: 'Choose the export format and the AI tool.',
    packContentsTitle: 'What the export contains',
    packContentsIncluded:
      'Included: workout summaries (type, start and end, distance, calories, average and peak heart rate, '
      + 'training load), daily metrics (steps, resting heart rate, HRV, SpO2, stress, respiratory rate, PAI, '
      + 'VO2max), and sleep sessions with their stage timeline. Choosing "Full" adds per-second workout series '
      + 'and individual heart rate readings.',
    packContentsExcluded:
      'Not included: .tcx, account details, tokens, or device serial numbers. GPS tracks appear in the GPX '
      + 'and FIT formats, and only for workouts that carry a track. FIT writes one file per workout into a '
      + 'folder you pick.',
    formatGroup: 'Export format',
    formatAria: 'Export format',
    formatJsonSub: 'Full structured data',
    formatCsvSub: 'Summary table (no per-point series)',
    formatGpxSub: 'Only workouts carrying a GPS track',
    formatFitSub: 'One file per workout, saved into the folder you pick',
    detailGroup: 'Level of detail',
    detailAria: 'Level of detail',
    streamsGroup: 'Data streams',
    selectedCount: (selected: number, total: number) => `${selected} of ${total} selected`,
    selectNone: 'Clear',
    selectAll: 'All',
    noTypesSelected: 'No data type selected, so the export will be refused.',
    estimatedSize: 'Estimated package size',
    targetGroup: 'Target AI tool',
    targetAria: 'Target AI tool',
    providerIconAlt: (provider: string) => `${provider} icon`,
    sendHint: 'Up to 2 MiB rides along on the clipboard with the prompt. Above that, the JSON is written to your desktop for you to drag into the chat.',

    needDesktop: 'The AI hand-off needs the desktop app; this browser preview will not open external sites.',
    needValidDates: 'Choose a valid date range first.',
    needDataTypes: 'Choose at least one data type.',
    stillReading: 'Still reading local records. Try again in a moment.',
    nothingInScope: 'Nothing synced in this range to hand over.',
    previewDesktopOnly: 'Open this in the ZeppBridge desktop app; the preview reads local records.',
    previewFailed: 'Could not read the local export preview',
    attachmentNotice: 'The data package was written to your desktop (zeppbridge-ai-handoff.json) — drag it into the AI chat. The prompt is on your clipboard.',
    attachmentOpened: (notice: string, provider: string) => `${notice} ${provider} is open.`,
    attachmentNotOpened: (notice: string, provider: string) => `${notice} Open ${provider} in a browser to analyze it.`,
    copiedAndOpened: (provider: string) => `De-identified data copied and ${provider} opened. Paste it in to start.`,
    copiedOnly: (provider: string) => `De-identified data copied. Open ${provider} yourself and paste it in.`,
    reopened: (provider: string) => `${provider} is open. Paste the data in there.`,

    templates: {
      performance: {
        name: 'Performance summary',
        sub: 'A clear read on how things are going',
        prompt: `You are a sports-health analyst who turns wearable data into plain, usable insight.
Using the ZeppBridge data below (already in chronological order),
write me a clear, well-structured summary of my overall performance.
Cover the overall picture, the trends that matter, what stands out, what to watch, and what I can act on.
Where the data is thin, say so plainly and tell me what to collect instead of guessing.

Answer in Markdown, using tables, lists and bullets where they help.
Keep the tone professional, concise and constructive.`,
      },
      training: {
        name: 'Training insight',
        sub: 'Training load and where it is heading',
        prompt: `You are an experienced endurance coach.
Using the ZeppBridge training data below (heart rate, training load and VO₂max),
analyze the structure of my training, how the intensity is distributed, and where the load is heading.
Point out what is wrong with how the sessions are arranged, and tell me what to change next cycle.

Answer in Markdown. Be direct.`,
      },
      recovery: {
        name: 'Recovery and readiness',
        sub: 'Recovery, HRV and readiness to train',
        prompt: `You are a physiologist who specializes in recovery.
Using the ZeppBridge HRV, resting heart rate, sleep and stress data below,
assess how recovered I am and how ready I am to train,
name the signs of accumulating fatigue, and tell me what would help.

Answer in Markdown.`,
      },
      sleep: {
        name: 'Sleep analysis',
        sub: 'Sleep quality and regularity',
        prompt: `You are a sleep-health advisor.
Using the ZeppBridge sleep stages, durations and heart rate data below,
analyze the quality and regularity of my sleep and what appears to be affecting it,
then give me specific, actionable ways to improve it.

Answer in Markdown.`,
      },
      activity: {
        name: 'Activity overview',
        sub: 'Daily movement and where it is trending',
        prompt: `You are a healthy-lifestyle advisor.
Using the ZeppBridge steps, workout and heart rate data below,
give me an overview of my daily activity level and how it is trending,
then suggest practical ways to move more.

Answer in Markdown.`,
      },
      weekly: {
        name: 'Weekly review',
        sub: 'A weekly look back with specifics',
        prompt: `You are my personal health coach, reviewing my data once a week.
Using this week's ZeppBridge data below, compare me only against my own earlier records.
Summarize what changed this week, name what went well and what deserves attention, and give me a short list of things to do next week.

Constraints:
- There is no population baseline in this data. Do not compare me to "healthy adults" or to any average.
- Where something is missing, say it is missing. Never fill the gap with a zero or an estimate.
- No medical diagnosis, no disease-risk judgement, no treatment advice.

Answer in Markdown.`,
      },
    },
  },
);

const copy = () => messagesOf(exploreMessages);

/** 六个模板，文案跟着当前语言。形状（分类、图标、数据类型）不随语言变。 */
export const promptTemplates = (): PromptTemplate[] => {
  const t = copy().templates as Record<string, { name: string; sub: string; prompt: string }>;
  return TEMPLATE_SHAPE.map((shape) => ({
    ...shape,
    name: t[shape.id].name,
    sub: t[shape.id].sub,
    prompt: t[shape.id].prompt,
  }));
};
