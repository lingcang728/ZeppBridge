<script setup lang="ts">
import { computed } from 'vue';
import Icon from '../../../components/Icon.vue';
import SegmentTrack from '../../../components/SegmentTrack.vue';
import { useSettingsContext } from '../../../composables/settings/context';
import { useSyncController } from '../../../composables/useSyncController';
import { AUTO_SYNC_INTERVALS } from '../../../lib/autoSync';
import { formatWhen } from '../../../lib/format';
import { useMessages } from '../../../i18n';
import { settingsMessages } from '../../Settings.i18n';
import { deckMessages } from '../deck.i18n';
import { syncCardMessages } from './sync.i18n';
import UpdateSection from './UpdateSection.vue';

const t = useMessages(settingsMessages);
const d = useMessages(deckMessages);
const s = useMessages(syncCardMessages);
const {
  appStatus, syncReport, isSyncing, autoSyncEnabled, autoSyncInterval, setAutoSyncInterval, setAutoSyncEnabled, runSync,
} = useSyncController();
const { connected } = useSettingsContext().auth;

/* 0 = 关。开关和间隔是同一个决定（多久拉一次，或者不拉），放一个分段里一眼看清。 */
const items = computed(() => [
  { value: 0, label: s.value.off },
  ...AUTO_SYNC_INTERVALS.map((minutes) => ({ value: minutes, label: t.value.minutes(minutes) })),
]);
const choice = computed(() => (autoSyncEnabled.value ? autoSyncInterval.value : 0));
const pick = (value: string | number) => {
  const minutes = Number(value);
  if (minutes === 0) {
    if (autoSyncEnabled.value) setAutoSyncEnabled(false);
    return;
  }
  setAutoSyncInterval(minutes);
  if (!autoSyncEnabled.value) setAutoSyncEnabled(true);
};

const lastSynced = computed(() => {
  const when = formatWhen(appStatus.value?.last_cloud_sync_at);
  return when ? s.value.lastSynced(when) : s.value.neverSynced;
});

/* 副标题：上一次是「云端还没新数据」（1E 探云端）就说怎么办；否则给本机最新一条样本的时刻。 */
const freshness = computed(() => {
  const report = syncReport.value;
  if (report?.outcome === 'cloud_stale') {
    const when = formatWhen(report.cloud_latest_at);
    return when ? s.value.cloudStale(when) : s.value.cloudStaleNoTime;
  }
  const newest = (appStatus.value?.streams ?? [])
    .map((stream) => stream.newest_sample_at)
    .filter((value): value is string => Boolean(value) && !Number.isNaN(Date.parse(value as string)))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0];
  const when = formatWhen(newest);
  return when ? s.value.newest(when) : '';
});
</script>

<template>
  <section class="s-section" aria-labelledby="sync-title">
    <div class="s-list">
      <div class="s-row">
        <div class="s-row-main">
          <span id="sync-title" class="s-row-title">{{ d.autoSyncToggle }}</span>
          <span class="s-row-sub">{{ s.autoSub }}</span>
        </div>
        <div class="s-row-control">
          <SegmentTrack
            compact
            :items="items"
            :model-value="choice"
            :aria-label="t.syncIntervalAria"
            @update:model-value="pick"
          />
        </div>
      </div>
      <div class="s-row">
        <div class="s-row-main">
          <span class="s-row-title">{{ lastSynced }}</span>
          <span v-if="freshness" class="s-row-sub">{{ freshness }}</span>
        </div>
        <div class="s-row-control">
          <button class="button secondary" type="button" :disabled="isSyncing || !connected" @click="runSync('incremental')">
            <Icon name="sync" :size="14" :class="{ spinning: isSyncing }" />{{ isSyncing ? t.syncing : t.syncNow }}
          </button>
        </div>
      </div>
      <UpdateSection />
    </div>
  </section>
</template>

<style scoped src="../settings-local.css"></style>
