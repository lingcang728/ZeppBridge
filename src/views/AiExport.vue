<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import Icon from '../components/Icon.vue';
import PageHeader from '../components/PageHeader.vue';
import { exportTypeOptions, useExport } from '../composables/useExport';
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
  exportResult,
  applyExportRange,
  copyExportJson,
  saveExportFile,
  publishAiFeed,
} = useExport();

const { dataRevision } = useSyncController();

const ranges = [
  { days: 1, label: '今天' },
  { days: 7, label: '7 天' },
  { days: 30, label: '30 天' },
];

const typeCards: { value: ExportDataType; label: string; icon: 'heart' | 'moon' | 'run' | 'steps' | 'spo2' | 'stress' | 'hrv' | 'bars' | 'vo2'; tone: 'heart' | 'sleep' | 'activity' }[] = [
  { value: 'heart_rate', label: '心率', icon: 'heart', tone: 'heart' },
  { value: 'sleep', label: '睡眠', icon: 'moon', tone: 'sleep' },
  { value: 'workouts', label: '运动', icon: 'run', tone: 'activity' },
  { value: 'steps', label: '步数', icon: 'steps', tone: 'activity' },
  { value: 'spo2', label: '血氧', icon: 'spo2', tone: 'heart' },
  { value: 'stress', label: '压力', icon: 'stress', tone: 'sleep' },
  { value: 'hrv', label: 'HRV', icon: 'hrv', tone: 'heart' },
  { value: 'training_load', label: '训练负荷', icon: 'bars', tone: 'activity' },
  { value: 'vo2max', label: 'VO₂max', icon: 'vo2', tone: 'sleep' },
];

const lastAction = ref<'copy' | 'save' | 'publish' | null>(null);
const previewBusy = ref(false);
const previewError = ref<string | null>(null);
const previewJson = ref('');
const previewCount = ref<number | null>(null);
const previewBytes = ref<number | null>(null);
const previewExpanded = ref(false);
const pathCopied = ref(false);
const COLLAPSED_LINES = 14;
const EXPANDED_LINES = 80;

let previewTimer = 0;
let previewSeq = 0;

const rangeFromToday = (days: number) => {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - Math.max(0, days - 1));
  return { start: localDateString(start), end: localDateString(end) };
};

const activeRangeDays = computed(() => {
  for (const range of ranges) {
    const next = rangeFromToday(range.days);
    if (next.start === exportStartDate.value && next.end === exportEndDate.value) return range.days;
  }
  return null;
});

const datesValid = computed(() =>
  Boolean(exportStartDate.value && exportEndDate.value && exportStartDate.value <= exportEndDate.value),
);

const typeCount = computed(() => exportDataTypes.value.length);
const typeTotal = exportTypeOptions.length;

const hasType = (value: ExportDataType) => exportDataTypes.value.includes(value);

const toggleType = (value: ExportDataType) => {
  if (hasType(value)) {
    exportDataTypes.value = exportDataTypes.value.filter((item) => item !== value);
    return;
  }
  exportDataTypes.value = [...exportDataTypes.value, value];
};

const setRange = (days: number) => {
  applyExportRange(days);
};

const formatBytes = (bytes: number | null) => {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `≈ ${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatCount = (count: number | null) => {
  if (count === null) return '—';
  return `${count.toLocaleString('zh-CN')} 条`;
};

const resultClock = computed(() => {
  const raw = exportResult.value?.generated_at;
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  const today = localDateString(new Date());
  const sameDay = localDateString(date) === today;
  const time = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(date);
  return sameDay ? `今天 ${time}` : time;
});

const previewLines = computed(() => {
  if (!previewJson.value) return [] as string[];
  const lines = previewJson.value.split('\n');
  const limit = previewExpanded.value ? EXPANDED_LINES : COLLAPSED_LINES;
  if (lines.length <= limit) return lines;
  return [...lines.slice(0, limit), '…'];
});

const canExpandPreview = computed(() => previewJson.value.split('\n').length > COLLAPSED_LINES);

const loadPreview = async () => {
  const seq = ++previewSeq;
  previewError.value = null;
  if (!datesValid.value) {
    previewJson.value = '';
    previewCount.value = null;
    previewBytes.value = null;
    previewBusy.value = false;
    return;
  }
  if (!typeCount.value) {
    previewJson.value = '';
    previewCount.value = null;
    previewBytes.value = null;
    previewBusy.value = false;
    previewError.value = '请至少选择一种数据类型。';
    return;
  }
  if (!isTauri()) {
    previewJson.value = '';
    previewCount.value = null;
    previewBytes.value = null;
    previewBusy.value = false;
    previewError.value = '请从 ZeppBridge 桌面应用打开，预览需要本机已同步的记录。';
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
  previewTimer = window.setTimeout(() => {
    void loadPreview();
  }, 280);
};

const runCopy = async () => {
  lastAction.value = 'copy';
  pathCopied.value = false;
  await copyExportJson();
};

const runSave = async () => {
  lastAction.value = 'save';
  pathCopied.value = false;
  await saveExportFile();
};

const runPublish = async () => {
  lastAction.value = 'publish';
  pathCopied.value = false;
  await publishAiFeed();
};

const copySavedPath = async () => {
  const path = exportResult.value?.path;
  if (!path) return;
  try {
    await navigator.clipboard.writeText(path);
    pathCopied.value = true;
  } catch {
    pathCopied.value = false;
  }
};

watch([exportStartDate, exportEndDate, exportDataTypes], schedulePreview, { deep: true, immediate: true });
watch(dataRevision, () => void loadPreview());
onBeforeUnmount(() => window.clearTimeout(previewTimer));
</script>

<template>
  <section class="page ai-page" aria-labelledby="ai-export-title">
    <PageHeader
      title-id="ai-export-title"
      title="交给 AI"
      intro="Bridge 只导出本机已同步的标准化 JSON。分析请粘到你自己选的 AI，这里不解读。"
    />

    <div class="ai-layout">
      <div class="ai-main">
        <section class="shell" aria-labelledby="range-heading">
          <div class="block-head">
            <h2 id="range-heading">时间范围</h2>
          </div>
          <div class="pills" role="group" aria-label="快捷日期">
            <button
              v-for="range in ranges"
              :key="range.days"
              type="button"
              class="pill"
              :aria-pressed="activeRangeDays === range.days"
              :class="{ 'is-on': activeRangeDays === range.days }"
              @click="setRange(range.days)"
            >{{ range.label }}</button>
          </div>
          <div class="date-grid">
            <label>
              <span>开始</span>
              <input v-model="exportStartDate" type="date" />
            </label>
            <label>
              <span>结束</span>
              <input v-model="exportEndDate" type="date" />
            </label>
          </div>
        </section>

        <section class="shell" aria-labelledby="types-heading">
          <div class="block-head">
            <h2 id="types-heading">数据类型</h2>
            <span>可多选</span>
          </div>
          <div class="type-grid" role="group" aria-label="导出数据类型">
            <button
              v-for="card in typeCards"
              :key="card.value"
              type="button"
              class="type-chip"
              :class="[`tone-${card.tone}`, { 'is-on': hasType(card.value) }]"
              :aria-pressed="hasType(card.value)"
              @click="toggleType(card.value)"
            >
              <span class="type-icon" aria-hidden="true"><Icon :name="card.icon" :size="15" /></span>
              <span>{{ card.label }}</span>
              <span class="type-mark" aria-hidden="true">
                <Icon v-if="hasType(card.value)" name="check" :size="13" />
              </span>
            </button>
          </div>
        </section>

        <section class="shell" aria-labelledby="actions-heading">
          <div class="block-head">
            <h2 id="actions-heading">导出操作</h2>
          </div>
          <div class="button-row">
            <button class="button button-primary action-copy" type="button" :disabled="Boolean(exportBusy)" @click="runCopy">
              <Icon name="copy" :size="15" />{{ exportBusy === 'copy' ? '正在复制…' : '复制 JSON' }}
            </button>
            <button class="button button-secondary action-ghost" type="button" :disabled="Boolean(exportBusy)" @click="runSave">
              <Icon name="file" :size="15" />{{ exportBusy === 'save' ? '正在保存…' : '保存文件' }}
            </button>
            <button class="button button-secondary action-ghost" type="button" :disabled="Boolean(exportBusy)" @click="runPublish">
              <Icon name="database" :size="15" />{{ exportBusy === 'publish' ? '正在更新…' : '更新本机 AI 数据源' }}
            </button>
          </div>
          <p class="feed-hint">
            <Icon name="info" :size="14" />
            更新本机 AI 数据源会写入应用数据目录里的 <code>exports/zeppbridge-ai-feed.json</code>，方便本机工具反复读取同一路径。
          </p>

          <div v-if="exportMessage" class="result-card is-ok" role="status">
            <div class="result-top">
              <span class="result-icon"><Icon name="circle-check" :size="18" /></span>
              <div>
                <strong>导出成功</strong>
                <p>{{ exportMessage }}</p>
              </div>
              <time v-if="resultClock">{{ resultClock }}</time>
            </div>
            <div v-if="exportResult?.path && lastAction !== 'copy'" class="result-path">
              <span>保存路径</span>
              <code>{{ exportResult.path }}</code>
              <button type="button" class="icon-btn" :aria-label="pathCopied ? '已复制路径' : '复制路径'" @click="copySavedPath">
                <Icon :name="pathCopied ? 'check' : 'copy'" :size="14" />
              </button>
            </div>
            <p class="result-note">
              <Icon name="info" :size="13" />
              该 JSON 只反映本机已同步的数据。若需更新，请先点击「立即同步」。
            </p>
          </div>
          <div v-if="exportError" class="result-card is-bad" role="alert">
            <div class="result-top">
              <span class="result-icon"><Icon name="warning" :size="18" /></span>
              <div>
                <strong>未能导出</strong>
                <p>{{ exportError }}</p>
              </div>
            </div>
          </div>
        </section>
      </div>

      <aside class="ai-side">
        <section class="shell summary-shell" aria-labelledby="summary-heading">
          <div class="block-head">
            <h2 id="summary-heading">导出摘要</h2>
          </div>
          <dl class="summary-list">
            <div>
              <dt><Icon name="info" :size="14" />时间范围</dt>
              <dd>{{ datesValid ? `${exportStartDate} ~ ${exportEndDate}` : '—' }}</dd>
            </div>
            <div>
              <dt><Icon name="file" :size="14" />预计记录数</dt>
              <dd>{{ previewBusy ? '读取中…' : formatCount(previewCount) }}</dd>
            </div>
            <div>
              <dt><Icon name="sliders" :size="14" />数据类型</dt>
              <dd>已选择 {{ typeCount }}/{{ typeTotal }} 种</dd>
            </div>
            <div>
              <dt><Icon name="database" :size="14" />文件大小（预估）</dt>
              <dd>{{ previewBusy ? '—' : formatBytes(previewBytes) }}</dd>
            </div>
          </dl>
        </section>

        <section class="shell preview-shell" aria-labelledby="preview-heading">
          <div class="block-head">
            <h2 id="preview-heading">JSON 预览（只读）</h2>
            <button
              v-if="canExpandPreview"
              type="button"
              class="text-btn"
              @click="previewExpanded = !previewExpanded"
            >{{ previewExpanded ? '收起' : '展开' }}</button>
          </div>
          <div v-if="previewBusy" class="preview-empty">正在读取本机记录…</div>
          <div v-else-if="previewError" class="preview-empty">{{ previewError }}</div>
          <div v-else-if="!previewJson" class="preview-empty">还没有可预览的 JSON。</div>
          <pre v-else class="json-view" tabindex="0" aria-readonly="true"><span
            v-for="(line, index) in previewLines"
            :key="index"
            class="json-line"
          ><span class="ln">{{ line === '…' ? '' : index + 1 }}</span><span class="lx">{{ line }}</span></span></pre>
          <p class="preview-foot">
            <Icon name="info" :size="13" />
            标准化 JSON，直接粘贴到你自己的 AI 中使用。
          </p>
        </section>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.ai-page {
  --ai-accent: #3ddc84;
  --ai-accent-ink: #06140c;
  --ai-shell: #16181b;
  --ai-raised: #1c1f24;
  --ai-line: #2a2e33;
  --ai-ink: #f3f5f4;
  --ai-muted: #8b918e;
  --ai-heart: #ff5a4f;
  --ai-sleep: #7b7cff;
  --ai-activity: #3ddc84;
  width: min(100%, 1180px);
}
:root[data-theme='light'] .ai-page {
  --ai-accent: #1f9a58;
  --ai-accent-ink: #ffffff;
  --ai-shell: #ffffff;
  --ai-raised: #f3f6f4;
  --ai-line: #d7ddd8;
  --ai-ink: #142018;
  --ai-muted: #5d675f;
}
@media (prefers-color-scheme: light) {
  :root:not([data-theme]) .ai-page {
    --ai-accent: #1f9a58;
    --ai-accent-ink: #ffffff;
    --ai-shell: #ffffff;
    --ai-raised: #f3f6f4;
    --ai-line: #d7ddd8;
    --ai-ink: #142018;
    --ai-muted: #5d675f;
  }
}

.ai-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(280px, 0.9fr);
  gap: 16px;
  align-items: start;
}
.ai-main, .ai-side {
  display: grid;
  gap: 14px;
  min-width: 0;
}
.shell {
  padding: 18px 18px 16px;
  border: 1px solid var(--ai-line);
  border-radius: 16px;
  background: var(--ai-shell);
}
.block-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}
.block-head h2 {
  margin: 0;
  color: var(--ai-ink);
  font-size: 15px;
  font-weight: 650;
}
.block-head span {
  color: var(--ai-muted);
  font-size: 12px;
}

.pills { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
.pill {
  min-height: 34px;
  padding: 6px 14px;
  border: 1px solid var(--ai-line);
  border-radius: 999px;
  background: transparent;
  color: var(--ai-muted);
  font-size: 12px;
  cursor: pointer;
}
.pill.is-on {
  border-color: var(--ai-accent);
  background: var(--ai-accent);
  color: var(--ai-accent-ink);
  font-weight: 650;
}
.pill:hover:not(.is-on) { border-color: var(--ai-accent); color: var(--ai-accent); }

.date-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
}
.date-grid span {
  display: block;
  margin-bottom: 6px;
  color: var(--ai-muted);
  font-size: 12px;
}
.date-grid input {
  width: 100%;
  min-height: 42px;
  padding: 8px 12px;
  border: 1px solid var(--ai-line);
  border-radius: 10px;
  background: var(--ai-raised);
  color: var(--ai-ink);
  color-scheme: dark;
}
:root[data-theme='light'] .date-grid input { color-scheme: light; }

.type-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
  gap: 8px;
}
.type-chip {
  display: flex;
  min-width: 0;
  min-height: 42px;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--ai-line);
  border-radius: 12px;
  background: var(--ai-raised);
  color: var(--ai-ink);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.type-chip span:nth-child(2) {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.type-icon {
  display: grid;
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  place-items: center;
  border-radius: 8px;
  color: #ffffff;
}
.tone-heart .type-icon { background: var(--ai-heart); }
.tone-sleep .type-icon { background: var(--ai-sleep); }
.tone-activity .type-icon { background: var(--ai-activity); color: #06140c; }
.type-mark {
  display: grid;
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
  place-items: center;
  border: 1px solid var(--ai-line);
  border-radius: 4px;
  color: var(--ai-muted);
}
.type-chip.is-on {
  border-color: var(--ai-accent);
  background: var(--accent-soft);
}
.type-chip.is-on .type-mark {
  border-color: var(--ai-accent);
  background: var(--ai-accent);
  color: var(--ai-accent-ink);
}

.button-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.action-copy {
  background: #3ddc84;
  color: #06140c;
  border-radius: 999px;
}
.action-copy:hover:not(:disabled) { background: #4ee693; }
.action-ghost {
  border-color: var(--ai-line);
  border-radius: 999px;
  color: var(--ai-ink);
  background: var(--ai-raised);
}
.action-ghost:hover:not(:disabled) {
  border-color: var(--ai-accent);
  color: var(--ai-accent);
}

.feed-hint {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 14px 0 0;
  color: var(--ai-muted);
  font-size: 12px;
}
.feed-hint svg { margin-top: 2px; color: var(--ai-muted); }
.feed-hint code {
  font-family: var(--font-mono);
  font-size: 11px;
}

.result-card {
  margin-top: 14px;
  padding: 14px;
  border: 1px solid var(--ai-line);
  border-radius: 14px;
  background: var(--ai-raised);
}
.result-card.is-ok { border-color: #2A4B39; }
.result-card.is-bad { border-color: #7A3034; }
.result-top {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: start;
}
.result-icon { color: var(--ai-accent); }
.result-card.is-bad .result-icon { color: #ff5a4f; }
.result-top strong { display: block; color: var(--ai-ink); font-size: 14px; }
.result-top p { margin: 4px 0 0; color: var(--ai-muted); font-size: 12px; }
.result-top time { color: var(--ai-muted); font-size: 11px; }
.result-path {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--ai-line);
  color: var(--ai-muted);
  font-size: 12px;
}
.result-path code {
  overflow-wrap: anywhere;
  color: var(--ai-accent);
  font-family: var(--font-mono);
  font-size: 11px;
}
.icon-btn {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--ai-muted);
  cursor: pointer;
}
.icon-btn:hover { color: var(--ai-accent); }
.result-note {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 10px 0 0;
  color: var(--ai-muted);
  font-size: 12px;
}

.summary-list { display: grid; gap: 12px; margin: 0; }
.summary-list > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}
.summary-list dt {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--ai-muted);
  font-size: 12px;
}
.summary-list dd {
  margin: 0;
  color: var(--ai-ink);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.preview-shell { min-width: 0; }
.text-btn {
  border: 0;
  background: transparent;
  color: var(--ai-muted);
  font-size: 12px;
  cursor: pointer;
}
.text-btn:hover { color: var(--ai-accent); }
.preview-empty {
  min-height: 180px;
  padding: 18px 4px;
  color: var(--ai-muted);
  font-size: 13px;
}
.json-view {
  max-height: 360px;
  margin: 0;
  overflow: auto;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.55;
  color: #8fe7b4;
}
.json-line { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 8px; }
.ln { color: #5b635e; text-align: right; user-select: none; }
.lx { min-width: 0; overflow-wrap: anywhere; white-space: pre-wrap; }
.preview-foot {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 12px 0 0;
  color: var(--ai-muted);
  font-size: 12px;
}

@media (max-width: 860px) {
  .ai-layout { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 520px) {
  .date-grid, .type-grid { grid-template-columns: minmax(0, 1fr); }
  .result-top { grid-template-columns: auto minmax(0, 1fr); }
  .result-top time { grid-column: 2; }
}
</style>
