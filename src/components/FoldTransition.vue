<script setup lang="ts">
/**
 * 点了以后插进来 / 收起来的一块（审计 B 组，2026-10-07）：高度从 0 平滑长到自己的高度、同时淡入并轻轻落下；
 * 收起反过来。下面的内容跟着平滑让位，不再「啪」地被推下去。
 *
 * 用法：<FoldTransition><div v-if="open">…</div></FoldTransition>（里面只放一个元素）。
 * 只给小块用（表单、提示条、选择器）：高度动画每帧要排版，整页大块别用它。减少动效时直接出现。
 */
const props = withDefaults(defineProps<{
  duration?: number;
  /** 从哪个角长出来（transform-origin），比如按钮在左上角就是 'top left'；配合 scale 用。 */
  origin?: string;
  /** 起点的缩放：1 = 只是向下展开；.94 = 从 origin 那一角长出来。 */
  scale?: number;
}>(), { duration: 320, origin: '50% 0', scale: 1 });
const from = () => `translateY(-6px) scale(${props.scale})`;
const EASE = 'cubic-bezier(.4, .6, .2, 1)';
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

const enter = (el: Element, done: () => void) => {
  const node = el as HTMLElement;
  if (reduced()) { done(); return; }
  const height = node.scrollHeight;
  node.style.overflow = 'clip';
  node.style.transformOrigin = props.origin;
  const animation = node.animate(
    [
      { height: '0px', opacity: 0, transform: from(), marginTop: '0px', marginBottom: '0px' },
      { height: `${height}px`, opacity: 1, transform: 'none' },
    ],
    { duration: props.duration, easing: EASE },
  );
  const finish = () => { node.style.overflow = ''; node.style.transformOrigin = ''; done(); };
  animation.finished.then(finish, finish);
};

const leave = (el: Element, done: () => void) => {
  const node = el as HTMLElement;
  if (reduced()) { done(); return; }
  const height = node.offsetHeight;
  node.style.overflow = 'clip';
  node.style.transformOrigin = props.origin;
  const animation = node.animate(
    [
      { height: `${height}px`, opacity: 1, transform: 'none' },
      { height: '0px', opacity: 0, transform: from(), marginTop: '0px', marginBottom: '0px' },
    ],
    { duration: Math.round(props.duration * 0.8), easing: 'cubic-bezier(.4, 0, .7, .2)', fill: 'forwards' },
  );
  animation.finished.then(done, done);
};
</script>

<template>
  <Transition :css="false" @enter="enter" @leave="leave"><slot /></Transition>
</template>
