import { describe, expect, it } from 'vitest';
import {
  attachmentDisplayName,
  attachmentKindFromPath,
  attachmentRefFromPath,
} from '../attachments';

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

  it('basename 为空时回退占位名，不把完整路径漏进出仓字段', () => {
    expect(attachmentDisplayName('C:\\dir\\')).toBe('attachment');
    expect(attachmentDisplayName('/home/u/')).toBe('attachment');
    expect(attachmentDisplayName('C:\\dir\\  ')).toBe('attachment');
    expect(attachmentDisplayName('/')).not.toContain('/');
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
