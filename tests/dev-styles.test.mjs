import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import vue from '@vitejs/plugin-vue';
import { createServer } from 'vite';
import { parse } from 'vue/compiler-sfc';

const root = fileURLToPath(new URL('../', import.meta.url));

async function vueFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await vueFiles(path));
    else if (entry.name.endsWith('.vue')) result.push(path);
  }
  return result;
}

test('external Vue styles compile before their owner is cached by the dev server', async (t) => {
  const server = await createServer({
    root,
    configFile: false,
    plugins: [vue()],
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0, strictPort: false, watch: null },
  });
  t.after(() => server.close());
  await server.listen();
  const address = server.httpServer.address();
  assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;

  let requests = 0;
  for (const filename of await vueFiles(join(root, 'src'))) {
    const { descriptor, errors } = parse(await readFile(filename, 'utf8'), { filename });
    assert.deepEqual(errors, []);
    for (const [index, style] of descriptor.styles.entries()) {
      if (!style.src) continue;
      // Do not transform the owner .vue first. A restarted dev server can
      // receive a style import from a browser's cached component module.
      const scope = `cold-${createHash('sha256').update(filename).digest('hex').slice(0, 8)}`;
      const cssPath = relative(root, resolve(dirname(filename), style.src)).split(sep).join('/');
      const query = new URLSearchParams({ vue: '', type: 'style', index: String(index), src: style.scoped ? scope : 'true' });
      if (style.scoped) query.set('scoped', scope);
      const request = `/${cssPath}?${query}&lang.css`;
      const response = await fetch(origin + request);
      const code = await response.text();
      assert.equal(response.status, 200, `${relative(root, filename)} external style ${index}: ${code.slice(0, 1000)}`);
      assert.ok(code, `${request} must produce a dev module`);
      if (style.scoped) {
        assert.ok(code.includes(`[data-v-${scope}]`), `${request} must remain scoped`);
      }
      requests += 1;
    }
  }
  assert.ok(requests > 0, 'must exercise actual external styles');
  t.diagnostic(`Checked ${requests} cold external style requests`);
});
