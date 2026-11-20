<script setup lang="ts">
/**
 * 回信那张信纸：只要一个文字框，不要快捷选项；可以不写。
 * 直接写在信纸的横线上（框固定 7 行高、纸不滚动，字永远压在线上）；草稿由外面自动存本机；「允许匿名引用」默认不勾。
 * 底下只留这一个勾选，引用说明、隐私说明都不写；上限 5000 字，「寄出」旁边一直写着「已写 / 5000」。
 * 附图和写给作者的信纸一样，像照片一样用回形针夹在纸的右边（ClippedPhotos：飞过去、被夹住、荡两下），有图时字让出那一列。
 * 回信用蓝墨水写（和来信的黑墨分开，2026-10-21 用户）；框没有边、没有焦点竖条；勾选框、计数、说明、「寄出」都是整行、压在线上。
 * 寄出（或进了离线待寄箱）的那一刻：整张信纸从纸面上揭下来、往后一倾对折，收成机身，同一处接手成一只纸飞机，
 * 先往下一沉、再顺着弧线飞出窗口右上角（lib/letters/paperPlane.ts）；
 * 飞机飞远了，原处那页的字再淡淡地回来（变浅），表示已经寄走、不能改了。
 */
import { computed, ref, watch } from 'vue';
import { lessMotion } from '../../lib/motion/lessMotion';
import { foldIntoPlane } from '../../lib/letters/paperPlane';
import { playPaperSlide } from '../../lib/letters/sound';
import { LETTER_REPLY_MAX, tidyTextarea, type ReplyDraft } from '../../services/letterBox';
import CharCount from './CharCount.vue';
import type { ReplyImage } from '../../lib/letters/attachImage';
import { ATTACH_MAX, isImageFile } from '../../lib/letters/attachImage';
import AttachButton from './AttachButton.vue';
import ClippedPhotos from './ClippedPhotos.vue';
import { useLetterText } from './letters.i18n';

export type ReplyState = 'idle' | 'sending' | 'sent' | 'queued' | 'error';

const props = withDefaults(defineProps<{
  draft: ReplyDraft; state: ReplyState; error?: string;
  images?: ReplyImage[]; preparing?: boolean; attachFailed?: boolean;
}>(), { images: () => [], error: '' });
const emit = defineEmits<{
  (event: 'update:draft', draft: ReplyDraft): void; (event: 'send'): void;
  (event: 'attach', files: File[]): void; (event: 'detach', id: string): void;
}>();
const t = useLetterText();

const locked = computed(() => props.state === 'sending' || props.state === 'sent' || props.state === 'queued');
const canSend = computed(() => !locked.value && !props.preparing && props.draft.text.trim().length > 0);
/** 照片从哪里飞过去：点「附图」就是那行字，粘贴就是写字区。按下那一刻量（满 3 张时「附图」会消失）。 */
const launch = ref<DOMRect | null>(null);
const attachEl = ref<HTMLElement | null>(null);
const textEl = ref<HTMLTextAreaElement | null>(null);
const addFromButton = (files: File[]) => {
  launch.value = attachEl.value?.getBoundingClientRect() ?? null;
  emit('attach', files);
};
/* 截图直接 Ctrl+V 进信纸：剪贴板里有图就收成附图，文字照常粘贴。 */
const paste = (event: ClipboardEvent) => {
  const files = [...(event.clipboardData?.files ?? [])].filter(isImageFile);
  if (!files.length || locked.value) return;
  event.preventDefault();
  launch.value = textEl.value?.getBoundingClientRect() ?? null;
  emit('attach', files);
};
const update = (patch: Partial<ReplyDraft>) => emit('update:draft', { ...props.draft, ...patch });
/* 只在「寄出中 → 寄出 / 待寄」那一下飞，重读一封已经回过的信不飞。只动 transform / opacity。 */
const written = ref<HTMLElement | null>(null);
watch(() => props.state, (next, previous) => {
  const page = written.value;
  if (!page || previous !== 'sending' || (next !== 'sent' && next !== 'queued') || lessMotion()) return;
  /* 折的是整张信纸（这一页的 .leaf-paper），不是只折写字那一块；纸留在原处，字随后淡淡地回来。 */
  const sheet = page.closest<HTMLElement>('.leaf-paper') ?? page;
  playPaperSlide();
  void foldIntoPlane(sheet, { leaveBlank: true, returnAfter: 520 });
});
/* 框里往下走时只停在整行上，字不会落到两条横线中间（滚轮一下滚的不是整行）。 */
const snap = (event: Event) => {
  const el = event.target as HTMLTextAreaElement;
  const line = parseFloat(getComputedStyle(el).lineHeight) || 34;
  const top = Math.round(el.scrollTop / line) * line;
  if (Math.abs(top - el.scrollTop) > 0.5) el.scrollTop = top;
};
/* 边写边收（services/letterBox.ts 的 tidyReplyInput）：开头不留空行、连按回车只留一个空行、连着的空格收成一个。 */
const input = (event: Event) => update({ text: tidyTextarea(event.target as HTMLTextAreaElement) });
</script>

<template>
  <div class="reply-sheet">
    <label class="reply-label" for="letter-reply-text">{{ t.replyTitle }}</label>
    <div ref="written" :class="['written', { sealed: state === 'sent' || state === 'queued' }]">
    <textarea id="letter-reply-text" ref="textEl" :class="['reply-text', { 'beside-photos': images.length }]" :value="draft.text" :placeholder="t.replyPlaceholder"
      :maxlength="LETTER_REPLY_MAX" :readonly="state === 'sending' || state === 'sent' || state === 'queued'" rows="7" @input="input" @scroll="snap" @paste="paste"></textarea>
    <footer class="reply-foot">
      <label class="quote">
        <input class="quote-input" type="checkbox" :checked="draft.allowQuote" :disabled="state === 'sent' || state === 'queued'" @change="update({ allowQuote: ($event.target as HTMLInputElement).checked })" />
        <span class="quote-box" aria-hidden="true"><svg viewBox="0 0 12 12"><path d="M2.5 6.4l2.3 2.3 4.7-5" /></svg></span>
        <span>{{ t.allowQuote }}</span>
      </label>
      <span v-if="!locked && images.length < ATTACH_MAX" ref="attachEl" class="reply-attach"><AttachButton :count="images.length" :preparing="preparing" @add="addFromButton" /></span>
      <CharCount :text="draft.text" />
      <button type="button" class="send" :disabled="!canSend" @click="emit('send')">
        {{ state === 'sending' ? t.sending : t.send }}<span aria-hidden="true"> →</span>
      </button>
    </footer>
    </div>
    <p v-if="state === 'sent'" class="reply-status ok" role="status">{{ t.sent }}</p>
    <p v-else-if="state === 'queued'" class="reply-status" role="status">{{ t.queued }}</p>
    <p v-else-if="state === 'error' && error" class="reply-status bad" role="alert">{{ error }}</p>
    <p v-else-if="attachFailed" class="reply-status bad" role="alert">{{ t.attachFailed }}</p>
    <ClippedPhotos :class="{ sealed: state === 'sent' || state === 'queued' }" :images="images" :disabled="locked" :launch="launch" @remove="emit('detach', $event)" />
  </div>
</template>

<style scoped>
/* 每一行都是 --paper-line 的整数倍，字和控件都落在 paper-lines 的横线上。回信的字用蓝墨水。 */
.reply-sheet { --reply-ink: #24467e; --ink: var(--reply-ink); position: relative; }
.reply-label { display: block; font: 700 var(--paper-size) / var(--paper-line) var(--paper-font); }
/* 信纸只有一页、不滚动（2026-10-21 用户）：框固定 7 行高，写多了只在框里往下走，不出滚动条。 */
.reply-text {
  display: block; width: 100%; height: calc(var(--paper-line) * 7); margin: 0; padding: 0; border: 0; border-radius: 0; outline: none; box-shadow: none; resize: none;
  overflow-y: auto; scrollbar-width: none; background: transparent; color: var(--reply-ink);
  font: 400 var(--paper-size) / var(--paper-line) var(--paper-font); caret-color: var(--reply-ink);
}
.written { transform-origin: 50% 0; }
/* 有附图时字让出右边那一列（照片 92px + 间隔）；寄出后照片和字一起变浅。 */
.reply-text.beside-photos { padding-inline-end: 108px; box-sizing: border-box; }
.photos.sealed { opacity: .6; }
.written.sealed { opacity: .6; }
.reply-text::-webkit-scrollbar { display: none; }
.reply-text::placeholder { color: var(--paper-muted); opacity: .75; }
/* 勾选框是画在纸上的小方格（不用系统的黑框），勾上了是一笔蓝墨水的对勾。 */
.quote { display: flex; align-items: center; gap: 9px; min-width: 0; margin-inline-end: auto; white-space: nowrap; color: var(--paper-ink); font: 400 var(--fs-xs) / var(--paper-line) var(--font-sans); cursor: pointer; }
.quote-input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.quote-box { display: grid; place-items: center; flex: none; width: 15px; height: 15px; border: 1.5px solid var(--paper-muted); border-radius: 3px; }
.quote-box svg { width: 12px; height: 12px; fill: none; stroke: var(--reply-ink); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; opacity: 0; transition: opacity 140ms ease; }
.quote-input:checked + .quote-box { border-color: var(--reply-ink); }
.quote-input:checked + .quote-box svg { opacity: 1; }
.quote-input:focus-visible + .quote-box { outline: 2px solid var(--focus); outline-offset: 2px; }
.quote-input:disabled + .quote-box { opacity: .5; }
/* 底栏一行放不下（俄语的勾选说明很长）就折成两行：勾选独占第一行，附图 / 字数 / 寄出靠右挪到下一行；每行都正好一条横线高。 */
.reply-foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; column-gap: 16px; row-gap: 0; min-height: var(--paper-line); margin-top: var(--paper-line); }
/* 「寄出」是一行蓝墨水写的字，不是压线的大按钮。 */
.send {
  flex: none; height: var(--paper-line); padding: 0 2px; border: 0; background: none; cursor: pointer;
  color: var(--reply-ink); font: 600 var(--paper-size) / var(--paper-line) var(--paper-font);
  transition: translate 160ms ease, opacity 160ms ease;
}
.send:hover:not(:disabled) { translate: 3px 0; }
.send:disabled { color: var(--paper-muted); opacity: .6; cursor: default; }
.send:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: 3px; }
.reply-attach { display: inline-flex; }
.reply-status { margin: 0; font: 400 var(--fs-xs) / var(--paper-line) var(--font-sans); color: var(--paper-muted); }
.reply-status.ok { color: var(--reply-ink); }
.reply-status.bad { color: var(--danger); }
</style>
