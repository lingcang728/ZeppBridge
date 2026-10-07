<script setup lang="ts">
/**
 * 一次往返的详情（/ai/exchanges/:id，从往返记录里那一行长出来）：什么时候交给了哪个 AI、问了什么、
 * 交出去了哪些数据，以及接回来的那份计划（只读的一周视图，格子不是链接）。
 * 以前点一行是整页切到「正在查看历史 · 只读」，现在它是单独的一页，返回就缩回那一行。
 */
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import PageHeader from '../../components/PageHeader.vue';
import Icon from '../../components/Icon.vue';
import BridgeFuture from '../../components/ai/bridge/BridgeFuture.vue';
import { planViewOf, useAiHub } from '../../composables/ai/useAiHub';
import { useExchanges } from '../../composables/useExchanges';
import { useBridgeText } from '../../components/ai/bridge/bridge.i18n';
import { useHubText } from '../../components/ai/hub/hub.i18n';
import { AI_PROVIDERS } from '../../lib/aiProviders';
import { categoryLabel } from '../../lib/aiTask/categories';
import { dayKey } from '../../lib/aiTask/bridgeScale';
import { displayDateTimeFormatter } from '../../lib/dateTime';
import { isDesktop } from '../../lib/bridge';
import { revealInFolder } from '../../composables/useAiHandoff';
import '../../styles/ai-task.css';

defineOptions({ name: 'AiExchange' });
useAiHub();
const route = useRoute();
const history = useExchanges();
const t = useBridgeText();
const h = useHubText();
const item = computed(() => history.exchanges.value.find((e) => e.id === String(route.params.id ?? '')) ?? null);
const provider = computed(() => (item.value?.provider === 'mcp' ? 'MCP' : AI_PROVIDERS.find((p) => p.id === item.value?.provider)?.label ?? item.value?.provider ?? ''));
const when = computed(() => (item.value
  ? displayDateTimeFormatter({ month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(item.value.sent_at))
  : ''));
const categories = computed(() => item.value?.categories.filter((c) => c.enabled).map((c) => categoryLabel(c.category)) ?? []);
const planView = computed(() => (item.value?.plan ? planViewOf(item.value.plan, item.value.plan.from ?? dayKey(new Date(item.value.sent_at))) : null));
const state = computed(() => {
  const e = item.value;
  if (!e) return '';
  return e.undone ? t.value.undone : e.publish_state === 'sent' ? t.value.delivered : e.publish_state === 'rejected' ? t.value.rejected
    : e.publish_state ? t.value.unknown : e.document ? t.value.planBack : t.value.noPlan;
});
const reveal = () => { if (item.value?.md_path && isDesktop()) void revealInFolder(item.value.md_path).catch(() => undefined); };
</script>

<template>
  <section class="page ai-sub-page story" aria-labelledby="ai-exchange-title">
    <PageHeader title-id="ai-exchange-title" :title="h.exchangeTitle" :intro="item ? h.sentTo(provider, when) : ''" />
    <div v-if="!item" class="ai-panel ai-empty">{{ history.loaded.value ? h.exchangeMissing : '…' }}</div>
    <template v-else>
      <div class="ai-panel">
        <h2>{{ h.question }}</h2>
        <p class="question">{{ item.question || (item.provider === 'mcp' ? t.mcp : h.noQuestion) }}</p>
        <h2>{{ h.dataSent }}</h2>
        <p class="facts">
          <span>{{ h.daysBefore(item.days_before + 1) }}</span>
          <span v-for="name in categories" :key="name">{{ name }}</span>
          <span v-if="item.workout_ids.length">{{ h.workoutsSent(item.workout_ids.length) }}</span>
        </p>
        <button v-if="item.md_path && isDesktop()" type="button" class="pill-button quiet reveal" @click="reveal"><Icon name="folder" :size="13" />{{ h.revealFile }}</button>
      </div>
      <div class="ai-panel">
        <h2>{{ h.planBack }} · <span class="state">{{ state }}</span></h2>
        <p v-if="item.plan?.summary" class="ai-panel-note">{{ item.plan.summary }}</p>
        <BridgeFuture v-if="planView" :preview="planView" readonly :link-days="false" :show-summary="false" :stamped="item.publish_state === 'sent' && !item.undone" />
        <p v-else class="ai-panel-note">{{ t.noPlan }}</p>
      </div>
    </template>
  </section>
</template>

<style scoped src="./aiPage.css"></style>
<style scoped>
.question { margin: 0; color: var(--ink); font-size: var(--fs-md); line-height: 1.6; white-space: pre-wrap; }
.facts { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; }
.facts span { padding: 3px 10px; border-radius: 999px; background: var(--mat-inset); color: var(--muted); font-size: var(--fs-2xs); }
.reveal { justify-self: start; }
.state { color: var(--ink); font-weight: 600; }
</style>
