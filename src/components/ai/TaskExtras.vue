<script setup lang="ts">
/**
 * 附件原件 + 高级选项（精确 GPS、详细程度、任务限定 MCP）。
 * 附件状态（找不到 / 改过）来自预览；找不到的可以就地重新选择。
 */
import { computed, ref } from 'vue';
import Icon from '../Icon.vue';
import SegmentTrack from '../SegmentTrack.vue';
import type { AiTaskDetailLevel, AiTaskPreview } from '../../lib/bridge/types';
import { isDesktop, toUserMessage } from '../../lib/bridge';
import { pickAttachments } from '../../lib/aiTask/attachments';
import { attachmentPlainReferenceNote } from '../../lib/aiTask/copy';
import { formatBytes } from '../../lib/aiTask/coverage';
import { useAiTaskDraft } from '../../composables/useAiTaskDraft';
import { defineMessages, useMessages } from '../../i18n';

const props = defineProps<{ preview: AiTaskPreview | null }>();

const { draft, addAttachments, removeAttachment, replaceAttachment, setPreciseGps, setDetailLevel, setMcpShared } = useAiTaskDraft();

const t = useMessages(defineMessages(
  {
    attachTitle: '附件原件（PDF / 图片）',
    add: '添加文件',
    pickerTitle: '选择要一起交给 AI 的文件',
    filterName: 'PDF 与图片',
    skipped: (count: number) => `${count} 个文件类型不支持，未加入`,
    pickFailed: '附件添加失败',
    desktopOnly: '需要桌面应用才能选文件',
    remove: '移除',
    reselect: '重新选择',
    missing: '找不到了',
    changed: '和添加时不同',
    advanced: '高级选项',
    preciseGps: '精确路线（GPS 坐标）',
    preciseGpsHint: '默认关；打开后导出轨迹保留原始坐标。',
    detail: '详细程度',
    detailSummary: '摘要',
    detailStandard: '标准',
    detailDetailed: '详细（含逐点序列）',
    mcp: '允许本机 MCP 工具查询这个任务',
    mcpHint: '给 Claude Desktop 这类本机工具用。只对以 --scope task 启动的 MCP 生效：它只能查这个任务覆盖的范围；默认的全库只读模式不受这个开关限制。',
  },
  {
    attachTitle: 'Original files (PDF / images)',
    add: 'Add files',
    pickerTitle: 'Choose files to hand over with the task',
    filterName: 'PDF and images',
    skipped: (count: number) => `${count} file(s) skipped — unsupported type`,
    pickFailed: 'Could not add files',
    desktopOnly: 'Requires the desktop app to pick files',
    remove: 'Remove',
    reselect: 'Reselect',
    missing: 'missing',
    changed: 'changed since added',
    advanced: 'Advanced options',
    preciseGps: 'Precise route (GPS coordinates)',
    preciseGpsHint: 'Off by default; when on, exported tracks keep raw coordinates.',
    detail: 'Detail level',
    detailSummary: 'Summary',
    detailStandard: 'Standard',
    detailDetailed: 'Detailed (per-point series)',
    mcp: 'Let local MCP tools query this task',
    mcpHint: 'For local tools such as Claude Desktop. Only applies to MCP started with --scope task, which then sees just what this task covers; the default full read-only mode is not narrowed by this switch.',
  },
  {
    attachTitle: 'Archivos originales (PDF / imágenes)',
    add: 'Agregar archivos',
    pickerTitle: 'Elige los archivos para pasar a la IA',
    filterName: 'PDF e imágenes',
    skipped: (count: number) => `${count} archivo(s) omitido(s): formato no admitido`,
    pickFailed: 'Error al agregar archivos',
    desktopOnly: 'Requiere la app de escritorio para seleccionar archivos',
    remove: 'Quitar',
    reselect: 'Volver a elegir',
    missing: 'No encontrado',
    changed: 'Modificado tras agregar',
    advanced: 'Opciones avanzadas',
    preciseGps: 'Ruta precisa (coordenadas GPS)',
    preciseGpsHint: 'Desactivado por defecto; al activarlo, conserva coordenadas originales.',
    detail: 'Nivel de detalle',
    detailSummary: 'Resumen',
    detailStandard: 'Estándar',
    detailDetailed: 'Detallado (series punto a punto)',
    mcp: 'Permitir que herramientas MCP locales consulten esta tarea',
    mcpHint: 'Para herramientas locales como Claude Desktop. Solo se aplica al MCP iniciado con --scope task, que entonces ve únicamente lo que cubre esta tarea; el modo predeterminado de solo lectura completa no se restringe con este interruptor.',
  },
  'components/ai/TaskExtras',
));

const notice = ref<string | null>(null);
const desktop = isDesktop();

const statusById = computed(() => new Map((props.preview?.attachments ?? []).map((item) => [item.id, item.status])));
/* display_name 是用户文件名：解构改名成 name 再渲染，不从模板里直取后端字段。 */
const rows = computed(() =>
  draft.value.attachments.map(({ display_name: name, ...rest }) => ({ ...rest, name, status: statusById.value.get(rest.id) ?? null })));

const detailOptions = computed(() => [
  { value: 'summary', label: t.value.detailSummary },
  { value: 'standard', label: t.value.detailStandard },
  { value: 'detailed', label: t.value.detailDetailed },
]);

const pick = async (replaceId?: string) => {
  notice.value = null;
  try {
    const { added, skipped } = await pickAttachments(t.value.pickerTitle, t.value.filterName, !replaceId);
    if (replaceId && added[0]) replaceAttachment(replaceId, added[0]);
    else addAttachments(added);
    if (skipped.length) notice.value = t.value.skipped(skipped.length);
  } catch (error) {
    notice.value = desktop ? toUserMessage(error, t.value.pickFailed) : t.value.desktopOnly;
  }
};
</script>

<template>
  <section class="extras" :aria-label="t.attachTitle">
    <p class="ai-label">{{ t.attachTitle }}</p>
    <ul v-if="rows.length" class="files">
      <li v-for="row in rows" :key="row.id" :class="{ 'is-missing': row.status === 'missing' }">
        <Icon :name="row.kind === 'pdf' ? 'file' : 'pin'" :size="14" />
        <span class="file-name">{{ row.name }}</span>
        <span class="file-size">{{ formatBytes(row.byte_len) }}</span>
        <span v-if="row.status === 'missing'" class="file-flag bad">{{ t.missing }}</span>
        <span v-else-if="row.status === 'changed'" class="file-flag warn">{{ t.changed }}</span>
        <button v-if="row.status === 'missing'" type="button" class="ai-tool" @click="pick(row.id)">{{ t.reselect }}</button>
        <button type="button" class="ai-tool" @click="removeAttachment(row.id)">{{ t.remove }}</button>
      </li>
    </ul>
    <button type="button" class="pill-button quiet add-file" :disabled="!desktop" @click="pick()"><Icon name="plus" :size="14" />{{ t.add }}</button>
    <p class="ai-note"><Icon name="shield" :size="13" />{{ attachmentPlainReferenceNote() }}</p>
    <p v-if="notice" class="ai-note warn" role="status">{{ notice }}</p>

    <details class="advanced">
      <summary><Icon name="sliders" :size="14" />{{ t.advanced }}</summary>
      <div class="toggle-row">
        <span class="toggle-copy"><strong>{{ t.preciseGps }}</strong><small>{{ t.preciseGpsHint }}</small></span>
        <button type="button" class="mat-switch" role="switch" :aria-checked="draft.include_precise_gps" :aria-label="t.preciseGps"
          @click="setPreciseGps(!draft.include_precise_gps)"></button>
      </div>
      <div class="toggle-row">
        <span class="toggle-copy"><strong>{{ t.mcp }}</strong><small>{{ t.mcpHint }}</small></span>
        <button type="button" class="mat-switch" role="switch" :aria-checked="draft.mcp_shared" :aria-label="t.mcp"
          @click="setMcpShared(!draft.mcp_shared)"></button>
      </div>
      <p class="ai-label">{{ t.detail }}</p>
      <SegmentTrack compact :model-value="draft.detail_level" :items="detailOptions" :aria-label="t.detail"
        @update:model-value="setDetailLevel($event as AiTaskDetailLevel)" />
    </details>
  </section>
</template>

<style scoped>
.files { display: grid; gap: 6px; margin: 0 0 8px; padding: 0; list-style: none; }
.files li { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 8px; background: var(--mat-inset); box-shadow: var(--mat-inset-shadow); }
.files li.is-missing { outline: 1px solid color-mix(in srgb, var(--danger) 45%, transparent); }
.file-name { flex: 1; min-width: 0; color: var(--ink); font-size: var(--fs-sm); overflow-wrap: anywhere; }
.file-size { color: var(--subtle); font-size: var(--fs-xs); font-family: var(--font-mono); }
.file-flag { font-size: var(--fs-xs); }
.file-flag.bad { color: var(--danger); }
.file-flag.warn { color: var(--warning); }
.add-file { min-height: 34px; padding: 0 14px; }
.toggle-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-top: 12px; }
.toggle-copy { display: grid; min-width: 0; gap: 2px; }
.toggle-copy strong { color: var(--ink); font-size: var(--fs-sm); font-weight: 600; }
.toggle-copy small { color: var(--subtle); font-size: var(--fs-xs); line-height: 1.45; }
.toggle-row .mat-switch { flex: 0 0 auto; }
.advanced { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line); }
.advanced > summary { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: var(--fs-sm); font-weight: 600; cursor: pointer; list-style: none; }
.advanced > summary::-webkit-details-marker { display: none; }
.advanced[open] > summary { color: var(--ink); }
</style>
