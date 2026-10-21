<script setup lang="ts">
/**
 * 作者来信那张信纸：开头一个装饰首字母（中世纪抄本的做法），正文按段落，`**加粗**` 照旧；
 * 落款用手写体描一遍线再上墨。最后可以有一句本机算的「附：」（lib/letters/personal.ts），不发出去。
 */
import { computed } from 'vue';
import { emphasis } from '../../services/updateNotice';
import { leadParagraph, parseLetter } from '../../lib/letters/parse';
import PostageStamp from './PostageStamp.vue';

const props = defineProps<{ version: string; text: string; lang: string; head: string; postscript?: string | null; active: boolean }>();
const letter = computed(() => parseLetter(props.text));

/* 称呼照常写，首字母放在正文第一段：第一个看得见的字（跳过开头的加粗记号和引号）。 */
const leadIndex = computed(() => leadParagraph(letter.value.paragraphs));
const salutation = computed(() => letter.value.paragraphs.slice(0, leadIndex.value));
const opening = computed(() => {
  const first = letter.value.paragraphs[leadIndex.value] ?? '';
  const match = /^((?:\*\*)?["“「『(（]?)(\S)/u.exec(first);
  if (!match) return { initial: '', rest: first };
  const [, lead, initial] = match;
  return { initial: initial!, rest: lead! + first.slice(match[0].length) };
});
const body = computed(() => letter.value.paragraphs.slice(leadIndex.value + 1));
</script>

<template>
  <article class="letter-sheet paper" :lang="lang">
    <header class="sheet-head">
      <span class="sheet-kicker">{{ head }}</span>
      <PostageStamp :version="version" :width="46" :tilt="3" />
    </header>
    <p v-for="(line, index) in salutation" :key="`s${index}`" class="salutation">{{ line.replace(/\*\*/g, '') }}</p>
    <p v-if="letter.paragraphs.length" class="first">
      <span v-if="opening.initial" class="initial" aria-hidden="true">{{ opening.initial }}</span><span class="sr-only">{{ opening.initial }}</span><template v-for="(segment, part) in emphasis(opening.rest)" :key="part"><strong v-if="segment.strong">{{ segment.text }}</strong><template v-else>{{ segment.text }}</template></template>
    </p>
    <p v-for="(paragraph, index) in body" :key="index">
      <template v-for="(segment, part) in emphasis(paragraph)" :key="part"><strong v-if="segment.strong">{{ segment.text }}</strong><template v-else>{{ segment.text }}</template></template>
    </p>
    <p v-if="postscript" class="postscript">{{ postscript }}</p>
    <svg v-if="letter.signature" :class="['signature', { drawn: active }]" viewBox="0 0 320 64" role="img" :aria-label="letter.signature">
      <text x="316" y="46" text-anchor="end">{{ letter.signature }}</text>
    </svg>
  </article>
</template>

<style scoped>
.letter-sheet { position: relative; }
.sheet-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 18px; }
.sheet-kicker { padding-top: 6px; color: var(--paper-muted); font: 400 var(--fs-2xs)/1.4 var(--font-sans); letter-spacing: .14em; text-transform: uppercase; }
p { margin: 0 0 1em; font: 400 var(--fs-sm)/1.9 var(--paper-font); color: var(--paper-ink); }
p strong { font-weight: 700; }
.first { min-height: 3.6em; }
/* 装饰首字母：占三行高，带一点朱色，像抄本里的红字。 */
.initial {
  float: left; margin: .08em .14em 0 0; padding: 0 .06em; font: 700 3.35em/0.92 var(--paper-font);
  color: var(--paper-rubric); text-shadow: 1px 1px 0 color-mix(in srgb, var(--paper-rubric) 25%, transparent);
}
.postscript { margin-top: 1.4em; color: var(--paper-muted); font-style: italic; }
.signature { display: block; width: min(320px, 70%); height: auto; margin: .4em 0 0 auto; overflow: visible; }
.signature text {
  font: 400 34px/1 'Segoe Script', 'Snell Roundhand', 'Apple Chancery', 'KaiTi', 'STKaiti', 'Kaiti SC', Georgia, serif;
  fill: transparent; stroke: var(--paper-ink); stroke-width: .7; stroke-dasharray: 900; stroke-dashoffset: 900;
}
.signature.drawn text { animation: sign-stroke 1600ms 500ms cubic-bezier(.45, .1, .3, 1) forwards, sign-ink 500ms 1900ms ease forwards; }
@keyframes sign-stroke { to { stroke-dashoffset: 0; } }
@keyframes sign-ink { to { fill: var(--paper-ink); stroke-width: 0; } }
@media (prefers-reduced-motion: reduce) {
  .signature text, .signature.drawn text { animation: none; fill: var(--paper-ink); stroke-width: 0; }
}
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
