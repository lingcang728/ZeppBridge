import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/*
 * 每一个被前端用到的 dialog 方法，都必须在 capability 里有对应的一条权限。
 *
 * v2.1.0 上 FIT 导出和 HAR 导入对所有人都是坏的，报错是
 * `Command plugin:dialog|open not allowed by ACL`：capability 里只写了
 * `dialog:allow-save`，而 tauri-plugin-dialog 把 `allow-open` 算成**另一条**
 * 权限。`save()` 那条路是通的，于是这个洞在开发期一次都没露头——桌面端唯一会
 * 打开目录选择器的地方，恰好就是那个新加的 FIT 导出。
 *
 * 所以这里不去断言一份写死的权限清单（那只挡得住已经犯过的这一次），而是从
 * 真实调用点反推：扫 src/ 里所有 `@tauri-apps/plugin-dialog` 的导入，把用到的
 * 方法名逐个对到 `dialog:allow-<方法>` 上。下一个人加 `ask()` 却忘了改
 * capability 时，红的是这一条，而不是用户手里的导出按钮。
 *
 * 放在 tests/ 而不是 src/lib/__tests__/：它要读磁盘，而 vitest 那一批跑在
 * tsconfig 的 include 里，那里没有 node 的类型，`vue-tsc --noEmit` 会直接红。
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const capabilityPath = path.join(repoRoot, 'src-tauri/capabilities/default.json');
const sourceRoot = path.join(repoRoot, 'src');

/**
 * 两种写法都要认：
 *   import { open as showOpenDialog, save } from '@tauri-apps/plugin-dialog'
 *   const { open } = await import('@tauri-apps/plugin-dialog')
 */
const IMPORT_PATTERN =
  /\{([^{}]*)\}\s*=?\s*(?:from\s*)?(?:await\s+import\s*\(\s*)?['"]@tauri-apps\/plugin-dialog['"]/g;

const sourceFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(full);
    return /\.(ts|vue)$/.test(entry.name) ? [full] : [];
  });

const dialogMethodsUsed = () => {
  const used = new Map();
  for (const file of sourceFiles(sourceRoot)) {
    for (const match of readFileSync(file, 'utf8').matchAll(IMPORT_PATTERN)) {
      for (const binding of match[1].split(',')) {
        // `open as showOpenDialog` -> `open`：别名不改 ACL 里的名字。
        const method = binding.split(/\bas\b/)[0].trim();
        if (!method) continue;
        const where = used.get(method) ?? [];
        where.push(path.relative(repoRoot, file).split(path.sep).join('/'));
        used.set(method, where);
      }
    }
  }
  return used;
};

const grantedPermissions = () =>
  JSON.parse(readFileSync(capabilityPath, 'utf8')).permissions.map((entry) =>
    typeof entry === 'string' ? entry : entry.identifier,
  );

test('the scan finds the dialog call sites at all', () => {
  // 正则一旦被改坏，下面两条会因为「一个调用点都没找到」而空过。
  const used = dialogMethodsUsed();
  assert.deepEqual([...used.keys()].sort(), ['open', 'save']);
  assert.ok(used.get('open').includes('src/composables/useExport.ts'), 'FIT 导出的目录选择');
  assert.ok(used.get('open').includes('src/views/Settings.vue'), 'HAR 导入的文件选择');
  assert.ok(used.get('save').includes('src/composables/useExport.ts'), 'JSON/CSV/GPX 导出的保存');
});

test('the capability grants one permission per dialog method the interface calls', () => {
  const granted = new Set(grantedPermissions());
  for (const [method, callSites] of dialogMethodsUsed()) {
    assert.ok(
      granted.has(`dialog:allow-${method}`) || granted.has('dialog:default'),
      `dialog.${method}() 被 ${callSites.join('、')} 调用，`
        + `但 src-tauri/capabilities/default.json 里没有 dialog:allow-${method}`,
    );
  }
});

test('the capability grants no dialog permission nothing calls', () => {
  // 反方向也要成立：多给的权限是白扩的攻击面，而且会让上面那条看起来永远是绿的。
  const used = dialogMethodsUsed();
  for (const permission of grantedPermissions()) {
    if (!permission.startsWith('dialog:allow-')) continue;
    const method = permission.slice('dialog:allow-'.length);
    assert.ok(used.has(method), `capability 给了 ${permission}，但没有任何调用点`);
  }
});
