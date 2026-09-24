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
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
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
  {
    file: 'i18n/backendText.ts',
    text: 'const CJK =',
    why: '这是判断「这段文字是不是中文」的字符区间，不是给用户看的字——'
      + '整个闸门就靠它，挪进 defineMessages 反而没意义。',
  },
  {
    file: 'lib/aiTask/metrics.ts',
    text: "'步'",
    why: '后端覆盖单位表把步数的单位写成「步」（ai_tasks/coverage.rs），'
      + '这里按协议键把它映射成当前语言的单位文案——键本身是数据不是文案。',
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
  // 语言包目录整份都是文案（规则在下方第五道门单独审）。
  if (relativePath.startsWith('i18n/locales/')) continue;
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
const PROSE_FIELDS = /\.(message|stop_reason|reason|note|problem|error|refresh_error|blocker|display_name)\b/;

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
  { file: 'lib/bridge/errors.ts', text: 'candidate.error', why: 'toUserMessage 取错误文本：先查 code，这是原文兜底。' },
  { file: 'lib/failedChunkText.ts', text: 'chunk.error', why: 'failedChunkText 先查 error_code，未知码才回落。' },
  { file: 'composables/useDevices.ts', text: 'meta.refresh_error', why: 'refreshErrorText 先查 refresh_error_code，未知码才回落。' },
  { file: 'composables/useDevices.ts', text: 'profile.display_name', why: '账号里的设备商品名，不是界面文案。' },
  { file: 'composables/useExport.ts', text: 'result.error', why: '导出范围规则的码（scope_conflict 等），不是后端中文。' },
  { file: 'views/Settings.vue', text: 'deviceCache.value?.refresh_error', why: '先 errorTextFor(refresh_error_code)，原文只作兜底。' },
  { file: 'views/Settings.vue', text: 'localApiStatus.value.error', why: '先 errorTextFor(error_code)，原文只作兜底。' },
  { file: 'views/Settings.vue', text: 'localApiStatus.value?.error', why: '同上。' },
  { file: 'views/Settings.vue', text: 'updateState.error', why: '更新服务自己的本地化错误，不是后端中文字段。' },
  { file: 'services/updateService.ts', text: 'updateState.error', why: '更新服务自己写的本地化错误，经 errorMessage/toUserMessage。' },
  { file: 'components/BackupPanel.vue', text: 'preview.blocker', why: 'restoreBlockerText 按 compatibility / problem_code 分支，原文只作兜底。' },
  { file: 'components/DeviceMarquee.vue', text: 'entry.display_name', why: '设备目录里的商品名，不是界面文案。' },
  { file: 'views/Overview.vue', text: 'model.profile.display_name', why: '账号里的设备商品名，不是界面文案。' },
  { file: 'lib/deviceCatalog.ts', text: 'item.display_name', why: '目录匹配用的商品名，不显示给用户当界面文案。' },
  { file: 'views/Settings.vue', text: 'form.error', why: '诊断表单本地状态，catch 里已经 toUserMessage。' },
  { file: 'views/Settings.vue', text: 'form.note', why: '用户自己填的诊断备注，不是后端字段。' },
  { file: 'views/Settings.vue', text: 'deviceDiagnostic.note', why: '用户自己填的诊断备注，不是后端字段。' },
  { file: 'views/Settings.vue', text: 'deviceDiagnostic.error', why: '本地 toUserMessage 结果，不是后端中文字段。' },
  { file: 'views/Settings.vue', text: 'privacyDiagnostic.note', why: '用户自己填的诊断备注，不是后端字段。' },
  { file: 'views/Settings.vue', text: 'privacyDiagnostic.error', why: '本地 toUserMessage 结果，不是后端中文字段。' },
];

const proseFindings = [];
for (const file of walk(srcDir)) {
  const relativePath = relative(srcDir, file).split(sep).join('/');
  if (SKIP_FILES.includes(relativePath)) continue;
  if (relativePath.startsWith('i18n/locales/')) continue;

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

/*
 * 第五道门：语言包（src/i18n/locales/<locale>.ts）审计。
 *
 * 七种新语言的文案不进 defineMessages，而是按 moduleId 挂在语言包里。
 * 这里要拦的是 W4 翻译期会真实发生的错：
 *   - 包里写了不存在的 moduleId 或 zh 里没有的键（改了名、写错层）；
 *   - 缺的键没登记在 locales/<locale>.pending.txt（pending = 还没翻的清单，
 *     W4 把它清零才算翻完）；pending 里列了但包里已经写了的算 stale；
 *   - 叶子是空串；非中文包里出现 CJK；
 *   - 叶子和 en 那份逐字节相同（多半是忘了翻），除非登记在
 *     locales/allowlist-en.txt（品牌名、单位这类本来就不翻的）；
 *   - zh 是函数叶而包里不是，或参数个数对不上。
 * `node scripts/release/check-i18n.mjs --write-pending` 会按当前语言包
 * 重算出「缺哪些键」并回写各 pending.txt——bootstrap 和同步都靠它。
 */

const LOCALES_DIR = join(srcDir, 'i18n', 'locales');
const EXPECTED_PACK_LOCALES = ['nl', 'pt-BR', 'pt-PT', 'de', 'ru', 'hi-IN', 'fr'];

/* —— 极简文案表扫描器 ——
 * 不是真 parser：只对付 `key: '…'`、`key: {…}`、`key: (a,b)=>…`、
 * `key(a,b){…}`、`key: '…'+'…'`、`key: […]` 这类形状。不认得的结构
 * （spread、计算键、裸引用）记进 out.errors 让门禁红——文案表不该出现它们。
 */
const isIdentStart = (c) => /[A-Za-z_$]/.test(c);

const skipWsAndComments = (src, i) => {
  for (;;) {
    while (i < src.length && /\s/.test(src[i])) i += 1;
    if (src[i] === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i += 1;
      continue;
    }
    if (src[i] === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end < 0 ? src.length : end + 2;
      continue;
    }
    return i;
  }
};

/** i 在引号上：返回 { end, text }；text 是引号内原文（不解转义，比对用足够）。 */
const scanQuoted = (src, i) => {
  const quote = src[i];
  i += 1;
  let text = '';
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') { text += c + (src[i + 1] ?? ''); i += 2; continue; }
    if (c === quote) return { end: i + 1, text };
    text += c;
    i += 1;
  }
  return { end: i, text };
};

const scanExpr = (src, i, stops) => {
  const strings = [];
  let depth = 0;
  let isFn = false;
  let arity = null;
  let sawCode = false;
  const exprStart = i;
  while (i < src.length) {
    i = skipWsAndComments(src, i);
    if (i >= src.length) break;
    const c = src[i];
    if (c === "'" || c === '"') {
      const r = scanQuoted(src, i);
      strings.push(r.text);
      i = r.end;
      continue;
    }
    if (c === '`') {
      const r = scanTemplate(src, i);
      strings.push(...r.strings);
      i = r.end;
      continue;
    }
    if (depth === 0 && stops.includes(c)) break;
    if (depth === 0 && c === '=' && src[i + 1] === '>') {
      isFn = true;
      if (arity === null) arity = countParams(src.slice(exprStart, i));
      i += 2;
      sawCode = true;
      continue;
    }
    if (c === '(' || c === '[' || c === '{') { depth += 1; sawCode = true; i += 1; continue; }
    if (c === ')' || c === ']' || c === '}') {
      if (depth === 0) break;
      depth -= 1;
      i += 1;
      continue;
    }
    if (c === '+') { i += 1; continue; }
    sawCode = true;
    i += 1;
  }
  return { end: i, strings, isFn, arity, sawCode };
};

/** i 在 ` 上：收集静态片段与 ${} 表达式内的字符串。 */
function scanTemplate(src, i) {
  const strings = [];
  let buf = '';
  i += 1;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') { buf += c + (src[i + 1] ?? ''); i += 2; continue; }
    if (c === '`') { strings.push(buf); return { end: i + 1, strings }; }
    if (c === '$' && src[i + 1] === '{') {
      strings.push(buf);
      buf = '';
      const r = scanExpr(src, i + 2, '}');
      strings.push(...r.strings);
      i = src[r.end] === '}' ? r.end + 1 : r.end;
      continue;
    }
    buf += c;
    i += 1;
  }
  strings.push(buf);
  return { end: i, strings };
}

/** 从 `(a, b) =>` / `n =>` / `function(a)` 的参数段数参数个数。 */
function countParams(src) {
  let s = src.trim();
  if (s.startsWith('async ')) s = s.slice(6).trimStart();
  if (/^function\b/.test(s)) {
    const p = s.indexOf('(');
    s = p < 0 ? '' : s.slice(p);
  }
  if (s.startsWith('(')) {
    let depth = 0;
    let inner = '';
    for (const c of s) {
      if (c === '(') { if (depth > 0) inner += c; depth += 1; continue; }
      if (c === ')') { depth -= 1; if (depth === 0) break; inner += c; continue; }
      if (depth > 0) inner += c;
    }
    const t = inner.trim();
    if (!t) return 0;
    let d = 0;
    let n = 1;
    for (const c of t) {
      if (c === '(' || c === '[' || c === '{') d += 1;
      else if (c === ')' || c === ']' || c === '}') d -= 1;
      else if (c === ',' && d === 0) n += 1;
    }
    return n;
  }
  return 1; // 裸参数：`n => …`
}

/** i 在 open 上：扫到配对的 close（含），沿途收集字符串。 */
const scanBalanced = (src, i, open, close, collect = false) => {
  const strings = [];
  let depth = 0;
  while (i < src.length) {
    i = skipWsAndComments(src, i);
    const c = src[i];
    if (c === "'" || c === '"') {
      const r = scanQuoted(src, i);
      if (collect) strings.push(r.text);
      i = r.end;
      continue;
    }
    if (c === '`') {
      const r = scanTemplate(src, i);
      if (collect) strings.push(...r.strings);
      i = r.end;
      continue;
    }
    if (c === open) depth += 1;
    else if (c === close) {
      depth -= 1;
      if (depth === 0) return { end: i + 1, strings };
    }
    i += 1;
  }
  return { end: i, strings };
};

/**
 * 解析 `src[i] === '{'` 的对象字面量，返回结束下标。
 * 结果推进 out.leaves（path 是键路径数组），结构问题推进 out.errors。
 */
const parseObjectAt = (src, i, path, out) => {
  i = skipWsAndComments(src, i + 1);
  while (i < src.length) {
    i = skipWsAndComments(src, i);
    const c = src[i];
    if (c === '}') return i + 1;
    if (c === ',') { i += 1; continue; }
    if (src.startsWith('...', i)) {
      out.errors.push(`${path.join('.') || '(root)'}: 文案表不支持 spread`);
      const r = scanExpr(src, i + 3, ',}');
      i = r.end;
      continue;
    }
    let key;
    if (c === "'" || c === '"') {
      const r = scanQuoted(src, i);
      key = r.text;
      i = r.end;
    } else if (isIdentStart(c)) {
      const m = /^[A-Za-z0-9_$]+/.exec(src.slice(i));
      key = m[0];
      i += m[0].length;
    } else if (c === '[') {
      out.errors.push(`${path.join('.') || '(root)'}: 文案表不支持计算键`);
      const r = scanExpr(src, i + 1, ']');
      i = r.end;
      i = skipWsAndComments(src, i);
      if (src[i] === ':') { const rr = scanExpr(src, i + 1, ',}'); i = rr.end; }
      continue;
    } else {
      out.errors.push(
        `${path.join('.') || '(root)'}: 无法解析的成员 ${JSON.stringify(src.slice(i, i + 24))}`,
      );
      i += 1;
      continue;
    }
    i = skipWsAndComments(src, i);
    // get/set/async 这类修饰前缀后面还跟着一个键名才轮到值。
    while (isIdentStart(src[i])) {
      const m = /^[A-Za-z0-9_$]+/.exec(src.slice(i));
      key = m[0];
      i += m[0].length;
      i = skipWsAndComments(src, i);
    }
    const next = src[i];
    if (next === ':') {
      i = skipWsAndComments(src, i + 1);
      if (src[i] === '{') {
        i = parseObjectAt(src, i, [...path, key], out);
        continue;
      }
      if (src[i] === '[') {
        const r = scanExpr(src, i, ',}');
        out.leaves.push({ path: [...path, key], kind: 'array', arity: null, text: r.strings.join('') });
        i = r.end;
        continue;
      }
      const r = scanExpr(src, i, ',}');
      const kind = r.isFn ? 'function' : (r.strings.length > 0 && !r.sawCode ? 'string' : 'expr');
      out.leaves.push({ path: [...path, key], kind, arity: r.isFn ? r.arity : null, text: r.strings.join('') });
      i = r.end;
      continue;
    }
    if (next === '(') {
      // 方法简写 key(params) { body }
      const rp = scanBalanced(src, i, '(', ')');
      const arity = countParams(src.slice(i, rp.end));
      i = skipWsAndComments(src, rp.end);
      let text = '';
      if (src[i] === '{') {
        const r = scanBalanced(src, i, '{', '}', true);
        text = r.strings.join('');
        i = r.end;
      }
      out.leaves.push({ path: [...path, key], kind: 'function', arity, text });
      continue;
    }
    out.errors.push(`${[...path, key].join('.')}: 无法解析的成员值`);
    i += 1;
  }
  return i;
};

/** `views/Settings.i18n.ts` → `views/Settings`；`i18n/errors.ts` → `i18n/errors`。 */
const moduleIdFor = (relativePath) =>
  relativePath.replace(/\.(vue|ts)$/, '').replace(/\.i18n$/, '');

const leafMap = (out) => {
  const map = new Map();
  for (const leaf of out.leaves) map.set(leaf.path.join('.'), leaf);
  return map;
};

/** 扫全部源码，建 moduleId → { file, zh 叶表, en 叶表, bound } 注册表。 */
const discoverModules = () => {
  const modules = new Map();
  const problems = [];
  for (const file of walk(srcDir)) {
    const relativePath = relative(srcDir, file).split(sep).join('/');
    if (relativePath.startsWith('i18n/locales/')) continue;
    const source = readFileSync(file, 'utf8');
    if (!source.includes('defineMessages(')) continue;
    const moduleId = moduleIdFor(relativePath);
    let search = 0;
    let seen = false;
    for (;;) {
      const idx = source.indexOf('defineMessages(', search);
      if (idx < 0) break;
      search = idx + 'defineMessages('.length;
      let i = skipWsAndComments(source, search);
      if (source[i] !== '{') continue; // 注释里的提及、变量参数——跳过
      if (seen) {
        problems.push(`  ${relativePath}: 一个文件只允许一个 defineMessages（moduleId 会撞车）`);
      }
      seen = true;
      const zh = { leaves: [], errors: [] };
      i = parseObjectAt(source, i, [], zh);
      let en = null;
      let declaredId = null;
      // 剩下的参数：en 对象 / es 对象或变量 / 'moduleId' 字面量。
      // argIndex 只在真正吃掉一个值时递增，逗号不占位。
      let argIndex = 1;
      for (;;) {
        i = skipWsAndComments(source, i);
        if (source[i] === ')' || i >= source.length) break;
        if (source[i] === ',') { i += 1; continue; }
        if (source[i] === '{') {
          const o = { leaves: [], errors: [] };
          i = parseObjectAt(source, i, [], o);
          if (argIndex === 1) en = o;
          argIndex += 1;
          continue;
        }
        if (source[i] === "'" || source[i] === '"') {
          const r = scanQuoted(source, i);
          if (argIndex >= 2) declaredId = r.text;
          i = r.end;
          argIndex += 1;
          continue;
        }
        const r = scanExpr(source, i, ',)');
        i = r.end;
        argIndex += 1;
      }
      for (const e of zh.errors) problems.push(`  ${relativePath} zh: ${e}`);
      if (en) for (const e of en.errors) problems.push(`  ${relativePath} en: ${e}`);
      if (!en) problems.push(`  ${relativePath}: defineMessages 缺第二个（en）对象参数`);
      if (declaredId !== null && declaredId !== moduleId) {
        problems.push(
          `  ${relativePath}: defineMessages 第四参数 '${declaredId}' 与路径推导的 moduleId 不一致，应为 '${moduleId}'`,
        );
      }
      modules.set(moduleId, {
        file: relativePath,
        zh: leafMap(zh),
        en: en ? leafMap(en) : new Map(),
        bound: declaredId === moduleId,
      });
    }
  }
  return { modules, problems };
};

/** pending.txt / allowlist-en.txt：一行一条 `moduleId.键路径`，`#` 注释。 */
const parseKeyList = (file) => {
  const entries = [];
  if (!existsSync(file)) return entries;
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const dot = line.indexOf('.');
    if (dot < 0) {
      entries.push({ moduleId: null, key: line, malformed: true });
      continue;
    }
    entries.push({ moduleId: line.slice(0, dot), key: line.slice(dot + 1) });
  }
  return entries;
};

/** 读语言包文件，摊平成 moduleId → Map<键路径, leaf>。 */
const parsePack = (file) => {
  const source = readFileSync(file, 'utf8');
  const out = { leaves: [], errors: [] };
  const result = { modules: new Map(), errors: out.errors };
  const marker = source.indexOf('export default');
  if (marker < 0) {
    out.errors.push('缺 export default');
    return result;
  }
  const i = skipWsAndComments(source, marker + 'export default'.length);
  if (source[i] !== '{') {
    out.errors.push('export default 后面必须是对象字面量');
    return result;
  }
  parseObjectAt(source, i, [], out);
  for (const leaf of out.leaves) {
    const [section, ...rest] = leaf.path;
    if (section === 'modules') {
      const [moduleId, ...keyPath] = rest;
      if (!moduleId || keyPath.length === 0) {
        out.errors.push(`modules 下的键 ${leaf.path.join('.')} 形状不对`);
        continue;
      }
      if (!result.modules.has(moduleId)) result.modules.set(moduleId, new Map());
      result.modules.get(moduleId).set(keyPath.join('.'), leaf);
    } else if (section === 'errors') {
      if (!result.modules.has('i18n/errors')) result.modules.set('i18n/errors', new Map());
      result.modules.get('i18n/errors').set(rest.join('.'), leaf);
    } else if (section === 'backendText') {
      if (!result.modules.has('i18n/backendText')) result.modules.set('i18n/backendText', new Map());
      result.modules.get('i18n/backendText').set(rest.join('.'), leaf);
    } else {
      out.errors.push(`未知节 '${section}'（只认 modules/errors/backendText）`);
    }
  }
  return result;
};

const auditLocalePacks = (writePending) => {
  const problems = [];
  const { modules, problems: scanProblems } = discoverModules();
  problems.push(...scanProblems);

  const packFiles = existsSync(LOCALES_DIR)
    ? readdirSync(LOCALES_DIR).filter((name) => name.endsWith('.ts'))
    : [];
  const localesFound = packFiles.map((name) => name.replace(/\.ts$/, '')).sort();
  const missingPack = EXPECTED_PACK_LOCALES.filter((l) => !localesFound.includes(l));
  const extraPack = localesFound.filter((l) => !EXPECTED_PACK_LOCALES.includes(l));
  for (const l of missingPack) problems.push(`  缺语言包文件 src/i18n/locales/${l}.ts`);
  for (const l of extraPack) problems.push(`  多余的语言包文件 ${l}.ts（十语言注册表里没有它）`);

  const allowlist = new Set(
    parseKeyList(join(LOCALES_DIR, 'allowlist-en.txt')).map((e) => `${e.moduleId}.${e.key}`),
  );

  const packStats = [];
  for (const l of EXPECTED_PACK_LOCALES) {
    const file = join(LOCALES_DIR, `${l}.ts`);
    if (!existsSync(file)) continue;
    const pack = parsePack(file);
    for (const e of pack.errors) problems.push(`  locales/${l}.ts: ${e}`);
    const pending = parseKeyList(join(LOCALES_DIR, `${l}.pending.txt`));
    const pendingSet = new Set(pending.map((e) => `${e.moduleId}.${e.key}`));
    for (const e of pending) {
      if (e.malformed) {
        problems.push(`  locales/${l}.pending.txt: '${e.key}' 不是 moduleId.键路径 格式`);
        continue;
      }
      if (e.moduleId !== 'i18n/backendText' && !modules.has(e.moduleId)) {
        problems.push(`  locales/${l}.pending.txt: '${e.moduleId}.${e.key}' 的模块不存在`);
        continue;
      }
      if (e.moduleId !== 'i18n/backendText' && !modules.get(e.moduleId).zh.has(e.key)) {
        problems.push(`  locales/${l}.pending.txt: '${e.moduleId}.${e.key}' 在 zh 文案里没有这个键`);
      }
    }

    const missing = new Map(); // `${moduleId}.${key}` -> true
    for (const [moduleId, mod] of modules) {
      for (const key of mod.zh.keys()) missing.set(`${moduleId}.${key}`, true);
    }

    for (const [moduleId, packLeaves] of pack.modules) {
      if (moduleId === 'i18n/backendText') {
        for (const key of packLeaves.keys()) {
          if (!declaredUiCodes.has(key)) {
            problems.push(`  locales/${l}.ts backendText: '${key}' 不是后端声明的 ui.* 码`);
          }
        }
        continue;
      }
      const mod = modules.get(moduleId);
      if (!mod) {
        problems.push(`  locales/${l}.ts: moduleId '${moduleId}' 不存在（路径推导注册表里没有它）`);
        continue;
      }
      if (packLeaves.size > 0 && !mod.bound) {
        problems.push(
          `  locales/${l}.ts → ${moduleId}: 模块还没绑定 id——在 ${mod.file} 的 defineMessages 第四参数写 '${moduleId}'，否则这些译文不会生效`,
        );
      }
      for (const [key, leaf] of packLeaves) {
        const full = `${moduleId}.${key}`;
        missing.delete(full);
        const zhLeaf = mod.zh.get(key);
        if (!zhLeaf) {
          problems.push(`  locales/${l}.ts → ${full}: zh 文案里没有这个键`);
          continue;
        }
        if (pendingSet.has(full)) {
          problems.push(`  locales/${l}.ts → ${full}: 已翻译却还在 pending.txt 里（删掉那行）`);
        }
        if (leaf.kind === 'string' && leaf.text.trim() === '') {
          problems.push(`  locales/${l}.ts → ${full}: 空串叶子`);
        }
        if (CHINESE.test(leaf.text)) {
          problems.push(`  locales/${l}.ts → ${full}: 非中文语言包里出现 CJK`);
        }
        if (zhLeaf.kind === 'function') {
          if (leaf.kind !== 'function' || leaf.arity !== zhLeaf.arity) {
            problems.push(
              `  locales/${l}.ts → ${full}: zh 是 ${zhLeaf.arity} 参数函数叶，语言包必须同形`,
            );
          }
        } else if (leaf.kind === 'function') {
          problems.push(`  locales/${l}.ts → ${full}: zh 不是函数叶，语言包也不该是`);
        }
        const enLeaf = mod.en.get(key);
        if (
          leaf.kind === 'string' && enLeaf && enLeaf.kind === 'string'
          && leaf.text === enLeaf.text && leaf.text.trim() !== ''
          && !allowlist.has(full)
        ) {
          problems.push(
            `  locales/${l}.ts → ${full}: 与 en 逐字节相同（忘了翻？不翻就登记 allowlist-en.txt）`,
          );
        }
      }
    }

    if (writePending) {
      const lines = [
        '# 尚未覆盖的键（i18n:check --write-pending 生成；W4 翻译一行删一行）。',
        '# 格式：moduleId.键路径。',
        ...[...missing.keys()].sort(),
        '',
      ];
      writeFileSync(join(LOCALES_DIR, `${l}.pending.txt`), lines.join('\n'));
      packStats.push(`${l}: ${missing.size} pending`);
      continue;
    }
    for (const full of missing.keys()) {
      if (!pendingSet.has(full)) {
        problems.push(`  locales/${l}.ts → ${full}: 缺键且不在 ${l}.pending.txt 里`);
      }
    }
    packStats.push(`${l}: ${missing.size} pending`);
  }
  const unbound = [...modules.values()].filter((m) => !m.bound).length;
  return { problems, packStats, unbound, moduleCount: modules.size };
};

const writePendingMode = process.argv.includes('--write-pending');
const packAudit = auditLocalePacks(writePendingMode);

if (packAudit.problems.length) {
  console.error('语言包检查未通过：');
  console.error('');
  for (const p of packAudit.problems) console.error(p);
  console.error('');
  console.error('模块的 moduleId 由文件路径推导（见 src/i18n/index.ts 头注释）；');
  console.error('还没翻的键登记在 locales/<locale>.pending.txt，一行一条 moduleId.键路径。');
  process.exit(1);
}
if (writePendingMode) {
  console.log(`pending 已重算并回写：${packAudit.packStats.join('；')}`);
  process.exit(0);
}

console.log(
  `界面文案检查通过：没有硬编码的中文；${declaredCodes.size} 个后端错误码都有中英文案；`
  + `${declaredUiCodes.size} 个界面文案码都已处理；后端原文字段只在登记过的兜底处使用；`
  + `语言包 ${packAudit.packStats.join('；')}（${packAudit.moduleCount} 个模块，`
  + `${packAudit.unbound} 个待绑定 moduleId）。`,
);
