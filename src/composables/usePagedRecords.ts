import { computed, ref, type Ref } from 'vue';
import { isTauri, toUserMessage } from './useTauriApi';
import { createLoadSeq } from '../lib/loadSeq';
import { cached, peek, type Query } from '../lib/readCache';

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
  /** 首页（offset 0、一页大小）走的查询：预加载读好了的话，第一帧就是列表，不放骨架（lib/pageQueries.ts）。 */
  firstPage?: Query<{ items: T[]; total: number }>;
}) {
  const pageSize = options.pageSize ?? 200;
  const items = ref([]) as Ref<T[]>;
  const loading = ref(true);
  const first = isTauri() && options.firstPage ? peek(options.firstPage) : null;
  /** 第一帧用的是先前读好的首页（页面挂载时的重读可以等形变放完）。 */
  const preloaded = Boolean(first);
  const loadingMore = ref(false);
  const error = ref<string | null>(null);
  /** 列表已经有内容时的重查失败：保留旧列表，只在旁边说一句。 */
  const staleError = ref<string | null>(null);
  const total = ref(first?.value.total ?? 0);
  if (first) {
    items.value = first.value.items;
    loading.value = false;
  }
  const epoch = createLoadSeq();
  const hasMore = computed(() => items.value.length < total.value);

  /*
   * 数据变了之后的重查也走这里：取回「至少已经加载过的那么多」条，而不是退回第一页。
   * 这两页放进缓存就是为了保住滚动位置，以前任何一次同步都把 600 行退回 200 行。
   * 失败时不把好好的列表换成错误卡（重放期间库忙是常态），只有本来就空才显示错误。
   */
  const load = async () => {
    const seq = epoch.next();
    const keep = Math.max(pageSize, items.value.length);
    // 列表已经在（预先读好的首页、或者上一次的结果）：留着原地换，不退回骨架。
    if (!items.value.length) loading.value = true;
    error.value = null;
    staleError.value = null;
    if (!isTauri()) {
      items.value = [];
      total.value = 0;
      loading.value = false;
      return;
    }
    try {
      const page = await (keep === pageSize && options.firstPage ? cached(options.firstPage) : options.loadPage(keep, 0));
      if (!epoch.isCurrent(seq)) return;
      items.value = page.items;
      total.value = page.total;
    } catch (cause) {
      if (!epoch.isCurrent(seq)) return;
      const text = toUserMessage(cause, options.failedText());
      if (items.value.length) staleError.value = text;
      else error.value = text;
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
      // 已经显示着的那几页不能因为「下一页」失败就整页换成错误卡。
      staleError.value = toUserMessage(cause, options.failedText());
    } finally {
      // loadingMore 是这一次调用自己的标记，不像 loading 会被更新的 load() 接手——
      // 没有别人会清它，所以即使代次在等待中过期了也要在这里复位。
      loadingMore.value = false;
    }
  };

  return { items, loading, loadingMore, error, staleError, total, hasMore, load, loadMore, preloaded };
}
