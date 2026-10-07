/**
 * 一次性提示条（第三轮精修 A6）：第一次打开牌桌 / 铺开收集箱时，底部浮上一条操作说明，带「知道了」；
 * 点了就不再出现。取代常驻在底下的一行小字（用户：「一直挂着很碍眼」）。
 *
 * 只是本机的界面偏好，存 localStorage；读写都包着 try/catch——隐私窗口、存储被禁时读不到，就照常显示。
 * 键盘说明不靠它：牌桌把那句话放进 `aria-describedby`，读屏每次都能听到。
 */
import { ref, type Ref } from 'vue';

const PREFIX = 'zeppbridge.coach.';
const seen = new Map<string, Ref<boolean>>();

const read = (id: string): boolean => {
  try {
    return window.localStorage.getItem(PREFIX + id) === '1';
  } catch {
    return false;
  }
};

export const useCoachTip = (id: string) => {
  let state = seen.get(id);
  if (!state) {
    state = ref(read(id));
    seen.set(id, state);
  }
  const dismissed = state;
  return {
    /** 还没点过「知道了」。 */
    visible: () => !dismissed.value,
    dismiss: () => {
      dismissed.value = true;
      try {
        window.localStorage.setItem(PREFIX + id, '1');
      } catch {
        // 存不下就只在这次会话里不再显示。
      }
    },
  };
};
