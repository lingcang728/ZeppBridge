#!/usr/bin/env node
/**
 * zeppbridge.com 预览站：把落地页部署到**独立的** Cloudflare Pages 项目 `zeppbridge-site`。
 *
 * 和老项目 `zeppbridge`（zeppbridge.pages.dev，带 functions：/api/release、官方授权中转、反馈）
 * 完全分开：
 *   - 只发静态的 dist，不带 functions/ —— 所以在临时目录里部署，仓库里的 functions/ 和
 *     wrangler.jsonc（老项目的绑定）都不会被 wrangler 捡进去；
 *   - 预览期不让搜索引擎收录：每个响应带 `X-Robots-Tag: noindex, nofollow`，robots.txt 全部 Disallow；
 *   - 补一个 404.html：Pages 没有 404.html 时会把任何未知路径当单页应用回落成 index.html（200），
 *     /api/* 就会「看起来存在」。有了它，未知路径（包括 /api/*）老老实实回 404，
 *     落地页的下载按钮读 /api/release 失败后退回 GitHub Releases。
 *
 * 用法：
 *   node scripts/site/deploy-preview.mjs            构建 + 部署
 *   node scripts/site/deploy-preview.mjs --dry-run  只构建、准备好目录，打印路径，不部署
 *
 * 部署要本机 wrangler 已登录（npx wrangler login）。绑定 zeppbridge.com、www 301 到裸域
 * 在 Cloudflare 控制台做（Pages 自定义域 + 一条重定向规则），这个脚本不碰 DNS。
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT = 'zeppbridge-site';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dryRun = process.argv.includes('--dry-run');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });

run(npm, ['run', 'build:web'], root);

const out = mkdtempSync(join(tmpdir(), `${PROJECT}-`));
const site = join(out, 'dist');
cpSync(join(root, 'dist'), site, { recursive: true });

writeFileSync(join(site, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
writeFileSync(join(site, '_headers'), '/*\n  X-Robots-Tag: noindex, nofollow\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Content-Type-Options: nosniff\n');
writeFileSync(
  join(site, '404.html'),
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<meta name="robots" content="noindex"><title>ZeppBridge · 404</title>'
    + '<style>html{color-scheme:dark;background:#05070a;color:#f3f5f0;font:16px/1.6 system-ui,sans-serif}'
    + 'main{display:grid;min-height:100vh;place-content:center;text-align:center}a{color:#8fc24a}</style></head>'
    + '<body><main><h1>404</h1><p><a href="/">ZeppBridge</a></p></main></body></html>\n',
);

if (dryRun) {
  console.log(`\n预览站目录已准备好（未部署）：${site}`);
  process.exit(0);
}

// 项目不存在时先建；已存在会报错，忽略即可。
try {
  run(npx, ['wrangler', 'pages', 'project', 'create', PROJECT, '--production-branch', 'main'], out);
} catch {
  console.log(`（${PROJECT} 已存在，直接部署）`);
}
run(npx, ['wrangler', 'pages', 'deploy', site, '--project-name', PROJECT, '--branch', 'main', '--commit-dirty=true'], out);
