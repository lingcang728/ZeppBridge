<script setup lang="ts">
/**
 * 信匣（批次 6；2026-10-21 照用户喜欢的写信应用重做）：来信是一排真信封横着摆（正面，只贴邮票；
 * 顶上原来的信箱和一行小字被用户删了，取信在进页面时自动做）；集邮册每版一枚。
 * 我的回信（2026-10-29 用户：以前像一张被截断的纸）：一只只寄出去的信封——蓝墨水写「致：ZeppBridge 开发者」，
 * 贴回的那一版的邮票，盖寄出那天的邮戳；作者处理过的，处理结果像一枚红章盖在信封右下。点开和来信同一套：
 * 翻面、拆火漆、抽出自己写的那封。还没寄出去的（离线待寄）没有邮戳。
 * 批次 7 的每周数据来信、时间胶囊、那年今天收在「你的信」（DataLetters.vue）。
 */
import '../components/letters/paper.css';
import '../components/letters/letterRail.css';
import { computed, onMounted, ref, watch } from 'vue';
import PageHeader from '../components/PageHeader.vue';
import SegmentTrack from '../components/SegmentTrack.vue';
import PostageStamp from '../components/letters/PostageStamp.vue';
import EnvelopeTile from '../components/letters/EnvelopeTile.vue';
import LetterEnvelope from '../components/letters/LetterEnvelope.vue';
import DataLetters from '../components/letters/DataLetters.vue';
import { useDataLetterText } from '../components/letters/dataLetters.i18n';
import { useLetterText } from '../components/letters/letters.i18n';
import { echoTitles, letterVersions } from '../services/letters';
import { letterBox, loadLetterBox, repliedTo, syncLetterBox } from '../services/letterBox';
import { BUNDLED_VERSION, groupRows, loadBundledNotes, releaseRows, type NoteGroup } from '../services/updateNotice';
import { displayDateTimeFormatter } from '../lib/dateTime';
import { dayKey } from '../lib/aiTask/bridgeScale';
import { locale } from '../i18n';
import type { CustomLetter } from '../composables/useLetterEnvelope';
import type { LetterReceipt, PendingLetterReply, SentLetterReply } from '../types/letters';

type Tab = 'letters' | 'mine' | 'replies' | 'stamps';
const t = useLetterText();
const dataText = useDataLetterText();
const tab = ref<Tab>('letters');
const tabs = computed(() => [
  { value: 'letters' as const, label: t.value.tabLetters },
  { value: 'mine' as const, label: dataText.value.tab },
  { value: 'replies' as const, label: t.value.tabReplies },
  { value: 'stamps' as const, label: t.value.tabStamps },
]);

const versions = computed(() => letterVersions());
const titles = ref(new Map<string, string>());
watch(locale, async (language) => { titles.value = await echoTitles(language); }, { immediate: true });

const syncing = ref(false);
onMounted(async () => {
  await loadLetterBox();
  syncing.value = true;
  await syncLetterBox();
  syncing.value = false;
});
const retry = async () => { syncing.value = true; await syncLetterBox(); syncing.value = false; };

const day = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : displayDateTimeFormatter({ year: 'numeric', month: 'short', day: 'numeric' }).format(date);
};
const receiptFor = (replyId: string): LetterReceipt | undefined => letterBox.view.receipts.find((r) => r.replyId === replyId);
/** 回执只说处理结果（红章）：大字是「下版先修」，底下一行小字「归入『补拉卡住』」；没处理过就不盖（2026-10-29 用户：不要已读 / 未读）。 */
const verdict = (replyId: string): { status: string; filed: string } | null => {
  const receipt = receiptFor(replyId);
  if (!receipt) return null;
  const title = receipt.category ? titles.value.get(receipt.category) : undefined;
  const status = receipt.status === 'next' ? t.value.statusNext : receipt.status === 'later' ? t.value.statusLater
    : receipt.status === 'asking' ? t.value.statusAsking : receipt.status === 'fixed' ? t.value.statusFixed(receipt.fixedIn)
      : receipt.status === 'declined' ? t.value.statusDeclined : '';
  const filed = title ? t.value.filedUnder(title) : '';
  return status || filed ? { status: status || filed, filed: status ? filed : '' } : null;
};

/* 重读自己寄出的一封：同一只信封，正面是自己的笔迹和邮戳。 */
type Mine = { custom: CustomLetter; version: string; reply: SentLetterReply | PendingLetterReply; sentAt: string | null; origin: HTMLElement };
const mine = ref<Mine | null>(null);
const postmarkOf = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : dayKey(date);
};
const readMine = (reply: SentLetterReply | PendingLetterReply, event: MouseEvent) => {
  const sentAt = 'sent_at' in reply ? reply.sent_at : null;
  mine.value = {
    custom: {
      title: t.value.letterHead(reply.letter_version), to: t.value.toDeveloper, stamp: '', mine: true,
      postmark: sentAt ? postmarkOf(sentAt) : '', sheets: [{ id: 'mine', label: t.value.tabReplies }],
    },
    version: reply.letter_version, reply, sentAt, origin: event.currentTarget as HTMLElement,
  };
};
const mineVerdict = computed(() => (mine.value && 'reply_id' in mine.value.reply ? verdict(mine.value.reply.reply_id) : null));

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

    <!-- 换分栏：旧的淡出、淡完新的淡入，不位移（2026-10-29 用户：以前是硬切）。 -->
    <Transition name="box-swap" mode="out-in">
    <section v-if="tab === 'letters'" key="letters" class="box-section">
      <p v-if="!versions.length" class="box-empty">{{ t.emptyLetters }}</p>
      <ul v-else class="letter-rail">
        <li v-for="(v, i) in versions" :key="v" class="letter-rail-item">
          <EnvelopeTile :label="t.rereadAria(v)" :version="v" :to="t.to" :tilt="(i % 3 - 1) * 0.8" @open="reread(v, $event)">
            <span v-if="repliedTo(v)" class="replied">{{ t.replied }}</span>
          </EnvelopeTile>
          <p class="letter-rail-caption">{{ t.letterHead(v) }}</p>
        </li>
      </ul>
    </section>

    <section v-else-if="tab === 'mine'" key="mine" class="box-section">
      <DataLetters />
    </section>

    <section v-else-if="tab === 'replies'" key="replies" class="box-section" :aria-busy="syncing">
      <p v-if="!letterBox.view.sent.length && !letterBox.view.outbox.length" class="box-empty">{{ t.emptyReplies }}</p>
      <ul v-else class="letter-rail">
        <li v-for="(pending, i) in letterBox.view.outbox" :key="pending.local_id" class="letter-rail-item">
          <EnvelopeTile :label="`${t.letterHead(pending.letter_version)} · ${t.outbox}`" :version="pending.letter_version" :to="t.toDeveloper" mine
            :tilt="(i % 3 - 1) * 0.8" @open="readMine(pending, $event)" />
          <p class="letter-rail-caption is-muted">{{ t.outbox }}</p>
        </li>
        <li v-for="(sent, i) in letterBox.view.sent" :key="sent.reply_id" class="letter-rail-item">
          <EnvelopeTile :label="`${t.letterHead(sent.letter_version)} · ${t.sentOn(day(sent.sent_at))}`" :version="sent.letter_version" :to="t.toDeveloper" mine
            :postmark="postmarkOf(sent.sent_at)" :tilt="((i + letterBox.view.outbox.length) % 3 - 1) * 0.8" @open="readMine(sent, $event)">
            <span v-if="verdict(sent.reply_id)" class="verdict">
              <b>{{ verdict(sent.reply_id)!.status }}</b><small v-if="verdict(sent.reply_id)!.filed">{{ verdict(sent.reply_id)!.filed }}</small>
            </span>
          </EnvelopeTile>
          <p class="letter-rail-caption">{{ t.sentOn(day(sent.sent_at)) }}</p>
        </li>
      </ul>
      <button v-if="letterBox.view.outbox.length" type="button" class="button secondary" :disabled="syncing" @click="retry">{{ t.outboxRetry }}</button>
    </section>

    <section v-else key="stamps" class="box-section">
      <p class="stamp-count">{{ t.stampCount(versions.length) }}</p>
      <div v-if="versions.length" class="stamp-album">
        <figure v-for="(v, i) in versions" :key="v" class="album-slot">
          <PostageStamp :version="v" :width="128" :tilt="(i % 3 - 1) * 2.5" />
          <figcaption>{{ v }}</figcaption>
        </figure>
      </div>
      <p v-else class="box-empty">{{ t.emptyLetters }}</p>
    </section>
    </Transition>

    <LetterEnvelope v-if="reading" :versions="[reading.version]" :current="reading.version" :notes="reading.notes" :origin="reading.origin" @done="reading = null" />
    <LetterEnvelope v-if="mine" :versions="[]" :current="mine.version" :custom="mine.custom" :origin="mine.origin" @done="mine = null">
      <template #sheet>
        <div class="mine-sheet">
          <p class="mine-text no-indent">{{ mine.reply.text || t.alsoAttached(mine.reply.also_hit.length) }}</p>
          <p v-if="mine.reply.text && mine.reply.also_hit.length" class="mine-also no-indent">{{ t.alsoAttached(mine.reply.also_hit.length) }}</p>
          <p class="mine-date no-indent">{{ mine.sentAt ? t.sentOn(day(mine.sentAt)) : t.outbox }}</p>
          <span v-if="mineVerdict" class="verdict on-paper"><b>{{ mineVerdict.status }}</b><small v-if="mineVerdict.filed">{{ mineVerdict.filed }}</small></span>
        </div>
      </template>
    </LetterEnvelope>
  </section>
</template>

<style scoped>
.box-section { display: grid; gap: 14px; margin-top: 14px; }
.box-empty { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
.box-section > .button { justify-self: start; }

/* 换分栏只淡入淡出：旧的快快淡掉，新的慢一点浮现。 */
.box-swap-leave-active { transition: opacity 150ms ease-in; }
.box-swap-enter-active { transition: opacity 280ms ease-out; }
.box-swap-enter-from, .box-swap-leave-to { opacity: 0; }

.replied {
  position: absolute; right: 14px; bottom: 14px; z-index: 8; padding: 2px 9px; border: 1.5px solid rgb(150 46 40 / .7); border-radius: 3px;
  color: rgb(150 46 40 / .85); font: 700 var(--fs-2xs)/1.4 var(--font-sans); letter-spacing: .1em; rotate: -8deg; mix-blend-mode: multiply;
}

/* 处理结果：一枚红色的橡皮章，双线框，大字是结果、小字是归到哪一类；盖在信封右下，歪一点。 */
.verdict {
  position: absolute; right: 16px; bottom: 16px; z-index: 8; display: grid; justify-items: center; gap: 1px; max-width: 150px; padding: 4px 10px 5px;
  border: 2px solid rgb(168 44 36 / .78); border-radius: 4px; outline: 1px solid rgb(168 44 36 / .5); outline-offset: 2px;
  color: rgb(168 44 36 / .9); rotate: -7deg; pointer-events: none; text-align: center;
}
.verdict b { font: 800 var(--fs-sm)/1.25 var(--font-sans); letter-spacing: .12em; }
.verdict small { overflow: hidden; max-width: 100%; font: 600 10px/1.3 var(--font-sans); letter-spacing: .04em; white-space: nowrap; text-overflow: ellipsis; }
/* 信纸上：自己写的蓝墨水，末尾落日期；红章盖在最后。 */
.mine-sheet { color: #24467e; }
.mine-text, .mine-also { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.mine-also { color: var(--paper-muted); }
.mine-date { margin: var(--paper-line) 0 0; color: var(--paper-muted); text-align: right; }
.verdict.on-paper { position: relative; right: auto; bottom: auto; width: max-content; max-width: 100%; margin: 6px 0 0 auto; break-inside: avoid; }
.verdict.on-paper small { white-space: normal; }

.stamp-count { margin: 0; color: var(--muted); font-size: var(--fs-xs); }
.stamp-album { display: grid; grid-template-columns: repeat(auto-fill, minmax(156px, 1fr)); gap: 26px 14px; padding: 26px; border-radius: var(--radius-lg); background: var(--mat-inset); box-shadow: var(--mat-inset-shadow); }
.album-slot { display: grid; justify-items: center; gap: 8px; margin: 0; }
.album-slot figcaption { color: var(--muted); font: 400 var(--fs-2xs)/1 var(--font-mono); }

</style>
