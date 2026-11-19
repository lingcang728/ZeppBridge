/**
 * 显影：数据的形状从第一帧起就完整、可读，只是墨色偏淡；落定后再沿时间方向（从左到右 / 从 12 点顺时针）变成实色。
 *
 * 用来代替「从 0 画到目标值」那种入场：飞行落地那一刻页面不是空的，任何一帧里的数都是真实值，也不重画几何。
 * 一个对象（一条睡眠记录、日历里一段刚补上的月份）一次运行只显影一次；少动效、低特效 / 低档机器直接是实色。
 *
 * 用在睡眠详情首屏（views/SleepDetail.vue → CircularProgress / StageBar）和金缮日历（components/archive/KintsugiCalendar.vue）。
 * 薄纱的样式是 material.css 的 `.develop-wash`。
 */
import { lessMotion } from './lessMotion';
import { autoLite } from './tier';
import { DEVELOP_EASE, DEVELOP_MS } from './timing';

/** 三段：潜伏（淡色）→ 显影中 → 实色。父组件持有这个值，子组件只按它画。 */
export type InkPhase = 'latent' | 'develop' | 'solid';

/** 潜伏态最多停这么久，等不到显影就直接变实：宁可少一次显影，也不能让淡色卡在页面上。 */
export const DEVELOP_GUARD_MS = 2000;
/** 形变落定后再停一小下才显影：让落地的换手先放完（三只钟，不两件事叠在一起）。 */
export const DEVELOP_DELAY_MS = 80;

const played = new Set<string>();

/** 这一项这次要不要显影：少动效、低档 / 低电量、已经播过，都不要。 */
export const shouldDevelop = (key: string): boolean => !lessMotion() && !autoLite.value && !played.has(key);
export const markDeveloped = (key: string): void => { played.add(key); };
/** 测试用。 */
export const resetDevelop = (): void => { played.clear(); };

/**
 * 薄纱从左向右退开（右边缘钉住、左边缘往右收）。放完或被取消（Esc、切入口会取消页面里的动画）都调 done，
 * 绝不留一层盖着的东西。少动效时立刻 done。
 */
export const developWash = (wash: HTMLElement, done: () => void, duration = DEVELOP_MS): Animation | null => {
  if (lessMotion() || typeof wash.animate !== 'function') { done(); return null; }
  const run = wash.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration, easing: DEVELOP_EASE, fill: 'forwards' });
  run.finished.then(done, done);
  return run;
};
