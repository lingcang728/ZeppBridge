<script setup lang="ts">
/* 力量训练的肌肉人形卡（#163）。台前调度（2026-11-13）把它从力量卡里拆出来单独成卡：
 * 和逐组明细并排时自己就「悬浮」着，不再靠 sticky 钉在长表格旁边；窄窗口里它是舞台右上角的画中画小窗。
 * 联动状态在页面建的 useStrengthDetail，和逐组明细卡共用：这里停在某块肌肉，那边对应的组亮起来。 */
import GlyphTile from '../GlyphTile.vue';
import WorkoutMuscleMap from './WorkoutMuscleMap.vue';
import { useMessages } from '../../i18n';
import { workoutStrengthMessages } from './WorkoutStrengthCard.i18n';
import type { StrengthDetail } from '../../composables/useStrengthDetail';

const props = defineProps<{ detail: StrengthDetail }>();
const t = useMessages(workoutStrengthMessages);
const { load, mapRow, mapShape, mapShapes, hoverOn, pin } = props.detail;
</script>

<template>
  <section class="surface-card strength-map-card" :aria-label="t.muscleShareAria">
    <div class="section-head">
      <GlyphTile name="power" tone="training" :size="36" />
      <div>
        <p class="section-eyebrow">{{ t.mapEyebrow }}</p>
        <h2>{{ t.mapTitle }}</h2>
      </div>
    </div>
    <WorkoutMuscleMap
      class="muscle-figure"
      :load="load"
      :active-row="mapRow"
      :active-shape="mapShape"
      :active-shapes="mapShapes"
      @hover-shape="hoverOn('shape', $event)"
      @pin-shape="pin('shape', $event)"
    />
  </section>
</template>

<style scoped>
.strength-map-card { display: grid; gap: 12px; padding: 16px 16px 14px; border-radius: var(--radius-lg); container-type: inline-size; }
.section-head { display: flex; align-items: center; gap: 10px; }
.section-head h2 { margin: 1px 0 0; font-size: var(--fs-xl); letter-spacing: -.02em; }
.section-eyebrow { margin: 0; color: var(--subtle); font-family: var(--font-mono); font-size: var(--fs-2xs); font-weight: 700; letter-spacing: .16em; text-transform: uppercase; }
.muscle-figure { padding: 10px 6px 8px; border-radius: var(--radius-md); background: var(--mat-inset); }
/* 自己一张卡时人形跟着卡宽长大（以前拼在力量卡里每面最多 132px）。 */
.muscle-figure :deep(.figure) { max-width: 200px; }
/* 画中画（窄窗口舞台右上角，排版宽 300、缩成一半画）：只留人形和色例。 */
@container (max-width: 320px) {
  .strength-map-card { padding: 8px; gap: 0; }
  .section-head { display: none; }
}
</style>
