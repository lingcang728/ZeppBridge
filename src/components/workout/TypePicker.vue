<script setup lang="ts">
/* 运动类型纠正：点当前类型，弹出可搜索的列表。
   以前是一枚 220px 宽的横向滚轮装了 129 项，找「壁球」得一格一格拨过去；滚轮适合三四个
   选项，不适合一百多个。外观仍是一枚胶囊，里面换成搜索 + 列表，最近用过的排在最上面。 */
import { computed, nextTick, ref } from 'vue';
import Icon from '../Icon.vue';
import ModalDialog from '../ModalDialog.vue';
import { defineMessages, useMessages } from '../../i18n';

const props = defineProps<{
  modelValue: string;
  items: { value: string; label: string }[];
  disabled?: boolean;
  label: string;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const messages = defineMessages(
  {
    title: '改成哪种运动',
    search: '搜索运动类型',
    recent: '最近用过',
    all: '全部类型',
    noMatch: '没有匹配的类型',
    current: '当前',
    close: '关闭',
  },
  {
    title: 'Change the workout type',
    search: 'Search workout types',
    recent: 'Recently used',
    all: 'All types',
    noMatch: 'No matching type',
    current: 'Current',
    close: 'Close',
  },
  {
    title: 'Cambiar el tipo de entrenamiento',
    search: 'Buscar tipos de entrenamiento',
    recent: 'Usados recientemente',
    all: 'Todos los tipos',
    noMatch: 'Ningún tipo coincide',
    current: 'Actual',
    close: 'Cerrar',
  },
  'components/workout/TypePicker',
);
const t = useMessages(messages);

const RECENT_KEY = 'zeppbridge-type-override-recent';
const readRecent = (): string[] => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
};

const open = ref(false);
const query = ref('');
const active = ref(0);
const input = ref<HTMLInputElement | null>(null);
const listEl = ref<HTMLElement | null>(null);
const recent = ref<string[]>([]);

const currentLabel = computed(() =>
  props.items.find((item) => item.value === props.modelValue)?.label ?? props.items[0]?.label ?? '');

const normalize = (text: string) => text.toLocaleLowerCase().replace(/\s+/g, '');
/** 列表分两段：没输入时「最近用过」在上；输入后只剩匹配项（名字或目录 key 里含这串字）。 */
const sections = computed(() => {
  const needle = normalize(query.value);
  if (needle) {
    const hits = props.items.filter((item) => normalize(item.label).includes(needle) || normalize(item.value).includes(needle));
    return [{ key: 'all', title: '', options: hits }];
  }
  const byValue = new Map(props.items.map((item) => [item.value, item]));
  const recentOptions = recent.value.map((value) => byValue.get(value)).filter((item) => !!item && item.value !== '');
  return [
    ...(recentOptions.length ? [{ key: 'recent', title: t.value.recent, options: recentOptions as typeof props.items }] : []),
    { key: 'all', title: recentOptions.length ? t.value.all : '', options: props.items },
  ];
});
const flat = computed(() => sections.value.flatMap((section) => section.options.map((option) => ({ section: section.key, option }))));

const show = async () => {
  if (props.disabled) return;
  recent.value = readRecent();
  query.value = '';
  open.value = true;
  await nextTick();
  const index = flat.value.findIndex((entry) => entry.option.value === props.modelValue && entry.section === 'all');
  active.value = Math.max(0, index);
  input.value?.focus({ preventScroll: true });
  scrollActive();
};
const close = () => { open.value = false; };

const choose = (value: string) => {
  if (value) {
    const next = [value, ...readRecent().filter((item) => item !== value)].slice(0, 5);
    try { window.localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* 记不住就算了 */ }
  }
  open.value = false;
  if (value !== props.modelValue) emit('update:modelValue', value);
};

const scrollActive = () => {
  void nextTick(() => listEl.value?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }));
};
const onQuery = () => { active.value = 0; scrollActive(); };
const onKey = (event: KeyboardEvent) => {
  const count = flat.value.length;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (!count) return;
    active.value = (active.value + (event.key === 'ArrowDown' ? 1 : -1) + count) % count;
    scrollActive();
  } else if (event.key === 'Enter') {
    event.preventDefault();
    const entry = flat.value[active.value];
    if (entry) choose(entry.option.value);
  }
};
const indexOf = (section: string, value: string) =>
  flat.value.findIndex((entry) => entry.section === section && entry.option.value === value);
</script>

<template>
  <button type="button" class="type-picker pill-button" :disabled="disabled" :aria-label="`${label} · ${currentLabel}`"
    aria-haspopup="dialog" @click="show">
    <span>{{ currentLabel }}</span><Icon name="chevron-down" :size="14" />
  </button>
  <ModalDialog v-if="open" labelledby="type-picker-title" @close="close">
    <div class="tp-head">
      <h2 id="type-picker-title">{{ t.title }}</h2>
      <button type="button" class="tp-close" :aria-label="t.close" @click="close"><Icon name="x" :size="16" /></button>
    </div>
    <label class="tp-search">
      <Icon name="search" :size="16" />
      <input ref="input" v-model="query" type="search" :placeholder="t.search" :aria-label="t.search"
        role="combobox" aria-controls="type-picker-list" aria-expanded="true" autocomplete="off"
        :aria-activedescendant="flat[active] ? `tp-${flat[active].section}-${flat[active].option.value || 'none'}` : undefined"
        @input="onQuery" @keydown="onKey" />
    </label>
    <div id="type-picker-list" ref="listEl" class="tp-list" role="listbox" :aria-label="label">
      <template v-for="section in sections" :key="section.key">
        <p v-if="section.title" class="tp-section" role="presentation">{{ section.title }}</p>
        <button v-for="option in section.options" :id="`tp-${section.key}-${option.value || 'none'}`" :key="`${section.key}-${option.value}`"
          type="button" role="option" tabindex="-1"
          :class="['tp-option', { 'is-current': option.value === modelValue }]"
          :data-active="indexOf(section.key, option.value) === active"
          :aria-selected="option.value === modelValue"
          @pointermove="active = indexOf(section.key, option.value)" @click="choose(option.value)">
          <span>{{ option.label }}</span>
          <small v-if="option.value === modelValue"><Icon name="check" :size="14" />{{ t.current }}</small>
        </button>
      </template>
      <p v-if="!flat.length" class="tp-empty">{{ t.noMatch }}</p>
    </div>
  </ModalDialog>
</template>

<style scoped>
.type-picker { display: inline-flex; align-items: center; gap: 6px; min-height: 30px; max-width: 240px; }
.type-picker span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tp-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.tp-head h2 { margin: 0; font-size: var(--fs-lg); }
.tp-close { display: grid; place-items: center; width: 32px; height: 32px; border: 0; border-radius: 999px; background: transparent; color: var(--muted); cursor: pointer; }
.tp-close:hover { background: color-mix(in srgb, var(--ink) 6%, transparent); color: var(--ink); }
.tp-search { display: flex; align-items: center; gap: 8px; padding: 0 12px; border: 1px solid var(--line-control); border-radius: var(--radius-md); background: var(--mat-inset); color: var(--muted); }
.tp-search:focus-within { outline: 2px solid var(--focus); outline-offset: 1px; }
.tp-search input { flex: 1; min-width: 0; height: 40px; border: 0; background: transparent; color: var(--ink); font: inherit; outline: none; }
.tp-list { display: grid; gap: 2px; max-height: min(52vh, 420px); margin-top: 10px; overflow-y: auto; overscroll-behavior: contain; }
.tp-section { margin: 8px 0 2px; padding: 0 10px; color: var(--subtle); font-size: var(--fs-xs); font-weight: 650; }
.tp-option { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 36px; padding: 6px 10px; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--ink); font: inherit; font-size: var(--fs-sm); text-align: left; cursor: pointer; }
.tp-option[data-active="true"] { background: color-mix(in srgb, var(--ink) 7%, transparent); }
.tp-option.is-current { color: var(--accent); font-weight: 650; }
.tp-option small { display: inline-flex; align-items: center; gap: 4px; color: var(--accent); font-size: var(--fs-xs); }
.tp-empty { margin: 16px 0; color: var(--subtle); font-size: var(--fs-sm); text-align: center; }
</style>
