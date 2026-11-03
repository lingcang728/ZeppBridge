<script setup lang="ts">
/**
 * 一行就地补拉（3.0.4）：本机最早只到某天，要不要从云端补拉更早的 1 / 2 / 3 / 10 年。
 * 只在真的缺的时候出现；补拉在后台跑，离开这页也会继续，进度和设置页是同一份。
 */
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import Icon from './Icon.vue';
import { useBackfillOffer, type OfferYears } from '../composables/useBackfillOffer';
import { displayDateTimeFormatter, parseDisplayDate } from '../lib/dateTime';
import { useBackfillOfferText } from './BackfillOffer.i18n';

const props = withDefaults(defineProps<{
  /** 想看的范围从哪天开始（YYYY-MM-DD）。本机比它晚才出声。 */
  start: string;
  /** 默认亮哪一档。 */
  preset?: OfferYears;
  /** 「先不用」记在哪一处（各处分开记）。 */
  place: string;
}>(), { preset: 1 });

const t = useBackfillOfferText();
const offer = useBackfillOffer(props.place);
const YEARS: OfferYears[] = [1, 2, 3, 10];
const visible = computed(() => offer.busy.value || !!offer.message.value || !!offer.error.value || (!offer.dismissed.value && offer.shortOf(props.start)));
const earliestText = computed(() => (offer.earliest.value ? displayDateTimeFormatter({ dateStyle: 'medium' }).format(parseDisplayDate(offer.earliest.value)) : ''));
</script>

<template>
  <div v-if="visible" class="backfill-offer" role="status">
    <Icon :name="offer.busy.value ? 'sync' : 'clock'" :size="14" :class="{ spin: offer.busy.value }" />
    <span class="line">{{ offer.busy.value ? (offer.message.value ?? t.running) : offer.error.value ?? offer.message.value ?? t.offer(earliestText) }}</span>
    <template v-if="offer.busy.value">
      <button type="button" class="pill-button quiet" @click="offer.stop()">{{ t.stop }}</button>
    </template>
    <template v-else-if="offer.error.value">
      <RouterLink class="pill-button quiet" to="/settings/archive">{{ t.settings }}</RouterLink>
    </template>
    <template v-else-if="!offer.message.value">
      <span class="years">
        <button v-for="n in YEARS" :key="n" type="button" :class="['pill-button', { quiet: n !== preset }]" @click="offer.start(n)">{{ t.years(n) }}</button>
      </span>
      <button type="button" class="pill-button quiet" @click="offer.dismiss()">{{ t.later }}</button>
    </template>
  </div>
</template>

<style scoped>
.backfill-offer { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; padding: 10px 12px; border: 1px dashed var(--mat-line); border-radius: var(--radius-sm);
  background: var(--mat-inset); box-shadow: var(--mat-inset-shadow); color: var(--muted); font-size: var(--fs-sm); line-height: 1.5; }
.line { flex: 1 1 220px; min-width: 0; }
.years { display: inline-flex; flex-wrap: wrap; gap: 6px; }
.spin { animation: offer-spin 1.2s linear infinite; }
@keyframes offer-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
</style>
