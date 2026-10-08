/**
 * 镜头推进（第三轮精修 A10，取代第二轮「清晰层淡出 + 模糊拷贝淡入」）：往下一层时，上一层的牌先收拢进
 * 被点的那一叠（理牌），这一叠再缩小退到后面、压暗到 0.35；新一层等它完全退好了才从那一叠里抽出来扇开。
 * 返回反之：新一层理成一叠落回那一叠，那一叠走回前面，其余的牌再从它底下扇回原位。
 *
 * 第二轮把整层（连字）克隆一份加模糊、两份交叉淡化，「9/14–9/20」和「9/16」叠成双影十几帧
 * （110910 f14–f22），违反「内容先后交替不叠影」。现在不拷贝任何文字：背景虚靠牌桌底下那层本来就有的静态模糊。
 * 只动 transform / opacity；每段都从此刻的计算样式起放，半路被打断是原路。
 *
 * 第四轮 1A·A6（用户 10-07：多层背景太单薄）：退好以后，这一层和**一份预先模糊好的静态拷贝**交叉淡化——
 * 拷贝摆成此刻的样子（每张牌的计算 transform 抄成行内样式）、带一个固定的 blur，之后只淡入淡出它的 opacity，
 * 不逐帧改模糊半径。退到后面的只是收拢好的那一叠（字本来就压在 0.35 的暗里），拷贝不再和新一层的字叠影。
 * 返回时先交叉淡回清楚的那一层，再走回前面。
 *
 * 10-08 H8（「拖动、点按时会出现明显的重影」）：退后的那一叠以前就停在**原地**缩小压暗——新一层恰好从那里发出来、
 * 摆在它正前方，拖走一张、翻一张，牌缝里就透出后面那一叠的字。现在它一边缩小一边退到牌桌左上角（来处的那一叠，
 * 像桌角放着的一副牌），不再垫在新一层后面。
 */
import { CLOSE_EASE, OPEN_EASE } from '../timing';
import { fanBack, stackCards, type Landing } from './deal';
import { angleOf, centerOfRect, restOf } from './pose';
import { animateFromNow, cancelOn } from './reversible';
import { reducedMotion, settled } from './spring';

const RECEDE_MS = 340;
const PULL_MS = 440;
const RECEDE_SCALE = 0.42;
const RECEDE_OPACITY = 0.4;
/** 退到牌桌左上角：这一叠的中心离牌桌左沿、上沿各多远（按缩小后的牌算，再留一点边）。 */
const CORNER_PAD = 10;
const BLUR_SWAP_MS = 220;
const BLUR = 'blur(5px) saturate(.9)';

/** 这一层此刻的样子拷一份、加上静态模糊（opacity 0，等着淡进来）。 */
const blurredCopy = (layer: HTMLElement): HTMLElement => {
  const copy = layer.cloneNode(true) as HTMLElement;
  copy.removeAttribute('id');
  copy.setAttribute('aria-hidden', 'true');
  copy.inert = true;
  copy.classList.add('blurred-copy');
  const from = [...layer.querySelectorAll<HTMLElement>('.pcard, .pslot')];
  const to = [...copy.querySelectorAll<HTMLElement>('.pcard, .pslot')];
  from.forEach((el, i) => {
    const style = getComputedStyle(el);
    const twin = to[i];
    if (!twin) return;
    twin.style.transform = style.transform;
    twin.style.opacity = style.opacity;
    twin.style.transition = 'none';
  });
  const style = getComputedStyle(layer);
  Object.assign(copy.style, { transform: style.transform, transformOrigin: style.transformOrigin, opacity: '0', filter: BLUR, pointerEvents: 'none', transition: 'none' });
  layer.before(copy);
  return copy;
};

export interface Receded {
  /** 被点的那一叠歇着（没退后）时的样子：返回时新一层整叠落进这里。 */
  pile: Landing;
  /** 那一叠此刻（退在后面）的样子：新一层从这里抽出来。 */
  now: () => Landing;
  /** 走回前面、其余的牌扇回原位；这一层恢复可点。 */
  restore: () => Promise<void>;
  /** 不放动画，直接复原（牌桌整个关掉时用）。 */
  drop: () => void;
}

/**
 * 让 `layer` 收拢进 `pileCard`（这一层里被点的那一叠）并退到后面。立刻返回句柄，动画在 `ready` 里放：
 * `live()` 返回 false 时（被打断）提前停下，退到哪儿算哪儿——调用方随即 `restore()` 原路拉回。
 */
export const recedeLayer = (layer: HTMLElement, pileCard: HTMLElement, live: () => boolean = () => true): Receded & { ready: Promise<void> } => {
  const slot = pileCard.parentElement as HTMLElement | null;
  const rest = restOf(pileCard);
  const pile: Landing = { rect: new DOMRect(rest.center.x - rest.width / 2, rest.center.y - (rest.width * 1.4) / 2, rest.width, rest.width * 1.4), kind: 'pile', angle: rest.angle, width: rest.width };
  const others = [...layer.querySelectorAll<HTMLElement>('.pcard')].filter((card) => card !== pileCard);
  const box = layer.getBoundingClientRect();
  const origin = `${(rest.center.x - box.left).toFixed(1)}px ${(rest.center.y - box.top).toFixed(1)}px`;
  if (slot) slot.style.zIndex = '5';
  layer.inert = true;
  layer.style.transformOrigin = origin;
  const reduced = reducedMotion();
  let restoring = false;
  let copy: HTMLElement | null = null;

  const drop = () => {
    copy?.remove();
    copy = null;
    cancelOn(layer);
    for (const card of others) cancelOn(card);
    layer.inert = false;
    layer.style.transformOrigin = '';
    if (slot) slot.style.zIndex = '';
  };
  const restore = async () => {
    restoring = true;
    if (copy) {
      const swap = animateFromNow(copy, { opacity: 0 }, { duration: BLUR_SWAP_MS, easing: 'ease-out', fill: 'forwards' }, ['opacity']);
      const sharp = animateFromNow(layer, { opacity: RECEDE_OPACITY }, { duration: BLUR_SWAP_MS, easing: 'ease-out', fill: 'forwards' });
      await settled([swap, sharp]);
      copy?.remove();
      copy = null;
    }
    const forward = animateFromNow(layer, { transform: 'none', opacity: 1 }, { duration: reduced ? 160 : PULL_MS, easing: CLOSE_EASE, fill: 'forwards' });
    await settled([forward]);
    if (!reduced) await fanBack(others);
    drop();
  };
  const now = (): Landing => {
    const rect = pileCard.getBoundingClientRect();
    const scale = layer.getBoundingClientRect().width / Math.max(1, layer.offsetWidth);
    const width = rest.width * scale;
    const c = centerOfRect(rect);
    return { rect: new DOMRect(c.x - width / 2, c.y - (width * 1.4) / 2, width, width * 1.4), kind: 'pile', angle: angleOf(slot), width };
  };
  const ready = (async () => {
    if (reduced) {
      await settled([layer.animate([{ opacity: 1 }, { opacity: RECEDE_OPACITY }], { duration: 160, fill: 'forwards' })]);
      return;
    }
    await stackCards(others, rest.center, rest.angle);
    if (!live() || restoring) return;
    // 以那一叠为缩放中心缩小，再整层平移，让那一叠的中心落到牌桌左上角。
    const table = (layer.parentElement ?? layer).getBoundingClientRect();
    const w = rest.width * RECEDE_SCALE;
    const corner = { x: table.left + CORNER_PAD + w / 2, y: table.top + CORNER_PAD + (w * 1.4) / 2 };
    const tx = corner.x - rest.center.x;
    const ty = corner.y - rest.center.y;
    const back = animateFromNow(layer, { transform: `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(${RECEDE_SCALE})`, opacity: RECEDE_OPACITY }, { duration: RECEDE_MS + 80, easing: OPEN_EASE, fill: 'forwards' });
    await settled([back]);
    if (!live() || restoring || back.playState !== 'finished') return;
    // 退好了：换成预先模糊好的静态拷贝（交叉淡化，只动 opacity）。
    copy = blurredCopy(layer);
    const blurIn = copy.animate([{ opacity: 0 }, { opacity: RECEDE_OPACITY }], { duration: BLUR_SWAP_MS, easing: 'ease-out', fill: 'forwards' });
    animateFromNow(layer, { opacity: 0 }, { duration: BLUR_SWAP_MS, easing: 'ease-out', fill: 'forwards' });
    await settled([blurIn]);
  })();
  return { pile, now, restore, drop, ready };
};
