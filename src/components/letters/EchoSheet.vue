<script setup lang="ts">
/**
 * 「上期回音」那页：作者把上一版的回信归成几类，写明下版先修 / 推迟。写在横线信纸上，每条占整行。
 * 「继续征集」那一组和「我也遇到」不再画（2026-10-21 用户：没什么意义）；回音里写了 asking 的条目直接略过。
 */
import { computed } from 'vue';
import { emphasis } from '../../services/updateNotice';
import { parseEcho, type EchoKind } from '../../lib/letters/parse';
import { useLetterText } from './letters.i18n';

const props = defineProps<{ text: string; lang: string }>();
const t = useLetterText();
const echo = computed(() => parseEcho(props.text));
const KINDS: EchoKind[] = ['next', 'later'];
const groups = computed(() => KINDS
  .map((kind) => ({ kind, items: echo.value.items.filter((item) => item.kind === kind) }))
  .filter((group) => group.items.length));
const label = (kind: EchoKind) => (kind === 'next' ? t.value.echoNext : t.value.echoLater);
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
          <template v-for="(segment, part) in emphasis(item.text)" :key="part"><strong v-if="segment.strong">{{ segment.text }}</strong><template v-else>{{ segment.text }}</template></template>
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
ul { margin: 0; padding: 0; list-style: none; }
</style>
