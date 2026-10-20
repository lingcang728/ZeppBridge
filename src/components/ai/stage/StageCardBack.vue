<script setup lang="ts">
/**
 * 舞台上一张类别牌的背面（二级，2026-10-08）：从被点的那张牌长出来（ModalDialog → dialogFlight），收起缩回去。
 * 只放这一类自己的事：回溯多久（7 / 14 / 30 / 90 天 / 1 年 / 全部，玻璃分段）、里面几天有数据、挑具体日子（三级：牌桌从这张牌发牌）、
 * 这一类不交。原来「你的过去」二级页的那排柱状条不再有。
 * 3.0.4：「应用到所有类别」把这一类的范围抄给其它类别；选了 1 年 / 全部时给整个任务的体积估算，
 * 本机历史不够长时就地问要不要补拉。
 */
import { computed, ref } from 'vue';
import ModalDialog from '../../ModalDialog.vue';
import SegmentTrack from '../../SegmentTrack.vue';
import Icon from '../../Icon.vue';
import TintIcon from '../TintIcon.vue';
import BackfillOffer from '../../BackfillOffer.vue';
import { addDays, ALL_RANGE_DAYS, BRIDGE_RANGES, dayKey, LONG_RANGE_DAYS, snapRange } from '../../../lib/aiTask/bridgeScale';
import { formatTokens } from '../../../lib/aiTask/budget';
import { formatBytes } from '../../../lib/format';
import { useAiTaskPreview } from '../../../composables/useAiTaskPreview';
import { categoryRangeOf } from '../../../lib/aiTask/categories';
import { useAiTaskDraft } from '../../../composables/useAiTaskDraft';
import type { StageCardModel } from '../../../composables/ai/useStageCards';
import { useBridgeText } from '../bridge/bridge.i18n';
import { useStageText } from './stage.i18n';

const props = defineProps<{ card: StageCardModel; anchor?: HTMLElement | null }>();
const emit = defineEmits<{ close: []; deal: [] }>();
const ctl = useAiTaskDraft();
const b = useBridgeText();
const s = useStageText();
const range = computed(() => categoryRangeOf(ctl.draft.value.categories, props.card.category!));
const picked = computed(() => range.value.picked_days?.length ?? 0);
const days = computed(() => snapRange(range.value.days_before + 1));
const rangeName = (n: number) => (n === ALL_RANGE_DAYS ? s.value.all : n === 365 ? s.value.year1 : b.value.days(n));
const items = computed(() => BRIDGE_RANGES.map((n) => ({ value: n as number, label: rangeName(n) })));
const titleId = `stage-back-${props.card.id}`;
const applied = ref(false);
const setDays = (n: number) => { applied.value = false; ctl.setCategoryDays(props.card.category!, n - 1); };
const applyAll = () => { ctl.applyRangeToAll(props.card.category!); applied.value = true; };
/* 长范围：整个任务多大、AI 读不读得完（用预览里同一份估算，和寄出前那句一致）。 */
const long = computed(() => range.value.days_before + 1 >= LONG_RANGE_DAYS);
const { preview } = useAiTaskPreview();
const sizeLine = computed(() => {
  const value = preview.value;
  if (!long.value || !value) return null;
  if (value.markdown?.over_budget) return s.value.sizeTooLong;
  return s.value.sizeHint(formatBytes(value.estimated_bytes), formatTokens(value.markdown?.approx_tokens ?? 0));
});
const rangeFrom = computed(() => addDays(dayKey(), -range.value.days_before));
const drop = () => { ctl.setCategoryEnabled(props.card.category!, false); emit('close'); };
</script>

<template>
  <ModalDialog :labelledby="titleId" :origin="anchor ?? null" @close="emit('close')">
    <div class="back" :style="{ '--tint': card.tint }">
      <header>
        <TintIcon :name="card.icon" :tint="card.tint" :size="34" />
        <div>
          <h2 :id="titleId">{{ card.title }}</h2>
          <p>{{ card.have !== null && card.total !== null ? s.haveOf(card.have, card.total) : b.missing }}<template v-if="card.sub"> · {{ card.sub }}</template></p>
        </div>
      </header>
      <section>
        <h3>{{ s.rangeTitle }}</h3>
        <SegmentTrack :items="items" :model-value="days" :aria-label="s.rangeTitle" @update:model-value="setDays" />
        <p v-if="picked" class="note">{{ s.picked(picked) }}</p>
        <p v-if="sizeLine" class="note size">{{ sizeLine }}</p>
        <BackfillOffer v-if="long" place="ai-range" :start="rangeFrom" :preset="days >= ALL_RANGE_DAYS ? 10 : 1" />
        <button type="button" class="apply-all" :disabled="applied" @click="applyAll"><Icon :name="applied ? 'check' : 'copy'" :size="14" />{{ applied ? s.appliedAll : s.applyAll }}</button>
      </section>
      <button type="button" class="deal" @click="emit('deal')"><Icon name="cards" :size="16" />{{ card.category === 'workout' ? s.pickWorkouts : s.pickDays }}<Icon name="chevron-right" :size="14" /></button>
      <footer>
        <button type="button" class="pill-button quiet" @click="drop">{{ s.drop }}</button>
        <span class="hint">{{ s.flickHint }}</span>
        <button type="button" class="pill-button" @click="emit('close')">{{ b.close }}</button>
      </footer>
    </div>
  </ModalDialog>
</template>

<style scoped>
.back { display: grid; gap: 18px; width: min(420px, 100%); }
header { display: flex; gap: 12px; align-items: center; }
h2 { margin: 0; font-size: var(--fs-lg); font-weight: 700; }
header p { margin: 3px 0 0; color: var(--muted); font-size: var(--fs-xs); }
section { display: grid; gap: 10px; }
h3 { margin: 0; color: var(--muted); font-size: var(--fs-xs); font-weight: 600; }
.note { margin: 0; color: var(--tint); font-size: var(--fs-2xs); }
.note.size { color: var(--muted); }
.apply-all { justify-self: start; display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border: 1px solid var(--mat-line); border-radius: 999px; background: none;
  color: var(--muted); font: 600 var(--fs-2xs) var(--font-sans); cursor: pointer; }
.apply-all:hover:not(:disabled) { color: var(--ink); border-color: color-mix(in srgb, var(--tint) 50%, var(--mat-line)); }
.apply-all:disabled { color: var(--tint); cursor: default; }
.apply-all:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.deal { display: flex; align-items: center; gap: 10px; padding: 14px 16px; border: 0; border-radius: 16px; background: var(--mat-inset); box-shadow: var(--mat-inset-shadow);
  color: var(--ink); font: 600 var(--fs-sm) var(--font-sans); text-align: left; cursor: pointer; }
.deal > :first-child { color: var(--tint); }
.deal > :last-child { margin-left: auto; color: var(--subtle); }
.deal:hover { background: color-mix(in srgb, var(--tint) 8%, var(--mat-inset)); }
.deal:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
footer { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.hint { flex: 1; color: var(--subtle); font-size: var(--fs-2xs); }
</style>
