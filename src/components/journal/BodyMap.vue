<script setup lang="ts">
/**
 * 人形图（批次 7 主观层）：正面 + 背面两个线描人形，点选酸痛 / 伤病的部位。
 *
 * 画法学达芬奇手稿：墨线勾轮廓、右侧一排斜向排线当阴影、头上一道十字构图线、旁边一根八头身比例尺，
 * 纸色底。不用照片、不用填色人体模型。颜色全走主题 token（墨色是 ink 和一点赭石调出来的），深浅两套都成立。
 *
 * 区域是椭圆热区：平时看不见，悬停描一圈虚线，选中是一块带排线的血色。键盘可以 Tab 到每个部位、空格切换。
 * `single` 时只能选一个（伤病记录），再点一次取消；`readonly` 时只显示。
 */
import { computed } from 'vue';
import { BODY_REGIONS, type BodyView } from '../../lib/logbook/body';
import { useBodyPartName, useBodyText } from './body.i18n';

const props = withDefaults(defineProps<{
  modelValue: string[];
  single?: boolean;
  readonly?: boolean;
  /** 只淡淡标出来、不算选中的部位（例如以前伤过的地方）。 */
  marked?: string[];
  /** 下面那排已选部位的胶囊。 */
  showList?: boolean;
}>(), { single: false, readonly: false, marked: () => [], showList: true });
const emit = defineEmits<{ (event: 'update:modelValue', value: string[]): void }>();

const t = useBodyText();
const partName = useBodyPartName();
const uid = `bm-${Math.random().toString(36).slice(2, 8)}`;
const views: BodyView[] = ['front', 'back'];
const selected = computed(() => new Set(props.modelValue));
const marked = computed(() => new Set(props.marked));

function toggle(part: string) {
  if (props.readonly) return;
  const has = selected.value.has(part);
  if (props.single) emit('update:modelValue', has ? [] : [part]);
  else emit('update:modelValue', has ? props.modelValue.filter(p => p !== part) : [...props.modelValue, part]);
}
function onKey(event: KeyboardEvent, part: string) {
  if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); toggle(part); }
}

/* 半边轮廓（看的人右手边），另一半按中线镜像。手臂和躯干分两笔，腋下不封口。 */
const ARM = 'M65 31C65 36 66 40 68 42C74 45 82 45 88 48C94 51 96 58 95 66C95 80 97 92 98 100C99 112 100 124 101 136C102 142 103 150 99 156C96 159 93 156 93 150C92 142 92 138 92 134C90 120 89 110 88 100C87 88 85 75 82 66';
const TRUNK = 'M81 66C80 80 77 92 76 104C76 114 80 124 81 134C83 150 82 175 79 198C78 206 78 212 79 220C81 236 78 252 74 264C76 272 80 278 79 283C76 287 67 287 64 284C64 278 65 272 65 266C64 254 63 236 64 220C64 212 64 206 64 200C63 180 62 160 60 146';
/* 细节线：正面锁骨、胸线、腹白线、肚脐、髌骨；背面肩胛、臀线、腘窝、小腿肚两头（脊柱单独画成一节一节的）。 */
const DETAIL: Record<BodyView, string> = {
  front: 'M62 47C68 49 76 49 84 50M61 66C66 74 74 76 80 72M60 80L60 124M59 104A1.4 1.4 0 1 0 61.8 104M70 200C67 203 67 208 70 210C73 208 73 203 70 200M66 128C68 134 72 138 76 140',
  back: 'M68 58C72 66 78 70 80 64M65 84C70 82 74 84 76 88M61 148C66 152 74 152 79 148M66 212C69 214 73 214 76 212M68 222C70 232 70 240 69 246M76 224C77 232 76 238 74 244',
};
/* 一眼分出正反面（用户 2026-10-22：「正面和背面太相近了」）——两面轮廓本来一样，差别要靠这些「朝向」的线索：
   正面有五官、拇指朝外、脚趾朝前；背面是后脑的头发（排线）、发际与后颈、一节一节的脊柱、指节、脚跟。
   画在看的人右半边，另一半按中线镜像（五官、头发本身就是对称画全的）。 */
const FACING: Record<BodyView, { whole: string; half: string }> = {
  front: {
    whole: 'M55.5 18Q57 16.8 58.5 18M61.5 18Q63 16.8 64.5 18M60 19.5V23.5Q59 24.6 60.2 24.8M57.6 27.6Q60 29 62.4 27.6',
    half: 'M100.5 140C102.6 143 102.6 147 100.6 150M66.5 284.6Q67.6 286.8 69.2 285.2M69.6 285.4Q71.2 287.4 72.8 285.6M73.2 285.6Q74.8 287.2 76.2 285.2',
  },
  back: {
    whole: 'M50.2 23C48.6 12 53.8 6.4 60 6.2C66.2 6.4 71.4 12 69.8 23M51.6 27.4C55.6 30 64.4 30 68.4 27.4',
    half: 'M94.2 149.6Q96.6 150.8 99.2 149.6M66 278.6C67.4 283.6 74.6 283.8 77.4 279',
  },
};
/* 后脑的头发：头顶到发际一排竖着的短排线。 */
const HAIR = Array.from({ length: 9 }, (_, i) => {
  const x = 52 + i * 2;
  const top = 19 - Math.sqrt(Math.max(0, 1 - ((x - 60) / 10.5) ** 2)) * 12;
  return `M${x} ${(top + 1.6).toFixed(1)}V${(25 - Math.abs(x - 60) * 0.25).toFixed(1)}`;
}).join('');
/* 耳朵：两面都有，正面和背面只是露出的那一侧不同。 */
const EAR = 'M70.6 15.6C73 16.2 73 21.6 70.6 22.6';
/* 排线阴影只在右半边（光从左上来），按轮廓边缘的走向排一列短斜线；背面转了个身，阴影落在另一边。 */
const hatch = (from: number, to: number, edge: (y: number) => number, step = 5) => {
  let d = '';
  for (let y = from; y <= to; y += step) { const x = edge(y); d += `M${(x - 6).toFixed(1)} ${y + 3}L${(x - 1.5).toFixed(1)} ${y - 1.5}`; }
  return d;
};
const lerp = (y: number, y0: number, x0: number, y1: number, x1: number) => x0 + ((x1 - x0) * (y - y0)) / (y1 - y0);
const HATCH = hatch(72, 128, y => (y < 104 ? lerp(y, 66, 81, 104, 76) : lerp(y, 104, 76, 134, 81)))
  + hatch(142, 192, y => lerp(y, 134, 82, 198, 79))
  + hatch(226, 256, y => lerp(y, 220, 80, 264, 75), 6);
/* 八头身比例尺：头顶 6 到脚底 288，八等分。 */
const RULER = Array.from({ length: 9 }, (_, i) => 6 + (282 / 8) * i);
</script>

<template>
  <div class="body-map" :class="{ readonly }">
    <div class="figures">
      <figure v-for="view in views" :key="view" :class="['figure', `is-${view}`]">
        <svg viewBox="0 0 120 300" role="group" :aria-label="`${t.figure} · ${view === 'front' ? t.front : t.back}`">
          <defs>
            <pattern :id="`${uid}-sel`" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)">
              <rect width="3" height="3" class="sel-wash" />
              <path d="M0 0V3" class="sel-line" />
            </pattern>
          </defs>
          <path class="ruler" :d="`M4 6V288${RULER.map(y => `M2 ${y}H6`).join('')}`" />
          <g class="ink">
            <ellipse cx="60" cy="19" rx="10.5" ry="13" />
            <path v-if="view === 'front'" class="construct" d="M60 3V35M48 19H72" />
            <path :d="ARM" /><path :d="TRUNK" />
            <g transform="translate(120 0) scale(-1 1)"><path :d="ARM" /><path :d="TRUNK" /><path class="detail" :d="EAR" /></g>
            <path class="detail" :d="EAR" />
            <path class="detail" :d="DETAIL[view]" />
            <path class="facing" :d="FACING[view].whole" />
            <path class="facing" :d="FACING[view].half" />
            <path class="facing" :d="FACING[view].half" transform="translate(120 0) scale(-1 1)" />
            <template v-if="view === 'back'">
              <path class="hair" :d="HAIR" />
              <path class="spine" d="M60 31V128" />
            </template>
            <path class="hatch" :d="HATCH" :transform="view === 'back' ? 'translate(120 0) scale(-1 1)' : undefined" />
          </g>
          <ellipse
            v-for="region in BODY_REGIONS.filter(r => r.view === view)"
            :key="`${view}-${region.part}`"
            class="region"
            :class="{ on: selected.has(region.part), marked: marked.has(region.part) }"
            :cx="region.cx" :cy="region.cy" :rx="region.rx" :ry="region.ry"
            :style="selected.has(region.part) ? { fill: `url(#${uid}-sel)` } : undefined"
            :role="readonly ? undefined : 'checkbox'"
            :aria-checked="readonly ? undefined : selected.has(region.part)"
            :aria-label="partName(region.part)"
            :tabindex="readonly ? undefined : 0"
            @click="toggle(region.part)"
            @keydown="onKey($event, region.part)"
          ><title>{{ partName(region.part) }}</title></ellipse>
        </svg>
        <figcaption>{{ view === 'front' ? t.front : t.back }}</figcaption>
      </figure>
    </div>
    <div v-if="showList" class="picked" aria-live="polite">
      <template v-if="modelValue.length">
        <button v-for="part in modelValue" :key="part" type="button" class="chip" :disabled="readonly" @click="toggle(part)">
          {{ partName(part) }}<span v-if="!readonly" aria-hidden="true">×</span>
        </button>
        <button v-if="!readonly && !single && modelValue.length > 1" type="button" class="clear" @click="emit('update:modelValue', [])">{{ t.clear }}</button>
      </template>
      <span v-else class="none">{{ t.none }}</span>
    </div>
  </div>
</template>

<style scoped>
.body-map {
  /* 墨：正文色里调一点赭石；纸：凹槽色里调一点羊皮纸。深色主题下就是深纸浅墨。 */
  --bm-ink: color-mix(in srgb, var(--ink) 62%, #a0703c);
  --bm-paper: color-mix(in srgb, var(--mat-inset) 90%, #c9a46b);
  display: grid; gap: 10px; min-width: 0;
}
/* 两个人形各占一块纸，背面那块暗一点（转过身去、背着光），标签做成小签条：不用细看线条也知道哪面是哪面。 */
.figures { display: flex; justify-content: center; gap: 10px; padding: 10px; border-radius: 18px; background: var(--bm-paper); box-shadow: var(--cap-track-shadow); }
.figure { display: grid; justify-items: center; gap: 6px; margin: 0; padding: 10px 6px 8px; flex: 1 1 0; max-width: 200px; border-radius: 14px; }
.figure.is-front { background: color-mix(in srgb, #fff 4%, transparent); }
.figure.is-back { background: color-mix(in srgb, #000 14%, transparent); }
.figure svg { display: block; width: 100%; height: auto; overflow: visible; }
.figure figcaption { padding: 2px 10px; border-radius: 999px; background: color-mix(in srgb, var(--bm-ink) 12%, transparent); color: var(--muted); font-size: var(--fs-xs); font-weight: 600; letter-spacing: .08em; }
.ink { fill: none; stroke: var(--bm-ink); stroke-width: .9; stroke-linecap: round; stroke-linejoin: round; }
.ink .detail { stroke-width: .55; opacity: .75; }
.ink .hatch { stroke-width: .4; opacity: .55; }
.ink .facing { stroke-width: .6; opacity: .9; }
.ink .hair { stroke-width: .45; opacity: .7; }
.ink .spine { stroke-width: 1.1; opacity: .7; stroke-dasharray: 2.2 1.6; }
.ink .construct { stroke-width: .35; opacity: .45; stroke-dasharray: 1.5 2; }
.ruler { fill: none; stroke: var(--bm-ink); stroke-width: .4; opacity: .4; }
.region { fill: transparent; stroke: transparent; stroke-width: .8; cursor: pointer; outline: none; transition: fill .18s ease, stroke .18s ease; }
.readonly .region { cursor: default; }
.region.marked { fill: color-mix(in srgb, var(--warning) 34%, transparent); stroke: color-mix(in srgb, var(--warning) 60%, transparent); stroke-dasharray: 1.2 1.6; }
.body-map:not(.readonly) .region:hover, .region:focus-visible { stroke: var(--bm-ink); stroke-dasharray: 1.6 1.4; }
.region:focus-visible { stroke: var(--focus); stroke-width: 1.2; }
.body-map .region.on { stroke: var(--heart); stroke-width: 1; stroke-dasharray: none; }
.sel-wash { fill: color-mix(in srgb, var(--heart) 30%, transparent); }
.sel-line { stroke: var(--heart); stroke-width: .9; opacity: .8; }
.picked { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-height: 28px; }
.chip { display: inline-flex; align-items: center; gap: 6px; min-height: 26px; padding: 0 10px; border: 0; border-radius: 999px;
  background: color-mix(in srgb, var(--heart) 16%, transparent); color: var(--ink); font: inherit; font-size: var(--fs-xs); cursor: pointer; }
.chip:disabled { cursor: default; }
.chip span { color: var(--muted); }
.clear { padding: 2px 6px; border: 0; background: transparent; color: var(--muted); font: inherit; font-size: var(--fs-xs); cursor: pointer; }
.clear:hover { color: var(--ink); }
.none { color: var(--subtle); font-size: var(--fs-xs); }
@media (prefers-reduced-motion: reduce) { .region { transition: none; } }
</style>
