<script setup lang="ts">
import { computed } from 'vue';
import Icon from '../../../components/Icon.vue';
import SegmentTrack from '../../../components/SegmentTrack.vue';
import { useSettingsContext } from '../../../composables/settings/context';
import { useSyncController } from '../../../composables/useSyncController';
import { AUTO_SYNC_INTERVALS } from '../../../lib/autoSync';
import { useMessages } from '../../../i18n';
import { settingsMessages } from '../../Settings.i18n';

const t = useMessages(settingsMessages);
const {
  isSyncing, autoSyncEnabled, autoSyncInterval, setAutoSyncInterval, setAutoSyncEnabled, runSync,
} = useSyncController();
const { connected } = useSettingsContext().auth;
const intervalItems = computed(() => AUTO_SYNC_INTERVALS.map((minutes) => ({ value: minutes, label: t.value.minutes(minutes) })));
</script>

<template>
  <section class="settings-card sync-card" aria-labelledby="sync-title">
    <div class="sync-lead">
      <span class="sync-icon"><Icon name="monitor" :size="20" /></span>
      <div>
        <h2 id="sync-title">{{ t.syncTitle }}</h2>
        <p class="sync-desc">{{ t.syncDescA(autoSyncInterval) }}<br />{{ t.syncDescB }}</p>
      </div>
    </div>
    <div class="sync-controls">
      <SegmentTrack
        compact
        :items="intervalItems"
        :model-value="autoSyncInterval"
        :disabled="!autoSyncEnabled"
        :aria-label="t.syncIntervalAria"
        @update:model-value="(value) => setAutoSyncInterval(Number(value))"
      />
      <span class="sync-toggle-label">{{ autoSyncEnabled ? t.syncOn : t.syncOff }}</span>
      <button class="switch" type="button" role="switch" aria-labelledby="sync-title" :aria-checked="autoSyncEnabled" @click="setAutoSyncEnabled(!autoSyncEnabled)"><span></span></button>
      <button class="button secondary sync-now" type="button" :disabled="isSyncing || !connected" @click="runSync('incremental')">
        <Icon name="sync" :size="14" />{{ isSyncing ? t.syncing : t.syncNow }}
      </button>
    </div>
  </section>
</template>

<style scoped src="../settings-base.css"></style>
<style scoped>
.sync-card { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.sync-lead { display: flex; align-items: flex-start; gap: 12px; min-width: 0; }
.sync-lead h2 { margin-bottom: 4px; }
.sync-icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  border-radius: 11px;
  border: 1px solid var(--line);
  background: var(--surface-raised);
  color: var(--accent);
}
.sync-desc { margin: 0; color: var(--muted); font-size: var(--fs-sm); line-height: 1.6; }
.sync-controls { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.sync-toggle-label { color: var(--muted); font-size: var(--fs-sm); }
.sync-now { min-height: 36px; border-radius: 10px; }
</style>
