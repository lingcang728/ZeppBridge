<script setup lang="ts">
/**
 * 手动指认设备型号。
 *
 * 有些 Zepp 账号的设备响应里没有任何产品名字段，只有内部编号，本机无从推断
 * 型号——再点多少次「重新识别」都不会变。与其让用户对着「未识别设备」发呆，
 * 不如让他翻一遍随包的设备图，指一下哪个是自己的。
 *
 * 这里选出来的结果会被如实标注成「你指认的型号」，不会伪装成自动识别。
 */
import { computed, ref, watch } from 'vue';
import DesignIcon from './DesignIcon.vue';
import DeviceVisual from './DeviceVisual.vue';
import { deviceCatalog, deviceImageFor, type DeviceCatalogEntry } from '../lib/deviceCatalog';
import { defineMessages, locale, useMessages } from '../i18n';

const messages = defineMessages(
  {
    pickerAria: '手动指认设备型号',
    searchAria: '按型号名称搜索',
    searchPlaceholder: '搜型号，例如 Balance 2',
    empty: '没有匹配的型号。换个关键词，或者把筛选切回「全部」。',
    prev: '上一个型号',
    next: '下一个型号',
    alreadyAssigned: '已经是这台了',
    confirm: '这就是我的设备',
    clear: '撤销指认',
    later: '稍后再说',
    contributeTitle: '顺便帮下一版自动认出这台设备',
    contributeBody: '把「你选的型号 + 这台设备的型号编号（deviceSource / deviceType，只有整数）」交给 ZeppBridge。这两样都只说明「哪一款表」，不含账号、序列号、MAC 或任何健康数据。华米没有公开编号对照表，这是内置目录唯一能长大的方式——几个人指认过之后，同款设备对所有人都会自动识别。',
    note: '选完会显示成「你指认的型号」，不会被当成自动识别结果。图片和型号都来自随包目录，翻页全程不联网。',
    filterAll: '全部',
    filterWatch: '手表',
    filterBand: '手环',
    filterStrap: '表带',
    filterRing: '戒指',
    filterEarbuds: '耳机',
  },
  {
    pickerAria: 'Pick your device model by hand',
    searchAria: 'Search by model name',
    searchPlaceholder: 'Search a model, e.g. Balance 2',
    empty: 'No model matches. Try another keyword, or switch the filter back to All.',
    prev: 'Previous model',
    next: 'Next model',
    alreadyAssigned: 'Already this one',
    confirm: "That's my device",
    clear: 'Withdraw the pick',
    later: 'Not now',
    contributeTitle: 'Help the next release recognize this device on its own',
    contributeBody: 'Sends ZeppBridge the model you picked plus this device\'s model numbers (deviceSource / deviceType, integers only). Both say which watch it is and nothing else: no account, no serial, no MAC, no health data. Huami publishes no lookup table for those numbers, so this is the only way the built-in catalog grows. Once a few people have pointed at a model, it gets recognized automatically for everyone.',
    note: 'Your pick shows up as "Model you picked" and is never passed off as an automatic match. Images and model names come from the bundled catalog; browsing them touches no network.',
    filterAll: 'All',
    filterWatch: 'Watches',
    filterBand: 'Bands',
    filterStrap: 'Straps',
    filterRing: 'Rings',
    filterEarbuds: 'Earbuds',
  },
);
const t = useMessages(messages);

const props = defineProps<{
  /** 当前已指认的 catalog_id（如果有）。 */
  modelValue?: string | null;
  busy?: boolean;
}>();
const emit = defineEmits<{
  (event: 'confirm', catalogId: string, contribute: boolean): void;
  (event: 'clear'): void;
  (event: 'cancel'): void;
}>();

/* 默认勾选，但绝不静默发送：设置页写着「应用不会自动上报任何使用行为」，
   所以这里必须是一个用户看得见、能取消的选项，而不是点确定就顺手发出去。 */
const contribute = ref(true);

const KIND_FILTERS = computed(() => [
  { key: 'all', label: t.value.filterAll },
  { key: 'watch', label: t.value.filterWatch },
  { key: 'band', label: t.value.filterBand },
  { key: 'strap', label: t.value.filterStrap },
  { key: 'ring', label: t.value.filterRing },
  { key: 'earbuds', label: t.value.filterEarbuds },
]);

const kind = ref<string>('all');
const query = ref('');
const index = ref(0);

const entries = computed<DeviceCatalogEntry[]>(() => {
  const keyword = query.value.trim().toLocaleLowerCase();
  return deviceCatalog
    .filter((entry) => entry.status === 'active' && entry.supported)
    .filter((entry) => kind.value === 'all' || entry.kind === kind.value)
    .filter((entry) => !keyword
      || entry.canonical_name.toLocaleLowerCase().includes(keyword)
      || (entry.name_zh || '').toLocaleLowerCase().includes(keyword)
      || entry.aliases.some((alias) => alias.toLocaleLowerCase().includes(keyword)))
    .slice()
    .sort((a, b) => a.canonical_name.localeCompare(b.canonical_name));
});

const current = computed<DeviceCatalogEntry | null>(() => entries.value[index.value] ?? null);
const currentImage = computed(() => (current.value
  ? deviceImageFor(current.value.kind, current.value.image_key)
  : ''));

/** 前后各露出一点，翻的时候知道两边还有东西。 */
const neighbours = computed(() => {
  const list = entries.value;
  if (list.length < 2) return { prev: null, next: null };
  const prev = list[(index.value - 1 + list.length) % list.length];
  const next = list[(index.value + 1) % list.length];
  return {
    prev: prev ? { entry: prev, src: deviceImageFor(prev.kind, prev.image_key) } : null,
    next: next ? { entry: next, src: deviceImageFor(next.kind, next.image_key) } : null,
  };
});

const step = (delta: number) => {
  const total = entries.value.length;
  if (!total) return;
  index.value = (index.value + delta + total) % total;
};

/* 筛选变了就回到第一张，否则会停在一个已经被过滤掉的位置上。 */
watch([kind, query], () => { index.value = 0; });

/* 打开时先停在已经指认过的那台上，而不是从头翻。 */
watch(() => props.modelValue, (value) => {
  if (!value) return;
  const found = entries.value.findIndex((entry) => entry.catalog_id === value);
  if (found >= 0) index.value = found;
}, { immediate: true });

const isCurrentAssigned = computed(() => Boolean(
  current.value && props.modelValue && current.value.catalog_id === props.modelValue,
));

/* 目录里的中文名只在中文界面下用。英文界面下 name_zh 和 canonical_name
   会是同一个词或一个读不懂的中文名，两行都摆出来只是噪音。 */
const heroName = computed(() => (current.value
  ? (locale.value === 'zh' ? current.value.name_zh || current.value.canonical_name : current.value.canonical_name)
  : ''));
const heroSub = computed(() => (current.value && current.value.canonical_name !== heroName.value
  ? current.value.canonical_name
  : ''));
</script>

<template>
  <div
    class="device-picker"
    role="group"
    :aria-label="t.pickerAria"
    tabindex="0"
    @keydown.left.prevent="step(-1)"
    @keydown.right.prevent="step(1)"
  >
    <div class="picker-filters">
      <button
        v-for="filter in KIND_FILTERS"
        :key="filter.key"
        type="button"
        :class="['filter-chip', { on: kind === filter.key }]"
        :aria-pressed="kind === filter.key"
        @click="kind = filter.key"
      >{{ filter.label }}</button>
      <input
        v-model="query"
        type="search"
        class="picker-search"
        :aria-label="t.searchAria"
        :placeholder="t.searchPlaceholder"
      />
    </div>

    <div v-if="!entries.length" class="picker-empty">{{ t.empty }}</div>

    <div v-else class="picker-stage">
      <button
        class="picker-arrow"
        type="button"
        :aria-label="t.prev"
        :disabled="entries.length < 2"
        @click="step(-1)"
      ><DesignIcon name="chevron-right" :size="20" class="flip" /></button>

      <div class="picker-frame">
        <DeviceVisual
          v-if="neighbours.prev"
          class="peek left"
          :src="neighbours.prev.src"
          :alt="neighbours.prev.entry.canonical_name"
          :kind="neighbours.prev.entry.kind"
        />
        <div class="picker-hero">
          <!-- 目录里偶尔缺一张图。用 DeviceVisual 是为了走它的 SVG 兜底，
               而不是把一个破图图标和 alt 文字摆在用户面前。 -->
          <DeviceVisual
            :key="current!.catalog_id"
            class="hero-visual"
            :src="currentImage"
            :alt="current!.canonical_name"
            :kind="current!.kind"
          />
          <p class="hero-name">{{ heroName }}</p>
          <p v-if="heroSub" class="hero-sub">{{ heroSub }}</p>
          <p class="hero-count">{{ index + 1 }} / {{ entries.length }}</p>
        </div>
        <DeviceVisual
          v-if="neighbours.next"
          class="peek right"
          :src="neighbours.next.src"
          :alt="neighbours.next.entry.canonical_name"
          :kind="neighbours.next.entry.kind"
        />
      </div>

      <button
        class="picker-arrow"
        type="button"
        :aria-label="t.next"
        :disabled="entries.length < 2"
        @click="step(1)"
      ><DesignIcon name="chevron-right" :size="20" /></button>
    </div>

    <div class="picker-actions">
      <button
        class="button primary"
        type="button"
        :disabled="busy || !current || isCurrentAssigned"
        @click="current && emit('confirm', current.catalog_id, contribute)"
      >{{ isCurrentAssigned ? t.alreadyAssigned : t.confirm }}</button>
      <button v-if="modelValue" class="button secondary" type="button" :disabled="busy" @click="emit('clear')">
        {{ t.clear }}
      </button>
      <button class="button secondary" type="button" :disabled="busy" @click="emit('cancel')">{{ t.later }}</button>
    </div>
    <label class="picker-contribute">
      <input v-model="contribute" type="checkbox" :disabled="busy" />
      <span>
        <strong>{{ t.contributeTitle }}</strong>
        {{ t.contributeBody }}
      </span>
    </label>
    <p class="picker-note">{{ t.note }}</p>
  </div>
</template>

<style scoped>
.device-picker { display: grid; gap: 12px; outline: none; }
.device-picker:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; border-radius: 12px; }

.picker-filters { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.filter-chip {
  padding: 4px 12px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  font-size: 11px;
  cursor: pointer;
}
.filter-chip.on { border-color: var(--accent); color: var(--accent); }
.picker-search { flex: 1 1 160px; min-width: 140px; }

.picker-empty { padding: 24px 12px; color: var(--muted); font-size: 12px; text-align: center; }

.picker-stage { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 8px; }
.picker-arrow {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: transparent;
  color: var(--ink);
  cursor: pointer;
}
.picker-arrow:disabled { opacity: .35; cursor: default; }
.picker-arrow .flip { transform: rotate(180deg); }

.picker-frame {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  justify-items: center;
  gap: 4px;
  padding: 14px 6px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface-raised);
  overflow: hidden;
}
.peek { width: 56px; height: 56px; flex-basis: 56px; border: 0; background: transparent; opacity: .28; }
.peek.left { justify-self: end; }
.peek.right { justify-self: start; }

.picker-hero { display: grid; justify-items: center; gap: 2px; text-align: center; }
/* 主图给足高度：竖长的表身在正方框里会被上下切掉。 */
.picker-hero .hero-visual { width: 132px; height: 150px; flex-basis: 150px; border: 0; background: transparent; }
.hero-name { margin: 6px 0 0; color: var(--ink); font-size: 14px; font-weight: 500; }
.hero-sub { margin: 0; color: var(--subtle); font-size: 11px; }
.hero-count { margin: 4px 0 0; color: var(--muted); font-size: 11px; font-family: var(--font-mono); }

.picker-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.picker-contribute {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 8px;
  align-items: start;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface-raised);
  color: var(--subtle);
  font-size: 11px;
  line-height: 1.6;
  cursor: pointer;
}
.picker-contribute input { margin-top: 2px; }
.picker-contribute strong { display: block; margin-bottom: 2px; color: var(--ink); font-weight: 500; }
.picker-note { margin: 0; color: var(--subtle); font-size: 11px; line-height: 1.55; }

@media (prefers-reduced-motion: no-preference) {
  .picker-hero img { animation: picker-in 180ms ease-out; }
}
@keyframes picker-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: none; }
}
</style>
