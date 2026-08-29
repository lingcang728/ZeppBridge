#!/usr/bin/env node
/**
 * 首屏体积预算。
 *
 * 量的是「打开应用为了看到第一屏必须先加载多少」，也就是 index.html 里的
 * 入口脚本、它 modulepreload 的 chunk，和入口样式表——而不是 dist 目录的
 * 总大小。总大小会把懒加载 chunk 和字体也算进去，结果是加一个新页面就让
 * 数字上涨，谁也不知道该不该管。
 *
 * 文件名带哈希，所以这里从 index.html 的引用关系去找文件，不去猜文件名，
 * 也就不需要每次构建后人工看一眼。
 *
 * 用法:
 *   node scripts/release/check-bundle-budget.mjs           检查
 *   node scripts/release/check-bundle-budget.mjs --update  把当前值写回基线
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const distDir = join(repoRoot, 'dist');
const budgetPath = join(repoRoot, 'bundle-budget.json');

if (!existsSync(join(distDir, 'index.html'))) {
  console.error('找不到 dist/index.html。请先 npm run build。');
  process.exit(2);
}

const html = readFileSync(join(distDir, 'index.html'), 'utf8');

/** index.html 里直接引用的资源，就是首屏必须加载的那一批。 */
const collect = (pattern) => {
  const found = [];
  for (const match of html.matchAll(pattern)) {
    const href = match[1].replace(/^\.\//, '');
    const file = join(distDir, href);
    if (!existsSync(file)) {
      console.error(`index.html 引用了不存在的文件：${href}`);
      process.exit(2);
    }
    found.push({ href, gzip: gzipSync(readFileSync(file)).length });
  }
  return found;
};

const scripts = [
  ...collect(/<script[^>]+src="([^"]+\.js)"/g),
  ...collect(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+\.js)"/g),
];
const styles = collect(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+\.css)"/g);

if (scripts.length === 0) {
  console.error('没有在 index.html 里找到入口脚本；构建产物可能不完整。');
  process.exit(2);
}

const sum = (items) => items.reduce((total, item) => total + item.gzip, 0);
const actual = { initialJsGzip: sum(scripts), initialCssGzip: sum(styles) };

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;

if (process.argv.includes('--update')) {
  const budget = existsSync(budgetPath)
    ? JSON.parse(readFileSync(budgetPath, 'utf8'))
    : {};
  budget.baseline = actual;
  // 预留 15% 余量：预算是用来挡住「一次提交多出 300 kB」的，
  // 不是用来在每次正常改动后都逼人重跑一次 --update。
  budget.limits = {
    initialJsGzip: Math.ceil((actual.initialJsGzip * 1.15) / 1024) * 1024,
    initialCssGzip: Math.ceil((actual.initialCssGzip * 1.15) / 1024) * 1024,
  };
  budget.note =
    '首屏加载体积（gzip）。initialJs 含入口脚本与 index.html modulepreload 的 chunk；懒加载的页面 chunk 不计入。用 npm run budget:update 刷新。';
  writeFileSync(budgetPath, `${JSON.stringify(budget, null, 2)}\n`);
  console.log(`已写入基线：JS ${kb(actual.initialJsGzip)} / CSS ${kb(actual.initialCssGzip)}`);
  process.exit(0);
}

if (!existsSync(budgetPath)) {
  console.error('缺少 bundle-budget.json。先跑 npm run budget:update 建立基线。');
  process.exit(2);
}
const budget = JSON.parse(readFileSync(budgetPath, 'utf8'));

console.log('首屏加载体积（gzip）');
for (const item of [...scripts, ...styles]) {
  console.log(`  ${item.href.padEnd(44)} ${kb(item.gzip).padStart(10)}`);
}

let failed = false;
for (const [key, limit] of Object.entries(budget.limits ?? {})) {
  const value = actual[key];
  const baseline = budget.baseline?.[key];
  const delta = baseline ? value - baseline : 0;
  const sign = delta >= 0 ? '+' : '';
  const line = `${key}: ${kb(value)} / 上限 ${kb(limit)}（基线 ${kb(baseline ?? 0)}，${sign}${kb(delta)}）`;
  if (value > limit) {
    console.error(`超出预算 ${line}`);
    failed = true;
  } else {
    console.log(`OK ${line}`);
  }
}

if (failed) {
  console.error(
    '\n首屏体积超出预算。要么把新增的重模块改成懒加载，要么在确认这次增长值得之后跑 npm run budget:update 并在提交里说明原因。',
  );
  process.exit(1);
}
