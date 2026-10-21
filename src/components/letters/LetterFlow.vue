<script setup lang="ts">
/**
 * 一封信排在横线信纸上，按页切开（批次 6，2026-10-21 用户：信要像信纸，不像卡片）。
 *
 * 做法：正文排进多栏布局，每栏正好一页宽、高度是行距的整数倍，溢出的栏往右排；第 page 页就是把整条往左平移 page 栏。
 * 每一页都是同一份正文的一个拷贝、平移量不同——翻页时上下两页同时在场，才能一张掀走、露出下一张。
 * 第 0 页量出总页数报给外面（ResizeObserver：窗口一变就重排重报）。
 *
 * 开头：一行信头（ZEPPBRIDGE 3.1.0）→ 称呼 → 正文第一段带两行高的朱色首字母 → 其余段落（中文段首空两格）
 * → 本机算的「附：」→ 落款（手写体描一遍线再上墨）。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { emphasis } from '../../services/updateNotice';
import { leadParagraph, parseLetter } from '../../lib/letters/parse';

const props = defineProps<{ text: string; lang: string; head: string; postscript?: string | null; page: number; active: boolean }>();
const emit = defineEmits<{ (event: 'pages', count: number): void }>();

const letter = computed(() => parseLetter(props.text));
const leadIndex = computed(() => leadParagraph(letter.value.paragraphs));
const salutation = computed(() => letter.value.paragraphs.slice(0, leadIndex.value));
const opening = computed(() => {
  const first = letter.value.paragraphs[leadIndex.value] ?? '';
  const match = /^((?:\*\*)?["“「『(（]?)(\S)/u.exec(first);
  if (!match) return { initial: '', rest: first };
  const [, prefix, initial] = match;
  return { initial: initial!, rest: prefix! + first.slice(match[0].length) };
});
const body = computed(() => letter.value.paragraphs.slice(leadIndex.value + 1));

const win = ref<HTMLElement | null>(null);
const flow = ref<HTMLElement | null>(null);
const box = ref({ width: 0, height: 0, gap: 48 });

const measure = async () => {
  const el = win.value;
  const inner = flow.value;
  if (!el || !inner) return;
  const line = parseFloat(getComputedStyle(inner).lineHeight) || 34;
  const width = Math.floor(el.clientWidth);
  const height = Math.max(line, Math.floor(el.clientHeight / line) * line);
  if (width === box.value.width && height === box.value.height) return;
  box.value = { ...box.value, width, height };
  if (props.page !== 0) return;
  await nextTick();
  const step = width + box.value.gap;
  emit('pages', Math.max(1, Math.round((inner.scrollWidth + box.value.gap) / step)));
};
let observer: ResizeObserver | null = null;
onMounted(() => {
  observer = new ResizeObserver(() => { void measure(); });
  if (win.value) observer.observe(win.value);
  void measure();
});
onBeforeUnmount(() => observer?.disconnect());
/* 换语言、换信：正文变了重量一次（尺寸没变也要量）。 */
watch(() => [props.text, props.postscript], async () => {
  box.value = { ...box.value, width: 0, height: 0 };
  await nextTick();
  void measure();
});

const flowStyle = computed(() => box.value.width ? {
  width: `${box.value.width}px`,
  height: `${box.value.height}px`,
  columnWidth: `${box.value.width}px`,
  columnGap: `${box.value.gap}px`,
  transform: `translateX(${-props.page * (box.value.width + box.value.gap)}px)`,
} : { visibility: 'hidden' as const });
</script>

<template>
  <div ref="win" class="flow-window paper-lines" :lang="lang">
    <div ref="flow" class="flow" :style="flowStyle">
      <p class="letterhead no-indent">{{ head }}</p>
      <p v-for="(line, index) in salutation" :key="`s${index}`" class="no-indent">{{ line.replace(/\*\*/g, '') }}</p>
      <p v-if="letter.paragraphs.length" class="first no-indent">
        <span v-if="opening.initial" class="initial" aria-hidden="true">{{ opening.initial }}</span><span class="sr-only">{{ opening.initial }}</span><template v-for="(segment, part) in emphasis(opening.rest)" :key="part"><strong v-if="segment.strong">{{ segment.text }}</strong><template v-else>{{ segment.text }}</template></template>
      </p>
      <p v-for="(paragraph, index) in body" :key="index">
        <template v-for="(segment, part) in emphasis(paragraph)" :key="part"><strong v-if="segment.strong">{{ segment.text }}</strong><template v-else>{{ segment.text }}</template></template>
      </p>
      <p v-if="postscript" class="postscript no-indent">{{ postscript }}</p>
      <svg v-if="letter.signature" :class="['signature', { drawn: active }]" viewBox="0 0 320 68" role="img" :aria-label="letter.signature">
        <text x="316" y="50" text-anchor="end">{{ letter.signature }}</text>
      </svg>
    </div>
  </div>
</template>

<style scoped>
.flow-window { position: relative; height: 100%; overflow: hidden; }
.flow { column-fill: auto; }
.flow strong { font-weight: 700; }
.letterhead { color: var(--paper-muted); font: 400 var(--fs-2xs) / var(--paper-line) var(--font-sans); letter-spacing: .16em; text-transform: uppercase; }
/* 首字母正好占两行，不打乱横线。 */
.initial {
  float: left; height: calc(var(--paper-line) * 2); margin: 0 .14em 0 0; padding: 0 .04em;
  font: 700 calc(var(--paper-line) * 1.62) / calc(var(--paper-line) * 2) var(--paper-font);
  color: var(--paper-rubric); text-shadow: 1px 1px 0 color-mix(in srgb, var(--paper-rubric) 22%, transparent);
}
/* 抬头日期后、「附：」前总空一行（中文段落之间不空行时也一样）。 */
.flow .letterhead { margin-bottom: var(--paper-line); }
.flow .postscript { margin-top: var(--paper-line); color: var(--paper-muted); font-style: italic; }
.signature { display: block; width: min(320px, 72%); height: calc(var(--paper-line) * 2); margin: 0 0 0 auto; overflow: visible; break-inside: avoid; }
.signature text {
  font: 400 36px/1 'Segoe Script', 'Snell Roundhand', 'Apple Chancery', 'KaiTi', 'STKaiti', 'Kaiti SC', Georgia, serif;
  fill: transparent; stroke: var(--paper-ink); stroke-width: .7; stroke-dasharray: 900; stroke-dashoffset: 900;
}
.signature.drawn text { animation: sign-stroke 1600ms 400ms cubic-bezier(.45, .1, .3, 1) forwards, sign-ink 500ms 1800ms ease forwards; }
@keyframes sign-stroke { to { stroke-dashoffset: 0; } }
@keyframes sign-ink { to { fill: var(--paper-ink); stroke-width: 0; } }
@media (prefers-reduced-motion: reduce) {
  .signature text, .signature.drawn text { animation: none; fill: var(--paper-ink); stroke-width: 0; }
}
:root[data-effects='lite'] .signature text { animation: none; fill: var(--paper-ink); stroke-width: 0; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
