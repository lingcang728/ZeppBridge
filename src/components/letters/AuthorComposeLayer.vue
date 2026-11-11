<script setup lang="ts">
/**
 * 写给作者的那只信封（全局一份，挂在 AppShell；2026-11-11 从信匣页里搬出来）：
 * 从被点的地方（顶栏的笔、设置卡上的按钮、信匣里那只空信封）飞出来，自己打开、抽出一张空信纸。
 * 可以附一份脱敏诊断报告（先交报告拿编号，再随信寄出）。草稿存本机（和回信草稿同一套，键是 author）。
 * 开没开、附不附报告在 composables/useAuthorCompose.ts。
 */
import { computed, ref, watch } from 'vue';
import LetterEnvelope from './LetterEnvelope.vue';
import AuthorCompose from './AuthorCompose.vue';
import { useLetterText } from './letters.i18n';
import { closeAuthorCompose, useAuthorCompose } from '../../composables/useAuthorCompose';
import { backend, toUserMessage } from '../../lib/bridge';
import { locale } from '../../i18n';
import { clearDraft, loadDraft, saveDraft, sendLetterReply } from '../../services/letterBox';
import { BUNDLED_VERSION } from '../../services/updateNotice';
import type { CustomLetter } from '../../composables/useLetterEnvelope';

const t = useLetterText();
const { writing, attach, category, sent } = useAuthorCompose();

const AUTHOR_DRAFT = 'author';
const draft = ref(loadDraft(AUTHOR_DRAFT));
watch(draft, (value) => saveDraft(AUTHOR_DRAFT, value), { deep: true });

const custom = computed<CustomLetter>(() => ({
  title: t.value.writeAuthor, to: t.value.toDeveloper, stamp: '', mine: true,
  sheets: [{ id: 'compose', label: t.value.writeAuthor, fixed: true }], compose: true,
}));

const composer = ref<InstanceType<typeof AuthorCompose> | null>(null);
const sending = ref(false);
const error = ref('');
watch(writing, (open) => { if (open) error.value = ''; });

const send = async (close: () => Promise<void>) => {
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
  await composer.value?.fold();
  sending.value = false;
  await close();
  sent.value += 1;
};
</script>

<template>
  <LetterEnvelope v-if="writing" :versions="[]" current="" :custom="custom" :origin="writing.origin" @done="closeAuthorCompose()">
    <template #sheet="{ close }">
      <AuthorCompose ref="composer" v-model:text="draft.text" v-model:attach="attach" v-model:category="category"
        :busy="sending" :error="error" @send="send(close)" />
    </template>
  </LetterEnvelope>
</template>
