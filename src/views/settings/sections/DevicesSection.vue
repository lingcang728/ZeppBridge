<script setup lang="ts">
/* 设备：一台设备一行——设备图｜名称和昵称｜一行小标签（固件、最近数据、打码 ID）｜
   状态｜箭头。整行点进设备二级页（看详情、换型号）。
   以前是一格一格的小卡，每张卡里字段、状态、按钮各占一行，排得很乱。 */
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import DeviceVisual from '../../../components/DeviceVisual.vue';
import Icon from '../../../components/Icon.vue';
import DiagnosticReportForm from '../DiagnosticReportForm.vue';
import { useSettingsContext } from '../../../composables/settings/context';
import { createDiagnosticForm } from '../../../composables/settings/useDiagnosticReport';
import { deviceStateLabel, useDeviceAssignment, useDevices } from '../../../composables/useDevices';
import { useMessages } from '../../../i18n';
import { errorTextFor } from '../../../i18n/errors';
import { backendText } from '../../../i18n/backendText';
import { settingsMessages } from '../../Settings.i18n';
import { deckMessages } from '../deck.i18n';

const t = useMessages(settingsMessages);
const d = useMessages(deckMessages);
const { accountRecognized } = useSettingsContext().auth;
const {
  models: deviceModels,
  cache: deviceCache,
  loading: devicesLoading,
  error: deviceError,
  load: loadDevices,
  maskIdentifier,
} = useDevices();

/* 设备型号指认：本机推不出来，就问用户——有些账号的设备响应里根本没有任何产品名
   字段。指认动作本身住在设备二级页；这里只显示它留下的结果，状态共享自
   useDeviceAssignment，两处不会各说各话。 */
const { assignError: deviceAssignError, assignMessage: deviceAssignMessage } = useDeviceAssignment();
const deviceDiagnostic = createDiagnosticForm();

const deviceRefreshBusy = ref(false);
const deviceRefreshMessage = ref<string | null>(null);
const deviceRefreshError = ref<string | null>(null);

const unknownDeviceDetected = computed(() => accountRecognized.value && (
  deviceModels.value.length === 0
  || deviceModels.value.some((model) => model.profile.match_status === 'unknown')
));

const deviceKeyFor = (model: { profile: { device_id?: string | null; serial?: string | null } }): string =>
  (model.profile.device_id || model.profile.serial || '').trim();

const refreshDevices = async () => {
  deviceRefreshBusy.value = true;
  deviceRefreshMessage.value = null;
  deviceRefreshError.value = null;
  try {
    await loadDevices(true);
    const refreshError = deviceError.value
      || errorTextFor(deviceCache.value?.refresh_error_code)
      || backendText(deviceCache.value?.refresh_error, '');
    if (refreshError || deviceCache.value?.status === 'refresh_failed') {
      deviceRefreshError.value = t.value.refreshFailed(
        refreshError ? t.value.refreshFailedReason(refreshError) : t.value.refreshFailedPeriod,
      );
    } else if (deviceCache.value?.refreshed) {
      deviceRefreshMessage.value = t.value.refreshDone(deviceModels.value.length);
    } else {
      deviceRefreshMessage.value = t.value.refreshNoNewList;
    }
  } finally {
    deviceRefreshBusy.value = false;
  }
};

onMounted(() => { void loadDevices(); });
</script>

<template>
  <section class="s-section" aria-labelledby="devices-title">
    <div class="s-section-head">
      <h3 id="devices-title">{{ d.secDevices }}</h3>
      <button class="button secondary compact-btn" type="button" :disabled="deviceRefreshBusy" @click="refreshDevices">
        <Icon name="sync" :size="14" :class="{ spinning: deviceRefreshBusy }" />
        {{ deviceRefreshBusy ? t.identifying : t.identifyDevices }}
      </button>
    </div>
    <div v-if="deviceRefreshError" class="alert danger" role="alert"><Icon name="warning" :size="14" />{{ deviceRefreshError }}</div>
    <div v-if="deviceRefreshMessage" class="alert success" role="status"><Icon name="circle-check" :size="14" />{{ deviceRefreshMessage }}</div>
    <div v-if="deviceError && !deviceRefreshError" class="alert warning" role="status"><Icon name="info" :size="14" />{{ t.deviceErrorPrefix }}{{ deviceError }}</div>

    <div class="s-list">
      <template v-if="devicesLoading">
        <div class="s-row skeleton-row"></div>
        <div class="s-row skeleton-row"></div>
      </template>
      <div v-else-if="!deviceModels.length" class="s-row">
        <Icon name="watch" :size="18" class="empty-icon" />
        <div class="s-row-main"><span class="s-row-sub">{{ t.noDevices }}</span></div>
      </div>
      <template v-else>
        <component
          :is="deviceKeyFor(model) ? RouterLink : 'div'"
          v-for="model in deviceModels"
          :key="model.deviceKey || model.canonicalName"
          class="s-row device-row"
          :to="deviceKeyFor(model) ? `/devices/${encodeURIComponent(deviceKeyFor(model))}` : undefined"
          :aria-label="deviceKeyFor(model) ? `${model.canonicalName} · ${d.deviceOpen}` : undefined"
        >
          <span class="device-art">
            <DeviceVisual v-if="model.image" :src="model.image" :alt="model.canonicalName" :kind="model.kind" compact />
            <Icon v-else name="watch" :size="22" />
          </span>
          <div class="s-row-main">
            <span class="s-row-title">{{ model.canonicalName }}</span>
            <span class="s-row-sub">{{ model.displayName }}</span>
            <span class="device-chips">
              <span class="chip">{{ d.deviceFirmware(model.firmware) }}</span>
              <span class="chip">{{ d.deviceLatest(model.lastData) }}</span>
              <span class="chip mono">{{ d.deviceId(maskIdentifier(model.profile.device_id || model.profile.serial)) }}</span>
            </span>
          </div>
          <div class="s-row-control">
            <span :class="['state-dot', { on: model.state !== 'unknown' }]">{{ deviceStateLabel(model.state) }}</span>
            <Icon v-if="deviceKeyFor(model)" name="chevron-right" :size="18" class="row-chevron" />
          </div>
        </component>
      </template>
    </div>

    <div v-if="unknownDeviceDetected && !devicesLoading" class="s-list">
      <div class="diagnostic-panel unknown-device-report" role="status">
        <strong>{{ t.unknownDeviceTitle }}</strong>
        <p>{{ t.unknownDeviceBodyA }}<strong>{{ t.unknownDeviceNoName }}</strong>{{ t.unknownDeviceBodyB }}</p>
        <p>{{ t.unknownDeviceReport }}</p>
        <p v-if="deviceAssignError" class="api-error" role="alert">{{ deviceAssignError }}</p>
        <p v-else-if="deviceAssignMessage" class="hint-line ok">{{ deviceAssignMessage }}</p>
        <DiagnosticReportForm :form="deviceDiagnostic" />
      </div>
    </div>
  </section>
</template>

<style scoped src="../settings-base.css"></style>
<style scoped>
.compact-btn { min-height: 30px; padding: 4px 12px; font-size: var(--fs-xs); }
.device-row { color: inherit; text-decoration: none; transition: background var(--dur-fast) ease; }
a.device-row:hover { background: color-mix(in srgb, var(--ink) 4%, transparent); }
a.device-row:hover .row-chevron { color: var(--ink); transform: translateX(2px); }
.device-art {
  display: grid;
  width: 52px;
  height: 52px;
  flex: 0 0 52px;
  place-items: center;
  overflow: hidden;
  border-radius: 14px;
  background: var(--mat-inset);
  box-shadow: var(--mat-inset-shadow);
  color: var(--muted);
}
.device-art :deep(.device-visual) { width: 52px; height: 52px; min-width: 0; min-height: 0; flex: 0 0 52px; border: 0; border-radius: 14px; background: transparent; }
.device-art :deep(.device-visual img) { padding: 5px; }
.device-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.device-chips .chip { font-variant-numeric: tabular-nums; }
.mono { font-family: var(--font-mono); letter-spacing: .02em; }
.row-chevron { color: var(--subtle); transition: transform var(--dur-fast) ease, color var(--dur-fast) ease; }
.empty-icon { color: var(--subtle); }
.skeleton-row { min-height: 72px; background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--ink) 5%, transparent), transparent); background-size: 200% 100%; animation: device-shimmer 1.4s ease-in-out infinite; }
@keyframes device-shimmer { from { background-position: 0 0; } to { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) { .skeleton-row { animation: none; } }
</style>
