/**
 * 一只信封里装什么（批次 6）：几封作者来信（跳版更新时捆成一叠）、这一版的更新说明、上期回音、回信。
 * 负责按界面语言取文本、回信草稿的自动保存和寄出。
 */
import { computed, ref, watch, type Ref } from 'vue';
import { locale } from '../i18n';
import { loadEcho, loadLetter } from '../services/letters';
import { clearDraft, loadDraft, repliedTo, saveDraft, sendLetterReply, type ReplyDraft } from '../services/letterBox';
import { appStatus } from './sync/state';
import { archiveSpan } from '../lib/letters/personal';
import { parseEcho } from '../lib/letters/parse';
import { toUserMessage } from '../lib/bridge';
import type { NoteGroup } from '../services/updateNotice';
import type { ReplyState } from '../components/letters/ReplySheet.vue';

export type Sheet =
  | { kind: 'letter'; version: string; text: string; lang: string }
  | { kind: 'notes'; version: string }
  | { kind: 'echo'; version: string; text: string; lang: string }
  | { kind: 'reply'; version: string }
  /* 「你的信」里的信（每周来信、时间胶囊）：内容由外面按 id 画；fixed 的那张只有一页、不分页（写胶囊那张）。 */
  | { kind: 'custom'; id: string; label: string; fixed?: boolean };

/** 不是作者来信、用同一只信封装的信。compose：空信封，打开就自己抽出一张空信纸来写（不翻面、没有火漆）。 */
export interface CustomLetter {
  title: string;
  to: string;
  stamp: string;
  sheets: Array<{ id: string; label: string; fixed?: boolean }>;
  compose?: boolean;
  acknowledge?: string;
  /** 自己寄出的回信：蓝墨水收件人、不印寄件人、盖寄出那天的邮戳（YYYY-MM-DD）。 */
  mine?: boolean;
  postmark?: string;
}

export function useLetterEnvelope(versions: Readonly<Ref<string[]>>, current: Readonly<Ref<string>>, notes: Readonly<Ref<NoteGroup[] | null>>) {
  const letters = ref<Array<{ version: string; text: string; lang: string }>>([]);
  const echo = ref<{ text: string; lang: string } | null>(null);
  const loaded = ref(false);

  watch([versions, current, locale], async ([list, version, language]) => {
    loaded.value = false;
    const found = await Promise.all(list.map(async (v) => {
      const letter = await loadLetter(v, language);
      return letter ? { version: v, text: letter.text, lang: letter.locale } : null;
    }));
    const echoText = await loadEcho(version, language);
    // 语言或信在等待期间换了：丢掉这次的结果。
    if (list !== versions.value || version !== current.value || language !== locale.value) return;
    letters.value = found.filter((item): item is NonNullable<typeof item> => item !== null);
    echo.value = echoText && parseEcho(echoText.text).items.length + parseEcho(echoText.text).intro.length > 0
      ? { text: echoText.text, lang: echoText.locale } : null;
    loaded.value = true;
  }, { immediate: true });

  const sheets = computed<Sheet[]>(() => [
    ...letters.value.map((letter) => ({ kind: 'letter' as const, ...letter })),
    ...(notes.value?.length ? [{ kind: 'notes' as const, version: current.value }] : []),
    ...(echo.value ? [{ kind: 'echo' as const, version: current.value, ...echo.value }] : []),
    { kind: 'reply' as const, version: current.value },
  ]);

  /** 「你的库里已经有 7 年 2 个月」：只用本机覆盖范围，库不满一个月就不说。 */
  const span = computed(() => archiveSpan(appStatus.value?.coverage?.earliest_day, new Date()));

  const draft = ref<ReplyDraft>(loadDraft(current.value));
  watch(current, (version) => { draft.value = loadDraft(version); replyState.value = 'idle'; });
  watch(draft, (value) => saveDraft(current.value, value), { deep: true });
  const replyState = ref<ReplyState>(repliedTo(current.value) ? 'sent' : 'idle');
  const replyError = ref('');

  const send = async (): Promise<boolean> => {
    if (replyState.value === 'sending') return false;
    const { text } = draft.value;
    if (!text.trim()) return false;
    replyState.value = 'sending';
    replyError.value = '';
    try {
      const result = await sendLetterReply({
        localId: draft.value.localId,
        letterVersion: current.value,
        locale: locale.value,
        text,
        allowQuote: draft.value.allowQuote,
        // 「我也遇到」不再有（2026-10-21）；旧草稿里存过的也不再寄。
        alsoHit: [],
      });
      replyState.value = result.status;
      clearDraft(current.value);
      return true;
    } catch (error) {
      replyState.value = 'error';
      replyError.value = toUserMessage(error, '');
      return false;
    }
  };

  return { sheets, loaded, span, draft, replyState, replyError, send };
}
