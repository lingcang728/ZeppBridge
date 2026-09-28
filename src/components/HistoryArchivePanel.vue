<script setup lang="ts">
/**
 * 长期归档与完整历史补拉（设置卡叠「归档与存储」里的主体）。
 *
 * 三块，从上到下：归档开关 → 补拉以前的历史 → 覆盖账本。
 * 状态和动作在 composables/useHistoryBackfill.ts，账本视图在 archive/CoverageLedger.vue。
 */
import WheelDatePicker from './WheelDatePicker.vue';
import SegmentTrack from './SegmentTrack.vue';
import CoverageLedger from './archive/CoverageLedger.vue';
import { useHistoryBackfill } from '../composables/useHistoryBackfill';
import type { UserPrefs } from '../types';

defineOptions({ name: 'HistoryArchivePanel' });

const props = defineProps<{ prefs: UserPrefs | null }>();
const emit = defineEmits<{ (event: 'prefs-changed', prefs: UserPrefs): void }>();

const {
  t, streamLabel, ledger, busy, error, message, estimate, startChoice, customFrom, START_CHOICES,
  fromDate, requestedDays, wouldBeCleanedUp, remaining, formatBytes, measuredStreams, unmeasuredStreams,
  estimateText, stopReasonText, chunkErrorText, autoContinue, stopRequested, isSyncing,
  toggleArchive, stopBackfill, runBackfill, retryFailed, resetLedger,
} = useHistoryBackfill(() => props.prefs, (prefs) => emit('prefs-changed', prefs));
</script>

<template>
  <div class="archive-panel">
    <section class="s-section">
      <div class="s-section-head"><h3>{{ t.archiveTitle }}</h3></div>
      <div class="s-list">
        <div class="s-row">
          <div class="s-row-main">
            <span class="s-row-title">{{ t.archiveRowTitle }}</span>
            <span class="s-row-sub">{{ t.archiveBody }}</span>
          </div>
          <div class="s-row-control">
            <button
              class="mat-switch"
              type="button"
              role="switch"
              :aria-label="t.archiveAria"
              :aria-checked="Boolean(prefs?.archive_enabled)"
              :disabled="busy || !prefs"
              @click="toggleArchive"
            ></button>
          </div>
        </div>
      </div>
    </section>

    <section class="s-section">
      <div class="s-section-head"><h3>{{ t.backfillTitle }}</h3></div>
      <div class="s-list">
        <div class="s-row">
          <div class="s-row-main"><span class="s-row-title">{{ t.startLabel }}</span></div>
          <div class="s-row-control">
            <SegmentTrack v-model="startChoice" compact :items="START_CHOICES" :aria-label="t.startAria" :disabled="busy" />
          </div>
        </div>
        <div v-if="startChoice === 'custom'" class="s-row">
          <div class="s-row-main"><span class="s-row-title">{{ t.customDateLabel }}</span></div>
          <div class="s-row-control">
            <WheelDatePicker v-model="customFrom" :aria-label="t.customDateAria" />
          </div>
        </div>
        <div class="s-row">
          <div class="s-row-main">
            <span class="s-row-title">{{ t.autoContinueTitle }}</span>
            <span class="s-row-sub">{{ t.autoContinueHint }}</span>
          </div>
          <div class="s-row-control">
            <button
              class="mat-switch"
              type="button"
              role="switch"
              :aria-label="t.autoContinue"
              :aria-checked="autoContinue"
              :disabled="busy"
              @click="autoContinue = !autoContinue"
            ></button>
          </div>
        </div>
        <details v-if="estimate" class="s-row is-block estimate">
          <summary>
            <span class="s-row-main">
              <span class="s-row-title">{{ t.estimateTitle }}</span>
              <span class="s-row-sub">{{ estimateText }}</span>
            </span>
            <span class="estimate-toggle">{{ t.estimateDetails }}</span>
          </summary>
          <table v-if="measuredStreams.length" class="estimate-table">
            <tbody>
              <tr v-for="item in measuredStreams" :key="item.stream">
                <th scope="row">{{ streamLabel(item.stream) }}</th>
                <td>{{ t.estimateRate(item.observed_days, formatBytes(item.bytes_per_day)) }}</td>
                <td class="num">+{{ formatBytes(item.estimated_add_bytes) }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="unmeasuredStreams.length" class="s-note">
            {{ t.unmeasured(unmeasuredStreams.map((item) => streamLabel(item.stream)).join(t.streamSeparator)) }}
          </p>
        </details>
        <div class="s-row actions-row">
          <div class="s-actions">
            <button
              class="button primary"
              type="button"
              :disabled="busy || isSyncing || !fromDate || wouldBeCleanedUp || Boolean(estimate?.stop_reason)"
              @click="runBackfill"
            >{{ busy ? t.backfilling : (remaining > 0 ? t.continueBackfill : t.startBackfill) }}</button>
            <button
              v-if="busy"
              class="button secondary"
              type="button"
              :disabled="stopRequested"
              @click="stopBackfill"
            >{{ stopRequested ? t.stopping : t.stopBackfill }}</button>
            <button
              v-if="ledger?.failed_chunks_detail?.length"
              class="button secondary"
              type="button"
              :disabled="busy || isSyncing"
              @click="retryFailed"
            >{{ t.retryFailed }}</button>
            <button v-if="ledger?.total_chunks" class="button secondary" type="button" :disabled="busy" @click="resetLedger">
              {{ t.resetLedger }}
            </button>
          </div>
        </div>
      </div>
      <p v-if="estimate?.stop_reason" class="api-error" role="alert">{{ stopReasonText }}</p>
      <p v-if="wouldBeCleanedUp" class="api-error" role="alert">
        {{ t.wouldBeCleanedUp(requestedDays, prefs?.retention_days ?? 0) }}
      </p>
      <p v-if="error" class="api-error" role="alert">{{ error }}</p>
      <p v-else-if="message" class="hint-line ok" role="status">{{ message }}</p>
    </section>

    <CoverageLedger
      v-if="ledger && ledger.total_chunks > 0"
      :ledger="ledger"
      :remaining="remaining"
      :stream-label="streamLabel"
      :chunk-error-text="chunkErrorText"
      :t="t"
    />
  </div>
</template>

<style scoped src="../views/settings/settings-local.css"></style>
<style scoped>
.archive-panel { display: grid; gap: 22px; min-width: 0; }
.archive-panel > .s-section + .s-section { margin-top: 0; }
.estimate > summary {
  display: flex;
  align-items: center;
  gap: 14px;
  cursor: pointer;
  list-style: none;
}
.estimate > summary::-webkit-details-marker { display: none; }
.estimate-toggle { flex: 0 0 auto; color: var(--accent); font-size: var(--fs-sm); }
.estimate[open] .estimate-toggle { color: var(--muted); }
.estimate-table { width: 100%; margin-top: 10px; border-collapse: collapse; font-size: var(--fs-sm); }
.estimate-table th, .estimate-table td { padding: 6px 0; border-top: 1px solid var(--mat-line); text-align: left; font-weight: 400; }
.estimate-table th { width: 30%; color: var(--ink); }
.estimate-table td { color: var(--subtle); }
.estimate-table td.num { color: var(--muted); font-family: var(--font-mono); font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; }
.estimate .s-note { margin-top: 8px; padding: 0; }
.actions-row { min-height: 0; padding-block: 12px; }
</style>
