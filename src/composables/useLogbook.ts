/**
 * 履历（批次 7 主观层）：/journal 页和概览上的倒计时卡共用的一份状态。
 *
 * 跟教练档案一样：整份从后端读，每次写完重读——写入很少，没必要在前端拼。
 * PB 是后端现算的（大库约半秒），只在履历页读，概览不读。
 */
import { ref } from 'vue';
import { backend, isDesktop, toUserMessage } from '../lib/bridge';
import type { Injury, PersonalRecords, Race, ShoeOverview } from '../types/logbook';

const shoes = ref<ShoeOverview | null>(null);
const races = ref<Race[] | null>(null);
const injuries = ref<Injury[] | null>(null);
const records = ref<PersonalRecords | null>(null);
const busy = ref(false);
const error = ref<string | null>(null);

type Part = 'shoes' | 'races' | 'injuries' | 'records';
const loaders: Record<Part, () => Promise<void>> = {
  shoes: async () => { shoes.value = await backend.shoesOverview(); },
  races: async () => { races.value = await backend.racesList(); },
  injuries: async () => { injuries.value = await backend.injuriesList(); },
  records: async () => { records.value = await backend.personalRecords(); },
};

export const useLogbook = () => {
  const load = async (parts: Part[] = ['shoes', 'races', 'injuries', 'records']) => {
    if (!isDesktop()) return;
    try { await Promise.all(parts.map(part => loaders[part]())); }
    catch (e) { error.value = toUserMessage(e, ''); }
  };

  /** 跑一次写入；成功返回 true 并重读受影响的几块，失败把原因放进 `error`。 */
  const write = async (run: () => Promise<unknown>, reload: Part[]): Promise<boolean> => {
    if (busy.value) return false;
    busy.value = true;
    error.value = null;
    try { await run(); return true; }
    catch (e) { error.value = toUserMessage(e, ''); return false; }
    finally { busy.value = false; await load(reload); }
  };

  return { shoes, races, injuries, records, busy, error, load, write };
};
