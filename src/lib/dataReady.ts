/**
 * 「奶茶好了」：用户在等的那一次同步，有没有结果。
 *
 * 打开应用时要从云端拉八步，这段时间里概览页是让人先逛逛的地方；等数据真的
 * 到了本机，得有人喊一声「好了，可以交给 AI 了」——否则用户不知道什么时候该
 * 去取，要么一直在概览里转，要么没等同步完就去导出了一份旧数据。
 *
 * 只有「用户在等」的同步才会喊：启动时那一次、用户自己点的那一次（顶栏、托盘、
 * 设置页）。每十五分钟一次的后台自动同步不喊——那不是谁在排队，喊了只是打扰。
 *
 * 纯函数，不碰 Vue：状态放在 composables/sync/ready.ts。
 */
import type { SyncOutcome, SyncReport } from '../types';

export type ReadyOutcome = Extract<SyncOutcome, 'updated' | 'no_new_data' | 'partial'>;

export type DataReady =
  | { phase: 'idle' }
  /** 用户在等的那次同步还在跑（包括让路给本地重放、稍后自动重试的那段）。 */
  | { phase: 'waiting' }
  | {
    phase: 'ready';
    outcome: ReadyOutcome;
    /** 这次写进本机的记录数；0 表示云端没有新东西，本机本来就是最新的。 */
    records: number;
    finishedAt: string;
    /** partial 时哪几条流没取到（键，不是人话）。 */
    failedStreams: string[];
  };

export const IDLE: DataReady = { phase: 'idle' };

/** 开始一次同步。只有用户在等的那种才进入 waiting；后台同步不改变状态。 */
export const readyOnStart = (state: DataReady, waited: boolean): DataReady =>
  (waited ? { phase: 'waiting' } : state);

/**
 * 一次同步有了结果（`report` 为 null 表示根本没跑起来或抛了错）。
 *
 * 只在 waiting 时才有意义：没人在等的时候，后台同步的结果不该把一个已经亮着的
 * 「好了」弄灭，也不该凭空亮一个。
 *
 * `deferred` 是让路不是失败：后端在重放本地报文，控制器一分钟后自己重试，
 * 用户仍然在等——保持 waiting。
 */
export const readyOnReport = (state: DataReady, report: SyncReport | null, failedStreams: string[] = []): DataReady => {
  if (state.phase !== 'waiting') return state;
  if (!report) return IDLE;
  switch (report.outcome) {
    case 'updated':
    case 'no_new_data':
    case 'partial':
      return {
        phase: 'ready',
        outcome: report.outcome,
        records: Math.max(0, report.total_records),
        finishedAt: report.finished_at,
        failedStreams: report.outcome === 'partial' ? failedStreams : [],
      };
    case 'deferred':
      return state;
    default:
      return IDLE;
  }
};

/** 取走了（进了「交给 AI」）或者用户说先不用：灭掉。等待中的不受影响。 */
export const readyOnPickUp = (state: DataReady): DataReady => (state.phase === 'ready' ? IDLE : state);
