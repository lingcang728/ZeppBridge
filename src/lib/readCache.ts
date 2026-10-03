import { dataRevision, streamUpdate } from '../composables/sync/state';

/**
 * 详情页首屏数据的小缓存——手机厂商「点下去之前就把下一页备好」的那一半（另一半是代码块预取，
 * lib/motion/prefetch.ts）。
 *
 * 以前每次从概览点进心率页都要现读一遍库（三条查询一起等，最慢的那条一百多毫秒，再加 IPC 和渲染），
 * 卡片长成整页以后还得停在骨架上等它——用户看到的是「每次点开都要加载一秒」。现在：
 * - 指针移到卡上、按下去、或者应用空闲时，就把那一页要的数据先读好（pageQueries.ts 的 preloadRoute）；
 * - 页面挂载时直接拿读好的结果（`peek`），第一帧就是真内容，没有骨架；
 * - **先给旧的、再换新的**（stale-while-revalidate）：同步每落一条流，读好的结果就算「旧了」，但仍然先拿来画第一帧，
 *   页面等形变放完再重读、原地换上。第一版一落库就整个作废：同步进行中（或者刚同步完）点卡片，又回到现读现等，
 *   形变途中再被晚到的数据打断——用户实测「点多了掉帧」的一部分就是它。
 *
 * 新旧按「数据版本」判断：同步落了新数据（dataRevision / streamUpdate 变了），或者过了五分钟（「最近 24 小时」这类
 * 按钟点算的窗口），`cached` 就重读；`peek` 只要不超过半小时都给。读失败的不当新结果，旧的照旧留着。
 */
export interface Query<T> {
  key: string;
  fetch: () => Promise<T>;
}

const FRESH_MS = 5 * 60_000;
const STALE_MS = 30 * 60_000;
const MAX_ENTRIES = 48;

type Entry = {
  /** 这次读取发起时的数据版本。 */
  stamp: string;
  at: number;
  promise: Promise<unknown>;
  /** 最近一次读成功的结果（重读期间仍是上一次的）。 */
  value?: unknown;
  valueAt: number;
  /** 那份结果是在哪个数据版本读出来的。 */
  valueStamp: string;
  hasValue: boolean;
};
const entries = new Map<string, Entry>();

const stamp = () => `${dataRevision.value}:${streamUpdate.value.revision}`;
const fresh = (entry: Entry | undefined): boolean =>
  Boolean(entry && entry.stamp === stamp() && Date.now() - entry.at < FRESH_MS);

/** 读一份：数据版本没变、没过期就复用（正在读的也一样）；否则重读，重读期间 `peek` 仍给上一次的。 */
export const cached = <T>(query: Query<T>): Promise<T> => {
  const previous = entries.get(query.key);
  if (previous && fresh(previous)) return previous.promise as Promise<T>;
  const entry: Entry = {
    stamp: stamp(),
    at: Date.now(),
    promise: Promise.resolve(),
    value: previous?.value,
    valueAt: previous?.valueAt ?? 0,
    valueStamp: previous?.valueStamp ?? '',
    hasValue: previous?.hasValue ?? false,
  };
  entry.promise = query.fetch().then(
    (value) => {
      entry.value = value;
      entry.valueAt = Date.now();
      entry.valueStamp = entry.stamp;
      entry.hasValue = true;
      return value;
    },
    (cause: unknown) => {
      // 失败的不算新结果：下次照常重读，上一次读好的留着给 peek。
      entry.stamp = '';
      throw cause;
    },
  );
  entries.delete(query.key);
  entries.set(query.key, entry);
  while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value as string);
  return entry.promise as Promise<T>;
};

/** 读好的结果（可能是旧的：`fresh` 说它是不是当前数据版本读出来的）；没读过或太旧就是 null。 */
export const peek = <T>(query: Query<T>): { value: T; fresh: boolean } | null => {
  const hit = entries.get(query.key);
  if (!hit?.hasValue || Date.now() - hit.valueAt > STALE_MS) return null;
  return { value: hit.value as T, fresh: fresh(hit) && hit.valueStamp === hit.stamp };
};

/** 一组查询全都读好过才给（页面要整组一起换上，不能一半新一半骨架）。 */
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
