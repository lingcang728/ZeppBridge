/**
 * 玻璃组的登记（2026-11-10，计划 D1）：外层 `provideGlassGroup()` 开一个组，里面的胶囊 / 滚轮用
 * `useGlassMember()` 把自己的矩形和姿态报上来，组据此算出整体状态（lib/glassGroup.ts 的 `groupState`）。
 *
 * 没有外层组时 `useGlassMember` 什么都不做：不读布局、不建响应式数据——现在页面上的控件都是这样，
 * 所以接上这一层不增加任何开销。合并 / 分离的样机（D2，默认关、挂在实验室开关后面）才会开组。
 *
 * 矩形用视口坐标（getBoundingClientRect），只在姿态变化时量，不逐帧量。
 */
import { computed, inject, onBeforeUnmount, provide, shallowReactive, watch, type ComputedRef, type InjectionKey } from 'vue';
import { groupState, RESTING, type GlassPose, type GroupMember, type GroupState } from '../lib/glassGroup';
import type { LensRect } from '../lib/segmentGlass';

export interface GlassGroup {
  members: Map<string, GroupMember>;
  state: ComputedRef<GroupState>;
}

const KEY: InjectionKey<GlassGroup> = Symbol('glass-group');
let serial = 0;

/** 开一个玻璃组。`reach`：两块玻璃空隙小于它时开始并拢（像素）。 */
export const provideGlassGroup = (reach = 24): GlassGroup => {
  const members = shallowReactive(new Map<string, GroupMember>());
  const state = computed(() => groupState([...members.values()], reach));
  const group: GlassGroup = { members, state };
  provide(KEY, group);
  return group;
};

/** 当前所在的组（没有就是 null）。 */
export const useGlassGroup = (): GlassGroup | null => inject(KEY, null);

const toRect = (box: DOMRect): LensRect => ({ x: box.left, y: box.top, w: box.width, h: box.height });

/**
 * 把一块玻璃登记进外层的组。`element` 给出要量的元素，`pose` 给出姿态；姿态一变就重量一次矩形。
 * 返回所在的组（没有组时 null），成员可以据此读整体状态。
 */
export const useGlassMember = (
  name: string,
  element: () => HTMLElement | null,
  pose: () => GlassPose,
): GlassGroup | null => {
  const group = useGlassGroup();
  if (!group) return null;
  const id = `${name}-${(serial += 1)}`;
  const report = (current: GlassPose) => {
    const el = element();
    group.members.set(id, { id, rect: el?.isConnected ? toRect(el.getBoundingClientRect()) : null, pose: current });
  };
  const stop = watch(pose, report, { immediate: true, flush: 'post' });
  onBeforeUnmount(() => {
    stop();
    group.members.delete(id);
  });
  return group;
};

export { RESTING };
