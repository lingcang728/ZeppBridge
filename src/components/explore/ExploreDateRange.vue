<script setup lang="ts">
/* 探索页的「快捷范围 + 起止日期」一行，含自绘日历弹层。 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import Icon from '../Icon.vue';
import SegmentTrack from '../SegmentTrack.vue';
import { calendarCells, calendarMonthTitle, calendarWeekdayNames } from '../../lib/calendarLocale';
import { localDateString } from '../../lib/format';
import { popoverStyle } from '../../lib/popoverPosition';
import { rangeOptions } from '../../lib/rangeOptions';
import { useMessages } from '../../i18n';
import { exploreMessages } from '../../views/Explore.i18n';

const start = defineModel<string>('start', { required: true });
const end = defineModel<string>('end', { required: true });
const emit = defineEmits<{ range: [days: number] }>();

const t = useMessages(exploreMessages);

/** 导出快捷范围。比图表多一档 3 个月，因为导出常按季度来。 */
const EXPORT_RANGE_DAYS = [7, 30, 90, 180] as const;

/* 和训练/身体页用同一条梯子（lib/rangeOptions.ts）。以前这里只有 7 天和 30 天，
   想导出半年只能手点日历两下，而图表页明明就摆着一个「6 个月」按钮——
   两处对不上，是「我选了 6 个月却只拿到 30 天」这类误会的一半来源。 */
const ranges = computed(() => rangeOptions(EXPORT_RANGE_DAYS));

const activeRangeDays = computed(() => {
  for (const range of ranges.value) {
    const rangeEnd = new Date();
    const rangeStart = new Date(rangeEnd);
    rangeStart.setDate(rangeStart.getDate() - Math.max(0, range.days - 1));
    if (localDateString(rangeStart) === start.value && localDateString(rangeEnd) === end.value) return range.days;
  }
  return null;
});

/* ── 自定义日期选择器弹层逻辑 ─────────────── */
/*
 * 日历 Teleport 到 body 并用 fixed 定位。
 *
 * 上一版是 `position: absolute; top: calc(100% + 6px); right: 0`，钉死向下
 * 展开。「快捷范围」这一行本来就靠近面板底部，于是日历整块落到窗口下沿之外，
 * 既看不见也滚不到 —— 这就是 issue #9。只调 z-index 或 overflow 都救不回来：
 * 绝对定位的浮层出不了它的包含块。
 *
 * 翻转和夹取的算法与 SelectMenu 共用 `lib/popoverPosition.ts`，两个浮层不该
 * 各写一套、各错一次。
 */
const CALENDAR_WIDTH = 220;
const CALENDAR_MAX_HEIGHT = 300;

const datePickerOpen = ref<'start' | 'end' | null>(null);
const pickerYear = ref(new Date().getFullYear());
const pickerMonth = ref(new Date().getMonth()); // 0-indexed
const startTriggerRef = ref<HTMLElement | null>(null);
const endTriggerRef = ref<HTMLElement | null>(null);
const calendarRef = ref<HTMLElement | null>(null);
const calendarStyle = ref<Record<string, string>>({});

const activeTrigger = () =>
  (datePickerOpen.value === 'start' ? startTriggerRef.value : endTriggerRef.value);

const measureDatePicker = () => {
  const trigger = activeTrigger();
  if (!trigger) return;
  const rect = trigger.getBoundingClientRect();
  calendarStyle.value = popoverStyle(
    { top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width },
    { width: window.innerWidth, height: window.innerHeight },
    { maxHeight: CALENDAR_MAX_HEIGHT, width: CALENDAR_WIDTH },
  ) as unknown as Record<string, string>;
};

const openDatePicker = (target: 'start' | 'end') => {
  const currentVal = target === 'start' ? start.value : end.value;
  const d = currentVal ? new Date(currentVal) : new Date();
  pickerYear.value = d.getFullYear();
  pickerMonth.value = d.getMonth();
  datePickerOpen.value = target;
  // 触发按钮的位置要在 DOM 更新后才准，但 v-if 的浮层还没挂上来，
  // 先按当前按钮量一次，挂上之后 watch 里再量一次。
  void nextTick(measureDatePicker);
};

const closeDatePicker = (restoreFocus = false) => {
  const trigger = activeTrigger();
  datePickerOpen.value = null;
  if (restoreFocus) trigger?.focus();
};

/* 浮层已经不在按钮旁边了，页面一滚它就会停在原地；跟着重新量比强行关掉
   更不打断人，窗口尺寸变化同理。和 SelectMenu 的处理保持一致。 */
const repositionDatePicker = () => {
  if (!datePickerOpen.value) return;
  measureDatePicker();
};

const onDatePickerKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && datePickerOpen.value) {
    event.preventDefault();
    closeDatePicker(true);
  }
};

/* 捕获阶段监听：日历被 Teleport 到 body 之后已经不在 `.range-row` 里，
   只判断触发按钮会让「点日期」在 click 落地前就被关掉，于是怎么点都选不中。
   两边都要放行。 */
const onDatePickerPointerDown = (event: PointerEvent) => {
  if (!datePickerOpen.value) return;
  const target = event.target as Node;
  if (calendarRef.value?.contains(target)) return;
  if (startTriggerRef.value?.contains(target)) return;
  if (endTriggerRef.value?.contains(target)) return;
  closeDatePicker();
};

const detachListeners = () => {
  window.removeEventListener('pointerdown', onDatePickerPointerDown, true);
  window.removeEventListener('scroll', repositionDatePicker, true);
  window.removeEventListener('resize', repositionDatePicker);
  window.removeEventListener('keydown', onDatePickerKeydown);
};

watch(datePickerOpen, (open) => {
  if (open) {
    void nextTick(measureDatePicker);
    window.addEventListener('pointerdown', onDatePickerPointerDown, true);
    window.addEventListener('scroll', repositionDatePicker, true);
    window.addEventListener('resize', repositionDatePicker);
    window.addEventListener('keydown', onDatePickerKeydown);
  } else {
    detachListeners();
  }
});

onBeforeUnmount(detachListeners);

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

/* 月份名、星期名、一周起点跟系统地区，不跟界面语言。界面只有三份，
   系统地区有很多；德语 Windows 上的英文界面仍该看到 März，而不是 September。 */
const calendarTitle = computed(() => calendarMonthTitle(pickerYear.value, pickerMonth.value));
const weekdayNames = computed(() => calendarWeekdayNames());
const calendarDays = computed(() => calendarCells(pickerYear.value, pickerMonth.value));

const selectCalendarDay = (dateStr: string) => {
  if (!dateStr) return;
  if (datePickerOpen.value === 'start') {
    start.value = dateStr;
  } else if (datePickerOpen.value === 'end') {
    end.value = dateStr;
  }
  closeDatePicker(true);
};
</script>

<template>
  <div class="range-row">
    <span class="range-label">{{ t.quickRange }}</span>
    <SegmentTrack
      compact
      :items="ranges.map((range) => ({ value: range.days, label: range.label }))"
      :model-value="activeRangeDays ?? 0"
      :aria-label="t.quickRange"
      @update:model-value="(value) => emit('range', Number(value))"
    />

    <div class="custom-date-picker-wrap">
      <button
        ref="startTriggerRef"
        type="button"
        class="date-trigger-btn"
        :class="{ 'is-open': datePickerOpen === 'start' }"
        :aria-expanded="datePickerOpen === 'start'"
        aria-haspopup="dialog"
        @click="datePickerOpen === 'start' ? closeDatePicker() : openDatePicker('start')"
      >
        <Icon name="clock" :size="12" />
        <span>{{ start || t.startDate }}</span>
      </button>
      <span>~</span>
      <button
        ref="endTriggerRef"
        type="button"
        class="date-trigger-btn"
        :class="{ 'is-open': datePickerOpen === 'end' }"
        :aria-expanded="datePickerOpen === 'end'"
        aria-haspopup="dialog"
        @click="datePickerOpen === 'end' ? closeDatePicker() : openDatePicker('end')"
      >
        <Icon name="clock" :size="12" />
        <span>{{ end || t.endDate }}</span>
      </button>

      <!-- 自定义深橄榄底日历弹层。
           Teleport 到 body：留在原地就会被祖先的包含块裁掉（issue #9）。 -->
      <Teleport to="body">
        <div
          v-if="datePickerOpen"
          ref="calendarRef"
          class="calendar-popover"
          :style="calendarStyle"
          role="dialog"
          :aria-label="t.datePickerAria"
        >
          <div class="cal-header">
            <button type="button" class="cal-nav-btn" @click="prevMonth"><Icon name="arrow-left" :size="12" /></button>
            <span class="cal-title">{{ calendarTitle }}</span>
            <button type="button" class="cal-nav-btn" @click="nextMonth"><Icon name="arrow-right" :size="12" /></button>
          </div>
          <div class="cal-weekdays">
            <span v-for="name in weekdayNames" :key="name">{{ name }}</span>
          </div>
          <div class="cal-grid">
            <button
              v-for="(item, idx) in calendarDays"
              :key="idx"
              type="button"
              :disabled="!item.day"
              :class="['cal-day', {
                'is-empty': !item.day,
                'is-selected': item.dateStr === (datePickerOpen === 'start' ? start : end)
              }]"
              @click="selectCalendarDay(item.dateStr)"
            >
              {{ item.day || '' }}
            </button>
          </div>
        </div>
      </Teleport>
    </div>
  </div>
</template>

<!-- 日历弹层被 Teleport 到 body，已经不在这个组件的作用域里，样式必须
     写成非 scoped。位置由 lib/popoverPosition.ts 算好后以内联样式套上，
     这里只管长相，不再写死 top / right。 -->
<style>
.calendar-popover {
  z-index: 2000;
  overflow-y: auto;
  padding: 10px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  /* 实心背景。半透明会让下面的内容透上来，日期就没法读了。 */
  background: var(--mat-card-solid);
  box-shadow: 0 18px 44px rgba(4, 6, 8, .55);
}
.calendar-popover .cal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.calendar-popover .cal-title { font-size: var(--fs-sm); font-weight: 600; color: var(--ink); }
.calendar-popover .cal-nav-btn { display: grid; place-items: center; width: 22px; height: 22px; border: 0; border-radius: 4px; background: var(--mat-raised); color: var(--muted); cursor: pointer; box-shadow: var(--mat-raised-rim); }
.calendar-popover .cal-nav-btn:hover { color: var(--accent); }
.calendar-popover .cal-weekdays { display: grid; grid-template-columns: repeat(7, 1fr); text-align: center; font-size: var(--fs-2xs); color: var(--subtle); margin-bottom: 4px; }
.calendar-popover .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.calendar-popover .cal-day {
  display: grid;
  place-items: center;
  height: 24px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--ink);
  font-size: var(--fs-xs);
  font-family: var(--font-mono);
  cursor: pointer;
}
.calendar-popover .cal-day:hover:not(:disabled) { background: var(--surface-hover); }
.calendar-popover .cal-day.is-selected { background: var(--accent); color: var(--accent-ink); font-weight: 700; }
.calendar-popover .cal-day.is-empty { cursor: default; }
</style>

<style scoped src="./ExploreDateRange.css"></style>
