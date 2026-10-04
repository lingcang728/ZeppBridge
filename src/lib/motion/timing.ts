/**
 * 「从卡打开 / 关回卡」的时长、曲线和分段淡入淡出：设置卡叠（composables/useDeckMorph.ts）和
 * 概览 ↔ 详情页（composables/usePageMorph.ts）共用同一份，两边的手感不再各走各的。
 *
 * 2026-10-03 第二轮（用户：「太快了，傻快傻快的，参考 iOS 那种优雅一点的」）：330 / 290ms 拉到 500 / 440ms，
 * 曲线也不再那么靠前：旧曲线前 100ms 就走完一半多，再拉长时长看上去还是「一下冲到位」；现在 100ms 走四成、
 * 200ms 走八成，后半程长长地减速落定，不回弹（像 iOS）。
 * 慢一点也给预加载和第一帧留出了时间。
 */
export const OPEN_MS = 500;
export const CLOSE_MS = 440;
export const OPEN_EASE = 'cubic-bezier(.4, .6, .2, 1)';
export const CLOSE_EASE = 'cubic-bezier(.4, .6, .2, 1)';

/** 整屏从一个按钮处扩散开（换主题、换语言共用）：和卡片展开同一条曲线，整屏的圆比卡大得多，再慢一点。 */
export const REVEAL_MS = 640;

/** 卡身跟着形状一起出来（12%–50% 淡入；形状这时已走了大半），关上时在前 35% 淡出。
    不能等形状走完才淡入：那段时间里窗口长满了却一个字没有（「空板」）。按线性时间轴放。 */
export const BODY_IN: Keyframe[] = [{ opacity: 0 }, { opacity: 0, offset: 0.12 }, { opacity: 1, offset: 0.5 }, { opacity: 1 }];
export const BODY_OUT: Keyframe[] = [{ opacity: 1 }, { opacity: 0, offset: 0.35 }, { opacity: 0 }];

/** 来处那一层退到后面：绕顶边中点缩小、变淡（设置卡叠的 `.deck-overview.is-receded` 同一组值）。 */
export const RECEDE_SCALE = 0.94;
export const RECEDE_OPACITY = 0.32;
