/**
 * 扑克牌动效素材库（精修批次 7.1）。用法写在 docs/development/ui-guidelines.md 的「Playing cards and the collection box」一节（中文版「扑克牌与收集箱」）。
 *
 * - 发牌 `dealCards` / 收牌 `collectCards`：一层牌从来处扇出、收回来处；
 * - 翻面 `flipCard`：2D 压扁换面（不做 3D，字不糊）；
 * - 洗牌 `shuffleCards` / 切牌 `cutDeck`：换一副、重新理过；
 * - 收牌成叠再飞走 `gatherCards`：送达动画（训练计划发到手表）；
 * - 飞进收集箱 `flyToTarget`；
 * - 镜头推进 `recedeLayer`：上一层退到后面、换成预先模糊好的静态拷贝。
 * 全部只动 transform / opacity，弹簧缓动见 `spring.ts`；减少动效时退化成淡入淡出或不放。
 */
export { dealCards, collectCards } from './deal';
export { flipCard } from './flip';
export { shuffleCards, cutDeck } from './shuffle';
export { gatherCards, type CardFlight } from './gather';
export { flyToTarget } from './fly';
export { recedeLayer, type Receded } from './camera';
export { springCurve, SPRINGS, reducedMotion, type Spring } from './spring';
