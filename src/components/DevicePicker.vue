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
import { paced } from '../lib/motion/timing';
import { lessMotion } from '../lib/motion/lessMotion';
import GlyphTile from './GlyphTile.vue';
import CapsuleWheel from './CapsuleWheel.vue';
import DeviceVisual from './DeviceVisual.vue';
import { catalogEntryMatchesId, deviceCatalog, deviceImageFor, type DeviceCatalogEntry } from '../lib/deviceCatalog';
import { defineMessages, isChineseLocale, locale, useMessages } from '../i18n';

const messages = defineMessages(
  {
    pickerAria: '手动指认设备型号',
    searchAria: '按型号名称搜索',
    searchPlaceholder: '搜型号，例如 Balance 2',
    empty: '没有匹配型号。换个关键词，或把筛选切回「全部」。',
    prev: '上一个型号',
    next: '下一个型号',
    alreadyAssigned: '已经是这台了',
    confirm: '这就是我的设备',
    clear: '撤销指认',
    later: '稍后再说',
    pickPrompt: '左右翻，或搜一下型号',
    note: '选完会标注为「你指认的型号」，不当作自动识别结果。指认只存在这台电脑上；图片和型号来自随包目录，翻页全程不联网。',
    filterAll: '全部',
    filterWatch: '手表',
    filterBand: '手环',
    filterStrap: '表带',
    filterRing: '戒指',
    filterEarbuds: '耳机',
    filterScale: '体脂秤',
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
    clear: 'Undo pick',
    later: 'Not now',
    pickPrompt: 'Flip through, or search for your model',
    note: 'Your pick is labeled "model you picked", never as an automatic match. It stays on this computer; images and names come from the bundled catalog, and browsing uses no network.',
    filterAll: 'All',
    filterWatch: 'Watches',
    filterBand: 'Bands',
    filterStrap: 'Straps',
    filterRing: 'Rings',
    filterEarbuds: 'Earbuds',
    filterScale: 'Scales',
  },
  {
    pickerAria: 'Elige a mano el modelo de tu dispositivo',
    searchAria: 'Buscar por nombre de modelo',
    searchPlaceholder: 'Busca un modelo, p. ej. Balance 2',
    empty: 'Ningún modelo coincide. Prueba otra palabra, o vuelve a poner el filtro en «Todos».',
    prev: 'Modelo anterior',
    next: 'Modelo siguiente',
    alreadyAssigned: 'Ya es este',
    confirm: 'Este es mi dispositivo',
    clear: 'Retirar la elección',
    later: 'Ahora no',
    pickPrompt: 'Pasa los modelos o busca el tuyo',
    note: 'Tu elección queda marcada como «Modelo que elegiste», no como coincidencia automática. Se guarda solo en este equipo; las imágenes y los modelos vienen del catálogo incluido y explorarlos no usa la red.',
    filterAll: 'Todos',
    filterWatch: 'Relojes',
    filterBand: 'Pulseras',
    filterStrap: 'Correas',
    filterRing: 'Anillos',
    filterEarbuds: 'Audífonos',
    filterScale: 'Básculas',
  },
  'components/DevicePicker',
);
const t = useMessages(messages);

const props = defineProps<{
  /** 当前已指认的 catalog_id（如果有）。 */
  modelValue?: string | null;
  busy?: boolean;
}>();
const emit = defineEmits<{
  (event: 'confirm', catalogId: string): void;
  (event: 'clear'): void;
  (event: 'cancel'): void;
}>();

const KIND_FILTERS = computed(() => [
  { key: 'all', label: t.value.filterAll },
  { key: 'watch', label: t.value.filterWatch },
  { key: 'band', label: t.value.filterBand },
  { key: 'strap', label: t.value.filterStrap },
  { key: 'ring', label: t.value.filterRing },
  { key: 'earbuds', label: t.value.filterEarbuds },
  { key: 'scale', label: t.value.filterScale },
]);

const kind = ref<string>('all');
const query = ref('');
/* -1 = 还没选。以前一打开就停在排序后的第一款（Active 2 44mm），有人没翻就点了确认，
   反馈库里那款表因此多了一串张冠李戴的指认（3.1.1 起不上报了，但本机的名字照样会错）。 */
const index = ref(-1);

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

const current = computed<DeviceCatalogEntry | null>(() => (index.value >= 0 ? entries.value[index.value] ?? null : null));
const currentImage = computed(() => (current.value
  ? deviceImageFor(current.value.kind, current.value.image_key)
  : ''));

/** 前后各露出一点，翻的时候知道两边还有东西。 */
const neighbours = computed(() => {
  const list = entries.value;
  if (list.length < 2) return { prev: null, next: null };
  const at = Math.max(index.value, 0);
  const prev = list[(at - 1 + list.length) % list.length];
  const next = list[(index.value + 1) % list.length];
  return {
    prev: prev ? { entry: prev, src: deviceImageFor(prev.kind, prev.image_key) } : null,
    next: next ? { entry: next, src: deviceImageFor(next.kind, next.image_key) } : null,
  };
});

/* 这一次换型号是往哪边翻：1 = 下一个（新的从右边进），-1 = 上一个，0 = 搜索 / 筛选 / 打开时停到已指认的那台
   （原地淡入，没有方向可言）。 */
const dir = ref(0);

const step = (delta: number) => {
  const total = entries.value.length;
  if (!total) return;
  dir.value = delta > 0 ? 1 : -1;
  if (index.value < 0) {
    index.value = delta > 0 ? 0 : total - 1;
    return;
  }
  index.value = (index.value + delta + total) % total;
};

/* 筛选变了就回到「还没选」，否则会停在一个已经被过滤掉的位置上；搜了关键词就直接停在第一个结果。 */
watch([kind, query], () => { dir.value = 0; index.value = query.value.trim() ? 0 : -1; });

/* 打开时先停在已经指认过的那台上，而不是从头翻。 */
watch(() => props.modelValue, (value) => {
  if (!value) return;
  const found = entries.value.findIndex((entry) => catalogEntryMatchesId(entry, value));
  if (found >= 0) { dir.value = 0; index.value = found; }
}, { immediate: true });

/* 左右两张先在后台解码好：产品图最大 900px，以前翻到哪张才在那一帧同步解码，翻页会顿一下。 */
const decoded = new Set<string>();
watch(() => [neighbours.value.prev?.src, neighbours.value.next?.src], (sources) => {
  for (const src of sources) {
    if (!src || decoded.has(src)) continue;
    decoded.add(src);
    const image = new Image();
    image.src = src;
    image.decode().catch(() => decoded.delete(src));
  }
}, { immediate: true });

/* 翻页：旧的一张往反方向滑走淡掉，新的一张从翻的方向滑进来；两张叠在同一格里，框的大小不变。
   先后交接、不交叉：旧的那张差不多淡完了新的才开始显（字在同一个位置，同时半透明就是叠影）。
   只动 transform / opacity。连点时正在进场的那张从它此刻的样子退场，不先跳回原位。 */
const SLIDE_PX = 44;
const PEEK_PX = 16;
const shiftOf = (el: Element) => (el.classList.contains('peek') ? PEEK_PX : SLIDE_PX);
const slideIn = (el: Element, done: () => void) => {
  if (lessMotion()) { done(); return; }
  const d = dir.value;
  const move = d ? `translateX(${d * shiftOf(el)}px)` : 'scale(.95)';
  const animation = (el as HTMLElement).animate(
    [{ opacity: 0, transform: move }, { opacity: 1, transform: 'none' }],
    { duration: paced(320), delay: paced(165), easing: 'cubic-bezier(.2, .7, .2, 1)', fill: 'backwards' },
  );
  animation.onfinish = () => done();
  animation.oncancel = () => done();
};
const slideOut = (el: Element, done: () => void) => {
  const node = el as HTMLElement;
  if (lessMotion()) { done(); return; }
  const style = getComputedStyle(node);
  const from = { opacity: style.opacity, transform: style.transform };
  for (const running of node.getAnimations()) running.cancel();
  const d = dir.value;
  const move = d ? `translateX(${-d * shiftOf(el)}px)` : 'scale(1.03)';
  const animation = node.animate(
    [from, { opacity: 0, transform: move }],
    { duration: paced(170), easing: 'cubic-bezier(.4, 0, .6, 1)', fill: 'forwards' },
  );
  animation.onfinish = () => done();
  animation.oncancel = () => done();
};

const isCurrentAssigned = computed(() => Boolean(
  current.value && catalogEntryMatchesId(current.value, props.modelValue),
));

const onPickerKeydown = (event: KeyboardEvent) => {
  const target = event.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
    return;
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    step(-1);
  } else if (event.key === 'ArrowRight') {
    event.preventDefault();
    step(1);
  }
};

/* 目录里的中文名只在中文界面下用。英文界面下 name_zh 和 canonical_name
   会是同一个词或一个读不懂的中文名，两行都摆出来只是噪音。 */
const heroName = computed(() => (current.value
  ? (isChineseLocale(locale.value) ? current.value.name_zh || current.value.canonical_name : current.value.canonical_name)
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
    @keydown="onPickerKeydown"
  >
    <div class="picker-filters">
      <!-- 六种设备类型：玻璃滚轮（审计 A1，2026-10-07；以前是一排自己画选中态的小胶囊）。 -->
      <CapsuleWheel v-model="kind" :span="260" :items="KIND_FILTERS.map((filter) => ({ value: filter.key, label: filter.label }))" :aria-label="t.pickerAria" />
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
        :disabled="entries.length < 2 && current !== null"
        @click="step(-1)"
      ><GlyphTile name="chevron-right" :size="20" class="flip" /></button>

      <div class="picker-frame">
        <Transition :css="false" @enter="slideIn" @leave="slideOut">
          <DeviceVisual
            v-if="neighbours.prev?.src"
            :key="neighbours.prev.entry.catalog_id"
            class="peek left"
            :src="neighbours.prev.src"
            :alt="neighbours.prev.entry.canonical_name"
            :kind="neighbours.prev.entry.kind"
          />
        </Transition>
        <div class="picker-hero">
          <div class="hero-slides">
            <Transition :css="false" @enter="slideIn" @leave="slideOut">
              <div :key="current?.catalog_id ?? '-'" class="hero-slide">
                <!-- 图位固定大小：没有产品图的型号（或图没加载出来）留一个虚线空位，框不跟着塌。 -->
                <span class="hero-spot">
                  <DeviceVisual v-if="currentImage" class="hero-visual" :src="currentImage" :alt="current!.canonical_name" :kind="current!.kind" />
                  <span v-else class="hero-blank" aria-hidden="true"></span>
                </span>
                <p v-if="current" class="hero-name">{{ heroName }}</p>
                <p v-else class="hero-name hero-prompt">{{ t.pickPrompt }}</p>
                <!-- 副标题那一行一直占着：有的型号有、有的没有，以前翻页时框高一下矮一下。 -->
                <p class="hero-sub">{{ heroSub }}</p>
              </div>
            </Transition>
          </div>
          <p class="hero-count">{{ current ? index + 1 : '—' }} / {{ entries.length }}</p>
        </div>
        <Transition :css="false" @enter="slideIn" @leave="slideOut">
          <DeviceVisual
            v-if="neighbours.next?.src"
            :key="neighbours.next.entry.catalog_id"
            class="peek right"
            :src="neighbours.next.src"
            :alt="neighbours.next.entry.canonical_name"
            :kind="neighbours.next.entry.kind"
          />
        </Transition>
      </div>

      <button
        class="picker-arrow"
        type="button"
        :aria-label="t.next"
        :disabled="entries.length < 2 && current !== null"
        @click="step(1)"
      ><GlyphTile name="chevron-right" :size="20" /></button>
    </div>

    <div class="picker-actions">
      <button
        class="button primary"
        type="button"
        :disabled="busy || !current || isCurrentAssigned"
        @click="current && emit('confirm', current.catalog_id)"
      >{{ isCurrentAssigned ? t.alreadyAssigned : t.confirm }}</button>
      <button v-if="modelValue" class="button secondary" type="button" :disabled="busy" @click="emit('clear')">
        {{ t.clear }}
      </button>
      <button class="button secondary" type="button" :disabled="busy" @click="emit('cancel')">{{ t.later }}</button>
    </div>
    <p class="picker-note">{{ t.note }}</p>
  </div>
</template>

<style scoped>
.device-picker { display: grid; gap: 12px; outline: none; }
.device-picker:focus-visible { outline: 2px solid var(--focus); outline-offset: 4px; border-radius: 12px; }

.picker-filters { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.picker-search { flex: 1 1 190px; min-width: 140px; min-height: 40px; padding: 8px 12px; border: 1px solid var(--line-control); border-radius: var(--radius-sm); background: var(--mat-inset); color: var(--ink); outline: none; box-shadow: var(--mat-inset-shadow); }
.picker-search:focus-visible { border-color: var(--focus); }

.picker-empty { padding: 24px 12px; color: var(--muted); font-size: var(--fs-sm); text-align: center; }

.picker-stage { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 8px; }
.picker-arrow {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid var(--line-control);
  border-radius: 50%;
  background: transparent;
  color: var(--ink);
  cursor: pointer;
}
.picker-arrow:disabled { opacity: .35; cursor: default; }
.picker-arrow .flip { transform: rotate(180deg); }

.picker-frame {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, auto) minmax(0, 1fr);
  align-items: center;
  justify-items: center;
  gap: 4px;
  padding: 14px 6px;
  border: 1px solid var(--mat-line);
  border-radius: 14px;
  background: var(--mat-inset);
  overflow: hidden; box-shadow: var(--mat-inset-shadow);
}
.peek { width: 56px; height: 56px; flex-basis: 56px; border: 0; background: transparent; box-shadow: none; opacity: .28; }
.peek.left { grid-column: 1; grid-row: 1; justify-self: end; }
.peek.right { grid-column: 3; grid-row: 1; justify-self: start; }
/* 两边露出的小图是装饰，翻页途中别挡住点击。 */
.peek { pointer-events: none; }

.picker-hero { grid-column: 2; grid-row: 1; display: grid; justify-items: center; gap: 2px; min-width: 0; text-align: center; }
/* 进场和退场的两张叠在同一格里。 */
.hero-slides { display: grid; justify-items: center; min-width: 0; }
.hero-slide { grid-area: 1 / 1; display: grid; justify-items: center; gap: 2px; min-width: 0; }
/* 主图给足高度：竖长的表身在正方框里会被上下切掉。 */
.hero-spot { display: grid; place-items: center; width: 132px; height: 150px; }
.picker-hero .hero-visual { width: 132px; height: 150px; flex-basis: 150px; border: 0; background: transparent; box-shadow: none; }
.hero-blank { width: 84px; height: 104px; border: 1.5px dashed var(--mat-line); border-radius: 24px; }
.hero-name { margin: 6px 0 0; color: var(--ink); font-size: var(--fs-lg); font-weight: 600; }
.hero-sub { min-height: 1.5em; margin: 0; color: var(--subtle); font-size: var(--fs-xs); line-height: 1.5; }
.hero-count { margin: 4px 0 0; color: var(--muted); font-size: var(--fs-xs); font-family: var(--font-mono); }

.picker-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.hero-prompt { color: var(--subtle); font-weight: 500; }
.picker-note { margin: 0; color: var(--subtle); font-size: var(--fs-xs); line-height: 1.55; }
</style>
