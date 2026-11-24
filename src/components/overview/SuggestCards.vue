<script setup lang="ts">
/**
 * 首页建议卡（「建议 → 发牌 → 交给 AI」）：概览内容区里的一行，不是横幅。
 *
 * - 后端按本地规则给触发码 + 事实（刚练完、昨晚睡得差、很久没动），句子在这里写；同时最多两张；
 * - 右边总有一个小入口「帮我排明天」；
 * - 点一张：取事实、按这一类发好一手牌、起一份新任务（这手牌 + 模板问题），这张卡长成「交给 AI」整页，
 *   落地后牌从「按问题发牌」那枚胶囊里抽出来（composables/useHandDeal.ts）。不在本地调用任何模型；
 * - ×：这一次不再出，这一类今天也不再出（composables/useSuggestCards.ts）；设置 → AI 里能整个关掉。
 * 没有可出的就整行不画。
 */
import { computed, onMounted, ref, shallowRef } from 'vue';
import { useRouter } from 'vue-router';
import Icon, { type IconName } from '../Icon.vue';
import { useSuggestText } from './suggest.i18n';
import { useHandsText } from '../cards/hands.i18n';
import { handQuestion, queueHandDeal, useHandDeal, type HandKind } from '../../composables/useHandDeal';
import { useSuggestCards } from '../../composables/useSuggestCards';
import { useRevisionReload } from '../../composables/useRevisionReload';
import { armPageMorph } from '../../composables/usePageMorph';
import { backend } from '../../lib/bridge';
import { formatDistance, formatDuration } from '../../lib/format';
import { workoutLabel } from '../../lib/labels';
import { displayDateTimeFormatter, parseDisplayDate } from '../../lib/dateTime';
import { metricColor } from '../../lib/metricTone';
import { holdInPlace } from '../../lib/motion/holdInPlace';
import type { Suggestion } from '../../types/hands';

const MAX_SHOWN = 2;
const t = useSuggestText();
const ht = useHandsText();
const router = useRouter();
const deal = useHandDeal();
const prefs = useSuggestCards();
const list = shallowRef<Suggestion[]>([]);
const busy = ref<string | null>(null);
const failed = ref(false);

const load = async () => {
  if (!prefs.enabled()) { list.value = []; return; }
  try { list.value = await backend.suggestionCards(); } catch { list.value = []; }
};
onMounted(() => { void load(); });
useRevisionReload(() => { void load(); });

const KIND: Record<Suggestion['code'], HandKind> = { workout_done: 'review_workout', sleep_poor: 'recovery_day', long_idle: 'comeback' };
const ICON: Record<Suggestion['code'], IconName> = { workout_done: 'run', sleep_poor: 'moon', long_idle: 'timeline-flag' };
const TONE: Record<Suggestion['code'], string> = { workout_done: 'training_load', sleep_poor: 'sleep_duration', long_idle: 'steps' };
const md = (date: string) => displayDateTimeFormatter({ month: 'numeric', day: 'numeric' }).format(parseDisplayDate(date));
const gap = (minutes: number) => formatDuration(Math.max(0, minutes));

const shown = computed(() => list.value.filter((item) => prefs.visible(item.code, item.key)).slice(0, MAX_SHOWN).map((item) => {
  const kind = KIND[item.code];
  let eyebrow = '';
  let line = '';
  if (item.code === 'workout_done') {
    eyebrow = t.value.workoutEyebrow;
    const amount = item.distance_m ? formatDistance(item.distance_m) : formatDuration(item.duration_s / 60);
    line = t.value.workoutLine(workoutLabel(item.workout_type), amount, item.same_type_ids.length);
  } else if (item.code === 'sleep_poor') {
    eyebrow = t.value.sleepEyebrow;
    line = item.short || item.deep_min === null || item.baseline_deep_min === null
      ? t.value.sleepShort(formatDuration(item.duration_min), gap(item.baseline_duration_min - item.duration_min))
      : t.value.sleepDeep(formatDuration(item.deep_min), gap(item.baseline_deep_min - item.deep_min));
  } else {
    eyebrow = t.value.idleEyebrow(item.days);
    line = t.value.idleLine(md(item.last_date), workoutLabel(item.last_workout_type));
  }
  return { item, kind, eyebrow, line, action: ht.value.kind[kind], icon: ICON[item.code], tone: metricColor(TONE[item.code]) };
}));
const tomorrow = computed(() => prefs.enabled());

/** 点一张：发好牌、起新任务，这张卡长成「交给 AI」整页。 */
const go = async (kind: HandKind, suggestion: Suggestion | null, event: MouseEvent) => {
  if (busy.value) return;
  const card = (event.currentTarget as HTMLElement).closest<HTMLElement>('.suggest-item');
  busy.value = suggestion?.key ?? kind;
  failed.value = false;
  try {
    const facts = await deal.loadFacts(true);
    const result = facts ? deal.dealHand(kind, facts, suggestion) : null;
    if (!result?.ok) { failed.value = true; return; }
    deal.startTask(result.hand, handQuestion(result.hand, ht.value, suggestion));
    queueHandDeal({ hand: result.hand, suggestion });
    if (suggestion) prefs.close(suggestion.code, suggestion.key);
    armPageMorph(card, '/ai');
    await router.push('/ai');
  } finally {
    busy.value = null;
  }
};
const dismiss = (item: Suggestion) => { prefs.close(item.code, item.key); };
</script>

<template>
  <TransitionGroup v-if="shown.length || tomorrow" tag="section" name="suggest" class="suggest-row" @before-leave="holdInPlace" role="group" :aria-label="t.aria">
    <article v-for="card in shown" :key="card.item.key" class="suggest-item" :style="{ '--sg-tone': card.tone }">
      <button type="button" class="suggest-main" :disabled="!!busy" @click="go(card.kind, card.item, $event)">
        <span class="suggest-icon" aria-hidden="true"><Icon :name="card.icon" :size="16" /></span>
        <span class="suggest-text">
          <small>{{ card.eyebrow }}</small>
          <span>{{ card.line }}</span>
        </span>
        <span class="suggest-go">{{ card.action }}<Icon name="chevron-right" :size="13" /></span>
      </button>
      <button type="button" class="suggest-close" :aria-label="t.dismiss" :title="t.dismiss" @click="dismiss(card.item)"><Icon name="x" :size="14" /></button>
    </article>
    <article v-if="tomorrow" key="plan_tomorrow" class="suggest-item is-small" :style="{ '--sg-tone': 'var(--accent)' }">
      <button type="button" class="suggest-main" :disabled="!!busy" @click="go('plan_tomorrow', null, $event)">
        <span class="suggest-icon" aria-hidden="true"><Icon name="sun" :size="15" /></span>
        <span class="suggest-text">
          <strong>{{ ht.kind.plan_tomorrow }}</strong>
          <small>{{ t.tomorrowSub }}</small>
        </span>
        <Icon class="suggest-chevron" name="chevron-right" :size="13" />
      </button>
    </article>
    <p v-if="failed" key="failed" class="suggest-failed" role="status">{{ t.failed }}</p>
  </TransitionGroup>
</template>

<style scoped>
/* 和跑后打分那块同一种中性小板：不铺底色、不抬卡板，概览的主角仍是下面的卡。最多两张 + 一个小入口，排一行，窄了就折行。 */
.suggest-row { position: relative; display: flex; flex-wrap: wrap; gap: 10px; }
.suggest-item { position: relative; display: flex; flex: 1 1 300px; min-width: 0; border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--ink) 4%, transparent); box-shadow: inset 0 0 0 1px var(--mat-line); }
.suggest-item.is-small { flex: 0 1 260px; }
.suggest-main { display: flex; flex: 1; align-items: center; gap: 12px; min-width: 0; padding: 12px 40px 12px 14px; border: 0; border-radius: inherit;
  background: transparent; color: var(--ink); font: inherit; text-align: left; cursor: pointer; transition: background 140ms ease; }
.suggest-item.is-small .suggest-main { padding-right: 14px; }
.suggest-main:hover:not(:disabled) { background: color-mix(in srgb, var(--sg-tone) 8%, transparent); }
.suggest-main:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.suggest-main:disabled { cursor: progress; }
.suggest-icon { display: grid; place-items: center; flex: none; width: 32px; height: 32px; border-radius: 10px;
  background: color-mix(in srgb, var(--sg-tone) 16%, transparent); color: var(--sg-tone); }
.suggest-text { display: grid; flex: 1; gap: 2px; min-width: 0; }
.suggest-text small { color: var(--subtle); font-size: var(--fs-xs); font-weight: 600; overflow-wrap: anywhere; }
.suggest-text span, .suggest-text strong { color: var(--ink); font-size: var(--fs-sm); line-height: 1.4; overflow-wrap: anywhere; }
.suggest-text strong { font-weight: 650; }
.suggest-go { display: inline-flex; align-items: center; gap: 2px; flex: none; max-width: 40%; color: var(--sg-tone); font-size: var(--fs-sm); font-weight: 650; text-align: right; overflow-wrap: anywhere; }
.suggest-chevron { flex: none; color: var(--subtle); }
.suggest-close { position: absolute; top: 50%; right: 8px; display: grid; place-items: center; width: 26px; height: 26px; border: 0; border-radius: 50%;
  background: transparent; color: var(--subtle); cursor: pointer; translate: 0 -50%; }
.suggest-close:hover { background: var(--glass-press); color: var(--ink); }
.suggest-close:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
.suggest-failed { flex-basis: 100%; margin: 0; color: var(--subtle); font-size: var(--fs-xs); }
/* 关掉一张：原地淡出、微缩；剩下的滑过去补位（只动 opacity / transform）。 */
.suggest-leave-active { transition: opacity 320ms ease, transform 320ms cubic-bezier(.4, .6, .2, 1); }
.suggest-leave-to { opacity: 0; transform: scale(.96); }
.suggest-move { transition: transform 420ms cubic-bezier(.4, .6, .2, 1); }
.suggest-enter-active { transition: opacity 360ms ease; }
.suggest-enter-from { opacity: 0; }
@media (prefers-reduced-motion: reduce) { .suggest-leave-active, .suggest-move { transition-duration: 1ms; } }
@container (max-width: 520px) {
  .suggest-main { flex-wrap: wrap; }
  .suggest-go { max-width: none; margin-left: 44px; }
}
</style>
