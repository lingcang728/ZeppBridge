<script setup lang="ts">
/**
 * 补拉的「明细」：起点、自动续传、估算、失败重试，以及覆盖账本（清空账本在高级·维护）。
 * 开始 / 继续 / 停止留在「归档与存储」卡的那一行上（ArchiveSection.vue），状态由它传进来。
 */
import GlassSwitch from './GlassSwitch.vue';
import WheelDatePicker from './WheelDatePicker.vue';
import SegmentTrack from './SegmentTrack.vue';
import FoldTransition from './FoldTransition.vue';
import CoverageLedger from './archive/CoverageLedger.vue';
import type { useHistoryBackfill } from '../composables/useHistoryBackfill';
import type { UserPrefs } from '../types';

defineOptions({ name: 'HistoryArchivePanel' });

const props = defineProps<{ state: ReturnType<typeof useHistoryBackfill>; prefs: UserPrefs | null }>();

const {
  t, streamLabel, ledger, busy, error, message, estimate, startChoice, customFrom, START_CHOICES,
  requestedDays, wouldBeCleanedUp, remaining, formatBytes, measuredStreams, unmeasuredStreams,
  estimateText, stopReasonText, chunkErrorText, autoContinue, isSyncing,
  retryFailed,
} = props.state;
</script>

<!-- 多根组件：这几行直接排进归档卡的列表里，用细线和上一行分开，不再自己包一块板（卡里套卡）。 -->
<template>
      <div class="s-row">
        <div class="s-row-main"><span class="s-row-title">{{ t.startLabel }}</span></div>
        <div class="s-row-control">
          <SegmentTrack v-model="startChoice" compact :items="START_CHOICES" :aria-label="t.startAria" :disabled="busy" />
        </div>
      </div>
      <FoldTransition>
      <div v-if="startChoice === 'custom'" class="s-row">
        <div class="s-row-main"><span class="s-row-title">{{ t.customDateLabel }}</span></div>
        <div class="s-row-control">
          <WheelDatePicker v-model="customFrom" :aria-label="t.customDateAria" />
        </div>
      </div>
      </FoldTransition>
      <div class="s-row">
        <div class="s-row-main">
          <span class="s-row-title">{{ t.autoContinueTitle }}</span>
          <span class="s-row-sub">{{ t.autoContinueHint }}</span>
        </div>
        <div class="s-row-control">
          <GlassSwitch
            :aria-label="t.autoContinue"
            :model-value="autoContinue"
            :disabled="busy"
            @update:model-value="autoContinue = !autoContinue"
          />
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
      <div v-if="ledger?.failed_chunks_detail?.length" class="s-row actions-row">
        <div class="s-actions">
          <button class="button secondary" type="button" :disabled="busy || isSyncing" @click="retryFailed">{{ t.retryFailed }}</button>
        </div>
      </div>
      <div v-if="estimate?.stop_reason || wouldBeCleanedUp || error || message" class="s-row is-block notes-row">
        <p v-if="estimate?.stop_reason" class="api-error" role="alert">{{ stopReasonText }}</p>
        <p v-if="wouldBeCleanedUp" class="api-error" role="alert">{{ t.wouldBeCleanedUp(requestedDays, prefs?.retention_days ?? 0) }}</p>
        <p v-if="error" class="api-error" role="alert">{{ error }}</p>
        <p v-else-if="message" class="hint-line ok" role="status">{{ message }}</p>
      </div>
      <div v-if="ledger && ledger.total_chunks > 0" class="s-row is-block">
        <CoverageLedger
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
.notes-row { gap: 6px; }
.notes-row p { margin: 0; }
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
