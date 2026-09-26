<script setup lang="ts">
import { computed } from 'vue';
import SelectMenu from '../../../components/SelectMenu.vue';
import SegmentTrack from '../../../components/SegmentTrack.vue';
import { UI_SCALES, useUiScale, type UiScale } from '../../../composables/useUiScale';
import { useTheme, type ThemeMode } from '../../../composables/useTheme';
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
import { deckMessages } from '../deck.i18n';

const t = useMessages(settingsMessages);
const d = useMessages(deckMessages);
const { scale, setScale } = useUiScale();
const { themeMode, setTheme } = useTheme();
const scaleItems = computed(() => UI_SCALES.map((option) => ({ value: option, label: `${option}%` })));

const localeOptions = computed(() =>
  LOCALES.map((value) => ({ value, label: LOCALE_LABELS[value] })));
const distanceUnitOptions = computed(() =>
  DISTANCE_UNITS.map((value) => ({ value, label: distanceUnitOptionLabel(value) })));
const timeFormatOptions = computed(() =>
  TIME_FORMATS.map((value) => ({ value, label: dateTimeLabels.value[value] })));
const dateOrderOptions = computed(() =>
  DATE_ORDERS.map((value) => ({ value, label: dateTimeLabels.value[value] })));
const themeOptions = computed(() => [
  { value: 'system', label: d.value.themeSystem, icon: 'monitor' as const },
  { value: 'dark', label: d.value.themeDark, icon: 'moon' as const },
  { value: 'light', label: d.value.themeLight, icon: 'sun' as const },
]);
const chooseLocale = (value: string | number) => setLocale(String(value) as Locale);
const chooseDistanceUnit = (value: string | number) => setDistanceUnit(String(value) as DistanceUnit);
const chooseTimeFormat = (value: string | number) => setTimeFormat(String(value) as TimeFormat);
const chooseDateOrder = (value: string | number) => setDateOrder(String(value) as DateOrder);
const chooseTheme = (value: string | number) => setTheme(String(value) as ThemeMode);
</script>

<template>
  <div class="display-prefs">
    <section class="s-section">
      <div class="s-section-head"><h3>{{ d.secFormat }}</h3></div>
      <div class="s-list">
        <!-- 语言开关标签是双语的，而且不跟着界面语言变：一个看不懂中文的人
             必须能在中文界面上找到它，反过来也一样。 -->
        <div class="s-row">
          <div class="s-row-main"><span class="s-row-title">语言 · Language</span></div>
          <div class="s-row-control">
            <SelectMenu :model-value="locale" :options="localeOptions" aria-label="语言 · Language" @update:model-value="chooseLocale" />
          </div>
        </div>
        <div class="s-row">
          <div class="s-row-main"><span class="s-row-title">{{ t.distanceUnitLabel }}</span></div>
          <div class="s-row-control">
            <SelectMenu :model-value="distanceUnit" :options="distanceUnitOptions" :aria-label="t.distanceUnitLabel" @update:model-value="chooseDistanceUnit" />
          </div>
        </div>
        <div class="s-row">
          <div class="s-row-main"><span class="s-row-title">{{ dateTimeLabels.time }}</span></div>
          <div class="s-row-control">
            <SelectMenu :model-value="timeFormat" :options="timeFormatOptions" :aria-label="dateTimeLabels.time" @update:model-value="chooseTimeFormat" />
          </div>
        </div>
        <div class="s-row">
          <div class="s-row-main"><span class="s-row-title">{{ dateTimeLabels.date }}</span></div>
          <div class="s-row-control">
            <SelectMenu :model-value="dateOrder" :options="dateOrderOptions" :aria-label="dateTimeLabels.date" @update:model-value="chooseDateOrder" />
          </div>
        </div>
      </div>
    </section>

    <section class="s-section">
      <div class="s-section-head"><h3>{{ d.secAppearance }}</h3></div>
      <div class="s-list">
        <div class="s-row">
          <div class="s-row-main"><span class="s-row-title">{{ d.themeLabel }}</span></div>
          <div class="s-row-control">
            <SelectMenu :model-value="themeMode" :options="themeOptions" :aria-label="d.themeLabel" @update:model-value="chooseTheme" />
          </div>
        </div>
        <!-- 缩放是一枚按内容收紧、靠右的分段控件；以前它被拉满整行，右边空出一大截。 -->
        <div class="s-row">
          <div class="s-row-main">
            <span class="s-row-title">{{ t.scaleLabel }}</span>
            <span class="s-row-sub">{{ d.scaleSub }}</span>
          </div>
          <div class="s-row-control">
            <SegmentTrack
              compact
              :items="scaleItems"
              :model-value="scale"
              :aria-label="t.scaleLabel"
              @update:model-value="(value) => setScale(Number(value) as UiScale)"
            />
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped src="../settings-base.css"></style>
<style scoped>
.display-prefs { display: grid; grid-template-columns: minmax(0, 1fr); gap: 22px; }
.display-prefs > .s-section + .s-section { margin-top: 0; }
</style>
