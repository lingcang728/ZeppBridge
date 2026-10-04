<script setup lang="ts">
import { computed, ref } from 'vue';
import PlanShape from '../../plan/PlanShape.vue';
import Icon from '../../Icon.vue';
import { workoutProfile } from '../../../lib/trainingPlan/profile';
import { sharedHrDomain } from '../../../lib/trainingPlan/summary';
import { useBridgeText } from './bridge.i18n';
import { usePressHold } from '../../../composables/usePressHold';
import { useTrainingPlan } from '../../../composables/useTrainingPlan';
import type { PlanDraftPreview } from '../../../types/trainingPlan';
import { addDays } from '../../../lib/aiTask/bridgeScale';
const props = defineProps<{ preview: PlanDraftPreview | null; readonly?: boolean; stamped?: boolean; selected: string | null }>();
const emit = defineEmits<{ select: [string]; move: [string,string]; delete: [string]; publish: []; received: [] }>();
const t = useBridgeText(), plan = useTrainingPlan();
const page = ref(0), dragging = ref<string | null>(null), over = ref<string | null>(null);
const profiles = computed(() => (props.preview?.days ?? []).flatMap(d => d.after.map(workoutProfile)));
const domain = computed(() => sharedHrDomain(profiles.value));
const scale = computed(() => Math.max(3600, ...profiles.value.map(p => p.seconds)));
const pages = computed(() => Math.max(1, Math.ceil((props.preview?.days.length ?? 7) / 7)));
const days = computed(() => props.preview?.days.slice(Math.min(page.value, pages.value - 1) * 7, (Math.min(page.value, pages.value - 1) + 1) * 7) ?? []);
const hold = usePressHold(() => { if (sendable.value) emit('publish'); });
const sendable = computed(() => !props.readonly && !!props.preview && !props.preview.check.issues.length && !plan.busy.value && plan.accepted.value && page.value === 0);
const bedtime = (minutes: number | null | undefined) => minutes == null ? '' : `${String(Math.floor(minutes / 60)).padStart(2,'0')}:${String(minutes % 60).padStart(2,'0')}`;
const drop = (date: string) => { if (dragging.value && !props.readonly) emit('move',dragging.value,date); dragging.value = null; over.value = null; };
const key = (event: KeyboardEvent, date: string) => {
  if (props.readonly || plan.busy.value) return;
  if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); emit('delete',date); }
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); emit('move',date,addDays(date,event.key === 'ArrowLeft' ? -1 : 1)); }
};
</script>
<template>
  <div class="bridge-future" :class="{ 'is-empty': !preview, stamped }">
    <template v-if="preview">
      <p class="plan-summary">{{ preview.check.summary }}</p>
      <div class="future-days">
        <button v-for="(day,i) in days" :key="day.date" type="button" :class="['future-day',{ picked: selected === day.date, dragging: dragging === day.date, over: over === day.date }]" :style="{ '--i': i }" :aria-label="`${day.date} · ${day.after[0]?.name ?? t.rest}`" :title="t.shape" :draggable="!readonly && !plan.busy.value && plan.accepted.value" @click="emit('select',day.date)" @keydown="key($event, day.date)" @dragstart="dragging = day.date; $event.dataTransfer?.setData('text/plain',day.date)" @dragend="dragging = null; over = null" @dragover.prevent="over = day.date" @dragleave="over = null" @drop.prevent="drop(day.date)">
          <span v-if="day.rest || !day.after.length" class="rest-moon"><Icon name="moon" :size="18"/><small>{{ bedtime(day.rest?.bedtime_minutes) }}</small></span>
          <span class="workout-shape"><PlanShape v-if="day.after[0]" :profile="workoutProfile(day.after[0])" :scale-seconds="scale" :domain="domain"/><i v-else class="rest-line"></i></span>
          <span class="day-name">{{ day.after[0]?.name ?? t.rest }}</span>
          <span v-if="day.after[0]" class="day-duration">{{ Math.round(workoutProfile(day.after[0]).seconds / 60) }} <small>min</small></span>
          <span v-if="stamped && i < 7 && page === 0" class="stamp"><Icon name="watch" :size="11"/></span>
          <span class="day-date">{{ day.date.slice(5).replace('-',' / ') }}</span>
        </button>
      </div>
      <footer class="future-footer">
        <span class="window-note"><i></i>{{ page === 0 ? t.watchWindow : t.laterWindow }}</span>
        <button v-if="!readonly" type="button" class="hold-button" :disabled="!sendable" :title="t.holdHint" :style="{ '--progress': hold.progress.value }" @pointerdown="hold.pointerdown" @pointerup="hold.cancel" @pointerleave="hold.cancel" @pointercancel="hold.cancel" @lostpointercapture="hold.cancel" @keydown="hold.keydown" @keyup="hold.keyup" @blur="hold.cancel"><svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="13"/><circle cx="16" cy="16" r="13" class="progress"/></svg><Icon name="watch" :size="13"/><span>{{ t.hold }}</span></button>
        <span v-if="pages > 1" class="week-nav"><button type="button" :disabled="page === 0" @click="page--">←</button><small>{{ page + 1 }} / {{ pages }}</small><button type="button" :disabled="page + 1 >= pages" @click="page++">→</button></span>
      </footer>
    </template>
    <div v-else class="future-empty"><div class="future-grid" aria-hidden="true"><i v-for="n in 7" :key="n"></i></div></div>
  </div>
</template>
<style scoped src="./BridgeFuture.css"></style>
