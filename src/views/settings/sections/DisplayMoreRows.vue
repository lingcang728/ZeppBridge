<script setup lang="ts">
/* 不常改的显示偏好：界面缩放、界面特效（issue #133）。由高级卡「更多偏好」那块列表排进去；
   时间格式、日期顺序 2026-10 挪回了「显示与语言」卡（DateTimeRows.vue）。 */
import { computed } from 'vue';
import SegmentTrack from '../../../components/SegmentTrack.vue';
import { UI_SCALES, useUiScale, type UiScale } from '../../../composables/useUiScale';
import { useEffects, type EffectsMode } from '../../../composables/useEffects';
import { useMessages } from '../../../i18n';
import { settingsMessages } from '../../Settings.i18n';
import { deckMessages } from '../deck.i18n';

const t = useMessages(settingsMessages);
const d = useMessages(deckMessages);
const { scale, setScale } = useUiScale();
const scaleItems = computed(() => UI_SCALES.map((option) => ({ value: option, label: `${option}%` })));
const { mode: effects, setEffects } = useEffects();
const effectItems = computed(() => [
  { value: 'auto', label: d.value.effectsAuto },
  { value: 'full', label: d.value.effectsFull },
  { value: 'lite', label: d.value.effectsLite },
]);
</script>

<template>
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
  <div class="s-row">
    <div class="s-row-main">
      <span class="s-row-title">{{ d.effectsLabel }}</span>
      <span class="s-row-sub">{{ d.effectsSub }}</span>
    </div>
    <div class="s-row-control">
      <SegmentTrack
        compact
        :items="effectItems"
        :model-value="effects"
        :aria-label="d.effectsLabel"
        @update:model-value="(value) => setEffects(value as EffectsMode)"
      />
    </div>
  </div>
</template>

<style scoped src="../settings-local.css"></style>
