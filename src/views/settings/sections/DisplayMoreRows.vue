<script setup lang="ts">
/* 不常改的显示偏好：时间格式、日期顺序、界面缩放。从「显示与语言」卡挪来，
   只是几行，由高级卡「更多偏好」那块列表排进去。 */
import { computed } from 'vue';
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
import { useMessages } from '../../../i18n';
import { settingsMessages } from '../../Settings.i18n';
import { deckMessages } from '../deck.i18n';

const t = useMessages(settingsMessages);
const d = useMessages(deckMessages);
const { scale, setScale } = useUiScale();
const scaleItems = computed(() => UI_SCALES.map((option) => ({ value: option, label: `${option}%` })));
const timeFormatOptions = computed(() =>
  TIME_FORMATS.map((value) => ({ value, label: dateTimeLabels.value[value] })));
const dateOrderOptions = computed(() =>
  DATE_ORDERS.map((value) => ({ value, label: dateTimeLabels.value[value] })));
const chooseTimeFormat = (value: string | number) => setTimeFormat(String(value) as TimeFormat);
const chooseDateOrder = (value: string | number) => setDateOrder(String(value) as DateOrder);
</script>

<template>
  <div class="s-row">
    <div class="s-row-main"><span class="s-row-title">{{ dateTimeLabels.time }}</span></div>
    <div class="s-row-control">
      <SegmentTrack compact :items="timeFormatOptions" :model-value="timeFormat" :aria-label="dateTimeLabels.time" @update:model-value="chooseTimeFormat" />
    </div>
  </div>
  <div class="s-row">
    <div class="s-row-main"><span class="s-row-title">{{ dateTimeLabels.date }}</span></div>
    <div class="s-row-control">
      <SegmentTrack compact :items="dateOrderOptions" :model-value="dateOrder" :aria-label="dateTimeLabels.date" @update:model-value="chooseDateOrder" />
    </div>
  </div>
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
</template>

<style scoped src="../settings-local.css"></style>
