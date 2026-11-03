import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { version } = require('@vitejs/plugin-vue/package.json');
if (version !== '6.0.8') {
  throw new Error(`Review the cold external-style patch before using @vitejs/plugin-vue ${version}; expected 6.0.8. Run npm run test:dev after updating it.`);
}

// A restarted dev server may receive an external CSS request before its owner
// SFC. The temporary descriptor must preserve the scoped src ID and support
// style indices above zero. Keep this patch narrow and fail on upstream changes.
// https://github.com/vitejs/vite-plugin-vue/blob/main/packages/plugin-vue/src/utils/descriptorCache.ts
const filename = require.resolve('@vitejs/plugin-vue');
const original = readFileSync(filename, 'utf8');
let patched = original;
for (const [before, after] of [
  ['id: query.id || "",', 'id: query.id || (query.scoped ? query.src : "") || "",'],
  ['const block = descriptor.styles[index];', 'const block = descriptor.styles[index] || (descriptor.isTemp ? descriptor.styles[0] : undefined);'],
]) {
  if (patched.includes(after)) continue;
  if (patched.split(before).length !== 2) {
    throw new Error(`Cannot safely apply the Vue cold external-style patch to ${filename}; review the installed plugin and run npm run test:dev.`);
  }
  patched = patched.replace(before, after);
}
if (patched !== original) writeFileSync(filename, patched);
console.log(`Vue ${version}: cold external-style patch ${patched === original ? 'already applied' : 'applied'}.`);
