<script setup lang="ts">
/**
 * 点了应用里的「交给 ChatGPT」之后，页面上演的那一小段：.md 文件落进对话框，你的问题和一段示例回答逐字打出来。
 *
 * 真应用在演示里不会写文件、不会打开网站（见 demo/runtime.ts），只是通知外层；这一层负责把
 * 「然后呢」演给访客看。不带任何厂商标识，就是一个通用的对话窗口，回答是示例，页面上写明。
 */
import { onBeforeUnmount, ref, watch } from 'vue';
import LandingIcon from './LandingIcon.vue';
import { prefersReducedMotion, sleep, typeInto } from './motion';
import type { LandingCopy } from './types';

const props = defineProps<{ open: boolean; copy: LandingCopy['handoff']; sample: string }>();
const emit = defineEmits<{ close: [] }>();

const phase = ref<'idle' | 'file' | 'asked' | 'answering' | 'done'>('idle');
const asked = ref('');
const answer = ref('');
let run = 0;

const play = async () => {
  const mine = ++run;
  const alive = () => mine === run && props.open;
  phase.value = 'idle';
  asked.value = '';
  answer.value = '';
  if (prefersReducedMotion()) {
    phase.value = 'done';
    asked.value = props.copy.prompt;
    answer.value = props.copy.answer;
    return;
  }
  await sleep(420);
  if (!alive()) return;
  phase.value = 'file';
  await sleep(1000);
  if (!alive()) return;
  phase.value = 'asked';
  if (!(await typeInto(asked, props.copy.prompt, alive, 22))) return;
  await sleep(380);
  if (!alive()) return;
  phase.value = 'answering';
  if (!(await typeInto(answer, props.copy.answer, alive))) return;
  phase.value = 'done';
};

watch(() => props.open, (value) => {
  if (value) void play();
  else { run += 1; phase.value = 'idle'; }
}, { immediate: true });
onBeforeUnmount(() => { run += 1; });
</script>

<template>
  <Transition name="chat">
    <section v-if="open" class="chat" role="dialog" :aria-label="copy.chat">
      <header>
        <span class="logo"><LandingIcon name="sparkle" :size="16" /></span>
        <b>{{ copy.chat }}</b>
        <span class="lp-sample">{{ sample }}</span>
        <button type="button" class="close" :aria-label="copy.close" @click="emit('close')"><LandingIcon name="x" :size="16" /></button>
      </header>

      <div class="thread">
        <div v-if="phase !== 'idle' && phase !== 'file'" class="msg me">
          <span class="who">{{ copy.you }}</span>
          <p>
            <span class="file"><LandingIcon name="file" :size="15" />{{ copy.file }}</span>
            {{ asked }}<i v-if="phase === 'asked'" class="caret"></i>
          </p>
        </div>
        <div v-if="phase === 'answering' || phase === 'done'" class="msg ai">
          <span class="who">AI</span>
          <p>{{ answer }}<i v-if="phase === 'answering'" class="caret"></i></p>
        </div>
        <p v-if="phase === 'done'" class="note">{{ copy.note }}</p>
      </div>

      <footer>
        <div :class="['input', { drop: phase === 'file' }]">
          <span v-if="phase === 'file'" class="file flying"><LandingIcon name="file" :size="15" />{{ copy.file }}</span>
        </div>
      </footer>
    </section>
  </Transition>
</template>

<style scoped>
.chat {
  position: absolute;
  inset: 18px;
  z-index: 6;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  overflow: hidden;
  border: 1px solid var(--lp-line-2);
  border-radius: 20px;
  background: color-mix(in srgb, var(--lp-panel) 94%, transparent);
  box-shadow: 0 40px 80px -30px rgba(0, 0, 0, .55);
  -webkit-backdrop-filter: blur(16px);
  backdrop-filter: blur(16px);
}
header { display: flex; align-items: center; gap: 10px; padding: 12px 14px 12px 16px; border-bottom: 1px solid var(--lp-line); font-size: 14px; }
.logo { display: grid; width: 26px; height: 26px; place-items: center; border-radius: 9px; background: var(--lp-green); color: var(--lp-green-ink); }
header .lp-sample { margin-left: 6px; }
.close { display: grid; width: 32px; height: 32px; margin-left: auto; place-items: center; border: 0; border-radius: 50%; background: transparent; color: var(--lp-muted); cursor: pointer; }
.close:hover { background: var(--lp-line); color: var(--lp-ink); }
.thread { display: grid; align-content: start; gap: 16px; padding: 20px 22px; overflow: hidden; }
.msg { display: grid; gap: 6px; max-width: 86%; }
.msg.me { justify-self: end; }
.who { color: var(--lp-subtle); font-family: var(--font-mono); font-size: 11px; letter-spacing: .1em; text-transform: uppercase; }
.msg.me .who { text-align: right; }
.msg p { margin: 0; padding: 12px 16px; border-radius: 18px; font-size: 14.5px; line-height: 1.65; }
.msg.me p { border-bottom-right-radius: 6px; background: var(--lp-green); color: var(--lp-green-ink); }
.msg.ai p { border-bottom-left-radius: 6px; background: var(--lp-panel-2); box-shadow: 0 0 0 1px var(--lp-line) inset; }
.file { display: inline-flex; align-items: center; gap: 7px; margin: 0 8px 4px 0; padding: 5px 11px; border-radius: 10px; background: rgba(255, 255, 255, .18); font-size: 12.5px; font-weight: 600; }
.msg.ai .file { background: var(--lp-line); }
.caret { display: inline-block; width: 2px; height: 1.05em; margin-left: 2px; background: currentColor; vertical-align: -2px; animation: blink 1s steps(1) infinite; }
@keyframes blink { 50% { opacity: 0; } }
.note { margin: 2px 0 0; color: var(--lp-subtle); font-size: 12.5px; line-height: 1.55; }
footer { padding: 12px 16px 16px; }
.input { position: relative; min-height: 48px; border-radius: 16px; background: var(--lp-panel-2); box-shadow: 0 0 0 1px var(--lp-line-2) inset; }
.input.drop { box-shadow: 0 0 0 2px var(--lp-green) inset; }
.flying { position: absolute; top: 8px; left: 10px; margin: 0; background: var(--lp-line); animation: drop .9s var(--lp-ease) both; }
@keyframes drop { from { opacity: 0; transform: translateY(-120px) scale(1.06); } }

.chat-enter-active, .chat-leave-active { transition: opacity .35s ease, transform .6s var(--lp-ease); }
.chat-enter-from, .chat-leave-to { opacity: 0; transform: translateY(28px) scale(.98); }
@media (prefers-reduced-motion: reduce) { .flying, .caret { animation: none; } }
</style>
