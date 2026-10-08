<script setup lang="ts">
/**
 * 右牌的计划那一面（2026-10-08，内容搬自总页的「你的下一步」缩略卡）：接下来 7 天几天练、几天休，
 * 发没发到手表，一排七个训练形状。整张是去 /ai/plan 的入口（从这张牌长出来）。
 * 还没有计划时写一句「还没有接回计划」，下面是接回定稿那枚胶囊；MCP 送来的计划在这里接受 / 放弃。
 */
import { computed } from 'vue';
import Icon from '../../Icon.vue';
import TintIcon from '../TintIcon.vue';
import PlanShape from '../../plan/PlanShape.vue';
import ReceiveCapsule from '../bridge/ReceiveCapsule.vue';
import { workoutProfile } from '../../../lib/trainingPlan/profile';
import { sharedHrDomain } from '../../../lib/trainingPlan/summary';
import type { DayRow } from '../../../lib/trainingPlan/week';
import type { TrainingPlanState } from '../../../types/trainingPlan';
import { displayDateTimeFormatter, parseDisplayDate } from '../../../lib/dateTime';
import { useBridgeText } from '../bridge/bridge.i18n';
import { useHubText } from '../hub/hub.i18n';

const props = defineProps<{ rows: DayRow[]; drafting: boolean; state: TrainingPlanState | null; mcp: boolean }>();
const emit = defineEmits<{ received: []; accept: []; discard: [] }>();
const t = useBridgeText();
const h = useHubText();
const week = computed(() => props.rows.slice(0, 7));
const profiles = computed(() => week.value.map((row) => (row.after[0] ? workoutProfile(row.after[0]) : null)));
const domain = computed(() => sharedHrDomain(profiles.value.filter((p) => p !== null)));
const scale = computed(() => Math.max(3600, ...profiles.value.map((p) => p?.seconds ?? 0)));
const training = computed(() => week.value.filter((row) => row.after.length || row.held.length).length);
const status = computed(() => {
  if (props.drafting) return { text: h.value.draftPending, tone: 'draft' };
  const last = props.state?.last_publish?.state;
  if (last === 'sent') return { text: h.value.delivered, tone: 'ok' };
  if (last === 'partial') return { text: h.value.partial, tone: 'warn' };
  if (last === 'unknown' || last === 'pending') return { text: h.value.unconfirmed, tone: 'warn' };
  return null;
});
const weekday = (date: string) => displayDateTimeFormatter({ weekday: 'narrow' }).format(parseDisplayDate(date));
</script>

<template>
  <div class="plan-face">
    <header>
      <TintIcon name="compass" tint="var(--accent)" :size="30" />
      <div><h3>{{ t.future }}</h3><p>{{ rows.length ? h.weekLine(training, 7 - training) : h.noPlan }}</p></div>
    </header>
    <template v-if="rows.length">
      <span v-if="status" :class="['status', status.tone]"><i aria-hidden="true"></i>{{ status.text }}</span>
      <RouterLink to="/ai/plan" class="week" data-morph-card :aria-label="h.planOpen">
        <ol>
          <li v-for="(row, i) in week" :key="row.date" :class="{ rest: !row.after.length && !row.held.length, today: row.isToday }">
            <span class="shape"><PlanShape v-if="profiles[i]" :profile="profiles[i]!" :scale-seconds="scale" :domain="domain" /><i v-else-if="row.held.length" class="held"></i></span>
            <small>{{ weekday(row.date) }}</small>
          </li>
        </ol>
        <span class="open">{{ h.planOpen }}<Icon name="chevron-right" :size="13" /></span>
      </RouterLink>
    </template>
    <div v-if="mcp" class="mcp"><Icon name="spark" :size="14" /><span>{{ t.mcp }}</span>
      <button type="button" class="pill-button" @click="emit('accept')">{{ t.accept }}</button>
      <button type="button" class="pill-button quiet" @click="emit('discard')">{{ t.discard }}</button>
    </div>
    <footer><ReceiveCapsule :compact="rows.length > 0" @received="emit('received')" /></footer>
  </div>
</template>

<style scoped>
.plan-face { display: grid; grid-template-rows: auto auto 1fr auto auto; gap: 12px; height: 100%; min-height: 0; }
header { display: flex; gap: 10px; align-items: center; }
h3 { margin: 0; font-size: var(--fs-md); font-weight: 700; }
header p { margin: 2px 0 0; color: var(--muted); font-size: var(--fs-xs); }
.status { display: inline-flex; justify-self: start; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 999px; background: var(--mat-inset); color: var(--muted); font-size: var(--fs-2xs); }
.status i { width: 6px; height: 6px; border-radius: 50%; background: var(--subtle); }
.status.ok i { background: var(--accent); }
.status.warn i { background: var(--warning); }
.status.draft i { background: var(--pace); }
.week { display: grid; align-content: center; gap: 10px; margin: 0 -8px; padding: 10px 8px; border-radius: 14px; color: inherit; text-decoration: none; transition: background var(--dur-base) ease; }
.week:hover { background: color-mix(in srgb, var(--ink) 4%, transparent); }
.week:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.week ol { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; margin: 0; padding: 0; list-style: none; }
.week li { display: grid; justify-items: center; gap: 6px; }
.week small { color: var(--subtle); font-size: 10px; }
.week li.today small { color: var(--accent); font-weight: 700; }
.shape { display: grid; align-items: end; justify-items: center; width: 100%; height: 46px; }
.shape :deep(.shape) { width: 100%; }
.week li.rest .shape::after { content: ''; width: 10px; height: 10px; border-radius: 50%; box-shadow: inset 0 0 0 1.5px var(--line-strong); }
.held { width: 10px; height: 10px; border-radius: 50%; background: var(--warning); }
.open { display: inline-flex; justify-self: end; align-items: center; gap: 2px; color: var(--subtle); font-size: var(--fs-2xs); }
.mcp { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; color: var(--muted); font-size: var(--fs-2xs); }
.mcp span { flex: 1 1 100%; }
footer { padding-top: 8px; border-top: 1px solid var(--mat-line); }
</style>
