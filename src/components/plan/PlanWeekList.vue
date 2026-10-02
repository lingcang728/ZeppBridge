<script setup lang="ts">
/**
 * 一天一行的周列表：日期、训练名、运动 · 时长、改动标记，下面一条色带——长度＝时长（所有天用同一把
 * 尺，长短一眼可比），高度＝目标心率。比七个等宽的小方块读得清：名字不被截断，色带有地方铺开。
 *
 * 休息日只留一道虚线；删除的那天写「休息 · 原来：xx」；窗口外的日子淡一点，标「窗口外」。
 */
import { computed } from 'vue';
import type { DayRow } from '../../lib/trainingPlan/week';
import { workoutProfile } from '../../lib/trainingPlan/profile';
import { INTENSITY_COLOR } from '../../lib/trainingPlan/intensity';
import { displayDateTimeFormatter, parseDisplayDate } from '../../lib/dateTime';
import { usePlanText } from './usePlanText';

const props = defineProps<{ rows: DayRow[]; selected: string | null }>();
const emit = defineEmits<{ select: [date: string] }>();
const { t, sport, minutes } = usePlanText();

/** 色带的满宽对应多少秒：90 分钟，足够放下一次长距离。 */
const RIBBON_SECONDS = 5400;

const weekday = (date: string) => displayDateTimeFormatter({ weekday: 'short' }).format(parseDisplayDate(date));
const monthDay = (date: string) => displayDateTimeFormatter({ month: 'numeric', day: 'numeric' }).format(parseDisplayDate(date));

const list = computed(() => props.rows.map((row) => {
  const current = row.after[0] ?? null;
  const previous = row.before[0] ?? null;
  const profile = current ? workoutProfile(current) : null;
  const badge = !row.inWindow && current ? { text: t.value.badgeOutside, tone: 'same' }
    : row.change === 'added' ? { text: t.value.badgeAdded, tone: 'new' }
      : row.change === 'replaced' ? { text: t.value.badgeReplaced, tone: 'rep' }
        : row.change === 'removed' ? { text: t.value.badgeRemoved, tone: 'del' }
          : row.change === 'unchanged' ? { text: t.value.badgeUnchanged, tone: 'same' } : null;
  return {
    row,
    weekday: weekday(row.date),
    monthDay: monthDay(row.date),
    current,
    previous,
    badge,
    rest: !current,
    meta: current && profile ? `${sport(current.sport)} · ${minutes(Math.round(profile.seconds / 60))}` : '',
    bars: profile ? profile.segments.map((segment) => ({
      grow: segment.seconds,
      height: segment.low !== null && segment.high !== null ? Math.max(18, (((segment.low + segment.high) / 2 - 90) / 90) * 100) : 40,
      color: INTENSITY_COLOR[segment.intensity],
    })) : [],
    width: profile ? Math.min(100, (profile.seconds / RIBBON_SECONDS) * 100) : 0,
  };
}));
</script>

<template>
  <div class="week" role="list">
    <button v-for="item in list" :key="item.row.date" type="button" role="listitem"
      :class="['drow', { sel: item.row.date === selected, later: !item.row.inWindow, rest: item.rest }]"
      :aria-pressed="item.row.date === selected" @click="emit('select', item.row.date)">
      <span :class="['d', { today: item.row.isToday }]">
        <b>{{ item.weekday }}<i v-if="item.row.isToday">{{ t.today }}</i></b>
        <small>{{ item.monthDay }}</small>
      </span>
      <span class="t">
        <b v-if="item.current">{{ item.current.name }}<span>{{ item.meta }}</span></b>
        <b v-else class="muted">{{ t.rest }}<span v-if="item.previous">{{ t.wasName(item.previous.name) }}</span></b>
      </span>
      <span class="st"><span v-if="item.badge" :class="['badge', `b-${item.badge.tone}`]">{{ item.badge.text }}</span></span>
      <span v-if="item.bars.length" class="ribbon" :style="{ width: `${item.width}%` }" aria-hidden="true">
        <i v-for="(bar, index) in item.bars" :key="index" :style="{ flex: bar.grow, height: `${bar.height}%`, background: bar.color }"></i>
      </span>
      <span v-else class="ribbon dash" aria-hidden="true"></span>
    </button>
  </div>
</template>

<style scoped>
.week { display: grid; align-content: start; gap: 2px; padding: 10px 12px 14px; }
.drow {
  display: grid;
  grid-template-columns: 74px minmax(0, 1fr) auto;
  align-items: center;
  gap: 2px 14px;
  width: 100%;
  padding: 10px 14px 11px;
  border: 0;
  border-radius: 16px;
  background: transparent;
  color: var(--ink);
  text-align: left;
  cursor: pointer;
  transition: background var(--dur-fast) ease;
}
.drow:hover { background: var(--surface-hover); }
.drow:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
.drow.sel { background: var(--mat-inset); box-shadow: var(--mat-inset-shadow), inset 0 0 0 1.5px color-mix(in srgb, var(--accent) 65%, transparent); }
.drow.later { opacity: .62; }
.d { display: grid; line-height: 1.25; }
.d b { font-size: var(--fs-sm); }
.d b i { margin-left: 6px; color: var(--accent); font-size: 11px; font-style: normal; font-weight: 700; }
.d small { color: var(--subtle); font-size: var(--fs-2xs); }
.t { min-width: 0; }
.t b { display: flex; align-items: baseline; gap: 8px; min-width: 0; font-size: var(--fs-sm); }
.t b > span { overflow: hidden; color: var(--subtle); font-size: var(--fs-2xs); font-weight: 400; text-overflow: ellipsis; white-space: nowrap; }
.t b.muted { color: var(--subtle); font-weight: 400; }
.st { justify-self: end; min-height: 20px; }
.badge { display: inline-flex; align-items: center; padding: 2px 10px; border-radius: 999px; font-size: var(--fs-2xs); font-weight: 700; white-space: nowrap; }
.b-new { background: var(--accent-soft); color: var(--accent); }
.b-rep { background: var(--pace-wash); color: var(--pace); }
.b-del { background: var(--heart-wash); color: var(--heart); }
.b-same { background: var(--surface-hover); color: var(--subtle); }
.ribbon { grid-column: 2 / 3; display: flex; align-items: flex-end; gap: 2px; height: 26px; margin-top: 5px; }
.ribbon i { display: block; min-width: 3px; border-radius: 5px 5px 2px 2px; }
.ribbon.dash { height: 1px; margin-top: 9px; align-self: center; border-top: 1.5px dashed var(--line-strong); }
</style>
