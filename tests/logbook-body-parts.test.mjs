// 人形图上能点的部位和后端收的部位必须是同一份：前端多一个，存的时候被后端拒；少一个，那块身体点不到。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const listIn = (path, pattern) => {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const block = pattern.exec(source)?.[1];
  assert.ok(block, `${path}: body part list not found`);
  return [...block.matchAll(/["']([a-z_]+)["']/g)].map(match => match[1]);
};

test('the body map and the backend accept the same body parts', () => {
  const backend = listIn('src-tauri/crates/core/src/storage/logbook/mod.rs', /BODY_PARTS: \[&str; \d+\] = \[([\s\S]*?)\];/);
  const frontend = listIn('src/lib/logbook/body.ts', /BODY_PARTS = \[([\s\S]*?)\] as const;/);
  assert.ok(backend.length > 20);
  assert.deepEqual([...frontend].sort(), [...backend].sort());
});
