#!/usr/bin/env node
/**
 * 给构建好的网站（.site-cache/site-dist）补上线所需的几个文件。`build:web` 末尾和 `site:deploy` 开头都会跑，
 * 重复跑结果一样。
 *
 * - robots.txt：允许收录（2026-10-14 zeppbridge.com 转正，去掉预览期的 noindex）。
 * - _headers：基础安全头；不再带 X-Robots-Tag。
 * - 404.html：没有它时 Pages 会把任何未知路径回落成 index.html（200），/api/* 的拼错地址也会「看起来存在」。
 * - letters/、changelog/：作者来信归档与更新日志（静态页，见 letters.mjs、changelog.mjs）。
 * - _routes.json：只有 /、/index.html、/api/* 进函数（functions/_middleware.js 的域名跳转 + 接口），
 *   静态资源直接出，不占函数调用额度。
 *
 * 部署：`npm run site:deploy`，在仓库根目录执行，wrangler 会把 functions/ 和 wrangler.jsonc 的 D1 绑定一起带上。
 * 部署前先看 `npx wrangler d1 migrations list zeppbridge-feedback --remote`，有没跑的迁移先 apply。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readReleaseNotes, renderChangelog } from './changelog.mjs';
import { readLetters, renderLetterArchive } from './letters.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const site = join(repo, '.site-cache/site-dist');
if (!existsSync(join(site, 'index.html'))) throw new Error(`No website build at ${site}; run npm run build:web first.`);

writeFileSync(join(site, 'robots.txt'), 'User-agent: *\nAllow: /\nDisallow: /api/\n');
writeFileSync(join(site, '_headers'), '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n');
writeFileSync(join(site, '_routes.json'), `${JSON.stringify({ version: 1, include: ['/', '/index.html', '/api/*'], exclude: [] }, null, 2)}\n`);
writeFileSync(
  join(site, '404.html'),
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<title>ZeppBridge · 404</title>'
    + '<style>html{color-scheme:dark;background:#05070a;color:#f3f5f0;font:16px/1.6 system-ui,sans-serif}'
    + 'main{display:grid;min-height:100vh;place-content:center;text-align:center}a{color:#8fc24a}</style></head>'
    + '<body><main><h1>404</h1><p><a href="/">ZeppBridge</a></p></main></body></html>\n',
);
// 作者来信归档（/letters）：每封信一页静态 HTML，不进函数。
const letters = renderLetterArchive(readLetters(join(repo, 'docs/releases/letters')));
// 更新日志（/changelog）：只收已经打了 v<版本> 标签的版本，没发的不会提前上网。
const tags = new Map(execFileSync('git', ['for-each-ref', 'refs/tags/v*', '--format=%(refname:short) %(creatordate:short)'], { cwd: repo, encoding: 'utf8' })
  .split('\n').map((line) => line.trim().split(' ')).filter(([tag]) => /^v\d+\.\d+\.\d+$/.test(tag ?? '')).map(([tag, date]) => [tag.slice(1), date ?? '']));
// 一个标签都没有多半是浅克隆：宁可报错，也不发一张空日志。
if (!tags.size) throw new Error('No v* tags found; fetch tags (git fetch --tags) before finishing the website.');
const changelog = renderChangelog(readReleaseNotes(join(repo, 'docs/releases')), tags);
for (const [path, html] of [...letters, ...changelog]) {
  mkdirSync(dirname(join(site, path)), { recursive: true });
  writeFileSync(join(site, path), html);
}
console.log(`Website files ready for production: ${site} (${letters.size} letter pages, ${changelog.size} changelog pages)`);
