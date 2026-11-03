<script setup lang="ts">
/* PB 墙：5K / 10K / 半马 / 全马各一格，每格是这个距离最快三次叠成的一叠牌（PbDeck.vue）：横着甩换牌，点顶牌去那次运动
   （形变从顶牌出发）。没有就写「还没有」，不编。
   四格同高：一排里按最高那格拉齐，每格都给牌边留同样的位置（没有后面的牌也留），虚线格和满格一样高。
   以前是 16px 高的「叠卡」按钮，点开往下展开二、三名；用户 2026-10-28：点开第二、三次以后点不回去，叠着的牌应该能甩。 */
import { computed } from 'vue';
import JournalCard from './JournalCard.vue';
import PbDeck from './PbDeck.vue';
import { useJournalText } from './journal.i18n';
import { useLogbook } from '../../composables/useLogbook';

const t = useJournalText();
const { records } = useLogbook();
const rows = computed(() => records.value?.records ?? []);
</script>

<template>
  <JournalCard :title="t.records" tone="record" class="record-wall">
    <ul class="pb-grid">
      <li v-for="row in rows" :key="row.key" class="pb-cell"><PbDeck :row="row" /></li>
    </ul>
  </JournalCard>
</template>

<style scoped>
/* 甩出去的牌会飞出这一格、越过卡边：卡本身不裁切；角落那团微光自己裁回卡里（它本来就靠卡的裁切藏住伸出去的部分）。 */
.journal-card.record-wall { overflow: visible; }
.journal-card.record-wall::before { clip-path: inset(50% 0 0 33.334% round var(--radius-lg) 0 0 0); }
.pb-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px 0; align-items: stretch; margin: 0 -6px; padding: 0; list-style: none; }
.pb-cell { display: grid; min-width: 0; }
@media (max-width: 1100px) { .pb-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 460px) { .pb-grid { grid-template-columns: minmax(0, 1fr); } }
</style>
