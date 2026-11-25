<script setup lang="ts">
/**
 * 睡前标签胶囊：图标 + 名字，点一下勾上 / 取消。
 * `codes` 给了就只摆这几个；`collapsible` 时先摆常见的 8 个，后面一枚「更多 +10」展开其余（勾上的总会摆出来）。
 */
import { computed, ref } from 'vue';
import { BEDTIME_TAGS, FREQUENT, TAG_BY_CODE } from './journalCodes';
import BedtimeIcon from './BedtimeIcon.vue';
import { useSleepJournalText } from './sleepJournal.i18n';
import type { BedtimeCode } from '../../types/sleepJournal';

const props = withDefaults(defineProps<{ selected: BedtimeCode[]; codes?: BedtimeCode[]; collapsible?: boolean; disabled?: boolean }>(), {
  codes: undefined, collapsible: false, disabled: false,
});
const emit = defineEmits<{ toggle: [BedtimeCode] }>();
const t = useSleepJournalText();
const expanded = ref(false);

const shown = computed(() => {
  if (props.codes) return props.codes.map((code) => TAG_BY_CODE.get(code)!).filter(Boolean);
  if (!props.collapsible || expanded.value) return BEDTIME_TAGS;
  const keep = new Set<BedtimeCode>([...FREQUENT, ...props.selected]);
  return BEDTIME_TAGS.filter((tag) => keep.has(tag.code)).sort((a, b) => {
    const ia = FREQUENT.indexOf(a.code);
    const ib = FREQUENT.indexOf(b.code);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
});
const hidden = computed(() => BEDTIME_TAGS.length - shown.value.length);
</script>

<template>
  <span class="tag-chips">
    <button
      v-for="tag in shown" :key="tag.code" type="button" :class="['tag-chip', { on: selected.includes(tag.code) }]"
      :style="{ '--chip-tone': tag.color }" :aria-pressed="selected.includes(tag.code)" :disabled="disabled"
      @click="emit('toggle', tag.code)"
    ><BedtimeIcon :code="tag.code" :size="22" /><span>{{ t.tag[tag.key] }}</span></button>
    <button v-if="collapsible && (expanded || hidden > 0)" type="button" class="tag-chip more" :aria-expanded="expanded" @click="expanded = !expanded">
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
.tag-chip:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.tag-chip:disabled { cursor: default; opacity: .6; }
</style>
