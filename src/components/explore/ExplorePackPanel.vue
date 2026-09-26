<script setup lang="ts">
/* 探索页右列：导出格式、细节档位、数据流勾选、预估体积、目标 AI 工具。 */
import { computed, ref } from 'vue';
import Icon, { type IconName } from '../Icon.vue';
import { exportDetailOptions, exportTypeGroups, exportTypeOptions, type SaveFormat } from '../../composables/useExport';
import { AI_PROVIDERS, type AiProviderId } from '../../lib/aiProviders';
import type { ExportDataType, ExportDetail, ExportTypeGroup } from '../../types';
import { useMessages } from '../../i18n';
import { exploreMessages } from '../../views/Explore.i18n';

defineProps<{ sizeText: string }>();
const format = defineModel<SaveFormat>('format', { required: true });
const detail = defineModel<ExportDetail>('detail', { required: true });
const dataTypes = defineModel<ExportDataType[]>('dataTypes', { required: true });
const provider = defineModel<AiProviderId>('provider', { required: true });

const t = useMessages(exploreMessages);

const formats = computed<{ key: SaveFormat; label: string; sub: string; icon: IconName }[]>(() => [
  { key: 'json', label: 'JSON', sub: t.value.formatJsonSub, icon: 'braces' },
  { key: 'csv', label: 'CSV', sub: t.value.formatCsvSub, icon: 'table' },
  { key: 'gpx', label: 'GPX', sub: t.value.formatGpxSub, icon: 'map' },
  { key: 'fit', label: 'FIT', sub: t.value.formatFitSub, icon: 'activity' },
]);
const detailOptions = computed(() => exportDetailOptions());

const providerIconFailed = ref<Partial<Record<AiProviderId, boolean>>>({});
const markProviderIconFailed = (id: AiProviderId) => {
  providerIconFailed.value[id] = true;
};

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

const isTypeSelected = (value: ExportDataType) => dataTypes.value.includes(value);

const toggleType = (value: ExportDataType) => {
  const next = new Set(dataTypes.value);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  // Keep the picker's own order so the list never reshuffles as it is used.
  dataTypes.value = typeOptions.value
    .map((option) => option.value)
    .filter((option) => next.has(option));
};

const toggleGroup = (group: ExportTypeGroup) => {
  const options = typeOptions.value.filter((option) => option.group === group).map((option) => option.value);
  const allOn = options.every((option) => dataTypes.value.includes(option));
  const next = new Set(dataTypes.value);
  for (const option of options) {
    if (allOn) next.delete(option);
    else next.add(option);
  }
  dataTypes.value = typeOptions.value
    .map((option) => option.value)
    .filter((option) => next.has(option));
};

const groupIsFull = (group: ExportTypeGroup) =>
  typeOptions.value
    .filter((option) => option.group === group)
    .every((option) => dataTypes.value.includes(option.value));
</script>

<template>
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
          v-for="item in formats"
          :key="item.key"
          type="button"
          role="radio"
          :aria-checked="format === item.key"
          :class="['format-card', { 'is-on': format === item.key }]"
          @click="format = item.key"
        >
          <Icon v-if="format === item.key" name="circle-check" :size="14" class="format-check" />
          <Icon :name="item.icon" :size="20" />
          <strong>{{ item.label }}</strong>
          <span>{{ item.sub }}</span>
        </button>
      </div>

      <p class="group-label">{{ t.detailGroup }}</p>
      <div class="format-grid detail-grid" role="radiogroup" :aria-label="t.detailAria">
        <button
          v-for="option in detailOptions"
          :key="option.value"
          type="button"
          role="radio"
          :aria-checked="detail === option.value"
          :class="['format-card', { 'is-on': detail === option.value }]"
          @click="detail = option.value"
        >
          <Icon v-if="detail === option.value" name="circle-check" :size="14" class="format-check" />
          <strong>{{ option.label }}</strong>
          <span>{{ option.hint }}</span>
        </button>
      </div>

      <div class="group-row">
        <p class="group-label">{{ t.streamsGroup }}</p>
        <span class="see-more">{{ t.selectedCount(dataTypes.length, typeOptions.length) }}</span>
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
        <p v-if="!dataTypes.length" class="empty-note">{{ t.noTypesSelected }}</p>
      </div>

      <div class="size-row">
        <span>{{ t.estimatedSize }}</span>
        <strong class="font-mono">{{ sizeText }}</strong>
      </div>

      <p class="group-label">{{ t.targetGroup }}</p>
      <div class="tool-grid" role="radiogroup" :aria-label="t.targetAria">
        <button
          v-for="tool in AI_PROVIDERS"
          :key="tool.id"
          type="button"
          role="radio"
          :aria-checked="provider === tool.id"
          :class="['tool-card', { 'is-on': provider === tool.id }]"
          @click="provider = tool.id"
        >
          <Icon v-if="provider === tool.id" name="circle-check" :size="13" class="tool-check" />
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
</template>

<style scoped src="./ExplorePackPanel.css"></style>
