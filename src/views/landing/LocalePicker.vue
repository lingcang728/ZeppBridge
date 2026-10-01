<script setup lang="ts">
/* 语言菜单：一颗地球按钮，点开一列语言（各用自己的名字）。键盘：↑↓ 选、Enter 定、Esc 关。 */
import { nextTick, onBeforeUnmount, ref } from 'vue';
import LandingIcon from './LandingIcon.vue';
import { LANDING_LOCALES, LOCALE_LABELS, type LandingLocale } from '../../composables/useLandingLocale';

defineProps<{ modelValue: LandingLocale; label: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: LandingLocale] }>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);
const list = ref<HTMLElement | null>(null);

const focusCurrent = async () => {
  await nextTick();
  list.value?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
};
const toggle = () => {
  open.value = !open.value;
  if (open.value) void focusCurrent();
};
const choose = (value: LandingLocale) => {
  emit('update:modelValue', value);
  open.value = false;
  root.value?.querySelector<HTMLElement>('button')?.focus();
};
const onKey = (event: KeyboardEvent) => {
  const items = [...(list.value?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];
  const index = items.indexOf(document.activeElement as HTMLElement);
  if (event.key === 'Escape') { open.value = false; root.value?.querySelector<HTMLElement>('button')?.focus(); }
  else if (event.key === 'ArrowDown') { event.preventDefault(); items[(index + 1) % items.length]?.focus(); }
  else if (event.key === 'ArrowUp') { event.preventDefault(); items[(index - 1 + items.length) % items.length]?.focus(); }
};
const onDocDown = (event: PointerEvent) => {
  if (open.value && !root.value?.contains(event.target as Node)) open.value = false;
};
document.addEventListener('pointerdown', onDocDown, true);
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocDown, true));
</script>

<template>
  <div ref="root" class="lp-locale" @keydown="onKey">
    <button type="button" class="lp-locale-btn" :aria-label="label" :aria-expanded="open" aria-haspopup="listbox" @click="toggle">
      <LandingIcon name="globe" :size="17" />
      <span>{{ LOCALE_LABELS[modelValue] }}</span>
      <LandingIcon name="chevron-down" :size="14" :class="['lp-locale-chev', { up: open }]" />
    </button>
    <Transition name="lp-pop">
      <ul v-if="open" ref="list" class="lp-locale-list" role="listbox" :aria-label="label">
        <li
          v-for="value in LANDING_LOCALES"
          :key="value"
          role="option"
          tabindex="-1"
          :aria-selected="value === modelValue"
          :lang="value"
          @click="choose(value)"
          @keydown.enter.prevent="choose(value)"
          @keydown.space.prevent="choose(value)"
        >
          {{ LOCALE_LABELS[value] }}<LandingIcon v-if="value === modelValue" name="check" :size="15" />
        </li>
      </ul>
    </Transition>
  </div>
</template>

<style scoped>
.lp-locale { position: relative; }
.lp-locale-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 40px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--lp-muted);
  font: inherit;
  font-size: 13.5px;
  cursor: pointer;
  transition: color .2s ease, background-color .2s ease;
}
.lp-locale-btn:hover { background: var(--lp-line); color: var(--lp-ink); }
.lp-locale-chev { transition: transform .3s var(--lp-ease); }
.lp-locale-chev.up { transform: rotate(180deg); }
.lp-locale-list {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  min-width: 200px;
  margin: 0;
  padding: 6px;
  border: 1px solid var(--lp-line-2);
  border-radius: 18px;
  background: color-mix(in srgb, var(--lp-panel) 88%, transparent);
  box-shadow: 0 30px 60px -20px rgba(0, 0, 0, .55);
  -webkit-backdrop-filter: blur(20px);
  backdrop-filter: blur(20px);
  list-style: none;
  transform-origin: top right;
}
.lp-locale-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 38px;
  padding: 0 12px;
  border-radius: 12px;
  color: var(--lp-muted);
  font-size: 14px;
  cursor: pointer;
  outline: none;
}
.lp-locale-list li:hover, .lp-locale-list li:focus { background: var(--lp-line); color: var(--lp-ink); }
.lp-locale-list li[aria-selected='true'] { color: var(--lp-green); }
.lp-pop-enter-active, .lp-pop-leave-active { transition: opacity .2s ease, transform .3s var(--lp-ease); }
.lp-pop-enter-from, .lp-pop-leave-to { opacity: 0; transform: translateY(-6px) scale(.96); }
@media (max-width: 520px) { .lp-locale-btn span { display: none; } }
</style>
