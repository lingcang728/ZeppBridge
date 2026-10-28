/**
 * 履历（批次 7 主观层）：/journal 页和概览上的倒计时卡共用的一份状态。
 *
 * 跟教练档案一样：整份从后端读，每次写完重读——写入很少，没必要在前端拼。
 * PB 是后端现算的（大库约半秒），只在履历页读，概览不读。
 */
import { ref, type Ref } from 'vue';
import { isDesktop, toUserMessage } from '../lib/bridge';
import { journalQuery } from '../lib/journalQueries';
import { afterMotion } from '../lib/motion/budget';
import { cached, forgetReads, peek, type Query } from '../lib/readCache';
import type { Injury, PersonalRecords, Race, ShoeOverview } from '../types/logbook';

const shoes = ref<ShoeOverview | null>(null);
const races = ref<Race[] | null>(null);
const injuries = ref<Injury[] | null>(null);
const records = ref<PersonalRecords | null>(null);
const busy = ref(false);
const error = ref<string | null>(null);

/** 一块状态和读它的查询（键和预读的一样，见 lib/journalQueries.ts）。 */
const part = <T>(target: Ref<T | null>, query: () => Query<T>) => ({
  /** 读好过的（可能是同步前的旧结果）先拿来画；返回有没有。 */
  seed: () => {
    const hit = peek(query());
    if (hit) target.value = hit.value;
    return Boolean(hit);
  },
  read: async () => {
    const value = await cached(query());
    // 正在放形变就等它放完再换上：PB 墙、跑鞋整块重画要上百毫秒，压在形变上就是一下顿挫（冷库时 PB 要读半秒多）。
    await new Promise<void>((resolve) => { afterMotion(resolve); });
    target.value = value;
  },
  forget: () => forgetReads(query().key),
});

type Part = 'shoes' | 'races' | 'injuries' | 'records';
const ALL: Part[] = ['shoes', 'races', 'injuries', 'records'];
const parts: Record<Part, ReturnType<typeof part>> = {
  shoes: part(shoes, journalQuery.shoes),
  races: part(races, journalQuery.races),
  injuries: part(injuries, journalQuery.injuries),
  records: part(records, journalQuery.records),
};

const read = async (which: Part[]) => {
  try { await Promise.all(which.map(name => parts[name].read())); }
  catch (e) { error.value = toUserMessage(e, ''); }
};

export const useLogbook = () => {
  /** 读好过的立刻画上、等形变放完再重读；没读过的现读。读回来的都等形变放完才换上（见 part.read）。 */
  const load = async (which: Part[] = ALL) => {
    if (!isDesktop()) return;
    const ready = which.filter(name => parts[name].seed());
    if (ready.length) afterMotion(() => { void read(ready); });
    await read(which.filter(name => !ready.includes(name)));
  };

  /** 跑一次写入；成功返回 true 并重读受影响的几块，失败把原因放进 `error`。 */
  const write = async (run: () => Promise<unknown>, reload: Part[]): Promise<boolean> => {
    if (busy.value) return false;
    busy.value = true;
    error.value = null;
    try { await run(); return true; }
    catch (e) { error.value = toUserMessage(e, ''); return false; }
    finally {
      busy.value = false;
      // 写过了：读好的那几份作废，现读。
      for (const name of reload) parts[name].forget();
      await read(reload);
    }
  };

  return { shoes, races, injuries, records, busy, error, load, write };
};
