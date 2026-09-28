<script setup lang="ts">
/* 默认导出格式。
 *
 * 这里以前还有一个「历史补拉范围 + 开始历史补拉」：它和「归档与存储」里的账本补拉
 * 做的是同一件事（把更早的历史取回来），只是不记账、不能续传、最多一年。两个入口
 * 让人不知道该点哪个，所以只留账本补拉那一个。 */
import { computed, ref } from 'vue';
import SegmentTrack from '../../../components/SegmentTrack.vue';
import {
  isDefaultExportFormat,
  readDefaultExportFormat,
  writeDefaultExportFormat,
} from '../../../lib/exportScope';
import { defineMessages, useMessages } from '../../../i18n';
import { exportFileStems, readFileNameRule, writeFileNameRule, isFileNameRule, type FileNameRule } from '../../../lib/aiTask/fileName';
import { settingsMessages } from '../../Settings.i18n';
import { deckMessages } from '../deck.i18n';

const t = useMessages(settingsMessages);
const n = useMessages(defineMessages(
  {
    nameTitle: '交给 AI 的文件命名',
    nameSub: '每次导出都按这个规则起名，AI 看文件名就知道是哪段时间、哪些数据。',
    ruleRange: '日期范围 + 内容',
    ruleTask: '任务名 + 时刻',
    ruleApp: 'ZeppBridge + 日期',
    example: '例如',
    exampleTitle: '最近 14 天',
  },
  {
    nameTitle: 'AI handoff file names',
    nameSub: 'Every export is named by this rule, so the AI can tell the period and data from the file name.',
    ruleRange: 'Date range + content',
    ruleTask: 'Task name + time',
    ruleApp: 'ZeppBridge + date',
    example: 'e.g.',
    exampleTitle: 'Last 14 days',
  },
  {
    nameTitle: 'Nombres de archivo para la IA',
    nameSub: 'Cada exportación se nombra con esta regla; la IA ve por el nombre qué periodo y qué datos son.',
    ruleRange: 'Rango de fechas + contenido',
    ruleTask: 'Nombre de tarea + hora',
    ruleApp: 'ZeppBridge + fecha',
    example: 'p. ej.',
    exampleTitle: 'Últimos 14 días',
  },
  'views/settings/sections/ExportDefaultsSection',
));

/* 交给 AI 的文件命名规则：存本机，交给 AI 页导出时读同一把键。预览按今天、最近 14 天演示。 */
const fileNameRule = ref<FileNameRule>(readFileNameRule());
const ruleItems = computed(() => [
  { value: 'range_content', label: n.value.ruleRange },
  { value: 'task_time', label: n.value.ruleTask },
  { value: 'app_date', label: n.value.ruleApp },
]);
const onRuleChange = (value: string | number) => {
  if (!isFileNameRule(value)) return;
  fileNameRule.value = value;
  writeFileNameRule(value);
};
const namePreview = computed(() => {
  const now = new Date();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const start = new Date(now.getTime() - 13 * 86400000);
  const stems = exportFileStems(fileNameRule.value, {
    start: iso(start), end: iso(now), categories: ['sleep', 'heart_rate', 'recovery', 'training', 'body', 'workout'],
    title: n.value.exampleTitle, now,
  });
  return `${stems.data}.json · ${stems.prompt}.txt`;
});
const d = useMessages(deckMessages);

const EXPORT_FORMAT_CHOICES = [
  { value: 'json', label: 'JSON' },
  { value: 'csv', label: 'CSV' },
  { value: 'gpx', label: 'GPX' },
];
/* 每种格式一句说明，跟着当前选中的那一格走（以前藏在下拉的每一项里）。 */
const formatHint = computed(() => ({
  json: t.value.formatJsonHint,
  csv: t.value.formatCsvHint,
  gpx: t.value.formatGpxHint,
}[defaultExportFormat.value] ?? ''));

/* 默认导出格式持久化，运动详情读同一把键。 */
const defaultExportFormat = ref(readDefaultExportFormat());
const onExportFormatChange = (value: string | number) => {
  const format = String(value);
  if (!isDefaultExportFormat(format)) return;
  defaultExportFormat.value = format;
  writeDefaultExportFormat(format);
};
</script>

<template>
  <section class="s-section" aria-labelledby="export-title">
    <div class="s-section-head"><h3 id="export-title">{{ d.secExport }}</h3></div>
    <div class="s-list">
      <div class="s-row">
        <div class="s-row-main">
          <span class="s-row-title">{{ t.defaultFormatLabel }}</span>
          <span class="s-row-sub">{{ d.exportFormatSub }}</span>
          <span v-if="formatHint" class="s-row-sub">{{ formatHint }}</span>
        </div>
        <div class="s-row-control">
          <SegmentTrack
            compact
            :model-value="defaultExportFormat"
            :items="EXPORT_FORMAT_CHOICES"
            :aria-label="t.defaultFormatAria"
            @update:model-value="onExportFormatChange"
          />
        </div>
      </div>
      <div class="s-row s-row-stack">
        <div class="s-row-main">
          <span class="s-row-title">{{ n.nameTitle }}</span>
          <span class="s-row-sub">{{ n.nameSub }}</span>
        </div>
        <div class="s-row-control">
          <SegmentTrack compact :model-value="fileNameRule" :items="ruleItems" :aria-label="n.nameTitle" @update:model-value="onRuleChange" />
        </div>
        <p class="name-preview"><span>{{ n.example }}</span><code>{{ namePreview }}</code></p>
      </div>
    </div>
  </section>
</template>

<style scoped src="../settings-local.css"></style>
<style scoped>
.s-row-stack { flex-wrap: wrap; }
.name-preview { display: flex; flex: 1 1 100%; min-width: 0; gap: 8px; margin: 2px 0 0; color: var(--subtle); font-size: var(--fs-xs); }
.name-preview code { min-width: 0; overflow: hidden; color: var(--muted); font-family: var(--font-mono); text-overflow: ellipsis; white-space: nowrap; }
</style>
