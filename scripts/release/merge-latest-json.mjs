#!/usr/bin/env node
/**
 * 把 Windows 与 macOS 的 updater 元数据合并成一份 latest.json。
 *
 * Tauri 的每个平台构建各自生成一份 latest.json，而 updater 端点只能有一个
 * 文件。Windows 侧的 latest.json 由 scripts/windows/publish-local.ps1 生成
 * （含 version / notes / pub_date / platforms.windows-x86_64），这里只负责
 * 补上 macOS 平台条目。
 *
 * macOS 的更新产物是 `.app.tar.gz`（不是 dmg）。dmg 仅供手动下载，updater
 * 永远不会去取它。
 *
 * 用法：
 *   node scripts/release/merge-latest-json.mjs \
 *     --windows-latest release/latest.json \
 *     --mac-signature dist-macos/ZeppBridge_1.2.3_aarch64.app.tar.gz.sig \
 *     --mac-asset ZeppBridge_1.2.3_aarch64.app.tar.gz \
 *     --version 1.2.3 \
 *     --repo lingcang728/ZeppBridge \
 *     --out release/latest.json
 */

import { readFileSync, writeFileSync } from 'node:fs';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  if (!key?.startsWith('--')) fail(`无法识别的参数：${key}`);
  args.set(key.slice(2), process.argv[index + 1]);
}

const required = ['windows-latest', 'mac-signature', 'mac-asset', 'version', 'repo', 'out'];
for (const key of required) {
  if (!args.get(key)) fail(`缺少必需参数 --${key}`);
}

function fail(message) {
  console.error(`merge-latest-json: ${message}`);
  process.exit(1);
}

const version = args.get('version');

let latest;
try {
  latest = JSON.parse(readFileSync(args.get('windows-latest'), 'utf8'));
} catch (error) {
  fail(`读取 Windows latest.json 失败：${error.message}`);
}

// 版本对不上说明两个平台构建自不同的提交，合并出来的 latest.json 会让某个
// 平台下载到错误的包，宁可直接失败。
if (latest.version !== version) {
  fail(`Windows latest.json 的版本是 ${latest.version}，与本次发布的 ${version} 不一致`);
}
if (!latest.platforms?.['windows-x86_64']?.signature) {
  fail('Windows latest.json 缺少 windows-x86_64 签名条目');
}

const signature = readFileSync(args.get('mac-signature'), 'utf8').trim();
if (!signature) fail('macOS updater 签名为空');

latest.platforms['darwin-aarch64'] = {
  signature,
  url: `https://github.com/${args.get('repo')}/releases/download/v${version}/${args.get('mac-asset')}`,
};

writeFileSync(args.get('out'), `${JSON.stringify(latest, null, 2)}\n`, 'utf8');
console.log(`已写出 ${args.get('out')}，平台：${Object.keys(latest.platforms).join('、')}`);
