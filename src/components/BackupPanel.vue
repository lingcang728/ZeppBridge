<script setup lang="ts">
/**
 * 数据库快照与恢复（设置卡叠「高级与维护」里）。
 * 状态和动作在 composables/useBackups.ts；这里只排版：待恢复提示 → 操作 → 快照列表 → 恢复预览。
 */
import Icon from './Icon.vue';
import { useBackups } from '../composables/useBackups';
import { formatDate, formatFullDateTime } from '../lib/format';

defineOptions({ name: 'BackupPanel' });

const {
  t, backups, pending, preview, verifications, busy, error, message,
  kindLabel, compatibilityCopy, verifyProblemText, restoreBlockerText, formatBytes, previewRows,
  load, createBackup, verify, togglePinned, openPreview, confirmRestore, cancelRestore,
} = useBackups();
</script>

<template>
  <div class="backup-panel" aria-labelledby="backup-title">
    <p class="s-note">
      {{ t.intro1a }}<code>zepp.db</code>{{ t.intro1b }}
    </p>
    <p class="s-note compare">
      {{ t.compareLead }}<b>JSON / CSV / GPX</b>{{ t.compareExchange }}
      <b>{{ t.compareSnapshotName }}</b>{{ t.compareSnapshot }}
      <b>{{ t.comparePackName }}</b>{{ t.comparePack }}
    </p>

    <div v-if="pending" class="pending-banner" role="status">
      <Icon name="clock" :size="15" />
      <div>
        <strong>{{ t.pendingTitle }}</strong>
        <span>
          {{ t.pendingBodyA(formatFullDateTime(pending.staged_at)) }}<b>{{ t.pendingNextStart }}</b>{{ t.pendingBodyB }}
        </span>
      </div>
      <button class="button secondary" type="button" :disabled="Boolean(busy)" @click="cancelRestore">
        {{ t.cancelRestore }}
      </button>
    </div>

    <div class="s-list">
      <div class="s-row">
        <div class="s-row-main">
          <span id="backup-title" class="s-row-title">{{ t.title }}</span>
          <span v-if="!backups.length && !error" class="s-row-sub">{{ t.noSnapshots }}</span>
        </div>
        <div class="s-row-control">
          <button class="button secondary" type="button" :disabled="Boolean(busy)" @click="load">{{ t.refreshList }}</button>
          <button class="button primary" type="button" :disabled="Boolean(busy)" @click="createBackup">
            {{ busy === 'create' ? t.creating : t.createSnapshot }}
          </button>
        </div>
      </div>

      <div v-for="item in backups" :key="item.id" class="s-row is-block backup-row">
        <div class="backup-head">
          <span class="chip kind-tag" :class="item.kind">{{ kindLabel(item.kind) }}</span>
          <strong>{{ formatFullDateTime(item.created_at) }}</strong>
          <span v-if="item.pinned" class="pin-tag"><Icon name="pin" :size="11" />{{ t.pinned }}</span>
        </div>
        <span class="s-row-sub">
          {{ t.metaLine(formatBytes(item.bytes), item.app_version, item.schema_version) }}
          <template v-if="item.coverage.earliest_sample_at && item.coverage.latest_sample_at">
            {{ t.coverage(formatDate(item.coverage.earliest_sample_at), formatDate(item.coverage.latest_sample_at)) }}
          </template>
          <template v-else>{{ t.noSamples }}</template>
        </span>
        <span class="s-row-sub">
          <template v-if="verifications[item.id]">
            <em v-if="verifications[item.id].problem" class="bad">{{ t.verifyFailed(verifyProblemText(verifications[item.id])) }}</em>
            <span v-else class="good">{{ t.verifyPassed }}</span>
          </template>
          <template v-else-if="item.integrity_ok">{{ t.integrityOk(item.sha256.slice(0, 12)) }}</template>
          <em v-else class="bad">{{ t.integrityBad }}</em>
        </span>
        <div class="s-actions">
          <button class="button secondary" type="button" :disabled="Boolean(busy)" @click="verify(item.id)">
            {{ t.verifyAgain }}
          </button>
          <button class="button secondary" type="button" :disabled="Boolean(busy)" @click="togglePinned(item)">
            {{ item.pinned ? t.unpin : t.pin }}
          </button>
          <button
            class="button secondary"
            type="button"
            :disabled="Boolean(busy) || Boolean(pending)"
            @click="openPreview(item.id)"
          >{{ t.restoreToThis }}</button>
        </div>
      </div>
    </div>

    <p v-if="error" class="api-error" role="alert">{{ error }}</p>
    <p v-else-if="message" class="hint-line ok" role="status"><Icon name="check" :size="13" />{{ message }}</p>

    <div v-if="preview" class="s-list preview-panel">
      <div class="s-row is-block">
        <span class="s-row-title">{{ t.previewTitle }}</span>
        <span class="s-row-sub">{{ compatibilityCopy(preview.compatibility) }}</span>
        <table class="preview-table">
          <thead>
            <tr><th>{{ t.colContent }}</th><th>{{ t.colBackup }}</th><th>{{ t.colCurrent }}</th><th>{{ t.colDelta }}</th></tr>
          </thead>
          <tbody>
            <tr v-for="row in previewRows" :key="row.key">
              <td>{{ row.label }}</td>
              <td>{{ row.backup }}</td>
              <td>{{ row.current }}</td>
              <td :class="{ loss: row.delta < 0 }">{{ row.delta > 0 ? '+' : '' }}{{ row.delta }}</td>
            </tr>
          </tbody>
        </table>
        <span class="s-row-sub">{{ t.previewNote }}</span>
        <p v-if="!preview.can_restore" class="api-error" role="alert">{{ restoreBlockerText(preview) }}</p>
        <div class="s-actions">
          <button
            class="button primary"
            type="button"
            :disabled="!preview.can_restore || busy === 'stage'"
            @click="confirmRestore"
          >{{ busy === 'stage' ? t.staging : t.stageRestore }}</button>
          <button class="button secondary" type="button" @click="preview = null">{{ t.cancel }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped src="../views/settings/settings-local.css"></style>
<style scoped>
.backup-panel { display: grid; gap: 10px; min-width: 0; }
.compare { padding: 10px 12px; border-left: 2px solid var(--mat-line-hover); border-radius: 0 var(--radius-sm) var(--radius-sm) 0; background: color-mix(in srgb, var(--ink) 2.5%, transparent); }
.s-note b { color: var(--ink); font-weight: 600; }
.s-note code { padding: 1px 5px; border-radius: 5px; background: var(--mat-inset); font-size: var(--fs-xs); }
.pending-banner {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--warning) 34%, transparent);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--warning) 10%, transparent);
}
.pending-banner > svg { color: var(--warning); }
.pending-banner div { display: grid; gap: 2px; min-width: 0; }
.pending-banner strong { color: var(--ink); font-size: var(--fs-sm); }
.pending-banner span { color: var(--subtle); font-size: var(--fs-xs); line-height: 1.55; }
.backup-row { gap: 4px; }
.backup-head { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.backup-head strong { color: var(--ink); font-size: var(--fs-sm); font-weight: 600; font-variant-numeric: tabular-nums; }
.kind-tag.manual { border-color: color-mix(in srgb, var(--accent) 36%, transparent); color: var(--accent); }
.pin-tag { display: inline-flex; align-items: center; gap: 3px; color: var(--accent); font-size: var(--fs-2xs); }
.good { color: var(--accent); }
.bad { color: var(--danger); font-style: normal; }
.backup-row .s-actions { margin-top: 6px; }
.preview-panel .s-row { gap: 8px; }
.preview-table { width: 100%; border-collapse: collapse; font-size: var(--fs-xs); }
.preview-table th, .preview-table td { padding: 5px 8px; text-align: right; border-bottom: 1px solid var(--mat-line); }
.preview-table th:first-child, .preview-table td:first-child { text-align: left; }
.preview-table th { color: var(--muted); font-weight: 600; }
.preview-table td { color: var(--ink); font-variant-numeric: tabular-nums; }
.preview-table td.loss { color: var(--danger); }
</style>
