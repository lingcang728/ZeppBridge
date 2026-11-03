<script setup lang="ts">
/* 时间格式与日期顺序。用户反馈 DD/MM、24 小时制找不到（2026-10），从「更多偏好」挪回「显示与语言」卡；
   副标题是用当前设置排出来的此刻，选完立刻看得到效果。 */
import { computed } from 'vue';
import SegmentTrack from '../../../components/SegmentTrack.vue';
import {
  DATE_ORDERS,
  TIME_FORMATS,
  dateOrder,
  dateTimeLabels,
  displayDateTimeFormatter,
  setDateOrder,
  setTimeFormat,
  timeFormat,
  type DateOrder,
  type TimeFormat,
} from '../../../lib/dateTime';

const timeFormatOptions = computed(() =>
  TIME_FORMATS.map((value) => ({ value, label: dateTimeLabels.value[value] })));
const dateOrderOptions = computed(() =>
  DATE_ORDERS.map((value) => ({ value, label: dateTimeLabels.value[value] })));
const chooseTimeFormat = (value: string | number) => setTimeFormat(String(value) as TimeFormat);
const chooseDateOrder = (value: string | number) => setDateOrder(String(value) as DateOrder);
const now = new Date();
/* displayDateTimeFormatter 自己读偏好与系统区域的 ref，偏好一变这两行就重排。 */
const sampleTime = computed(() => displayDateTimeFormatter({ hour: 'numeric', minute: '2-digit' }).format(now));
const sampleDate = computed(() => displayDateTimeFormatter({ year: 'numeric', month: '2-digit', day: '2-digit' }).format(now));
</script>

<template>
  <div class="s-row">
    <div class="s-row-main">
      <span class="s-row-title">{{ dateTimeLabels.time }}</span>
      <span class="s-row-sub">{{ sampleTime }}</span>
    </div>
    <div class="s-row-control">
      <SegmentTrack compact :items="timeFormatOptions" :model-value="timeFormat" :aria-label="dateTimeLabels.time" @update:model-value="chooseTimeFormat" />
    </div>
  </div>
  <div class="s-row">
    <div class="s-row-main">
      <span class="s-row-title">{{ dateTimeLabels.date }}</span>
      <span class="s-row-sub">{{ sampleDate }}</span>
    </div>
    <div class="s-row-control">
      <SegmentTrack compact :items="dateOrderOptions" :model-value="dateOrder" :aria-label="dateTimeLabels.date" @update:model-value="chooseDateOrder" />
    </div>
  </div>
</template>

<style scoped src="../settings-local.css"></style>
