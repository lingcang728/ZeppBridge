/**
 * 窗口形变（lib/motion/window.ts）里那张卡的拷贝：展开的第一帧、收回的最后一帧，窗口里就是它，
 * 撤掉窗口时真卡原样接上。所以它必须和真卡**一个像素都不差**——差一点，起落那一帧就是一下跳变。
 *
 * 以前只是把卡 cloneNode 一份放进窗口板（2026-10-02 逐张卡比对：本周对比的小格、最近记录的时间线条目，
 * 拷贝比真卡暗 10–35 个灰度级，点开那一下暗一截、收回落地那一下亮一截；大卡上的字也偏一点）。
 * 拷贝一离开原位就丢了三样东西，这里一样样带上：
 *
 * 1. **祖先和卡身后的一切**：半透明的卡在原位透出的是父面板的底、面板上画的线（时间线那根横线是
 *    `.timeline::before`）；写在祖先上的选择器、继承下来的字体（等宽数字）、祖先上定义的 CSS 变量也都要在。
 *    做法是把通往这张卡的那一串祖先各拷一个空壳（类名和属性照抄，没有别的孩子），每层按它在页面上的
 *    大小和位置绝对定位，一层套一层，拷贝放在最里面——底、边框、伪元素都画在原来的位置上，选择器照样匹配，
 *    继承照样往下传。整块裁成卡的形状（窗口板在卡那一端本来就裁成卡的矩形和圆角）。
 * 2. **此刻的样子**：拷贝不会处于 :hover（点开时指针正停在卡上），卡自身的底、投影、边框和文字颜色按计算值写上去。
 * 3. **画布**：ECharts 拷出来是空的，按像素画一遍。
 */
export interface ReplicaRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** 空壳不带这些：重复的 id、行内样式（里面可能是切页时的 visibility / top）、可交互的属性。 */
const SKIP_ATTRS = new Set(['id', 'style', 'href', 'tabindex', 'role', 'aria-current', 'aria-label', 'title', 'inert']);

/** 一层放在上一层里的什么位置：相对上一层的内边距盒（绝对定位的参照）。 */
const offsetIn = (box: DOMRect, host: { rect: DOMRect; left: number; top: number }) => ({
  left: `${box.left - host.rect.left - host.left}px`,
  top: `${box.top - host.rect.top - host.top}px`,
});

/** 摆成原位的样子：固定大小、绝对定位，自己不再动（入场动画、悬停位移、切页的变换都不要）。 */
const FROZEN: Partial<CSSStyleDeclaration> = {
  position: 'absolute',
  margin: '0',
  boxSizing: 'border-box',
  minWidth: '0',
  minHeight: '0',
  maxWidth: 'none',
  maxHeight: 'none',
  transform: 'none',
  translate: 'none',
  scale: 'none',
  rotate: 'none',
  pointerEvents: 'none',
};

/** 祖先上的装饰层（绝对定位、不接指针、对读屏隐藏）：跟着指针走的高光（lib/tilt.ts）之类。
    指针停在面板里的小卡上时，面板的高光正照在它身上——拷贝里少了它，点开那一下就暗一块。 */
const decorative = (node: Element): node is HTMLElement => {
  if (!(node instanceof HTMLElement) || node.getAttribute('aria-hidden') !== 'true') return false;
  const computed = getComputedStyle(node);
  return (computed.position === 'absolute' || computed.position === 'fixed') && computed.pointerEvents === 'none';
};

/** 兄弟按原来的顺序摆：装饰层原样拷过去，别的换成不渲染的占位——结构选择器（:first-child、:nth-child）
    还按原位判断，装饰层和卡的上下层次也和原位一样。 */
const MAX_SIBLINGS = 80;
const placeLike = (parent: HTMLElement, child: HTMLElement, original: HTMLElement) => {
  const siblings = original.parentElement ? [...original.parentElement.children] : [];
  if (!siblings.includes(original) || siblings.length > MAX_SIBLINGS) {
    parent.appendChild(child);
    return;
  }
  for (const sibling of siblings) {
    if (sibling === original) parent.appendChild(child);
    else if (decorative(sibling)) parent.appendChild(sibling.cloneNode(true));
    else parent.appendChild(document.createElement('template'));
  }
};

/** 页面根（.page-host 的孩子）为止，卡的各层祖先，从外到里。 */
const ancestorsOf = (card: HTMLElement): HTMLElement[] => {
  const chain: HTMLElement[] = [];
  for (let node = card.parentElement; node; node = node.parentElement) {
    if (node.classList.contains('page-host') || node.id === 'main-content' || node === document.body) break;
    chain.unshift(node);
  }
  return chain;
};

/** 祖先的空壳：同样的标签、类名和属性，行内只留 CSS 变量（有的组件把 --tone 之类写在行内）。 */
const shellOf = (node: HTMLElement): HTMLElement => {
  const shell = document.createElement(node.tagName.toLowerCase());
  for (const attr of node.attributes) {
    if (!SKIP_ATTRS.has(attr.name)) shell.setAttribute(attr.name, attr.value);
  }
  for (const name of node.style) {
    if (name.startsWith('--')) shell.style.setProperty(name, node.style.getPropertyValue(name));
  }
  return shell;
};

/** 画布按像素拷过去（cloneNode 拷出来是空白的）。 */
const copyCanvases = (from: HTMLElement, to: HTMLElement) => {
  const sources = from.querySelectorAll('canvas');
  const targets = to.querySelectorAll('canvas');
  sources.forEach((source, index) => {
    const target = targets[index];
    if (!target || !source.width || !source.height) return;
    target.width = source.width;
    target.height = source.height;
    try {
      target.getContext('2d')?.drawImage(source, 0, 0);
    } catch {
      // WebGL 之类拷不出来就留空：它只在窗口一端短暂出现。
    }
  });
};

/**
 * 那张卡的一份拷贝：只是用来「看」的——去掉可交互性、固定成卡此刻的尺寸，放进窗口里跟着缩放。
 * 返回的 `el` 是外面那层（卡的大小、裁成卡的形状），动画动它。
 */
export function cardReplica(card: HTMLElement): { el: HTMLElement; rect: ReplicaRect } {
  const box = card.getBoundingClientRect();
  const style = getComputedStyle(card);

  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('inert', '');
  el.className = 'window-replica';
  Object.assign(el.style, {
    position: 'absolute',
    left: '0px',
    top: '0px',
    width: `${box.width}px`,
    height: `${box.height}px`,
    overflow: 'hidden',
    borderRadius: style.borderRadius,
    pointerEvents: 'none',
    transformOrigin: '50% 50%',
    willChange: 'transform, opacity',
  });

  // 祖先一层套一层，各按原位摆好。display: contents 的祖先本来就没有盒子：空壳也不要盒子，位置按外面那层算。
  let parent: HTMLElement = el;
  let host = { rect: box, left: 0, top: 0 };
  ancestorsOf(card).forEach((node, depth) => {
    const shell = shellOf(node);
    const computed = getComputedStyle(node);
    if (computed.display === 'contents') {
      shell.style.display = 'contents';
    } else {
      const rect = node.getBoundingClientRect();
      Object.assign(shell.style, FROZEN, offsetIn(rect, host), {
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        // 会滚动的祖先（横着的时间线）在这里不出滚动条，照样裁。
        overflow: computed.overflowX === 'visible' && computed.overflowY === 'visible' ? 'visible' : 'hidden',
      });
      host = { rect, left: node.clientLeft, top: node.clientTop };
    }
    // 页面根那一层不补占位（它的兄弟是正在离场的旧页）。
    if (depth === 0) parent.appendChild(shell);
    else placeLike(parent, shell, node);
    parent = shell;
  });

  const copy = card.cloneNode(true) as HTMLElement;
  copy.removeAttribute('href');
  copy.removeAttribute('id');
  for (const node of copy.querySelectorAll('[id]')) node.removeAttribute('id');
  Object.assign(copy.style, FROZEN, offsetIn(box, host), {
    width: `${box.width}px`,
    height: `${box.height}px`,
    opacity: '1',
    // 此刻的样子（含 :hover）：卡自身的底、投影、边框和文字颜色。
    backgroundImage: style.backgroundImage,
    backgroundColor: style.backgroundColor,
    boxShadow: style.boxShadow,
    borderColor: style.borderColor,
    color: style.color,
  });
  copyCanvases(card, copy);
  if (parent === el) parent.appendChild(copy);
  else placeLike(parent, copy, card);

  return { el, rect: { left: box.left, top: box.top, width: box.width, height: box.height } };
}
