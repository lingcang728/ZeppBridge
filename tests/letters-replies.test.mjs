import assert from 'node:assert/strict';
import test from 'node:test';
import { classify, markSql, pruneSql, renderReplies, tallyAlsoHit } from '../scripts/letters/replies-core.mjs';

const ID = '3f1c2e4a-1b2c-4d5e-8f90-123456789abc';

test('marking a reply refuses anything that would build bad SQL', () => {
  assert.throws(() => markSql([]), /至少/);
  assert.throws(() => markSql(["x'); DROP TABLE letter_replies;--"]), /不是回信 id/);
  assert.throws(() => markSql([ID], { category: 'Bad Id' }), /category/);
  assert.throws(() => markSql([ID], { status: 'done' }), /status/);
  assert.throws(() => markSql([ID], { status: 'fixed' }), /fixed-in/);
  assert.throws(() => markSql([ID], { status: 'fixed', fixedIn: '3.1' }), /x\.y\.z/);
});

test('fixed and declined close a reply; other statuses reopen it', () => {
  const now = '2026-10-21T00:00:00.000Z';
  const fixed = markSql([ID], { category: 'backfill-stuck', status: 'fixed', fixedIn: '3.1.1', now });
  assert.match(fixed, /read_at = COALESCE\(read_at, '2026-10-21T00:00:00.000Z'\)/);
  assert.match(fixed, /handled_at = '2026-10-21T00:00:00.000Z'/);
  assert.match(markSql([ID], { status: 'later', now }), /handled_at = NULL/);
  assert.doesNotMatch(markSql([ID], { now }), /handled_at/);
});

test('only replies handled more than 180 days ago are pruned', () => {
  assert.equal(pruneSql(new Date('2026-10-21T00:00:00.000Z')),
    "DELETE FROM letter_replies WHERE handled_at IS NOT NULL AND handled_at < '2026-04-24T00:00:00.000Z'");
});

test('the export groups by rough kind and counts “me too” once per reply', () => {
  assert.equal(classify('补拉卡在 2021 年了'), 'sync');
  assert.equal(classify('The AppImage crashes on start'), 'platform');
  assert.equal(classify('嗯'), 'other');
  const rows = [
    { id: ID, received_at: '2026-10-20', letter_version: '3.1.0', locale: 'zh', allow_quote: 1, body: '补拉卡住了\n第二行', also_hit_json: '["backfill-stuck","backfill-stuck"]', status: '', category: '' },
    { id: ID.replace('3f', '4f'), received_at: '2026-10-20', letter_version: '3.1.0', locale: 'en', allow_quote: 0, body: '', also_hit_json: '["backfill-stuck","watch-faces"]', status: '', category: '' },
  ];
  const text = renderReplies(rows, 'now');
  assert.match(text, /## sync（1）/);
  assert.match(text, /> 补拉卡住了\n> 第二行/);
  assert.match(text, /只点了「我也遇到」/);
  assert.deepEqual(tallyAlsoHit(rows), [['backfill-stuck', 2], ['watch-faces', 1]]);
});
