import { describe, expect, it } from 'vitest';
import { isDefaultExportFormat, readDefaultExportFormat } from '../exportScope';

describe('默认导出格式', () => {
  it('只接受 json / csv / gpx', () => {
    expect(isDefaultExportFormat('json')).toBe(true);
    expect(isDefaultExportFormat('fit')).toBe(false);
    expect(isDefaultExportFormat('xml')).toBe(false);
  });

  it('没有浏览器存储时退回 json', () => {
    expect(readDefaultExportFormat()).toBe('json');
  });
});
