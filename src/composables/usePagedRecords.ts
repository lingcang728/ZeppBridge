import { computed, ref, type Ref } from 'vue';
import { isTauri, toUserMessage } from './useTauriApi';
import { createLoadSeq } from '../lib/loadSeq';

/**
 * 睡眠列表和运动列表共用的分页状态（审计 R03）：首页、加载更多、请求代次、按 id 去重。
 *
 * 分页，不是上限：以前写死 `getRecentSleep(500)`，后端 SQL 又只有 LIMIT 没有 OFFSET，
 * 第 501 条之后的记录在应用里根本没有入口（Reddit p6zxyo7）。每页 200：首屏更快，
 * 「加载更多」按一下就有下一批。
 *
 * `items` 是后端返回的**原始**条数（运动页的「可展示」过滤由页面自己做）：offset 必须
 * 和后端的行号对得上，不然越翻越漏。同步在翻页途中插进新记录会让边界上出现一条重复——
 * 按 id 去一次重，比前端维护游标简单，也不会因一次同步就把整个列表推翻重来。
 */
export function usePagedRecords<T>(options: {
  loadPage: (limit: number, offset: number) => Promise<{ items: T[]; total: number }>;
  idOf: (item: T) => string;
  /** 取失败时的兜底文案（后端错误码取不到本地化文本时用）。 */
  failedText: () => string;
  pageSize?: number;
}) {
  const pageSize = options.pageSize ?? 200;
  const items = ref([]) as Ref<T[]>;
  const loading = ref(true);
  const loadingMore = ref(false);
  const error = ref<string | null>(null);
  const total = ref(0);
  const epoch = createLoadSeq();
  const hasMore = computed(() => items.value.length < total.value);

  const load = async () => {
    const seq = epoch.next();
    loading.value = true;
    error.value = null;
    if (!isTauri()) {
      items.value = [];
      total.value = 0;
      loading.value = false;
      return;
    }
    try {
      const page = await options.loadPage(pageSize, 0);
      if (!epoch.isCurrent(seq)) return;
      items.value = page.items;
      total.value = page.total;
    } catch (cause) {
      if (!epoch.isCurrent(seq)) return;
      error.value = toUserMessage(cause, options.failedText());
    } finally {
      if (epoch.isCurrent(seq)) loading.value = false;
    }
  };

  const loadMore = async () => {
    if (loadingMore.value || loading.value || !hasMore.value) return;
    const seq = epoch.current();
    loadingMore.value = true;
    try {
      const page = await options.loadPage(pageSize, items.value.length);
      if (!epoch.isCurrent(seq)) return;
      const seen = new Set(items.value.map(options.idOf));
      items.value = [...items.value, ...page.items.filter((item) => !seen.has(options.idOf(item)))];
      total.value = page.total;
    } catch (cause) {
      if (!epoch.isCurrent(seq)) return;
      error.value = toUserMessage(cause, options.failedText());
    } finally {
      // loadingMore 是这一次调用自己的标记，不像 loading 会被更新的 load() 接手——
      // 没有别人会清它，所以即使代次在等待中过期了也要在这里复位。
      loadingMore.value = false;
    }
  };

  return { items, loading, loadingMore, error, total, hasMore, load, loadMore };
}
