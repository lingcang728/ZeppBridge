<script setup lang="ts">
/* 「归档与存储」卡：保留多久（含「一直保留」= 长期归档）、本机占用、补全更早的历史、备份入口。
 * 补拉的起点、自动续传、估算和覆盖账本都在「明细」里（HistoryArchivePanel）。 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import HistoryArchivePanel from '../../../components/HistoryArchivePanel.vue';
import SegmentTrack from '../../../components/SegmentTrack.vue';
import { useSettingsContext } from '../../../composables/settings/context';
import { useHistoryBackfill } from '../../../composables/useHistoryBackfill';
import { useSyncController } from '../../../composables/useSyncController';
import { backend, isDesktop, toUserMessage } from '../../../lib/bridge';
import { formatBytes, formatWhen } from '../../../lib/format';
import { useMessages } from '../../../i18n';
import { settingsMessages } from '../../Settings.i18n';
import { archiveCardMessages } from './archive.i18n';

const t = useMessages(settingsMessages);
const a = useMessages(archiveCardMessages);
const router = useRouter();
const { appStatus } = useSyncController();
const { feedback, prefs } = useSettingsContext();
const { userPrefs, retentionDays, retentionCutoffDate, storageEstimate, savePrefs, applyPrefsChange } = prefs;

const backfill = useHistoryBackfill(() => userPrefs.value, applyPrefsChange);
const { ledger, busy, remaining, stopRequested, isSyncing, fromDate, wouldBeCleanedUp, stopReasonText } = backfill;

const FOREVER = 'forever';
const keepItems = computed(() => [
  ...[30, 90, 180].map((days) => ({ value: days, label: t.value.days(days) })),
  { value: 365, label: a.value.year },
  { value: FOREVER, label: a.value.forever },
]);
const keepChoice = computed<number | string>(() => (userPrefs.value?.archive_enabled ? FOREVER : retentionDays.value));
const keepSub = computed(() => (keepChoice.value === FOREVER ? a.value.keepForeverSub : t.value.retentionCutoff(retentionCutoffDate.value)));

const keepBusy = ref(false);
const pickKeep = async (value: string | number) => {
  const current = userPrefs.value;
  if (!current || keepBusy.value || value === keepChoice.value) return;
  if (value === FOREVER) {
    await backfill.toggleArchive();
    return;
  }
  const days = Number(value);
  if (!current.archive_enabled) {
    retentionDays.value = days;
    await savePrefs();
    return;
  }
  /* 从「一直保留」退回某个天数 = 关掉长期归档并换保留期：一次写进去，只问一次。 */
  if (!window.confirm(backfill.t.value.confirmDisableArchive)) return;
  keepBusy.value = true;
  try {
    applyPrefsChange(await backend.setUserPrefs(days, current.history_sync_days, false));
  } catch (error) {
    feedback.dataError.value = toUserMessage(error, t.value.prefsSaveFailed);
  } finally {
    keepBusy.value = false;
  }
};

const size = computed(() => {
  const bytes = storageEstimate.value?.database_bytes ?? appStatus.value?.storage?.database_bytes;
  return typeof bytes === 'number' && bytes > 0 ? formatBytes(bytes) : null;
});
const since = computed(() => {
  const earliest = appStatus.value?.coverage?.earliest_day;
  return earliest ? a.value.sizeSince(earliest.slice(0, 7)) : a.value.sizeEmpty;
});

const filledSub = computed(() => {
  const months = (ledger.value?.streams ?? [])
    .map((stream) => stream.persisted_from)
    .filter((from): from is string => Boolean(from))
    .map((from) => from.slice(0, 7))
    .sort();
  if (!months.length) return a.value.neverFilled;
  return remaining.value > 0 ? a.value.filledToLeft(months[0], remaining.value) : a.value.filledTo(months[0]);
});
const detailsOpen = ref(false);
const runDisabled = computed(() => busy.value || isSyncing.value || !fromDate.value || wouldBeCleanedUp.value || Boolean(stopReasonText.value));

const latestBackup = ref<string | null>(null);
onMounted(async () => {
  if (!isDesktop()) return;
  try {
    const list = await backend.listBackups();
    const stamps = list.map((item) => item.created_at).sort();
    latestBackup.value = stamps[stamps.length - 1] ?? null;
  } catch {
    latestBackup.value = null;
  }
});
const backupSub = computed(() => {
  const when = formatWhen(latestBackup.value);
  return when ? a.value.backupLatest(when) : a.value.backupNone;
});
const openBackup = () => { void router.push({ path: '/settings/advanced', hash: '#backup' }); };
</script>

<template>
  <section class="s-section" aria-labelledby="keep-title">
    <div class="s-section-head"><h3 id="keep-title">{{ a.secKeep }}</h3></div>
    <div class="s-list">
      <div class="s-row">
        <div class="s-row-main">
          <span class="s-row-title">{{ a.keepTitle }}</span>
          <span class="s-row-sub">{{ keepSub }}</span>
        </div>
        <div class="s-row-control">
          <SegmentTrack
            compact
            :items="keepItems"
            :model-value="keepChoice"
            :disabled="!userPrefs || keepBusy || busy"
            :aria-label="t.retentionAria"
            @update:model-value="pickKeep"
          />
        </div>
      </div>
      <div class="s-row">
        <div class="s-row-main">
          <span class="s-row-title">{{ a.sizeTitle }}</span>
          <span class="s-row-sub">{{ since }}</span>
        </div>
        <div class="s-row-control"><span class="s-value">{{ size ?? '—' }}</span></div>
      </div>
    </div>
  </section>

  <section class="s-section" aria-labelledby="history-title">
    <div class="s-section-head"><h3 id="history-title">{{ a.secHistory }}</h3></div>
    <div class="s-list">
      <div class="s-row">
        <div class="s-row-main">
          <span class="s-row-title">{{ a.fillTitle }}</span>
          <span class="s-row-sub">{{ filledSub }}</span>
        </div>
        <div class="s-row-control s-actions">
          <button class="button secondary" type="button" :aria-expanded="detailsOpen" aria-controls="archive-details" @click="detailsOpen = !detailsOpen">
            {{ a.details }}
          </button>
          <button v-if="busy" class="button secondary" type="button" :disabled="stopRequested" @click="backfill.stopBackfill">
            {{ stopRequested ? backfill.t.value.stopping : backfill.t.value.stopBackfill }}
          </button>
          <button class="button primary" type="button" :disabled="runDisabled" @click="backfill.runBackfill">
            {{ busy ? backfill.t.value.backfilling : (remaining > 0 ? backfill.t.value.continueBackfill : backfill.t.value.startBackfill) }}
          </button>
        </div>
      </div>
      <div v-if="detailsOpen" id="archive-details" class="details-rows">
        <HistoryArchivePanel :state="backfill" :prefs="userPrefs" />
      </div>
      <div class="s-row">
        <div class="s-row-main">
          <span class="s-row-title">{{ a.backupTitle }}</span>
          <span class="s-row-sub">{{ backupSub }}</span>
        </div>
        <div class="s-row-control">
          <button class="button secondary" type="button" @click="openBackup">{{ a.open }}</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped src="../settings-local.css"></style>
<style scoped>
.s-value { color: var(--ink); font-family: var(--font-mono); font-size: var(--fs-md); font-variant-numeric: tabular-nums; }
.s-actions { flex-wrap: nowrap; }
/* 明细几行缩进一点、底色淡一层，看得出它们属于上面那一行；仍是同一块列表里的细线行。 */
.details-rows { display: grid; background: color-mix(in srgb, var(--ink) 3%, transparent); }
.details-rows > :deep(.s-row) { padding-left: 34px; }
</style>
