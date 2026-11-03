// 发版共用的纯逻辑：12 种语言清单、作者来信与上期回音的门禁、tag 正文。不碰网络。
// 发版就是正常流程（2026-10-29 用户定，取消了冻结 / 定时 / 批准）：本地打包自测 → 提交推送 main → 打 `v*` 附注标签，CI 打包并建 Release。

/** 每一版的更新说明必须齐全的 12 种界面语言（与 docs/releases/README.md 一致）。 */
export const NOTE_LOCALES = ['zh', 'en', 'es', 'nl', 'pt-BR', 'pt-PT', 'de', 'ru', 'hi-IN', 'fr', 'it', 'pl'];

/**
 * 作者来信（2026-10-20 用户定）：从这一版起每一版都要有信，补丁版也算。
 * 原稿 docs/releases/letters/<版本>/<locale>.md，12 种语言齐了才发。3.0.6 之前的版本没有信。
 */
export const LETTERS_SINCE = '3.0.7';
export const letterPath = (version, locale) => `docs/releases/letters/${version}/${locale}.md`;
export const needsLetter = (version) => compareVersions(version, LETTERS_SINCE) >= 0;
export const echoPath = (version, locale) => `docs/releases/letters/${version}/echo/${locale}.md`;

/*
 * 「上期回音」可以没有；有了就 12 种语言都要有，列表行格式和 src/lib/letters/parse.ts 的 parseEcho 一致，
 * 每种语言的 #id 和中文原稿同一组、同一顺序——回执「归入『…』」和「我也遇到」都按 #id 对。
 */
const ECHO_ITEM = /^[-*]\s+(next|later|asking)\s+#([a-z0-9][a-z0-9-]{0,47})\s*[:：]\s*(.+)$/;
const echoIds = (text) => {
  const ids = [];
  const bad = [];
  for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!/^[-*]\s/.test(line)) continue;
    const match = ECHO_ITEM.exec(line);
    if (match) ids.push(match[2]); else bad.push(line);
  }
  return { ids, bad };
};
export function echoProblems(version, show) {
  const original = show(echoPath(version, 'zh'));
  if (!original?.trim()) return [];
  const problems = [];
  const expected = echoIds(original);
  if (!expected.ids.length) problems.push(`${echoPath(version, 'zh')} 没有一条回音（列表行要写成 \`- next|later|asking #id: …\`）`);
  if (new Set(expected.ids).size !== expected.ids.length) problems.push(`${echoPath(version, 'zh')} 里有重复的 #id`);
  for (const locale of NOTE_LOCALES) {
    const text = show(echoPath(version, locale));
    if (!text?.trim()) { problems.push(`缺上期回音 ${echoPath(version, locale)}`); continue; }
    const { ids, bad } = echoIds(text);
    for (const line of bad) problems.push(`${echoPath(version, locale)} 这一行不是回音格式：${line.slice(0, 60)}`);
    if (ids.join(' ') !== expected.ids.join(' ')) problems.push(`${echoPath(version, locale)} 的 #id 和中文原稿对不上`);
  }
  return problems;
}

export function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

/**
 * tag 正文 = Release 说明 = 应用内更新提示：第一行标题，下面只写这一版的英文更新说明（与 v3.0.2 同格式）。
 * 作者来信不进 Release 页（2026-10-29 用户：信直接寄给用户，发布页只写改动）。
 */
export function tagMessage(version, englishNotes) {
  return `# ZeppBridge ${version}\n\n${englishNotes.trim()}\n`;
}
