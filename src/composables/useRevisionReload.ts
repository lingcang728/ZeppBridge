import { onActivated, onDeactivated, watch, type WatchSource } from 'vue';
import { useSyncController } from './useSyncController';

/**
 * 数据变了（`dataRevision`）就重查，但页面被 KeepAlive 藏起来时先记一笔，回到前台再查。
 *
 * 以前只有概览有这道门，其余缓存页（睡眠、运动、最近记录、置顶指标……）每次 bump
 * 都立刻在后台重查：一次同步收尾，八九个查询排在命令侧同一把库锁后面，用户切页时
 * 等的就是它们。onActivated / onDeactivated 对 KeepAlive 页里的子组件同样生效，
 * 所以概览的子卡片也可以直接用。
 */
export const useRevisionReload = (reload: () => void, source?: WatchSource<unknown>) => {
  const { dataRevision } = useSyncController();
  let active = true;
  let pending = false;
  onActivated(() => {
    active = true;
    if (pending) {
      pending = false;
      reload();
    }
  });
  onDeactivated(() => { active = false; });
  watch(source ?? dataRevision, () => {
    if (active) reload();
    else pending = true;
  });
};
