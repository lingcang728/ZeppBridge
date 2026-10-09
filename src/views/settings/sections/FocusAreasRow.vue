<script setup lang="ts">
/* 「我关注」：概览首次提问问过的那件事，在这里随时改。一条可拖的玻璃滑块，停在哪一格就是哪一格，没有确认按钮。 */
import SegmentTrack from '../../../components/SegmentTrack.vue';
import { focusChoiceItems, useFocusAreas } from '../../../composables/useFocusAreas';
import { useMessages } from '../../../i18n';
import { displayCardMessages } from './display.i18n';

const m = useMessages(displayCardMessages);
const { choice, setChoice } = useFocusAreas();
</script>

<template>
  <div class="s-row">
    <div class="s-row-main">
      <span class="s-row-title">{{ m.focusTitle }}</span>
      <span class="s-row-sub">{{ m.focusSlideSub }}</span>
    </div>
    <div class="s-row-control">
      <SegmentTrack :model-value="choice" :items="focusChoiceItems" :aria-label="m.focusTitle" compact @update:model-value="setChoice" />
    </div>
  </div>
</template>

<style scoped src="../settings-local.css"></style>
