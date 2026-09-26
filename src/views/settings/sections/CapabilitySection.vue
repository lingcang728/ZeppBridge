<script setup lang="ts">
import { onMounted } from 'vue';
import Icon from '../../../components/Icon.vue';
import { useCapabilityBoard } from '../../../composables/settings/useCapabilityBoard';
import { useMessages } from '../../../i18n';
import { settingsMessages } from '../../Settings.i18n';

const t = useMessages(settingsMessages);
const {
  capabilityOverview,
  capabilityError,
  probeBusy,
  capabilityAvailable,
  capabilityNotIngested,
  capabilityMissing,
  capabilityBoard,
  capabilityCheckedAt,
  probeDiagnostics,
  loadCapabilityOverview,
  runCapabilityProbe,
} = useCapabilityBoard();

onMounted(() => { void loadCapabilityOverview(); });
</script>

<template>
  <section class="settings-card" aria-labelledby="capability-title">
    <div class="section-heading-row">
      <h2 id="capability-title">{{ t.capabilityTitle }}</h2>
      <span v-if="capabilityCheckedAt" class="capability-checked">{{ capabilityCheckedAt }}</span>
    </div>
    <p class="section-description">{{ t.capabilityIntro }}</p>
    <div v-if="capabilityError" class="alert danger device-alert" role="alert">
      <Icon name="warning" :size="14" />{{ capabilityError }}
    </div>

    <!-- 三列竖排会让最长的那一列决定整块高度，右边两列下面全是空的。
         改成一格一条数据流的指示灯：亮 = 本机已有，暗 = 还没拿到。
         横向铺开，多少条流都能把宽度用满，也一眼看得出「亮了几个」。 -->
    <div v-if="capabilityOverview" class="capability-board">
      <p class="capability-legend">
        <span class="legend-item"><i class="lamp on"></i>{{ t.lampOn(capabilityAvailable.length) }}</span>
        <span v-if="capabilityNotIngested.length" class="legend-item"><i class="lamp pending"></i>{{ t.lampPending(capabilityNotIngested.length) }}</span>
        <span class="legend-item"><i class="lamp off"></i>{{ t.lampOff(capabilityMissing.length) }}</span>
      </p>

      <ul class="capability-grid">
        <li
          v-for="row in capabilityBoard"
          :key="row.key"
          :class="['capability-cell', row.state]"
        >
          <span class="cell-head">
            <i :class="['lamp', row.lamp]" aria-hidden="true"></i>
            <strong>{{ row.label }}</strong>
          </span>
          <span class="cell-detail">{{ row.detail }}</span>
          <span v-if="row.note" class="cell-note">{{ row.note }}</span>
        </li>
        <li v-if="!capabilityBoard.length" class="capability-cell off">
          <span class="cell-head"><i class="lamp off" aria-hidden="true"></i><strong>{{ t.capabilityEmptyTitle }}</strong></span>
          <span class="cell-detail">{{ t.capabilityEmptyBody }}</span>
        </li>
      </ul>
    </div>

    <details class="probe-diagnostics">
      <summary>{{ t.probeSummary }}</summary>
      <p class="probe-selfcheck">{{ t.probeNote }}</p>
      <button class="button secondary identify-button" type="button" :disabled="probeBusy" @click="runCapabilityProbe">
        <Icon name="sync" :size="14" :class="{ spinning: probeBusy }" />
        {{ probeBusy ? t.probing : t.probeRun }}
      </button>
      <ul>
        <li v-for="line in probeDiagnostics" :key="line">{{ line }}</li>
      </ul>
    </details>
  </section>
</template>

<style scoped src="../settings-base.css"></style>
<style scoped>
.capability-board { display: grid; gap: var(--space-3); }
.capability-legend { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 0; color: var(--muted); font-size: var(--fs-sm); }
.legend-item { display: inline-flex; align-items: center; gap: 6px; }
.lamp { width: 8px; height: 8px; flex: 0 0 8px; border-radius: 50%; background: var(--subtle); }
.lamp.on { background: #7da33e; box-shadow: 0 0 0 3px rgba(125,163,62,.16); }
.lamp.pending { background: #f5c33b; box-shadow: 0 0 0 3px rgba(245,195,59,.14); }
.lamp.off { background: rgba(232,238,244,.18); }

.capability-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(196px, 1fr));
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}
.capability-cell {
  display: grid;
  align-content: start;
  gap: 3px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
  min-width: 0;
}
.capability-cell.off { border-style: dashed; }
.cell-head { display: flex; align-items: center; gap: 7px; min-width: 0; }
.cell-head strong { min-width: 0; color: var(--ink); font-size: var(--fs-md); font-weight: 600; overflow-wrap: anywhere; }
.cell-detail { color: var(--muted); font-size: var(--fs-xs); }
.cell-note { color: var(--subtle); font-size: var(--fs-xs); line-height: 1.5; }
@media (max-width: 720px) { .capability-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); } }
.probe-diagnostics { margin-top: 16px; }
.probe-diagnostics > summary { color: var(--muted); font-size: var(--fs-sm); cursor: pointer; }
.probe-diagnostics ul { margin: 8px 0 0; padding-left: 18px; }
.probe-diagnostics li,
.probe-selfcheck { color: var(--muted); font-size: var(--fs-xs); line-height: 1.7; overflow-wrap: anywhere; }
</style>
