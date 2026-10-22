/**
 * 教练档案（批次 7，AI 记忆收件箱）：概览小卡和 /ai/memory 页共用的一份状态。
 *
 * - 列表整份从后端读，每次写完重读：写入很少，没必要在前端拼。
 * - 同步落地、MCP 那边提议了新的，靠页面的 useRevisionReload / 回到前台时重读。
 * - 导出：界面按当前语言排好 Markdown，后端存到桌面「ZeppBridge AI」，再在资源管理器里选中。
 */
import { ref } from 'vue';
import { backend, isDesktop, toUserMessage } from '../lib/bridge';
import { coachNotesMarkdown } from '../lib/coachNotes/markdown';
import { useCoachNotesText } from '../components/coachNotes/coachNotes.i18n';
import type { CoachNotes } from '../types/coachNotes';
import { revealInFolder } from './useAiHandoff';

const notes = ref<CoachNotes | null>(null);
const busy = ref(false);
const error = ref<string | null>(null);
let loadSeq = 0;

export const useCoachNotes = () => {
  const t = useCoachNotesText();

  const load = async () => {
    if (!isDesktop()) { notes.value = { accepted: [], proposed: [] }; return; }
    const mine = ++loadSeq;
    try {
      const next = await backend.coachNotesList();
      if (mine === loadSeq) notes.value = next;
    } catch (e) {
      if (mine === loadSeq) error.value = toUserMessage(e, '');
    }
  };

  /** 跑一次写入；成功返回 true 并重读，失败把原因放进 `error`。 */
  const write = async (run: () => Promise<unknown>): Promise<boolean> => {
    if (busy.value) return false;
    busy.value = true;
    error.value = null;
    try {
      await run();
      return true;
    } catch (e) {
      error.value = toUserMessage(e, '');
      return false;
    } finally {
      busy.value = false;
      await load();
    }
  };

  const decide = (id: number, accept: boolean) => write(() => backend.coachNoteDecide(id, accept));
  const add = (text: string) => write(() => backend.coachNoteAdd(text));
  const edit = (id: number, text: string) => write(() => backend.coachNoteEdit(id, text));
  const remove = (id: number) => write(() => backend.coachNoteDelete(id));

  /** 导出记住的那些；返回存下的路径，失败返回 null。 */
  const exportMarkdown = async (): Promise<string | null> => {
    const text = t.value;
    const markdown = coachNotesMarkdown(notes.value?.accepted ?? [], {
      title: text.fileStem,
      intro: text.fileIntro,
      empty: text.fileEmpty,
      byUser: text.fileByUser,
      byAi: text.fileByAi,
      since: (date) => date,
    });
    let path: string | null = null;
    const ok = await write(async () => { path = await backend.coachNotesExport(text.fileStem, markdown); });
    if (!ok || !path) return null;
    await revealInFolder(path).catch(() => undefined);
    return path;
  };

  return { notes, busy, error, load, decide, add, edit, remove, exportMarkdown };
};
