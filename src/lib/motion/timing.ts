/**
 * 「从卡打开 / 关回卡」的时长、曲线和分段淡入淡出：设置卡叠（composables/useDeckMorph.ts）和
 * 概览 ↔ 详情页（composables/usePageMorph.ts）共用同一份，两边的手感不再各走各的。
 *
 * 曲线不那么靠前：旧的概览曲线 35% 的时间就走完形状，剩下两百多毫秒原地不动。中段仍有运动、末段收住、不回弹。
 */
export const OPEN_MS = 330;
export const CLOSE_MS = 290;
export const OPEN_EASE = 'cubic-bezier(.3, .7, .2, 1)';
export const CLOSE_EASE = 'cubic-bezier(.32, .62, .2, 1)';

/** 卡身跟着形状一起出来（12%–50% 淡入；形状这时已走了大半），关上时在前 35% 淡出。
    不能等形状走完才淡入：那段时间里窗口长满了却一个字没有（「空板」）。按线性时间轴放。 */
export const BODY_IN: Keyframe[] = [{ opacity: 0 }, { opacity: 0, offset: 0.12 }, { opacity: 1, offset: 0.5 }, { opacity: 1 }];
export const BODY_OUT: Keyframe[] = [{ opacity: 1 }, { opacity: 0, offset: 0.35 }, { opacity: 0 }];

/** 来处那一层退到后面：绕顶边中点缩小、变淡（设置卡叠的 `.deck-overview.is-receded` 同一组值）。 */
export const RECEDE_SCALE = 0.94;
export const RECEDE_OPACITY = 0.32;
