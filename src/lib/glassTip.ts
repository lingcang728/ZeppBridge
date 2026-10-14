/**
 * 全局玻璃提示（10-08 录屏 H1）：浏览器原生的 `title` 提示是一块白底黑字的小方框，停一下就冒出来——
 * 用户点「调整」时看到的「先闪一个白框」就是它（挑日子、左上角 Logo 也一样）。
 *
 * 做法：指针一进带 `title` 的元素，就把 `title` 挪到 `data-tip`（原生提示没机会出来），停 450ms 后在旁边
 * 画一块玻璃提示；离开、按下、滚动、按键立刻收。按钮上已经写着同样的字（「调整」的 title 就是「调整」）不提示。
 * 没有可读名字的图标按钮，挪走 title 时顺手补上 aria-label，读屏不丢东西。
 * 全站一处装（AppShell），各组件照旧写 `title`，不用一个个改。只动 opacity / translate。
 */
const SHOW_MS = 450;
const GAP = 8;
const EDGE = 8;

const visibleText = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();
const norm = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase();

/** 挪走 `title`，返回提示文字。按钮自己已经写着这句话就返回 null。 */
export const takeTitle = (el: HTMLElement): string | null => {
  const title = el.getAttribute('title');
  if (title !== null) {
    el.removeAttribute('title');
    if (title.trim()) {
      el.dataset.tip = title;
      if (!el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby') && !visibleText(el)) el.setAttribute('aria-label', title);
    }
  }
  const tip = el.dataset.tip?.trim();
  if (!tip) return null;
  const text = norm(visibleText(el));
  return text && (text === norm(tip) || text.includes(norm(tip))) ? null : tip;
};

/** 提示放在元素上方居中；上面放不下就放下面；左右夹在窗口里。 */
export const placeTip = (anchor: DOMRect, tip: { width: number; height: number }, view: { width: number; height: number }) => {
  const above = anchor.top - GAP - tip.height >= EDGE;
  const top = above ? anchor.top - GAP - tip.height : Math.min(view.height - EDGE - tip.height, anchor.bottom + GAP);
  const left = Math.max(EDGE, Math.min(view.width - EDGE - tip.width, anchor.left + anchor.width / 2 - tip.width / 2));
  return { top, left, above };
};

export const installGlassTips = (): (() => void) => {
  const tip = document.createElement('div');
  tip.className = 'glass-tip';
  tip.setAttribute('role', 'tooltip');
  tip.setAttribute('aria-hidden', 'true');
  document.body.appendChild(tip);
  let owner: HTMLElement | null = null;
  /** 刚按过的那个元素：指针离开它之前不再提示（点完界面一重画，浏览器会补一次 pointerover）。 */
  let pressed: HTMLElement | null = null;
  let timer = 0;

  const hide = () => {
    window.clearTimeout(timer);
    timer = 0;
    owner = null;
    tip.classList.remove('shown');
  };
  const show = (el: HTMLElement, text: string) => {
    if (!el.isConnected) return;
    tip.textContent = text;
    const at = placeTip(el.getBoundingClientRect(), { width: tip.offsetWidth, height: tip.offsetHeight }, { width: window.innerWidth, height: window.innerHeight });
    tip.style.left = `${Math.round(at.left)}px`;
    tip.style.top = `${Math.round(at.top)}px`;
    tip.classList.toggle('below', !at.above);
    tip.classList.add('shown');
  };

  const onOver = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return;
    const el = (event.target as Element | null)?.closest?.<HTMLElement>('[title], [data-tip]');
    if (!el || !(el instanceof HTMLElement)) return;
    const text = takeTitle(el);
    if (el === owner || el === pressed) return;
    hide();
    if (!text) return;
    owner = el;
    timer = window.setTimeout(() => { if (owner === el) show(el, text); }, SHOW_MS);
  };
  const onOut = (event: PointerEvent) => {
    const to = event.relatedTarget as Node | null;
    if (pressed && !(to && pressed.contains(to))) pressed = null;
    if (!owner) return;
    if (to && owner.contains(to)) return;
    hide();
  };
  const onDown = (event: PointerEvent) => {
    pressed = (event.target as Element | null)?.closest?.<HTMLElement>('[title], [data-tip]') ?? null;
    hide();
  };

  document.addEventListener('pointerover', onOver, true);
  document.addEventListener('pointerout', onOut, true);
  document.addEventListener('pointerdown', onDown, true);
  document.addEventListener('keydown', hide, true);
  window.addEventListener('scroll', hide, true);
  window.addEventListener('blur', hide);
  return () => {
    hide();
    document.removeEventListener('pointerover', onOver, true);
    document.removeEventListener('pointerout', onOut, true);
    document.removeEventListener('pointerdown', onDown, true);
    document.removeEventListener('keydown', hide, true);
    window.removeEventListener('scroll', hide, true);
    window.removeEventListener('blur', hide);
    tip.remove();
  };
};
