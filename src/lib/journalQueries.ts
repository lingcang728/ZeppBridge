import { backend } from './bridge';
import type { Query } from './readCache';
import type { Injury, PersonalRecords, Race, ShoeOverview } from '../types/logbook';
import type { AnnualRings } from '../types/rings';

/**
 * 履历页首屏要读的五样（lib/pageQueries.ts 的 /journal 用它预读，useLogbook / useAnnualRings 读的也是同一把键）。
 *
 * 以前履历页挂上以后才去读：年轮、PB 墙、跑鞋这些大块内容正好在形变途中回来、整块重画，同步完库是冷的
 * （PB 大库现算要半秒多），用户看到的是「同步完第一次点开履历页，动画要卡很久才出来」（2026-10-28 反馈）。
 * 现在应用空闲时（含每次同步落了新数据后）就先读好，点开时第一帧就是真内容，重读放到形变放完以后。
 *
 * 单独成一个小模块：概览上的倒计时卡也用 useLogbook，不该为此带上 pageQueries 的整张查询表。
 */
export const journalQuery = {
  rings: (): Query<AnnualRings> => ({ key: 'annual_rings', fetch: () => backend.annualRings() }),
  records: (): Query<PersonalRecords> => ({ key: 'personal_records', fetch: () => backend.personalRecords() }),
  shoes: (): Query<ShoeOverview> => ({ key: 'shoes_overview', fetch: () => backend.shoesOverview() }),
  races: (): Query<Race[]> => ({ key: 'races_list', fetch: () => backend.racesList() }),
  injuries: (): Query<Injury[]> => ({ key: 'injuries_list', fetch: () => backend.injuriesList() }),
};

export const journalPageQueries = () => [
  journalQuery.rings(),
  journalQuery.records(),
  journalQuery.shoes(),
  journalQuery.races(),
  journalQuery.injuries(),
] as const;
