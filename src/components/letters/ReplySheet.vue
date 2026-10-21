<script setup lang="ts">
/**
 * 回信那张信纸（批次 6 拍板：只要一个文字框，不要快捷选项，不收附件；上限 1000 字，可以不写）。
 * 直接写在信纸的横线上（框随字长高，纸滚动，字永远压在线上）；草稿由外面自动存本机；「允许匿名引用」默认不勾。
 * 寄出（或进了离线待寄箱）的那一刻，写好的那页对折、往右上角飞走，再淡淡地回来，表示已经封好不能改了。
 */
import { computed, ref, watch } from 'vue';
import { lessMotion } from '../../lib/motion/lessMotion';
import { LETTER_REPLY_MAX, type ReplyDraft } from '../../services/letterBox';
import { useLetterText } from './letters.i18n';

export type ReplyState = 'idle' | 'sending' | 'sent' | 'queued' | 'error';

const props = defineProps<{ draft: ReplyDraft; state: ReplyState; error?: string }>();
const emit = defineEmits<{ (event: 'update:draft', draft: ReplyDraft): void; (event: 'send'): void }>();
const t = useLetterText();

const count = computed(() => Array.from(props.draft.text).length);
const canSend = computed(() => props.state !== 'sending' && props.state !== 'sent' && props.state !== 'queued'
  && (props.draft.text.trim().length > 0 || props.draft.alsoHit.length > 0));
const update = (patch: Partial<ReplyDraft>) => emit('update:draft', { ...props.draft, ...patch });
/* 只在「寄出中 → 寄出 / 待寄」那一下飞，重读一封已经回过的信不飞。只动 transform / opacity。 */
const written = ref<HTMLElement | null>(null);
watch(() => props.state, (next, previous) => {
  const page = written.value;
  if (!page || previous !== 'sending' || (next !== 'sent' && next !== 'queued') || lessMotion()) return;
  const fly = page.animate([
    { transform: 'perspective(900px) rotateX(0deg) scale(1)', opacity: 1 },
    { transform: 'perspective(900px) rotateX(72deg) scale(.9, .5)', opacity: 1, offset: 0.38 },
    { transform: 'perspective(900px) translate(46%, -150%) rotateX(72deg) rotate(-10deg) scale(.18, .1)', opacity: 0 },
  ], { duration: 820, easing: 'cubic-bezier(.45, .05, .55, .95)', fill: 'forwards' });
  /* 停在飞走的终点，回来的淡入接上以后再撤掉它：中间不露一帧原样。 */
  void fly.finished.then(() => {
    page.animate([{ opacity: 0 }, { opacity: 0.6 }], { duration: 420, easing: 'ease-out' });
    fly.cancel();
  }, () => {});
});
const input = (event: Event) => update({ text: Array.from((event.target as HTMLTextAreaElement).value).slice(0, LETTER_REPLY_MAX).join('') });
</script>

<template>
  <div class="reply-sheet">
    <label class="reply-label" for="letter-reply-text">{{ t.replyTitle }}</label>
    <div ref="written" :class="['written', { sealed: state === 'sent' || state === 'queued' }]">
    <textarea id="letter-reply-text" class="reply-text" :value="draft.text" :placeholder="t.replyPlaceholder"
      :maxlength="LETTER_REPLY_MAX" :readonly="state === 'sending' || state === 'sent' || state === 'queued'" rows="6" @input="input"></textarea>
    <div class="reply-meta">
      <label class="quote">
        <input type="checkbox" :checked="draft.allowQuote" :disabled="state === 'sent' || state === 'queued'" @change="update({ allowQuote: ($event.target as HTMLInputElement).checked })" />
        <span>{{ t.allowQuote }}<small>{{ t.allowQuoteHint }}</small></span>
      </label>
      <span :class="['counter', { full: count >= LETTER_REPLY_MAX }]">{{ t.counter(count, LETTER_REPLY_MAX) }}</span>
    </div>
    </div>
    <p v-if="draft.alsoHit.length" class="attached">{{ t.alsoAttached(draft.alsoHit.length) }}</p>
    <footer class="reply-foot">
      <p class="privacy">{{ t.privacy }}</p>
      <button type="button" class="button primary send" :disabled="!canSend" @click="emit('send')">
        {{ state === 'sending' ? t.sending : t.send }}
      </button>
    </footer>
    <p v-if="state === 'sent'" class="reply-status ok" role="status">{{ t.sent }}</p>
    <p v-else-if="state === 'queued'" class="reply-status" role="status">{{ t.queued }}</p>
    <p v-else-if="state === 'error' && error" class="reply-status bad" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
/* 每一行都是 --paper-line 的整数倍，字和控件都落在 paper-lines 的横线上。 */
.reply-label { display: block; font: 700 var(--paper-size) / var(--paper-line) var(--paper-font); }
.reply-text {
  display: block; width: 100%; min-height: calc(var(--paper-line) * 6); padding: 0; border: 0; outline: none; resize: none; overflow: hidden;
  field-sizing: content; background: transparent; color: var(--paper-ink); font: 400 var(--paper-size) / var(--paper-line) var(--paper-font); caret-color: var(--paper-rubric);
}
.written { transform-origin: 50% 0; }
.written.sealed { opacity: .6; }
.reply-text::placeholder { color: var(--paper-muted); opacity: .8; }
.reply-text:focus-visible { box-shadow: inset 2px 0 0 var(--focus); }
.reply-meta { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-top: var(--paper-line); }
/* 勾选框那行和底下的说明各占整行（说明折行也是一行一行压在线上），框和第一行的字对齐。 */
.quote { display: flex; gap: 8px; align-items: flex-start; font: 400 var(--fs-xs) / var(--paper-line) var(--font-sans); cursor: pointer; }
.quote input { flex: none; margin: calc(var(--paper-line) / 2 - 5px) 0 0; accent-color: var(--accent); }
.quote small { display: block; color: var(--paper-muted); font-size: var(--fs-2xs); line-height: var(--paper-line); }
.counter { flex: none; color: var(--paper-muted); font: 400 var(--fs-2xs) / var(--paper-line) var(--font-mono); }
.counter.full { color: var(--paper-rubric); }
.attached { margin: 0; color: var(--paper-muted); font: 400 var(--fs-2xs) / var(--paper-line) var(--font-sans); }
.reply-foot { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; margin-top: var(--paper-line); }
.privacy { margin: 0; color: var(--paper-muted); font: 400 var(--fs-2xs) / var(--paper-line) var(--font-sans); }
/* 按钮占两行高的中间，压过一条线没关系（它是实心的），字不压线。 */
.send { flex: none; min-width: 96px; margin-top: calc(var(--paper-line) - 21px); }
.reply-status { margin: 0; font: 400 var(--fs-xs) / var(--paper-line) var(--font-sans); color: var(--paper-muted); }
.reply-status.ok { color: var(--accent); }
.reply-status.bad { color: var(--danger); }
</style>
