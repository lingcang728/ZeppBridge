<script setup lang="ts">
/* 功能便当格：每一格自己有一段小动画（连接状态依次亮起、数据文件夹展开、导出文件扇形散开、
 * 终端打字、十种语言的问候滚动、深浅两色来回扫）。悬停有追光。循环动画离屏暂停（data-live）。 */
import { ref, watch } from 'vue';
import LandingIcon from './LandingIcon.vue';
import { spotlight, typeInto, useInView, prefersReducedMotion } from './motion';
import type { LandingCopy } from './types';

const props = defineProps<{ copy: LandingCopy['bento'] }>();

const GREETINGS = ['你好', 'Hello', 'Hola', 'Hallo', 'Bonjour', 'Olá', 'Привет', 'नमस्ते', 'Oi', 'Hoi'];
const FORMATS = ['JSON', 'CSV', 'GPX', 'FIT'];
const FOLDER = ['data/', '  zepp.db', '  backups/', '  exports/'];

/* 终端：看得见时打一遍命令，再一行行出结果。 */
const term = ref<HTMLElement | null>(null);
const termIn = useInView(term);
const typed = ref('');
const lines = ref(0);
let run = 0;
const COMMAND = 'zeppbridge-cli status';
const playTerm = async () => {
  const mine = ++run;
  const alive = () => mine === run;
  lines.value = 0;
  if (prefersReducedMotion()) { typed.value = COMMAND; lines.value = 3; return; }
  if (!(await typeInto(typed, COMMAND, alive, 55))) return;
  for (let i = 1; i <= 3; i += 1) {
    await new Promise((resolve) => { window.setTimeout(resolve, 260); });
    if (!alive()) return;
    lines.value = i;
  }
};
watch(termIn, (value) => { if (value && lines.value < 3) void playTerm(); });
watch(() => props.copy, () => { if (termIn.value) void playTerm(); });
</script>

<template>
  <section id="features" class="lp-section bento">
    <div class="lp-center" data-reveal>
      <h2 class="lp-h2">{{ copy.heading }}</h2>
      <p class="lp-lead">{{ copy.lead }}</p>
    </div>

    <div class="grid">
      <article class="tile lp-panel lp-spot wide" data-reveal data-live style="--i: 0" @pointermove="spotlight">
        <div class="tile-copy"><h3>{{ copy.connect.title }}</h3><p>{{ copy.connect.copy }}</p></div>
        <ul class="conn">
          <li v-for="(row, index) in copy.connect.rows" :key="row" :style="{ '--k': index }">
            <span :class="['led', { standby: index === 2 }]"></span>
            <span class="conn-name">{{ row }}</span>
            <span :class="['conn-state', { standby: index === 2 }]">{{ copy.connect.states[index] }}</span>
          </li>
        </ul>
      </article>

      <article class="tile lp-panel lp-spot" data-reveal data-live style="--i: 1" @pointermove="spotlight">
        <div class="tile-copy"><h3>{{ copy.local.title }}</h3><p>{{ copy.local.copy }}</p></div>
        <div class="folder">
          <span class="folder-icon"><LandingIcon name="folder" :size="30" /></span>
          <ul>
            <li v-for="(entry, index) in FOLDER" :key="entry" :style="{ '--k': index }">{{ entry }}</li>
          </ul>
        </div>
      </article>

      <article class="tile lp-panel lp-spot" data-reveal data-live style="--i: 0" @pointermove="spotlight">
        <div class="tile-copy"><h3>{{ copy.export.title }}</h3><p>{{ copy.export.copy }}</p></div>
        <div class="fan">
          <span v-for="(format, index) in FORMATS" :key="format" class="doc" :style="{ '--k': index }">
            <LandingIcon name="file" :size="18" />{{ format }}
          </span>
        </div>
      </article>

      <article ref="term" class="tile lp-panel lp-spot wide" data-reveal data-live style="--i: 1" @pointermove="spotlight">
        <div class="tile-copy"><h3>{{ copy.api.title }}</h3><p>{{ copy.api.copy }}</p></div>
        <div class="terminal" aria-hidden="true">
          <p><span class="prompt">❯</span> {{ typed }}<span v-if="lines < 3" class="cursor"></span></p>
          <p v-for="index in lines" :key="index" class="out">{{ copy.api.output[index - 1] }}</p>
        </div>
      </article>

      <article class="tile lp-panel lp-spot wide" data-reveal data-live style="--i: 0" @pointermove="spotlight">
        <div class="tile-copy"><h3>{{ copy.languages.title }}</h3><p>{{ copy.languages.copy }}</p></div>
        <div class="ticker" aria-hidden="true">
          <div class="ticker-track">
            <span v-for="(word, index) in [...GREETINGS, GREETINGS[0]]" :key="index">{{ word }}</span>
          </div>
        </div>
      </article>

      <article class="tile lp-panel lp-spot" data-reveal data-live style="--i: 1" @pointermove="spotlight">
        <div class="tile-copy"><h3>{{ copy.theme.title }}</h3><p>{{ copy.theme.copy }}</p></div>
        <div class="themes" aria-hidden="true">
          <div class="mini dark"><span class="bar"></span><span class="bar short"></span><i>{{ copy.theme.dark }}</i></div>
          <div class="mini light"><span class="bar"></span><span class="bar short"></span><i>{{ copy.theme.light }}</i></div>
          <span class="sweep"></span>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; margin-top: 56px; }
.tile { display: flex; flex-direction: column; justify-content: space-between; gap: 26px; min-height: 290px; padding: 28px; overflow: hidden; }
.tile.wide { grid-column: span 2; }
.tile-copy h3 { margin: 0; font-size: 20px; font-weight: 680; letter-spacing: -.01em; }
.tile-copy p { max-width: 30em; margin: 8px 0 0; color: var(--lp-muted); font-size: 14.5px; line-height: 1.6; }

/* 连接 */
.conn { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }
.conn li { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border: 1px solid var(--lp-line); border-radius: 14px; background: color-mix(in srgb, var(--lp-bg) 40%, transparent); font-size: 14.5px; }
.led { position: relative; width: 9px; height: 9px; border-radius: 50%; background: var(--lp-green); animation: led 3.6s ease-in-out infinite; animation-delay: calc(var(--k) * .45s); }
.led.standby { background: var(--lp-subtle); animation: none; }
@keyframes led { 0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--lp-green) 0%, transparent); } 20% { box-shadow: 0 0 0 6px color-mix(in srgb, var(--lp-green) 24%, transparent); } }
.conn-name { flex: 1; }
.conn-state { color: var(--lp-green); font-family: var(--font-mono); font-size: 12px; }
.conn-state.standby { color: var(--lp-subtle); }

/* 文件夹 */
.folder { display: flex; align-items: flex-start; gap: 16px; }
.folder-icon { display: grid; width: 56px; height: 56px; place-items: center; border-radius: 16px; background: color-mix(in srgb, var(--lp-teal) 16%, transparent); color: var(--lp-teal); }
.folder ul { margin: 0; padding: 0; color: var(--lp-muted); font-family: var(--font-mono); font-size: 13px; line-height: 1.85; list-style: none; white-space: pre; }
.folder li { animation: line-in 5s var(--lp-ease) infinite; animation-delay: calc(var(--k) * .25s); }
@keyframes line-in { 0% { opacity: 0; transform: translateX(-8px); } 12%, 85% { opacity: 1; transform: none; } 100% { opacity: 0; } }

/* 导出：扇形 */
.fan { position: relative; height: 110px; }
.doc {
  position: absolute;
  bottom: 0;
  left: 50%;
  display: grid;
  width: 74px;
  height: 92px;
  place-content: center;
  justify-items: center;
  gap: 6px;
  border: 1px solid var(--lp-line-2);
  border-radius: 12px;
  background: linear-gradient(180deg, var(--lp-panel-2), var(--lp-panel));
  box-shadow: 0 12px 24px -12px rgba(0, 0, 0, .6);
  color: var(--lp-muted);
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 650;
  transform: translateX(-50%) rotate(calc((var(--k) - 1.5) * 4deg));
  transform-origin: 50% 120%;
  transition: transform .7s var(--lp-ease);
  animation: bob 4s ease-in-out infinite;
  animation-delay: calc(var(--k) * .3s);
}
.tile:hover .doc { transform: translateX(calc(-50% + (var(--k) - 1.5) * 70px)) rotate(calc((var(--k) - 1.5) * 9deg)); }
@keyframes bob { 50% { translate: 0 -6px; } }

/* 终端 */
.terminal { min-height: 120px; padding: 16px 18px; border: 1px solid var(--lp-line); border-radius: 14px; background: #06080b; color: #d9e1d4; font-family: var(--font-mono); font-size: 13.5px; }
.terminal p { margin: 0 0 6px; }
.prompt { color: var(--lp-green); }
.out { color: #8fa094; animation: line-in-once .4s var(--lp-ease) both; }
@keyframes line-in-once { from { opacity: 0; transform: translateY(4px); } }
.cursor { display: inline-block; width: 8px; height: 1.1em; margin-left: 3px; vertical-align: -3px; background: var(--lp-green); animation: cur 1s steps(1) infinite; }
@keyframes cur { 50% { opacity: 0; } }

/* 语言滚动 */
.ticker { height: 78px; overflow: hidden; -webkit-mask-image: linear-gradient(180deg, transparent, #000 25%, #000 75%, transparent); mask-image: linear-gradient(180deg, transparent, #000 25%, #000 75%, transparent); }
.ticker-track { display: grid; animation: words 15s cubic-bezier(.7, 0, .3, 1) infinite; }
.ticker-track span { height: 78px; font-size: 52px; font-weight: 720; letter-spacing: -.03em; line-height: 78px; background: linear-gradient(90deg, var(--lp-ink), var(--lp-muted)); -webkit-background-clip: text; background-clip: text; color: transparent; }
@keyframes words {
  0%, 8% { transform: translateY(0); }
  10%, 18% { transform: translateY(-78px); }
  20%, 28% { transform: translateY(-156px); }
  30%, 38% { transform: translateY(-234px); }
  40%, 48% { transform: translateY(-312px); }
  50%, 58% { transform: translateY(-390px); }
  60%, 68% { transform: translateY(-468px); }
  70%, 78% { transform: translateY(-546px); }
  80%, 88% { transform: translateY(-624px); }
  90%, 98% { transform: translateY(-702px); }
  100% { transform: translateY(-780px); }
}

/* 深浅两色 */
.themes { position: relative; height: 120px; overflow: hidden; border-radius: 16px; }
.mini { position: absolute; inset: 0; display: grid; align-content: center; gap: 10px; padding: 0 22px; }
.mini i { margin-top: 6px; font-family: var(--font-mono); font-size: 12px; font-style: normal; }
.mini .bar { width: 70%; height: 10px; border-radius: 6px; }
.mini .bar.short { width: 44%; }
.mini.dark { background: #0d1014; color: #8b949e; }
.mini.dark .bar { background: #2a313a; }
.mini.light { background: #f3f5f0; color: #5d6a58; clip-path: inset(0 0 0 50%); animation: sweep 5s cubic-bezier(.65, 0, .35, 1) infinite; }
.mini.light .bar { background: #d7ddd2; }
.sweep { position: absolute; inset: 0; animation: sweep-line 5s cubic-bezier(.65, 0, .35, 1) infinite; pointer-events: none; }
.sweep::before { content: ''; position: absolute; top: 0; bottom: 0; left: -1px; width: 2px; background: var(--lp-green); box-shadow: 0 0 12px var(--lp-green); }
@keyframes sweep { 0%, 100% { clip-path: inset(0 0 0 82%); } 50% { clip-path: inset(0 0 0 18%); } }
@keyframes sweep-line { 0%, 100% { transform: translateX(82%); } 50% { transform: translateX(18%); } }

@media (max-width: 920px) {
  .grid { grid-template-columns: 1fr 1fr; }
  .tile.wide { grid-column: span 2; }
}
@media (max-width: 640px) {
  .grid { grid-template-columns: 1fr; }
  .tile.wide { grid-column: auto; }
  .tile { min-height: 0; }
}
</style>
