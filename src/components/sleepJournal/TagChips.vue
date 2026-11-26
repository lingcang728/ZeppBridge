<script setup lang="ts">
/**
 * 睡前标签胶囊：图标 + 名字，点一下勾上 / 取消。
 * `codes` 给了就只摆这几个；`collapsible` 时先摆常见的 8 个，后面一枚「更多 +10」展开其余（勾上的总会摆出来）。
 * `large`（首页打卡）：胶囊放大、按列铺满整行，和上面那排脸一样宽。
 *
 * 更多 / 收起：容器高度从旧值平滑过到新值；展开时多出来的几枚逐个淡入，收起时先淡出再收高度。只动 height / opacity / transform。
 */
import { computed, nextTick, ref } from 'vue';
import { BEDTIME_TAGS, FREQUENT, TAG_BY_CODE } from './journalCodes';
import BedtimeIcon from './BedtimeIcon.vue';
import { useSleepJournalText } from './sleepJournal.i18n';
import { reducedMotion } from '../../lib/motion/cards';
import type { BedtimeCode } from '../../types/sleepJournal';

const props = withDefaults(defineProps<{ selected: BedtimeCode[]; codes?: BedtimeCode[]; collapsible?: boolean; disabled?: boolean; large?: boolean }>(), {
  codes: undefined, collapsible: false, disabled: false, large: false,
});
const emit = defineEmits<{ toggle: [BedtimeCode] }>();
const t = useSleepJournalText();
const expanded = ref(false);
const root = ref<HTMLElement | null>(null);
let busy = false;

const collapsedCodes = computed(() => {
  const keep = new Set<BedtimeCode>([...FREQUENT, ...props.selected]);
  return BEDTIME_TAGS.filter((tag) => keep.has(tag.code)).sort((a, b) => {
    const ia = FREQUENT.indexOf(a.code);
    const ib = FREQUENT.indexOf(b.code);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
});
const shown = computed(() => {
  if (props.codes) return props.codes.map((code) => TAG_BY_CODE.get(code)!).filter(Boolean);
  if (!props.collapsible || expanded.value) {
    // 展开时常见的几枚留在原位，其余接在后面：前面的胶囊不挪，只有新来的淡入。
    const first = collapsedCodes.value;
    return [...first, ...BEDTIME_TAGS.filter((tag) => !first.includes(tag))];
  }
  return collapsedCodes.value;
});
const hidden = computed(() => BEDTIME_TAGS.length - collapsedCodes.value.length);
const extra = (code: BedtimeCode) => props.collapsible && !collapsedCodes.value.some((tag) => tag.code === code);

const EASE = 'cubic-bezier(.2, .8, .2, 1)';
const toggleMore = async () => {
  const el = root.value;
  if (busy) return;
  if (!el || reducedMotion()) { expanded.value = !expanded.value; return; }
  busy = true;
  // 动画期间才裁切（平时不裁，聚焦框和勾上的投影不被切掉）。
  el.style.overflow = 'hidden';
  try {
    const from = el.getBoundingClientRect().height;
    if (expanded.value) {
      // 收起：多出来的先淡出，再收高度。
      const leaving = [...el.querySelectorAll<HTMLElement>('.tag-chip.extra')];
      await Promise.all(leaving.map((chip) => chip.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(4px) scale(.96)' }],
        { duration: 160, easing: 'ease', fill: 'forwards' }).finished));
      el.style.height = `${from}px`;
      expanded.value = false;
      await nextTick();
      el.style.height = '';
      const to = el.getBoundingClientRect().height;
      await el.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: 320, easing: EASE }).finished;
    } else {
      expanded.value = true;
      await nextTick();
      const to = el.getBoundingClientRect().height;
      const grow = el.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: 380, easing: EASE });
      [...el.querySelectorAll<HTMLElement>('.tag-chip.extra')].forEach((chip, i) => {
        chip.animate([{ opacity: 0, transform: 'translateY(6px) scale(.96)' }, { opacity: 1, transform: 'none' }],
          { duration: 260, delay: 60 + i * 24, easing: EASE, fill: 'backwards' });
      });
      await grow.finished;
    }
  } finally {
    el.style.overflow = '';
    busy = false;
  }
};
</script>

<template>
  <span ref="root" :class="['tag-chips', { large }]">
    <button
      v-for="tag in shown" :key="tag.code" type="button" :class="['tag-chip', { on: selected.includes(tag.code), extra: extra(tag.code) }]"
      :style="{ '--chip-tone': tag.color }" :aria-pressed="selected.includes(tag.code)" :disabled="disabled"
      @click="emit('toggle', tag.code)"
    ><BedtimeIcon :code="tag.code" :size="large ? 26 : 22" /><span>{{ t.tag[tag.key] }}</span></button>
    <button v-if="collapsible && (expanded || hidden > 0)" type="button" class="tag-chip more" :aria-expanded="expanded" @click="toggleMore">
      {{ expanded ? t.less : t.more(hidden) }}
    </button>
  </span>
</template>

<style scoped>
.tag-chips { display: flex; flex-wrap: wrap; gap: 8px; min-width: 0; }
.tag-chip { display: inline-flex; align-items: center; gap: 7px; max-width: 100%; min-height: 34px; padding: 5px 13px 5px 7px; border: 1.5px solid transparent; border-radius: 999px;
  background: color-mix(in srgb, var(--ink) 6%, transparent); color: var(--muted); font: 600 var(--fs-sm) var(--font-sans); cursor: pointer;
  transition: background var(--dur-fast, 140ms) ease, border-color var(--dur-fast, 140ms) ease, color var(--dur-fast, 140ms) ease; }
.tag-chip > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tag-chip:hover:not(:disabled) { color: var(--ink); }
.tag-chip.on { border-color: var(--chip-tone); background: var(--mat-raised, var(--mat-card)); color: var(--ink); box-shadow: 0 2px 8px rgb(0 0 0 / .08); }
.tag-chip.more { padding: 5px 13px; color: var(--subtle); }
/* 首页打卡：按列铺满整行（和上面五张脸同宽），胶囊高一号、字大一号。 */
.tag-chips.large { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; padding: 2px; }
.large .tag-chip { justify-content: flex-start; min-height: 46px; padding: 7px 14px 7px 10px; gap: 9px; border-radius: 14px; font-size: var(--fs-md); }
.large .tag-chip.more { justify-content: center; padding: 7px 14px; }
.tag-chip:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.tag-chip:disabled { cursor: default; opacity: .6; }
</style>
