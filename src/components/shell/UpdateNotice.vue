<script setup lang="ts">
import { computed } from 'vue';
import { openUrl } from '@tauri-apps/plugin-opener';
import ModalDialog from '../ModalDialog.vue';
import BrandMark from '../BrandMark.vue';
import { acknowledgeUpdate, notesForLocale, releaseRows, releaseUrl, updateNotice } from '../../services/updateNotice';
import { locale } from '../../i18n';
import { useUpdateNoticeText } from './UpdateNotice.i18n';

const t = useUpdateNoticeText();
const receipt = computed(() => updateNotice.receipt);
const rows = computed(() => releaseRows(notesForLocale(receipt.value?.notes ?? '', locale.value)));
const origin = () => document.querySelector<HTMLElement>('.brand');
const details = () => {
  if (!receipt.value) return;
  const url = releaseUrl(receipt.value.version);
  if ('__TAURI_INTERNALS__' in window) void openUrl(url).catch(() => undefined);
  else window.open(url, '_blank', 'noopener,noreferrer');
};
</script>

<template>
  <ModalDialog v-if="receipt" labelledby="update-notice-title" :origin="origin()" :max-width="760">
    <div class="release-card">
      <header class="release-header">
        <span class="release-mark"><BrandMark :size="32" /></span>
        <div><h2 id="update-notice-title">{{ t.title(receipt.version) }}</h2><p v-if="receipt.from">{{ t.since(receipt.from) }}</p></div>
      </header>
      <div class="release-body">
        <div class="release-version">v{{ receipt.version }}</div>
        <div v-for="(row, index) in rows" :key="index" :class="['release-row', { 'release-heading': row.heading }]">
          <span v-if="!row.heading" class="release-tag">{{ t[row.kind] }}</span>
          <p>{{ row.text }}</p>
        </div>
        <p v-if="!rows.length" class="release-empty">{{ t.empty }}</p>
      </div>
      <footer class="release-actions">
        <button type="button" class="button secondary" @click="details">{{ t.fullNotes }}</button>
        <button type="button" class="button primary acknowledge" @click="acknowledgeUpdate">{{ t.acknowledge }}</button>
      </footer>
    </div>
  </ModalDialog>
</template>

<style scoped>
.release-card { padding: 20px; }
.release-header { display: flex; align-items: center; gap: 18px; }
.release-mark { display: grid; place-items: center; width: 58px; height: 58px; flex: none; border-radius: 18px; background: color-mix(in srgb, var(--accent) 12%, transparent); border: 1px solid color-mix(in srgb, var(--accent) 22%, transparent); }
h2 { margin: 0; font-size: 26px; line-height: 1.3; letter-spacing: -.02em; }
.release-header p { margin: 8px 0 0; color: var(--muted); font-size: 15px; }
.release-body { margin: 32px 0; max-height: 45vh; overflow-y: auto; overscroll-behavior: contain; }
.release-version { margin-bottom: 18px; font-weight: 650; font-size: 17px; }
.release-row { display: flex; align-items: baseline; gap: 16px; margin: 14px 0; }
.release-row p { margin: 0; min-width: 0; white-space: pre-wrap; font-size: 16px; line-height: 1.75; }
.release-tag { flex: none; padding: 2px 9px; border-radius: 7px; background: var(--surface); color: var(--muted); font-size: 12px; line-height: 1.6; }
.release-heading { margin-top: 24px; font-weight: 650; }
.release-empty { color: var(--muted); line-height: 1.7; }
.release-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 12px; padding-top: 8px; }
.release-actions .button { min-height: 44px; padding-inline: 20px; font-size: 15px; }
.acknowledge { min-width: 110px; }
@media (max-width: 600px) { .release-card { padding: 4px; } h2 { font-size: 22px; } .release-header { gap: 12px; } .release-body { margin: 24px 0; } .release-row { gap: 10px; } .release-actions .button { flex: 1; } }
</style>
