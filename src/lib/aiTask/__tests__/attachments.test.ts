import { describe, expect, it } from 'vitest';
import {
  attachmentDisplayName,
  attachmentKindFromPath,
  attachmentRefFromPath,
  attachmentStateFromStat,
  statToStatus,
} from '../attachments';
import type { AiTaskAttachmentRef } from '../../bridge/types';

const ref = (patch: Partial<AiTaskAttachmentRef> = {}): AiTaskAttachmentRef => ({
  id: 'a-1',
  path: 'C:\\files\\report.pdf',
  display_name: 'report.pdf',
  kind: 'pdf',
  byte_len: 100,
  added_at: '2026-01-01T00:00:00Z',
  ...patch,
});

describe('attachmentKindFromPath', () => {
  it('只认 pdf 与常见图片扩展名', () => {
    expect(attachmentKindFromPath('a/b/report.pdf')).toBe('pdf');
    expect(attachmentKindFromPath('a/b/photo.PNG')).toBe('image');
    expect(attachmentKindFromPath('a/b/photo.jpeg')).toBe('image');
    expect(attachmentKindFromPath('a/b/notes.txt')).toBeNull();
    expect(attachmentKindFromPath('a/b/fit.fit')).toBeNull();
    expect(attachmentKindFromPath('noext')).toBeNull();
  });
});

describe('attachmentDisplayName', () => {
  it('两种分隔符都取最后一段', () => {
    expect(attachmentDisplayName('C:\\dir\\file.pdf')).toBe('file.pdf');
    expect(attachmentDisplayName('/home/u/file.png')).toBe('file.png');
  });
});

describe('attachmentRefFromPath', () => {
  it('建成引用：类型、名字、字节基线；不认识的类型不建', () => {
    const built = attachmentRefFromPath('C:\\x\\scan.pdf', { path: 'C:\\x\\scan.pdf', exists: true, byte_len: 2048, mtime: null });
    expect(built?.kind).toBe('pdf');
    expect(built?.display_name).toBe('scan.pdf');
    expect(built?.byte_len).toBe(2048);
    expect(built?.id).toBeTruthy();
    expect(attachmentRefFromPath('C:\\x\\run.exe')).toBeNull();
  });
});

describe('attachmentStateFromStat / statToStatus', () => {
  it('missing / changed / ok 三分支，changed 只信字节数', () => {
    expect(attachmentStateFromStat(ref(), undefined)).toBe('missing');
    expect(attachmentStateFromStat(ref(), { exists: false, byte_len: 100 })).toBe('missing');
    expect(attachmentStateFromStat(ref(), { exists: true, byte_len: 101 })).toBe('changed');
    expect(attachmentStateFromStat(ref(), { exists: true, byte_len: 100 })).toBe('ok');
    // 基线是 null 时无从判定 changed——宁可标 ok 也不冤枉文件。
    expect(attachmentStateFromStat(ref({ byte_len: null }), { exists: true, byte_len: 5 })).toBe('ok');
  });

  it('statToStatus 按 path 对号，未查到的引用按 missing 处理', () => {
    const out = statToStatus(
      [ref({ id: 'a-1', path: 'p1' }), ref({ id: 'a-2', path: 'p2' })],
      [{ path: 'p1', exists: true, byte_len: 100, mtime: null }],
    );
    expect(out).toEqual([
      { id: 'a-1', status: 'ok', byte_len: 100 },
      { id: 'a-2', status: 'missing', byte_len: null },
    ]);
  });
});
