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
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
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

/* index.html 看不到的部分：默认路由（/ → Overview）是 router 里的 import()，
   它自己和它同步依赖的 chunk 同样在首屏关键路径上。下面把这一层也计入报告。
   只报告、不设阈值——真正挡回归的仍是上面 initialJs/initialCss 两条线。 */
const assetDir = join(distDir, 'assets');
const assetNames = existsSync(assetDir) ? readdirSync(assetDir) : [];

const readAsset = (name) => {
  const file = join(assetDir, name);
  if (!existsSync(file)) return null;
  return { href: `assets/${name}`, gzip: gzipSync(readFileSync(file)).length };
};

/* 只认同步依赖：from "…" 与裸 import "…" 的相对路径引用。
   import("…") 动态引用刻意不算——被懒加载挪出关键路径的正是那一部分。 */
const staticDepsOf = (name) => {
  const deps = new Set();
  for (const match of readFileSync(join(assetDir, name), 'utf8')
    .matchAll(/(?:from\s*|import\s*)["'](\.[^"']+\.js)["']/g)) {
    deps.add(match[1].replace(/^\.\//, ''));
  }
  return [...deps];
};

const entryNames = new Set(scripts.map((item) => item.href.replace(/^assets\//, '')));
const routeChunk = assetNames.find((name) => /^Overview-[^/]*\.js$/.test(name));
const routeDeps = new Set();
if (routeChunk) {
  const queue = [routeChunk];
  while (queue.length) {
    const name = queue.shift();
    // 已在入口/modulepreload 里计过的不重复算。
    if (routeDeps.has(name) || entryNames.has(name)) continue;
    routeDeps.add(name);
    queue.push(...staticDepsOf(name));
  }
}
const routeItems = [...routeDeps].map(readAsset).filter(Boolean);
const routeJsGzip = sum(routeItems);
const routeCssItems = assetNames
  .filter((name) => /^Overview-[^/]*\.css$/.test(name))
  .map(readAsset)
  .filter(Boolean);
const routeCssGzip = sum(routeCssItems);

console.log('\n默认路由（/ → Overview）及其同步依赖（同样在首屏关键路径上）');
if (!routeChunk) {
  console.log('  未找到 Overview-*.js——路由 chunk 的命名可能变了，这份统计漏掉了它。');
} else {
  for (const item of [...routeItems, ...routeCssItems]) {
    console.log(`  ${item.href.padEnd(44)} ${kb(item.gzip).padStart(10)}`);
  }
  const total = `  ${'首屏关键路径合计'.padEnd(44)} ${kb(actual.initialJsGzip + routeJsGzip).padStart(10)} JS + ${kb(actual.initialCssGzip + routeCssGzip)} CSS`;
  console.log(total);
}

/* 图表引擎理应永远落在懒加载侧。哪天它出现在上面任何一份清单里，
   就是有人把图表静态 import 回了首屏。 */
const chartsChunk = assetNames.find((name) => /^charts-[^/]*\.js$/.test(name));
if (chartsChunk) {
  const chartsItem = readAsset(chartsChunk);
  const onCriticalPath = entryNames.has(chartsChunk) || routeDeps.has(chartsChunk);
  console.log(`\n图表引擎 chunk：${chartsItem.href} ${kb(chartsItem.gzip)}（${onCriticalPath ? '在首屏关键路径上——回归！' : '懒加载，不在首屏关键路径'}）`);
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
