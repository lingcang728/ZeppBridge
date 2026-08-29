#!/usr/bin/env node
/**
 * Markdown 相对链接检查。
 *
 * 文档改名和移动是常事，而坏掉的链接不会让任何构建失败——它只会让读者点进
 * 一个 404。这个检查只管仓库内的相对链接：外部 URL 不在这里验证（那需要
 * 联网，而且会因为别人的服务抖动而随机变红）。
 *
 * 用法: node scripts/release/check-doc-links.mjs
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
// temp/ 是被 gitignore 的第三方参考仓库；它们的链接不是我们的责任，
// 在 CI 上也根本不存在。
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'target',
  '.git',
  'release',
  '.omo',
  'temp',
]);

const markdownFiles = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (entry.endsWith('.md')) markdownFiles.push(full);
  }
};
walk(repoRoot);

const LINK = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
let broken = 0;
let checked = 0;

for (const file of markdownFiles) {
  const text = readFileSync(file, 'utf8');
  // 代码块里的链接是示例，不是真链接。
  const withoutCode = text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  for (const match of withoutCode.matchAll(LINK)) {
    const href = match[1];
    if (/^(https?:|mailto:|#)/.test(href)) continue;
    checked += 1;
    // 去掉锚点；不校验锚点本身，那需要解析每份文档的标题，
    // 收益远小于维护成本。
    const target = join(dirname(file), decodeURIComponent(href.split('#')[0]));
    if (!href.split('#')[0]) continue;
    if (!existsSync(target)) {
      console.error(`${relative(repoRoot, file)} → ${href}`);
      broken += 1;
    }
  }
}

if (broken > 0) {
  console.error(`\n${broken} 个相对链接指向不存在的文件。`);
  process.exit(1);
}
console.log(`${markdownFiles.length} 份文档，${checked} 个仓库内链接全部有效。`);
