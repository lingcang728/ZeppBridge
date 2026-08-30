<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import Icon from './Icon.vue';
import SkeletonBlock from './SkeletonBlock.vue';
import { backend, isDesktop, toUserMessage } from '../lib/bridge';
import type { HeartRateBasis, HeartRateZoneOptions } from '../types';
import { defineMessages, useMessages } from '../i18n';

const messages = defineMessages(
  {
    title: '心率区间',
    intro: '三种算法算出来的区间不一样，哪一种对你有意义只有你知道，所以 ZeppBridge 不预设默认，也不会用 220−年龄 之类的公式估算。下面每个基准都标了出处和测量日期。',
    clearChoice: '清除选择',
    desktopOnly: '请从 ZeppBridge 桌面应用打开，心率区间需要读取本机记录。',
    noBases: '本机还没有可用的心率基准。完成一次运动同步后，这里会出现实测最高心率等基准。',
    modelGroup: '算法',
    modelAria: '心率区间算法',
    pickModelFirst: '先选一种算法，下面就会按你选的基准算出区间。',
    pickBasesNext: '再选齐上面的基准，就能算出区间与各区间时长。',
    window: (days: number, total: string) => `近 ${days} 天运动逐秒心率 · 共 ${total}`,
    outside: (below: string, above: string) => `区间外：低于 Z1 ${below} · 高于 Z5 ${above}`,
    formulaNote: (formula: string, bases: string) =>
      `${formula}；边界向下取整，与手表一致。基准：${bases}`,
    missingBases: (list: string) => `本机还没有${list}`,
    basesSeparator: '、',
    zonesUnavailable: '心率区间暂时不可用',
    saveFailed: '保存心率区间设置失败',
    zeroMinutes: '0 分',
    durationHours: (hours: number, minutes: number) => `${hours} 小时 ${minutes} 分`,
    durationMinutes: (minutes: number) => `${minutes} 分`,
    kind: {
      max_hr: '最大心率基准',
      resting_hr: '静息心率基准',
      threshold_hr: '乳酸阈值基准',
    },
    /* 算法名、公式、区间名和基准说明都按后端发来的稳定 id 查表。
       后端也带着一份中文，那是给 CLI / MCP 的：它们的输出不跟界面语言走。 */
    model: {
      max_hr: { label: '最大心率区间', formula: '区间下界 = 最大心率 x 百分比' },
      hr_reserve: { label: '储备心率区间', formula: '区间下界 = 静息心率 + (最大心率 - 静息心率) x 百分比' },
      lactate_threshold: { label: '乳酸阈值区间', formula: '区间下界 = 乳酸阈值心率 x 百分比' },
    },
    percentBands: ['热身', '燃脂', '有氧耐力', '无氧耐力', '极限'],
    thresholdBands: ['轻松', '耐力', '节奏', '阈值', '无氧'],
    basis: {
      observed_max: {
        label: '实测最高心率',
        note: '本地记录到的最高心率。没跑到真正的极限时，区间会整体偏窄。',
      },
      device_max: {
        label: '手表自报最大心率',
        note: '手表在 PAI 报文里自报的最大心率，通常来自 Zepp App 的个人设置。',
      },
      device_resting: {
        label: '手表自报静息心率',
        note: '手表在 PAI 报文里自报的静息心率。',
      },
      lactate_threshold: {
        label: '乳酸阈值心率',
        note: '手表在一次高强度跑步后测出的乳酸阈值心率。',
      },
      computed_resting: {
        label: '本地统计静息心率',
        note: '',
      },
    },
    computedRestingNote: (days: number) => `近 30 天里有数据的 ${days} 天的平均值。`,
  },
  {
    title: 'Heart rate zones',
    intro: 'The three models draw different zones, and only you know which one means something for you — so ZeppBridge picks no default and never estimates from a formula like 220 minus your age. Every basis below carries its source and the date it was measured.',
    clearChoice: 'Clear selection',
    desktopOnly: 'Open this in the ZeppBridge desktop app; heart rate zones read local records.',
    noBases: 'No heart rate basis on this machine yet. After one workout sync, measured values such as your highest recorded heart rate show up here.',
    modelGroup: 'Model',
    modelAria: 'Heart rate zone model',
    pickModelFirst: 'Pick a model, and the zones get computed from the bases you choose.',
    pickBasesNext: 'Choose the remaining bases above to get the zones and the time spent in each.',
    window: (days: number, total: string) => `Second-by-second workout heart rate over ${days} days · ${total} in total`,
    outside: (below: string, above: string) => `Outside the zones: below Z1 ${below} · above Z5 ${above}`,
    formulaNote: (formula: string, bases: string) =>
      `${formula}. Boundaries round down, matching the watch. Bases: ${bases}`,
    missingBases: (list: string) => `Not on this machine yet: ${list}`,
    basesSeparator: ', ',
    zonesUnavailable: 'Heart rate zones are unavailable right now',
    saveFailed: 'Could not save the heart rate zone settings',
    zeroMinutes: '0 min',
    durationHours: (hours: number, minutes: number) => `${hours} hr ${minutes} min`,
    durationMinutes: (minutes: number) => `${minutes} min`,
    kind: {
      max_hr: 'Max HR basis',
      resting_hr: 'Resting HR basis',
      threshold_hr: 'Threshold HR basis',
    },
    model: {
      max_hr: { label: 'Max heart rate zones', formula: 'Zone floor = max heart rate x percentage' },
      hr_reserve: { label: 'Heart rate reserve zones', formula: 'Zone floor = resting HR + (max HR - resting HR) x percentage' },
      lactate_threshold: { label: 'Lactate threshold zones', formula: 'Zone floor = threshold heart rate x percentage' },
    },
    percentBands: ['Warm-up', 'Fat burn', 'Aerobic', 'Anaerobic', 'Maximum'],
    thresholdBands: ['Easy', 'Endurance', 'Tempo', 'Threshold', 'Anaerobic'],
    basis: {
      observed_max: {
        label: 'Highest recorded heart rate',
        note: 'The highest heart rate recorded locally. If you never went to a real limit, the zones come out narrow.',
      },
      device_max: {
        label: 'Max heart rate reported by the watch',
        note: 'What the watch reports in its PAI payload, usually taken from your Zepp app profile.',
      },
      device_resting: {
        label: 'Resting heart rate reported by the watch',
        note: 'What the watch reports in its PAI payload.',
      },
      lactate_threshold: {
        label: 'Lactate threshold heart rate',
        note: 'Measured by the watch after a hard run.',
      },
      computed_resting: {
        label: 'Resting heart rate computed locally',
        note: '',
      },
    },
    computedRestingNote: (days: number) => `Average across the ${days} days with data in the last 30.`,
  },
);
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
const saving = ref(false);
const error = ref<string | null>(null);

const preference = computed(() => options.value?.preference ?? {});
const models = computed(() => options.value?.models ?? []);
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
  loading.value = true;
  error.value = null;
  if (!isDesktop()) {
    options.value = null;
    loading.value = false;
    return;
  }
  try {
    options.value = await backend.getHeartRateZones(props.days);
  } catch (cause) {
    options.value = null;
    error.value = toUserMessage(cause, t.value.zonesUnavailable);
  } finally {
    loading.value = false;
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

const basisSummary = (basis: HeartRateBasis): string => {
  const measured = basis.measuredAt ? ` · ${basis.measuredAt}` : '';
  return `${basis.source}${measured}`;
};

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
      <button
        v-if="preference.model"
        class="button button-secondary"
        type="button"
        :disabled="saving"
        @click="clearChoice"
      >{{ t.clearChoice }}</button>
    </header>

    <p v-if="error" class="zone-alert" role="alert"><Icon name="warning" :size="14" />{{ error }}</p>

    <SkeletonBlock v-if="loading" height="220px" />
    <p v-else-if="!isDesktop()" class="zone-empty">{{ t.desktopOnly }}</p>
    <p v-else-if="!bases.length" class="zone-empty">{{ t.noBases }}</p>

    <template v-else>
      <p class="group-label">{{ t.modelGroup }}</p>
      <div class="model-grid" role="radiogroup" :aria-label="t.modelAria">
        <button
          v-for="model in models"
          :key="model.id"
          type="button"
          role="radio"
          :aria-checked="preference.model === model.id"
          :disabled="!model.available || saving"
          :class="['model-card', { 'is-on': preference.model === model.id }]"
          @click="chooseModel(model.id)"
        >
          <span class="model-name">
            <Icon v-if="preference.model === model.id" name="circle-check" :size="14" />
            {{ modelLabel(model.id, model.label) }}
          </span>
          <span class="model-formula">{{ modelFormula(model.id, model.formula) }}</span>
          <span class="model-bands">
            {{ model.bands.map((band) => `${Math.round(band.lowPercent * 100)}–${Math.round(band.highPercent * 100)}%`).join(' / ') }}
          </span>
          <span v-if="!model.available" class="model-missing">{{ unavailableReason(model.requires) }}</span>
        </button>
      </div>

      <template v-if="selectedModel">
        <div v-for="slot in basisSlots" :key="slot.kind" class="basis-block">
          <p class="group-label">{{ slot.label }}</p>
          <div class="basis-list" role="radiogroup" :aria-label="slot.label">
            <button
              v-for="basis in slot.candidates"
              :key="basis.id"
              type="button"
              role="radio"
              :aria-checked="slot.chosen === basis.id"
              :disabled="saving"
              :class="['basis-row', { 'is-on': slot.chosen === basis.id }]"
              @click="chooseBasis(slot.kind, basis.id)"
            >
              <span class="basis-value">{{ Math.round(basis.value) }}<i>{{ basis.unit }}</i></span>
              <span class="basis-copy">
                <strong>{{ basisLabel(basis) }}</strong>
                <span class="basis-source">{{ basisSummary(basis) }}</span>
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
            <span class="zone-name">Z{{ zone.zone }} {{ zoneName(report.model, zone.zone) || zone.label }}</span>
            <span class="zone-range">{{ zone.minBpm }}–{{ zone.maxBpm }}</span>
            <span class="zone-bar"><i :style="{ width: `${Math.round((zone.seconds / peakSeconds) * 100)}%` }"></i></span>
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
.zone-card {
  display: grid;
  gap: var(--space-3);
  align-content: start;
  padding: var(--space-4) var(--space-6);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
  min-width: 0;
}
.zone-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-4); }
.zone-head h2 { margin: 0 0 4px; color: var(--ink); font-size: 15px; font-weight: 700; }
.zone-intro { margin: 0; max-width: 68ch; color: var(--muted); font-size: 12px; line-height: 1.7; }
.zone-alert { display: flex; align-items: center; gap: var(--space-2); margin: 0; color: var(--danger); font-size: 12px; }
.zone-empty { margin: 0; color: var(--subtle); font-size: 12px; }
.group-label { margin: 0; color: var(--subtle); font-size: 11px; }

.model-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--space-3); }
.model-card {
  display: grid;
  gap: 5px;
  align-content: start;
  padding: var(--space-3);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
  color: var(--muted);
  text-align: left;
  cursor: pointer;
}
.model-card:hover:not(:disabled) { border-color: var(--accent); }
.model-card:disabled { opacity: .55; cursor: not-allowed; }
.model-card.is-on { border-color: var(--accent); background: var(--accent-soft); }
.model-name { display: flex; align-items: center; gap: 5px; color: var(--ink); font-size: 13px; font-weight: 700; }
.model-card.is-on .model-name { color: var(--accent); }
.model-formula { font-size: 11px; line-height: 1.6; }
.model-bands { color: var(--subtle); font-family: var(--font-mono); font-size: 11px; }
.model-missing { color: var(--warning); font-size: 11px; }

.basis-block { display: grid; gap: var(--space-2); }
.basis-list { display: grid; gap: var(--space-2); }
.basis-row {
  display: grid;
  grid-template-columns: 74px minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-3);
  min-height: 44px;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
  text-align: left;
  cursor: pointer;
}
.basis-row:hover:not(:disabled) { border-color: var(--accent); }
.basis-row.is-on { border-color: var(--accent); background: var(--accent-soft); }
.basis-value { color: var(--ink); font-family: var(--font-mono); font-size: 19px; font-variant-numeric: tabular-nums; }
.basis-value i { margin-left: 3px; color: var(--subtle); font-size: 10px; font-style: normal; }
.basis-copy { display: grid; gap: 1px; min-width: 0; }
.basis-copy strong { color: var(--ink); font-size: 12px; font-weight: 700; }
.basis-source { color: var(--subtle); font-family: var(--font-mono); font-size: 11px; overflow-wrap: anywhere; }
.basis-note { color: var(--muted); font-size: 11px; line-height: 1.6; }
.basis-check { color: var(--accent); }

.zone-summary { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); color: var(--ink); font-size: 12px; font-weight: 700; }
.zone-window { color: var(--subtle); font-size: 11px; font-weight: 400; }
.zone-list { display: grid; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
.zone-list li {
  display: grid;
  grid-template-columns: 108px 74px minmax(60px, 1fr) 86px;
  align-items: center;
  gap: var(--space-3);
  font-size: 12px;
}
.zone-name { color: var(--ink); }
.zone-range, .zone-time { color: var(--muted); font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.zone-time { text-align: right; }
.zone-bar { height: 8px; overflow: hidden; border-radius: 999px; background: var(--surface-raised); }
.zone-bar i { display: block; height: 100%; border-radius: 999px; background: var(--heart); }
.zone-outside, .zone-formula { margin: 0; color: var(--subtle); font-size: 11px; line-height: 1.7; }
@media (max-width: 720px) {
  .zone-card { padding: var(--space-4); }
  .zone-list li { grid-template-columns: minmax(0, 1fr) auto; }
  .zone-bar { display: none; }
}
</style>
