/**
 * 信纸上的更新说明，一条拆成三块（2026-10-21 用户：一整段加粗挤在一起太难读，要分层次、别一味加粗）：
 * 标题（开头那段 `**加粗**`，单独一行、用分组的颜色）、正文（标题后面的说明，另起一行、像引用那样往里收），
 * 议题编号（`(#143)` 这种，从字里拎出来，淡淡地缀在标题后面）。
 * 没写加粗的老说明：整条当正文，没有标题。
 */
export interface NoteParts { title: string; body: string; refs: string[] }

const REF = /\s*[（(]\s*((?:#\d+\s*[,，、]?\s*)+)[)）]/g;
/** 标题和正文之间那个句号 / 冒号之类：正文另起一行了，不要让它挂在行首。 */
const LEAD = /^[\s。．.：:，,；;—–-]+/;

export function noteParts(item: string): NoteParts {
  const refs: string[] = [];
  const text = item.replace(REF, (_, list: string) => {
    for (const ref of list.match(/#\d+/g) ?? []) refs.push(ref);
    return '';
  });
  const match = /^\s*\*\*(.+?)\*\*(.*)$/s.exec(text);
  if (!match) return { title: '', body: text.replace(/\*\*/g, '').trim(), refs };
  return { title: match[1]!.trim(), body: match[2]!.replace(/\*\*/g, '').replace(LEAD, '').trim(), refs };
}
