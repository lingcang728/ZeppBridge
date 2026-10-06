<script setup lang="ts">
/**
 * 每个 AI 各自记住「免费版 / 已订阅」（批次 5.2）：寄出前检查里一行一个，玻璃两档。底栏的发送胶囊上只显示
 * 当前那家的一枚小角标，改在这里改。订阅了能读更长的文件（导出时的预算放宽），免费版会控制在读得完的量以内。
 */
import { computed } from 'vue';
import SegmentTrack from '../SegmentTrack.vue';
import { AI_PROVIDERS, type AiProviderId } from '../../lib/aiProviders';
import { isSubscribed, setSubscribed } from '../../lib/aiTask/budget';
import { useHandoffText } from './HandoffDock.i18n';

const t = useHandoffText();
const items = computed(() => [{ value: 'free', label: t.value.planFree }, { value: 'paid', label: t.value.planPaid }]);
const set = (id: AiProviderId, value: string) => setSubscribed(id, value === 'paid');
</script>

<template>
  <div class="subs">
    <p class="hint">{{ t.subscribedHint }}</p>
    <ul>
      <li v-for="provider in AI_PROVIDERS" :key="provider.id">
        <span class="who"><img v-if="provider.localIcon" :src="provider.localIcon" alt="" />{{ provider.label }}</span>
        <SegmentTrack compact :items="items" :model-value="isSubscribed(provider.id) ? 'paid' : 'free'" :aria-label="t.planTitle(provider.label)"
          @update:model-value="set(provider.id, $event)" />
      </li>
    </ul>
  </div>
</template>

<style scoped>
.subs { display: grid; gap: 10px; }
.hint { margin: 0; color: var(--subtle); font-size: var(--fs-2xs); line-height: 1.6; }
ul { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 8px 18px; margin: 0; padding: 0; list-style: none; }
li { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-width: 0; }
.who { display: inline-flex; align-items: center; gap: 8px; color: var(--ink); font-size: var(--fs-sm); }
.who img { width: 18px; height: 18px; object-fit: contain; }
</style>
