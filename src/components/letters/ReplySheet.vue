<script setup lang="ts">
/**
 * 回信那张信纸（批次 6 拍板：只要一个文字框，不要快捷选项，不收附件；上限 1000 字，可以不写）。
 * 直接写在信纸的横线上（框固定 7 行高、纸不滚动，字永远压在线上）；草稿由外面自动存本机；「允许匿名引用」默认不勾。
 * 底下只留这一个勾选（2026-10-21 用户：小字太多）——计数、引用说明、隐私说明都不写；字数到上限时框自己停住。
 * 回信用蓝墨水写（和来信的黑墨分开，2026-10-21 用户）；框没有边、没有焦点竖条；勾选框、计数、说明、「寄出」都是整行、压在线上。
 * 寄出（或进了离线待寄箱）的那一刻（2026-10-29 用户：以前只是卡一下、变灰）：写好的那页往里折、压扁成一条，
 * 折痕中间撑开成一只纸飞机，先往下一沉、再顺着弧线飞出窗口右上角（lib/letters/paperPlane.ts）；
 * 飞机飞远了，那页再淡淡地回来（变浅），表示已经寄走、不能改了。
 */
import { computed, ref, watch } from 'vue';
import { lessMotion } from '../../lib/motion/lessMotion';
import { flyPaperPlane } from '../../lib/letters/paperPlane';
import { playPaperSlide } from '../../lib/letters/sound';
import { LETTER_REPLY_MAX, type ReplyDraft } from '../../services/letterBox';
import { useLetterText } from './letters.i18n';

export type ReplyState = 'idle' | 'sending' | 'sent' | 'queued' | 'error';

const props = defineProps<{ draft: ReplyDraft; state: ReplyState; error?: string }>();
const emit = defineEmits<{ (event: 'update:draft', draft: ReplyDraft): void; (event: 'send'): void }>();
const t = useLetterText();

const canSend = computed(() => props.state !== 'sending' && props.state !== 'sent' && props.state !== 'queued'
  && props.draft.text.trim().length > 0);
const update = (patch: Partial<ReplyDraft>) => emit('update:draft', { ...props.draft, ...patch });
/* 只在「寄出中 → 寄出 / 待寄」那一下飞，重读一封已经回过的信不飞。只动 transform / opacity。 */
const written = ref<HTMLElement | null>(null);
watch(() => props.state, async (next, previous) => {
  const page = written.value;
  if (!page || previous !== 'sending' || (next !== 'sent' && next !== 'queued') || lessMotion()) return;
  const rect = page.getBoundingClientRect();
  /* ① 往里折、压扁成一条（停在压扁的样子，飞机接手）。 */
  const fold = page.animate([
    { transform: 'perspective(900px) rotateX(0deg) scale(1)', opacity: 1 },
    { transform: 'perspective(900px) rotateX(64deg) scale(.82, .45)', opacity: 1, offset: 0.6 },
    { transform: 'perspective(900px) rotateX(86deg) scale(.6, .06)', opacity: 0 },
  ], { duration: 340, easing: 'cubic-bezier(.5, 0, .6, 1)', fill: 'forwards' });
  await fold.finished.catch(() => undefined);
  playPaperSlide();
  /* ②③ 折成纸飞机飞走；飞到一半，那页淡淡地回来。 */
  const flight = flyPaperPlane(rect);
  window.setTimeout(() => {
    if (!page.isConnected) return;
    page.animate([{ opacity: 0 }, { opacity: 0.6 }], { duration: 520, easing: 'ease-out' });
    fold.cancel();
  }, 900);
  await flight;
});
/* 框里往下走时只停在整行上，字不会落到两条横线中间（滚轮一下滚的不是整行）。 */
const snap = (event: Event) => {
  const el = event.target as HTMLTextAreaElement;
  const line = parseFloat(getComputedStyle(el).lineHeight) || 34;
  const top = Math.round(el.scrollTop / line) * line;
  if (Math.abs(top - el.scrollTop) > 0.5) el.scrollTop = top;
};
const input = (event: Event) => update({ text: Array.from((event.target as HTMLTextAreaElement).value).slice(0, LETTER_REPLY_MAX).join('') });
</script>

<template>
  <div class="reply-sheet">
    <label class="reply-label" for="letter-reply-text">{{ t.replyTitle }}</label>
    <div ref="written" :class="['written', { sealed: state === 'sent' || state === 'queued' }]">
    <textarea id="letter-reply-text" class="reply-text" :value="draft.text" :placeholder="t.replyPlaceholder"
      :maxlength="LETTER_REPLY_MAX" :readonly="state === 'sending' || state === 'sent' || state === 'queued'" rows="7" @input="input" @scroll="snap"></textarea>
    <footer class="reply-foot">
      <label class="quote">
        <input class="quote-input" type="checkbox" :checked="draft.allowQuote" :disabled="state === 'sent' || state === 'queued'" @change="update({ allowQuote: ($event.target as HTMLInputElement).checked })" />
        <span class="quote-box" aria-hidden="true"><svg viewBox="0 0 12 12"><path d="M2.5 6.4l2.3 2.3 4.7-5" /></svg></span>
        <span>{{ t.allowQuote }}</span>
      </label>
      <button type="button" class="send" :disabled="!canSend" @click="emit('send')">
        {{ state === 'sending' ? t.sending : t.send }}<span aria-hidden="true"> →</span>
      </button>
    </footer>
    </div>
    <p v-if="state === 'sent'" class="reply-status ok" role="status">{{ t.sent }}</p>
    <p v-else-if="state === 'queued'" class="reply-status" role="status">{{ t.queued }}</p>
    <p v-else-if="state === 'error' && error" class="reply-status bad" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
/* 每一行都是 --paper-line 的整数倍，字和控件都落在 paper-lines 的横线上。回信的字用蓝墨水。 */
.reply-sheet { --reply-ink: #24467e; }
.reply-label { display: block; font: 700 var(--paper-size) / var(--paper-line) var(--paper-font); }
/* 信纸只有一页、不滚动（2026-10-21 用户）：框固定 7 行高，写多了只在框里往下走，不出滚动条。 */
.reply-text {
  display: block; width: 100%; height: calc(var(--paper-line) * 7); margin: 0; padding: 0; border: 0; border-radius: 0; outline: none; box-shadow: none; resize: none;
  overflow-y: auto; scrollbar-width: none; background: transparent; color: var(--reply-ink);
  font: 400 var(--paper-size) / var(--paper-line) var(--paper-font); caret-color: var(--reply-ink);
}
.written { transform-origin: 50% 0; }
.written.sealed { opacity: .6; }
.reply-text::-webkit-scrollbar { display: none; }
.reply-text::placeholder { color: var(--paper-muted); opacity: .75; }
/* 勾选框是画在纸上的小方格（不用系统的黑框），勾上了是一笔蓝墨水的对勾。 */
.quote { display: flex; align-items: center; gap: 9px; min-width: 0; color: var(--paper-ink); font: 400 var(--fs-xs) / var(--paper-line) var(--font-sans); cursor: pointer; }
.quote-input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.quote-box { display: grid; place-items: center; flex: none; width: 15px; height: 15px; border: 1.5px solid var(--paper-muted); border-radius: 3px; }
.quote-box svg { width: 12px; height: 12px; fill: none; stroke: var(--reply-ink); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; opacity: 0; transition: opacity 140ms ease; }
.quote-input:checked + .quote-box { border-color: var(--reply-ink); }
.quote-input:checked + .quote-box svg { opacity: 1; }
.quote-input:focus-visible + .quote-box { outline: 2px solid var(--focus); outline-offset: 2px; }
.quote-input:disabled + .quote-box { opacity: .5; }
.reply-foot { display: flex; align-items: center; justify-content: space-between; gap: 16px; height: var(--paper-line); margin-top: var(--paper-line); }
/* 「寄出」是一行蓝墨水写的字，不是压线的大按钮。 */
.send {
  flex: none; height: var(--paper-line); padding: 0 2px; border: 0; background: none; cursor: pointer;
  color: var(--reply-ink); font: 600 var(--paper-size) / var(--paper-line) var(--paper-font);
  transition: translate 160ms ease, opacity 160ms ease;
}
.send:hover:not(:disabled) { translate: 3px 0; }
.send:disabled { color: var(--paper-muted); opacity: .6; cursor: default; }
.send:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: 3px; }
.reply-status { margin: 0; font: 400 var(--fs-xs) / var(--paper-line) var(--font-sans); color: var(--paper-muted); }
.reply-status.ok { color: var(--reply-ink); }
.reply-status.bad { color: var(--danger); }
</style>
