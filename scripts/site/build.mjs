#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const node = process.execPath;
const run = (exe, args) => new Promise((ok, fail) => {
  const child = spawn(exe, args, { cwd: root, stdio: 'inherit', windowsHide: true });
  child.on('error', fail); child.on('close', code => code === 0 ? ok() : fail(new Error(`${exe} exited ${code}`)));
});
// Search installed tools only. No downloads or package installation during a website build.
const python = process.env.LANDING_PYTHON || ['python', 'python3'].find(exe => spawnSync(exe, ['-c', 'import playwright'], { windowsHide: true }).status === 0);
if (!python) throw new Error('Set LANDING_PYTHON to the existing Python environment with Playwright.');
await run(node, ['node_modules/vue-tsc/bin/vue-tsc.js', '--noEmit']);
await run(node, ['node_modules/vitest/vitest.mjs', 'run', 'src/demo/__tests__', 'src/views/landing/__tests__', 'src/composables/__tests__/useLandingLocale.test.ts']);
const port = await new Promise(ok => { const socket = createNetServer(); socket.listen(0, '127.0.0.1', () => { const port = socket.address().port; socket.close(() => ok(port)); }); });
const server = await createServer({ root, mode: 'site', server: { host: '127.0.0.1', port, strictPort: true, hmr: false } });
try {
  await server.listen();
  await run(python, ['scripts/site/verify-demo.py', '--url', `http://127.0.0.1:${port}`]);
  await run(python, ['scripts/site/capture-features.py', '--all', '--url', `http://127.0.0.1:${port}`]);
} finally { await server.close(); }
// 开场短片的配乐是合成出来的（和其他网站媒体一样放 .site-cache/media，不进 git）：缺了就现做一份，不下载任何东西。
if (!existsSync(resolve(root, '.site-cache/media/film-score.m4a'))) await run(python, ['scripts/site/compose-score.py']);
await run(node, ['node_modules/vite/bin/vite.js', 'build', '--mode', 'site']);
await run(node, ['scripts/site/finish-dist.mjs']);
console.log('Local website ready: .site-cache/site-dist (not deployed; npm run site:deploy publishes it).');
