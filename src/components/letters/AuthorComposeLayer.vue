<script setup lang="ts">
/**
 * 写给作者的那张信纸（全局一份，挂在 AppShell）：
 * 从被点的控件（顶栏右上角信件圆钮、设置卡按钮、信匣写信卡）一镜到底直接展开成棉浆横线信纸，
 * 点 × 关掉时沿原曲线收拢回同一个控件；寄出时整张信纸折成纸飞机飞走，信件按钮底下提示「已寄出」。
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
import type { LetterSendResult } from '../../types/letters';
import { useReplyImages } from '../../composables/useReplyImages';
import { lessMotion } from '../../lib/motion/lessMotion';
import { foldIntoPlane } from '../../lib/letters/paperPlane';
import { showSentNote } from '../../lib/letters/sentNote';
import { playPaperSlide } from '../../lib/letters/sound';

const t = useLetterText();
const { writing, attach, category, sent } = useAuthorCompose();

const AUTHOR_DRAFT = 'author';
const draft = ref(loadDraft(AUTHOR_DRAFT));
watch(draft, (value) => saveDraft(AUTHOR_DRAFT, value), { deep: true, flush: 'sync' });

const sheetEl = ref<HTMLElement | null>(null);
const composer = ref<InstanceType<typeof AuthorCompose> | null>(null);
const sending = ref(false);
const error = ref('');
const { images: replyImages, preparing: imagesPreparing, failed: imagesFailed, add: addImages, remove: removeImage, clear: clearImages, payload: imagePayload } = useReplyImages();
const close = () => { if (!sending.value) closeAuthorCompose(); };

/**
 * 寄出成功：整张信纸折成纸飞机飞走（lib/letters/paperPlane.ts）。面板当场藏起来（看到的是纸的拷贝），
 * 遮罩留着衬住折纸；飞机张开翅膀、起飞的那一刻才关弹窗——遮罩慢慢淡掉、信件按钮慢慢亮回来，
 * 不会纸还没折好就整块收走。飞机飞远了，按钮底下冒一句「已寄出」。减少动效时直接关掉、立刻提示。
 */
const sendAway = (status: LetterSendResult['status'], origin: HTMLElement | null) => {
  const note = status === 'sent' ? t.value.sent : t.value.queued;
  const sheet = sheetEl.value;
  const panel = sheet?.closest<HTMLElement>('[data-modal-dialog]');
  const session = writing.value;
  if (!sheet || !panel || lessMotion()) {
    closeAuthorCompose();
    showSentNote(note, origin);
    return;
  }
  playPaperSlide();
  panel.style.visibility = 'hidden';
  void foldIntoPlane(sheet, {
    onTakeoff: () => {
      if (writing.value === session) closeAuthorCompose();
      window.setTimeout(() => showSentNote(note, origin), 700);
    },
  });
};

watch(writing, async (open) => {
  if (!open) return;
  error.value = '';
  await nextTick();
  const panel = sheetEl.value?.closest<HTMLElement>('[data-modal-dialog]');
  await whenDialogLanded(panel);
  if (writing.value === open && document.activeElement === panel) composer.value?.focusInput();
}, { immediate: true });

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
      allowQuote: false, alsoHit: [], ...(reportId ? { reportId } : {}), ...imagePayload(),
    });
    if (!sameDraft()) return;
    // 先拷信纸起飞（拷的是此刻的字和附图），再清草稿：附图的 blob 地址一清就失效，拷贝里的图会变成破图。
    sendAway(result.status, session?.origin ?? null);
    clearDraft(AUTHOR_DRAFT);
    clearImages();
    draft.value = loadDraft(AUTHOR_DRAFT);
    attach.value = false;
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
          <AuthorCompose
            ref="composer"
            v-model:text="draft.text"
            v-model:attach="attach"
            v-model:category="category"
            :busy="sending"
            :error="error"
            :images="replyImages"
            :preparing="imagesPreparing"
            :attach-failed="imagesFailed"
            @send="send"
            @add-images="addImages"
            @remove-image="removeImage"
          />
        </div>
        <!-- 只留一个 ×，在信纸右上角，和「致：」那一行对齐。「写给作者」和去信匣的小钮都拿掉了（长按信件按钮就开信匣）。 -->
        <button
          type="button"
          class="compose-close"
          :disabled="sending"
          :aria-label="t.close"
          @click="close"
        >×</button>
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
  position: relative;
  display: flex;
  flex-direction: column;
  padding: var(--paper-line) clamp(22px, 7%, 52px) calc(var(--paper-line) * .75);
}
.compose-body {
  flex: 1 1 auto;
  min-height: 0;
}
.compose-close {
  position: absolute;
  top: calc(var(--paper-line) + (var(--paper-line) - 28px) / 2);
  inset-inline-end: 14px;
  display: inline-flex;
  width: 28px;
  height: 28px;
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
