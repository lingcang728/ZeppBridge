<script setup lang="ts">
/**
 * 数据库快照与恢复。
 *
 * 三件事必须在界面上分开说清楚，否则「有备份」会变成一句假承诺：
 *
 * 1. **快照是不是完好的**——每份快照都带 SHA-256 和 `integrity_check` 结果，
 *    随时可以重新校验；校验不过就直接标红，不给「看起来能用」的错觉。
 * 2. **恢复会覆盖掉什么**——恢复前先给预览：快照里各表的记录数 vs 当前库的
 *    记录数，差多少就写多少，不用「可能会有数据丢失」这种含糊说法。
 * 3. **恢复什么时候真的发生**——文件替换只能在任何连接打开之前做，所以这里
 *    只负责排队，真正的替换在下次启动时执行。界面必须直说这一点。
 */
import { computed, onMounted, ref } from 'vue';
import Icon from './Icon.vue';
import { backend, isDesktop, toUserMessage } from '../lib/bridge';
import { formatFullDateTime } from '../lib/format';
import type { BackupManifest, BackupVerification, PendingRestore, RestorePreview } from '../types';
import { defineMessages, useMessages } from '../i18n';

const messages = defineMessages(
  {
    title: '数据库快照与恢复',
    intro1a: '快照是整个 ',
    intro1b: ' 的一份完整副本，全部留在本机，不会上传任何地方。数据库升级前会自动生成一份，你也可以随时手动做。',
    compareLead: '三种「导出」不要混淆：',
    compareExchange: ' 是给别的工具用的数据交换，只含选中的范围；',
    compareSnapshotName: '数据库快照',
    compareSnapshot: '是灾难恢复用的整库副本，只能由 ZeppBridge 自己读回来；',
    comparePackName: 'AI 数据包',
    comparePack: '是你主动挑选并脱敏后交给外部模型的材料。只有快照能把库恢复回从前的样子。',

    pendingTitle: '有一次恢复正在排队',
    pendingBodyA: (stagedAt: string) => `排队于 ${stagedAt}，将在`,
    pendingNextStart: '下次启动',
    pendingBodyB: '时替换数据库。替换前的当前库已经存成回滚点，出问题可以再恢复回来。',
    cancelRestore: '取消恢复',

    creating: '正在生成…',
    createSnapshot: '生成快照',
    refreshList: '刷新列表',
    noSnapshots: '还没有任何快照。',

    pinned: '保留',
    metaLine: (size: string, appVersion: string, schemaVersion: number) =>
      `${size} · 程序 ${appVersion} · 数据库版本 ${schemaVersion}`,
    coverage: (from: string, to: string) => ` · 样本覆盖 ${from} ~ ${to}`,
    noSamples: ' · 快照里没有健康样本',
    verifyFailed: (problem: string) => `校验未通过：${problem}`,
    verifyPassed: '刚刚重新校验：文件、大小、SHA-256 与完整性都对得上。',
    integrityOk: (sha: string) => `生成时完整性检查通过 · SHA-256 ${sha}…`,
    integrityBad: '生成时完整性检查未通过，不要用它恢复。',
    verifyAgain: '重新校验',
    unpin: '取消保留',
    pin: '标记保留',
    restoreToThis: '恢复到这一份',

    previewTitle: '恢复预览',
    compatibilityUnknown: '兼容性未知。',
    colContent: '内容',
    colBackup: '快照里',
    colCurrent: '当前库',
    colDelta: '差值',
    previewNote: '差值为负的行，恢复后会比现在少这么多条。恢复不会去云端重新拉取——如果还需要那部分数据，要在恢复完成后再同步一次。',
    staging: '正在排队…',
    stageRestore: '排队恢复（下次启动生效）',
    cancel: '取消',

    listFailed: '无法读取备份列表',
    created: (size: string) => `已生成快照：${size}，完整性检查通过。`,
    createFailed: '生成快照失败',
    verifyError: '校验失败',
    pinFailed: '无法修改保留标记',
    previewFailed: '无法生成恢复预览',
    staged: '恢复已排队。当前这次运行不会有任何变化，下次启动 ZeppBridge 时才会替换数据库。',
    stageFailed: '无法排队恢复',
    cancelled: '已取消排队中的恢复，数据库保持不变。',
    cancelFailed: '无法取消恢复',

    kind: {
      manual: '手动',
      pre_migration: '升级前自动',
      pre_restore: '恢复前回滚点',
    },
    compatibility: {
      same_schema: '快照的数据库版本和当前程序一致，可以直接恢复。',
      older_schema_will_migrate: '快照来自更早的数据库版本，恢复后会在下次启动时自动升级。',
      future_schema_refused: '快照来自更新的程序版本，当前程序读不了它的结构，不能恢复。',
    },
    table: {
      raw_records: '原始报文',
      workouts: '运动记录',
      daily_summaries: '每日概览',
      metric_samples: '指标采样',
      sleep_sessions: '睡眠',
    },
  },
  {
    title: 'Database snapshots and restore',
    intro1a: 'A snapshot is a complete copy of the whole ',
    intro1b: ' file. It stays on this machine and is never uploaded anywhere. One is taken automatically before a database upgrade, and you can take one whenever you like.',
    compareLead: 'Three things are called "export" here, and they are not the same: ',
    compareExchange: ' is data interchange for other tools, and holds only the range you picked;',
    compareSnapshotName: 'a database snapshot',
    compareSnapshot: ' is a whole-database copy for disaster recovery that only ZeppBridge can read back;',
    comparePackName: 'an AI package',
    comparePack: ' is material you deliberately pick and de-identify for an outside model. Only a snapshot can put the database back the way it was.',

    pendingTitle: 'A restore is queued',
    pendingBodyA: (stagedAt: string) => `Queued ${stagedAt}. The database will be replaced at the `,
    pendingNextStart: 'next start',
    pendingBodyB: '. The current database is already saved as a rollback point, so you can come back from it.',
    cancelRestore: 'Cancel the restore',

    creating: 'Creating…',
    createSnapshot: 'Take a snapshot',
    refreshList: 'Refresh',
    noSnapshots: 'No snapshots yet.',

    pinned: 'Kept',
    metaLine: (size: string, appVersion: string, schemaVersion: number) =>
      `${size} · app ${appVersion} · schema ${schemaVersion}`,
    coverage: (from: string, to: string) => ` · samples ${from} ~ ${to}`,
    noSamples: ' · no health samples in this snapshot',
    verifyFailed: (problem: string) => `Verification failed: ${problem}`,
    verifyPassed: 'Just re-verified: file, size, SHA-256 and integrity all line up.',
    integrityOk: (sha: string) => `Integrity check passed at creation · SHA-256 ${sha}…`,
    integrityBad: 'The integrity check failed at creation. Do not restore from it.',
    verifyAgain: 'Verify again',
    unpin: 'Stop keeping',
    pin: 'Keep',
    restoreToThis: 'Restore to this one',

    previewTitle: 'Restore preview',
    compatibilityUnknown: 'Compatibility unknown.',
    colContent: 'Content',
    colBackup: 'In snapshot',
    colCurrent: 'Current',
    colDelta: 'Difference',
    previewNote: 'Rows with a negative difference will hold that many fewer records after the restore. A restore never re-fetches from the cloud, so if you still need that data, sync again once it is done.',
    staging: 'Queueing…',
    stageRestore: 'Queue the restore (takes effect at next start)',
    cancel: 'Cancel',

    listFailed: 'Could not read the snapshot list',
    created: (size: string) => `Snapshot created: ${size}, integrity check passed.`,
    createFailed: 'Could not create the snapshot',
    verifyError: 'Verification failed',
    pinFailed: 'Could not change the keep flag',
    previewFailed: 'Could not build the restore preview',
    staged: 'The restore is queued. Nothing changes in this run; the database is replaced the next time ZeppBridge starts.',
    stageFailed: 'Could not queue the restore',
    cancelled: 'The queued restore was cancelled. The database is unchanged.',
    cancelFailed: 'Could not cancel the restore',

    kind: {
      manual: 'manual',
      pre_migration: 'before upgrade',
      pre_restore: 'rollback point',
    },
    compatibility: {
      same_schema: 'The snapshot has the same schema version as this app, so it restores directly.',
      older_schema_will_migrate: 'The snapshot comes from an older schema version. After restoring, it upgrades itself at the next start.',
      future_schema_refused: 'The snapshot comes from a newer app version whose structure this app cannot read, so it cannot be restored.',
    },
    table: {
      raw_records: 'Raw payloads',
      workouts: 'Workouts',
      daily_summaries: 'Daily summaries',
      metric_samples: 'Metric samples',
      sleep_sessions: 'Sleep',
    },
  },
);
const t = useMessages(messages);

const lookup = (table: unknown, key: string): string | undefined =>
  (table as Record<string, string | undefined>)[key];

const backups = ref<BackupManifest[]>([]);
const pending = ref<PendingRestore | null>(null);
const preview = ref<RestorePreview | null>(null);
const verifications = ref<Record<string, BackupVerification>>({});
const busy = ref<string | null>(null);
const error = ref<string | null>(null);
const message = ref<string | null>(null);

const kindLabel = (kind: string): string => lookup(t.value.kind, kind) ?? kind;
const compatibilityCopy = (kind: string): string =>
  lookup(t.value.compatibility, kind) ?? t.value.compatibilityUnknown;

/** 只显示真正有意义的几张表，避免把内部表堆到界面上。 */
const TABLE_KEYS = ['raw_records', 'workouts', 'daily_summaries', 'metric_samples', 'sleep_sessions'];
const tableLabel = (key: string): string => lookup(t.value.table, key) ?? key;

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const previewRows = computed(() => {
  const value = preview.value;
  if (!value) return [];
  const keys = TABLE_KEYS.filter(
    (key) => key in value.manifest.table_counts || key in value.current_table_counts,
  );
  return keys.map((key) => {
    const from = value.manifest.table_counts[key] ?? 0;
    const to = value.current_table_counts[key] ?? 0;
    return { key, label: tableLabel(key), backup: from, current: to, delta: from - to };
  });
});

const load = async () => {
  if (!isDesktop()) return;
  try {
    const [list, staged] = await Promise.all([backend.listBackups(), backend.getPendingRestore()]);
    backups.value = list;
    pending.value = staged;
  } catch (cause) {
    error.value = toUserMessage(cause, t.value.listFailed);
  }
};

onMounted(() => void load());

const createBackup = async () => {
  busy.value = 'create';
  error.value = null;
  message.value = null;
  try {
    const created = await backend.createManualBackup();
    message.value = t.value.created(formatBytes(created.bytes));
    await load();
  } catch (cause) {
    error.value = toUserMessage(cause, t.value.createFailed);
  } finally {
    busy.value = null;
  }
};

const verify = async (id: string) => {
  busy.value = id;
  error.value = null;
  message.value = null;
  try {
    verifications.value = { ...verifications.value, [id]: await backend.verifyBackup(id) };
  } catch (cause) {
    error.value = toUserMessage(cause, t.value.verifyError);
  } finally {
    busy.value = null;
  }
};

const togglePinned = async (item: BackupManifest) => {
  busy.value = item.id;
  error.value = null;
  try {
    await backend.setBackupPinned(item.id, !item.pinned);
    await load();
  } catch (cause) {
    error.value = toUserMessage(cause, t.value.pinFailed);
  } finally {
    busy.value = null;
  }
};

const openPreview = async (id: string) => {
  busy.value = id;
  error.value = null;
  message.value = null;
  try {
    preview.value = await backend.getRestorePreview(id);
  } catch (cause) {
    error.value = toUserMessage(cause, t.value.previewFailed);
  } finally {
    busy.value = null;
  }
};

const confirmRestore = async () => {
  const target = preview.value;
  if (!target || !target.can_restore) return;
  busy.value = 'stage';
  error.value = null;
  try {
    pending.value = await backend.stageRestore(target.manifest.id);
    preview.value = null;
    message.value = t.value.staged;
    await load();
  } catch (cause) {
    error.value = toUserMessage(cause, t.value.stageFailed);
  } finally {
    busy.value = null;
  }
};

const cancelRestore = async () => {
  busy.value = 'cancel';
  error.value = null;
  try {
    await backend.cancelPendingRestore();
    pending.value = null;
    message.value = t.value.cancelled;
    await load();
  } catch (cause) {
    error.value = toUserMessage(cause, t.value.cancelFailed);
  } finally {
    busy.value = null;
  }
};
</script>

<template>
  <section class="settings-card" aria-labelledby="backup-title">
    <h2 id="backup-title">{{ t.title }}</h2>
    <p class="section-description">
      {{ t.intro1a }}<code>zepp.db</code>{{ t.intro1b }}
    </p>
    <p class="section-description compare">
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
      <button class="button secondary" type="button" :disabled="busy === 'cancel'" @click="cancelRestore">
        {{ t.cancelRestore }}
      </button>
    </div>

    <div class="inline-actions">
      <button class="button primary" type="button" :disabled="busy === 'create'" @click="createBackup">
        {{ busy === 'create' ? t.creating : t.createSnapshot }}
      </button>
      <button class="button secondary" type="button" :disabled="Boolean(busy)" @click="load">{{ t.refreshList }}</button>
    </div>

    <p v-if="error" class="api-error" role="alert">{{ error }}</p>
    <p v-else-if="message" class="hint-line ok" role="status"><Icon name="check" :size="13" />{{ message }}</p>

    <p v-if="!backups.length" class="retain-note">{{ t.noSnapshots }}</p>

    <div v-else class="backup-list">
      <div v-for="item in backups" :key="item.id" class="backup-row">
        <div class="backup-head">
          <span class="kind-tag" :class="item.kind">{{ kindLabel(item.kind) }}</span>
          <strong>{{ formatFullDateTime(item.created_at) }}</strong>
          <span v-if="item.pinned" class="pin-tag"><Icon name="pin" :size="11" />{{ t.pinned }}</span>
        </div>
        <div class="backup-meta">
          {{ t.metaLine(formatBytes(item.bytes), item.app_version, item.schema_version) }}
          <template v-if="item.coverage.earliest_sample_at && item.coverage.latest_sample_at">
            {{ t.coverage(item.coverage.earliest_sample_at.slice(0, 10), item.coverage.latest_sample_at.slice(0, 10)) }}
          </template>
          <template v-else>{{ t.noSamples }}</template>
        </div>
        <div class="backup-meta">
          <template v-if="verifications[item.id]">
            <template v-if="verifications[item.id].problem">
              <em class="bad">{{ t.verifyFailed(verifications[item.id].problem!) }}</em>
            </template>
            <template v-else>
              <span class="good">{{ t.verifyPassed }}</span>
            </template>
          </template>
          <template v-else-if="item.integrity_ok">{{ t.integrityOk(item.sha256.slice(0, 12)) }}</template>
          <template v-else><em class="bad">{{ t.integrityBad }}</em></template>
        </div>
        <div class="inline-actions">
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

    <div v-if="preview" class="preview-panel">
      <strong>{{ t.previewTitle }}</strong>
      <p>{{ compatibilityCopy(preview.compatibility) }}</p>
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
      <p class="retain-note">{{ t.previewNote }}</p>
      <p v-if="preview.blocker" class="api-error" role="alert">{{ preview.blocker }}</p>
      <div class="inline-actions">
        <button
          class="button primary"
          type="button"
          :disabled="!preview.can_restore || busy === 'stage'"
          @click="confirmRestore"
        >{{ busy === 'stage' ? t.staging : t.stageRestore }}</button>
        <button class="button secondary" type="button" @click="preview = null">{{ t.cancel }}</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* 与设置页共用的视觉基元。子组件拿不到父组件的 scoped 样式，
   所以这里按同一套 token 重述一遍，保证看起来是同一套东西。 */
h2 { margin: 0 0 14px; font-size: 15px; font-weight: 700; color: var(--ink); }
.settings-card { padding: 18px 20px; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface); min-width: 0; }
.section-description { margin: 0 0 var(--space-3); color: var(--muted); font-size: 12px; line-height: 1.6; }
.section-description.compare { padding: 10px 12px; border-left: 2px solid var(--line-strong); background: var(--surface-raised); border-radius: 0 var(--radius-sm) var(--radius-sm) 0; }
.section-description b { color: var(--ink); font-weight: 500; }
.section-description code { padding: 1px 5px; border-radius: 5px; background: var(--surface-raised); font-size: 11px; }
.retain-note { margin: 8px 0 0; color: var(--muted); font-size: 12px; line-height: 1.6; }
.inline-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.hint-line { display: inline-flex; align-items: center; gap: 6px; margin: 12px 0 0; color: var(--muted); font-size: 12px; }
.hint-line.ok { color: var(--accent); }
.api-error { margin: 12px 0 0; color: var(--danger); font-size: 12px; line-height: 1.55; }

.pending-banner {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--warning) 34%, transparent);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--warning) 10%, transparent);
}
.pending-banner > svg { color: var(--warning); }
.pending-banner div { display: grid; gap: 2px; min-width: 0; }
.pending-banner strong { color: var(--ink); font-size: 12px; }
.pending-banner span { color: var(--subtle); font-size: 11px; line-height: 1.55; }

.backup-list { display: grid; gap: 8px; margin-top: 14px; }
.backup-row {
  display: grid;
  gap: 3px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
}
.backup-head { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.backup-head strong { color: var(--ink); font-size: 12px; font-weight: 500; font-variant-numeric: tabular-nums; }
.kind-tag {
  padding: 2px 7px;
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  color: var(--muted);
  font-size: 10px;
}
.kind-tag.manual { border-color: color-mix(in srgb, var(--accent) 36%, transparent); color: var(--accent); }
.pin-tag { display: inline-flex; align-items: center; gap: 3px; color: var(--accent); font-size: 10px; }
.backup-meta { color: var(--subtle); font-size: 11px; line-height: 1.55; }
.backup-meta .good { color: var(--accent); }
.backup-meta .bad { color: var(--danger); font-style: normal; }
.backup-row .inline-actions { margin-top: 6px; }

.preview-panel {
  display: grid;
  gap: 6px;
  margin-top: 14px;
  padding: 14px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
}
.preview-panel > strong { color: var(--ink); font-size: 12px; }
.preview-panel > p { margin: 0; color: var(--subtle); font-size: 11px; line-height: 1.55; }
.preview-table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 11px; }
.preview-table th, .preview-table td { padding: 5px 8px; text-align: right; border-bottom: 1px solid var(--line); }
.preview-table th:first-child, .preview-table td:first-child { text-align: left; }
.preview-table th { color: var(--muted); font-weight: 500; }
.preview-table td { color: var(--ink); font-variant-numeric: tabular-nums; }
.preview-table td.loss { color: var(--danger); }
</style>
