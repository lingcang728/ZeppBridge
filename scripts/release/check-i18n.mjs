#!/usr/bin/env node
/**
 * 界面里不该再有硬编码的中文。
 *
 * 这条检查存在的理由很实际：翻译是一次性的，硬编码是持续发生的。写下一个
 * 组件时顺手打一句中文，构建不会红，测试不会红，只有一个看不懂中文的用户
 * 会看到它——而他没法告诉我们。所以让构建来管这件事。
 *
 * 判定方式：把每个源文件里「文案定义」的那一半挖掉（`defineMessages(` 的
 * 第一个参数，也就是中文那份），再把注释挖掉，剩下的地方如果还有中文，
 * 就是硬编码。
 *
 * 刻意不检查的：
 * - `*.i18n.ts` 整份文件本来就是文案；
 * - `LandingPage.vue` 和 `useLandingLocale.ts` 有自己的一套双语开关；
 * - 下面 ALLOWED 里逐条列出的几处，每条都写了为什么。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const srcDir = join(root, 'src');
const tauriDir = join(root, 'src-tauri');
const ERROR_MESSAGES_FILE = join(srcDir, 'i18n', 'errors.ts');

/** 整份文件都是文案，或者自带一套双语机制。 */
const SKIP_FILES = [
  'views/Explore.i18n.ts',
  'views/Settings.i18n.ts',
  'views/LandingPage.vue',
  'composables/useLandingLocale.ts',
];

/**
 * 逐条豁免。每条都必须说清为什么这里的中文是对的。
 * 匹配方式是「这一行包含这段文本」。
 */
const ALLOWED = [
  {
    file: 'views/Settings.vue',
    text: '语言 · Language',
    why: '语言开关的标签刻意是双语的：看不懂中文的人必须能在中文界面上找到它。',
  },
  {
    file: 'i18n/index.ts',
    text: "zh: '中文'",
    why: '每种语言在选择器里用自己的名字，和界面当前语言无关。',
  },
  {
    file: 'lib/bridge/errors.ts',
    text: 'DESKTOP_ONLY_MARKER',
    why: '这是识别异常用的标记，不是显示给用户的字：异常可能来自任何一条旧代码路径。',
  },
  {
    file: 'lib/deviceCopy.ts',
    text: '跃我',
    why: '把设备名前面的中文品牌前缀去掉。这是在处理数据，不是在写文案。',
  },
];

// 整份文件都是错误码文案，和 `*.i18n.ts` 同理。
SKIP_FILES.push('i18n/errors.ts');

const CHINESE = /[一-鿿]/;

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const full = join(dir, name);
  if (statSync(full).isDirectory()) return name === '__tests__' ? [] : walk(full);
  return /\.(vue|ts)$/.test(name) ? [full] : [];
});

/** 把 `defineMessages(` 的第一个参数（中文那份）整段抹掉。 */
const stripMessageBundles = (source) => {
  let out = source;
  for (;;) {
    const start = out.indexOf('defineMessages(');
    if (start < 0) break;
    const open = out.indexOf('{', start);
    if (open < 0) break;
    let depth = 0;
    let index = open;
    for (; index < out.length; index += 1) {
      if (out[index] === '{') depth += 1;
      else if (out[index] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    // 把整段（含 `defineMessages(`）换成同样长度的空白，行号才不会错位。
    const blank = out.slice(start, index + 1).replace(/[^\n]/g, ' ');
    out = out.slice(0, start) + blank + out.slice(index + 1);
  }
  return out;
};

/**
 * 去掉行尾的 `//` 注释，但不碰字符串里的 `//`（`https://` 就是这么来的）。
 * 逐字扫一遍引号状态，比正则可靠。
 */
const stripLineComment = (line) => {
  let quote = null;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quote) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character;
      continue;
    }
    if (character === '/' && line[index + 1] === '/') return line.slice(0, index);
  }
  return line;
};

/** 注释里的中文是给维护者看的，不是给用户看的。 */
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
  .replace(/<!--[\s\S]*?-->/g, (match) => match.replace(/[^\n]/g, ' '))
  .split('\n')
  .map((line) => (/^\s*(\/\/|\*)/.test(line) ? '' : stripLineComment(line)))
  .join('\n');

const findings = [];
for (const file of walk(srcDir)) {
  const relativePath = relative(srcDir, file).split(sep).join('/');
  if (SKIP_FILES.includes(relativePath)) continue;
  const cleaned = stripComments(stripMessageBundles(readFileSync(file, 'utf8')));
  cleaned.split('\n').forEach((line, index) => {
    if (!CHINESE.test(line)) return;
    const allowed = ALLOWED.some(
      (entry) => entry.file === relativePath && line.includes(entry.text),
    );
    if (allowed) return;
    findings.push({ file: relativePath, line: index + 1, text: line.trim() });
  });
}

if (findings.length) {
  console.error('界面里还有硬编码的中文——它在英文界面上会原样出现：\n');
  for (const finding of findings) {
    console.error(`  src/${finding.file}:${finding.line}`);
    console.error(`    ${finding.text.slice(0, 120)}`);
  }
  console.error(
    '\n把它挪进 defineMessages（中英各一份），或者——如果这里的中文确实是对的——'
    + '\n在 scripts/release/check-i18n.mjs 的 ALLOWED 里加一条并写清为什么。',
  );
  process.exit(1);
}

/*
 * 第二道门：后端每一个错误码都必须有中英两份文案。
 *
 * 后端不按界面语言出文案，只给一个稳定的 `err.*` 码；界面按码取文案，取不到
 * 才回落到后端那句中文原文。回落是兜底，不是常态——漏掉一个码，英文用户就会
 * 又看到一句中文。上一版整个后端都没有这一层，Reddit 上真实走通流程的用户
 * 就是被它绊住的，所以这件事必须由构建来管。
 */
const walkRust = (dir) => readdirSync(dir).flatMap((name) => {
  if (name === 'target' || name === 'node_modules') return [];
  const full = join(dir, name);
  if (statSync(full).isDirectory()) return walkRust(full);
  return name.endsWith('.rs') ? [full] : [];
});

// 码统一挂在 `err.` 名字空间下，所以不会和文件名、JSON 字段名撞车。
const CODE_PATTERN = /"(err\.[a-z_]+\.[a-z0-9_]+)"/g;
const declaredCodes = new Set();
for (const file of walkRust(tauriDir)) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(CODE_PATTERN)) declaredCodes.add(match[1]);
}

const errorBundle = readFileSync(ERROR_MESSAGES_FILE, 'utf8');
// 中英两份都要有：`'err.x.y':` 在文件里出现两次才算齐。
const translated = new Map();
for (const match of errorBundle.matchAll(/'(err\.[a-z_]+\.[a-z0-9_]+)':/g)) {
  translated.set(match[1], (translated.get(match[1]) ?? 0) + 1);
}

/*
 * 第三道门：后端的**非错误散文**也得有码，而且界面得真的处理了它。
 *
 * 上一轮只给错误加了码，于是「估算说明」「补拉失败原因」这类散文字段仍然
 * 裸奔到界面——英文界面上照样是中文。这类文案要带数字参数，住在组件自己的
 * 文案包里而不是 errors.ts，所以这里只能检查「界面有没有处理这个码」：
 * Rust 里声明的每个 `ui.*` 码，都必须在 src/ 里出现过。
 */
const UI_CODE_PATTERN = /"(ui\.[a-z_]+\.[a-z0-9_]+)"/g;
const declaredUiCodes = new Set();
for (const file of walkRust(tauriDir)) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(UI_CODE_PATTERN)) declaredUiCodes.add(match[1]);
}
const frontendSource = walk(srcDir).map((file) => readFileSync(file, 'utf8')).join('\n');
const unhandledUiCodes = [...declaredUiCodes]
  .filter((code) => !frontendSource.includes(code))
  .sort();

/*
 * 第四道门：后端那些**带中文原文**的字段，界面不许直接拿来显示。
 *
 * 前三道门管的是后端有没有给码。这一道管的是界面有没有用码——两次翻车都是
 * 这里：后端给了 code，界面却仍然渲染 message/reason/note 的中文原文。
 * 尤其是同一句话有多个渲染点时（估算说明一度有三处），改了一处就以为修好了。
 *
 * 规则：下面这些字段名的每一次出现都必须在 ALLOWED_PROSE 里登记，并写清
 * 为什么那里可以碰它（几乎总是「按码取不到时的兜底」）。加新的渲染点会红，
 * 这正是我们要的——它逼你去看一眼有没有走码。
 */
const PROSE_FIELDS = /\.(message|stop_reason|reason|note|problem)\b/;

/*
 * 放过这三类，它们不是「后端散文」：
 *   - JS 自己的 Error：`error.message` / `cause.message`；
 *   - 已经走 `toUserMessage(...)` 的地方——那里面就是先查码再回落；
 *   - CSS（.vue 的 <style> 块、以及形如 `.note { ... }` 的选择器）。
 */
const JS_ERROR = /\b(error|err|cause|reason|e)\.(message|reason)\b/;
const CSS_LINE = /^[.#&][\w-]*[^;]*\{|^\s*[.#][\w-]+\s*[,{]/;
const isProseRisk = (line) => {
  if (!PROSE_FIELDS.test(line)) return false;
  if (line.includes('toUserMessage(')) return false;
  if (CSS_LINE.test(line.trim())) return false;
  // `error.message` 这种是 JS Error，不是后端载荷。
  const stripped = line.replace(JS_ERROR, '');
  return PROSE_FIELDS.test(stripped);
};

const ALLOWED_PROSE = [
  { file: 'lib/storageEstimateText.ts', text: 'estimate.message', why: '估算文案的唯一实现：按 message_code 分支，取不到才回落到原文。' },
  { file: 'lib/storageEstimateText.ts', text: 'estimate.stop_reason', why: '同上，stop_reason 的兜底。' },
  { file: 'lib/storageEstimateText.ts', text: 'estimate?.stop_reason', why: '同上。' },
  { file: 'lib/bridge/errors.ts', text: 'candidate.message', why: 'toUserMessage 本身：先查 code，查不到才用后端原文。' },
  { file: 'lib/bridge/errors.ts', text: 'error.message', why: '取 JS Error 的 message，不是后端字段。' },
  { file: 'components/HistoryArchivePanel.vue', text: 'item.error', why: '先按 error_code 查文案，未知码才回落。' },
  { file: 'components/HistoryArchivePanel.vue', text: 'stop_reason', why: '走 storageStopReasonText，先查码。' },
  { file: 'components/WeeklyReportCard.vue', text: 'fact.reason', why: 'reason_code 优先，未知码才显示后端原文。' },
  { file: 'components/BackupPanel.vue', text: 'verification.problem', why: 'verifyProblemText 按 problem_code 分支，未知码才回落。' },
  { file: 'components/BackupPanel.vue', text: "verifications[item.id].problem", why: '只用来判断有没有失败，显示走 verifyProblemText。' },
  {
    file: 'components/HeartRateZonePicker.vue',
    text: 'basis.note',
    why: 'basisCopy(basis.id) 优先。后端只产 observed_max / device_max / device_resting / '
      + 'lactate_threshold / computed_resting 五个 id，界面五个都有文案，所以这只是理论兜底。',
  },
  { file: 'components/DevicePicker.vue', text: 't.note', why: '本组件自己的文案，不是后端字段。' },
  { file: 'components/InsightCard.vue', text: 'entry.reason', why: '只当计数用的 map key，不显示。' },
  { file: 'composables/useSyncController.ts', text: 'report.message', why: '先按 message_code 取文案。' },
  { file: 'views/HealthCheck.vue', text: 'action.reason', why: 'actionCopy 按 action.code 取文案，未知才回落。' },
  { file: 'views/HealthCheck.vue', text: 'stage.message', why: '只在失败类别（error_kind）都认不出来时才兜底显示。' },
  { file: 'views/Settings.vue', text: 'status.message', why: '先 errorTextFor(status.code)，原文只作兜底。' },
  { file: 'views/Settings.vue', text: 'item.note', why: 'capability 先按 status 分支，未知状态才回落。' },
  { file: 'views/Settings.vue', text: 'row.note', why: 'row.note 来自 capabilityNote()，那里已经先按 status 取文案。' },
  { file: 'composables/useSyncController.ts', text: 'text: payload.message', why: '进度由 code + stream 拼；后端原文只在界面不认识这一步时兜底。' },
  { file: 'composables/useSyncController.ts', text: 'value.text', why: '同上，renderNotice 里的兜底分支。' },
  { file: 'views/HealthCheck.vue', text: 'known.reason', why: 'known 是界面自己的文案对象，不是后端字段。' },
  { file: 'views/HealthCheck.vue', text: 'copy.reason', why: 'copy 是 actionCopy 的结果，已经本地化。' },
  { file: 'views/HealthCheck.vue', text: 'actionCopy(action).reason', why: '同上，已经本地化。' },
];

const proseFindings = [];
for (const file of walk(srcDir)) {
  const relativePath = relative(srcDir, file).split(sep).join('/');
  if (SKIP_FILES.includes(relativePath)) continue;

  // .vue 的样式块整段挖掉：CSS 里的 .note / .detail 是类名，不是字段。
  const raw = readFileSync(file, 'utf8').replace(
    /<style[\s\S]*?<\/style>/g,
    (match) => match.replace(/[^\n]/g, ' '),
  );
  const cleaned = stripComments(raw);
  cleaned.split('\n').forEach((line, index) => {
    if (!isProseRisk(line)) return;
    const allowed = ALLOWED_PROSE.some(
      (entry) => entry.file === relativePath && line.includes(entry.text),
    );
    if (allowed) return;
    proseFindings.push({ file: relativePath, line: index + 1, text: line.trim() });
  });
}

if (proseFindings.length) {
  console.error('这里直接用了后端可能是中文原文的字段——先按码取当前语言的文案：');
  console.error('');
  for (const finding of proseFindings) {
    console.error(`  src/${finding.file}:${finding.line}`);
    console.error(`    ${finding.text.slice(0, 110)}`);
  }
  console.error('');
  console.error('改成先查 code（errorTextFor / *_code 分支），原文只作兜底；');
  console.error('如果这里确实只能用原文，在 check-i18n.mjs 的 ALLOWED_PROSE 里登记并写清为什么。');
  process.exit(1);
}

const missingCodes = [...declaredCodes].filter((code) => (translated.get(code) ?? 0) < 2).sort();
const unusedCodes = [...translated.keys()].filter((code) => !declaredCodes.has(code)).sort();

if (unhandledUiCodes.length) {
  console.error('后端声明了界面没有处理的文案码——界面会回落到后端那句中文：');
  console.error('');
  for (const code of unhandledUiCodes) console.error(`  ${code}`);
  console.error('');
  console.error('在对应组件的 defineMessages 里补中英两份，并在渲染处按码分支。');
  process.exit(1);
}

if (missingCodes.length || unusedCodes.length) {
  if (missingCodes.length) {
    console.error('后端错误码缺少中英文案——英文界面上它会退回成中文：');
    console.error('');
    for (const code of missingCodes) {
      const count = translated.get(code) ?? 0;
      console.error(`  ${code}  （errors.ts 里出现 ${count} 次，需要 2 次：中文一份、英文一份）`);
    }
  }
  if (unusedCodes.length) {
    console.error('');
    console.error('src/i18n/errors.ts 里有后端已经不再使用的码：');
    console.error('');
    for (const code of unusedCodes) console.error(`  ${code}`);
  }
  console.error('');
  console.error('后端加错误码时，src/i18n/errors.ts 的中英两份都要同时补上。');
  process.exit(1);
}

console.log(
  `界面文案检查通过：没有硬编码的中文；${declaredCodes.size} 个后端错误码都有中英文案；`
  + `${declaredUiCodes.size} 个界面文案码都已处理；后端原文字段只在登记过的兜底处使用。`,
);
