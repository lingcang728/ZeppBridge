<script setup lang="ts">
import { computed } from 'vue';
import SegmentTrack from '../../../components/SegmentTrack.vue';
import { useSettingsContext } from '../../../composables/settings/context';
import { useMessages } from '../../../i18n';
import { settingsMessages } from '../../Settings.i18n';
import { deckMessages } from '../deck.i18n';

const t = useMessages(settingsMessages);
const d = useMessages(deckMessages);
const {
  retentionDays, dataBusy, estimateText, retentionCutoffDate,
  savePrefs, cleanupData, reprocessLocalData,
} = useSettingsContext().prefs;

const pickRetention = (days: number) => {
  retentionDays.value = days;
  void savePrefs();
};

const RETENTION_CHOICES = computed(() =>
  [30, 90, 180, 365].map((days) => ({ value: days, label: t.value.days(days) })));
</script>

<template>
  <section class="s-section" aria-labelledby="retention-title">
    <div class="s-section-head"><h3 id="retention-title">{{ d.secRetention }}</h3></div>
    <div class="s-list">
      <div class="s-row">
        <div class="s-row-main">
          <span class="s-row-title">{{ t.retentionLabel }}</span>
          <span class="s-row-sub">{{ d.retentionSub }}</span>
        </div>
        <div class="s-row-control">
          <SegmentTrack
            compact
            :items="RETENTION_CHOICES"
            :model-value="retentionDays"
            :aria-label="t.retentionAria"
            @update:model-value="pickRetention"
          />
        </div>
      </div>
      <div class="s-row is-block">
        <p class="s-row-sub">{{ t.retentionNote(retentionDays) }}<strong>{{ t.retentionNoteStrong }}</strong>{{ t.retentionNoteTail }}</p>
        <p class="s-row-sub">{{ estimateText || t.retentionCutoff(retentionCutoffDate) }}</p>
        <div class="s-actions">
          <button class="button secondary" type="button" :disabled="Boolean(dataBusy)" @click="cleanupData">
            {{ dataBusy === 'cleanup' ? t.cleaningUp : t.cleanupNow }}
          </button>
          <button class="button secondary" type="button" :disabled="Boolean(dataBusy)" @click="reprocessLocalData">
            {{ dataBusy === 'reprocess' ? t.reprocessing : t.reprocessNow }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped src="../settings-local.css"></style>
<style scoped>
.is-block { gap: 8px; }
.is-block p { margin: 0; }
</style>
