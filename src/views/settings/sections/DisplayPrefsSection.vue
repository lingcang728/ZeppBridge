<script setup lang="ts">
import { computed } from 'vue';
import SelectMenu from '../../../components/SelectMenu.vue';
import SegmentTrack from '../../../components/SegmentTrack.vue';
import { UI_SCALES, useUiScale, type UiScale } from '../../../composables/useUiScale';
import {
  DATE_ORDERS,
  TIME_FORMATS,
  dateOrder,
  dateTimeLabels,
  setDateOrder,
  setTimeFormat,
  timeFormat,
  type DateOrder,
  type TimeFormat,
} from '../../../lib/dateTime';
import {
  DISTANCE_UNITS,
  distanceUnit,
  distanceUnitOptionLabel,
  setDistanceUnit,
  type DistanceUnit,
} from '../../../lib/units';
import { locale, LOCALES, LOCALE_LABELS, setLocale, useMessages, type Locale } from '../../../i18n';
import { settingsMessages } from '../../Settings.i18n';

const t = useMessages(settingsMessages);
const { scale, setScale } = useUiScale();
const scaleItems = computed(() => UI_SCALES.map((option) => ({ value: option, label: `${option}%` })));

const localeOptions = computed(() =>
  LOCALES.map((value) => ({ value, label: LOCALE_LABELS[value] })));
const distanceUnitOptions = computed(() =>
  DISTANCE_UNITS.map((value) => ({ value, label: distanceUnitOptionLabel(value) })));
const timeFormatOptions = computed(() =>
  TIME_FORMATS.map((value) => ({ value, label: dateTimeLabels.value[value] })));
const dateOrderOptions = computed(() =>
  DATE_ORDERS.map((value) => ({ value, label: dateTimeLabels.value[value] })));
const chooseLocale = (value: string | number) => setLocale(String(value) as Locale);
const chooseDistanceUnit = (value: string | number) => setDistanceUnit(String(value) as DistanceUnit);
const chooseTimeFormat = (value: string | number) => setTimeFormat(String(value) as TimeFormat);
const chooseDateOrder = (value: string | number) => setDateOrder(String(value) as DateOrder);
</script>

<template>
  <section class="settings-card display-prefs" aria-labelledby="display-prefs-title">
    <h2 id="display-prefs-title">{{ t.displayPrefsTitle }}</h2>
    <!-- 语言开关标签是双语的，而且不跟着界面语言变：一个看不懂中文的人
         必须能在中文界面上找到它，反过来也一样。 -->
    <div class="field-row">
      <span class="kv-label">语言 · Language</span>
      <SelectMenu
        :model-value="locale"
        :options="localeOptions"
        aria-label="语言 · Language"
        @update:model-value="chooseLocale"
      />
    </div>
    <div class="field-row">
      <span class="kv-label">{{ t.distanceUnitLabel }}</span>
      <SelectMenu
        :model-value="distanceUnit"
        :options="distanceUnitOptions"
        :aria-label="t.distanceUnitLabel"
        @update:model-value="chooseDistanceUnit"
      />
    </div>
    <div class="field-row">
      <span class="kv-label">{{ dateTimeLabels.time }}</span>
      <SelectMenu
        :model-value="timeFormat"
        :options="timeFormatOptions"
        :aria-label="dateTimeLabels.time"
        @update:model-value="chooseTimeFormat"
      />
    </div>
    <div class="field-row">
      <span class="kv-label">{{ dateTimeLabels.date }}</span>
      <SelectMenu
        :model-value="dateOrder"
        :options="dateOrderOptions"
        :aria-label="dateTimeLabels.date"
        @update:model-value="chooseDateOrder"
      />
    </div>
    <div class="scale-row">
      <div class="scale-copy">
        <span class="kv-label">{{ t.scaleLabel }}</span>
        <p class="section-description">{{ t.scaleNote }}</p>
      </div>
      <SegmentTrack
        :items="scaleItems"
        :model-value="scale"
        :aria-label="t.scaleLabel"
        @update:model-value="(value) => setScale(Number(value) as UiScale)"
      />
    </div>
  </section>
</template>

<style scoped src="../settings-base.css"></style>
<style scoped>
/* 标签与下拉紧挨着：两组并排但不被拉满整列，否则标签在最左、下拉在最右，
   中间一大片空白（field-row 默认 space-between）。
   下拉的 flex / min-width 以共用的 `.field-row .select-menu` 为准（拆分前它排在后面、覆盖了这里）。 */
.display-prefs { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); column-gap: 32px; row-gap: 6px; }
.display-prefs > h2 { grid-column: 1 / -1; }
.display-prefs .field-row { justify-content: flex-start; gap: 16px; min-width: 0; }
.display-prefs .kv-label { flex: 0 0 8.5em; }
.display-prefs .select-menu { flex: 0 0 auto; width: auto; min-width: 180px; max-width: 280px; }
.scale-row { grid-column: 1 / -1; display: grid; grid-template-columns: minmax(12em, 0.7fr) minmax(280px, 1fr); align-items: center; gap: 16px 24px; padding-top: 10px; margin-top: 6px; border-top: 1px solid var(--line); }
.scale-copy { display: grid; gap: 4px; min-width: 0; }
.scale-copy .kv-label { flex: none; }
@media (max-width: 860px) {
  .display-prefs { grid-template-columns: minmax(0, 1fr); }
  .display-prefs .select-menu { flex: 1 1 auto; width: auto; max-width: 280px; }
  .scale-row { grid-template-columns: minmax(0, 1fr); }
}
</style>
