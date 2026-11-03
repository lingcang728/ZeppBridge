/**
 * 作者来信与「上期回音」的纯解析（docs/releases/README.md「第一步：先写信」）。
 *
 * 信：普通段落，段间空一行；最后一段以破折号开头、且不长，就是落款。和官网归档
 * scripts/site/letters.mjs 的 parseLetter 同一套规则——同一封信在应用里和网页上长得一样。
 *
 * 回音：docs/releases/letters/<版本>/echo/<locale>.md，可以没有。列表行
 * `- next #backfill-stuck: **补拉卡住**：……`，前缀 next / later / asking 不翻译（「下版先修 / 推迟 / 继续征集」），
 * `#id` 是这一类问题的固定标识：回信被作者归到这一类时，回执显示的就是它的标题；「我也遇到」发回去的也是它。
 * 不是列表的行当作导语。
 */

export interface ParsedLetter { paragraphs: string[]; signature: string | null }

export function parseLetter(text: string): ParsedLetter {
  const paragraphs = text.replace(/\r\n/g, '\n').split(/\n\s*\n/)
    .map((p) => p.trim().replace(/\s*\n\s*/g, ' ')).filter(Boolean);
  const last = paragraphs[paragraphs.length - 1];
  const signature = last && /^[—–-]{1,2}\s*/.test(last) && last.length <= 60 ? last.replace(/^[—–-]{1,2}\s*/, '') : null;
  return { paragraphs: signature ? paragraphs.slice(0, -1) : paragraphs, signature };
}

/**
 * 正文从哪一段开始：跳过开头只有称呼的短段（「你好，」「Hello,」）。首字母放在这一段，信匣的预览也取这一段。
 */
export function leadParagraph(paragraphs: string[]): number {
  const index = paragraphs.findIndex((p) => p.replace(/\*\*/g, '').length > 12);
  return index < 0 ? 0 : index;
}

export type EchoKind = 'next' | 'later' | 'asking';
export interface EchoItem { id: string; kind: EchoKind; text: string }
export interface ParsedEcho { intro: string[]; items: EchoItem[] }

const ECHO_LINE = /^[-*]\s+(next|later|asking)\s+#([a-z0-9][a-z0-9-]{0,47})\s*[:：]\s*(.+)$/;

export function parseEcho(text: string): ParsedEcho {
  const intro: string[] = [];
  const items: EchoItem[] = [];
  for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line || /^#{1,6}\s/.test(line)) continue;
    const match = ECHO_LINE.exec(line);
    if (match) items.push({ kind: match[1] as EchoKind, id: match[2]!, text: match[3]!.trim() });
    else if (!/^[-*]\s/.test(line)) intro.push(line);
  }
  return { intro, items };
}

/** 回音条目的标题：开头的 `**加粗**`；没有加粗就取冒号前那一段。回执里显示「归入『…』」用它。 */
export function echoTitle(item: EchoItem): string {
  const bold = /^\*\*(.+?)\*\*/.exec(item.text);
  if (bold) return bold[1]!.replace(/[，,。.:：\s]+$/, '');
  return item.text.split(/[:：。.]/)[0]!.replace(/\*\*/g, '').trim();
}

/** 预发布后缀（3.0.9-beta.2 的 -beta.2）去掉后的正式版本号。 */
export const baseVersion = (v: string): string => v.replace(/-.*$/, '');
const RELEASE = /^\d+\.\d+\.\d+$/;

/** 版本号比较（只比 x.y.z，预发布后缀不参与）。 */
export function compareVersions(a: string, b: string): number {
  const pa = baseVersion(a).split('.').map(Number);
  const pb = baseVersion(b).split('.').map(Number);
  for (let i = 0; i < 3; i += 1) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

/**
 * 这次升级该收到哪几封信：上次的版本（不含）到这次的版本（含）之间写过信的版本，从旧到新。
 * 跳过好几个版本才更新的人，几封信捆成一叠一起到。from 为空（老安装、版本不明）时只给这一版的信。
 * 本地测试包用预发布号模拟升级（2026-10-21 用户：停在 3.0.9，用 3.0.9-beta.1、-beta.2…）：每装一个 beta 都再收一次
 * 它所属正式版的信。正式发版只用 x.y.z，不受影响。
 */
export function lettersBetween(available: string[], from: string, to: string): string[] {
  const target = baseVersion(to);
  const prerelease = to !== target && RELEASE.test(target);
  const since = baseVersion(from);
  return available.filter((v) => RELEASE.test(v)
    && compareVersions(v, target) <= 0
    && ((prerelease && v === target) || (RELEASE.test(since) ? compareVersions(v, since) > 0 : v === target)))
    .sort(compareVersions);
}
