/**
 * 从七个语言包里删掉同名键：zh 文案删了某个键，语言包里留着的译文会被 i18n:check
 * 当成「zh 文案里没有这个键」拦下来，所以删键必须同一提交删干净。
 *
 *   node scripts/release/drop-locale-keys.mjs <moduleId> <键> [<键> ...]
 *
 * 键写 zh 里的键名；带点的键（'weekly.hrv'）先按整名找，找不到再按嵌套路径找。
 * 按 TypeScript 语法树删属性，多行函数叶、模板串都能整条删掉。删完记得
 * `npm run i18n:check -- --write-pending` 重算 pending。
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LOCALES = join(ROOT, 'src', 'i18n', 'locales');

const args = process.argv.slice(2);
const sourceAt = args.indexOf('--source');
const source = sourceAt >= 0 ? args.splice(sourceAt, 2)[1] : null;
const [moduleId, ...keys] = args;
if (!moduleId || keys.length === 0) {
  console.error('用法：node scripts/release/drop-locale-keys.mjs <moduleId> <键> [<键> ...] [--source <*.i18n.ts>]');
  console.error('  --source：顺带从这份源文案的 defineMessages(zh, en, es) 里删掉同名键。');
  process.exit(2);
}

const nameOf = (prop) => (prop.name && (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) ? prop.name.text : null);
const objectProps = (node) => (node && ts.isObjectLiteralExpression(node) ? node.properties : []);
const findProp = (props, name) => props.find((p) => nameOf(p) === name);
const valueOf = (prop) => (prop && ts.isPropertyAssignment(prop) ? prop.initializer : null);

const locate = (props, key) => {
  const whole = findProp(props, key);
  if (whole) return whole;
  const parts = key.split('.');
  let current = props;
  for (let i = 0; i < parts.length - 1; i += 1) current = objectProps(valueOf(findProp(current, parts[i])));
  return findProp(current, parts[parts.length - 1]);
};

/** 属性所在整行（含前导缩进、尾随逗号与换行）都删掉，不留空行。 */
const rangeOf = (text, prop, sf) => {
  let start = prop.getStart(sf);
  while (start > 0 && (text[start - 1] === ' ' || text[start - 1] === '\t')) start -= 1;
  let end = prop.end;
  while (text[end] === ' ' || text[end] === '\t') end += 1;
  if (text[end] === ',') end += 1;
  while (text[end] === ' ' || text[end] === '\t') end += 1;
  if (text[end] === '\r') end += 1;
  if (text[end] === '\n') end += 1;
  return [start, end];
};

const dropRanges = (text, ranges) => {
  let next = text;
  for (const [start, end] of ranges.sort((a, b) => b[0] - a[0])) next = next.slice(0, start) + next.slice(end);
  return next;
};

if (source) {
  const path = join(ROOT, source);
  const text = readFileSync(path, 'utf8');
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const ranges = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'defineMessages') {
      for (const arg of node.arguments) {
        for (const key of keys) {
          const prop = locate(objectProps(arg), key);
          if (prop) ranges.push(rangeOf(text, prop, sf));
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  writeFileSync(path, dropRanges(text, ranges));
  console.log(`${source}: 删掉 ${ranges.length} 个（zh / en / es 合计）`);
}

let total = 0;
for (const file of readdirSync(LOCALES).filter((f) => f.endsWith('.ts'))) {
  const path = join(LOCALES, file);
  const text = readFileSync(path, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const exported = sf.statements.find(ts.isExportAssignment);
  let pack = exported?.expression;
  while (pack && (ts.isAsExpression(pack) || ts.isSatisfiesExpression?.(pack) || ts.isParenthesizedExpression(pack))) pack = pack.expression;
  const modules = objectProps(valueOf(findProp(objectProps(pack), 'modules')));
  const mod = objectProps(valueOf(findProp(modules, moduleId)));
  const ranges = keys.map((key) => locate(mod, key)).filter(Boolean).map((prop) => rangeOf(text, prop, sf));
  if (ranges.length === 0) continue;
  writeFileSync(path, dropRanges(text, ranges));
  total += ranges.length;
  console.log(`${file}: 删掉 ${ranges.length} 个`);
}
console.log(`共删掉 ${total} 个（${moduleId}）`);
