<script setup lang="ts">
import { computed } from 'vue';
import Icon from '../Icon.vue';
import PlanShape from '../plan/PlanShape.vue';
import type { AiExchange } from '../../types/timeBridge';
import { workoutProfile } from '../../lib/trainingPlan/profile';
import { sharedHrDomain } from '../../lib/trainingPlan/summary';
import { useBridgeText } from './bridge/bridge.i18n';
import { AI_PROVIDERS } from '../../lib/aiProviders';
import { displayDateTimeFormatter } from '../../lib/dateTime';
/* 每一条往返点开是它自己的二级页（/ai/exchanges/:id，从这一行长出来）；以前是整页切到「正在查看历史 · 只读」。 */
const props = defineProps<{ items: AiExchange[] }>();
const t = useBridgeText();
const rows = computed(() => props.items.map(item => {
  const profiles = (item.plan?.workouts ?? []).slice(0,7).map(workoutProfile);
  const provider = AI_PROVIDERS.find(p => p.id === item.provider);
  const state = item.undone ? t.value.undone : item.publish_state === 'sent' ? t.value.delivered : item.publish_state === 'rejected' ? t.value.rejected : item.publish_state ? t.value.unknown : item.document ? t.value.planBack : t.value.noPlan;
  return { item, profiles, domain: sharedHrDomain(profiles), scale: Math.max(3600,...profiles.map(p => p.seconds)), provider: provider?.label ?? item.provider,
    icon: provider?.localIcon, date: displayDateTimeFormatter({month:'numeric',day:'numeric'}).format(new Date(item.sent_at)), state };
}));
</script>
<template>
  <section class="exchange-list" aria-labelledby="bridge-exchanges-title"><header><h2 id="bridge-exchanges-title">{{ t.history }}</h2><p>{{ t.historyHint }}</p></header>
    <div v-if="!rows.length" class="history-empty"><Icon name="arrow-right" :size="14"/><span>{{ t.emptyHistory }}</span></div>
    <RouterLink v-for="row in rows" :key="row.item.id" :to="`/ai/exchanges/${encodeURIComponent(row.item.id)}`" class="exchange-row" data-morph-card><time>{{ row.date }}</time><span class="provider"><img v-if="row.icon" :src="row.icon" alt=""/>{{ row.item.provider === 'mcp' ? 'MCP' : row.provider }}</span><span class="question">{{ row.item.question || (row.item.provider === 'mcp' ? t.mcp : t.exported) }}</span><span v-if="row.profiles.length" class="mini-plan"><PlanShape v-for="(profile,i) in row.profiles" :key="i" :profile="profile" :scale-seconds="row.scale" :domain="row.domain"/></span><span class="exchange-state">{{ row.state }}</span><Icon name="chevron-right" :size="14"/></RouterLink>
  </section>
</template>
<style scoped src="./ExchangeList.css"></style>
