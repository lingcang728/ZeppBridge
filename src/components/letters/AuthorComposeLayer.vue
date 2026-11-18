<script setup lang="ts">
/**
 * 写给作者的那张信纸（全局一份，挂在 AppShell）：
 * 从被点的控件（顶栏右上角信件圆钮、设置卡按钮、信匣写信卡）一镜到底直接展开成棉浆横线信纸，
 * 关闭或寄出后沿原曲线收拢回同一个控件（不经过信封背面停顿与二次拆封）。
 * 可以附一份脱敏诊断报告（先交报告拿编号，再随信寄出）。草稿存本机（键是 author）。
 */
import { nextTick, ref, watch } from 'vue';
import ModalDialog from '../ModalDialog.vue';
import AuthorCompose from './AuthorCompose.vue';
import './paper.css';
import { useLetterText } from './letters.i18n';
import { closeAuthorCompose, useAuthorCompose } from '../../composables/useAuthorCompose';
import { backend, toUserMessage } from '../../lib/bridge';
import { locale } from '../../i18n';
import { clearDraft, loadDraft, saveDraft, sendLetterReply } from '../../services/letterBox';
import { BUNDLED_VERSION } from '../../services/updateNotice';
import { whenDialogLanded } from '../../lib/motion/dialogFlight';
import { openLetterBoxSheet } from '../../composables/useLetterBoxSheet';
import Icon from '../Icon.vue';
import type { LetterSendResult } from '../../types/letters';

const t = useLetterText();
const { writing, attach, category, sent } = useAuthorCompose();

const AUTHOR_DRAFT = 'author';
const draft = ref(loadDraft(AUTHOR_DRAFT));
watch(draft, (value) => saveDraft(AUTHOR_DRAFT, value), { deep: true, flush: 'sync' });

const sheetEl = ref<HTMLElement | null>(null);
const composer = ref<InstanceType<typeof AuthorCompose> | null>(null);
const sending = ref(false);
const error = ref('');
const delivery = ref<LetterSendResult['status'] | null>(null);
const close = () => { if (!sending.value) closeAuthorCompose(); };

watch(writing, async (open) => {
  if (!open) return;
  error.value = '';
  await nextTick();
  const panel = sheetEl.value?.closest<HTMLElement>('[data-modal-dialog]');
  await whenDialogLanded(panel);
  if (writing.value === open && document.activeElement === panel) composer.value?.focusInput();
}, { immediate: true });

/* 信纸收回原处，信匣接着从同一个控件长出来（ModalDialog 的接力：前一张没收完就加速收完）。草稿留着。 */
const toLetterBox = () => {
  const origin = writing.value?.origin ?? null;
  closeAuthorCompose();
  void nextTick(() => openLetterBoxSheet(origin));
};

const send = async () => {
  if (sending.value) return;
  sending.value = true;
  error.value = '';
  const session = writing.value;
  const { localId, text } = draft.value;
  const sameDraft = () => writing.value === session && draft.value.localId === localId && draft.value.text === text;
  const sendLocale = locale.value;
  const reportCategory = category.value;
  let reportId: string | undefined;
  try {
    if (attach.value) {
      if (draft.value.report?.category === reportCategory) {
        reportId = draft.value.report.id;
      } else {
        try {
          reportId = (await backend.submitDiagnosticReport(undefined, reportCategory)).reportId;
        } catch {
          if (sameDraft()) {
            attach.value = false;
            error.value = t.value.reportFailedPlain;
          }
          return;
        }
        if (sameDraft()) draft.value.report = { id: reportId, category: reportCategory };
      }
    }
    if (!sameDraft()) return;
    const result = await sendLetterReply({
      localId, letterVersion: BUNDLED_VERSION, locale: sendLocale, text: text.trim(),
      allowQuote: false, alsoHit: [], ...(reportId ? { reportId } : {}),
    });
    if (!sameDraft()) return;
    clearDraft(AUTHOR_DRAFT);
    draft.value = loadDraft(AUTHOR_DRAFT);
    attach.value = false;
    delivery.value = result.status;
    sent.value += 1;
  } catch (cause) {
    if (sameDraft()) error.value = toUserMessage(cause, t.value.sendFailed);
  } finally {
    sending.value = false;
  }
};
</script>

<template>
  <ModalDialog
    v-if="writing"
    bare
    :max-width="640"
    labelledby="author-compose-title"
    :origin="writing.origin"
    @close="close"
  >
    <h2 id="author-compose-title" class="sr-only">{{ t.writeAuthor }}</h2>
    <article ref="sheetEl" class="compose-sheet paper" data-dialog-window>
      <div class="compose-inner" data-dialog-content>
        <div class="compose-body paper-lines">
          <p v-if="delivery" class="compose-delivery" role="status">{{ delivery === 'sent' ? t.sent : t.queued }}</p>
          <AuthorCompose
            v-else
            ref="composer"
            v-model:text="draft.text"
            v-model:attach="attach"
            v-model:category="category"
            :busy="sending"
            :error="error"
            @send="send"
          />
        </div>
        <footer class="compose-sheet-foot">
          <span class="compose-sheet-label">{{ t.writeAuthor }}</span>
          <button type="button" class="compose-to-box" :disabled="sending" @click="toLetterBox">
            <Icon name="mail" :size="14" />{{ t.boxTitle }}
          </button>
          <button
            type="button"
            class="compose-close"
            :disabled="sending"
            :aria-label="t.close"
            @click="close"
          >×</button>
        </footer>
      </div>
    </article>
  </ModalDialog>
</template>

<style scoped>
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
.compose-sheet {
  width: 100%;
  max-height: calc(100vh / var(--ui-scale, 1) - 40px);
  box-sizing: border-box;
  border-radius: 10px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.compose-inner {
  display: flex;
  flex-direction: column;
  padding: var(--paper-line) clamp(22px, 7%, 52px) 0;
}
.compose-body {
  flex: 1 1 auto;
  min-height: 0;
}
.compose-delivery { margin: 0; min-height: var(--paper-line); line-height: var(--paper-line); }
.compose-sheet-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  height: 48px;
  flex: none;
  color: var(--paper-muted);
  font: 400 var(--fs-2xs) / 1 var(--font-sans);
  letter-spacing: .04em;
}
.compose-close {
  display: inline-flex;
  width: 28px;
  height: 28px;
  margin-inline-end: -6px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--paper-muted);
  font: 400 20px / 1 var(--font-sans);
  cursor: pointer;
  transition: color 160ms ease, background-color 160ms ease;
}
.compose-close:hover:not(:disabled) {
  color: var(--paper-ink);
  background: rgb(120 95 60 / .1);
}
/* 去信匣：长按才打得开信匣没人发现（反馈「不知道信匣从哪打开」），点一下进来的人在信纸底下就能看到它。 */
.compose-to-box {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-inline-start: auto;
  padding: 6px 10px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--paper-muted);
  font: inherit;
  cursor: pointer;
  transition: color 160ms ease, background-color 160ms ease;
}
.compose-to-box:hover:not(:disabled) {
  color: var(--paper-ink);
  background: rgb(120 95 60 / .1);
}
.compose-close:focus-visible, .compose-to-box:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
</style>
