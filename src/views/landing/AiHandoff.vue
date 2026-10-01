<script setup lang="ts">
/* 第 02 章：交给 AI。左边挑这次给 AI 看哪几类数据，它们收进一个 .md 文件；文件飞进右边的对话框，
 * 一个示例问题打出来、发出去，再打出一段示例回答。看得见时循环演，改了勾选就从头再演。
 * 飞行用 Web Animations 动 transform；打字是改文字，不动布局（对话框高度先留够）。 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import LandingIcon from './LandingIcon.vue';
import { prefersReducedMotion, sleep, typeInto, useInView } from './motion';
import type { LandingCopy } from './types';

const props = defineProps<{ copy: LandingCopy['ai']; chapter: string; sample: string }>();

const picked = ref<number[]>([0, 1, 2]);
const toggle = (index: number) => {
  picked.value = picked.value.includes(index) ? picked.value.filter((i) => i !== index) : [...picked.value, index].sort();
};
const pickedText = computed(() => props.copy.picked.replace('{n}', String(picked.value.length)));

const section = ref<HTMLElement | null>(null);
const fileCard = ref<HTMLElement | null>(null);
const dropZone = ref<HTMLElement | null>(null);
const inView = useInView(section);

type Phase = 'idle' | 'packing' | 'flying' | 'attached' | 'typing' | 'sent' | 'thinking' | 'answering' | 'done';
const phase = ref<Phase>('idle');
const prompt = ref('');
const answer = ref('');
let run = 0;

const fly = async () => {
  const from = fileCard.value?.getBoundingClientRect();
  const to = dropZone.value?.getBoundingClientRect();
  const ghost = fileCard.value?.cloneNode(true) as HTMLElement | undefined;
  if (!from || !to || !ghost || prefersReducedMotion()) return;
  Object.assign(ghost.style, {
    position: 'fixed', left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`,
    margin: '0', zIndex: '40', pointerEvents: 'none',
  });
  ghost.setAttribute('aria-hidden', 'true');
  // 挂在本段里而不是 body：落地页的颜色变量定义在 .lp 上，挂到外面就没颜色了。
  (section.value ?? document.body).appendChild(ghost);
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const k = Math.min(1, to.height / from.height);
  const animation = ghost.animate([
    { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1 },
    { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 60}px) scale(${(1 + k) / 2}) rotate(-4deg)`, opacity: 1, offset: 0.55 },
    { transform: `translate(${dx}px, ${dy}px) scale(${k}) rotate(0deg)`, opacity: 0 },
  ], { duration: 820, easing: 'cubic-bezier(.45, .05, .25, 1)' });
  await animation.finished.catch(() => undefined);
  ghost.remove();
};

const play = async () => {
  const mine = ++run;
  const alive = () => mine === run && inView.value;
  prompt.value = '';
  answer.value = '';
  if (prefersReducedMotion()) {
    phase.value = 'done';
    prompt.value = props.copy.prompt;
    answer.value = props.copy.answer;
    return;
  }
  phase.value = 'packing';
  await sleep(900);
  if (!alive()) return;
  phase.value = 'flying';
  await fly();
  if (!alive()) return;
  phase.value = 'attached';
  await sleep(350);
  phase.value = 'typing';
  if (!(await typeInto(prompt, props.copy.prompt, alive))) return;
  await sleep(380);
  if (!alive()) return;
  phase.value = 'sent';
  await sleep(500);
  phase.value = 'thinking';
  await sleep(1100);
  if (!alive()) return;
  phase.value = 'answering';
  if (!(await typeInto(answer, props.copy.answer, alive, 18))) return;
  phase.value = 'done';
  await sleep(4200);
  if (alive()) void play();
};

watch(inView, (value) => {
  if (value) void play();
  else run += 1;
});
watch([picked, () => props.copy], () => { if (inView.value) void play(); }, { deep: true });
onBeforeUnmount(() => { run += 1; });

const attached = computed(() => !['idle', 'packing', 'flying'].includes(phase.value));
const sent = computed(() => ['sent', 'thinking', 'answering', 'done'].includes(phase.value));
</script>

<template>
  <section id="ai" ref="section" class="lp-section ai">
    <div class="ai-head" data-reveal>
      <p class="lp-chapter is-ai">{{ chapter }}</p>
      <h2 class="lp-h2">{{ copy.heading }}</h2>
      <p class="lp-lead">{{ copy.lead }}</p>
    </div>

    <div class="ai-stage" data-reveal style="--i: 1">
      <span class="lp-sample ai-tag">{{ sample }}</span>
      <div class="desk lp-panel">
        <p class="desk-title">{{ copy.pick }}</p>
        <div class="chips">
          <button
            v-for="(chip, index) in copy.chips"
            :key="chip"
            type="button"
            :class="['chip', { on: picked.includes(index) }]"
            :aria-pressed="picked.includes(index)"
            @click="toggle(index)"
          >
            <span class="tick"><LandingIcon name="check" :size="12" /></span>{{ chip }}
          </button>
        </div>
        <div ref="fileCard" :class="['file', { packing: phase === 'packing' }]">
          <span class="file-icon"><LandingIcon name="file" :size="22" /></span>
          <div class="file-meta">
            <strong>{{ copy.file }}</strong>
            <span>{{ pickedText }}</span>
          </div>
          <TransitionGroup name="row" tag="ul" class="file-rows">
            <li v-for="index in picked" :key="index">{{ copy.chips[index] }}</li>
          </TransitionGroup>
        </div>
      </div>

      <div class="arrow" aria-hidden="true"><span></span><LandingIcon name="arrow-right" :size="18" /></div>

      <div class="chat lp-panel">
        <div class="chat-top"><span class="ai-badge"><LandingIcon name="sparkle" :size="16" /></span><span class="chat-dots"><i></i><i></i><i></i></span></div>
        <div class="thread">
          <Transition name="bubble">
            <div v-if="sent" class="bubble me">
              <span class="attach"><LandingIcon name="file" :size="14" />{{ copy.file }}</span>
              <p>{{ prompt }}</p>
            </div>
          </Transition>
          <Transition name="bubble">
            <div v-if="phase === 'thinking'" class="bubble bot thinking" aria-hidden="true"><i></i><i></i><i></i></div>
            <div v-else-if="phase === 'answering' || phase === 'done'" class="bubble bot">
              <p>{{ answer }}<span v-if="phase === 'answering'" class="caret"></span></p>
            </div>
          </Transition>
        </div>
        <div ref="dropZone" :class="['composer', { armed: phase === 'flying' }]">
          <Transition name="bubble">
            <span v-if="attached && !sent" class="attach"><LandingIcon name="file" :size="14" />{{ copy.file }}</span>
          </Transition>
          <p class="input">
            <template v-if="!sent">{{ prompt }}<span v-if="phase === 'typing' || phase === 'attached'" class="caret"></span></template>
          </p>
          <span :class="['send', { hot: phase === 'typing' }]"><LandingIcon name="arrow-right" :size="16" /></span>
        </div>
      </div>
    </div>
    <p class="ai-note" data-reveal style="--i: 2">{{ copy.note }}</p>
  </section>
</template>

<style scoped>
.ai::before {
  content: '';
  position: absolute;
  top: 60px;
  left: 50%;
  z-index: -1;
  width: 900px;
  height: 700px;
  border-radius: 50%;
  background: radial-gradient(closest-side, color-mix(in srgb, var(--lp-violet) 22%, transparent), transparent 70%);
  transform: translateX(-50%);
  pointer-events: none;
}
.lp-chapter.is-ai { color: var(--lp-violet); }
.ai-head { max-width: 780px; }
.ai-stage { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) 56px minmax(0, 1.15fr); align-items: center; margin-top: 56px; }
.ai-tag { position: absolute; top: -34px; right: 0; }

.desk { display: grid; gap: 22px; padding: 28px; }
.desk-title { margin: 0; color: var(--lp-subtle); font-family: var(--font-mono); font-size: 12px; letter-spacing: .12em; text-transform: uppercase; }
.chips { display: flex; flex-wrap: wrap; gap: 10px; }
.chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  padding: 0 16px 0 8px;
  border: 1px solid var(--lp-line-2);
  border-radius: 999px;
  background: transparent;
  color: var(--lp-muted);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
  transition: background-color .3s ease, color .3s ease, border-color .3s ease, transform .4s var(--lp-ease);
}
.chip:hover { transform: translateY(-2px); }
.chip:active { transform: scale(.96); }
.tick { display: grid; width: 22px; height: 22px; place-items: center; border-radius: 50%; background: var(--lp-line); color: transparent; transition: background-color .3s ease, color .3s ease, transform .4s var(--lp-ease); }
.chip.on { border-color: color-mix(in srgb, var(--lp-violet) 50%, transparent); background: color-mix(in srgb, var(--lp-violet) 12%, transparent); color: var(--lp-ink); }
.chip.on .tick { background: var(--lp-violet); color: #fff; transform: rotate(360deg); }

.file {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 14px;
  align-items: center;
  padding: 16px 18px;
  border: 1px dashed color-mix(in srgb, var(--lp-violet) 45%, transparent);
  border-radius: 18px;
  background: color-mix(in srgb, var(--lp-violet) 7%, var(--lp-panel));
  transition: transform .5s var(--lp-ease), box-shadow .5s ease;
}
.file.packing { transform: scale(1.03); box-shadow: 0 0 0 6px color-mix(in srgb, var(--lp-violet) 14%, transparent); }
.file-icon { display: grid; width: 44px; height: 44px; place-items: center; border-radius: 12px; background: color-mix(in srgb, var(--lp-violet) 20%, transparent); color: var(--lp-violet); }
.file-meta { display: grid; gap: 3px; min-width: 0; }
.file-meta strong { overflow: hidden; font-size: 14.5px; text-overflow: ellipsis; white-space: nowrap; }
.file-meta span { color: var(--lp-subtle); font-size: 12.5px; }
.file-rows { display: flex; flex-wrap: wrap; grid-column: 1 / -1; gap: 6px; min-height: 26px; margin: 10px 0 0; padding: 0; list-style: none; }
.file-rows li { padding: 3px 10px; border-radius: 8px; background: var(--lp-line); color: var(--lp-muted); font-family: var(--font-mono); font-size: 11.5px; }
.row-enter-active, .row-leave-active { transition: opacity .3s ease, transform .4s var(--lp-ease); }
.row-enter-from, .row-leave-to { opacity: 0; transform: scale(.7); }
.row-leave-active { position: absolute; }

.arrow { position: relative; display: grid; height: 100%; place-items: center; color: var(--lp-subtle); }
.arrow span { position: absolute; top: 50%; right: 8px; left: 8px; height: 1px; background: repeating-linear-gradient(90deg, var(--lp-line-2) 0 6px, transparent 6px 12px); }
.arrow .lp-icon { position: relative; padding: 6px; border-radius: 50%; background: var(--lp-bg); }

.chat { display: grid; grid-template-rows: auto minmax(250px, 1fr) auto; overflow: hidden; }
.chat-top { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--lp-line); }
.ai-badge { display: grid; width: 30px; height: 30px; place-items: center; border-radius: 10px; background: linear-gradient(135deg, var(--lp-violet), var(--lp-teal)); color: #fff; }
.chat-dots { display: flex; gap: 4px; }
.chat-dots i { width: 4px; height: 4px; border-radius: 50%; background: var(--lp-subtle); }
.thread { display: flex; flex-direction: column; justify-content: flex-end; gap: 12px; padding: 18px; }
.bubble { max-width: 88%; padding: 12px 15px; border-radius: 18px; font-size: 14px; line-height: 1.6; }
.bubble p { margin: 0; }
.me { align-self: flex-end; border-bottom-right-radius: 6px; background: color-mix(in srgb, var(--lp-violet) 22%, var(--lp-panel-2)); }
.me .attach { margin-bottom: 8px; }
.bot { align-self: flex-start; border-bottom-left-radius: 6px; background: var(--lp-line); color: var(--lp-ink); }
.thinking { display: flex; gap: 5px; padding: 16px 18px; }
.thinking i { width: 7px; height: 7px; border-radius: 50%; background: var(--lp-muted); animation: blink 1s ease-in-out infinite; }
.thinking i:nth-child(2) { animation-delay: .15s; }
.thinking i:nth-child(3) { animation-delay: .3s; }
@keyframes blink { 50% { transform: translateY(-4px); opacity: .4; } }
.attach { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; padding: 5px 10px; border-radius: 10px; background: color-mix(in srgb, var(--lp-violet) 18%, transparent); color: var(--lp-violet); font-family: var(--font-mono); font-size: 11.5px; white-space: nowrap; }
.composer { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; margin: 0 14px 14px; padding: 10px 10px 10px 14px; border: 1px solid var(--lp-line-2); border-radius: 18px; transition: border-color .3s ease, box-shadow .3s ease; }
.composer.armed { border-color: var(--lp-violet); box-shadow: 0 0 0 5px color-mix(in srgb, var(--lp-violet) 14%, transparent); }
.input { flex: 1 1 200px; min-height: 22px; margin: 0; color: var(--lp-ink); font-size: 14px; }
.send { display: grid; width: 34px; height: 34px; margin-left: auto; place-items: center; border-radius: 50%; background: var(--lp-line); color: var(--lp-muted); transition: background-color .3s ease, color .3s ease; }
.send.hot { background: var(--lp-violet); color: #fff; }
.caret { display: inline-block; width: 2px; height: 1.05em; margin-left: 2px; vertical-align: -2px; background: var(--lp-violet); animation: caret 1s steps(1) infinite; }
@keyframes caret { 50% { opacity: 0; } }
.bubble-enter-active { transition: opacity .35s ease, transform .5s var(--lp-ease); }
.bubble-enter-from { opacity: 0; transform: translateY(12px) scale(.96); }
.bubble-leave-active { transition: opacity .2s ease; }
.bubble-leave-to { opacity: 0; }

.ai-note { max-width: 46em; margin: 28px 0 0; color: var(--lp-subtle); font-size: 14px; line-height: 1.6; }

@media (max-width: 920px) {
  .ai-stage { grid-template-columns: 1fr; gap: 14px; }
  .arrow { height: 36px; transform: rotate(90deg); }
}
</style>
