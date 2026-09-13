<script setup lang="ts">
/**
 * 自绘日期选择器。月份名、星期名、一周起点跟**系统地区**，不跟界面语言。
 *
 * 不用原生 `<input type="date">`：WebView2 那块日历样式不受控，弹层也盖
 * 不住本应用的对话框。地区合同和原生控件一样——界面只有中/英/西三份，
 * 系统地区却有很多，不能把日历折进那三份里。
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { defineMessages, useMessages } from '../i18n';
import {
  calendarCells,
  calendarMonthTitle,
  calendarWeekdayNames,
} from '../lib/calendarLocale';
import { displayDateTimeFormatter, parseDisplayDate } from '../lib/dateTime';
import { localDateString } from '../lib/format';
import { popoverStyle } from '../lib/popoverPosition';
import Icon from './Icon.vue';

const props = withDefaults(defineProps<{
  modelValue: string | null;
  min?: string;
  max?: string;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
}>(), {
  min: undefined,
  max: undefined,
  disabled: false,
  placeholder: '',
  ariaLabel: undefined,
});

const emit = defineEmits<{ (event: 'update:modelValue', value: string): void }>();

const messages = defineMessages(
  { placeholder: '选择日期', aria: '选择日期', prev: '上个月', next: '下个月' },
  { placeholder: 'Pick a date', aria: 'Choose a date', prev: 'Previous month', next: 'Next month' },
  { placeholder: 'Elige una fecha', aria: 'Elegir fecha', prev: 'Mes anterior', next: 'Mes siguiente' },
);
const t = useMessages(messages);

const open = ref(false);
const pickerYear = ref(new Date().getFullYear());
const pickerMonth = ref(new Date().getMonth());
const root = ref<HTMLElement | null>(null);
const triggerRef = ref<HTMLElement | null>(null);
const calendarRef = ref<HTMLElement | null>(null);
const calendarStyle = ref<Record<string, string>>({});

const CALENDAR_WIDTH = 280;
const CALENDAR_MAX_HEIGHT = 320;

const displayValue = computed(() => {
  if (!props.modelValue) return props.placeholder || t.value.placeholder;
  const date = parseDisplayDate(props.modelValue);
  if (Number.isNaN(date.getTime())) return props.modelValue;
  return displayDateTimeFormatter({
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
});

const monthTitle = computed(() => calendarMonthTitle(pickerYear.value, pickerMonth.value));
const weekdayNames = computed(() => calendarWeekdayNames());
const cells = computed(() => calendarCells(pickerYear.value, pickerMonth.value));
const today = computed(() => localDateString(new Date()));

const outOfRange = (dateStr: string): boolean => {
  if (!dateStr) return true;
  if (props.min && dateStr < props.min) return true;
  if (props.max && dateStr > props.max) return true;
  return false;
};

const measure = () => {
  const trigger = triggerRef.value;
  if (!trigger) return;
  const rect = trigger.getBoundingClientRect();
  calendarStyle.value = popoverStyle(
    { top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width },
    { width: window.innerWidth, height: window.innerHeight },
    { maxHeight: CALENDAR_MAX_HEIGHT, width: CALENDAR_WIDTH },
  ) as unknown as Record<string, string>;
};

const syncMonthToValue = () => {
  const date = props.modelValue ? parseDisplayDate(props.modelValue) : new Date();
  const valid = !Number.isNaN(date.getTime());
  const source = valid ? date : new Date();
  pickerYear.value = source.getFullYear();
  pickerMonth.value = source.getMonth();
};

const openPicker = () => {
  if (props.disabled) return;
  syncMonthToValue();
  measure();
  open.value = true;
  void nextTick(measure);
};

const closePicker = (restoreFocus = false) => {
  open.value = false;
  if (restoreFocus) triggerRef.value?.focus();
};

const toggle = () => (open.value ? closePicker() : openPicker());

const prevMonth = () => {
  if (pickerMonth.value === 0) {
    pickerMonth.value = 11;
    pickerYear.value -= 1;
  } else {
    pickerMonth.value -= 1;
  }
};

const nextMonth = () => {
  if (pickerMonth.value === 11) {
    pickerMonth.value = 0;
    pickerYear.value += 1;
  } else {
    pickerMonth.value += 1;
  }
};

const choose = (dateStr: string) => {
  if (!dateStr || outOfRange(dateStr)) return;
  emit('update:modelValue', dateStr);
  closePicker(true);
};

const onKeydown = (event: KeyboardEvent) => {
  if (event.key !== 'Escape' || !open.value) return;
  event.preventDefault();
  event.stopPropagation();
  closePicker(true);
};

const onPointerDown = (event: PointerEvent) => {
  if (!open.value) return;
  const target = event.target as Node;
  if (root.value?.contains(target)) return;
  if (calendarRef.value?.contains(target)) return;
  closePicker();
};

const reposition = () => {
  if (!open.value) return;
  measure();
};

watch(open, (isOpen) => {
  if (isOpen) {
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    window.addEventListener('keydown', onKeydown, true);
  } else {
    window.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('scroll', reposition, true);
    window.removeEventListener('resize', reposition);
    window.removeEventListener('keydown', onKeydown, true);
  }
});
onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onPointerDown, true);
  window.removeEventListener('scroll', reposition, true);
  window.removeEventListener('resize', reposition);
  window.removeEventListener('keydown', onKeydown, true);
});
</script>

<template>
  <div ref="root" :class="['date-picker', { 'is-open': open, 'is-disabled': disabled }]">
    <button
      type="button"
      class="date-picker-trigger"
      ref="triggerRef"
      :disabled="disabled"
      :aria-label="ariaLabel || t.aria"
      :aria-expanded="open"
      aria-haspopup="dialog"
      @click="toggle"
    >
      <span :class="['date-picker-value', { placeholder: !modelValue }]">{{ displayValue }}</span>
      <Icon name="clock" :size="14" class="date-picker-icon" />
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        ref="calendarRef"
        class="date-picker-popover"
        :style="calendarStyle"
        role="dialog"
        :aria-label="ariaLabel || t.aria"
        @pointerdown.stop
        @mousedown.prevent
      >
        <div class="date-picker-header">
          <button type="button" class="date-picker-nav" :aria-label="t.prev" @click="prevMonth">
            <Icon name="arrow-left" :size="12" />
          </button>
          <span class="date-picker-title">{{ monthTitle }}</span>
          <button type="button" class="date-picker-nav" :aria-label="t.next" @click="nextMonth">
            <Icon name="arrow-right" :size="12" />
          </button>
        </div>
        <div class="date-picker-weekdays">
          <span v-for="(name, index) in weekdayNames" :key="`${name}-${index}`">{{ name }}</span>
        </div>
        <div class="date-picker-grid">
          <button
            v-for="(cell, index) in cells"
            :key="cell.dateStr || `empty-${index}`"
            type="button"
            :disabled="!cell.day || outOfRange(cell.dateStr)"
            :class="['date-picker-day', {
              'is-empty': !cell.day,
              'is-selected': cell.dateStr === modelValue,
              'is-today': cell.dateStr === today,
            }]"
            @click="choose(cell.dateStr)"
          >{{ cell.day || '' }}</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style>
.date-picker-popover {
  z-index: 2200;
  overflow-y: auto;
  padding: 10px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
  box-shadow: 0 18px 44px rgba(4, 6, 8, .55);
}
.date-picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.date-picker-title {
  color: var(--ink);
  font-size: var(--fs-sm);
  font-weight: 600;
}
.date-picker-nav {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 6px;
  background: var(--surface);
  color: var(--muted);
  cursor: pointer;
}
.date-picker-nav:hover { color: var(--accent); }
.date-picker-weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  margin-bottom: 4px;
  color: var(--subtle);
  font-size: var(--fs-2xs);
  text-align: center;
}
.date-picker-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}
.date-picker-day {
  display: grid;
  place-items: center;
  height: 32px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--ink);
  font-size: var(--fs-xs);
  font-family: var(--font-mono);
  cursor: pointer;
}
.date-picker-day:hover:not(:disabled) { background: var(--surface-hover); }
.date-picker-day.is-today:not(.is-selected) { box-shadow: inset 0 0 0 1px var(--line-control); }
.date-picker-day.is-selected { background: var(--accent); color: var(--accent-ink); font-weight: 700; }
.date-picker-day.is-empty,
.date-picker-day:disabled { cursor: default; color: var(--subtle); }
.date-picker-day.is-empty { visibility: hidden; }
</style>

<style scoped>
.date-picker { min-width: 0; width: 100%; }
.date-picker-trigger {
  display: flex;
  width: 100%;
  min-height: 44px;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid var(--line-control);
  border-radius: 8px;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  font-size: var(--fs-md);
  text-align: left;
  cursor: pointer;
}
.date-picker-trigger:hover:not(:disabled) { border-color: var(--line-control); }
.date-picker-trigger:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.is-open .date-picker-trigger { border-color: var(--accent); }
.is-disabled .date-picker-trigger,
.date-picker-trigger:disabled { opacity: .55; cursor: not-allowed; }
.date-picker-value { min-width: 0; overflow-wrap: anywhere; }
.date-picker-value.placeholder { color: var(--subtle); }
.date-picker-icon { flex: 0 0 auto; color: var(--muted); }
</style>
