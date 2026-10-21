<script setup lang="ts">
/**
 * 回信那张信纸（批次 6 拍板：只要一个文字框，不要快捷选项，不收附件；上限 1000 字，可以不写）。
 * 横线信纸样式；草稿由外面自动存本机；「允许匿名引用」默认不勾。
 * 寄出（或进了离线待寄箱）的那一刻，写好的那页对折、往右上角飞走，再淡淡地回来，表示已经封好不能改了。
 */
import { computed, ref, watch } from 'vue';
import { lessMotion } from '../../lib/motion/lessMotion';
import { LETTER_REPLY_MAX, type ReplyDraft } from '../../services/letterBox';
import { useLetterText } from './letters.i18n';

export type ReplyState = 'idle' | 'sending' | 'sent' | 'queued' | 'error';

const props = defineProps<{ head: string; draft: ReplyDraft; state: ReplyState; error?: string }>();
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
  <article class="reply-sheet paper">
    <span class="sheet-kicker">{{ head }}</span>
    <label class="reply-label" for="letter-reply-text">{{ t.replyTitle }}</label>
    <div ref="written" :class="['written', { sealed: state === 'sent' || state === 'queued' }]">
    <textarea id="letter-reply-text" class="reply-text" :value="draft.text" :placeholder="t.replyPlaceholder"
      :maxlength="LETTER_REPLY_MAX" :readonly="state === 'sending' || state === 'sent' || state === 'queued'" rows="7" @input="input"></textarea>
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
  </article>
</template>

<style scoped>
.sheet-kicker { display: block; margin-bottom: 12px; color: var(--paper-muted); font: 400 var(--fs-2xs)/1.4 var(--font-sans); letter-spacing: .14em; text-transform: uppercase; }
.reply-label { display: block; margin-bottom: 6px; font: 700 var(--fs-md)/1.4 var(--paper-font); }
/* 横线信纸：行高 30px，背景每 30px 一条细线，字正好压在线上。 */
.reply-text {
  display: block; width: 100%; min-height: 210px; padding: 0 2px; border: 0; outline: none; resize: none;
  background: repeating-linear-gradient(to bottom, transparent 0 29px, var(--paper-rule) 29px 30px);
  background-attachment: local; color: var(--paper-ink); font: 400 var(--fs-sm)/30px var(--paper-font); caret-color: var(--paper-rubric);
}
.written { transform-origin: 50% 0; }
.written.sealed { opacity: .6; }
.reply-text::placeholder { color: var(--paper-muted); opacity: .8; }
.reply-text:focus-visible { box-shadow: 0 2px 0 -1px var(--focus); }
.reply-meta { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-top: 10px; }
.quote { display: flex; gap: 8px; align-items: flex-start; font: 400 var(--fs-xs)/1.5 var(--font-sans); cursor: pointer; }
.quote input { margin-top: 3px; accent-color: var(--accent); }
.quote small { display: block; color: var(--paper-muted); font-size: var(--fs-2xs); }
.counter { flex: none; color: var(--paper-muted); font: 400 var(--fs-2xs)/1.6 var(--font-mono); }
.counter.full { color: var(--paper-rubric); }
.attached { margin: 8px 0 0; color: var(--paper-muted); font: 400 var(--fs-2xs)/1.5 var(--font-sans); }
.reply-foot { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-top: 16px; }
.privacy { margin: 0; color: var(--paper-muted); font: 400 var(--fs-2xs)/1.5 var(--font-sans); }
.send { flex: none; min-width: 96px; }
.reply-status { margin: 10px 0 0; font: 400 var(--fs-xs)/1.5 var(--font-sans); color: var(--paper-muted); }
.reply-status.ok { color: var(--accent); }
.reply-status.bad { color: var(--danger); }
</style>
