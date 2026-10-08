<script setup lang="ts">
/**
 * 舞台上一张类别牌的背面（二级，2026-10-08）：从被点的那张牌长出来（ModalDialog → dialogFlight），收起缩回去。
 * 只放这一类自己的事：回溯多久（7 / 14 / 30 / 90 天，玻璃分段）、里面几天有数据、挑具体日子（三级：牌桌从这张牌发牌）、
 * 这一类不交。原来「你的过去」二级页的那排柱状条不再有。
 */
import { computed } from 'vue';
import ModalDialog from '../../ModalDialog.vue';
import SegmentTrack from '../../SegmentTrack.vue';
import Icon from '../../Icon.vue';
import TintIcon from '../TintIcon.vue';
import { BRIDGE_RANGES, snapRange } from '../../../lib/aiTask/bridgeScale';
import { categoryRangeOf } from '../../../lib/aiTask/categories';
import { useAiTaskDraft } from '../../../composables/useAiTaskDraft';
import type { StageCardModel } from '../../../composables/ai/useStageCards';
import { useBridgeText } from '../bridge/bridge.i18n';
import { useStageText } from './stage.i18n';

const props = defineProps<{ card: StageCardModel }>();
const emit = defineEmits<{ close: []; deal: [] }>();
const ctl = useAiTaskDraft();
const b = useBridgeText();
const s = useStageText();
const range = computed(() => categoryRangeOf(ctl.draft.value.categories, props.card.category!));
const picked = computed(() => range.value.picked_days?.length ?? 0);
const days = computed(() => snapRange(range.value.days_before + 1));
const items = computed(() => BRIDGE_RANGES.map((n) => ({ value: n as number, label: b.value.days(n) })));
const titleId = `stage-back-${props.card.id}`;
const setDays = (n: number) => ctl.setCategoryDays(props.card.category!, n - 1);
const drop = () => { ctl.setCategoryEnabled(props.card.category!, false); emit('close'); };
</script>

<template>
  <ModalDialog :labelledby="titleId" @close="emit('close')">
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
.deal { display: flex; align-items: center; gap: 10px; padding: 14px 16px; border: 0; border-radius: 16px; background: var(--mat-inset); box-shadow: var(--mat-inset-shadow);
  color: var(--ink); font: 600 var(--fs-sm) var(--font-sans); text-align: left; cursor: pointer; }
.deal > :first-child { color: var(--tint); }
.deal > :last-child { margin-left: auto; color: var(--subtle); }
.deal:hover { background: color-mix(in srgb, var(--tint) 8%, var(--mat-inset)); }
.deal:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
footer { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.hint { flex: 1; color: var(--subtle); font-size: var(--fs-2xs); }
</style>
