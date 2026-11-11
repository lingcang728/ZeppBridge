/**
 * Beta 实验室的开关（2026-11-10，计划 C1）：实验性功能默认关，开没开记在本机。
 * 只放「关掉就和没有一样」的东西：玻璃组的合并动效样机（D2）；「推给云端」（2026-11-11）——
 * 关着时界面上没有任何云端的字样，也不去读云端组件的状态。unstrap 导入导出是一次性的动作，不需要开关。
 */
import { ref, type Ref } from 'vue';

export type LabFlag = 'glassGroup' | 'cloud';

const KEY = 'zeppbridge.labs';

const read = (): Partial<Record<LabFlag, boolean>> => {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Partial<Record<LabFlag, boolean>>) : {};
  } catch {
    return {};
  }
};

const flags: Record<LabFlag, Ref<boolean>> = {
  glassGroup: ref(read().glassGroup === true),
  cloud: ref(read().cloud === true),
};

/** 某个实验开关（响应式）。 */
export const labFlag = (flag: LabFlag): Ref<boolean> => flags[flag];

export const setLabFlag = (flag: LabFlag, on: boolean): void => {
  flags[flag].value = on;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(Object.entries(flags).map(([k, v]) => [k, v.value]))));
  } catch {
    // 存不下就只在这次运行里生效。
  }
};
