<script setup lang="ts">
defineOptions({ name: 'Explore' });
import { computed, onActivated, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import Icon from '../components/Icon.vue';
import type { IconName } from '../components/Icon.vue';
import {
  exportDetailOptions,
  exportTypeGroups,
  exportTypeOptions,
  useExport,
  type SaveFormat,
} from '../composables/useExport';
import { useSyncController } from '../composables/useSyncController';
import { isTauri, tauriApi, toUserMessage } from '../composables/useTauriApi';
import { useAiHandoff } from '../composables/useAiHandoff';
import { localDateString } from '../lib/format';
import { AI_PROVIDERS, AI_PROVIDER_BY_ID, type AiProviderId } from '../lib/aiProviders';
import type { ExportDataType, ExportScope, ExportSelection } from '../types';
import { intlLocale } from '../i18n';

const {
  exportStartDate,
  exportEndDate,
  exportDataTypes,
  exportDetail,
  exportBusy,
  exportError,
  exportMessage,
  applyExportRange,
  saveExportAs,
} = useExport();

const { dataRevision } = useSyncController();

/* ── 模板定义 ─────────────────────────── */
interface PromptTemplate {
  id: string;
  name: string;
  sub: string;
  category: string;
  icon: IconName;
  types: ExportDataType[];
  prompt: string;
}

const templates: PromptTemplate[] = [
  {
    id: 'performance',
    name: '表现总结',
    sub: '生成整体表现的清晰摘要',
    category: 'summary',
    icon: 'bars',
    types: [
      'heart_rate',
      'sleep',
      'workouts',
      'steps',
      'daily_activity',
      'hrv',
      'recovery',
      'training_load',
    ],
    prompt: `你是一位专业的运动健康分析师，擅长将可穿戴设备数据转化为易懂的洞察。
基于以下来自 ZeppBridge 的多源数据（已按时间顺序整理），
为我生成一份结构清晰、重点突出的整体表现总结。
请包含总体概览、关键趋势、亮点表现、潜在风险与可执行建议。
若数据不足，请如实说明并给出改进数据采集的建议。

请以 Markdown 格式输出，使用表格、列表与要点来提升可读性。
语言风格专业、简洁、积极。`,
  },
  {
    id: 'training',
    name: '训练洞察',
    sub: '深入分析训练负荷与趋势',
    category: 'training',
    icon: 'activity',
    types: ['workouts', 'heart_rate', 'training_load', 'vo2max', 'lactate_threshold'],
    prompt: `你是一位经验丰富的耐力训练教练。
基于以下来自 ZeppBridge 的训练数据（含心率、训练负荷与 VO₂max），
分析我的训练结构、强度分布与负荷趋势，
指出训练安排中的问题，并给出下一周期的调整建议。

请以 Markdown 格式输出，语言专业、直接。`,
  },
  {
    id: 'recovery',
    name: '恢复与准备度',
    sub: '评估恢复、HRV 与准备度',
    category: 'recovery',
    icon: 'heart',
    types: [
      'hrv',
      'hrv_rmssd',
      'heart_rate',
      'sleep',
      'stress',
      'spo2',
      'respiratory_rate',
      'recovery',
    ],
    prompt: `你是一位专注于运动恢复的生理学专家。
基于以下来自 ZeppBridge 的 HRV、静息心率、睡眠与压力数据，
评估我的恢复状况与训练准备度，
识别疲劳积累的信号，并给出恢复优化建议。

请以 Markdown 格式输出。`,
  },
  {
    id: 'sleep',
    name: '睡眠分析',
    sub: '睡眠质量与规律性洞察',
    category: 'sleep',
    icon: 'moon',
    types: ['sleep', 'heart_rate', 'hrv', 'spo2', 'respiratory_rate', 'stress'],
    prompt: `你是一位睡眠健康顾问。
基于以下来自 ZeppBridge 的睡眠分期、时长与心率数据，
分析我的睡眠质量、规律性与影响因素，
并给出具体、可执行的睡眠改善建议。

请以 Markdown 格式输出。`,
  },
  {
    id: 'activity',
    name: '活动概览',
    sub: '日常活动与趋势概览',
    category: 'summary',
    icon: 'steps',
    types: ['steps', 'daily_activity', 'workouts', 'heart_rate', 'pai'],
    prompt: `你是一位健康生活方式顾问。
基于以下来自 ZeppBridge 的步数、运动与心率数据，
概览我的日常活动水平与变化趋势，
并给出提升日常活动量的实用建议。

请以 Markdown 格式输出。`,
  },
  {
    id: 'weekly',
    name: '每周表现复盘',
    sub: '周度复盘与细致建议',
    category: 'training',
    icon: 'clock',
    types: [
      'heart_rate',
      'sleep',
      'workouts',
      'steps',
      'daily_activity',
      'hrv',
      'recovery',
      'training_load',
    ],
    prompt: `你是一位私人健康教练，每周为我做一次数据复盘。
基于以下来自 ZeppBridge 的本周数据，只和我自己此前的记录比较，
总结本周变化，指出做得好的地方与值得留意的地方，并给出下周行动清单。

约束：
- 这份数据里没有任何人群基准，不要拿我和「一般健康人群」或任何平均水平比较；
- 缺失的项直接说缺失，不要用 0 或估算值填补；
- 不做医学诊断、疾病风险判断或治疗建议。

请以 Markdown 格式输出。`,
  },
];

const categories = computed(() => {
  const count = (key: string) => templates.filter((tpl) => tpl.category === key).length;
  return [
    { key: 'all', label: '全部模板', icon: 'grid' as IconName, count: templates.length },
    { key: 'summary', label: '总结', icon: 'file' as IconName, count: count('summary') },
    { key: 'training', label: '训练', icon: 'activity' as IconName, count: count('training') },
    { key: 'recovery', label: '恢复', icon: 'heart' as IconName, count: count('recovery') },
    { key: 'sleep', label: '睡眠', icon: 'moon' as IconName, count: count('sleep') },
  ];
});

/* 从运动详情点「让 AI 展开分析」过来时，范围锁定在那一条记录上。
   互斥的 ExportScope 让「日期范围」和「单次运动」不可能同时生效，
   所以这里不需要任何优先级规则。 */
const route = useRoute();
const focusedWorkoutId = ref<string | null>(null);
/* 这一页被 KeepAlive 缓存，第二次进来不会重新挂载，所以锁定范围要在
   activated 时也读一遍 query，否则会沿用上一次的范围。 */
const readFocusFromRoute = () => {
  const workout = route.query.workout;
  focusedWorkoutId.value = typeof workout === 'string' && workout.trim() ? workout.trim() : null;
};
onMounted(readFocusFromRoute);
onActivated(readFocusFromRoute);
const currentScope = (): ExportScope => (focusedWorkoutId.value
  ? { kind: 'workout', workoutId: focusedWorkoutId.value }
  : { kind: 'dateRange', start: exportStartDate.value, end: exportEndDate.value });

const activeCategory = ref('all');
const templateQuery = ref('');
const activeTemplateId = ref(templates[0].id);
const activeTemplate = computed(() => templates.find((tpl) => tpl.id === activeTemplateId.value) ?? templates[0]);
const editedPrompt = ref(templates[0].prompt);

const filteredTemplates = computed(() =>
  templates.filter((tpl) =>
    (activeCategory.value === 'all' || tpl.category === activeCategory.value)
    && (!templateQuery.value.trim() || tpl.name.includes(templateQuery.value.trim()) || tpl.sub.includes(templateQuery.value.trim())),
  ),
);

const selectTemplate = (tpl: PromptTemplate) => {
  activeTemplateId.value = tpl.id;
  editedPrompt.value = tpl.prompt;
  exportDataTypes.value = [...tpl.types];
};

/* ── 导出格式与目标工具 ────────────────── */
const formats: { key: SaveFormat; label: string; sub: string; icon: IconName }[] = [
  { key: 'json', label: 'JSON', sub: '完整结构化数据', icon: 'braces' },
  { key: 'csv', label: 'CSV', sub: '汇总表（不含逐点序列）', icon: 'table' },
  { key: 'gpx', label: 'GPX', sub: '仅含 GPS 轨迹的运动', icon: 'map' },
];
const activeFormat = ref<SaveFormat>('json');
const activeFormatLabel = computed(
  () => formats.find((format) => format.key === activeFormat.value)?.label ?? 'JSON',
);

const activeProviderId = ref<AiProviderId>('chatgpt');
const activeProvider = computed(() => AI_PROVIDER_BY_ID[activeProviderId.value]);
const providerIconFailed = ref<Partial<Record<AiProviderId, boolean>>>({});
const markProviderIconFailed = (id: AiProviderId) => {
  providerIconFailed.value[id] = true;
};

const { handoffState, handoffError, preparedProvider, prepareAndCopy, retryOpen } = useAiHandoff();

/* ── 数据感知摘要 ─────────────────────── */
const previewBusy = ref(false);
const previewError = ref<string | null>(null);
const previewCount = ref<number | null>(null);
const previewBytes = ref<number | null>(null);
const previewScope = ref<{ startTime: string; endTime: string | null } | null>(null);
const sendState = ref<'idle' | 'copied' | 'failed'>('idle');
let previewTimer = 0;
let previewSeq = 0;

const rangeDays = computed(() => {
  const start = new Date(exportStartDate.value).getTime();
  const end = new Date(exportEndDate.value).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round((end - start) / 86400000) + 1;
});

const datesValid = computed(() =>
  Boolean(exportStartDate.value && exportEndDate.value && exportStartDate.value <= exportEndDate.value),
);

/* 摘要里显示的范围来自后端真正用了的范围。锁定单条运动时显示这条运动的
   起止时刻，而不是页面上那两个和它无关的日期。 */
const scopeRangeText = computed(() => {
  if (focusedWorkoutId.value) {
    if (!previewScope.value) return '这一条运动';
    const start = new Date(previewScope.value.startTime);
    if (Number.isNaN(start.getTime())) return '这一条运动';
    return new Intl.DateTimeFormat(intlLocale(), {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(start);
  }
  return datesValid.value ? `${exportStartDate.value} ~ ${exportEndDate.value}` : '—';
});

const scopeRangeSub = computed(() => {
  if (focusedWorkoutId.value) {
    if (!previewScope.value?.endTime) return '仅这一条运动';
    const start = new Date(previewScope.value.startTime).getTime();
    const end = new Date(previewScope.value.endTime).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return '仅这一条运动';
    return `（约 ${Math.max(1, Math.round((end - start) / 60000))} 分钟）`;
  }
  return rangeDays.value ? `（${rangeDays.value} 天）` : '';
});

/**
 * The picker is grouped because it holds fifteen entries: a flat list that
 * long is hard to scan, and the four sections match how the data is actually
 * organised elsewhere in the app.
 *
 * A template seeds the selection; it does not lock it. Whatever is ticked here
 * is exactly what the export carries, so the summary counts below always
 * describe the file the user is about to get.
 */
const groupedTypes = computed(() =>
  exportTypeGroups
    .map((group) => ({
      group,
      options: exportTypeOptions.filter((option) => option.group === group),
    }))
    .filter((section) => section.options.length > 0),
);

const isTypeSelected = (value: ExportDataType) => exportDataTypes.value.includes(value);

const toggleType = (value: ExportDataType) => {
  const next = new Set(exportDataTypes.value);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  // Keep the picker's own order so the list never reshuffles as it is used.
  exportDataTypes.value = exportTypeOptions
    .map((option) => option.value)
    .filter((option) => next.has(option));
};

const toggleGroup = (group: (typeof exportTypeGroups)[number]) => {
  const options = exportTypeOptions.filter((option) => option.group === group).map((option) => option.value);
  const allOn = options.every((option) => exportDataTypes.value.includes(option));
  const next = new Set(exportDataTypes.value);
  for (const option of options) {
    if (allOn) next.delete(option);
    else next.add(option);
  }
  exportDataTypes.value = exportTypeOptions
    .map((option) => option.value)
    .filter((option) => next.has(option));
};

const groupIsFull = (group: (typeof exportTypeGroups)[number]) =>
  exportTypeOptions
    .filter((option) => option.group === group)
    .every((option) => exportDataTypes.value.includes(option.value));

const formatBytes = (bytes: number | null) => {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const loadPreview = async () => {
  const seq = ++previewSeq;
  previewError.value = null;
  if ((!datesValid.value && !focusedWorkoutId.value) || !exportDataTypes.value.length) {
    previewCount.value = null;
    previewBytes.value = null;
    previewBusy.value = false;
    previewError.value = exportDataTypes.value.length ? null : '请至少选择一种数据类型。';
    return;
  }
  if (!isTauri()) {
    previewCount.value = null;
    previewBytes.value = null;
    previewBusy.value = false;
    previewError.value = '请从 ZeppBridge 桌面应用打开，数据感知需要读取本地记录。';
    return;
  }
  previewBusy.value = true;
  try {
    const encoded = await tauriApi.getExportJson({
      scope: currentScope(),
      dataTypes: [...exportDataTypes.value],
      detail: exportDetail.value,
    });
    if (seq !== previewSeq) return;
    const parsed = JSON.parse(encoded) as {
      record_count?: number;
      records?: unknown[];
      scope?: { kind?: string; start_time?: string; end_time?: string };
    };
    previewCount.value = parsed.record_count ?? parsed.records?.length ?? 0;
    previewBytes.value = new TextEncoder().encode(encoded).length;
    // 摘要里的「时间范围」必须是后端真正用了的范围，而不是页面上那两个日期。
    previewScope.value = parsed.scope?.kind === 'workout' && parsed.scope.start_time
      ? { startTime: parsed.scope.start_time, endTime: parsed.scope.end_time ?? null }
      : null;
  } catch (error) {
    if (seq !== previewSeq) return;
    previewCount.value = null;
    previewBytes.value = null;
    previewError.value = toUserMessage(error, '无法读取本机导出感知数据');
  } finally {
    if (seq === previewSeq) previewBusy.value = false;
  }
};

const schedulePreview = () => {
  window.clearTimeout(previewTimer);
  previewTimer = window.setTimeout(() => { void loadPreview(); }, 280);
};

const ranges = [
  { days: 7, label: '7 天' },
  { days: 30, label: '30 天' },
];
const activeRangeDays = computed(() => {
  for (const range of ranges) {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - Math.max(0, range.days - 1));
    if (localDateString(start) === exportStartDate.value && localDateString(end) === exportEndDate.value) return range.days;
  }
  return null;
});

/* ── 自定义日期选择器弹层逻辑 ─────────────── */
const datePickerOpen = ref<'start' | 'end' | null>(null);
const pickerYear = ref(new Date().getFullYear());
const pickerMonth = ref(new Date().getMonth()); // 0-indexed

const openDatePicker = (target: 'start' | 'end') => {
  const currentVal = target === 'start' ? exportStartDate.value : exportEndDate.value;
  const d = currentVal ? new Date(currentVal) : new Date();
  pickerYear.value = d.getFullYear();
  pickerMonth.value = d.getMonth();
  datePickerOpen.value = target;
};

const closeDatePicker = () => {
  datePickerOpen.value = null;
};

const prevMonth = () => {
  if (pickerMonth.value === 0) {
    pickerMonth.value = 11;
    pickerYear.value -= 1;
  } else {
    pickerMonth.value -= 1;
  }
};

const nextMonth = () => {
  if (pickerMonth.value === 11) {
    pickerMonth.value = 0;
    pickerYear.value += 1;
  } else {
    pickerMonth.value += 1;
  }
};

const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

const calendarDays = computed(() => {
  const firstDay = new Date(pickerYear.value, pickerMonth.value, 1).getDay();
  const daysInMonth = new Date(pickerYear.value, pickerMonth.value + 1, 0).getDate();
  const days = [];
  // 空白占位
  for (let i = 0; i < firstDay; i++) {
    days.push({ day: null, dateStr: '' });
  }
  for (let i = 1; i <= daysInMonth; i++) {
    const dateStr = `${pickerYear.value}-${String(pickerMonth.value + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
    days.push({ day: i, dateStr });
  }
  return days;
});

const selectCalendarDay = (dateStr: string) => {
  if (!dateStr) return;
  if (datePickerOpen.value === 'start') {
    exportStartDate.value = dateStr;
  } else if (datePickerOpen.value === 'end') {
    exportEndDate.value = dateStr;
  }
  closeDatePicker();
};

const copyPrompt = async () => {
  try {
    await navigator.clipboard.writeText(editedPrompt.value);
    sendState.value = 'copied';
    window.setTimeout(() => { sendState.value = 'idle'; }, 2500);
  } catch {
    sendState.value = 'failed';
  }
};

const handoffNotice = ref<string | null>(null);

const sendToAi = async () => {
  handoffNotice.value = null;
  if (!isTauri()) {
    handoffNotice.value = 'AI 交接需要桌面应用环境；当前网页预览不会打开外部网站。';
    return;
  }
  if (!focusedWorkoutId.value && !datesValid.value) {
    handoffNotice.value = '请先选择有效的日期范围。';
    return;
  }
  if (!exportDataTypes.value.length) {
    handoffNotice.value = '请至少选择一种数据类型。';
    return;
  }
  if (previewBusy.value || previewCount.value === null) {
    handoffNotice.value = '正在读取本机记录，请稍候再试。';
    return;
  }
  if (previewCount.value <= 0) {
    handoffNotice.value = '当前范围没有可交接的已同步记录。';
    return;
  }

  const selection: ExportSelection = {
    scope: currentScope(),
    dataTypes: [...exportDataTypes.value],
    detail: exportDetail.value,
  };
  try {
    const result = await prepareAndCopy(
      activeProvider.value,
      selection,
      editedPrompt.value,
      false, // includePreciseRoute: 默认 false 隐私优先
    );
    const browserOpened = handoffState.value !== 'copied_only';
    if (result.mode === 'attachment') {
      const uploadNotice = '数据包已导出到桌面（zeppbridge-ai-handoff.json），拖入 AI 对话框即可。提示词已复制到剪贴板。';
      handoffNotice.value = browserOpened
        ? `${uploadNotice} 已打开 ${activeProvider.value.label}。`
        : `${uploadNotice} 可在浏览器中打开 ${activeProvider.value.label} 进行分析。`;
    } else {
      handoffNotice.value = browserOpened
        ? `已复制脱敏数据并打开 ${activeProvider.value.label}，粘贴即可开始分析。`
        : `已复制脱敏数据，可手动打开 ${activeProvider.value.label} 进行粘贴。`;
    }
  } catch {
    // Error handled via handoffError state
  }
};

const retryOpenAi = async () => {
  try {
    await retryOpen();
    handoffNotice.value = `已打开 ${preparedProvider.value?.label ?? activeProvider.value.label}，请在网站内粘贴提交。`;
  } catch {
    // Error rendered from handoffError
  }
};

// 每种格式都走各自真实的转换与另存；选了 CSV/GPX 却拿到 JSON 属于骗用户。
const runExport = async () => {
  await saveExportAs(activeFormat.value);
};

watch(
  [exportStartDate, exportEndDate, exportDataTypes, exportDetail, focusedWorkoutId],
  schedulePreview,
  { deep: true, immediate: true },
);
watch(dataRevision, () => void loadPreview());
onBeforeUnmount(() => window.clearTimeout(previewTimer));
</script>

<template>
  <section class="page export-page" aria-labelledby="export-title">
    <header class="page-head">
      <h1 id="export-title">交给 AI</h1>
      <p class="page-intro">选择模板、检查感知摘要并导出数据，一键将穿戴洞察发送到前沿 AI 工具。</p>
    </header>

    <div v-if="focusedWorkoutId" class="workout-scope-banner" role="status">
      <Icon name="info" :size="14" />
      当前只导出运动记录 <code>{{ focusedWorkoutId }}</code> 这一条：包含它本身与它进行期间的逐点指标，
      睡眠、步数等按天记录的数据不在范围内。日期范围暂不生效。
      <button class="button secondary" type="button" @click="focusedWorkoutId = null">改回按日期范围</button>
    </div>

    <div class="export-layout">
      <!-- 左列：模板列表 -->
      <aside class="col-templates">
        <section class="surface-card pad">
          <p class="col-title">模板分类</p>
          <div class="category-list" role="group" aria-label="模板分类">
            <button
              v-for="cat in categories"
              :key="cat.key"
              type="button"
              :class="['category-item', { 'is-on': activeCategory === cat.key }]"
              :aria-pressed="activeCategory === cat.key"
              @click="activeCategory = cat.key"
            >
              <Icon :name="cat.icon" :size="15" />
              <span>{{ cat.label }}</span>
              <em>{{ cat.count }}</em>
            </button>
          </div>
        </section>

        <section class="surface-card pad">
          <p class="col-title">模板列表</p>
          <div class="template-search">
            <Icon name="search" :size="14" />
            <input v-model="templateQuery" type="search" placeholder="搜索模板…" aria-label="搜索模板" />
          </div>
          <div class="template-list">
            <button
              v-for="tpl in filteredTemplates"
              :key="tpl.id"
              type="button"
              :class="['template-item', { 'is-on': activeTemplateId === tpl.id }]"
              @click="selectTemplate(tpl)"
            >
              <span class="tpl-icon"><Icon :name="tpl.icon" :size="15" /></span>
              <span class="tpl-copy">
                <strong>{{ tpl.name }}</strong>
                <span>{{ tpl.sub }}</span>
              </span>
              <Icon v-if="activeTemplateId === tpl.id" name="star" :size="14" class="tpl-star" />
            </button>
            <p v-if="!filteredTemplates.length" class="empty-note">没有匹配的模板。</p>
          </div>
        </section>
      </aside>

      <!-- 中列：提示词编辑与数据感知摘要 -->
      <div class="col-editor">
        <section class="surface-card pad current-template">
          <div class="current-head">
            <div>
              <p class="col-title">当前模板</p>
              <h2 class="tpl-name">{{ activeTemplate.name }} <Icon name="edit" :size="15" /></h2>
              <p class="tpl-desc">{{ activeTemplate.sub }}。</p>
            </div>
            <button class="mini-btn" type="button" @click="copyPrompt" title="复制提示词文本到剪贴板">
              <Icon name="copy" :size="13" />复制提示词
            </button>
          </div>

          <div class="prompt-editor">
            <div class="editor-head">
              <span>提示词编辑<em>（数据已自动对齐）</em></span>
              <span class="injected"><Icon name="database" :size="13" />已注入 {{ exportDataTypes.length }} 类数据源</span>
            </div>
            <textarea v-model="editedPrompt" rows="9" spellcheck="false" aria-label="提示词编辑"></textarea>
          </div>

          <!-- 数据感知摘要（四格卡片） -->
          <div class="summary-block">
            <div class="summary-head">
              <span>数据感知摘要 <Icon name="info" :size="13" /></span>
              <span class="see-more">按需精准注入</span>
            </div>
            <div class="summary-grid">
              <div class="summary-cell">
                <span class="cell-label"><Icon name="clock" :size="13" />时间范围</span>
                <strong class="cell-value small">{{ scopeRangeText }}</strong>
                <span class="cell-sub">{{ scopeRangeSub }}</span>
              </div>
              <div class="summary-cell">
                <span class="cell-label"><Icon name="file" :size="13" />记录条数</span>
                <strong class="cell-value font-mono">{{ previewBusy ? '…' : (previewCount === null ? '—' : previewCount.toLocaleString(intlLocale())) }}</strong>
                <span class="cell-sub">已同步记录</span>
              </div>
              <div class="summary-cell">
                <span class="cell-label"><Icon name="sliders" :size="13" />数据类型</span>
                <strong class="cell-value font-mono">{{ exportDataTypes.length }} 类</strong>
                <span class="cell-sub">已选入数据包</span>
              </div>
              <div class="summary-cell">
                <span class="cell-label"><Icon name="database" :size="13" />数据体积</span>
                <strong class="cell-value font-mono">{{ previewBusy ? '…' : formatBytes(previewBytes) }}</strong>
                <span class="cell-sub">预估大小</span>
              </div>
            </div>

            <!-- 范围选择与自定义日期选择器 -->
            <div class="range-row">
              <span class="range-label">快捷范围：</span>
              <button
                v-for="range in ranges"
                :key="range.days"
                type="button"
                :class="['range-pill', { 'is-on': activeRangeDays === range.days }]"
                @click="applyExportRange(range.days)"
              >{{ range.label }}</button>

              <div class="custom-date-picker-wrap">
                <button
                  type="button"
                  class="date-trigger-btn"
                  :class="{ 'is-open': datePickerOpen === 'start' }"
                  @click="datePickerOpen === 'start' ? closeDatePicker() : openDatePicker('start')"
                >
                  <Icon name="clock" :size="12" />
                  <span>{{ exportStartDate || '起始日期' }}</span>
                </button>
                <span>~</span>
                <button
                  type="button"
                  class="date-trigger-btn"
                  :class="{ 'is-open': datePickerOpen === 'end' }"
                  @click="datePickerOpen === 'end' ? closeDatePicker() : openDatePicker('end')"
                >
                  <Icon name="clock" :size="12" />
                  <span>{{ exportEndDate || '结束日期' }}</span>
                </button>

                <!-- 自定义深橄榄底日历弹层 -->
                <div v-if="datePickerOpen" class="calendar-popover" role="dialog" aria-label="日期选择">
                  <div class="cal-header">
                    <button type="button" class="cal-nav-btn" @click="prevMonth"><Icon name="arrow-left" :size="12" /></button>
                    <span class="cal-title">{{ pickerYear }}年 {{ monthNames[pickerMonth] }}</span>
                    <button type="button" class="cal-nav-btn" @click="nextMonth"><Icon name="arrow-right" :size="12" /></button>
                  </div>
                  <div class="cal-weekdays">
                    <span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span>
                  </div>
                  <div class="cal-grid">
                    <button
                      v-for="(item, idx) in calendarDays"
                      :key="idx"
                      type="button"
                      :disabled="!item.day"
                      :class="['cal-day', {
                        'is-empty': !item.day,
                        'is-selected': item.dateStr === (datePickerOpen === 'start' ? exportStartDate : exportEndDate)
                      }]"
                      @click="selectCalendarDay(item.dateStr)"
                    >
                      {{ item.day || '' }}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <footer class="editor-footer surface-card">
          <p class="secure-note">
            <Icon name="shield" :size="14" />
            已采用本地脱敏隔离，仅在本地生成结构化数据与提示词。
            <span class="secure-ok"><Icon name="circle-check" :size="13" />安全可靠</span>
          </p>
          <div class="footer-actions">
            <!-- 三个按钮做的是三件不同的事，名字得让人分得开：
                 「导出文件」存到磁盘、「只复制提示词」不含数据、
                 「交给 X」才是数据+提示词一起复制并打开那个网站。 -->
            <button class="button button-secondary" type="button" :disabled="Boolean(exportBusy)" @click="runExport">
              <Icon name="export" :size="14" />导出 {{ activeFormatLabel }} 文件
            </button>
            <button class="button button-secondary" type="button" @click="copyPrompt">
              <Icon name="copy" :size="14" />只复制提示词
            </button>
            <button class="button button-primary send-btn" type="button" :disabled="handoffState === 'preparing'" @click="sendToAi">
              <Icon :name="handoffState === 'preparing' ? 'clock' : 'send'" :size="14" />{{ handoffState === 'preparing' ? '正在准备…' : `交给 ${activeProvider.label}` }}
            </button>
          </div>
        </footer>

        <p v-if="sendState === 'copied'" class="action-note ok" role="status"><Icon name="circle-check" :size="13" />提示词已复制（不含数据）。</p>
        <p v-else-if="sendState === 'failed'" class="action-note bad" role="alert"><Icon name="warning" :size="13" />复制失败，请重试。</p>
        <p v-if="handoffNotice" class="action-note" :class="handoffState === 'failed' ? 'bad' : 'ok'" role="status">{{ handoffNotice }}</p>
        <p v-if="handoffError" class="action-note bad" role="alert"><Icon name="warning" :size="13" />{{ handoffError }}</p>
        <button
          v-if="handoffState === 'copied_only'"
          class="button button-secondary retry-open"
          type="button"
          @click="retryOpenAi"
        ><Icon name="external" :size="14" />重试打开 {{ preparedProvider?.label ?? activeProvider.label }}</button>
        <p v-if="exportMessage" class="action-note ok" role="status"><Icon name="circle-check" :size="13" />{{ exportMessage }}</p>
        <p v-if="exportError" class="action-note bad" role="alert"><Icon name="warning" :size="13" />{{ exportError }}</p>
      </div>

      <!-- 右列：打包选项与目标 AI -->
      <aside class="col-send">
        <section class="surface-card pad">
          <p class="col-title big">打包与发送</p>
          <p class="col-sub">选择导出格式与目标 AI 工具。</p>

          <p class="group-label">导出格式</p>
          <div class="format-grid" role="radiogroup" aria-label="导出格式">
            <button
              v-for="format in formats"
              :key="format.key"
              type="button"
              role="radio"
              :aria-checked="activeFormat === format.key"
              :class="['format-card', { 'is-on': activeFormat === format.key }]"
              @click="activeFormat = format.key"
            >
              <Icon v-if="activeFormat === format.key" name="circle-check" :size="14" class="format-check" />
              <Icon :name="format.icon" :size="20" />
              <strong>{{ format.label }}</strong>
              <span>{{ format.sub }}</span>
            </button>
          </div>

          <p class="group-label">详细程度</p>
          <div class="format-grid detail-grid" role="radiogroup" aria-label="详细程度">
            <button
              v-for="option in exportDetailOptions"
              :key="option.value"
              type="button"
              role="radio"
              :aria-checked="exportDetail === option.value"
              :class="['format-card', { 'is-on': exportDetail === option.value }]"
              @click="exportDetail = option.value"
            >
              <Icon v-if="exportDetail === option.value" name="circle-check" :size="14" class="format-check" />
              <strong>{{ option.label }}</strong>
              <span>{{ option.hint }}</span>
            </button>
          </div>

          <div class="group-row">
            <p class="group-label">数据流</p>
            <span class="see-more">已选 {{ exportDataTypes.length }} / {{ exportTypeOptions.length }} 项</span>
          </div>
          <div class="stream-picker">
            <div v-for="section in groupedTypes" :key="section.group" class="stream-group">
              <button
                type="button"
                class="stream-group-head"
                :aria-pressed="groupIsFull(section.group)"
                @click="toggleGroup(section.group)"
              >
                <span>{{ section.group }}</span>
                <em>{{ groupIsFull(section.group) ? '全不选' : '全选' }}</em>
              </button>
              <label
                v-for="option in section.options"
                :key="option.value"
                :class="['stream-row', { 'is-on': isTypeSelected(option.value) }]"
              >
                <input
                  type="checkbox"
                  :checked="isTypeSelected(option.value)"
                  @change="toggleType(option.value)"
                />
                <span>{{ option.label }}</span>
                <Icon v-if="isTypeSelected(option.value)" name="circle-check" :size="14" class="content-check" />
              </label>
            </div>
            <p v-if="!exportDataTypes.length" class="empty-note">尚未选择数据类型，导出会被拒绝。</p>
          </div>

          <div class="size-row">
            <span>数据包预估体积</span>
            <strong class="font-mono">{{ previewBusy ? '…' : formatBytes(previewBytes) }}</strong>
          </div>

          <p class="group-label">目标 AI 工具</p>
          <div class="tool-grid" role="radiogroup" aria-label="目标 AI 工具">
            <button
              v-for="tool in AI_PROVIDERS"
              :key="tool.id"
              type="button"
              role="radio"
              :aria-checked="activeProviderId === tool.id"
              :class="['tool-card', { 'is-on': activeProviderId === tool.id }]"
              @click="activeProviderId = tool.id"
            >
              <Icon v-if="activeProviderId === tool.id" name="circle-check" :size="13" class="tool-check" />
              <span class="tool-logo">
                <img
                  v-if="!providerIconFailed[tool.id]"
                  :src="tool.localIcon"
                  :alt="`${tool.label} 图标`"
                  @error="markProviderIconFailed(tool.id)"
                />
                <span v-else class="tool-fallback" aria-hidden="true">{{ tool.fallback }}</span>
              </span>
              <span>{{ tool.label }}</span>
            </button>
          </div>

          <p class="send-hint">
            <Icon name="info" :size="13" />
            ≤ 2 MiB 自动随提示词复制到剪贴板；> 2 MiB 会直接导出 JSON 到桌面，拖入对话即可。
          </p>
        </section>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.export-page.page { display: grid; gap: 16px; }
.stream-picker { display: grid; gap: 10px; margin-bottom: 14px; }
.stream-group { display: grid; gap: 3px; }
.stream-group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 3px 2px;
  border: 0;
  background: transparent;
  color: var(--subtle);
  font-size: 11px;
  cursor: pointer;
}
.stream-group-head:hover em { color: var(--accent); }
.stream-group-head em { color: var(--faint); font-style: normal; }
.stream-row {
  display: grid;
  grid-template-columns: 15px minmax(0, 1fr) 14px;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  padding: 4px 8px;
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--muted);
  font-size: 12px;
  cursor: pointer;
}
.stream-row:hover { background: var(--surface-raised); }
.stream-row.is-on { border-color: var(--line-strong); background: var(--surface-raised); color: var(--ink); }
.stream-row input { width: 13px; height: 13px; margin: 0; accent-color: var(--accent); cursor: pointer; }
.page-head h1 { margin-bottom: 6px; font-size: 24px; font-weight: 700; color: var(--ink); }

.workout-scope-banner { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface-raised); color: var(--subtle); font-size: 12px; }
.workout-scope-banner code { color: var(--ink); font-family: var(--font-mono); font-size: 11px; }
.workout-scope-banner .button { margin-left: auto; }
/* 三栏底部对齐。
 *
 * 以前每一栏只有内容那么高，于是「模板列表」到底、右栏空一截、中栏又多一截，
 * 页面底边像被啃过。现在三栏拉平到最高的那一栏，各栏最后一块面板补足高度，
 * 内容过长的列表在自己内部滚动，而不是把整页顶长。 */
.export-layout {
  display: grid;
  /* 两侧用比例而不是死宽度。
     界面缩放调到 80% 时，可用的 CSS 宽度变大，固定的 240px / 290px 侧栏就
     显得越来越细，中间那栏一个人吃掉多出来的全部空间——三栏看着就散了。
     用 minmax(下限, 百分比) 让它们跟着一起长，同时保住可读的最小宽度。 */
  grid-template-columns: minmax(210px, 17%) minmax(0, 1fr) minmax(260px, 22%);
  gap: 16px;
  align-items: stretch;
}
.col-templates, .col-send { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.col-editor { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.col-templates > :last-child,
.col-send > :last-child { flex: 1 1 auto; }
/* 中间栏撑高的必须是**编辑区那张卡**，不是最后一个元素。
   按「最后一个」拉伸时，被拉伸的是底部那条操作栏（里面只有一句安全说明和
   三个按钮），于是它被抻成大半屏空白，说明文字孤零零浮在正中间。 */
.col-editor > .current-template { flex: 1 1 auto; }
.col-editor > .editor-footer { flex: 0 0 auto; }
.col-templates > :last-child { display: flex; flex-direction: column; min-height: 0; }
.col-templates > :last-child .template-list { overflow-y: auto; min-height: 0; }
.pad { padding: 16px; }
.col-title { margin: 0 0 10px; color: var(--ink); font-size: 13px; font-weight: 700; }
.col-title.big { font-size: 15px; margin-bottom: 4px; }
.col-sub { margin: 0 0 14px; color: var(--muted); font-size: 12px; }

/* 模板分类 */
.category-list { display: grid; gap: 4px; }
.category-item {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 36px;
  padding: 7px 10px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  color: var(--muted);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: all 140ms ease;
}
.category-item:hover { background: var(--surface-hover); color: var(--ink); }
.category-item.is-on { background: var(--accent-soft); border-color: rgba(205, 220, 124, .2); color: var(--accent); font-weight: 600; }
.category-item span { flex: 1; }
.category-item em { font-style: normal; font-size: 11px; color: var(--subtle); font-family: var(--font-mono); }
.category-item.is-on em { color: var(--accent); }

/* 模板列表 */
.template-search {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 10px;
  padding: 7px 10px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--surface-raised);
  color: var(--subtle);
}
.template-search input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--ink); font-size: 12px; }
.template-list { display: grid; gap: 6px; }
.template-item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: var(--surface-raised);
  text-align: left;
  cursor: pointer;
  transition: border-color 140ms ease, background 140ms ease;
}
.template-item:hover { border-color: var(--line-strong); }
.template-item.is-on { border-color: rgba(205, 220, 124, .4); background: var(--accent-soft); }
.tpl-icon {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--muted);
}
.template-item.is-on .tpl-icon { color: var(--accent); }
.tpl-copy { display: grid; gap: 1px; min-width: 0; flex: 1; }
.tpl-copy strong { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink); }
.tpl-copy span { color: var(--subtle); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tpl-star { color: var(--accent); }
.empty-note { margin: 4px 0; color: var(--subtle); font-size: 12px; }

/* 当前模板与编辑器 */
.current-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.current-head .col-title { margin-bottom: 2px; color: var(--muted); font-weight: 400; font-size: 12px; }
.tpl-name { display: inline-flex; align-items: center; gap: 8px; margin: 0 0 4px; color: var(--accent); font-size: 20px; font-weight: 700; }
.tpl-name svg { color: var(--subtle); }
.tpl-desc { margin: 0; color: var(--muted); font-size: 12px; }
.mini-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  padding: 6px 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface-raised);
  color: var(--muted);
  font-size: 12px;
  cursor: pointer;
  transition: all 140ms ease;
}
.mini-btn:hover { color: var(--accent); border-color: var(--accent); }

/* 中间这一栏被拉到和最高的一栏齐平（三栏底边要对齐）。多出来的高度必须
   有人吃掉，否则就是一大片空白卡片——空白比参差更难看。
   让提示词编辑框吃掉：多出来的空间变成更大的编辑区，是有用的。 */
.col-editor > .current-template { display: flex; flex-direction: column; min-height: 0; }
.col-editor > .current-template .summary-block { flex: 0 0 auto; }
.prompt-editor { display: flex; flex: 1 1 auto; flex-direction: column; min-height: 190px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface-raised); overflow: hidden; margin-bottom: 14px; }
.editor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 12px;
  border-bottom: 1px solid var(--line);
  color: var(--ink);
  font-size: 12px;
  font-weight: 600;
}
.editor-head em { color: var(--subtle); font-weight: 400; font-style: normal; }
.injected { display: inline-flex; align-items: center; gap: 5px; color: var(--accent); font-weight: 400; font-size: 11px; }
.prompt-editor textarea {
  display: block;
  width: 100%;
  flex: 1 1 auto;
  min-height: 150px;
  border: 0;
  outline: 0;
  resize: none;
  padding: 12px 14px;
  background: transparent;
  color: var(--ink);
  font-family: var(--font-sans);
  font-size: 12.5px;
  line-height: 1.8;
}

/* 数据感知摘要（四格卡片） */
.summary-block { border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 12px 14px; margin-bottom: 0; background: var(--surface-raised); position: relative; }
.summary-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; font-size: 12px; font-weight: 600; color: var(--ink); }
.summary-head span:first-child { display: inline-flex; align-items: center; gap: 5px; }
.see-more { color: var(--subtle); font-size: 11px; font-weight: 400; }
.summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1px; border: 1px solid var(--line); border-radius: 9px; overflow: hidden; background: var(--line); }
.summary-cell { display: grid; gap: 3px; padding: 10px 12px; background: var(--surface); min-width: 0; }
.cell-label { display: inline-flex; align-items: center; gap: 5px; color: var(--subtle); font-size: 11px; }
.cell-value { color: var(--ink); font-size: 15px; font-weight: 600; }
.cell-value.small { font-size: 12px; }
.cell-sub { color: var(--subtle); font-size: 11px; }
.font-mono { font-family: var(--font-mono); }

/* 快捷范围与深色日期选择器 */
.range-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 10px; color: var(--subtle); font-size: 12px; position: relative; }
.range-label { color: var(--subtle); font-size: 11px; }
.range-pill {
  padding: 3px 10px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  font-size: 11px;
  cursor: pointer;
}
.range-pill.is-on { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }

.custom-date-picker-wrap { display: inline-flex; align-items: center; gap: 6px; position: relative; }
.date-trigger-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--surface);
  color: var(--ink);
  font-size: 11px;
  font-family: var(--font-mono);
  cursor: pointer;
}
.date-trigger-btn.is-open { border-color: var(--accent); }
.date-trigger-btn:hover { border-color: var(--line-strong); }

/* 自绘日历弹层 */
.calendar-popover {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 50;
  width: 220px;
  padding: 10px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  box-shadow: 0 8px 24px rgba(0, 0, 0, .4);
}
.cal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.cal-title { font-size: 12px; font-weight: 600; color: var(--ink); }
.cal-nav-btn { display: grid; place-items: center; width: 22px; height: 22px; border: 0; border-radius: 4px; background: var(--surface-raised); color: var(--muted); cursor: pointer; }
.cal-nav-btn:hover { color: var(--accent); }
.cal-weekdays { display: grid; grid-template-columns: repeat(7, 1fr); text-align: center; font-size: 10px; color: var(--subtle); margin-bottom: 4px; }
.cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.cal-day {
  display: grid;
  place-items: center;
  height: 24px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--ink);
  font-size: 11px;
  font-family: var(--font-mono);
  cursor: pointer;
}
.cal-day:hover:not(:disabled) { background: var(--surface-hover); }
.cal-day.is-selected { background: var(--accent); color: var(--accent-ink); font-weight: 700; }
.cal-day.is-empty { cursor: default; }

/* 底部操作条 */
.editor-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 16px;
  flex-wrap: wrap;
}
.secure-note { display: inline-flex; align-items: center; gap: 7px; margin: 0; color: var(--muted); font-size: 12px; flex-wrap: wrap; }
.secure-note > svg { color: var(--accent); }
.secure-ok { display: inline-flex; align-items: center; gap: 4px; color: var(--accent); }
.footer-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.send-btn { min-width: 128px; }
.action-note { display: inline-flex; align-items: center; gap: 6px; margin: 0; font-size: 12px; }
.action-note.ok { color: var(--accent); }
.action-note.bad { color: var(--danger); }

/* 右列 */
.group-label { margin: 0 0 8px; color: var(--ink); font-size: 12px; font-weight: 700; }
.group-row { display: flex; align-items: center; justify-content: space-between; margin-top: 16px; }
.group-row .group-label { margin: 0; }
.format-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-bottom: 4px; }
.format-card {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 4px;
  padding: 12px 6px 10px;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: var(--surface-raised);
  color: var(--muted);
  font-size: 11px;
  cursor: pointer;
  transition: all 140ms ease;
}
.format-card strong { color: var(--ink); font-size: 12px; }
.format-card span { color: var(--subtle); font-size: 10px; }
.format-card.is-on { border-color: var(--accent); background: var(--accent-soft); }
.format-card.is-on svg, .format-card.is-on strong { color: var(--accent); }
.format-check { position: absolute; top: 6px; right: 6px; }

.content-check { color: var(--accent); }

.size-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 14px 0 16px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--surface-raised);
  color: var(--muted);
  font-size: 12px;
}
.size-row strong { color: var(--accent); font-variant-numeric: tabular-nums; }

.tool-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.tool-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 42px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface-raised);
  color: var(--ink);
  font-size: 12px;
  cursor: pointer;
  transition: border-color 140ms ease;
}
.tool-card.is-on { border-color: var(--accent); background: var(--accent-soft); }
.tool-logo {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  border-radius: 50%;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--muted);
}
.tool-logo img { width: 16px; height: 16px; object-fit: contain; }
.tool-fallback { color: var(--muted); font-size: 12px; font-weight: 700; line-height: 1; }
.tool-card.is-on .tool-logo { color: var(--accent); }
.tool-check { position: absolute; top: 5px; right: 6px; color: var(--accent); }

.send-hint { display: flex; align-items: flex-start; gap: 6px; margin: 14px 0 0; color: var(--subtle); font-size: 11px; line-height: 1.45; }
.retry-open { width: fit-content; margin-top: 2px; }

/* 响应式 */
@media (max-width: 1180px) {
  .export-layout { grid-template-columns: minmax(200px, 24%) minmax(0, 1fr); }
  .col-send { grid-column: 1 / -1; }
  .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 820px) {
  .export-layout { grid-template-columns: minmax(0, 1fr); }
  .format-grid, .tool-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 520px) {
  .summary-grid { grid-template-columns: minmax(0, 1fr); }
  .format-grid, .tool-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
