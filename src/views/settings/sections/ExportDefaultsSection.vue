<script setup lang="ts">
/* 默认导出格式。
 *
 * 这里以前还有一个「历史补拉范围 + 开始历史补拉」：它和「归档与存储」里的账本补拉
 * 做的是同一件事（把更早的历史取回来），只是不记账、不能续传、最多一年。两个入口
 * 让人不知道该点哪个，所以只留账本补拉那一个。 */
import { computed, ref } from 'vue';
import SelectMenu from '../../../components/SelectMenu.vue';
import {
  isDefaultExportFormat,
  readDefaultExportFormat,
  writeDefaultExportFormat,
} from '../../../lib/exportScope';
import { useMessages } from '../../../i18n';
import { settingsMessages } from '../../Settings.i18n';
import { deckMessages } from '../deck.i18n';

const t = useMessages(settingsMessages);
const d = useMessages(deckMessages);

const EXPORT_FORMAT_CHOICES = computed(() => [
  { value: 'json', label: 'JSON', hint: t.value.formatJsonHint },
  { value: 'csv', label: 'CSV', hint: t.value.formatCsvHint },
  { value: 'gpx', label: 'GPX', hint: t.value.formatGpxHint },
]);

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
        </div>
        <div class="s-row-control">
          <SelectMenu
            :model-value="defaultExportFormat"
            :options="EXPORT_FORMAT_CHOICES"
            :aria-label="t.defaultFormatAria"
            @update:model-value="onExportFormatChange"
          />
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped src="../settings-base.css"></style>
