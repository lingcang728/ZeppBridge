import { describe, expect, it, vi } from 'vitest';

vi.mock('../useTauriApi', () => ({
  isTauri: () => true,
  toUserMessage: (_cause: unknown, fallback: string) => fallback,
}));

import { usePagedRecords } from '../usePagedRecords';

type Row = { id: string };
const rows = (...ids: string[]) => ids.map((id) => ({ id }));

/** 手动放行的分页请求：测试决定哪一个先回来。 */
const controlledPages = () => {
  const calls: { limit: number; offset: number; resolve: (page: { items: Row[]; total: number }) => void }[] = [];
  const loadPage = (limit: number, offset: number) =>
    new Promise<{ items: Row[]; total: number }>((resolve) => { calls.push({ limit, offset, resolve }); });
  return { calls, loadPage };
};

describe('usePagedRecords', () => {
  it('旧的首页请求晚回来，不能覆盖新列表', async () => {
    const { calls, loadPage } = controlledPages();
    const list = usePagedRecords<Row>({ loadPage, idOf: (row) => row.id, failedText: () => 'failed', pageSize: 2 });
    const first = list.load();
    const second = list.load();
    calls[1].resolve({ items: rows('new-1', 'new-2'), total: 3 });
    await second;
    calls[0].resolve({ items: rows('old-1'), total: 1 });
    await first;
    expect(list.items.value.map((row) => row.id)).toEqual(['new-1', 'new-2']);
    expect(list.total.value).toBe(3);
    expect(list.loading.value).toBe(false);
  });

  it('加载更多按已取回的原始条数算 offset，并按 id 去掉边界重复', async () => {
    const { calls, loadPage } = controlledPages();
    const list = usePagedRecords<Row>({ loadPage, idOf: (row) => row.id, failedText: () => 'failed', pageSize: 2 });
    const load = list.load();
    calls[0].resolve({ items: rows('a', 'b'), total: 4 });
    await load;
    const more = list.loadMore();
    expect(calls[1].offset).toBe(2);
    calls[1].resolve({ items: rows('b', 'c'), total: 4 });
    await more;
    expect(list.items.value.map((row) => row.id)).toEqual(['a', 'b', 'c']);
    expect(list.hasMore.value).toBe(true);
  });

  it('过期的加载更多不改列表，但自己的 loadingMore 一定复位', async () => {
    const { calls, loadPage } = controlledPages();
    const list = usePagedRecords<Row>({ loadPage, idOf: (row) => row.id, failedText: () => 'failed', pageSize: 2 });
    const load = list.load();
    calls[0].resolve({ items: rows('a', 'b'), total: 4 });
    await load;
    const more = list.loadMore();
    expect(list.loadingMore.value).toBe(true);
    const reload = list.load();
    calls[1].resolve({ items: rows('stale'), total: 4 });
    await more;
    expect(list.loadingMore.value).toBe(false);
    calls[2].resolve({ items: rows('x', 'y'), total: 2 });
    await reload;
    expect(list.items.value.map((row) => row.id)).toEqual(['x', 'y']);
  });
});
