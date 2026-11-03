#!/usr/bin/env node
/**
 * package-lock.json 的 resolved 必须指向 registry.npmjs.org。
 *
 * 本机全局 registry 是 npmmirror，装新依赖时 npm 会把镜像地址写进锁文件。
 * 镜像地址在 npm 12 里算「remote」包，`npm ci` 直接拒绝（EALLOWREMOTE），
 * 外部贡献者只能退回 npm 10 才装得上。锁文件写官方地址并不影响本机：
 * npm 默认 replace-registry-host=npmjs，安装时会自动换成你配置的镜像。
 *
 * 修法：sed 's#https://registry.npmmirror.com/#https://registry.npmjs.org/#' package-lock.json
 *
 * 用法: node scripts/release/check-lockfile-registry.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const lock = JSON.parse(readFileSync(resolve(repoRoot, 'package-lock.json'), 'utf8'));

const OFFICIAL = 'https://registry.npmjs.org/';
const offenders = Object.entries(lock.packages ?? {})
  .filter(([, entry]) => typeof entry.resolved === 'string' && !entry.resolved.startsWith(OFFICIAL))
  .map(([path, entry]) => `${path || '(root)'} → ${entry.resolved}`);

if (offenders.length > 0) {
  console.error(`package-lock.json 有 ${offenders.length} 条 resolved 不是 ${OFFICIAL}：`);
  for (const line of offenders.slice(0, 10)) console.error(`  ${line}`);
  if (offenders.length > 10) console.error(`  …另外 ${offenders.length - 10} 条`);
  console.error('npm 12 会拒绝这些地址（EALLOWREMOTE）。修法见本脚本开头注释。');
  process.exit(1);
}
console.log(`package-lock.json：${Object.keys(lock.packages ?? {}).length} 个条目都指向官方源`);
