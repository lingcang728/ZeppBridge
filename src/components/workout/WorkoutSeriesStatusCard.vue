<script setup lang="ts">
/* 逐点序列读不到（可重试）或这次运动本来就没有可画的曲线时的那张说明卡。 */
import GlyphTile from '../GlyphTile.vue';
import { useMessages } from '../../i18n';
import { workoutDetailMessages } from '../../views/WorkoutDetail.i18n';

defineProps<{ error: string | null }>();
const emit = defineEmits<{ retry: [] }>();
const t = useMessages(workoutDetailMessages);
</script>

<template>
  <section v-if="error" class="surface-card chart-empty" role="alert">
    <GlyphTile name="structured-data" :size="42" />
    <div>
      <strong>{{ t.seriesFailedTitle }}</strong>
      <p>{{ error }}</p>
      <button class="button button-secondary" type="button" @click="emit('retry')">{{ t.retry }}</button>
    </div>
  </section>
  <section v-else class="surface-card chart-empty"><GlyphTile name="structured-data" :size="42" /><div><strong>{{ t.chartsEmptyTitle }}</strong><p>{{ t.chartsEmptyBody }}</p></div></section>
</template>

<style scoped>
.chart-empty { display: flex; align-items: center; gap: 12px; padding: 20px; color: var(--muted); font-size: var(--fs-sm); }
.chart-empty strong { color: var(--ink); }
.chart-empty p { margin: 2px 0 0; }
</style>
