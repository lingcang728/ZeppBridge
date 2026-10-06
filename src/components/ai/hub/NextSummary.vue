<script setup lang="ts">
/**
 * 总页上「你的下一步」的缩略卡：接下来 7 天几天练、几天休，发没发到手表，再画一排七个训练形状。
 * 点开是周视图（/ai/plan，从这张卡长出来）。还没有计划时卡里放「接回定稿」那枚胶囊。
 */
import { computed } from 'vue';
import Icon from '../../Icon.vue';
import PlanShape from '../../plan/PlanShape.vue';
import ReceiveCapsule from '../bridge/ReceiveCapsule.vue';
import { workoutProfile } from '../../../lib/trainingPlan/profile';
import { sharedHrDomain } from '../../../lib/trainingPlan/summary';
import type { DayRow } from '../../../lib/trainingPlan/week';
import type { TrainingPlanState } from '../../../types/trainingPlan';
import { displayDateTimeFormatter, parseDisplayDate } from '../../../lib/dateTime';
import { useBridgeText } from '../bridge/bridge.i18n';
import { useHubText } from './hub.i18n';

const props = defineProps<{ rows: DayRow[]; drafting: boolean; state: TrainingPlanState | null }>();
const emit = defineEmits<{ received: [] }>();
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
  <section class="hub-card next-card" data-morph-card>
    <RouterLink v-if="rows.length" to="/ai/plan" class="next-link">
      <header class="hub-card-head">
        <span class="hub-number">02</span>
        <div>
          <h2>{{ t.future }}</h2>
          <p>{{ h.weekLine(training, 7 - training) }}</p>
        </div>
        <span v-if="status" :class="['hub-status', status.tone]"><i aria-hidden="true"></i>{{ status.text }}</span>
        <span class="hub-open">{{ h.planOpen }}<Icon name="chevron-right" :size="14" /></span>
      </header>
      <ol class="next-week">
        <li v-for="(row, i) in week" :key="row.date" :class="{ rest: !row.after.length && !row.held.length, today: row.isToday }">
          <small>{{ weekday(row.date) }}</small>
          <span class="shape"><PlanShape v-if="profiles[i]" :profile="profiles[i]!" :scale-seconds="scale" :domain="domain" /><i v-else-if="row.held.length" class="held-dot"></i></span>
        </li>
      </ol>
    </RouterLink>
    <template v-else>
      <header class="hub-card-head">
        <span class="hub-number">02</span>
        <div>
          <h2>{{ t.future }}</h2>
          <p>{{ h.noPlan }}</p>
        </div>
      </header>
      <ReceiveCapsule class="next-receive" @received="emit('received')" />
    </template>
  </section>
</template>

<style scoped src="./hub.css"></style>
