/**
 * 库是空的，该说哪一句。
 *
 * 「本机还没有数据」这一句在同步之前是对的，同步之后就不对了——它让人去做刚
 * 做过的事。而同步跑通了却一条记录都没带回来，最常见的原因是登录时没能确认
 * 账号所在的 Zepp 区域：打向错误区域的请求一路成功、返回空，界面上和「这段
 * 时间你确实没数据」长得一模一样。这个函数把这几种情况分开。
 *
 * 判断和文案分开：这里只出码，句子由组件按当前语言写。
 */
/**
 * 只声明这个判断真正读的那几个字段，而不是整个 AppStatus。
 *
 * 组件拿到的状态是 `DeepReadonly` 的，写死成 AppStatus 只会在调用点上逼出一个
 * 类型断言——那正是以后悄悄放错东西进来的地方。
 */
export interface EmptyLibraryInput {
  readonly coverage?: { readonly earliest_day: string | null } | null;
  readonly last_cloud_sync_at?: string;
  readonly last_cloud_sync_outcome?: string;
  readonly region_confidence?: string;
}

export type EmptyLibraryNotice =
  /** 库里有数据，什么都不用说。 */
  | 'none'
  /** 还没跟云端同步过。「先同步一次」是对的。 */
  | 'never_synced'
  /** 同步跑通了，库还是空的，原因未知。 */
  | 'synced_empty'
  /** 同步跑通了，库还是空的，而且当前区域是猜出来的——最可能就是猜错了。 */
  | 'synced_empty_unconfirmed_region';

/**
 * 一次云端同步算不算「跑通了」。
 *
 * 只看有没有时间戳不够：失败的同步同样会留下时间戳，而「失败了所以是空的」
 * 本来就有它自己的报错，不该在这里再解释一遍。
 */
const cloudSyncSucceeded = (status: EmptyLibraryInput): boolean => {
  if (!status.last_cloud_sync_at) return false;
  return status.last_cloud_sync_outcome === 'updated'
    || status.last_cloud_sync_outcome === 'no_new_data';
};

export const emptyLibraryNotice = (
  status: EmptyLibraryInput | null | undefined,
): EmptyLibraryNotice => {
  // 状态还没读回来时不猜。空状态和空库不是一回事。
  if (!status) return 'none';
  if (status.coverage?.earliest_day) return 'none';
  if (!cloudSyncSucceeded(status)) return 'never_synced';
  return status.region_confidence === 'unconfirmed'
    ? 'synced_empty_unconfirmed_region'
    : 'synced_empty';
};
