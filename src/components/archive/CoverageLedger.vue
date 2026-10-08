<script setup lang="ts">
/* 覆盖账本：一条总进度，加一条数据流一行。
 *
 * 每一行把「已写入 / 云端无 / 待做 / 失败」拆开摆，底下一条同比例的堆叠条。
 * 把这几种状态压成一个进度条，用户就没法回答「我 2023 年的数据到底有没有」。 */
import { computed } from 'vue';
import type { CoverageLedger, FailedChunk } from '../../types';

const props = defineProps<{
  ledger: CoverageLedger;
  remaining: number;
  streamLabel: (stream: string) => string;
  chunkErrorText: (item: FailedChunk) => string;
  t: {
    ledgerTitle: string;
    ledgerProgress: (done: number, total: number) => string;
    ledgerFrom: (from: string) => string;
    ledgerComplete: string;
    ledgerIncomplete: (remaining: number) => string;
    ledgerRange: (from: string, to: string, records: number) => string;
    ledgerNothingWritten: string;
    statPersisted: string;
    statEmpty: string;
    statPending: string;
    statFailed: string;
    failedTitle: string;
    failedIntro: string;
    failedRow: (stream: string, month: string) => string;
    failedAttempts: (attempts: number) => string;
    failedExhausted: string;
  };
}>();

const percent = computed(() => (props.ledger.total_chunks
  ? Math.round((props.ledger.completed_chunks / props.ledger.total_chunks) * 100)
  : 0));

const share = (count: number, total: number) => (total > 0 ? `${(count / total) * 100}%` : '0%');
</script>

<template>
  <div class="ledger">
    <div class="ledger-head">
      <span class="s-row-title">{{ t.ledgerTitle }}</span>
      <span class="s-meta">
        {{ t.ledgerProgress(ledger.completed_chunks, ledger.total_chunks) }}<template v-if="ledger.requested_from">{{ t.ledgerFrom(ledger.requested_from.slice(0, 7)) }}</template>
      </span>
    </div>
    <div class="ledger-progress mat-inset" role="progressbar" :aria-valuenow="percent" aria-valuemin="0" aria-valuemax="100">
      <i :style="{ width: `${percent}%` }"></i>
    </div>
    <p class="s-note">{{ ledger.complete ? t.ledgerComplete : t.ledgerIncomplete(remaining) }}</p>

    <ul class="ledger-rows">
      <li v-for="stream in ledger.streams" :key="stream.stream" class="ledger-row">
        <strong>{{ streamLabel(stream.stream) }}</strong>
        <dl class="ledger-stats">
          <div><dt>{{ t.statPersisted }}</dt><dd>{{ stream.persisted_chunks }}</dd></div>
          <div><dt>{{ t.statEmpty }}</dt><dd>{{ stream.empty_chunks }}</dd></div>
          <div><dt>{{ t.statPending }}</dt><dd>{{ stream.pending_chunks }}</dd></div>
          <div v-if="stream.failed_chunks" class="bad"><dt>{{ t.statFailed }}</dt><dd>{{ stream.failed_chunks }}</dd></div>
        </dl>
        <span class="ledger-bar" aria-hidden="true">
          <i class="persisted" :style="{ width: share(stream.persisted_chunks, stream.requested_chunks) }"></i>
          <i class="empty" :style="{ width: share(stream.empty_chunks, stream.requested_chunks) }"></i>
          <i class="failed" :style="{ width: share(stream.failed_chunks, stream.requested_chunks) }"></i>
        </span>
        <small class="ledger-range">
          <template v-if="stream.persisted_from">
            {{ t.ledgerRange(stream.persisted_from.slice(0, 7), stream.persisted_to?.slice(0, 7) ?? '', stream.records) }}
          </template>
          <template v-else>{{ t.ledgerNothingWritten }}</template>
        </small>
      </li>
    </ul>

    <!-- 哪个月、为什么。只显示到月，原因在后端已经脱敏。 -->
    <ul v-if="ledger.failed_chunks_detail.length" class="failed-rows">
      <li class="failed-head">
        <span class="s-row-title">{{ t.failedTitle }}</span>
        <span class="s-row-sub">{{ t.failedIntro }}</span>
      </li>
      <li v-for="item in ledger.failed_chunks_detail" :key="`${item.stream}:${item.chunk_start}`">
        <span class="failed-name">{{ t.failedRow(streamLabel(item.stream), item.chunk_start.slice(0, 7)) }}</span>
        <span class="failed-why">{{ chunkErrorText(item) }}</span>
        <span class="s-row-sub">{{ t.failedAttempts(item.attempts) }}<template v-if="item.exhausted"> · {{ t.failedExhausted }}</template></span>
      </li>
    </ul>
  </div>
</template>

<style scoped src="../../views/settings/settings-local.css"></style>
<style scoped>
.ledger { display: grid; gap: 10px; min-width: 0; }
.ledger-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.ledger-head .s-meta { color: var(--subtle); font-size: var(--fs-xs); }
.ledger .s-note { padding: 0; }
.ledger-progress { position: relative; height: 8px; overflow: hidden; border-radius: 999px; }
.ledger-progress i { position: absolute; inset: 0 auto 0 0; border-radius: inherit; background: linear-gradient(90deg, var(--accent), var(--accent-hover)); transition: width var(--dur-slow) var(--ease-out); }
/* 一条流一行，细线分开（不再一格一块凸起的小板：那是卡里套卡）。窄了统计和范围折到下一行。 */
.ledger-rows { display: grid; margin: 0; padding: 0; list-style: none; }
.ledger-row {
  display: grid;
  grid-template-columns: minmax(9em, 1.2fr) minmax(12em, 1.4fr) minmax(70px, .8fr) auto;
  align-items: center;
  gap: 6px 16px;
  min-width: 0;
  padding: 9px 0;
}
.ledger-row + .ledger-row { border-top: 1px solid var(--mat-line); }
.ledger-row > strong { color: var(--ink); font-size: var(--fs-sm); font-weight: 600; }
@media (max-width: 760px) { .ledger-row { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }
.ledger-stats { display: grid; grid-template-columns: repeat(4, minmax(0, auto)); justify-content: start; gap: 4px 14px; margin: 0; }
.ledger-stats > div { display: grid; gap: 1px; min-width: 0; }
.ledger-stats dt { color: var(--subtle); font-size: var(--fs-2xs); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ledger-stats dd { margin: 0; color: var(--ink); font-family: var(--font-mono); font-size: var(--fs-md); font-variant-numeric: tabular-nums; }
.ledger-stats .bad dt, .ledger-stats .bad dd { color: var(--danger); }
.ledger-bar { display: flex; height: 5px; overflow: hidden; border-radius: 999px; background: var(--mat-inset); }
.ledger-bar i { display: block; height: 100%; }
.ledger-bar .persisted { background: var(--accent); }
.ledger-bar .empty { background: color-mix(in srgb, var(--ink) 28%, transparent); }
.ledger-bar .failed { background: var(--danger); }
.ledger-range { color: var(--subtle); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
.failed-rows { display: grid; margin: 4px 0 0; padding: 0; list-style: none; }
.failed-rows > li { display: grid; gap: 2px; padding: 9px 0; border-top: 1px solid var(--mat-line); }
.failed-name { color: var(--ink); font-size: var(--fs-sm); font-weight: 600; }
.failed-why { color: var(--muted); font-size: var(--fs-sm); overflow-wrap: anywhere; }
</style>
