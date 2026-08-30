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

console.log('界面文案检查通过：没有硬编码的中文。');
