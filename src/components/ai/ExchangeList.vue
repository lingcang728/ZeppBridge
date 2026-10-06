<script setup lang="ts">
import { computed } from 'vue';
import Icon from '../Icon.vue';
import type { AiExchange } from '../../types/timeBridge';
import { workoutProfile } from '../../lib/trainingPlan/profile';
import { sharedHrDomain } from '../../lib/trainingPlan/summary';
import { useBridgeText } from './bridge/bridge.i18n';
import { AI_PROVIDERS } from '../../lib/aiProviders';
import { displayDateTimeFormatter } from '../../lib/dateTime';
import { addDays } from '../../lib/aiTask/bridgeScale';
/* 每一条往返点开是它自己的二级页（/ai/exchanges/:id，从这一行长出来）；以前是整页切到「正在查看历史 · 只读」。 */
const props = defineProps<{ items: AiExchange[] }>();
const t = useBridgeText();
/* 右边那一小条：接回来的计划头 7 天，有训练的一格实心、休息的一格空心（以前是一串彩色的训练形状，
   一排看过去像条纹，看不出是什么）。 */
const weekOf = (item: AiExchange) => {
  const plan = item.plan;
  if (!plan?.workouts.length) return [];
  const start = plan.from ?? plan.workouts.map(w => w.date).sort()[0]!;
  const days = new Set(plan.workouts.map(w => w.date));
  return Array.from({ length: 7 }, (_, i) => days.has(addDays(start, i)));
};
const rows = computed(() => props.items.map(item => {
  const profiles = (item.plan?.workouts ?? []).slice(0,7).map(workoutProfile);
  const provider = AI_PROVIDERS.find(p => p.id === item.provider);
  const state = item.undone ? t.value.undone : item.publish_state === 'sent' ? t.value.delivered : item.publish_state === 'rejected' ? t.value.rejected : item.publish_state ? t.value.unknown : item.document ? t.value.planBack : t.value.noPlan;
  return { item, week: weekOf(item), profiles, domain: sharedHrDomain(profiles), scale: Math.max(3600,...profiles.map(p => p.seconds)), provider: provider?.label ?? item.provider,
    icon: provider?.localIcon, date: displayDateTimeFormatter({month:'numeric',day:'numeric'}).format(new Date(item.sent_at)), state };
}));
</script>
<template>
  <section class="exchange-list" aria-labelledby="bridge-exchanges-title"><header><h2 id="bridge-exchanges-title">{{ t.history }}</h2><p>{{ t.historyHint }}</p></header>
    <div v-if="!rows.length" class="history-empty"><Icon name="arrow-right" :size="14"/><span>{{ t.emptyHistory }}</span></div>
    <RouterLink v-for="row in rows" :key="row.item.id" :to="`/ai/exchanges/${encodeURIComponent(row.item.id)}`" class="exchange-row" data-morph-card><time>{{ row.date }}</time><span class="provider"><img v-if="row.icon" :src="row.icon" alt=""/>{{ row.item.provider === 'mcp' ? 'MCP' : row.provider }}</span><span class="question">{{ row.item.question || (row.item.provider === 'mcp' ? t.mcp : t.exported) }}</span><span v-if="row.week.length" class="mini-week" aria-hidden="true"><i v-for="(on,i) in row.week" :key="i" :class="{ on }"></i></span><span class="exchange-state">{{ row.state }}</span><Icon name="chevron-right" :size="14"/></RouterLink>
  </section>
</template>
<style scoped src="./ExchangeList.css"></style>
