#!/usr/bin/env node
/**
 * 版本号一致性检查。
 *
 * 版本号散落在六个文件里，其中几处只在特定路径上才会被读到——
 * `App.vue` 的 FALLBACK_APP_VERSION 只在浏览器预览里出现，crate 版本只在
 * CLI/MCP 的 `--version` 里出现。少改一处不会有任何报错，只会在发版之后
 * 由用户发现：安装的是 1.0.0，命令行说自己是 0.11.0。
 *
 * 用法:
 *   node scripts/release/check-version-consistency.mjs        检查
 *   node scripts/release/check-version-consistency.mjs 1.0.0  改成这个版本
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** 每个位置给一个只匹配版本行的正则，捕获组 1 就是版本号本身。 */
const SITES = [
  { file: 'package.json', pattern: /("version":\s*")([0-9][^"]*)(")/ },
  { file: 'src-tauri/tauri.conf.json', pattern: /("version":\s*")([0-9][^"]*)(")/ },
  { file: 'src-tauri/Cargo.toml', pattern: /(\nversion = ")([0-9][^"]*)(")/ },
  { file: 'src-tauri/crates/core/Cargo.toml', pattern: /(\nversion = ")([0-9][^"]*)(")/ },
  { file: 'src-tauri/crates/cli/Cargo.toml', pattern: /(\nversion = ")([0-9][^"]*)(")/ },
  { file: 'src-tauri/crates/mcp/Cargo.toml', pattern: /(\nversion = ")([0-9][^"]*)(")/ },
  { file: 'src/App.vue', pattern: /(const FALLBACK_APP_VERSION = ')([0-9][^']*)(')/ },
];

const target = process.argv[2];
if (target && !/^\d+\.\d+\.\d+$/.test(target)) {
  console.error(`版本号要写成 x.y.z，收到：${target}`);
  process.exit(2);
}

const found = [];
for (const site of SITES) {
  const path = join(repoRoot, site.file);
  const text = readFileSync(path, 'utf8');
  const match = site.pattern.exec(text);
  if (!match) {
    console.error(`在 ${site.file} 里没有找到版本号。检查脚本的正则是不是过期了。`);
    process.exit(2);
  }
  found.push({ ...site, path, text, current: match[2] });
}

if (target) {
  for (const site of found) {
    if (site.current === target) continue;
    writeFileSync(site.path, site.text.replace(site.pattern, `$1${target}$3`));
    console.log(`${site.file}: ${site.current} → ${target}`);
  }
  console.log(
    '\n改完记得跑一次 cargo check（Cargo.lock 里的 workspace 成员版本要跟着更新）。',
  );
  process.exit(0);
}

const versions = new Set(found.map((site) => site.current));
for (const site of found) {
  console.log(`  ${site.file.padEnd(38)} ${site.current}`);
}
if (versions.size > 1) {
  console.error(
    `\n版本号不一致：${[...versions].join('、')}。用 node scripts/release/check-version-consistency.mjs <版本> 统一。`,
  );
  process.exit(1);
}
console.log(`\n全部一致：${[...versions][0]}`);
