<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useFirstLoad } from '../composables/useFirstLoad';
import Icon from './Icon.vue';
import SkeletonBlock from './SkeletonBlock.vue';
import SegmentTrack from './SegmentTrack.vue';
import { backend, isDesktop, toUserMessage } from '../lib/bridge';
import { createLoadSeq } from '../lib/loadSeq';
import type { HeartRateBasis, HeartRateZoneOptions } from '../types';
import { useMessages } from '../i18n';
import { heartRateZonePickerMessages as messages } from './HeartRateZonePicker.i18n';

const t = useMessages(messages);

const kindLabel = (kind: string): string =>
  (t.value.kind as Record<string, string | undefined>)[kind] ?? kind;

type ModelCopy = { label: string; formula: string };
type BasisCopy = { label: string; note: string };

const modelCopy = (id: string): ModelCopy | undefined =>
  (t.value.model as Record<string, ModelCopy | undefined>)[id];
const basisCopy = (id: string): BasisCopy | undefined =>
  (t.value.basis as Record<string, BasisCopy | undefined>)[id];

/** 后端认识而界面还不认识的模型／基准：退回它那份中文，别显示空白。 */
const modelLabel = (id: string, fallback: string): string => modelCopy(id)?.label ?? fallback;
const modelFormula = (id: string, fallback: string): string => modelCopy(id)?.formula ?? fallback;
const basisLabel = (basis: HeartRateBasis): string => basisCopy(basis.id)?.label ?? basis.label;
const basisNote = (basis: HeartRateBasis): string => {
  if (basis.id === 'computed_resting') {
    return basis.noteCount ? t.value.computedRestingNote(basis.noteCount) : (basis.note ?? '');
  }
  return basisCopy(basis.id)?.note || (basis.note ?? '');
};

/** 区间名按算法分两套：阈值模型的五个区间和百分比模型不是一回事。 */
const zoneName = (modelId: string, zone: number): string => {
  const names = modelId === 'lactate_threshold' ? t.value.thresholdBands : t.value.percentBands;
  return names[zone - 1] ?? '';
};

const props = defineProps<{ days: number; revision: number }>();

const options = ref<HeartRateZoneOptions | null>(null);
const loading = ref(true);
const initialLoading = useFirstLoad(loading);
const saving = ref(false);
const error = ref<string | null>(null);
const loadSeq = createLoadSeq();

const preference = computed(() => options.value?.preference ?? {});
const models = computed(() => options.value?.models ?? []);
/* 三种算法是一枚可拖动的胶囊（和全应用「从几项里挑一个」同一种控件），不再是三块贴片。
   没选过时停在第一项上但不算选中：拨一下才保存。 */
const modelItems = computed(() => models.value.map((model) => ({ value: model.id, label: modelLabel(model.id, model.label) })));
const focusedModel = ref<string | null>(null);
const shownModel = computed(() => models.value.find((model) => model.id === (focusedModel.value ?? preference.value.model))
  ?? models.value[0] ?? null);
const onModelPick = (value: string | number) => {
  const id = String(value);
  focusedModel.value = id;
  const model = models.value.find((entry) => entry.id === id);
  if (model?.available) chooseModel(id);
};
/** 区间条的颜色：Z1 冷 → Z5 热，一眼分得出强度，不再五条全是同一种红。 */
const ZONE_TONES = ['var(--pace)', 'var(--activity)', 'var(--training)', 'var(--calories)', 'var(--heart)'];
const zoneTone = (zone: number) => ZONE_TONES[Math.min(ZONE_TONES.length - 1, Math.max(0, zone - 1))];
const bases = computed(() => options.value?.bases ?? []);
const report = computed(() => options.value?.report ?? null);

const selectedModel = computed(() =>
  models.value.find((model) => model.id === preference.value.model) ?? null);

/** Which basis slots the chosen model needs, and the candidates for each. */
const basisSlots = computed(() => {
  const model = selectedModel.value;
  if (!model) return [];
  return model.requires.map((kind) => ({
    kind,
    label: kindLabel(kind),
    chosen:
      kind === 'max_hr'
        ? preference.value.maxBasis ?? null
        : kind === 'resting_hr'
          ? preference.value.restingBasis ?? null
          : preference.value.thresholdBasis ?? null,
    candidates: bases.value.filter((basis) => basis.kind === kind),
  }));
});

const unavailableReason = (requires: string[]): string => {
  const missing = requires
    .filter((kind) => !bases.value.some((basis) => basis.kind === kind))
    .map(kindLabel);
  return missing.length ? t.value.missingBases(missing.join(t.value.basesSeparator)) : '';
};

const load = async () => {
  const seq = loadSeq.next();
  loading.value = true;
  error.value = null;
  if (!isDesktop()) {
    if (!loadSeq.isCurrent(seq)) return;
    options.value = null;
    loading.value = false;
    return;
  }
  try {
    const next = await backend.getHeartRateZones(props.days);
    if (!loadSeq.isCurrent(seq)) return;
    options.value = next;
  } catch (cause) {
    if (!loadSeq.isCurrent(seq)) return;
    options.value = null;
    error.value = toUserMessage(cause, t.value.zonesUnavailable);
  } finally {
    if (loadSeq.isCurrent(seq)) loading.value = false;
  }
};

const save = async (next: {
  model?: string | null;
  maxBasis?: string | null;
  restingBasis?: string | null;
  thresholdBasis?: string | null;
}) => {
  if (!isDesktop()) return;
  saving.value = true;
  error.value = null;
  try {
    options.value = await backend.setHeartRateZonePreference(
      { ...preference.value, ...next },
      props.days,
    );
  } catch (cause) {
    error.value = toUserMessage(cause, t.value.saveFailed);
  } finally {
    saving.value = false;
  }
};

/**
 * Switching model clears the basis slots the new model does not use.
 *
 * Carrying a stale threshold choice into the reserve model would leave the
 * stored preference describing a combination the user never picked.
 */
const chooseModel = (id: string) => {
  const model = models.value.find((item) => item.id === id);
  if (!model) return;
  void save({
    model: id,
    maxBasis: model.requires.includes('max_hr') ? preference.value.maxBasis ?? null : null,
    restingBasis: model.requires.includes('resting_hr') ? preference.value.restingBasis ?? null : null,
    thresholdBasis: model.requires.includes('threshold_hr')
      ? preference.value.thresholdBasis ?? null
      : null,
  });
};

const chooseBasis = (kind: string, id: string) => {
  if (kind === 'max_hr') void save({ maxBasis: id });
  else if (kind === 'resting_hr') void save({ restingBasis: id });
  else void save({ thresholdBasis: id });
};

const clearChoice = () => void save({
  model: null,
  maxBasis: null,
  restingBasis: null,
  thresholdBasis: null,
});

const basisSummary = (basis: HeartRateBasis): string => basis.measuredAt ?? '';

const duration = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) return t.value.zeroMinutes;
  const total = Math.round(seconds / 60);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return hours > 0 ? t.value.durationHours(hours, minutes) : t.value.durationMinutes(minutes);
};

const peakSeconds = computed(() =>
  Math.max(1, ...(report.value?.zones ?? []).map((zone) => zone.seconds)));

const measuredSeconds = computed(() => {
  const current = report.value;
  if (!current) return 0;
  return current.zones.reduce((total, zone) => total + zone.seconds, 0)
    + current.belowZone1Seconds
    + current.aboveZone5Seconds;
});

onMounted(() => { void load(); });
watch(() => props.days, () => { void load(); });
watch(() => props.revision, () => { void load(); });
</script>

<template>
  <section class="zone-card" aria-labelledby="zone-title">
    <header class="zone-head">
      <div>
        <h2 id="zone-title">{{ t.title }}</h2>
        <p class="zone-intro">{{ t.intro }}</p>
      </div>
      <button v-if="preference.model" class="pill-button quiet" type="button" :disabled="saving" @click="clearChoice">
        <Icon name="undo" :size="13" />{{ t.clearChoice }}
      </button>
    </header>

    <p v-if="error" class="zone-alert" role="alert"><Icon name="warning" :size="14" />{{ error }}</p>

    <SkeletonBlock v-if="initialLoading" height="220px" />
    <p v-else-if="!isDesktop()" class="zone-empty">{{ t.desktopOnly }}</p>
    <p v-else-if="!bases.length" class="zone-empty">{{ t.noBases }}</p>

    <template v-else>
      <p class="group-label">{{ t.modelGroup }}</p>
      <SegmentTrack class="model-track" :items="modelItems" :model-value="shownModel?.id ?? ''" :disabled="saving"
        :aria-label="t.modelAria" @update:model-value="onModelPick" />
      <p v-if="shownModel" class="model-line">
        <span class="model-formula">{{ modelFormula(shownModel.id, shownModel.formula) }}</span>
        <span class="model-bands">{{ shownModel.bands.map((band) => `${Math.round(band.lowPercent * 100)}–${Math.round(band.highPercent * 100)}%`).join(' · ') }}</span>
        <span v-if="!shownModel.available" class="model-missing">{{ unavailableReason(shownModel.requires) }}</span>
      </p>

      <template v-if="selectedModel">
        <div v-for="slot in basisSlots" :key="slot.kind" class="basis-block">
          <p class="group-label">{{ slot.label }}</p>
          <div class="basis-list" role="group" :aria-label="slot.label">
            <button
              v-for="basis in slot.candidates"
              :key="basis.id"
              type="button"
              :aria-pressed="slot.chosen === basis.id"
              :disabled="saving"
              :class="['basis-row', { 'is-on': slot.chosen === basis.id }]"
              @click="chooseBasis(slot.kind, basis.id)"
            >
              <span class="basis-value">{{ Math.round(basis.value) }}<i>{{ basis.unit }}</i></span>
              <span class="basis-copy">
                <strong>{{ basisLabel(basis) }}</strong>
                <span v-if="basisSummary(basis)" class="basis-source">{{ basisSummary(basis) }}</span>
                <span v-if="basisNote(basis)" class="basis-note">{{ basisNote(basis) }}</span>
              </span>
              <Icon v-if="slot.chosen === basis.id" name="circle-check" :size="15" class="basis-check" />
            </button>
          </div>
        </div>
      </template>

      <p v-if="!preference.model" class="zone-empty">{{ t.pickModelFirst }}</p>
      <p v-else-if="!report" class="zone-empty">{{ t.pickBasesNext }}</p>

      <template v-else>
        <div class="zone-summary">
          <span>{{ modelLabel(report.model, report.modelLabel) }}</span>
          <span class="zone-window">{{ t.window(report.windowDays, duration(measuredSeconds)) }}</span>
        </div>
        <ul class="zone-list">
          <li v-for="zone in report.zones" :key="zone.zone">
            <span class="zone-name"><b :style="{ background: zoneTone(zone.zone) }">Z{{ zone.zone }}</b>{{ zoneName(report.model, zone.zone) || zone.label }}</span>
            <span class="zone-range">{{ zone.minBpm }}–{{ zone.maxBpm }}</span>
            <span class="zone-bar"><i :style="{ width: `${Math.round((zone.seconds / peakSeconds) * 100)}%`, background: zoneTone(zone.zone) }"></i></span>
            <span class="zone-time">{{ duration(zone.seconds) }}</span>
          </li>
        </ul>
        <p class="zone-outside">
          {{ t.outside(duration(report.belowZone1Seconds), duration(report.aboveZone5Seconds)) }}
        </p>
        <p class="zone-formula">
          {{ t.formulaNote(
            modelFormula(report.model, report.formula),
            report.bases.map((basis) => `${basisLabel(basis)} ${Math.round(basis.value)}`).join(' · '),
          ) }}
        </p>
      </template>
    </template>
  </section>
</template>

<style scoped>
/* 与其他卡同一种有厚度的板：不描边、大圆角。选项不再是一格格有硬边的贴片，
   而是胶囊 + 淡底的行；区间表按列等宽对齐，数字列右对齐。 */
.zone-card {
  display: grid;
  gap: var(--space-3);
  align-content: start;
  min-width: 0;
  padding: 20px 24px 18px;
  border-radius: var(--radius-lg);
  background: var(--mat-card);
  box-shadow: var(--mat-rim), var(--mat-shadow);
}
.zone-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-4); }
.zone-head h2 { margin: 0 0 4px; color: var(--ink); font-size: var(--fs-xl); font-weight: 700; }
.zone-head .pill-button { flex: 0 0 auto; min-height: 32px; padding: 0 14px; font-size: var(--fs-xs); }
.zone-intro { margin: 0; max-width: 68ch; color: var(--muted); font-size: var(--fs-sm); line-height: 1.7; }
.zone-alert { display: flex; align-items: center; gap: var(--space-2); margin: 0; color: var(--danger); font-size: var(--fs-sm); }
.zone-empty { margin: 0; color: var(--subtle); font-size: var(--fs-sm); }
.group-label { margin: 6px 0 0; color: var(--subtle); font-size: var(--fs-xs); font-weight: 600; }

.model-track { justify-self: start; max-width: 100%; }
.model-line { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 16px; margin: 0; color: var(--muted); font-size: var(--fs-xs); line-height: 1.6; }
.model-bands { color: var(--subtle); font-variant-numeric: tabular-nums; }
.model-missing { color: var(--warning); }

.basis-block { display: grid; gap: var(--space-2); }
.basis-list { display: grid; gap: 6px; }
.basis-row {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr) 20px;
  align-items: center;
  gap: var(--space-3);
  min-height: 52px;
  padding: 10px 16px;
  border: 0;
  border-radius: 18px;
  background: color-mix(in srgb, var(--ink) 4%, transparent);
  box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 5%, transparent);
  text-align: left;
  cursor: pointer;
  transition: background var(--dur-fast) ease;
}
.basis-row:hover:not(:disabled) { background: color-mix(in srgb, var(--ink) 7%, transparent); }
.basis-row.is-on { background: color-mix(in srgb, var(--accent) 14%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 40%, transparent); }
.basis-value { color: var(--ink); font-family: var(--font-mono); font-size: 22px; font-variant-numeric: tabular-nums; }
.basis-value i { margin-left: 4px; color: var(--subtle); font-family: inherit; font-size: var(--fs-2xs); font-style: normal; }
.basis-copy { display: grid; gap: 1px; min-width: 0; }
.basis-copy strong { color: var(--ink); font-size: var(--fs-sm); font-weight: 700; }
.basis-source { color: var(--subtle); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.basis-note { color: var(--muted); font-size: var(--fs-xs); line-height: 1.6; }
.basis-check { color: var(--accent); }

.zone-summary { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); margin-top: 6px; color: var(--ink); font-size: var(--fs-md); font-weight: 700; }
.zone-window { color: var(--subtle); font-size: var(--fs-xs); font-weight: 400; }
/* 四列：区间名 | 心率范围 | 条 | 时长。名字和范围列定宽、时长列右对齐定宽，五行上下对齐。 */
.zone-list { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }
.zone-list li {
  display: grid;
  grid-template-columns: 128px 92px minmax(60px, 1fr) 112px;
  align-items: center;
  gap: var(--space-4);
  font-size: var(--fs-sm);
}
.zone-name { display: inline-flex; align-items: center; gap: 8px; color: var(--ink); white-space: nowrap; }
.zone-name b { display: inline-grid; min-width: 30px; height: 22px; place-items: center; border-radius: 999px; color: #0B0D10; font-size: var(--fs-2xs); font-weight: 800; }
.zone-range, .zone-time { color: var(--muted); font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.zone-time { text-align: right; white-space: nowrap; }
.zone-bar { height: 10px; overflow: hidden; border-radius: 999px; background: var(--mat-inset); box-shadow: var(--mat-inset-shadow); }
.zone-bar i { display: block; height: 100%; border-radius: 999px; }
.zone-outside, .zone-formula { margin: 0; color: var(--subtle); font-size: var(--fs-xs); line-height: 1.7; }
@media (max-width: 720px) {
  .zone-card { padding: var(--space-4); }
  .zone-list li { grid-template-columns: minmax(0, 1fr) auto; }
  .zone-bar, .zone-range { display: none; }
}
</style>
