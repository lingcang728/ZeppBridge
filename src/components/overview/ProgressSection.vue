<script setup lang="ts">
/**
 * 概览上「置顶指标」下面的一组：这一周的摘要（整行），目标与纪录并排。
 * 数据读一次（composables/useProgressData.ts）再分给三张卡；一条记录都没有时整组不显示，
 * 免得新装的应用先看到三张空卡。
 */
import { useProgressData } from '../../composables/useProgressData';
import GoalsCard from './GoalsCard.vue';
import RecordsCard from './RecordsCard.vue';
import WeekSummaryCard from './WeekSummaryCard.vue';

const { data, loaded, hasAnything } = useProgressData();
</script>

<template>
  <div v-if="loaded && hasAnything" class="progress-section">
    <WeekSummaryCard :steps="data.steps" :hrv="data.hrv" :resting-hr="data.restingHr" :nights="data.nights" :workouts="data.workouts" />
    <div class="progress-pair">
      <GoalsCard :steps="data.steps" :distance="data.distance" :nights="data.nights" />
      <RecordsCard :steps="data.steps" :distance="data.distance" :nights="data.nights" :workouts="data.workouts" />
    </div>
  </div>
</template>

<style scoped>
.progress-section { display: grid; gap: 18px; }
.progress-pair { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); gap: 18px; align-items: start; }
@media (max-width: 900px) { .progress-pair { grid-template-columns: minmax(0, 1fr); } }
</style>
