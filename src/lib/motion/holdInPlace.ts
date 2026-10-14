/**
 * 离场的那一块原地钉住：绝对定位在它此刻的位置和大小上，不再占布局。挂在 `<Transition @before-leave>` 上，
 * 新内容就能同时在它底下排好、出现，它在上面淡掉——交叉淡化，而不是先一帧撤掉、再从空白里淡入。
 *
 * 用在骨架屏换成内容（shell.css 的 `.skeleton-out-*`）：以前骨架在数据到的那一帧整块消失，内容卡片再按错开的
 * 延迟逐张淡入，中间有一瞬间格子是空的——启动时概览就是这样「闪一下」。
 *
 * 钉的参照是 offsetParent（最近的定位祖先），绝对定位也以它为参照，两者一致。
 */
export const holdInPlace = (el: Element): void => {
  if (!(el instanceof HTMLElement)) return;
  const { offsetTop, offsetLeft, offsetWidth, offsetHeight } = el;
  Object.assign(el.style, {
    position: 'absolute',
    top: `${offsetTop}px`,
    left: `${offsetLeft}px`,
    width: `${offsetWidth}px`,
    height: `${offsetHeight}px`,
    margin: '0',
  });
};
