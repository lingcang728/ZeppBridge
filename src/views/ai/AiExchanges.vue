<script setup lang="ts">
/**
 * 往返记录（/ai/exchanges，2026-10-08 横向舞台起从任务头旁「往返 N 次」那枚胶囊长出来）：
 * 每份交给 AI 的数据、接回来的下一步。每一行点开是它自己的详情（/ai/exchanges/:id，从这一行长出来）。
 * 以前这张列表直接铺在总页最底下。
 */
import PageHeader from '../../components/PageHeader.vue';
import ExchangeList from '../../components/ai/ExchangeList.vue';
import { useAiHub } from '../../composables/ai/useAiHub';
import { useExchanges } from '../../composables/useExchanges';
import { useBridgeText } from '../../components/ai/bridge/bridge.i18n';
import '../../styles/ai-task.css';

defineOptions({ name: 'AiExchanges' });
useAiHub();
const history = useExchanges();
const t = useBridgeText();
</script>

<template>
  <section class="page ai-sub-page" aria-labelledby="ai-exchanges-title">
    <PageHeader title-id="ai-exchanges-title" :title="t.history" :intro="t.historyHint" />
    <div class="ai-panel"><ExchangeList :items="history.exchanges.value" /></div>
    <p v-if="history.error.value" class="ai-message" role="alert">{{ history.error.value }}<button class="pill-button quiet" @click="history.load()">{{ t.retry }}</button></p>
  </section>
</template>

<style scoped src="./aiPage.css"></style>
<style scoped>
/* 列表自己的标题在页头里说过了。 */
.ai-panel :deep(.exchange-list > header) { display: none; }
</style>
