/**
 * 「我的教练档案」导出成 Markdown（批次 7）：换任何 AI、任何工具都读得懂的一份纯文本。
 *
 * 文案由界面按当前语言给，这里只排版；每一条写明是谁写的、哪天记下的。
 */
import type { CoachNote } from '../../types/coachNotes';

export interface CoachNotesMarkdownText {
  title: string;
  intro: string;
  empty: string;
  byUser: string;
  byAi: (name: string | null) => string;
  since: (date: string) => string;
}

/** 记下的那天（本地日历日）：确认的时刻，用户自己写的就是写下的时刻。 */
export const noteDay = (note: CoachNote): string => {
  const at = new Date(note.decided_at ?? note.created_at);
  if (Number.isNaN(at.getTime())) return (note.decided_at ?? note.created_at).slice(0, 10);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
};

/** 一条可能带换行或 Markdown 记号的话，压成列表里的一行。 */
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

export const coachNotesMarkdown = (notes: CoachNote[], text: CoachNotesMarkdownText): string => {
  const lines = [`# ${text.title}`, '', text.intro, ''];
  if (!notes.length) lines.push(text.empty, '');
  for (const note of notes) {
    const by = note.source === 'mcp' ? text.byAi(note.source_name) : text.byUser;
    lines.push(`- ${oneLine(note.text)}  `, `  _${by} · ${text.since(noteDay(note))}_`);
  }
  return `${lines.join('\n').trimEnd()}\n`;
};
