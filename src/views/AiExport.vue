<script setup lang="ts">
import Icon from '../components/Icon.vue';
import PageHeader from '../components/PageHeader.vue';
import { exportTypeOptions, useExport } from '../composables/useExport';

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

const ranges = [
  { days: 1, label: '今天' },
  { days: 7, label: '7 天' },
  { days: 30, label: '30 天' },
];
</script>

<template>
  <section class="page" aria-labelledby="ai-export-title">
    <PageHeader
      title-id="ai-export-title"
      eyebrow="特色功能"
      title="交给 AI"
      intro="Bridge 只导出本机已同步的标准化 JSON。分析请粘到你自己选的 AI，这里不解读。"
    />

    <section class="surface-card export-card">
      <div class="quick-ranges" role="group" aria-label="快捷日期">
        <button
          v-for="range in ranges"
          :key="range.days"
          type="button"
          :aria-pressed="false"
          @click="applyExportRange(range.days)"
        >{{ range.label }}</button>
      </div>

      <div class="date-grid">
        <label><span>开始</span><input v-model="exportStartDate" type="date" /></label>
        <label><span>结束</span><input v-model="exportEndDate" type="date" /></label>
      </div>

      <div class="export-types">
        <label v-for="option in exportTypeOptions" :key="option.value">
          <input v-model="exportDataTypes" type="checkbox" :value="option.value" />
          {{ option.label }}
        </label>
      </div>

      <div class="button-row">
        <button class="button button-primary" type="button" :disabled="Boolean(exportBusy)" @click="copyExportJson">
          <Icon name="copy" :size="15" />{{ exportBusy === 'copy' ? '正在复制…' : '复制 JSON' }}
        </button>
        <button class="button button-secondary" type="button" :disabled="Boolean(exportBusy)" @click="saveExportFile">
          <Icon name="file" :size="15" />{{ exportBusy === 'save' ? '正在保存…' : '保存文件' }}
        </button>
        <button class="button button-secondary" type="button" :disabled="Boolean(exportBusy)" @click="publishAiFeed">
          <Icon name="database" :size="15" />{{ exportBusy === 'publish' ? '正在更新…' : '更新本机 AI 数据源' }}
        </button>
      </div>

      <p class="feed-hint">「更新本机 AI 数据源」会写入应用数据目录里的 <code>exports/zeppbridge-ai-feed.json</code>，方便本机工具反复读取同一路径。</p>
      <div v-if="exportMessage" class="alert success" role="status">{{ exportMessage }}</div>
      <div v-if="exportError" class="alert danger" role="alert">{{ exportError }}</div>
      <code v-if="exportResult?.path" class="path-value">{{ exportResult.path }}</code>
    </section>
  </section>
</template>

<style scoped>
.export-card { padding: 22px; }
.quick-ranges { display: flex; gap: 6px; margin-bottom: 16px; }
.quick-ranges button {
  min-height: 34px;
  padding: 6px 12px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  cursor: pointer;
}
.quick-ranges button:hover { border-color: var(--accent); color: var(--accent); }
.date-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.date-grid span, .export-types label { color: var(--muted); font-size: 12px; }
.date-grid input {
  width: 100%;
  min-height: 40px;
  margin-top: 5px;
  padding: 8px 10px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
  color: var(--ink);
}
.export-types {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 16px 0 18px;
}
.export-types label { display: flex; align-items: center; gap: 7px; }
.export-types input { width: 15px; min-height: 15px; accent-color: var(--accent); }
.button-row { display: flex; flex-wrap: wrap; gap: 8px; }
.feed-hint { margin: 14px 0 0; color: var(--muted); font-size: 12px; }
.path-value { display: block; margin-top: 10px; overflow-wrap: anywhere; color: var(--muted); font-family: var(--font-mono); font-size: 11px; }
.alert {
  margin-top: 12px;
  padding: 10px 11px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  font-size: 12px;
}
.alert.success { color: var(--accent); }
.alert.danger { color: var(--danger); }
@media (max-width: 760px) {
  .date-grid, .export-types { grid-template-columns: 1fr; }
}
</style>
