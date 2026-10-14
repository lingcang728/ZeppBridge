/**
 * 扑克牌动效素材库（精修批次 7.1，第三轮 A 重做）。用法写在 docs/development/ui-guidelines.md 的「Playing cards and the collection box」一节（中文版「扑克牌与收集箱」）。
 *
 * - 发牌 `dealCards`：先从来处抽出一叠，再扇开；理牌 `stackCards` + 放回 `returnStack`（= `stackAndReturn`）：
 *   收牌先理成一叠、再整叠放回来处（按钮里，或落进被点的那一叠）；`fanBack`：收到一半又不收了，扇回原位；
 * - 翻面 `flipCard`：2D 压扁换面（不做 3D，字不糊）；
 * - 洗牌 `shuffleCards` / 切牌 `cutDeck`：换一副、重新理过；
 * - 收牌成叠再飞走 `gatherCards`：送达动画（训练计划发到手表）；
 * - 汇聚 `convergeCards` / `emergeFrom`：交给 AI 舞台上牌沿线飞进门锁、回执牌从锁里长出来；
 * - 飞进 / 飞出收集箱 `flyCardHome` / `flyFromBox`：真牌本身离开牌位（替身摆在完全相同的位置），到了才算数；
 *   来处接住 `receive`、光圈 `landPulse`、顶一下 `bump`；
 * - 小丑盒 `box.ts`：盖子弹开接住飞来的牌（`catchCard`）、铺开 / 收起时弹起 / 合上（`lidOpen` / `lidClose`）；
 * - 镜头推进 `recedeLayer`：上一层收拢进被点的那一叠、退到后面压暗，不拷贝文字；
 * - 打断 `reversible.ts`：从此刻的计算样式原路放回、编排发号；`relay()` 打断接力（新点击立刻生效，旧动画收尾）。
 * 全部只动 transform / opacity，弹簧缓动见 `spring.ts`；减少动效时退化成淡入淡出或不放。
 */
export { dealCards, stackCards, returnStack, stackAndReturn, fanBack, type Landing } from './deal';
export { flipCard } from './flip';
export { shuffleCards, cutDeck } from './shuffle';
export { gatherCards, type CardFlight } from './gather';
export { convergeCards, emergeFrom, pourFromBox, type Convergence } from './converge';
export { flyCardHome, flyFromBox, receive, landPulse, bump } from './fly';
export { recedeLayer, type Receded } from './camera';
export { catchCard, lidOpen, lidClose } from './box';
export { animateFromNow, fromNow, cancelOn, sequence, relay, HANDOFF_MS, type Sequence, type Relay } from './reversible';
export { springCurve, SPRINGS, reducedMotion, settled, type Spring } from './spring';
