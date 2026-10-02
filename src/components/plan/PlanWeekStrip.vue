<script setup lang="ts">
/**
 * 一周一排的日历格：每天一格，格子里只放一眼要看的——星期和日期、运动图标、训练名、时长、
 * 训练形状缩略图，改动用格子右上角一枚小标记说。休息日留白（一枚月亮 + 「休息」），
 * 不用一道虚线占位；删掉的那天写「原来：xx」。窗口外的日子淡一点，标「窗口外」。
 *
 * 所有格子共用同一把时间尺和心率坐标（见 PlanShape），一周的轻重能横着比。
 * 宽度不够时横向滚动，格子不压扁。
 */
import { computed } from 'vue';
import Icon, { type IconName } from '../Icon.vue';
import PlanShape from './PlanShape.vue';
import type { DayRow } from '../../lib/trainingPlan/week';
import { workoutProfile } from '../../lib/trainingPlan/profile';
import { sharedHrDomain } from '../../lib/trainingPlan/summary';
import { displayDateTimeFormatter, parseDisplayDate } from '../../lib/dateTime';
import type { PlanSport } from '../../types/trainingPlan';
import { usePlanText } from './usePlanText';

const props = defineProps<{ rows: DayRow[]; selected: string | null }>();
const emit = defineEmits<{ select: [date: string] }>();
const { t, minutes } = usePlanText();

/** 时间尺的满宽至少对应 90 分钟；这周最长的一次更长就按它。 */
const MIN_SCALE_SECONDS = 5400;
const SPORT_ICON: Record<PlanSport, IconName> = { running: 'run', cycling: 'bike', pool_swim: 'swim', open_water_swim: 'swim' };

const weekday = (date: string) => displayDateTimeFormatter({ weekday: 'short' }).format(parseDisplayDate(date));
const dayOfMonth = (date: string) => displayDateTimeFormatter({ day: 'numeric' }).format(parseDisplayDate(date));
const monthDay = (date: string) => displayDateTimeFormatter({ month: 'numeric', day: 'numeric' }).format(parseDisplayDate(date));

const profiles = computed(() => props.rows.map((row) => (row.after[0] ? workoutProfile(row.after[0]) : null)));
const domain = computed(() => sharedHrDomain(profiles.value.filter((profile) => profile !== null)));
const scale = computed(() => Math.max(MIN_SCALE_SECONDS, ...profiles.value.map((profile) => profile?.seconds ?? 0)));

const cells = computed(() => props.rows.map((row, index) => {
  const current = row.after[0] ?? null;
  const previous = row.before[0] ?? null;
  const profile = profiles.value[index];
  const mark = !row.inWindow && current ? { text: t.value.badgeOutside, tone: 'same' }
    : row.change === 'added' ? { text: t.value.badgeAdded, tone: 'new' }
      : row.change === 'replaced' ? { text: t.value.badgeReplaced, tone: 'rep' }
        : row.change === 'removed' ? { text: t.value.badgeRemoved, tone: 'del' } : null;
  // 每个月第一天、以及第一格，日期写「10/1」，其余只写几号——一排数字不用重复月份。
  const showMonth = index === 0 || parseDisplayDate(row.date).getDate() === 1;
  return {
    row,
    weekday: weekday(row.date),
    date: showMonth ? monthDay(row.date) : dayOfMonth(row.date),
    current,
    previous,
    profile,
    mark,
    icon: current ? SPORT_ICON[current.sport] : null,
    duration: profile ? minutes(Math.round(profile.seconds / 60)) : '',
    approx: profile?.approx ?? false,
  };
}));
</script>

<template>
  <div class="strip" role="listbox" :aria-label="t.sectionTitle">
    <button v-for="cell in cells" :key="cell.row.date" type="button" role="option"
      :class="['cell', { sel: cell.row.date === selected, later: !cell.row.inWindow, rest: !cell.current, today: cell.row.isToday }]"
      :aria-selected="cell.row.date === selected" @click="emit('select', cell.row.date)">
      <span class="when">
        <b>{{ cell.weekday }}</b>
        <small>{{ cell.row.isToday ? t.today : cell.date }}</small>
      </span>
      <span v-if="cell.mark" :class="['mark', `m-${cell.mark.tone}`]" :title="cell.mark.text"><i aria-hidden="true"></i>{{ cell.mark.text }}</span>

      <template v-if="cell.current && cell.profile">
        <span class="glyph" aria-hidden="true"><Icon :name="cell.icon!" :size="16" /></span>
        <span class="name">{{ cell.current.name }}</span>
        <span class="dur">{{ cell.approx ? t.totalAbout(cell.duration) : cell.duration }}</span>
        <PlanShape class="shape" :profile="cell.profile" :scale-seconds="scale" :domain="domain" />
      </template>
      <template v-else>
        <span class="glyph rest-glyph" aria-hidden="true"><Icon name="moon" :size="15" /></span>
        <span class="name muted">{{ t.rest }}</span>
        <span v-if="cell.previous" class="dur was">{{ t.wasName(cell.previous.name) }}</span>
      </template>
    </button>
  </div>
</template>

<style scoped>
.strip {
  display: grid;
  grid-auto-columns: minmax(132px, 1fr);
  grid-auto-flow: column;
  gap: 8px;
  overflow-x: auto;
  padding: 2px 2px 6px;
  scrollbar-width: thin;
}
.cell {
  position: relative;
  display: grid;
  grid-template-rows: auto 30px auto auto 1fr;
  align-content: start;
  gap: 6px;
  min-width: 0;
  min-height: 184px;
  padding: 12px 12px 14px;
  border: 0;
  border-radius: 20px;
  background: color-mix(in srgb, var(--ink) 3.5%, transparent);
  color: var(--ink);
  text-align: left;
  cursor: pointer;
  transition: background var(--dur-fast) ease, box-shadow var(--dur-base) ease, translate var(--dur-base) var(--ease-out);
}
.cell:hover { background: color-mix(in srgb, var(--ink) 6.5%, transparent); }
.cell:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.cell.sel { background: var(--mat-raised); box-shadow: var(--mat-raised-rim), 0 0 0 1.5px color-mix(in srgb, var(--accent) 70%, transparent), 0 10px 24px -14px color-mix(in srgb, var(--accent) 70%, transparent); }
.cell.later { opacity: .55; }
.cell.rest { background: transparent; box-shadow: inset 0 0 0 1px var(--line); }
.cell.rest.sel { background: var(--mat-raised); }

.when { display: flex; align-items: baseline; gap: 6px; padding-right: 54px; line-height: 1.2; }
.when b { font-size: var(--fs-xs); font-weight: 700; }
.when small { color: var(--subtle); font-size: var(--fs-2xs); font-variant-numeric: tabular-nums; }
.cell.today .when small { color: var(--accent); font-weight: 700; }

.mark { position: absolute; top: 11px; right: 10px; display: inline-flex; align-items: center; gap: 5px; max-width: 72px; overflow: hidden;
  color: var(--subtle); font-size: 11.5px; font-weight: 650; white-space: nowrap; text-overflow: ellipsis; }
.mark i { width: 6px; height: 6px; flex: none; border-radius: 50%; background: currentColor; }
.m-new { color: var(--accent); }
.m-rep { color: var(--pace); }
.m-del { color: var(--heart); }

.glyph { display: grid; width: 30px; height: 30px; place-items: center; border-radius: 50%;
  background: var(--cap-thumb); box-shadow: var(--cap-thumb-rim); color: var(--activity); }
.rest-glyph { background: transparent; box-shadow: inset 0 0 0 1px var(--line); color: var(--subtle); }
.name { display: -webkit-box; overflow: hidden; font-size: var(--fs-sm); font-weight: 700; line-height: 1.3; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow-wrap: anywhere; }
.name.muted { color: var(--subtle); font-weight: 500; }
.dur { color: var(--muted); font-size: var(--fs-2xs); font-variant-numeric: tabular-nums; }
.dur.was { color: var(--subtle); text-decoration: line-through; text-decoration-color: color-mix(in srgb, var(--heart) 60%, transparent); }
.shape { align-self: end; margin-top: 4px; }
</style>
