<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { backend, toUserMessage } from '../lib/bridge';
import type { WorkoutDetailChannel, WorkoutDetailCoverage } from '../lib/bridge/types';
import { useSyncController } from '../composables/useSyncController';
import { useMessages } from '../i18n';
import { workoutToolsMessages } from './WorkoutTools.i18n';
import { runDetailBackfill } from '../lib/workoutDetailBackfill';
const t = useMessages(workoutToolsMessages);
const { isSyncing, appStatus, markDataChanged } = useSyncController();
const channel = ref<WorkoutDetailChannel>(appStatus.value?.data_source === 'official' ? 'official' : 'advanced');
const coverage = ref<WorkoutDetailCoverage | null>(null);
const busy = ref(false);
const stopping = ref(false);
const error = ref('');
const stopped = ref(false);
let disposed = false;
let inFlight = false;
let cancelling: Promise<void> | null = null;
let coverageEpoch = 0;
const progress = computed(() => {
  const c = coverage.value;
  return c ? t.value.detailProgress(c.pending, c.persisted, c.empty_from_cloud, c.request_failed, c.parse_failed, c.unavailable) : '';
});
watch(channel, () => {
  const epoch = ++coverageEpoch;
  coverage.value = null; error.value = ''; stopped.value = false;
  void backend.getWorkoutDetailCoverage(channel.value).then((c) => {
    if (!disposed && !busy.value && epoch === coverageEpoch) coverage.value = c;
  }).catch((cause) => {
    if (!disposed && !busy.value && epoch === coverageEpoch) error.value = toUserMessage(cause, t.value.detailFailed);
  });
}, { immediate: true });
onBeforeUnmount(() => { disposed = true; if (busy.value) void stop(); });
const start = async (retry = false) => {
  if (busy.value || cancelling || isSyncing.value || disposed) return;
  busy.value = true; stopping.value = false; stopped.value = false; error.value = '';
  const taskChannel = channel.value;
  try {
    const result = await runDetailBackfill({
      retry,
      fetchBatch: async (retryFailed) => {
        inFlight = true;
        try { return await backend.startWorkoutDetailBackfill(20, retryFailed, taskChannel); }
        finally { inFlight = false; }
      },
      shouldStop: () => stopping.value || disposed,
      onProgress: (next) => { coverage.value = next; markDataChanged(); },
      betweenBatches: () => new Promise((resolve) => window.setTimeout(resolve, 250)),
    });
    stopped.value = result !== 'complete';
  } catch (cause) { if (!stopping.value) error.value = toUserMessage(cause, t.value.detailFailed); }
  finally {
    if (cancelling) await cancelling;
    busy.value = false;
  }
};
const stop = async () => {
  stopping.value = true; stopped.value = true;
  if (!inFlight || cancelling) return;
  cancelling = backend.cancelSync().catch((cause) => { error.value = toUserMessage(cause, t.value.detailFailed); });
  try { await cancelling; } finally { cancelling = null; }
};
</script>
<template>
  <div class="s-row is-block detail-backfill" :aria-busy="busy">
    <div class="s-row-main"><span class="s-row-title">{{ t.detailsTitle }}</span><span class="s-row-sub">{{ t.detailsHint }}</span></div>
    <label class="detail-channel"><span>{{ t.detailChannel }}</span>
      <select v-model="channel" :disabled="busy">
        <option value="advanced">{{ t.advancedChannel }}</option>
        <option value="official">{{ t.officialChannel }}</option>
      </select>
    </label>
    <p v-if="progress" role="status" aria-live="polite">{{ progress }}</p>
    <div class="s-actions">
      <button class="button secondary" type="button" :disabled="busy || isSyncing" @click="start()">{{ t.start }}</button>
      <button v-if="busy" class="button secondary" type="button" :disabled="stopping" @click="stop">{{ t.pause }}</button>
      <button v-else-if="coverage && (coverage.request_failed || coverage.parse_failed)" class="button secondary" type="button" :disabled="isSyncing" @click="start(true)">{{ t.retry }}</button>
    </div>
    <p v-if="stopped && !busy" role="status">{{ t.stopped }}</p>
    <p v-if="error" class="api-error" role="alert">{{ error }}</p>
  </div>
</template>
<style scoped>
.detail-backfill { display: grid; gap: 10px; }
.detail-backfill p { margin: 0; color: var(--muted); font-size: var(--fs-sm); overflow-wrap: anywhere; }
.s-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.detail-channel { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; color: var(--muted); font-size: var(--fs-sm); }
.detail-channel select { max-width: 100%; min-width: 0; padding: 6px 10px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--mat-card-solid); color: var(--ink); font: inherit; }
.detail-channel select:focus-visible { outline: 2px solid var(--focus); outline-offset: 3px; }
.s-actions .button { max-width: 100%; overflow-wrap: anywhere; }
.button:focus-visible { outline: 2px solid var(--focus); outline-offset: 3px; }
</style>
