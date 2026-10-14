#!/usr/bin/env node
/**
 * 给构建好的网站（.site-cache/site-dist）补上线所需的几个文件。`build:web` 末尾和 `site:deploy` 开头都会跑，
 * 重复跑结果一样。
 *
 * - robots.txt：允许收录（2026-10-14 zeppbridge.com 转正，去掉预览期的 noindex）。
 * - _headers：基础安全头；不再带 X-Robots-Tag。
 * - 404.html：没有它时 Pages 会把任何未知路径回落成 index.html（200），/api/* 的拼错地址也会「看起来存在」。
 * - _routes.json：只有 /、/index.html、/api/* 进函数（functions/_middleware.js 的域名跳转 + 接口），
 *   静态资源直接出，不占函数调用额度。
 *
 * 部署：`npm run site:deploy`，在仓库根目录执行，wrangler 会把 functions/ 和 wrangler.jsonc 的 D1 绑定一起带上。
 * 部署前先看 `npx wrangler d1 migrations list zeppbridge-feedback --remote`，有没跑的迁移先 apply。
 */
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = resolve(dirname(fileURLToPath(import.meta.url)), '../../.site-cache/site-dist');
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
console.log(`Website files ready for production: ${site}`);
