#!/usr/bin/env node
/**
 * 版本号一致性检查。
 *
 * 版本号散落在九个位置，其中几处只在特定路径上才会被读到——
 * `App.vue` 的 FALLBACK_APP_VERSION 只在浏览器预览里出现，crate 版本只在
 * CLI/MCP 的 `--version` 里出现。少改一处不会有任何报错，只会在发版之后
 * 由用户发现：安装的是 1.0.0，命令行说自己是 0.11.0。
 *
 * 文档也算在内。架构文档开头那句「本文描述 v1.0.0 的产品边界」是一个承诺，
 * 漏改之后它就变成了一句假话——读的人以为看的是当前版本的边界。
 *
 * 注意哪些**不该**被算进来：README 里「1.0.0 起，本机数据库的结构开始被当作
 * 要长期维护的东西」是历史陈述，永远指向 1.0.0，不跟着版本走；
 * 两个 README 的版本徽章是 shields.io 动态读 GitHub Release 的，也不用管。
 *
 * **这个脚本只改版本号，不改日期。** AppStream 的 `<release>` 上还有一个
 * `date=`，软件商店拿它排「最近更新」。它得手动改，脚本没法替你判断今天算
 * 哪一天（打 tag 和改版本号常常不在同一天）。2.1.1 这一版就差点漏掉。
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
  // 两份架构文档都要盯。只盯一份的话，另一份的版本号会惄惄过期，
  // 而读到它的人没有任何线索知道那个数字是错的。
  {
    file: 'docs/reference/architecture.md',
    pattern: /(implementation of v)([0-9][0-9.]*)(\.)/,
  },
  {
    file: 'docs/reference/architecture.zh-CN.md',
    pattern: /(本文描述 v)([0-9][^\s]*?)( 的产品边界)/,
  },
  // AppStream 的 <release> 是 GNOME Software / KDE Discover 展示给用户的
  // 版本号。漏改不会让构建失败，也不会让 Flatpak 装不上——只会让软件商店里
  // 显示的版本和实际装进去的那个不一致，而看到它的人没有任何线索。
  {
    file: 'packaging/flatpak/com.zeppbridge.app.metainfo.xml',
    pattern: /(<release version=")([0-9][^"]*)(")/,
  },
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
