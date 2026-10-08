<script setup lang="ts">
import { computed, ref } from 'vue';
import { useSettingsContext } from '../../../composables/settings/context';
import { useHistoryBackfill } from '../../../composables/useHistoryBackfill';
import { useMessages } from '../../../i18n';
import { settingsMessages } from '../../Settings.i18n';
import { maintenanceMessages } from './maintenance.i18n';

const t = useMessages(settingsMessages);
const m = useMessages(maintenanceMessages);
const { userPrefs, dataBusy, retentionCutoffDate, cleanupData, reprocessLocalData, applyPrefsChange } = useSettingsContext().prefs;
const backfill = useHistoryBackfill(() => userPrefs.value, applyPrefsChange);
const { ledger, busy, error: backfillError } = backfill;

const forever = computed(() => Boolean(userPrefs.value?.archive_enabled));

/* 补拉的 message / error 是模块级共享的，进度句也写在那里；这里只显示自己这次清空的结果。 */
const resetNote = ref<{ ok: boolean; text: string } | null>(null);
const resetLedger = async () => {
  resetNote.value = null;
  const before = ledger.value?.total_chunks ?? 0;
  await backfill.resetLedger();
  if (backfillError.value) resetNote.value = { ok: false, text: backfillError.value };
  else if ((ledger.value?.total_chunks ?? 0) < before) resetNote.value = { ok: true, text: backfill.t.value.ledgerReset };
};
</script>

<template>
  <section class="s-section" aria-labelledby="maintenance-title">
    <div class="s-section-head"><h3 id="maintenance-title">{{ m.secMaintenance }}</h3></div>
    <div class="s-list">
      <div class="s-row">
        <div class="s-row-main">
          <span class="s-row-title">{{ m.cleanupTitle }}</span>
          <span class="s-row-sub">{{ forever ? m.cleanupForever : m.cleanupSub(retentionCutoffDate) }}</span>
        </div>
        <div class="s-row-control">
          <button class="button secondary" type="button" :disabled="forever || Boolean(dataBusy)" @click="cleanupData">
            {{ dataBusy === 'cleanup' ? t.cleaningUp : t.cleanupNow }}
          </button>
        </div>
      </div>
      <div class="s-row">
        <div class="s-row-main">
          <span class="s-row-title">{{ m.reparseTitle }}</span>
          <span class="s-row-sub">{{ m.reparseSub }}</span>
        </div>
        <div class="s-row-control">
          <button class="button secondary" type="button" :disabled="Boolean(dataBusy)" @click="reprocessLocalData">
            {{ dataBusy === 'reprocess' ? t.reprocessing : t.reprocessNow }}
          </button>
        </div>
      </div>
      <div v-if="ledger?.total_chunks || resetNote" class="s-row">
        <div class="s-row-main">
          <span class="s-row-title">{{ m.resetTitle }}</span>
          <span class="s-row-sub">{{ m.resetSub }}</span>
          <span v-if="resetNote" :class="resetNote.ok ? 'hint-line ok' : 'api-error'" :role="resetNote.ok ? 'status' : 'alert'">{{ resetNote.text }}</span>
        </div>
        <div class="s-row-control">
          <button class="button secondary" type="button" :disabled="busy || !ledger?.total_chunks" @click="resetLedger">{{ backfill.t.value.resetLedger }}</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped src="../settings-local.css"></style>
