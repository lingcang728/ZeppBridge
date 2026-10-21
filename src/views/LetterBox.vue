<script setup lang="ts">
/**
 * 信匣（批次 6）：所有作者来信离线可重读，自己的回信和它们的回执，以及每一版一枚的邮票。
 * 批次 7 的每周数据来信、时间胶囊、那年今天以后也收在这里。
 */
import '../components/letters/paper.css';
import { computed, onMounted, ref, watch } from 'vue';
import PageHeader from '../components/PageHeader.vue';
import SegmentTrack from '../components/SegmentTrack.vue';
import PostageStamp from '../components/letters/PostageStamp.vue';
import LetterEnvelope from '../components/letters/LetterEnvelope.vue';
import { useLetterText } from '../components/letters/letters.i18n';
import { echoTitles, letterVersions, loadLetter } from '../services/letters';
import { letterBox, loadLetterBox, markReceiptsSeen, syncLetterBox } from '../services/letterBox';
import { BUNDLED_VERSION, groupRows, loadBundledNotes, releaseRows, type NoteGroup } from '../services/updateNotice';
import { leadParagraph, parseLetter } from '../lib/letters/parse';
import { displayDateTimeFormatter } from '../lib/dateTime';
import { locale } from '../i18n';
import type { LetterReceipt } from '../types/letters';

type Tab = 'letters' | 'replies' | 'stamps';
const t = useLetterText();
const tab = ref<Tab>('letters');
const tabs = computed(() => [
  { value: 'letters' as const, label: t.value.tabLetters },
  { value: 'replies' as const, label: t.value.tabReplies },
  { value: 'stamps' as const, label: t.value.tabStamps },
]);

const versions = computed(() => letterVersions());
const previews = ref(new Map<string, string>());
const titles = ref(new Map<string, string>());
watch(locale, async (language) => {
  const next = new Map<string, string>();
  for (const v of versions.value) {
    const letter = await loadLetter(v, language);
    const paragraphs = letter ? parseLetter(letter.text).paragraphs : [];
    const first = (paragraphs[leadParagraph(paragraphs)] ?? '').replace(/\*\*/g, '');
    next.set(v, first.length > 90 ? `${first.slice(0, 88)}…` : first);
  }
  previews.value = next;
  titles.value = await echoTitles(language);
}, { immediate: true });

const syncing = ref(false);
onMounted(async () => {
  await loadLetterBox();
  syncing.value = true;
  await syncLetterBox();
  syncing.value = false;
});
const retry = async () => { syncing.value = true; await syncLetterBox(); syncing.value = false; };
watch(tab, (value) => { if (value === 'replies') markReceiptsSeen(); });

const day = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : displayDateTimeFormatter({ year: 'numeric', month: 'short', day: 'numeric' }).format(date);
};
const receiptFor = (replyId: string): LetterReceipt | undefined => letterBox.view.receipts.find((r) => r.replyId === replyId);
/** 回执一行：「已读 · 归入『补拉卡住』· 3.1.1 修」。没取到回执时只说寄出日期。 */
const receiptLine = (replyId: string): string[] => {
  const receipt = receiptFor(replyId);
  if (!receipt) return [];
  const parts = [receipt.readAt ? t.value.read : t.value.unread];
  const title = receipt.category ? titles.value.get(receipt.category) : undefined;
  if (title) parts.push(t.value.filedUnder(title));
  const status = receipt.status === 'next' ? t.value.statusNext : receipt.status === 'later' ? t.value.statusLater
    : receipt.status === 'asking' ? t.value.statusAsking : receipt.status === 'fixed' ? t.value.statusFixed(receipt.fixedIn)
      : receipt.status === 'declined' ? t.value.statusDeclined : '';
  if (status) parts.push(status);
  return parts;
};

/* 重读一封：信封直接是打开的；本版的信顺带当前打包的更新说明。 */
const reading = ref<{ version: string; notes: NoteGroup[] | null; origin: HTMLElement | null } | null>(null);
const reread = async (version: string, event: MouseEvent) => {
  const origin = event.currentTarget as HTMLElement;
  const notes = version === BUNDLED_VERSION ? await loadBundledNotes(version, locale.value) : null;
  reading.value = { version, notes: notes ? groupRows(releaseRows(notes)) : null, origin };
};
</script>

<template>
  <section class="page letter-box" aria-labelledby="letter-box-title">
    <PageHeader title-id="letter-box-title" :title="t.boxTitle" :intro="t.boxSub">
      <SegmentTrack v-model="tab" :items="tabs" :aria-label="t.boxTitle" />
    </PageHeader>

    <section v-if="tab === 'letters'" class="box-section">
      <p v-if="!versions.length" class="box-empty">{{ t.emptyLetters }}</p>
      <ul v-else class="letter-list">
        <li v-for="v in versions" :key="v" class="letter-row">
          <PostageStamp :version="v" :width="40" />
          <div class="letter-main">
            <span class="letter-title">{{ t.letterHead(v) }}</span>
            <span class="letter-preview">{{ previews.get(v) }}</span>
          </div>
          <button type="button" class="button secondary" @click="reread(v, $event)">{{ t.reread }}</button>
        </li>
      </ul>
    </section>

    <section v-else-if="tab === 'replies'" class="box-section" :aria-busy="syncing">
      <template v-if="letterBox.view.outbox.length">
        <h2 class="box-heading">{{ t.outbox }}</h2>
        <ul class="reply-list">
          <li v-for="pending in letterBox.view.outbox" :key="pending.local_id" class="reply-row is-pending">
            <span class="reply-version">{{ t.letterHead(pending.letter_version) }}</span>
            <p class="reply-text">{{ pending.text || t.alsoAttached(pending.also_hit.length) }}</p>
          </li>
        </ul>
        <button type="button" class="button secondary" :disabled="syncing" @click="retry">{{ t.outboxRetry }}</button>
      </template>
      <p v-if="!letterBox.view.sent.length && !letterBox.view.outbox.length" class="box-empty">{{ t.emptyReplies }}</p>
      <ul v-else-if="letterBox.view.sent.length" class="reply-list">
        <li v-for="sent in letterBox.view.sent" :key="sent.reply_id" class="reply-row">
          <span class="reply-version">{{ t.letterHead(sent.letter_version) }} · {{ t.sentOn(day(sent.sent_at)) }}</span>
          <p class="reply-text">{{ sent.text || t.alsoAttached(sent.also_hit.length) }}</p>
          <p v-if="receiptLine(sent.reply_id).length" class="reply-receipt">{{ receiptLine(sent.reply_id).join(' · ') }}</p>
        </li>
      </ul>
    </section>

    <section v-else class="box-section">
      <p class="stamp-count">{{ t.stampCount(versions.length) }}</p>
      <div v-if="versions.length" class="stamp-album">
        <figure v-for="(v, i) in versions" :key="v" class="album-slot">
          <PostageStamp :version="v" :width="86" :tilt="(i % 3 - 1) * 2.5" />
          <figcaption>{{ v }}</figcaption>
        </figure>
      </div>
      <p v-else class="box-empty">{{ t.emptyLetters }}</p>
    </section>

    <LetterEnvelope v-if="reading" :versions="[reading.version]" :current="reading.version" :notes="reading.notes" opened :origin="reading.origin" @done="reading = null" />
  </section>
</template>

<style scoped>
.box-section { display: grid; gap: 14px; margin-top: 18px; }
.box-empty { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
.box-heading { margin: 0; color: var(--muted); font-size: var(--fs-2xs); font-weight: 400; letter-spacing: .06em; }
.letter-list, .reply-list { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }
.letter-row { display: flex; align-items: center; gap: 16px; padding: 14px 16px; border: 1px solid var(--mat-line); border-radius: var(--radius-md); background: var(--mat-card); }
.letter-main { display: grid; flex: 1; gap: 4px; min-width: 0; }
.letter-title { font-weight: 700; font-size: var(--fs-sm); }
.letter-preview { overflow: hidden; color: var(--muted); font-size: var(--fs-xs); text-overflow: ellipsis; white-space: nowrap; }
.reply-row { display: grid; gap: 6px; padding: 14px 16px; border: 1px solid var(--mat-line); border-radius: var(--radius-md); background: var(--mat-card); }
.reply-row.is-pending { border-style: dashed; }
.reply-version { color: var(--muted); font-size: var(--fs-2xs); }
.reply-text { margin: 0; font-size: var(--fs-xs); line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere; }
.reply-receipt { margin: 0; color: var(--accent); font-size: var(--fs-2xs); }
.stamp-count { margin: 0; color: var(--muted); font-size: var(--fs-xs); }
.stamp-album { display: grid; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); gap: 22px 14px; padding: 22px; border-radius: var(--radius-lg); background: var(--mat-inset); box-shadow: var(--mat-inset-shadow); }
.album-slot { display: grid; justify-items: center; gap: 8px; margin: 0; }
.album-slot figcaption { color: var(--muted); font: 400 var(--fs-2xs)/1 var(--font-mono); }
@media (max-width: 600px) { .letter-row { flex-wrap: wrap; } }
</style>
