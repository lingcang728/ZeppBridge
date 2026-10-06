<script setup lang="ts">
/** 清空的确认（发空窗口前必须问一遍）。总页和周视图都能触发，共用这一个。 */
import ModalDialog from '../ModalDialog.vue';
import { useTrainingPlan } from '../../composables/useTrainingPlan';
import { usePlanText } from './usePlanText';

const plan = useTrainingPlan();
const { t } = usePlanText();
</script>

<template>
  <ModalDialog v-if="plan.clearPending.value" labelledby="plan-clear-title" @close="plan.cancelClear()">
    <div class="clear-dialog">
      <h2 id="plan-clear-title">{{ t.clearTitle }}</h2>
      <p>{{ t.clearBody }}</p>
      <footer>
        <button class="pill-button quiet" @click="plan.cancelClear()">{{ t.cancel }}</button>
        <button class="pill-button danger" :disabled="plan.busy.value" @click="plan.confirmClear()">{{ t.clearConfirm }}</button>
      </footer>
    </div>
  </ModalDialog>
</template>

<style scoped>
.clear-dialog { display: grid; gap: 14px; }
.clear-dialog h2 { margin: 0; font-size: var(--fs-xl); }
.clear-dialog p { margin: 0; color: var(--muted); }
.clear-dialog footer { display: flex; justify-content: flex-end; gap: 8px; }
.pill-button.danger { color: var(--danger); }
</style>
