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

const t = useLetterText();
const { writing, attach, category, sent } = useAuthorCompose();

const AUTHOR_DRAFT = 'author';
const draft = ref(loadDraft(AUTHOR_DRAFT));
watch(draft, (value) => saveDraft(AUTHOR_DRAFT, value), { deep: true });

const sheetEl = ref<HTMLElement | null>(null);
const composer = ref<InstanceType<typeof AuthorCompose> | null>(null);
const sending = ref(false);
const error = ref('');

watch(writing, async (open) => {
  if (!open) return;
  error.value = '';
  await nextTick();
  const panel = sheetEl.value?.closest<HTMLElement>('[data-modal-dialog]');
  await whenDialogLanded(panel);
  if (writing.value) composer.value?.focusInput();
});

const send = async () => {
  if (sending.value) return;
  sending.value = true;
  error.value = '';
  const text = draft.value.text.trim();
  let reportId: string | undefined;
  if (attach.value) {
    try {
      reportId = (await backend.submitDiagnosticReport(undefined, category.value)).reportId;
    } catch {
      /* 报告没交上去：取消附带、留着草稿，再点一次就只寄信。 */
      attach.value = false;
      error.value = t.value.reportFailedPlain;
      sending.value = false;
      return;
    }
  }
  try {
    await sendLetterReply({
      localId: draft.value.localId, letterVersion: BUNDLED_VERSION, locale: locale.value, text,
      allowQuote: false, alsoHit: [], ...(reportId ? { reportId } : {}),
    });
  } catch (cause) {
    error.value = toUserMessage(cause, t.value.queued);
    sending.value = false;
    return;
  }
  clearDraft(AUTHOR_DRAFT);
  draft.value = loadDraft(AUTHOR_DRAFT);
  attach.value = false;
  sending.value = false;
  sent.value += 1;
  closeAuthorCompose();
};
</script>

<template>
  <ModalDialog
    v-if="writing"
    bare
    :max-width="640"
    labelledby="author-compose-title"
    :origin="writing.origin"
    @close="closeAuthorCompose()"
  >
    <h2 id="author-compose-title" class="sr-only">{{ t.writeAuthor }}</h2>
    <article ref="sheetEl" class="compose-sheet paper" data-dialog-window>
      <div class="compose-inner" data-dialog-content>
        <div class="compose-body paper-lines">
          <AuthorCompose
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
          <button
            type="button"
            class="compose-close"
            :disabled="sending"
            aria-label="Close"
            @click="closeAuthorCompose()"
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
.compose-close:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
</style>
