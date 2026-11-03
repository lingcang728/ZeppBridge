/** 教练档案（批次 7，AI 记忆收件箱）：AI 经 MCP 提议、用户确认的，和用户自己写的。 */
export type CoachNoteState = 'proposed' | 'accepted' | 'rejected';
/** `user` 是用户自己写的；`mcp` 是某个 AI 经 MCP 提议的（`source_name` 是它自报的名字）。 */
export type CoachNoteSource = 'user' | 'mcp';

export interface CoachNote {
  id: number;
  text: string;
  state: CoachNoteState;
  source: CoachNoteSource;
  source_name: string | null;
  created_at: string;
  updated_at: string;
  decided_at: string | null;
}

export interface CoachNotes {
  /** 记住的，旧的在前。 */
  accepted: CoachNote[];
  /** 等确认的，新的在前。 */
  proposed: CoachNote[];
}
