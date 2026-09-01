<script setup lang="ts">
defineOptions({ name: 'Explore' });
import { computed, nextTick, onActivated, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import Icon from '../components/Icon.vue';
import CoverageNotice from '../components/CoverageNotice.vue';
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
import { popoverStyle } from '../lib/popoverPosition';
import { rangeOptions } from '../lib/rangeOptions';
import { AI_PROVIDERS, AI_PROVIDER_BY_ID, type AiProviderId } from '../lib/aiProviders';
import type { ExportDataType, ExportScope, ExportSelection, ExportTypeGroup } from '../types';
import { exploreMessages, promptTemplates, type PromptTemplate } from './Explore.i18n';
import { intlLocale, locale, useMessages } from '../i18n';

const t = useMessages(exploreMessages);

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

/** 导出快捷范围。比图表多一档 3 个月，因为导出常按季度来。 */
const EXPORT_RANGE_DAYS = [7, 30, 90, 180] as const;

/* 模板文案（含六段提示词）在 Explore.i18n.ts。 */
const templates = computed<PromptTemplate[]>(() => promptTemplates());

const categories = computed(() => {
  const list = templates.value;
  const count = (key: string) => list.filter((tpl) => tpl.category === key).length;
  return [
    { key: 'all', label: t.value.categoryAll, icon: 'grid' as IconName, count: list.length },
    { key: 'summary', label: t.value.categorySummary, icon: 'file' as IconName, count: count('summary') },
    { key: 'training', label: t.value.categoryTraining, icon: 'activity' as IconName, count: count('training') },
    { key: 'recovery', label: t.value.categoryRecovery, icon: 'heart' as IconName, count: count('recovery') },
    { key: 'sleep', label: t.value.categorySleep, icon: 'moon' as IconName, count: count('sleep') },
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
const activeTemplateId = ref(templates.value[0].id);
const activeTemplate = computed(() =>
  templates.value.find((tpl) => tpl.id === activeTemplateId.value) ?? templates.value[0]);
const editedPrompt = ref(templates.value[0].prompt);
/* 换语言时，没动过的提示词跟着换成另一种语言的那一份；动过的一个字都不碰
   ——用户自己写的东西不该被一次语言切换抹掉。
   用一个「改过没有」的标记，而不是拿当前文本去和模板比对：切完语言之后
   模板已经是新语言了，比不出来。 */
const promptEdited = ref(false);
watch(locale, () => {
  if (!promptEdited.value) editedPrompt.value = activeTemplate.value.prompt;
});

const filteredTemplates = computed(() =>
  templates.value.filter((tpl) =>
    (activeCategory.value === 'all' || tpl.category === activeCategory.value)
    && (!templateQuery.value.trim() || tpl.name.includes(templateQuery.value.trim()) || tpl.sub.includes(templateQuery.value.trim())),
  ),
);

const selectTemplate = (tpl: PromptTemplate) => {
  activeTemplateId.value = tpl.id;
  editedPrompt.value = tpl.prompt;
  promptEdited.value = false;
  exportDataTypes.value = [...tpl.types];
};

/* ── 导出格式与目标工具 ────────────────── */
const formats = computed<{ key: SaveFormat; label: string; sub: string; icon: IconName }[]>(() => [
  { key: 'json', label: 'JSON', sub: t.value.formatJsonSub, icon: 'braces' },
  { key: 'csv', label: 'CSV', sub: t.value.formatCsvSub, icon: 'table' },
  { key: 'gpx', label: 'GPX', sub: t.value.formatGpxSub, icon: 'map' },
]);
const activeFormat = ref<SaveFormat>('json');
const activeFormatLabel = computed(
  () => formats.value.find((format) => format.key === activeFormat.value)?.label ?? 'JSON',
);
const detailOptions = computed(() => exportDetailOptions());

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
    if (!previewScope.value) return t.value.thisWorkout;
    const start = new Date(previewScope.value.startTime);
    if (Number.isNaN(start.getTime())) return t.value.thisWorkout;
    return new Intl.DateTimeFormat(intlLocale(), {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(start);
  }
  return datesValid.value ? `${exportStartDate.value} ~ ${exportEndDate.value}` : '—';
});

const scopeRangeSub = computed(() => {
  if (focusedWorkoutId.value) {
    if (!previewScope.value?.endTime) return t.value.onlyThisWorkout;
    const start = new Date(previewScope.value.startTime).getTime();
    const end = new Date(previewScope.value.endTime).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return t.value.onlyThisWorkout;
    return t.value.approxMinutes(Math.max(1, Math.round((end - start) / 60000)));
  }
  return rangeDays.value ? t.value.rangeDays(rangeDays.value) : '';
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
const typeOptions = computed(() => exportTypeOptions());

const groupedTypes = computed(() =>
  exportTypeGroups()
    .map((group) => ({
      key: group.key,
      label: group.label,
      options: typeOptions.value.filter((option) => option.group === group.key),
    }))
    .filter((section) => section.options.length > 0),
);

const isTypeSelected = (value: ExportDataType) => exportDataTypes.value.includes(value);

const toggleType = (value: ExportDataType) => {
  const next = new Set(exportDataTypes.value);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  // Keep the picker's own order so the list never reshuffles as it is used.
  exportDataTypes.value = typeOptions.value
    .map((option) => option.value)
    .filter((option) => next.has(option));
};

const toggleGroup = (group: ExportTypeGroup) => {
  const options = typeOptions.value.filter((option) => option.group === group).map((option) => option.value);
  const allOn = options.every((option) => exportDataTypes.value.includes(option));
  const next = new Set(exportDataTypes.value);
  for (const option of options) {
    if (allOn) next.delete(option);
    else next.add(option);
  }
  exportDataTypes.value = typeOptions.value
    .map((option) => option.value)
    .filter((option) => next.has(option));
};

const groupIsFull = (group: ExportTypeGroup) =>
  typeOptions.value
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
    previewError.value = exportDataTypes.value.length ? null : t.value.needDataTypes;
    return;
  }
  if (!isTauri()) {
    previewCount.value = null;
    previewBytes.value = null;
    previewBusy.value = false;
    previewError.value = t.value.previewDesktopOnly;
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
    previewError.value = toUserMessage(error, t.value.previewFailed);
  } finally {
    if (seq === previewSeq) previewBusy.value = false;
  }
};

const schedulePreview = () => {
  window.clearTimeout(previewTimer);
  previewTimer = window.setTimeout(() => { void loadPreview(); }, 280);
};

/* 和训练/身体页用同一条梯子（lib/rangeOptions.ts）。以前这里只有 7 天和 30 天，
   想导出半年只能手点日历两下，而图表页明明就摆着一个「6 个月」按钮——
   两处对不上，是「我选了 6 个月却只拿到 30 天」这类误会的一半来源。 */
const ranges = computed(() => rangeOptions(EXPORT_RANGE_DAYS));
/* 选中的范围往回够到多少天。给 CoverageNotice 用：导出读的也是本机库，
   选了半年而库里只有 30 天时，导出文件会安静地只装 30 天。 */
const requestedSpanDays = computed(() => {
  if (focusedWorkoutId.value) return 0;
  if (!exportStartDate.value) return 0;
  const start = Date.parse(`${exportStartDate.value}T00:00:00`);
  if (!Number.isFinite(start)) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - start) / 86_400_000) + 1;
});

const activeRangeDays = computed(() => {
  for (const range of ranges.value) {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - Math.max(0, range.days - 1));
    if (localDateString(start) === exportStartDate.value && localDateString(end) === exportEndDate.value) return range.days;
  }
  return null;
});

/* ── 自定义日期选择器弹层逻辑 ─────────────── */
/*
 * 日历 Teleport 到 body 并用 fixed 定位。
 *
 * 上一版是 `position: absolute; top: calc(100% + 6px); right: 0`，钉死向下
 * 展开。「快捷范围」这一行本来就靠近面板底部，于是日历整块落到窗口下沿之外，
 * 既看不见也滚不到 —— 这就是 issue #9。只调 z-index 或 overflow 都救不回来：
 * 绝对定位的浮层出不了它的包含块。
 *
 * 翻转和夹取的算法与 SelectMenu 共用 `lib/popoverPosition.ts`，两个浮层不该
 * 各写一套、各错一次。
 */
const CALENDAR_WIDTH = 220;
const CALENDAR_MAX_HEIGHT = 300;

const datePickerOpen = ref<'start' | 'end' | null>(null);
const pickerYear = ref(new Date().getFullYear());
const pickerMonth = ref(new Date().getMonth()); // 0-indexed
const startTriggerRef = ref<HTMLElement | null>(null);
const endTriggerRef = ref<HTMLElement | null>(null);
const calendarRef = ref<HTMLElement | null>(null);
const calendarStyle = ref<Record<string, string>>({});

const activeTrigger = () =>
  (datePickerOpen.value === 'start' ? startTriggerRef.value : endTriggerRef.value);

const measureDatePicker = () => {
  const trigger = activeTrigger();
  if (!trigger) return;
  const rect = trigger.getBoundingClientRect();
  calendarStyle.value = popoverStyle(
    { top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width },
    { width: window.innerWidth, height: window.innerHeight },
    { maxHeight: CALENDAR_MAX_HEIGHT, width: CALENDAR_WIDTH },
  ) as unknown as Record<string, string>;
};

const openDatePicker = (target: 'start' | 'end') => {
  const currentVal = target === 'start' ? exportStartDate.value : exportEndDate.value;
  const d = currentVal ? new Date(currentVal) : new Date();
  pickerYear.value = d.getFullYear();
  pickerMonth.value = d.getMonth();
  datePickerOpen.value = target;
  // 触发按钮的位置要在 DOM 更新后才准，但 v-if 的浮层还没挂上来，
  // 先按当前按钮量一次，挂上之后 watch 里再量一次。
  void nextTick(measureDatePicker);
};

const closeDatePicker = (restoreFocus = false) => {
  const trigger = activeTrigger();
  datePickerOpen.value = null;
  if (restoreFocus) trigger?.focus();
};

/* 浮层已经不在按钮旁边了，页面一滚它就会停在原地；跟着重新量比强行关掉
   更不打断人，窗口尺寸变化同理。和 SelectMenu 的处理保持一致。 */
const repositionDatePicker = () => {
  if (!datePickerOpen.value) return;
  measureDatePicker();
};

const onDatePickerKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && datePickerOpen.value) {
    event.preventDefault();
    closeDatePicker(true);
  }
};

/* 捕获阶段监听：日历被 Teleport 到 body 之后已经不在 `.range-row` 里，
   只判断触发按钮会让「点日期」在 click 落地前就被关掉，于是怎么点都选不中。
   两边都要放行。 */
const onDatePickerPointerDown = (event: PointerEvent) => {
  if (!datePickerOpen.value) return;
  const target = event.target as Node;
  if (calendarRef.value?.contains(target)) return;
  if (startTriggerRef.value?.contains(target)) return;
  if (endTriggerRef.value?.contains(target)) return;
  closeDatePicker();
};

watch(datePickerOpen, (open) => {
  if (open) {
    void nextTick(measureDatePicker);
    window.addEventListener('pointerdown', onDatePickerPointerDown, true);
    window.addEventListener('scroll', repositionDatePicker, true);
    window.addEventListener('resize', repositionDatePicker);
    window.addEventListener('keydown', onDatePickerKeydown);
  } else {
    window.removeEventListener('pointerdown', onDatePickerPointerDown, true);
    window.removeEventListener('scroll', repositionDatePicker, true);
    window.removeEventListener('resize', repositionDatePicker);
    window.removeEventListener('keydown', onDatePickerKeydown);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onDatePickerPointerDown, true);
  window.removeEventListener('scroll', repositionDatePicker, true);
  window.removeEventListener('resize', repositionDatePicker);
  window.removeEventListener('keydown', onDatePickerKeydown);
});

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

/* 月份和星期名交给 Intl，不再写死中文数组：英文界面上「2026年 8月」
   既不是英文也不是任何人的日期写法。 */
const calendarTitle = computed(() => new Intl.DateTimeFormat(intlLocale(), {
  year: 'numeric', month: 'long',
}).format(new Date(pickerYear.value, pickerMonth.value, 1)));

const weekdayNames = computed(() => {
  // 2026-01-04 是星期日，从它数七天就是一周的表头。
  const sunday = new Date(2026, 0, 4);
  const formatter = new Intl.DateTimeFormat(intlLocale(), {
    weekday: locale.value === 'zh' ? 'narrow' : 'short',
  });
  return Array.from({ length: 7 }, (_unused, offset) =>
    formatter.format(new Date(2026, 0, sunday.getDate() + offset)));
});

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
  closeDatePicker(true);
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
    handoffNotice.value = t.value.needDesktop;
    return;
  }
  if (!focusedWorkoutId.value && !datesValid.value) {
    handoffNotice.value = t.value.needValidDates;
    return;
  }
  if (!exportDataTypes.value.length) {
    handoffNotice.value = t.value.needDataTypes;
    return;
  }
  if (previewBusy.value || previewCount.value === null) {
    handoffNotice.value = t.value.stillReading;
    return;
  }
  if (previewCount.value <= 0) {
    handoffNotice.value = t.value.nothingInScope;
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
      const uploadNotice = t.value.attachmentNotice;
      handoffNotice.value = browserOpened
        ? t.value.attachmentOpened(uploadNotice, activeProvider.value.label)
        : t.value.attachmentNotOpened(uploadNotice, activeProvider.value.label);
    } else {
      handoffNotice.value = browserOpened
        ? t.value.copiedAndOpened(activeProvider.value.label)
        : t.value.copiedOnly(activeProvider.value.label);
    }
  } catch {
    // Error handled via handoffError state
  }
};

const retryOpenAi = async () => {
  try {
    await retryOpen();
    handoffNotice.value = t.value.reopened(preparedProvider.value?.label ?? activeProvider.value.label);
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
      <h1 id="export-title">{{ t.title }}</h1>
      <p class="page-intro">{{ t.intro }}</p>
    </header>

    <div v-if="focusedWorkoutId" class="workout-scope-banner" role="status">
      <Icon name="info" :size="14" />
      {{ t.workoutScopeBanner(focusedWorkoutId) }}
      <button class="button secondary" type="button" @click="focusedWorkoutId = null">{{ t.backToDateRange }}</button>
    </div>

    <div class="export-layout">
      <!-- 左列：模板列表 -->
      <aside class="col-templates">
        <section class="surface-card pad">
          <p class="col-title">{{ t.categoryTitle }}</p>
          <div class="category-list" role="group" :aria-label="t.categoryAria">
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
          <p class="col-title">{{ t.templateListTitle }}</p>
          <div class="template-search">
            <Icon name="search" :size="14" />
            <input v-model="templateQuery" type="search" :placeholder="t.templateSearchPlaceholder" :aria-label="t.templateSearchAria" />
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
            <p v-if="!filteredTemplates.length" class="empty-note">{{ t.noTemplates }}</p>
          </div>
        </section>
      </aside>

      <!-- 中列：提示词编辑与数据感知摘要 -->
      <div class="col-editor">
        <section class="surface-card pad current-template">
          <div class="current-head">
            <div>
              <p class="col-title">{{ t.currentTemplate }}</p>
              <h2 class="tpl-name">{{ activeTemplate.name }} <Icon name="edit" :size="15" /></h2>
              <p class="tpl-desc">{{ activeTemplate.sub }}</p>
            </div>
            <button class="mini-btn" type="button" @click="copyPrompt" :title="t.copyPromptTitle">
              <Icon name="copy" :size="13" />{{ t.copyPrompt }}
            </button>
          </div>

          <div class="prompt-editor">
            <div class="editor-head">
              <span>{{ t.promptEditor }}<em>{{ t.promptEditorHint }}</em></span>
              <span class="injected"><Icon name="database" :size="13" />{{ t.injected(exportDataTypes.length) }}</span>
            </div>
            <textarea
              v-model="editedPrompt"
              rows="9"
              spellcheck="false"
              :aria-label="t.promptEditorAria"
              @input="promptEdited = true"
            ></textarea>
          </div>

          <!-- 数据感知摘要（四格卡片） -->
          <div class="summary-block">
            <div class="summary-head">
              <span>{{ t.summaryTitle }} <Icon name="info" :size="13" /></span>
              <span class="see-more">{{ t.summaryHint }}</span>
            </div>
            <div class="summary-grid">
              <div class="summary-cell">
                <span class="cell-label"><Icon name="clock" :size="13" />{{ t.cellRange }}</span>
                <strong class="cell-value small">{{ scopeRangeText }}</strong>
                <span class="cell-sub">{{ scopeRangeSub }}</span>
              </div>
              <div class="summary-cell">
                <span class="cell-label"><Icon name="file" :size="13" />{{ t.cellCount }}</span>
                <strong class="cell-value font-mono">{{ previewBusy ? '…' : (previewCount === null ? '—' : previewCount.toLocaleString(intlLocale())) }}</strong>
                <span class="cell-sub">{{ t.cellCountSub }}</span>
              </div>
              <div class="summary-cell">
                <span class="cell-label"><Icon name="sliders" :size="13" />{{ t.cellTypes }}</span>
                <strong class="cell-value font-mono">{{ t.cellTypesValue(exportDataTypes.length) }}</strong>
                <span class="cell-sub">{{ t.cellTypesSub }}</span>
              </div>
              <div class="summary-cell">
                <span class="cell-label"><Icon name="database" :size="13" />{{ t.cellSize }}</span>
                <strong class="cell-value font-mono">{{ previewBusy ? '…' : formatBytes(previewBytes) }}</strong>
                <span class="cell-sub">{{ t.cellSizeSub }}</span>
              </div>
            </div>

            <CoverageNotice :requested-days="requestedSpanDays" />

            <!-- 范围选择与自定义日期选择器 -->
            <div class="range-row">
              <span class="range-label">{{ t.quickRange }}</span>
              <button
                v-for="range in ranges"
                :key="range.days"
                type="button"
                :class="['range-pill', { 'is-on': activeRangeDays === range.days }]"
                @click="applyExportRange(range.days)"
              >{{ range.label }}</button>

              <div class="custom-date-picker-wrap">
                <button
                  ref="startTriggerRef"
                  type="button"
                  class="date-trigger-btn"
                  :class="{ 'is-open': datePickerOpen === 'start' }"
                  :aria-expanded="datePickerOpen === 'start'"
                  aria-haspopup="dialog"
                  @click="datePickerOpen === 'start' ? closeDatePicker() : openDatePicker('start')"
                >
                  <Icon name="clock" :size="12" />
                  <span>{{ exportStartDate || t.startDate }}</span>
                </button>
                <span>~</span>
                <button
                  ref="endTriggerRef"
                  type="button"
                  class="date-trigger-btn"
                  :class="{ 'is-open': datePickerOpen === 'end' }"
                  :aria-expanded="datePickerOpen === 'end'"
                  aria-haspopup="dialog"
                  @click="datePickerOpen === 'end' ? closeDatePicker() : openDatePicker('end')"
                >
                  <Icon name="clock" :size="12" />
                  <span>{{ exportEndDate || t.endDate }}</span>
                </button>

                <!-- 自定义深橄榄底日历弹层。
                     Teleport 到 body：留在原地就会被祖先的包含块裁掉（issue #9）。 -->
                <Teleport to="body">
                  <div
                    v-if="datePickerOpen"
                    ref="calendarRef"
                    class="calendar-popover"
                    :style="calendarStyle"
                    role="dialog"
                    :aria-label="t.datePickerAria"
                  >
                    <div class="cal-header">
                      <button type="button" class="cal-nav-btn" @click="prevMonth"><Icon name="arrow-left" :size="12" /></button>
                      <span class="cal-title">{{ calendarTitle }}</span>
                      <button type="button" class="cal-nav-btn" @click="nextMonth"><Icon name="arrow-right" :size="12" /></button>
                    </div>
                    <div class="cal-weekdays">
                      <span v-for="name in weekdayNames" :key="name">{{ name }}</span>
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
                </Teleport>
              </div>
            </div>
          </div>
        </section>

        <footer class="editor-footer surface-card">
          <p class="secure-note">
            <Icon name="shield" :size="14" />
            {{ t.secureNote }}
            <span class="secure-ok"><Icon name="circle-check" :size="13" />{{ t.secureOk }}</span>
          </p>
          <div class="footer-actions">
            <!-- 三个按钮做的是三件不同的事，名字得让人分得开：
                 「导出文件」存到磁盘、「只复制提示词」不含数据、
                 「交给 X」才是数据+提示词一起复制并打开那个网站。 -->
            <button class="button button-secondary" type="button" :disabled="Boolean(exportBusy)" @click="runExport">
              <Icon name="export" :size="14" />{{ t.exportFile(activeFormatLabel) }}
            </button>
            <button class="button button-secondary" type="button" @click="copyPrompt">
              <Icon name="copy" :size="14" />{{ t.copyPromptOnly }}
            </button>
            <button class="button button-primary send-btn" type="button" :disabled="handoffState === 'preparing'" @click="sendToAi">
              <Icon :name="handoffState === 'preparing' ? 'clock' : 'send'" :size="14" />{{ handoffState === 'preparing' ? t.preparing : t.handTo(activeProvider.label) }}
            </button>
          </div>
        </footer>

        <p v-if="sendState === 'copied'" class="action-note ok" role="status"><Icon name="circle-check" :size="13" />{{ t.promptCopied }}</p>
        <p v-else-if="sendState === 'failed'" class="action-note bad" role="alert"><Icon name="warning" :size="13" />{{ t.copyFailed }}</p>
        <p v-if="handoffNotice" class="action-note" :class="handoffState === 'failed' ? 'bad' : 'ok'" role="status">{{ handoffNotice }}</p>
        <p v-if="handoffError" class="action-note bad" role="alert"><Icon name="warning" :size="13" />{{ handoffError }}</p>
        <button
          v-if="handoffState === 'copied_only'"
          class="button button-secondary retry-open"
          type="button"
          @click="retryOpenAi"
        ><Icon name="external" :size="14" />{{ t.retryOpen(preparedProvider?.label ?? activeProvider.label) }}</button>
        <p v-if="exportMessage" class="action-note ok" role="status"><Icon name="circle-check" :size="13" />{{ exportMessage }}</p>
        <p v-if="exportError" class="action-note bad" role="alert"><Icon name="warning" :size="13" />{{ exportError }}</p>
      </div>

      <!-- 右列：打包选项与目标 AI -->
      <aside class="col-send">
        <section class="surface-card pad">
          <p class="col-title big">{{ t.packTitle }}</p>
          <p class="col-sub">{{ t.packSub }}</p>

          <details class="pack-contents">
            <summary>{{ t.packContentsTitle }}</summary>
            <p>{{ t.packContentsIncluded }}</p>
            <p>{{ t.packContentsExcluded }}</p>
          </details>

          <p class="group-label">{{ t.formatGroup }}</p>
          <div class="format-grid" role="radiogroup" :aria-label="t.formatAria">
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

          <p class="group-label">{{ t.detailGroup }}</p>
          <div class="format-grid detail-grid" role="radiogroup" :aria-label="t.detailAria">
            <button
              v-for="option in detailOptions"
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
            <p class="group-label">{{ t.streamsGroup }}</p>
            <span class="see-more">{{ t.selectedCount(exportDataTypes.length, typeOptions.length) }}</span>
          </div>
          <div class="stream-picker">
            <div v-for="section in groupedTypes" :key="section.key" class="stream-group">
              <button
                type="button"
                class="stream-group-head"
                :aria-pressed="groupIsFull(section.key)"
                @click="toggleGroup(section.key)"
              >
                <span>{{ section.label }}</span>
                <em>{{ groupIsFull(section.key) ? t.selectNone : t.selectAll }}</em>
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
            <p v-if="!exportDataTypes.length" class="empty-note">{{ t.noTypesSelected }}</p>
          </div>

          <div class="size-row">
            <span>{{ t.estimatedSize }}</span>
            <strong class="font-mono">{{ previewBusy ? '…' : formatBytes(previewBytes) }}</strong>
          </div>

          <p class="group-label">{{ t.targetGroup }}</p>
          <div class="tool-grid" role="radiogroup" :aria-label="t.targetAria">
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
                  :alt="t.providerIconAlt(tool.label)"
                  @error="markProviderIconFailed(tool.id)"
                />
                <span v-else class="tool-fallback" aria-hidden="true">{{ tool.fallback }}</span>
              </span>
              <span>{{ tool.label }}</span>
            </button>
          </div>

          <p class="send-hint">
            <Icon name="info" :size="13" />
            {{ t.sendHint }}
          </p>
        </section>
      </aside>
    </div>
  </section>
</template>

<!-- 日历弹层被 Teleport 到 body，已经不在这个组件的作用域里，样式必须
     写成非 scoped。位置由 lib/popoverPosition.ts 算好后以内联样式套上，
     这里只管长相，不再写死 top / right。 -->
<style>
.calendar-popover {
  z-index: 2000;
  overflow-y: auto;
  padding: 10px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  /* 实心背景。半透明会让下面的内容透上来，日期就没法读了。 */
  background: var(--surface);
  box-shadow: 0 18px 44px rgba(4, 6, 8, .55);
}
.calendar-popover .cal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.calendar-popover .cal-title { font-size: 12px; font-weight: 600; color: var(--ink); }
.calendar-popover .cal-nav-btn { display: grid; place-items: center; width: 22px; height: 22px; border: 0; border-radius: 4px; background: var(--surface-raised); color: var(--muted); cursor: pointer; }
.calendar-popover .cal-nav-btn:hover { color: var(--accent); }
.calendar-popover .cal-weekdays { display: grid; grid-template-columns: repeat(7, 1fr); text-align: center; font-size: 10px; color: var(--subtle); margin-bottom: 4px; }
.calendar-popover .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.calendar-popover .cal-day {
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
.calendar-popover .cal-day:hover:not(:disabled) { background: var(--surface-hover); }
.calendar-popover .cal-day.is-selected { background: var(--accent); color: var(--accent-ink); font-weight: 700; }
.calendar-popover .cal-day.is-empty { cursor: default; }
</style>

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
/* 折叠而不是常驻：大多数人不需要读它，但需要读的时候必须在按下导出**之前**
   就能找到（issue #28）。 */
.pack-contents { margin: 0 0 14px; }
.pack-contents summary { color: var(--accent); cursor: pointer; font-size: 12px; font-weight: 600; }
.pack-contents p { margin: 8px 0 0; color: var(--subtle); font-size: 11px; line-height: 1.65; }
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
