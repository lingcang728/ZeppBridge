<script setup lang="ts">
/**
 * 开机自启 + 「开机后只留在托盘」（commands/autostart.rs）。两个都默认关。
 * 第二个只对开机自启生效：手动双击照常开窗，所以开机自启关着时它也收起来。
 * 程序挪过位置（便携版换了目录、AppImage 挪了）时系统里那条登记失效：开关显示为关，再打开一次就按现在的路径重登。
 */
import { computed, onMounted, ref } from 'vue';
import GlassSwitch from '../../../components/GlassSwitch.vue';
import { backend, isDesktop } from '../../../lib/bridge';
import type { AutostartState } from '../../../lib/bridge/types';
import { toUserMessage } from '../../../lib/bridge/errors';
import { useMessages } from '../../../i18n';
import { syncCardMessages } from './sync.i18n';

const s = useMessages(syncCardMessages);
const state = ref<AutostartState | null>(null);
const busy = ref(false);
const error = ref<string | null>(null);

const enabled = computed(() => state.value?.enabled ?? false);
const trayOnly = computed(() => state.value?.tray_only ?? false);

const apply = async (nextEnabled: boolean, nextTrayOnly: boolean) => {
  busy.value = true;
  error.value = null;
  try {
    state.value = await backend.setAutostart(nextEnabled, nextTrayOnly);
  } catch (cause) {
    error.value = toUserMessage(cause, s.value.autostartFailed);
  } finally {
    busy.value = false;
  }
};

onMounted(async () => {
  if (!isDesktop()) return;
  try {
    state.value = await backend.autostartState();
  } catch (cause) {
    error.value = toUserMessage(cause, s.value.autostartFailed);
  }
});
</script>

<template>
  <template v-if="state || error">
    <div class="s-row">
      <div class="s-row-main">
        <span class="s-row-title">{{ s.autostartTitle }}</span>
        <span class="s-row-sub">{{ error ?? (state?.stale ? s.autostartStale : s.autostartSub) }}</span>
      </div>
      <GlassSwitch data-setting="autostart" :model-value="enabled" :aria-label="s.autostartTitle" :disabled="busy || !state"
        @update:model-value="(on: boolean) => apply(on, trayOnly)" />
    </div>
    <div v-if="enabled" class="s-row">
      <div class="s-row-main">
        <span class="s-row-title">{{ s.trayOnlyTitle }}</span>
        <span class="s-row-sub">{{ s.trayOnlySub }}</span>
      </div>
      <GlassSwitch data-setting="autostart-tray" :model-value="trayOnly" :aria-label="s.trayOnlyTitle" :disabled="busy"
        @update:model-value="(on: boolean) => apply(true, on)" />
    </div>
  </template>
</template>

<style scoped src="../settings-local.css"></style>
