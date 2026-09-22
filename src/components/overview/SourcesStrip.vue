<script setup lang="ts">
/* 「数据来源」条——v2 左侧栏里的设备/账户卡搬家到这里。
 *
 * 侧栏撤掉之后这块信息不能消失：它是「我现在靠哪些设备出数」的唯一常驻
 * 回答。收进概览的一条横带，每台设备一个 chip，最后一枚是 Zepp Cloud
 * 账户状态；点进去落到对应设备页或设置。 */
import { computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import DesignIcon from '../DesignIcon.vue';
import DeviceVisual from '../DeviceVisual.vue';
import Icon from '../Icon.vue';
import { deviceStateLabel, useDevices } from '../../composables/useDevices';
import { useSyncController } from '../../composables/useSyncController';
import { defineMessages, useMessages } from '../../i18n';

defineOptions({ name: 'OverviewSourcesStrip' });

const messages = defineMessages(
  {
    dataSources: '数据来源',
    identifyingDevices: '正在识别实体设备…',
    identifyFailed: (reason: string) => `设备识别暂不可用：${reason}`,
    noDevicesYet: '尚未识别实体设备。',
    manage: '管理',
    sourcesAria: '数据来源与账户状态',
  },
  {
    dataSources: 'Data sources',
    identifyingDevices: 'Identifying your devices…',
    identifyFailed: (reason: string) => `Device identification is unavailable: ${reason}`,
    noDevicesYet: 'No device identified yet.',
    manage: 'Manage',
    sourcesAria: 'Data sources and account state',
  },
  {
    dataSources: 'Fuentes de datos',
    identifyingDevices: 'Identificando tus dispositivos…',
    identifyFailed: (reason: string) => `La identificación de dispositivos no está disponible: ${reason}`,
    noDevicesYet: 'Aún no se ha identificado ningún dispositivo.',
    manage: 'Gestionar',
    sourcesAria: 'Fuentes de datos y estado de la cuenta',
  },
);
const t = useMessages(messages);

const { models: deviceModels, loading: devicesLoading, error: devicesError, load: loadDevices } = useDevices();
const { appStatus } = useSyncController();

const accountRecognized = computed(() =>
  ['connected', 'configured'].includes(String(appStatus.value?.connection_state || '')));

/* useDevices 是模块级单例，这里再 load 一次只会命中它内部的
   请求去重（profileRequests），不会重复打后端。 */
onMounted(() => { void loadDevices(); });

const chips = computed(() => [
  ...deviceModels.value.map((model) => ({
    key: `device-${model.deviceKey || model.canonicalName}`,
    kind: 'device' as const,
    name: model.displayName || model.canonicalName,
    model,
    state: model.state,
    to: model.deviceKey ? `/devices/${encodeURIComponent(model.deviceKey)}` : '/settings',
  })),
  {
    key: 'cloud',
    kind: 'cloud' as const,
    name: 'Zepp Cloud',
    state: accountRecognized.value ? ('account' as const) : ('unknown' as const),
    to: '/settings',
  },
]);
</script>

<template>
  <section class="sources-strip" :aria-label="t.sourcesAria">
    <span class="sources-label">{{ t.dataSources }}</span>
    <div class="sources-row">
      <span v-if="devicesLoading" class="sources-feedback" role="status">{{ t.identifyingDevices }}</span>
      <span v-else-if="devicesError" class="sources-feedback error" role="alert">{{ t.identifyFailed(devicesError) }}</span>
      <span v-else-if="!deviceModels.length" class="sources-feedback" role="status">{{ t.noDevicesYet }}</span>
      <RouterLink v-for="chip in chips" :key="chip.key" class="source-chip" :to="chip.to">
        <span class="chip-icon">
          <DeviceVisual v-if="chip.kind === 'device'" :src="chip.model.image" :alt="chip.name" :kind="chip.model.kind" compact />
          <DesignIcon v-else name="zepp-cloud" :size="22" />
        </span>
        <span class="chip-name">{{ chip.name }}</span>
        <i :class="['dot', { on: chip.state !== 'unknown' }]"></i>
        <span class="chip-state">{{ deviceStateLabel(chip.state) }}</span>
      </RouterLink>
      <RouterLink class="source-chip manage" to="/settings">
        <Icon name="sliders" :size="14" />
        <span>{{ t.manage }}</span>
      </RouterLink>
    </div>
  </section>
</template>

<style scoped>
.sources-strip {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 14px;
  padding: 10px 16px;
  border: 1px solid var(--panel-line);
  border-radius: var(--radius-md);
  background: var(--panel);
  box-shadow: var(--panel-glint);
}
.sources-label { flex: 0 0 auto; color: var(--subtle); font-size: var(--fs-xs); }
.sources-row {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
}
.sources-row::-webkit-scrollbar { display: none; }
.sources-feedback {
  flex: 0 0 auto;
  padding: 5px 10px;
  border: 1px dashed var(--line-strong);
  border-radius: 9px;
  color: var(--muted);
  font-size: var(--fs-xs);
}
.sources-feedback.error { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 30%, transparent); }
.source-chip {
  display: inline-flex;
  flex: 0 0 auto;
  min-width: 0;
  align-items: center;
  gap: 7px;
  padding: 5px 10px 5px 6px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  color: inherit;
  font-size: var(--fs-xs);
  text-decoration: none;
  white-space: nowrap;
  transition: border-color 150ms ease, background-color 150ms ease;
}
.source-chip:hover { border-color: var(--line-control); background: var(--surface-raised); }
.chip-icon {
  display: grid;
  width: 26px;
  height: 26px;
  flex: 0 0 26px;
  place-items: center;
  overflow: hidden;
  border-radius: 50%;
  background: var(--surface-raised);
  color: var(--muted);
}
.chip-icon :deep(.device-visual) {
  width: 26px;
  height: 26px;
  min-width: 0;
  min-height: 0;
  flex: 0 0 26px;
  border: 0;
  border-radius: 50%;
  background: transparent;
}
.chip-icon :deep(.device-visual img) { padding: 2px; }
.chip-name { max-width: 130px; overflow: hidden; color: var(--ink); font-weight: 600; text-overflow: ellipsis; }
.dot { width: 6px; height: 6px; flex: 0 0 6px; border-radius: 50%; background: var(--subtle); }
.dot.on { background: var(--accent); }
.chip-state { color: var(--subtle); }
.source-chip.manage { padding: 5px 12px; color: var(--muted); gap: 6px; }
.source-chip.manage:hover { color: var(--accent); border-color: var(--accent); }
@media (max-width: 760px) {
  .sources-strip { align-items: flex-start; flex-direction: column; gap: 8px; padding: 12px 14px; }
  .sources-row { width: 100%; }
}
</style>
