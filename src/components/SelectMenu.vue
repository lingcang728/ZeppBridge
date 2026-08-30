<script setup lang="ts">
/**
 * 下拉选择器。
 *
 * 原生 `<select>` 的弹层由操作系统画，在 Windows 上是一块白底、方角、系统字体
 * 的列表——和这个应用的其它部分完全不像同一个软件。这里用一个按钮加一层自绘
 * 列表替掉它，样式走设计 token，行为按 listbox 的键盘约定来：
 * 上下移动、Home/End 跳首尾、Enter/Space 选中、Esc 关闭、失焦关闭。
 *
 * 只做「从一列固定选项里挑一个」这一件事。需要搜索或分组的场景（比如设备型号
 * 目录）有它们自己的组件，不要往这里堆。
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { defineMessages, useMessages } from '../i18n';
import Icon from './Icon.vue';

export interface SelectMenuOption {
  value: string | number;
  label: string;
  /** 选项下面的一行小字，可选。 */
  hint?: string;
}

const props = withDefaults(defineProps<{
  modelValue: string | number | null;
  options: SelectMenuOption[];
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  /** 弹层向上展开——按钮靠近视口底部时用。 */
  dropUp?: boolean;
}>(), {
  disabled: false,
  // 空串表示「用默认文案」：withDefaults 的默认值在 props 解析时求值，
  // 那时还拿不到当前语言。
  placeholder: '',
  ariaLabel: undefined,
  dropUp: false,
});

const messages = defineMessages(
  { placeholder: '请选择' },
  { placeholder: 'Select…' },
);
const t = useMessages(messages);

const emit = defineEmits<{ (event: 'update:modelValue', value: string | number): void }>();

const open = ref(false);
const activeIndex = ref(-1);
const root = ref<HTMLElement | null>(null);
const triggerRef = ref<HTMLElement | null>(null);
const listRef = ref<HTMLElement | null>(null);

/*
 * 弹层 Teleport 到 body，位置每次打开时按触发按钮的实际位置算。
 *
 * 上一版把它留在原地，结果在运动详情里同时踩了两个坑：hero 卡片有
 * `overflow: hidden`，弹层被祖先裁掉，既看不全也滚不动；而 hero 里的指标卡
 * 建了自己的层叠上下文，直接画在弹层上面，看起来就像弹层是半透明的。
 *
 * 这两件事都不是调 z-index 能可靠解决的——只要祖先里有 overflow、transform
 * 或自己的层叠上下文，就会再犯。挂到 body 上用 fixed 定位，从根上避开。
 */
const menuStyle = ref<Record<string, string>>({});
const MENU_MAX_HEIGHT = 268;
const VIEWPORT_MARGIN = 8;

const measure = () => {
  const trigger = triggerRef.value;
  if (!trigger) return;
  const rect = trigger.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_MARGIN;
  const spaceAbove = rect.top - VIEWPORT_MARGIN;
  // 下方放不下就翻上去；两边都不宽裕时选空间大的那一侧，并把高度压到放得下。
  const dropUp = props.dropUp
    ? spaceAbove > MENU_MAX_HEIGHT || spaceAbove > spaceBelow
    : spaceBelow < Math.min(MENU_MAX_HEIGHT, 160) && spaceAbove > spaceBelow;
  const available = Math.max(120, Math.floor(dropUp ? spaceAbove : spaceBelow));
  menuStyle.value = {
    position: 'fixed',
    left: `${Math.round(rect.left)}px`,
    width: `${Math.round(rect.width)}px`,
    maxHeight: `${Math.min(MENU_MAX_HEIGHT, available)}px`,
    ...(dropUp
      ? { bottom: `${Math.round(window.innerHeight - rect.top + 4)}px` }
      : { top: `${Math.round(rect.bottom + 4)}px` }),
  };
};

const selectedIndex = computed(() =>
  props.options.findIndex((option) => option.value === props.modelValue));
const selectedLabel = computed(() =>
  (selectedIndex.value >= 0 ? props.options[selectedIndex.value].label : (props.placeholder || t.value.placeholder)));

const scrollActiveIntoView = () => {
  void nextTick(() => {
    const list = listRef.value;
    if (!list) return;
    const item = list.children[activeIndex.value] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  });
};

const openMenu = () => {
  if (props.disabled) return;
  measure();
  open.value = true;
  activeIndex.value = selectedIndex.value >= 0 ? selectedIndex.value : 0;
  scrollActiveIntoView();
};

const closeMenu = () => {
  open.value = false;
  activeIndex.value = -1;
};

const toggle = () => (open.value ? closeMenu() : openMenu());

const choose = (index: number) => {
  const option = props.options[index];
  if (!option) return;
  emit('update:modelValue', option.value);
  closeMenu();
};

const move = (delta: number) => {
  if (!props.options.length) return;
  if (!open.value) {
    openMenu();
    return;
  }
  const next = activeIndex.value + delta;
  activeIndex.value = Math.min(props.options.length - 1, Math.max(0, next));
  scrollActiveIntoView();
};

const onKeydown = (event: KeyboardEvent) => {
  switch (event.key) {
    case 'ArrowDown': event.preventDefault(); move(1); break;
    case 'ArrowUp': event.preventDefault(); move(-1); break;
    case 'Home': if (open.value) { event.preventDefault(); activeIndex.value = 0; scrollActiveIntoView(); } break;
    case 'End': if (open.value) { event.preventDefault(); activeIndex.value = props.options.length - 1; scrollActiveIntoView(); } break;
    case 'Enter':
    case ' ':
      event.preventDefault();
      if (open.value) choose(activeIndex.value);
      else openMenu();
      break;
    case 'Escape': if (open.value) { event.preventDefault(); closeMenu(); } break;
    case 'Tab': closeMenu(); break;
    default: break;
  }
};

const onPointerDown = (event: PointerEvent) => {
  if (!open.value) return;
  const target = event.target as Node;
  // 弹层被 Teleport 到 body 之后就不在 `root` 里了，所以这里必须**两个**都放行。
  //
  // 只判断 root 的话会这样：点选项 → 这个捕获阶段的监听先把菜单关掉 → 元素被
  // 移除 → click 根本落不到选项上，于是「怎么点都选不中」。组件上挂的
  // `@pointerdown.stop` 是冒泡阶段的，救不了捕获阶段已经发生的事。
  if (root.value?.contains(target)) return;
  if (listRef.value?.contains(target)) return;
  closeMenu();
};

/* 弹层已经不在触发按钮旁边了，页面一滚它就会停在原地。跟着重新量比强行
   关掉更不打断人，窗口尺寸变化同理。 */
const reposition = () => {
  if (!open.value) return;
  measure();
};

watch(open, (isOpen) => {
  if (isOpen) {
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
  } else {
    window.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('scroll', reposition, true);
    window.removeEventListener('resize', reposition);
  }
});
onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onPointerDown, true);
  window.removeEventListener('scroll', reposition, true);
  window.removeEventListener('resize', reposition);
});
</script>

<template>
  <div ref="root" :class="['select-menu', { 'is-open': open, 'is-disabled': disabled }]">
    <button
      type="button"
      class="select-trigger"
      role="combobox"
      :aria-expanded="open"
      :aria-label="ariaLabel"
      aria-haspopup="listbox"
      :disabled="disabled"
      ref="triggerRef"
      @click="toggle"
      @keydown="onKeydown"
    >
      <span :class="['select-value', { placeholder: selectedIndex < 0 }]">{{ selectedLabel }}</span>
      <Icon name="chevron-down" :size="14" class="select-caret" />
    </button>

    <Teleport to="body">
      <ul
        v-if="open"
        ref="listRef"
        class="select-list"
        :style="menuStyle"
        role="listbox"
        :aria-label="ariaLabel"
        @pointerdown.stop
      >
        <li
          v-for="(option, index) in options"
          :key="option.value"
          role="option"
          :aria-selected="option.value === modelValue"
          :class="['select-option', {
            'is-active': index === activeIndex,
            'is-selected': option.value === modelValue,
          }]"
          @mouseenter="activeIndex = index"
          @click="choose(index)"
        >
          <span class="option-label">{{ option.label }}</span>
          <span v-if="option.hint" class="option-hint">{{ option.hint }}</span>
          <Icon v-if="option.value === modelValue" name="circle-check" :size="14" class="option-tick" />
        </li>
      </ul>
    </Teleport>
  </div>
</template>

<!-- 弹层被 Teleport 到 body，已经不在这个组件的作用域里，所以它的样式必须
     写成非 scoped。类名带 select- 前缀，避免和别处撞车。 -->
<style>
.select-list {
  z-index: 2000;
  margin: 0;
  padding: 4px;
  overflow-y: auto;
  border: 1px solid var(--line-strong, rgba(226, 234, 242, .16));
  border-radius: var(--radius-sm);
  /* 实心背景。半透明会让下面的内容透上来，选项就没法读了。 */
  background: #24272F;
  box-shadow: 0 18px 44px rgba(4, 6, 8, .55);
  list-style: none;
}
.select-list .select-option {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 2px 8px;
  padding: 8px 10px;
  border-radius: 7px;
  color: var(--muted);
  font-size: 13px;
  cursor: pointer;
}
.select-list .select-option.is-active { background: #2E323B; color: var(--ink); }
.select-list .select-option.is-selected { color: var(--ink); font-weight: 600; }
.select-list .option-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.select-list .option-hint { grid-column: 1 / -1; color: var(--subtle); font-size: 11px; font-weight: 400; }
.select-list .option-tick { color: var(--accent); }
</style>

<style scoped>
.select-menu { position: relative; min-width: 0; }

.select-trigger {
  display: flex;
  width: 100%;
  min-height: 36px;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
  color: var(--ink);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: border-color 140ms ease, background 140ms ease;
}
.select-trigger:hover:not(:disabled) { border-color: rgba(221, 231, 239, .22); }
.select-trigger:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.is-open .select-trigger { border-color: var(--accent); }
.is-disabled .select-trigger, .select-trigger:disabled { opacity: .55; cursor: not-allowed; }

.select-value { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.select-value.placeholder { color: var(--subtle); }
.select-caret { flex: 0 0 auto; color: var(--muted); transition: transform 160ms ease; }
.is-open .select-caret { transform: rotate(180deg); }


</style>
