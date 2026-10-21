<script setup lang="ts">
/**
 * 信匣（批次 6；2026-10-21 照用户喜欢的写信应用重做）：来信是一排真信封横着摆（正面，只贴邮票；
 * 顶上原来的信箱和一行小字被用户删了，取信在进页面时自动做）；自己的回信是一张张小信纸，回执盖在下面；集邮册每版一枚。
 * 批次 7 的每周数据来信、时间胶囊、那年今天以后也收在这里。
 */
import '../components/letters/paper.css';
import { computed, onMounted, ref, watch } from 'vue';
import PageHeader from '../components/PageHeader.vue';
import SegmentTrack from '../components/SegmentTrack.vue';
import PostageStamp from '../components/letters/PostageStamp.vue';
import EnvelopeArt from '../components/letters/EnvelopeArt.vue';
import LetterEnvelope from '../components/letters/LetterEnvelope.vue';
import { useLetterText } from '../components/letters/letters.i18n';
import { echoTitles, letterVersions, loadLetter } from '../services/letters';
import { letterBox, loadLetterBox, markReceiptsSeen, repliedTo, syncLetterBox } from '../services/letterBox';
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
    next.set(v, (paragraphs[leadParagraph(paragraphs)] ?? '').replace(/\*\*/g, ''));
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

/* 重读一封：和第一次收到一样从信封正面开始（翻面、拆火漆、抽信）——2026-10-21 用户：不小心关了信，想再看一遍开信。本版的信顺带当前打包的更新说明。 */
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
      <ul v-else class="envelope-rail">
        <li v-for="(v, i) in versions" :key="v" class="rail-item" :style="{ '--tilt': `${(i % 3 - 1) * 0.8}deg` }">
          <button type="button" class="rail-envelope" :aria-label="t.rereadAria(v)" @click="reread(v, $event)">
            <span class="rail-scale">
              <EnvelopeArt :version="v" face="front" :to="t.to" />
            </span>
            <span v-if="repliedTo(v)" class="replied">{{ t.replied }}</span>
          </button>
          <h2 class="rail-title">{{ t.letterHead(v) }}</h2>
          <p class="rail-preview">{{ previews.get(v) }}</p>
        </li>
      </ul>
    </section>

    <section v-else-if="tab === 'replies'" class="box-section" :aria-busy="syncing">
      <template v-if="letterBox.view.outbox.length">
        <h2 class="box-heading">{{ t.outbox }}</h2>
        <ul class="reply-list">
          <li v-for="pending in letterBox.view.outbox" :key="pending.local_id" class="reply-slip paper is-pending">
            <span class="slip-head">{{ t.letterHead(pending.letter_version) }}</span>
            <p class="slip-text paper-lines">{{ pending.text || t.alsoAttached(pending.also_hit.length) }}</p>
          </li>
        </ul>
        <button type="button" class="button secondary" :disabled="syncing" @click="retry">{{ t.outboxRetry }}</button>
      </template>
      <p v-if="!letterBox.view.sent.length && !letterBox.view.outbox.length" class="box-empty">{{ t.emptyReplies }}</p>
      <ul v-else-if="letterBox.view.sent.length" class="reply-list">
        <li v-for="sent in letterBox.view.sent" :key="sent.reply_id" class="reply-slip paper">
          <span class="slip-head">{{ t.letterHead(sent.letter_version) }} · {{ t.sentOn(day(sent.sent_at)) }}</span>
          <p class="slip-text paper-lines">{{ sent.text || t.alsoAttached(sent.also_hit.length) }}</p>
          <p v-if="receiptLine(sent.reply_id).length" class="slip-receipt">{{ receiptLine(sent.reply_id).join(' · ') }}</p>
        </li>
      </ul>
    </section>

    <section v-else class="box-section">
      <p class="stamp-count">{{ t.stampCount(versions.length) }}</p>
      <div v-if="versions.length" class="stamp-album">
        <figure v-for="(v, i) in versions" :key="v" class="album-slot">
          <PostageStamp :version="v" :width="128" :tilt="(i % 3 - 1) * 2.5" />
          <figcaption>{{ v }}</figcaption>
        </figure>
      </div>
      <p v-else class="box-empty">{{ t.emptyLetters }}</p>
    </section>

    <LetterEnvelope v-if="reading" :versions="[reading.version]" :current="reading.version" :notes="reading.notes" :origin="reading.origin" @done="reading = null" />
  </section>
</template>

<style scoped>
.box-section { display: grid; gap: 14px; margin-top: 14px; }
.box-empty { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
.box-section > .button { justify-self: start; }
.box-heading { margin: 0; color: var(--muted); font-size: var(--fs-2xs); font-weight: 400; letter-spacing: .06em; }

/* 来信：一排信封横着摆，按住拖或滚轮横滑，一封停一格。 */
.envelope-rail {
  display: grid; grid-auto-flow: column; grid-auto-columns: 300px; gap: 28px; margin: 0 -8px; padding: 18px 8px 22px; list-style: none;
  overflow-x: auto; scroll-snap-type: x mandatory; scroll-padding: 8px; scrollbar-width: thin; overscroll-behavior-x: contain;
}
.rail-item { display: grid; gap: 6px; min-width: 0; scroll-snap-align: start; }
.rail-envelope {
  position: relative; display: block; width: 300px; height: 188px; padding: 0; border: 0; background: none; cursor: pointer;
  transform: rotate(var(--tilt)); transition: transform 320ms cubic-bezier(.3, .7, .3, 1);
}
.rail-envelope:hover { transform: rotate(0deg) translateY(-6px); }
.rail-envelope:focus-visible { outline: 2px solid var(--focus); outline-offset: 6px; border-radius: 4px; }
/* 信封按 480 宽画（邮票、邮戳、火漆的比例和弹窗里一样），摆在这里缩小。 */
.rail-scale { display: block; width: 480px; transform: scale(.625); transform-origin: 0 0; }
.replied {
  position: absolute; right: 14px; bottom: 14px; z-index: 8; padding: 2px 9px; border: 1.5px solid rgb(150 46 40 / .7); border-radius: 3px;
  color: rgb(150 46 40 / .85); font: 700 var(--fs-2xs)/1.4 var(--font-sans); letter-spacing: .1em; rotate: -8deg; mix-blend-mode: multiply;
}
.rail-title { margin: 8px 0 0; font-size: var(--fs-sm); font-weight: 700; }
.rail-preview {
  display: -webkit-box; margin: 0; overflow: hidden; color: var(--muted); font-size: var(--fs-xs); line-height: 1.6;
  -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2;
}

/* 我的回信：一张张小信纸，回执像盖上去的一行字。 */
.reply-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 18px; margin: 0; padding: 0; list-style: none; }
.reply-slip { --paper-size: 15px; --paper-line: 28px; display: grid; align-content: start; padding: 14px 20px 16px; }
.reply-slip.is-pending { opacity: .78; }
.slip-head { color: var(--paper-muted); font: 400 var(--fs-2xs) / var(--paper-line) var(--font-sans); letter-spacing: .06em; }
.slip-text { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.slip-receipt { margin: 8px 0 0; color: var(--paper-rubric); font: 700 var(--fs-2xs)/1.6 var(--font-sans); letter-spacing: .04em; }

.stamp-count { margin: 0; color: var(--muted); font-size: var(--fs-xs); }
.stamp-album { display: grid; grid-template-columns: repeat(auto-fill, minmax(156px, 1fr)); gap: 26px 14px; padding: 26px; border-radius: var(--radius-lg); background: var(--mat-inset); box-shadow: var(--mat-inset-shadow); }
.album-slot { display: grid; justify-items: center; gap: 8px; margin: 0; }
.album-slot figcaption { color: var(--muted); font: 400 var(--fs-2xs)/1 var(--font-mono); }

@media (max-width: 600px) {
  .envelope-rail { grid-auto-columns: 260px; }
  .rail-envelope { width: 260px; height: 163px; }
  .rail-scale { transform: scale(.5417); }
}
@media (prefers-reduced-motion: reduce) { .rail-envelope { transition: none; } }
</style>
