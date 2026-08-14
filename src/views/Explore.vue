<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import Icon from '../components/Icon.vue';
import type { IconName } from '../components/Icon.vue';
import { useExport } from '../composables/useExport';
import { useSyncController } from '../composables/useSyncController';
import { isTauri, tauriApi, toUserMessage } from '../composables/useTauriApi';
import { localDateString } from '../lib/format';
import type { ExportDataType } from '../types';

const {
  exportStartDate,
  exportEndDate,
  exportDataTypes,
  exportBusy,
  exportError,
  exportMessage,
  applyExportRange,
  copyExportJson,
  saveExportFile,
} = useExport();

const { dataRevision } = useSyncController();

/* ── 模板 ─────────────────────────────── */
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
    types: ['heart_rate', 'sleep', 'workouts', 'steps', 'hrv', 'training_load'],
    prompt: `你是一位专业的运动健康分析师，擅长将可穿戴设备数据转化为易懂的洞察。
基于以下来自 Z-Bridge 的多源数据（已按时间顺序整理），
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
    types: ['workouts', 'heart_rate', 'training_load', 'vo2max'],
    prompt: `你是一位经验丰富的耐力训练教练。
基于以下来自 Z-Bridge 的训练数据（含心率、训练负荷与 VO₂max），
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
    types: ['hrv', 'heart_rate', 'sleep', 'stress'],
    prompt: `你是一位专注于运动恢复的生理学专家。
基于以下来自 Z-Bridge 的 HRV、静息心率、睡眠与压力数据，
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
    types: ['sleep', 'heart_rate', 'hrv'],
    prompt: `你是一位睡眠健康顾问。
基于以下来自 Z-Bridge 的睡眠分期、时长与心率数据，
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
    types: ['steps', 'workouts', 'heart_rate'],
    prompt: `你是一位健康生活方式顾问。
基于以下来自 Z-Bridge 的步数、运动与心率数据，
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
    types: ['heart_rate', 'sleep', 'workouts', 'steps', 'hrv', 'training_load'],
    prompt: `你是一位私人健康教练，每周为我做一次数据复盘。
基于以下来自 Z-Bridge 的本周数据，
对比一般健康人群基准，总结本周表现，
指出做得好的地方与需要注意的地方，并给出下周行动清单。

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
const formats = [
  { key: 'json', label: 'JSON', sub: '结构化数据', icon: 'braces' as IconName },
  { key: 'csv', label: 'CSV', sub: '表格数据', icon: 'table' as IconName },
  { key: 'gpx', label: 'GPX', sub: '轨迹数据', icon: 'map' as IconName },
];
const activeFormat = ref('json');

const aiTools = ['ChatGPT', 'Claude', 'Gemini', 'Kimi', '豆包', 'DeepSeek'];
const activeTool = ref('ChatGPT');

/* ── 数据感知摘要 / 预览 ───────────────── */
const previewBusy = ref(false);
const previewError = ref<string | null>(null);
const previewJson = ref('');
const previewCount = ref<number | null>(null);
const previewBytes = ref<number | null>(null);
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

const typeLabels: Record<string, string> = {
  heart_rate: '心率数据', sleep: '睡眠数据', workouts: '训练数据', steps: '活动数据',
  spo2: '血氧数据', stress: '压力数据', hrv: '生理指标', training_load: '训练负荷', vo2max: 'VO₂max',
};
const packageContents = computed(() =>
  exportDataTypes.value.map((type) => ({ type, label: typeLabels[type] ?? type })),
);

const formatBytes = (bytes: number | null) => {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const previewLines = computed(() => {
  if (!previewJson.value) return [] as string[];
  const lines = previewJson.value.split('\n');
  return lines.length > 60 ? [...lines.slice(0, 60), '…'] : lines;
});

const loadPreview = async () => {
  const seq = ++previewSeq;
  previewError.value = null;
  if (!datesValid.value || !exportDataTypes.value.length) {
    previewJson.value = '';
    previewCount.value = null;
    previewBytes.value = null;
    previewBusy.value = false;
    previewError.value = exportDataTypes.value.length ? null : '请至少选择一种数据类型。';
    return;
  }
  if (!isTauri()) {
    previewJson.value = '';
    previewCount.value = null;
    previewBytes.value = null;
    previewBusy.value = false;
    previewError.value = '请从 Z-Bridge 桌面应用打开，预览需要本机已同步的记录。';
    return;
  }
  previewBusy.value = true;
  try {
    const encoded = await tauriApi.getExportJson({
      startDate: exportStartDate.value,
      endDate: exportEndDate.value,
      dataTypes: [...exportDataTypes.value],
    });
    if (seq !== previewSeq) return;
    const parsed = JSON.parse(encoded) as { record_count?: number; records?: unknown[] };
    previewJson.value = encoded;
    previewCount.value = parsed.record_count ?? parsed.records?.length ?? 0;
    previewBytes.value = new TextEncoder().encode(encoded).length;
  } catch (error) {
    if (seq !== previewSeq) return;
    previewJson.value = '';
    previewCount.value = null;
    previewBytes.value = null;
    previewError.value = toUserMessage(error, '无法读取本机导出预览');
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

const copyPrompt = async () => {
  try {
    await navigator.clipboard.writeText(editedPrompt.value);
    sendState.value = 'copied';
    window.setTimeout(() => { sendState.value = 'idle'; }, 2500);
  } catch {
    sendState.value = 'failed';
  }
};

const sendToAi = async () => {
  try {
    const payload = previewJson.value
      ? `${editedPrompt.value}\n\n以下是我的数据（JSON）：\n${previewJson.value}`
      : editedPrompt.value;
    await navigator.clipboard.writeText(payload);
    sendState.value = 'copied';
    window.setTimeout(() => { sendState.value = 'idle'; }, 2500);
  } catch {
    sendState.value = 'failed';
  }
};

const runExport = async () => {
  if (activeFormat.value === 'json') await saveExportFile();
  else await copyExportJson();
};

watch([exportStartDate, exportEndDate, exportDataTypes], schedulePreview, { deep: true, immediate: true });
watch(dataRevision, () => void loadPreview());
onBeforeUnmount(() => window.clearTimeout(previewTimer));
</script>

<template>
  <section class="page export-page" aria-labelledby="export-title">
    <header class="page-head">
      <h1 id="export-title">导出与提示词</h1>
      <p class="page-intro">选择模板、检查摘要并导出数据，一步发送到任意 AI 工具。</p>
    </header>

    <div class="export-layout">
      <!-- 左列：模板 -->
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

      <!-- 中列：编辑与预览 -->
      <div class="col-editor">
        <section class="surface-card pad current-template">
          <div class="current-head">
            <div>
              <p class="col-title">当前模板</p>
              <h2 class="tpl-name">{{ activeTemplate.name }} <Icon name="edit" :size="15" /></h2>
              <p class="tpl-desc">{{ activeTemplate.sub }}。</p>
            </div>
            <button class="mini-btn" type="button" @click="copyPrompt"><Icon name="star" :size="13" />设为默认模板</button>
          </div>

          <div class="prompt-editor">
            <div class="editor-head">
              <span>提示词编辑<em>（数据已感知）</em></span>
              <span class="injected"><Icon name="database" :size="13" />已注入 {{ exportDataTypes.length }} 类数据源</span>
            </div>
            <textarea v-model="editedPrompt" rows="9" spellcheck="false" aria-label="提示词编辑"></textarea>
          </div>

          <div class="summary-block">
            <div class="summary-head">
              <span>数据感知摘要 <Icon name="info" :size="13" /></span>
              <span class="see-more">查看详情 <Icon name="arrow-right" :size="12" /></span>
            </div>
            <div class="summary-grid">
              <div class="summary-cell">
                <span class="cell-label"><Icon name="clock" :size="13" />时间范围</span>
                <strong class="cell-value small">{{ datesValid ? `${exportStartDate} ~ ${exportEndDate}` : '—' }}</strong>
                <span class="cell-sub">{{ rangeDays ? `（${rangeDays} 天）` : '' }}</span>
              </div>
              <div class="summary-cell">
                <span class="cell-label"><Icon name="file" :size="13" />记录条数</span>
                <strong class="cell-value">{{ previewBusy ? '…' : (previewCount === null ? '—' : previewCount.toLocaleString('zh-CN')) }}</strong>
                <span class="cell-sub">已同步记录</span>
              </div>
              <div class="summary-cell">
                <span class="cell-label"><Icon name="sliders" :size="13" />数据类型</span>
                <strong class="cell-value">{{ exportDataTypes.length }} 类</strong>
                <span class="cell-sub">已选入数据包</span>
              </div>
              <div class="summary-cell">
                <span class="cell-label"><Icon name="database" :size="13" />数据体积</span>
                <strong class="cell-value">{{ previewBusy ? '…' : formatBytes(previewBytes) }}</strong>
                <span class="cell-sub">预估大小</span>
              </div>
            </div>
            <div class="range-row">
              <span>快捷范围：</span>
              <button
                v-for="range in ranges"
                :key="range.days"
                type="button"
                :class="['range-pill', { 'is-on': activeRangeDays === range.days }]"
                @click="applyExportRange(range.days)"
              >{{ range.label }}</button>
              <label class="date-input"><input v-model="exportStartDate" type="date" aria-label="开始日期" /></label>
              <span>~</span>
              <label class="date-input"><input v-model="exportEndDate" type="date" aria-label="结束日期" /></label>
            </div>
          </div>

          <div class="preview-block">
            <div class="preview-head">
              <span>结构化数据预览</span>
              <span class="format-tag">JSON <Icon name="chevron-down" :size="12" /></span>
            </div>
            <div v-if="previewBusy" class="preview-empty">正在读取本机记录…</div>
            <div v-else-if="previewError" class="preview-empty">{{ previewError }}</div>
            <div v-else-if="!previewJson" class="preview-empty">还没有可预览的 JSON。</div>
            <pre v-else class="json-view" tabindex="0" aria-readonly="true"><span
              v-for="(line, index) in previewLines"
              :key="index"
              class="json-line"
            ><span class="ln">{{ line === '…' ? '' : index + 1 }}</span><span class="lx">{{ line }}</span></span></pre>
          </div>
        </section>

        <footer class="editor-footer surface-card">
          <p class="secure-note">
            <Icon name="shield" :size="14" />
            数据已通过本地加密处理，仅在本地生成提示词与导出包。
            <span class="secure-ok"><Icon name="circle-check" :size="13" />安全可靠</span>
          </p>
          <div class="footer-actions">
            <button class="button button-secondary" type="button" :disabled="Boolean(exportBusy)" @click="runExport">
              <Icon name="export" :size="14" />附加数据
            </button>
            <button class="button button-secondary" type="button" @click="copyPrompt">
              <Icon name="copy" :size="14" />复制提示词
            </button>
            <button class="button button-primary send-btn" type="button" @click="sendToAi">
              <Icon name="send" :size="14" />发送到 AI
            </button>
          </div>
        </footer>
        <p v-if="sendState === 'copied'" class="action-note ok" role="status"><Icon name="circle-check" :size="13" />已复制到剪贴板，可直接粘贴到 {{ activeTool }}。</p>
        <p v-else-if="sendState === 'failed'" class="action-note bad" role="alert"><Icon name="warning" :size="13" />复制失败，请重试。</p>
        <p v-if="exportMessage" class="action-note ok" role="status"><Icon name="circle-check" :size="13" />{{ exportMessage }}</p>
        <p v-if="exportError" class="action-note bad" role="alert"><Icon name="warning" :size="13" />{{ exportError }}</p>
      </div>

      <!-- 右列：打包与发送 -->
      <aside class="col-send">
        <section class="surface-card pad">
          <p class="col-title big">打包与发送</p>
          <p class="col-sub">选择导出内容与目标 AI。</p>

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

          <div class="group-row">
            <p class="group-label">打包内容</p>
            <span class="see-more">查看全部 <Icon name="arrow-right" :size="11" /></span>
          </div>
          <ul class="content-list">
            <li v-for="item in packageContents" :key="item.type">
              <Icon :name="item.type === 'sleep' ? 'moon' : item.type === 'workouts' ? 'activity' : item.type === 'steps' ? 'steps' : item.type === 'heart_rate' ? 'heart' : 'database'" :size="14" />
              <span>{{ item.label }}</span>
              <Icon name="circle-check" :size="14" class="content-check" />
            </li>
            <li v-if="!packageContents.length" class="empty-note">尚未选择数据类型。</li>
          </ul>

          <div class="size-row">
            <span>数据包大小（预估）</span>
            <strong>{{ previewBusy ? '…' : formatBytes(previewBytes) }}</strong>
          </div>

          <p class="group-label">目标 AI 工具</p>
          <div class="tool-grid" role="radiogroup" aria-label="目标 AI 工具">
            <button
              v-for="tool in aiTools"
              :key="tool"
              type="button"
              role="radio"
              :aria-checked="activeTool === tool"
              :class="['tool-card', { 'is-on': activeTool === tool }]"
              @click="activeTool = tool"
            >
              <Icon v-if="activeTool === tool" name="circle-check" :size="13" class="tool-check" />
              <span class="tool-logo"><Icon name="spark" :size="14" /></span>
              <span>{{ tool }}</span>
            </button>
          </div>
          <p class="send-hint"><Icon name="info" :size="13" />发送后将自动附加所选提示词与数据包。</p>
        </section>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.export-page.page { display: grid; gap: 16px; }
.page-head h1 { margin-bottom: 6px; }

.export-layout {
  display: grid;
  grid-template-columns: 250px minmax(0, 1fr) 300px;
  gap: 16px;
  align-items: start;
}
.col-templates, .col-send { display: grid; gap: 14px; min-width: 0; }
.col-editor { display: grid; gap: 12px; min-width: 0; }
.pad { padding: 16px; }
.col-title { margin: 0 0 10px; color: var(--ink); font-size: 13px; font-weight: 700; }
.col-title.big { font-size: 16px; margin-bottom: 4px; }
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
}
.category-item:hover { background: var(--surface-hover); color: var(--ink); }
.category-item.is-on { background: var(--accent-soft); border-color: rgba(205, 220, 124, .2); color: var(--accent); }
.category-item span { flex: 1; }
.category-item em { font-style: normal; font-size: 12px; color: var(--subtle); font-variant-numeric: tabular-nums; }
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
.tpl-copy strong { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tpl-copy span { color: var(--subtle); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tpl-star { color: var(--accent); }
.empty-note { margin: 4px 0; color: var(--subtle); font-size: 12px; }

/* 当前模板 */
.current-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.current-head .col-title { margin-bottom: 2px; color: var(--muted); font-weight: 400; font-size: 12px; }
.tpl-name { display: inline-flex; align-items: center; gap: 8px; margin: 0 0 4px; color: var(--accent); font-size: 22px; font-weight: 700; }
.tpl-name svg { color: var(--subtle); }
.tpl-desc { margin: 0; color: var(--muted); font-size: 12px; }
.mini-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: 0 0 auto;
  padding: 6px 12px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--surface-raised);
  color: var(--muted);
  font-size: 12px;
  cursor: pointer;
}
.mini-btn:hover { color: var(--accent); border-color: var(--accent); }

.prompt-editor { border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface-raised); overflow: hidden; margin-bottom: 14px; }
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
.injected { display: inline-flex; align-items: center; gap: 5px; color: var(--accent); font-weight: 400; }
.prompt-editor textarea {
  display: block;
  width: 100%;
  border: 0;
  outline: 0;
  resize: vertical;
  padding: 12px 14px;
  background: transparent;
  color: var(--muted);
  font-family: var(--font-sans);
  font-size: 12.5px;
  line-height: 1.9;
}

/* 数据感知摘要 */
.summary-block { border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 12px 14px; margin-bottom: 14px; background: var(--surface-raised); }
.summary-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; font-size: 12px; font-weight: 600; }
.summary-head span:first-child { display: inline-flex; align-items: center; gap: 5px; }
.see-more { display: inline-flex; align-items: center; gap: 3px; color: var(--subtle); font-size: 11px; font-weight: 400; cursor: default; }
.summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1px; border: 1px solid var(--line); border-radius: 9px; overflow: hidden; background: var(--line); }
.summary-cell { display: grid; gap: 3px; padding: 10px 12px; background: var(--surface); min-width: 0; }
.cell-label { display: inline-flex; align-items: center; gap: 5px; color: var(--subtle); font-size: 11px; }
.cell-value { font-family: 'Inter', var(--font-sans); font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; }
.cell-value.small { font-size: 12px; }
.cell-sub { color: var(--subtle); font-size: 11px; }
.range-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 10px; color: var(--subtle); font-size: 12px; }
.range-pill {
  padding: 3px 12px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  cursor: pointer;
}
.range-pill.is-on { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
.date-input input {
  min-height: 28px;
  padding: 3px 8px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--surface);
  color: var(--ink);
  font-size: 12px;
}

/* JSON 预览 */
.preview-block { border: 1px solid var(--line); border-radius: var(--radius-sm); background: #101207; overflow: hidden; }
.preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 12px;
  border-bottom: 1px solid var(--line);
  color: var(--ink);
  font-size: 12px;
  font-weight: 600;
}
.format-tag { display: inline-flex; align-items: center; gap: 4px; padding: 2px 10px; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); font-size: 11px; font-weight: 400; }
.preview-empty { padding: 16px 14px; color: var(--subtle); font-size: 12px; }
.json-view {
  max-height: 250px;
  margin: 0;
  padding: 10px 12px;
  overflow: auto;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.65;
  color: var(--accent);
}
.json-line { display: grid; grid-template-columns: 26px minmax(0, 1fr); gap: 10px; }
.ln { color: var(--faint); text-align: right; user-select: none; }
.lx { min-width: 0; overflow-wrap: anywhere; white-space: pre-wrap; }

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
  padding: 14px 6px 10px;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: var(--surface-raised);
  color: var(--muted);
  font-size: 11px;
  cursor: pointer;
}
.format-card strong { color: var(--ink); font-size: 12px; }
.format-card span { color: var(--subtle); }
.format-card.is-on { border-color: var(--accent); background: var(--accent-soft); }
.format-card.is-on svg, .format-card.is-on strong { color: var(--accent); }
.format-check { position: absolute; top: 6px; right: 6px; }
.content-list { display: grid; gap: 2px; margin: 8px 0 0; padding: 0; list-style: none; }
.content-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 5px 10px;
  border-radius: 8px;
  background: var(--surface-raised);
  color: var(--muted);
  font-size: 12px;
}
.content-list li span { flex: 1; }
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
.size-row strong { color: var(--accent); font-family: 'Inter', var(--font-sans); font-variant-numeric: tabular-nums; }
.tool-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.tool-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: var(--surface-raised);
  color: var(--ink);
  font-size: 12px;
  cursor: pointer;
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
.tool-card.is-on .tool-logo { color: var(--accent); }
.tool-check { position: absolute; top: 5px; right: 6px; color: var(--accent); }
.send-hint { display: flex; align-items: flex-start; gap: 6px; margin: 14px 0 0; color: var(--subtle); font-size: 11px; }

@media (max-width: 1180px) {
  .export-layout { grid-template-columns: 230px minmax(0, 1fr); }
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
