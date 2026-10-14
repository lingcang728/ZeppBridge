<script setup lang="ts">
/**
 * 右牌的计划那一面（2026-10-12 第 3 批重做）：
 *
 *   你的下一步                                  [接回]
 *   2 练 5 休   (● 已送达)
 *   12 今天   轻松跑 · 45 分钟        ▁▃▃▁
 *   13 周二   休息                    (躺着的小人)
 *   14 周三   节奏跑 · 45 分钟        ▁▅▅▁
 *                                   查看整周 ›
 *
 * 固定显示接下来 3 天（今天算一天）；整块日程是去 /ai/plan 的入口（从这块长出来）。
 * 状态胶囊点开是「上次发到手表」的玻璃弹层；接回定稿只是标题右边一枚图标按钮。
 * 还没有计划时：一句话 + 一枚大的接回按钮。MCP 送来的计划在这里接受 / 放弃。
 */
import { computed, nextTick, ref } from 'vue';
import Icon from '../../Icon.vue';
import PlanShape from '../../plan/PlanShape.vue';
import RestFigure from '../../plan/RestFigure.vue';
import PlanStatusChip from '../../plan/PlanStatusChip.vue';
import ReceiveCapsule from '../bridge/ReceiveCapsule.vue';
import { workoutProfile } from '../../../lib/trainingPlan/profile';
import { sharedHrDomain } from '../../../lib/trainingPlan/summary';
import type { DayRow } from '../../../lib/trainingPlan/week';
import type { TrainingPlanState } from '../../../types/trainingPlan';
import { displayDateTimeFormatter, parseDisplayDate } from '../../../lib/dateTime';
import { useBridgeText } from '../bridge/bridge.i18n';
import { useHubText } from '../hub/hub.i18n';
import { useStageText } from './stage.i18n';

const props = defineProps<{ rows: DayRow[]; drafting: boolean; state: TrainingPlanState | null; mcp: boolean; busy: boolean; simulated: boolean }>();
const emit = defineEmits<{ received: []; accept: []; discard: []; undo: []; clear: [] }>();
const t = useBridgeText();
const h = useHubText();
const s = useStageText();
const root = ref<HTMLElement | null>(null);
const days = ref<HTMLElement | null>(null);
const chip = ref<InstanceType<typeof PlanStatusChip> | null>(null);

const busyDay = (row: DayRow) => row.after.length > 0 || row.held.length > 0;
const week = computed(() => props.rows.slice(0, 7));
const training = computed(() => week.value.filter(busyDay).length);
const lines = computed(() => props.rows.slice(0, 3).map((row) => {
  const workout = row.after[0];
  const profile = workout ? workoutProfile(workout) : null;
  const date = parseDisplayDate(row.date);
  return {
    row,
    profile,
    day: date.getDate(),
    weekday: row.isToday ? t.value.today : displayDateTimeFormatter({ weekday: 'short' }).format(date),
    name: workout?.name ?? row.held[0]?.name ?? t.value.rest,
    minutes: profile ? Math.round(profile.seconds / 60) : null,
    rest: !busyDay(row),
  };
}));
const profiles = computed(() => lines.value.flatMap((line) => (line.profile ? [line.profile] : [])));
const domain = computed(() => sharedHrDomain(profiles.value));
const scale = computed(() => Math.max(3600, ...profiles.value.map((p) => p.seconds)));
/** 纸片落在哪：有计划落在日程上，空态落在整面上（落定后它就变成日程）。 */
const landing = () => days.value ?? root.value;
const received = async () => {
  emit('received');
  await nextTick();
  chip.value?.flash();
};
</script>

<template>
  <div ref="root" class="plan-face">
    <header>
      <h3>{{ t.future }}</h3>
      <ReceiveCapsule v-if="rows.length" variant="icon" :target="landing" @received="received" />
      <p v-if="rows.length || state?.last_publish" class="meta">
        <span v-if="rows.length" class="tally">{{ s.tally(training, week.length - training) }}</span>
        <PlanStatusChip ref="chip" :state="state" :drafting="drafting" :busy="busy" :simulated="simulated" @undo="emit('undo')" @clear="emit('clear')" />
      </p>
    </header>
    <RouterLink v-if="rows.length" to="/ai/plan" class="days" data-morph-card :aria-label="s.viewWeek">
      <ol ref="days">
        <li v-for="line in lines" :key="line.row.date" :class="{ rest: line.rest, today: line.row.isToday }" data-paper-row>
          <span class="date"><b>{{ line.day }}</b><small>{{ line.weekday }}</small></span>
          <span class="what"><strong>{{ line.name }}</strong><small v-if="line.minutes !== null">{{ line.minutes }} {{ t.unitMin }}</small></span>
          <span class="shape">
            <PlanShape v-if="line.profile" :profile="line.profile" :scale-seconds="scale" :domain="domain" />
            <RestFigure v-else-if="line.rest" :size="74" />
            <Icon v-else name="steps" :size="18" />
          </span>
        </li>
      </ol>
      <span class="open">{{ s.viewWeek }}<Icon name="chevron-right" :size="13" /></span>
    </RouterLink>
    <div v-else class="empty">
      <p>{{ h.planEmpty }}</p>
      <ReceiveCapsule variant="primary" :target="landing" @received="received" />
    </div>
    <div v-if="mcp" class="mcp"><Icon name="spark" :size="14" /><span>{{ t.mcp }}</span>
      <button type="button" class="pill-button" @click="emit('accept')">{{ t.accept }}</button>
      <button type="button" class="pill-button quiet" @click="emit('discard')">{{ t.discard }}</button>
    </div>
  </div>
</template>

<style scoped>
.plan-face { display: grid; gap: 14px; min-width: 0; }
header { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 6px 10px; }
h3 { margin: 0; font-size: var(--fs-lg); font-weight: 750; letter-spacing: -.01em; }
.meta { display: flex; flex-wrap: wrap; grid-column: 1 / -1; align-items: center; gap: 8px; margin: 0; }
.tally { color: var(--ink); font-size: var(--fs-sm); font-weight: 650; font-variant-numeric: tabular-nums; }
.days { display: grid; gap: 4px; margin: 0 -8px; padding: 4px 8px 6px; border-radius: 16px; color: inherit; text-decoration: none; transition: background var(--dur-base) ease; }
.days:hover { background: color-mix(in srgb, var(--ink) 4%, transparent); }
.days:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.days ol { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; }
.days li { display: grid; grid-template-columns: 40px minmax(0, 1fr) 76px; align-items: center; gap: 10px; min-height: 52px; }
.days li + li { border-top: 1px solid color-mix(in srgb, var(--mat-line) 70%, transparent); }
.date { display: grid; justify-items: start; line-height: 1.1; }
.date b { font-size: 19px; font-weight: 750; font-variant-numeric: tabular-nums; }
.date small { color: var(--subtle); font-size: var(--fs-2xs); }
.today .date b, .today .date small { color: var(--accent); }
.what { display: grid; gap: 2px; min-width: 0; }
.what strong { overflow: hidden; font-size: var(--fs-sm); font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.what small { color: var(--muted); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
.rest .what strong { color: var(--muted); font-weight: 550; }
.shape { display: grid; align-items: center; justify-items: end; height: 42px; color: var(--warning); }
.shape :deep(.shape) { width: 100%; }
.open { display: inline-flex; justify-self: end; align-items: center; gap: 2px; margin-top: 2px; color: var(--muted); font-size: var(--fs-xs); font-weight: 600; }
.days:hover .open { color: var(--accent); }
.empty { display: grid; justify-items: center; gap: 16px; padding: 18px 4px 10px; text-align: center; }
.empty p { margin: 0; color: var(--muted); font-size: var(--fs-sm); line-height: 1.6; }
.mcp { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; color: var(--muted); font-size: var(--fs-2xs); }
.mcp span { flex: 1 1 100%; }
</style>
