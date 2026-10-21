<script setup lang="ts">
/**
 * 「上期回音」那页：作者把上一版的回信归成几类，写明下版先修 / 推迟 / 继续征集。写在横线信纸上，每条占整行。
 * 「继续征集」的条目可以点「我也遇到」：只记下这一条的编号，合上信时和回信一起寄出（不算回信栏的快捷选项）。
 */
import { computed } from 'vue';
import { emphasis } from '../../services/updateNotice';
import { parseEcho, type EchoKind } from '../../lib/letters/parse';
import { useLetterText } from './letters.i18n';

const props = defineProps<{ text: string; lang: string; alsoHit: string[] }>();
const emit = defineEmits<{ (event: 'toggle', id: string): void }>();
const t = useLetterText();
const echo = computed(() => parseEcho(props.text));
const KINDS: EchoKind[] = ['next', 'later', 'asking'];
const groups = computed(() => KINDS
  .map((kind) => ({ kind, items: echo.value.items.filter((item) => item.kind === kind) }))
  .filter((group) => group.items.length));
const label = (kind: EchoKind) => (kind === 'next' ? t.value.echoNext : kind === 'later' ? t.value.echoLater : t.value.echoAsking);
</script>

<template>
  <div class="echo" :lang="lang">
    <p v-for="(line, index) in echo.intro" :key="`i${index}`">
      <template v-for="(segment, part) in emphasis(line)" :key="part"><strong v-if="segment.strong">{{ segment.text }}</strong><template v-else>{{ segment.text }}</template></template>
    </p>
    <section v-for="group in groups" :key="group.kind" :class="['echo-group', `is-${group.kind}`]">
      <h3><span class="echo-dot" aria-hidden="true"></span>{{ label(group.kind) }}</h3>
      <ul>
        <li v-for="item in group.items" :key="item.id">
          <span class="echo-text"><template v-for="(segment, part) in emphasis(item.text)" :key="part"><strong v-if="segment.strong">{{ segment.text }}</strong><template v-else>{{ segment.text }}</template></template></span>
          <button v-if="item.kind === 'asking'" type="button" :class="['me-too', { on: alsoHit.includes(item.id) }]"
            :aria-pressed="alsoHit.includes(item.id)" :title="t.alsoHitHint" @click="emit('toggle', item.id)">
            {{ alsoHit.includes(item.id) ? t.alsoHitOn : t.alsoHit }}
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.echo strong { font-weight: 700; }
/* 组与组、导语与第一组之间都空一行。 */
.echo-group { margin-top: var(--paper-line); }
.echo-group:first-child { margin-top: 0; }
.echo-group h3 { display: flex; align-items: center; gap: 8px; margin: 0; color: var(--paper-muted); font: 400 var(--fs-2xs) / var(--paper-line) var(--font-sans); letter-spacing: .08em; }
.echo-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); }
.is-later .echo-dot { background: var(--route-amber); }
.is-asking .echo-dot { background: var(--route-cyan); }
ul { margin: 0; padding: 0; list-style: none; }
li { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
/* 「我也遇到」比一行矮，底边正好落在这一行的横线上（像字一样站在线上），不把行撑高。 */
.me-too {
  flex: none; height: 22px; margin-top: calc(var(--paper-line) - 7px - 22px); padding: 0 12px; border: 1px solid color-mix(in srgb, var(--paper-ink) 24%, transparent); border-radius: 999px;
  background: transparent; color: var(--paper-ink); font: 400 var(--fs-2xs)/1 var(--font-sans); cursor: pointer; transition: background 160ms ease, border-color 160ms ease;
}
.me-too:hover { border-color: color-mix(in srgb, var(--paper-ink) 45%, transparent); }
.me-too.on { background: color-mix(in srgb, var(--paper-rubric) 14%, transparent); border-color: var(--paper-rubric); color: var(--paper-rubric); }
.me-too:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
