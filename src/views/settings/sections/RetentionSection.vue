<script setup lang="ts">
import { computed } from 'vue';
import SelectMenu from '../../../components/SelectMenu.vue';
import { useSettingsContext } from '../../../composables/settings/context';
import { useMessages } from '../../../i18n';
import { settingsMessages } from '../../Settings.i18n';

const t = useMessages(settingsMessages);
const {
  retentionDays, dataBusy, estimateText, retentionCutoffDate,
  savePrefs, cleanupData, reprocessLocalData,
} = useSettingsContext().prefs;

const RETENTION_CHOICES = computed(() =>
  [30, 90, 180, 365].map((days) => ({ value: days, label: t.value.days(days) })));
</script>

<template>
  <section class="settings-card" aria-labelledby="retention-title">
    <h2 id="retention-title">{{ t.retentionTitle }}</h2>
    <div class="field-row">
      <span class="kv-label">{{ t.retentionLabel }}</span>
      <SelectMenu
        v-model="retentionDays"
        :options="RETENTION_CHOICES"
        :aria-label="t.retentionAria"
        @update:model-value="savePrefs"
      />
    </div>
    <p class="retain-note">{{ t.retentionNote(retentionDays) }}<strong>{{ t.retentionNoteStrong }}</strong>{{ t.retentionNoteTail }}</p>
    <p class="hint-line">{{ estimateText || t.retentionCutoff(retentionCutoffDate) }}</p>
    <div class="inline-actions">
      <button class="button secondary" type="button" :disabled="Boolean(dataBusy)" @click="cleanupData">
        {{ dataBusy === 'cleanup' ? t.cleaningUp : t.cleanupNow }}
      </button>
      <button class="button secondary" type="button" :disabled="Boolean(dataBusy)" @click="reprocessLocalData">
        {{ dataBusy === 'reprocess' ? t.reprocessing : t.reprocessNow }}
      </button>
    </div>
  </section>
</template>

<style scoped src="../settings-base.css"></style>
