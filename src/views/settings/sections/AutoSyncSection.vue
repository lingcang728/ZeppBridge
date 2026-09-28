<script setup lang="ts">
import { computed } from 'vue';
import Icon from '../../../components/Icon.vue';
import SegmentTrack from '../../../components/SegmentTrack.vue';
import { useSettingsContext } from '../../../composables/settings/context';
import { useSyncController } from '../../../composables/useSyncController';
import { AUTO_SYNC_INTERVALS } from '../../../lib/autoSync';
import { useMessages } from '../../../i18n';
import { settingsMessages } from '../../Settings.i18n';
import { deckMessages } from '../deck.i18n';

const t = useMessages(settingsMessages);
const d = useMessages(deckMessages);
const {
  isSyncing, autoSyncEnabled, autoSyncInterval, setAutoSyncInterval, setAutoSyncEnabled, runSync,
} = useSyncController();
const { connected } = useSettingsContext().auth;
const intervalItems = computed(() => AUTO_SYNC_INTERVALS.map((minutes) => ({ value: minutes, label: t.value.minutes(minutes) })));
</script>

<template>
  <section class="s-section" aria-labelledby="sync-title">
    <div class="s-section-head"><h3>{{ d.secAutoSync }}</h3></div>
    <div class="s-list">
      <div class="s-row">
        <div class="s-row-main">
          <span id="sync-title" class="s-row-title">{{ d.autoSyncToggle }}</span>
          <span class="s-row-sub">{{ t.syncDescA(autoSyncInterval) }} {{ t.syncDescB }}</span>
        </div>
        <div class="s-row-control">
          <button class="mat-switch" type="button" role="switch" aria-labelledby="sync-title" :aria-checked="autoSyncEnabled" @click="setAutoSyncEnabled(!autoSyncEnabled)"></button>
        </div>
      </div>
      <div class="s-row">
        <div class="s-row-main"><span class="s-row-title">{{ d.syncIntervalLabel }}</span></div>
        <div class="s-row-control">
          <SegmentTrack
            compact
            :items="intervalItems"
            :model-value="autoSyncInterval"
            :disabled="!autoSyncEnabled"
            :aria-label="t.syncIntervalAria"
            @update:model-value="(value) => setAutoSyncInterval(Number(value))"
          />
        </div>
      </div>
      <div class="s-row">
        <div class="s-row-main">
          <span class="s-row-title">{{ d.syncNowLabel }}</span>
          <span class="s-row-sub">{{ d.syncNowSub }}</span>
        </div>
        <div class="s-row-control">
          <button class="button secondary" type="button" :disabled="isSyncing || !connected" @click="runSync('incremental')">
            <Icon name="sync" :size="14" :class="{ spinning: isSyncing }" />{{ isSyncing ? t.syncing : t.syncNow }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped src="../settings-local.css"></style>
