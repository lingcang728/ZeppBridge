<script setup lang="ts">
import DeviceVisual from './DeviceVisual.vue';
import { deviceStateLabel, type DeviceCardModel } from '../composables/useDevices';

withDefaults(defineProps<{
  profile: DeviceCardModel;
  compact?: boolean;
}>(), {
  compact: false,
});
</script>

<template>
  <article :class="['device-card', { compact }]">
    <DeviceVisual
      :src="profile.image"
      :kind="profile.kind"
      :alt="profile.canonicalName"
      :compact="compact"
    />
    <div class="device-card-copy">
      <strong>{{ profile.canonicalName }}</strong>
      <span class="device-display">{{ profile.displayName }}</span>
      <span class="device-state"><i :class="['dot', profile.state === 'recent_data' ? 'has-data' : profile.state === 'account' ? 'identified' : 'muted']"></i>{{ deviceStateLabel(profile.state) }}</span>
      <span v-if="!compact" class="device-meta">固件 {{ profile.firmware }}<br />最近数据 {{ profile.lastData }}</span>
    </div>
  </article>
</template>

<style scoped>
.device-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface-raised);
  transition: border-color 160ms ease, transform 160ms ease;
}
.device-card:hover { border-color: var(--line-strong); transform: translateY(-1px); }
.device-card.compact { padding: 8px 10px; gap: 9px; border-radius: var(--radius-sm); }
.device-card-copy { display: grid; gap: 3px; min-width: 0; align-content: start; }
.device-card-copy strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 700; }
.device-display { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); font-size: 11px; }
.device-state { display: inline-flex; align-items: center; gap: 5px; color: var(--muted); font-size: 11px; }
.dot { width: 7px; height: 7px; flex: 0 0 7px; border-radius: 50%; background: var(--subtle); }
.dot.has-data { background: var(--readiness); }
.dot.identified { background: var(--accent); }
.device-meta { color: var(--subtle); font-size: 11px; line-height: 1.55; font-variant-numeric: tabular-nums; }
@media (prefers-reduced-motion: reduce) { .device-card { transition: none; } .device-card:hover { transform: none; } }
</style>
