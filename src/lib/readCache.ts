import { dataRevision, streamUpdate } from '../composables/sync/state';

/**
 * 详情页首屏数据的小缓存——手机厂商「点下去之前就把下一页备好」的那一半（另一半是代码块预取，
 * lib/motion/prefetch.ts）。
 *
 * 以前每次从概览点进心率页都要现读一遍库（三条查询一起等，最慢的那条一百多毫秒，再加 IPC 和渲染），
 * 卡片长成整页以后还得停在骨架上等它——用户看到的是「每次点开都要加载一秒」。现在：
 * - 指针移到卡上、按下去、或者应用空闲时，就把那一页要的数据先读好（pageQueries.ts 的 preloadRoute）；
 * - 页面挂载时直接拿已经读好的结果（`peek`），第一帧就是真内容，没有骨架；
 * - 同一份数据再点开不重读。
 *
 * 只认本机库：数据只会因为同步落库而变，所以缓存跟着「数据版本」走——同步落了新数据（dataRevision /
 * streamUpdate 变了）就全部作废。再加五分钟的寿命，免得「最近 24 小时」这类按钟点算的窗口一直停在旧的。
 * 读失败的不留，下次照常重读。
 */
export interface Query<T> {
  key: string;
  fetch: () => Promise<T>;
}

const TTL_MS = 5 * 60_000;
const MAX_ENTRIES = 48;

type Entry = { stamp: string; at: number; promise: Promise<unknown>; settled: boolean; value?: unknown };
const entries = new Map<string, Entry>();

const stamp = () => `${dataRevision.value}:${streamUpdate.value.revision}`;
const fresh = (entry: Entry | undefined): entry is Entry =>
  Boolean(entry && entry.stamp === stamp() && Date.now() - entry.at < TTL_MS);

/** 读一份（有新鲜的就复用同一个 Promise，正在读的也一样）。 */
export const cached = <T>(query: Query<T>): Promise<T> => {
  const hit = entries.get(query.key);
  if (fresh(hit)) return hit.promise as Promise<T>;
  const entry: Entry = { stamp: stamp(), at: Date.now(), settled: false, promise: Promise.resolve() };
  entry.promise = query.fetch().then(
    (value) => {
      entry.settled = true;
      entry.value = value;
      return value;
    },
    (cause: unknown) => {
      if (entries.get(query.key) === entry) entries.delete(query.key);
      throw cause;
    },
  );
  entries.delete(query.key);
  entries.set(query.key, entry);
  while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value as string);
  return entry.promise as Promise<T>;
};

/** 已经读好的新鲜结果；没有（还在读、没读过、过期了）就是 null。 */
export const peek = <T>(query: Query<T>): { value: T } | null => {
  const hit = entries.get(query.key);
  return fresh(hit) && hit.settled ? { value: hit.value as T } : null;
};

/** 一组查询全都读好了才给（页面要整组一起换上，不能一半新一半骨架）。 */
type ValuesOf<Q extends readonly Query<unknown>[]> = { -readonly [K in keyof Q]: Q[K] extends Query<infer V> ? V : never };
export const peekAll = <Q extends readonly Query<unknown>[]>(queries: Q): ValuesOf<Q> | null => {
  const values: unknown[] = [];
  for (const query of queries) {
    const hit = peek(query);
    if (!hit) return null;
    values.push(hit.value);
  }
  return values as ValuesOf<Q>;
};

/** 测试用。 */
export const resetReadCache = () => entries.clear();
