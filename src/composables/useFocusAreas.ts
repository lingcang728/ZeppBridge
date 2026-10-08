/**
 * 概览「我关注」的三个区块：睡眠 / 日常状态 / 训练，可多选。
 *
 * 这是看的偏好，不是数据：和界面语言、置顶指标一样存 `localStorage`，不进库、不进导出。
 * 全局单例——概览的首次提问、概览的排序和设置「显示与语言」里那一行读同一份。
 *
 * - `areas`：当前选中的区块（只读；改走 `setAreas`）。空数组 = 没有偏好，概览就是原样。
 * - `setAreas(next)`：换选中集合，同时算回答过首次提问。设置里那一行和提问行都用它。
 * - `asked`：用户回答过或跳过首次提问没有（只读）。
 * - `skipPrompt()`：跳过首次提问：只记「问过了」，不改变选中集合。
 */
import { computed, readonly, ref } from 'vue';
import { defineMessages, useMessages } from '../i18n';
import { FOCUS_AREA_KEYS, FOCUS_AREAS, normalizeAreas, type FocusArea } from '../lib/focusAreas';

const AREAS_KEY = 'zb.focusAreas';
const ASKED_KEY = 'zb.focusAsked';

const readAreas = (): FocusArea[] => {
  try {
    return normalizeAreas(JSON.parse(window.localStorage.getItem(AREAS_KEY) || '[]'));
  } catch {
    return [];
  }
};

const readAsked = (): boolean => {
  try {
    return window.localStorage.getItem(ASKED_KEY) === '1';
  } catch {
    return false;
  }
};

const areas = ref<FocusArea[]>(readAreas());
const asked = ref<boolean>(readAsked());

const writeAreas = (next: FocusArea[]) => {
  try {
    window.localStorage.setItem(AREAS_KEY, JSON.stringify(next));
  } catch {
    // 存不下只影响下次打开，本次会话照样生效。
  }
};

const writeAsked = () => {
  try {
    window.localStorage.setItem(ASKED_KEY, '1');
  } catch { /* 同上 */ }
};

export const setFocusAreas = (next: readonly string[]): FocusArea[] => {
  const picked = normalizeAreas(next);
  areas.value = picked;
  asked.value = true;
  writeAreas(picked);
  writeAsked();
  return picked;
};

export const skipFocusPrompt = (): void => {
  asked.value = true;
  writeAsked();
};

const areaWords = defineMessages(
  {
    areaSleep: '睡眠',
    areaDaily: '日常状态',
    areaTraining: '训练',
  },
  {
    areaSleep: 'Sleep',
    areaDaily: 'Daily status',
    areaTraining: 'Training',
  },
  {
    areaSleep: 'Sueño',
    areaDaily: 'Estado diario',
    areaTraining: 'Entrenamiento',
  },
  'composables/useFocusAreas',
);
const words = useMessages(areaWords);

/** 区块在当前界面语言里的名字（提问行的芯片和设置里那行共用这一份）。 */
export const focusAreaLabel = (area: FocusArea): string =>
  (words.value as Record<string, string>)[FOCUS_AREA_KEYS[area]] ?? area;

export const useFocusAreas = () => ({
  areas: readonly(areas),
  asked: readonly(asked),
  setAreas: setFocusAreas,
  skipPrompt: skipFocusPrompt,
});

/** 选择区块时给芯片 / 菜单排顺序用的那份区块列表。 */
export const focusAreaList = computed(() => FOCUS_AREAS.map((area) => ({ area, label: focusAreaLabel(area) })));
