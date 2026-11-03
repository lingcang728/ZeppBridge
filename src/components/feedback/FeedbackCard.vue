<script setup lang="ts">
/**
 * 跑后打分的轻卡（批次 7）：「昨天的「间歇跑」感觉怎么样？」
 *
 * 左边计划、右边实际，中间一条达成率；下面五档胶囊（可以拖），拨到哪档就记哪档。打完分换成一行：
 * 疲劳 / 伤痛 / 天气标签、改计划、太难时「下次同类减 10%」、好。
 *
 * 不纠缠：同时最多一张、48 小时后后端不再给、「这周别问」到下周一、关掉的那条不再问；不记连续
 * 打卡、不显示漏了几次。没有就整张不画。
 */
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import Icon from '../Icon.vue';
import SegmentTrack, { type SegmentItem } from '../SegmentTrack.vue';
import { useWorkoutFeedback } from '../../composables/useWorkoutFeedback';
import { useRevisionReload } from '../../composables/useRevisionReload';
import { formatDistance, formatDuration } from '../../lib/format';
import { metricColor } from '../../lib/metricTone';
import type { FeedbackRating, FeedbackTag } from '../../types/feedback';
import { useFeedbackText } from './feedback.i18n';
import { feedbackAsk } from './feedbackAsk';

const t = useFeedbackText();
const router = useRouter();
const feedback = useWorkoutFeedback();
const { prompt, rating, tags, adjusted, busy } = feedback;
const notice = ref<string | null>(null);

onMounted(() => { void feedback.load(); });
useRevisionReload(() => { void feedback.load(); });

const ask = computed(() => (prompt.value ? feedbackAsk(prompt.value, t.value) : ''));

const amount = (seconds: number | null, meters: number | null, basis: 'duration' | 'distance' | null): string => {
  if (basis === 'distance' && meters !== null) return formatDistance(meters);
  if (seconds !== null) return formatDuration(seconds / 60);
  return meters !== null ? formatDistance(meters) : '—';
};

const sides = computed(() => {
  const p = prompt.value;
  if (!p) return null;
  const basis = p.completion_basis;
  return {
    planned: {
      amount: amount(p.planned.seconds, p.planned.meters, basis),
      hr: p.planned.hr_low !== null && p.planned.hr_high !== null ? t.value.hrRange(p.planned.hr_low, p.planned.hr_high) : null,
    },
    actual: {
      amount: amount(p.actual.seconds, p.actual.meters, basis),
      hr: p.actual.avg_hr !== null ? t.value.avgHr(p.actual.avg_hr) : null,
    },
    percent: p.completion === null ? null : Math.round(p.completion * 100),
  };
});

const levels = computed<SegmentItem<number>[]>(() => [
  { value: 1, label: t.value.level1 },
  { value: 2, label: t.value.level2 },
  { value: 3, label: t.value.level3 },
  { value: 4, label: t.value.level4 },
  { value: 5, label: t.value.level5 },
]);
const tagItems = computed<{ value: FeedbackTag; label: string }[]>(() => [
  { value: 'fatigue', label: t.value.tagFatigue },
  { value: 'pain', label: t.value.tagPain },
  { value: 'weather', label: t.value.tagWeather },
]);

const rate = (value: number) => { notice.value = null; void feedback.rate(value as FeedbackRating); };

const lighten = async () => {
  const result = await feedback.lighten(t.value.lighterNote);
  if (result === 'drafted') { void router.push('/ai/plan'); return; }
  notice.value = result === 'busy' ? null : t.value.noNext;
};
</script>

<template>
  <section v-if="prompt && sides" class="feedback-card" role="group" :aria-label="t.aria" :style="{ '--fb-tone': metricColor('training_load') }">
    <header class="fb-head">
      <strong class="fb-ask">{{ ask }}</strong>
      <span v-if="rating === null" class="fb-tools">
        <button type="button" class="pill-button quiet" @click="feedback.snooze()">{{ t.snooze }}</button>
        <button type="button" class="fb-close" :aria-label="t.dismiss" :title="t.dismiss" @click="feedback.dismiss()"><Icon name="x" :size="15" /></button>
      </span>
    </header>

    <div class="fb-compare">
      <div class="fb-side">
        <small>{{ t.planned }}</small>
        <b>{{ sides.planned.amount }}</b>
        <span v-if="sides.planned.hr">{{ sides.planned.hr }}</span>
      </div>
      <div v-if="sides.percent !== null" class="fb-meter" :aria-label="t.completion(sides.percent)">
        <span class="fb-track"><i :style="{ width: `${Math.min(100, sides.percent)}%` }"></i></span>
        <em>{{ t.completion(sides.percent) }}</em>
      </div>
      <div v-else class="fb-meter is-empty" aria-hidden="true"></div>
      <div class="fb-side is-actual">
        <small>{{ t.actual }}</small>
        <b>{{ sides.actual.amount }}</b>
        <span v-if="sides.actual.hr">{{ sides.actual.hr }}</span>
      </div>
    </div>

    <SegmentTrack :items="levels" :model-value="rating ?? 0" :aria-label="ask" :disabled="busy" fill compact @update:model-value="rate" />

    <div v-if="rating !== null" class="fb-after">
      <span class="fb-saved"><Icon name="check" :size="14" />{{ t.saved }}</span>
      <button
        v-for="tag in tagItems" :key="tag.value" type="button"
        :class="['fb-tag', { 'is-on': tags.includes(tag.value) }]" :aria-pressed="tags.includes(tag.value)"
        @click="feedback.toggleTag(tag.value)"
      >{{ tag.label }}</button>
      <span class="fb-spacer"></span>
      <span v-if="notice" class="fb-notice">{{ notice }}</span>
      <button v-if="rating === 5 && !adjusted" type="button" class="pill-button" @click="lighten">{{ t.lighter }}</button>
      <RouterLink v-else class="pill-button quiet" to="/ai/plan">{{ t.editPlan }}</RouterLink>
      <button type="button" class="pill-button quiet" @click="feedback.close()">{{ t.done }}</button>
    </div>
  </section>
</template>

<style scoped>
/* 一块中性的小板（和「换成轻松跑」那一行同一种）：不铺底色、不抬卡板，概览的主角仍是下面的卡。 */
.feedback-card { display: grid; gap: 12px; padding: 14px 16px; border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--ink) 4%, transparent); box-shadow: inset 0 0 0 1px var(--mat-line); }
.fb-head { display: flex; align-items: center; gap: 10px; min-width: 0; }
.fb-ask { flex: 1; min-width: 0; color: var(--ink); font-size: var(--fs-md); font-weight: 600; overflow-wrap: anywhere; }
.fb-tools { display: inline-flex; align-items: center; gap: 4px; flex: none; }
.fb-close { display: grid; place-items: center; width: 28px; height: 28px; border: 0; border-radius: 50%; background: transparent; color: var(--subtle); cursor: pointer; }
.fb-close:hover { background: var(--glass-press); color: var(--ink); }

.fb-compare { display: grid; grid-template-columns: minmax(0, 1fr) minmax(90px, 1.2fr) minmax(0, 1fr); align-items: center; gap: 12px; }
.fb-side { display: grid; gap: 2px; min-width: 0; }
.fb-side.is-actual { text-align: right; }
.fb-side small { color: var(--subtle); font-size: var(--fs-xs); }
.fb-side b { color: var(--ink); font-size: var(--fs-lg); font-weight: 600; font-variant-numeric: tabular-nums; }
.fb-side span { color: var(--muted); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
.fb-meter { display: grid; justify-items: center; gap: 5px; }
.fb-track { position: relative; overflow: hidden; width: 100%; height: 6px; border-radius: 999px; background: color-mix(in srgb, var(--ink) 9%, transparent); }
.fb-track i { position: absolute; inset: 0 auto 0 0; border-radius: inherit; background: var(--fb-tone); }
.fb-meter em { color: var(--muted); font-size: var(--fs-xs); font-style: normal; font-variant-numeric: tabular-nums; }

.fb-after { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.fb-saved { display: inline-flex; align-items: center; gap: 4px; color: var(--muted); font-size: var(--fs-sm); }
.fb-saved :deep(svg) { color: var(--fb-tone); }
.fb-tag { padding: 4px 11px; border: 0; border-radius: 999px; background: transparent; box-shadow: inset 0 0 0 1px var(--mat-line); color: var(--muted); font: inherit; font-size: var(--fs-sm); cursor: pointer; }
.fb-tag.is-on { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--fb-tone) 60%, transparent); background: color-mix(in srgb, var(--fb-tone) 14%, transparent); color: var(--ink); }
.fb-spacer { flex: 1; }
.fb-notice { color: var(--subtle); font-size: var(--fs-xs); }
@container (max-width: 520px) {
  .fb-compare { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .fb-meter { grid-column: 1 / -1; grid-row: 2; }
}
</style>
