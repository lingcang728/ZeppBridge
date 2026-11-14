/**
 * 运动详情台前调度的状态机（2026-11-13）：舞台 / 侧栏 / 隐藏 + 排法（台前调度 / 老版两栏）、侧栏叫出、窄窗口哪张在前。
 * 状态迁移全是 lib/stage/state.ts 的纯函数；这里只负责按运动大类读存（lib/stage/prefs.ts）。
 *
 * 只在用户动了布局之后存：打开一条缺卡的运动不会冲掉这一类的习惯。卡片列表变了（洞察算完、逐点序列到了）
 * 就按存档重新校正一遍——存档里有的位置照旧，新出现的卡排到侧栏最后。
 */
import { ref, shallowRef, watch, type Ref } from 'vue';
import * as S from '../lib/stage/state';
import { clearStage, defaultState, loadStage, loadView, saveStage, saveView, type SportClass, type StageView } from '../lib/stage/prefs';

/** wide：横向的宽卡（workoutCards.WIDE_CARDS）；张数变了按它挑档（state.snapFor）。 */
export const useWorkoutStage = (cards: Ref<readonly string[]>, cls: Ref<SportClass>, wide?: (id: string) => boolean) => {
  const state = shallowRef<S.StageState>(loadStage(cls.value, cards.value));
  /**
   * 拖动中的预演（2026-11-13 用户：别画绿框，卡自己让位）：舞台按它排版，松手提交同一份（拖边零跳变），
   * 拖走 / 取消就清掉。不存档。
   */
  const draft = shallowRef<S.StageState | null>(null);
  /** 排法：全局记住（老用户退回老版后，下次打开哪条运动都还是老版）。 */
  const view = ref<StageView>(loadView());
  const stripOpen = ref(false);
  /** 窄窗口里组的哪一张在最前面。 */
  const front = ref<string | undefined>(undefined);

  watch([() => cards.value.join(','), cls], () => { draft.value = null; state.value = loadStage(cls.value, cards.value); });

  const commit = (next: S.StageState) => {
    if (next === state.value || JSON.stringify(next) === JSON.stringify(state.value)) return false;
    state.value = next;
    saveStage(cls.value, next);
    return true;
  };

  /** 换了舞台上的组，窄窗口的「最前面」回到新组的第一张。 */
  const staged = (next: S.StageState, lead?: string) => {
    const changed = commit(next);
    if (lead && next.stage.ids.includes(lead)) front.value = lead;
    else if (!next.stage.ids.includes(front.value ?? '')) front.value = undefined;
    return changed;
  };

  return {
    state,
    draft,
    wide,
    /** 提交预演（拖完松手）；没有预演或没变返回 false。 */
    commitDraft: () => {
      const next = draft.value;
      draft.value = null;
      return next ? staged(next) : false;
    },
    view,
    setView: (next: StageView) => { view.value = next; saveView(next); stripOpen.value = false; },
    stripOpen,
    front,
    bringGroup: (group: number) => staged(S.bringGroup(state.value, group), state.value.strip[group]?.ids[0]),
    cycle: (dir: 1 | -1) => staged(S.cycle(state.value, dir)),
    addToStage: (id: string, at?: number) => staged(S.addToStage(state.value, id, at, wide), id),
    removeFromStage: (id: string) => staged(S.removeFromStage(state.value, id, wide)),
    solo: (id: string) => staged(S.solo(state.value, id), id),
    fullscreen: (id: string) => staged(S.fullscreen(state.value, id), id),
    setSnap: (snap: number) => staged(S.setSnap(state.value, snap)),
    setRatio: (ratio: number) => staged(S.setRatio(state.value, ratio)),
    setSize: (patch: S.SizePatch) => staged(S.setSize(state.value, patch)),
    swapOnStage: (a: string, b: string) => staged(S.swapOnStage(state.value, a, b)),
    hide: (id: string) => staged(S.hide(state.value, id)),
    focusCard: (id: string) => staged(S.focusCard(state.value, id), id),
    setFront: (id: string) => { front.value = id; },
    reset: () => {
      clearStage(cls.value);
      draft.value = null;
      state.value = defaultState(cls.value, cards.value);
      front.value = undefined;
    },
  };
};

export type WorkoutStage = ReturnType<typeof useWorkoutStage>;
