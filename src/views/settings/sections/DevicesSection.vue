<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import DesignIcon from '../../../components/DesignIcon.vue';
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

const t = useMessages(settingsMessages);
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
   字段（只有 deviceSource / deviceType 这类数字）。指认动作本身住在设备二级页
   （/devices/:deviceKey）；这里只显示它留下的结果，状态共享自 useDeviceAssignment，
   两处不会各说各话。 */
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

const dataSources = computed(() => [
  {
    kind: 'cloud' as const,
    name: 'Zepp Cloud',
    sub: t.value.cloudService,
    icon: 'cloud' as const,
    state: accountRecognized.value ? ('account' as const) : ('unknown' as const),
  },
  ...deviceModels.value.map((model) => ({
    kind: 'device' as const,
    name: model.canonicalName,
    sub: model.displayName,
    model,
    state: model.state,
  })),
]);

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
  <section class="settings-card" aria-labelledby="devices-title">
    <div class="section-heading-row">
      <h2 id="devices-title">{{ t.devicesTitle }}</h2>
      <button class="button secondary identify-button" type="button" :disabled="deviceRefreshBusy" @click="refreshDevices">
        <Icon name="sync" :size="14" :class="{ spinning: deviceRefreshBusy }" />
        {{ deviceRefreshBusy ? t.identifying : t.identifyDevices }}
      </button>
    </div>
    <div v-if="deviceRefreshError" class="alert danger device-alert" role="alert"><Icon name="warning" :size="14" />{{ deviceRefreshError }}</div>
    <div v-if="deviceRefreshMessage" class="alert success device-alert" role="status"><Icon name="circle-check" :size="14" />{{ deviceRefreshMessage }}</div>
    <div v-if="deviceError && !deviceRefreshError" class="alert warning device-alert" role="status"><Icon name="info" :size="14" />{{ t.deviceErrorPrefix }}{{ deviceError }}</div>

    <div v-if="devicesLoading" class="source-list source-list-loading">
      <div class="source-row skeleton-row"></div>
      <div class="source-row skeleton-row"></div>
    </div>
    <div v-else class="source-list">
      <div v-if="!deviceModels.length" class="device-empty">
        <Icon name="watch" :size="16" />{{ t.noDevices }}
      </div>
      <template v-for="source in dataSources" :key="source.kind === 'device' ? `device:${source.model.deviceKey || source.name}` : 'cloud'">
      <div class="source-row">
        <span v-if="source.kind === 'cloud' || (source.kind === 'device' && source.model.image)" class="source-icon">
          <DeviceVisual v-if="source.kind === 'device'" :src="source.model.image" :alt="source.name" :kind="source.model.kind" compact />
          <DesignIcon v-else name="zepp-cloud" :size="32" />
        </span>
        <div class="source-copy">
          <strong>{{ source.name }}</strong>
          <span>{{ source.sub }}</span>
          <div v-if="source.kind === 'device'" class="source-metadata">
            <span>{{ t.deviceFirmware(source.model.firmware) }}</span>
            <span>{{ t.deviceLatestData }} <time>{{ source.model.lastData }}</time></span>
          </div>
          <span v-if="source.kind === 'device'">{{ t.deviceIdLine(maskIdentifier(source.model.profile.device_id || source.model.profile.serial)) }}</span>
        </div>
        <span :class="['source-state', { on: source.state !== 'unknown' }]"><i class="dot"></i>{{ deviceStateLabel(source.state) }}</span>
        <!-- 入口对每台设备都在。识别对了不代表用户同意，识别错了更不能没有退路。 -->
        <RouterLink
          v-if="source.kind === 'device' && deviceKeyFor(source.model)"
          class="button secondary assign-trigger"
          :to="`/devices/${encodeURIComponent(deviceKeyFor(source.model))}`"
        >
          <Icon name="watch" :size="14" />{{ t.viewOrChange }}
        </RouterLink>
      </div>
      </template>
    </div>
    <div v-if="unknownDeviceDetected && !devicesLoading" class="diagnostic-panel unknown-device-report" role="status">
      <strong>{{ t.unknownDeviceTitle }}</strong>
      <p>
        {{ t.unknownDeviceBodyA }}<strong>{{ t.unknownDeviceNoName }}</strong>{{ t.unknownDeviceBodyB }}
      </p>
      <p>{{ t.unknownDeviceReport }}</p>
      <p v-if="deviceAssignError" class="api-error" role="alert">{{ deviceAssignError }}</p>
      <p v-else-if="deviceAssignMessage" class="hint-line ok">{{ deviceAssignMessage }}</p>
      <DiagnosticReportForm :form="deviceDiagnostic" />
    </div>
  </section>
</template>

<style scoped src="../settings-base.css"></style>
<style scoped>
.assign-trigger { justify-self: end; }
.device-empty { display: flex; align-items: center; gap: 7px; min-height: 60px; padding: 10px; border: 1px dashed var(--line-strong); border-radius: var(--radius-sm); color: var(--muted); font-size: var(--fs-sm); }

/* 数据来源 */
/* align-items:start —— 每张来源卡按自己的内容高，不被同一行最高的那张撑开
   （Zepp Cloud 只有两行，被设备卡拉高后中间空出一大块）。 */
.source-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr)); gap: 8px; align-items: start; }
.source-row {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  align-items: start;
  gap: 10px;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
}
.source-icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  overflow: hidden;
  flex: 0 0 36px;
  border-radius: 9px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--muted);
}
.source-icon :deep(.device-visual) { width: 36px; max-width: 100%; height: 36px; max-height: 100%; min-width: 0; min-height: 0; flex: 0 0 36px; border: 0; border-radius: 9px; background: transparent; }
.source-icon :deep(.device-visual img) { padding: 3px; }
.source-copy { grid-column: 2; flex: 1; min-width: 0; display: grid; gap: 1px; }
.source-copy strong { font-size: var(--fs-md); color: var(--ink); white-space: normal; overflow-wrap: anywhere; }
.source-row > .source-state, .source-row > .button { grid-column: 2; justify-self: start; }
.source-metadata { display: flex; flex-wrap: wrap; gap: 3px 12px; }
.source-metadata > span { display: inline-flex; flex-wrap: wrap; gap: 0 5px; }
.source-metadata time { white-space: nowrap; font-family: 'Inter', var(--font-sans); font-variant-numeric: tabular-nums; }
.source-copy span { color: var(--subtle); font-size: var(--fs-xs); }
.source-copy span + span { font-family: var(--font-mono); font-size: var(--fs-2xs); }
.source-state { display: inline-flex; align-items: center; gap: 5px; color: var(--subtle); font-size: var(--fs-sm); }
.source-state .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--subtle); }
.source-state.on { color: var(--accent); }
.source-state.on .dot { background: var(--accent); }
.source-list-loading { opacity: .65; }
.skeleton-row { min-height: 58px; background: linear-gradient(90deg, var(--surface-raised), var(--surface-hover), var(--surface-raised)); background-size: 200% 100%; animation: device-shimmer 1.4s ease-in-out infinite; }
@keyframes device-shimmer { from { background-position: 0 0; } to { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) { .skeleton-row { animation: none; } }
</style>
