<script setup lang="ts">
import { computed, ref } from 'vue';
import SelectMenu from '../../../components/SelectMenu.vue';
import { useSettingsContext } from '../../../composables/settings/context';
import { useSyncController } from '../../../composables/useSyncController';
import {
  isDefaultExportFormat,
  readDefaultExportFormat,
  writeDefaultExportFormat,
} from '../../../lib/exportScope';
import { BACKFILL_RANGE_DAYS, rangeOptions } from '../../../lib/rangeOptions';
import { useMessages } from '../../../i18n';
import { settingsMessages } from '../../Settings.i18n';

const t = useMessages(settingsMessages);
const { isSyncing } = useSyncController();
const { connected, configuredOnly } = useSettingsContext().auth;
const { historyDays, prefsBusy, savePrefs, confirmHistorySync } = useSettingsContext().prefs;

/* 选项来自 lib/rangeOptions.ts 的那条唯一梯子。以前这里写死 [7,30,90,365]，
   而后端的补拉默认值是 180——180 不在选项里，下拉就匹配不到任何一项，
   全新安装时这个框是空的。 */
const HISTORY_CHOICES = computed(() =>
  rangeOptions(BACKFILL_RANGE_DAYS).map((range) => ({ value: range.days, label: range.label })));
const EXPORT_FORMAT_CHOICES = computed(() => [
  { value: 'json', label: 'JSON', hint: t.value.formatJsonHint },
  { value: 'csv', label: 'CSV', hint: t.value.formatCsvHint },
  { value: 'gpx', label: 'GPX', hint: t.value.formatGpxHint },
]);

/* 默认导出格式持久化，Explore / 运动详情读同一把键。 */
const defaultExportFormat = ref(readDefaultExportFormat());
const onExportFormatChange = (value: string | number) => {
  const format = String(value);
  if (!isDefaultExportFormat(format)) return;
  defaultExportFormat.value = format;
  writeDefaultExportFormat(format);
};
</script>

<template>
  <section class="settings-card" aria-labelledby="export-title">
    <h2 id="export-title">{{ t.exportTitle }}</h2>
    <div class="field-row">
      <span class="kv-label">{{ t.defaultFormatLabel }}</span>
      <SelectMenu
        v-model="defaultExportFormat"
        :options="EXPORT_FORMAT_CHOICES"
        :aria-label="t.defaultFormatAria"
        @update:model-value="onExportFormatChange"
      />
    </div>
    <div class="field-row">
      <span class="kv-label">{{ t.historyRangeLabel }}</span>
      <SelectMenu
        v-model="historyDays"
        :options="HISTORY_CHOICES"
        :aria-label="t.historyRangeAria"
        @update:model-value="savePrefs"
      />
    </div>
    <p class="retain-note">{{ t.exportNote }}</p>
    <div class="inline-actions">
      <button class="button primary" type="button" :disabled="isSyncing || (!connected && !configuredOnly) || prefsBusy" @click="confirmHistorySync">
        {{ t.startBackfill }}
      </button>
    </div>
  </section>
</template>

<style scoped src="../settings-base.css"></style>
