// 公开仓库里不该出现的东西：维护者的工作笔记、本机路径、和维护者讨论的转述。
// 规则只写通用模式（不写任何人的真实用户名），pre-commit、commit-msg、CI 共用这一份。

// 这些文件只该放在仓库外的 ../ZeppBridge-private/。
const PRIVATE_BASENAMES = new Set(['CLAUDE.md', 'CLAUDE.local.md', 'AGENTS.local.md', '翻译.md']);
const PRIVATE_PATHS = [
  /(^|\/)计划[^/]*\.md$/,
  /(^|\/)修复计划[^/]*\.md$/,
  /(^|\/)[^/]*handoff[^/]*\.md$/i,
  /^artifacts\//,
  /^\.site-cache\//,
  /(^|\/)ZeppBridge-private\//,
];

// 本机路径：Windows 用户目录。占位名字（example、user、runner…）和变量写法放行；
// 测试文件里的假路径（C:\Users\alice）不查，见 TEST_FILE。
const PLACEHOLDER_USERS = '(?:example|user|username|you|me|demo|name|runner|runneradmin|alice|bob|Public|Default|<[^>]*>|\\{[^}]*\\}|%[A-Z_]+%|\\$[A-Za-z_:]+)';
const LOCAL_PATH_RULES = [
  { id: 'local-path.windows-user', re: new RegExp(`\\b[A-Za-z]:(?:\\\\{1,2}|/)Users(?:\\\\{1,2}|/)(?!${PLACEHOLDER_USERS}(?:[\\\\/'"\`\\s)]|$))[^\\\\/\\s'"\`)]+`, 'i') },
];

// 转述讨论的强信号：哪天谁拍的板、第几轮反馈、内部计划编号。代码、文档、提交说明都拦。
// 「用户确认」「（用户手动指认）」这类是正常的产品用语，不在这里拦。
const CONVERSATION_RULES = [
  { id: 'conversation.user-dated', re: /用户\s*(?:20\d\d-)?\d{1,2}-\d{2}/ },
  { id: 'conversation.user-said', re: /用户(?:原话|拍板|改口|否决|看过|已自测|第[\d一二三四五六七八九十]+[轮段点])/ },
  { id: 'conversation.dated-decision', re: /(?:20\d\d-)?\b\d{1,2}-\d{2}\s*(?:用户)?(?:定|拍板|看过|否决|改口)(?![\d\w])/ },
  { id: 'conversation.internal-plan', re: /修复计划\s*[A-Z]?\d|v3-plan\s*§/ },
  { id: 'conversation.round', re: /第[\d一二三四五六七八九十百]+轮(?:反馈|样稿|录屏|审查)/ },
];

// 只在提交说明里拦的：转述（「用户说 / 用户：」）和工作流程本身（录屏验收、agent 分工、会话交接、本机桌面）。
// 这些词在代码和文档里常有正当用法，提交说明里几乎只会是在转述讨论。
const COMMIT_ONLY_RULES = [
  { id: 'conversation.user-said', re: /用户\s*(?:说|定|要求|看过|否|改口|采纳|反馈|确认|第)/ },
  { id: 'conversation.user-quote', re: /[（(]\s*用户|用户\s*[：:]/ },
  { id: 'conversation.round', re: /第[\d一二三四五六七八九十百至到~-]+(?:轮|批|段)/ },
  { id: 'conversation.recording', re: /录屏/ },
  { id: 'conversation.agent-workflow', re: /翻译\s*agent|子\s*agent|subagent|会话|交接/i },
  { id: 'local-path.desktop', re: /(?:Desktop|桌面)[\\/]|桌面[《「]/ },
  { id: 'local-path.build-cache', re: /\b[A-Za-z]:[\\/]+build_cache\b/i },
];

// 这些文件本身就要写出被拦的样例，或本来就是作者署名的公开原话。
const CONTENT_EXEMPT = [
  /^scripts\/privacy\//,
  /^tests\/privacy-check\.test\.mjs$/,
  /^docs\/releases\/letters\//,
  /(^|\/)node_modules\//,
];

// 测试里的路径都是造出来的夹具，不按本机路径查（对话痕迹照查）。
const TEST_FILE = /(^|\/)(tests?|__tests__)\/|(^|\/)tests\.rs$|\.test\.[cm]?[jt]s$/;

export const ALLOW_MARK = 'privacy-allow';

export function checkPath(path) {
  const p = path.replace(/\\/g, '/');
  const base = p.split('/').pop();
  if (PRIVATE_BASENAMES.has(base) || PRIVATE_PATHS.some((re) => re.test(p))) {
    return [{ id: 'private-file', text: p }];
  }
  return [];
}

function matchRules(rules, line) {
  const hits = [];
  for (const rule of rules) {
    const m = rule.re.exec(line);
    if (m) hits.push({ id: rule.id, text: m[0] });
  }
  return hits;
}

/** 一行新增内容（代码、文档、配置）。 */
export function checkContentLine(path, line) {
  const p = path.replace(/\\/g, '/');
  if (CONTENT_EXEMPT.some((re) => re.test(p)) || line.includes(ALLOW_MARK)) return [];
  return matchRules(TEST_FILE.test(p) ? CONVERSATION_RULES : [...LOCAL_PATH_RULES, ...CONVERSATION_RULES], line);
}

/** 整条提交说明。`#` 开头的是 git 的注释行，不算。没有放行标记：改写就好。 */
export function checkCommitMessage(message) {
  const hits = [];
  const lines = message.split(/\r?\n/).filter((l) => !l.startsWith('#'));
  lines.forEach((line, i) => {
    for (const hit of matchRules([...LOCAL_PATH_RULES, ...CONVERSATION_RULES, ...COMMIT_ONLY_RULES], line)) {
      hits.push({ ...hit, line: i + 1 });
    }
  });
  return hits;
}
