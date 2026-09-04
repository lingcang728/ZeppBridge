import { describe, expect, it } from 'vitest';
import { launchSyncIsDue } from '../autoSync';

/*
 * 「每次打开 ZeppBridge 都在重新同步账号。」（2026-09-04 的用户反馈）
 *
 * 那句话描述的不是错觉：`initialize()` 的最后一行以前无条件跑一次增量同步，
 * 而传给它的 `silent: true` 只管「已经在同步了」那一个分支，进度条和
 * 「正在同步最近 N 天」照样铺满界面。最小化到托盘再打开没事，因为那条路
 * 不重跑 `initialize()`——这正是它难以在本机复现的原因。
 *
 * 下面这组用例钉住的是新规则本身：**看的是离上次成功同步过去了多久，
 * 不是这次是不是启动**。关掉五分钟再打开不该同步；隔了一天再打开该同步。
 */
describe('launchSyncIsDue', () => {
  const now = new Date('2026-09-04T12:00:00Z').getTime();
  const minutesAgo = (minutes: number) =>
    new Date(now - minutes * 60_000).toISOString();

  it('从没同步过时必须同步——那是首次连接后的第一趟', () => {
    expect(launchSyncIsDue(null, 15, now)).toBe(true);
    expect(launchSyncIsDue(undefined, 15, now)).toBe(true);
    expect(launchSyncIsDue('', 15, now)).toBe(true);
  });

  it('刚同步完就重开，不再跑第二趟', () => {
    expect(launchSyncIsDue(minutesAgo(0), 15, now)).toBe(false);
    expect(launchSyncIsDue(minutesAgo(5), 15, now)).toBe(false);
    expect(launchSyncIsDue(minutesAgo(14.9), 15, now)).toBe(false);
  });

  it('过了一个自动同步间隔就该同步了', () => {
    expect(launchSyncIsDue(minutesAgo(15), 15, now)).toBe(true);
    expect(launchSyncIsDue(minutesAgo(60), 15, now)).toBe(true);
    // 隔了一天再打开——这一趟是有用的，显示出来也是对的。
    expect(launchSyncIsDue(minutesAgo(60 * 24), 15, now)).toBe(true);
  });

  it('门槛跟着用户设的间隔走', () => {
    // 同一个 30 分钟，在 15 分钟间隔下该同步，在 60 分钟间隔下不该。
    expect(launchSyncIsDue(minutesAgo(30), 15, now)).toBe(true);
    expect(launchSyncIsDue(minutesAgo(30), 60, now)).toBe(false);
  });

  it('间隔是个不认识的值时按默认的 15 分钟算，而不是永不同步', () => {
    expect(launchSyncIsDue(minutesAgo(20), Number.NaN, now)).toBe(true);
    expect(launchSyncIsDue(minutesAgo(20), 99999, now)).toBe(true);
    expect(launchSyncIsDue(minutesAgo(5), 99999, now)).toBe(false);
  });

  /*
   * 坏时间戳和时钟回跳都按「该同步」处理。宁可多跑一趟，也不要因为一个解析
   * 不出来的值或者一次 NTP 校时，把同步永久卡在「不用跑」上——那种坏法用户
   * 是看不见的，只会发现数据停在某一天。
   */
  it('坏时间戳与时钟回跳不会把同步永久卡住', () => {
    expect(launchSyncIsDue('not a timestamp', 15, now)).toBe(true);
    const future = new Date(now + 60 * 60_000).toISOString();
    expect(launchSyncIsDue(future, 15, now)).toBe(true);
  });
});
