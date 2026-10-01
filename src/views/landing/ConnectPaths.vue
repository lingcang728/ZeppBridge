<script setup lang="ts">
/* 三种连接方式：三张卡，上面一条线随进场从左画到右，把三个编号串起来。第一张是推荐。 */
import { ref } from 'vue';
import { spotlight, useSeen } from './motion';
import type { LandingCopy } from './types';

defineProps<{ copy: LandingCopy['connect'] }>();
const row = ref<HTMLElement | null>(null);
const seen = useSeen(row, 0.3);
</script>

<template>
  <section id="connect" class="lp-section connect">
    <div data-reveal>
      <h2 class="lp-h2">{{ copy.heading }}</h2>
      <p class="lp-lead">{{ copy.lead }}</p>
    </div>
    <div ref="row" :class="['paths', { 'is-seen': seen }]">
      <span class="thread" aria-hidden="true"></span>
      <article
        v-for="(path, index) in copy.paths"
        :key="path.title"
        :class="['path lp-panel lp-spot', { lead: index === 0 }]"
        :style="{ '--k': index }"
        @pointermove="spotlight"
      >
        <span class="num">{{ index + 1 }}</span>
        <span v-if="index === 0" class="badge">{{ copy.recommended }}</span>
        <h3>{{ path.title }}</h3>
        <p>{{ path.copy }}</p>
        <p class="detail">{{ path.detail }}</p>
      </article>
    </div>
    <p class="note" data-reveal>{{ copy.note }}</p>
  </section>
</template>

<style scoped>
.paths { position: relative; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; margin-top: 56px; padding-top: 22px; }
.thread { position: absolute; top: 0; right: 16%; left: 16%; height: 2px; background: linear-gradient(90deg, var(--lp-green), var(--lp-teal), var(--lp-subtle)); transform: scaleX(0); transform-origin: 0 50%; transition: transform 1.4s var(--lp-ease) .2s; }
.is-seen .thread { transform: scaleX(1); }
.path { display: grid; align-content: start; gap: 10px; padding: 34px 26px 28px; opacity: 0; transform: translateY(30px); transition: opacity .8s var(--lp-ease), transform .8s var(--lp-ease); transition-delay: calc(.15s + var(--k) * .15s); }
.is-seen .path { opacity: 1; transform: none; }
.path.lead { border-color: color-mix(in srgb, var(--lp-green) 40%, transparent); }
.num { position: absolute; top: -40px; left: 50%; display: grid; width: 36px; height: 36px; place-items: center; border: 1px solid var(--lp-line-2); border-radius: 50%; background: var(--lp-bg); color: var(--lp-muted); font-family: var(--font-mono); font-size: 14px; transform: translateX(-50%); }
.lead .num { border-color: var(--lp-green); color: var(--lp-green); box-shadow: 0 0 20px -4px var(--lp-glow); }
.badge { justify-self: start; padding: 3px 10px; border-radius: 999px; background: color-mix(in srgb, var(--lp-green) 16%, transparent); color: var(--lp-green); font-size: 12px; font-weight: 650; }
.path h3 { margin: 0; font-size: 19px; }
.path p { margin: 0; color: var(--lp-muted); font-size: 14.5px; line-height: 1.6; }
.path .detail { color: var(--lp-subtle); font-size: 13.5px; }
.note { max-width: 46em; margin: 30px 0 0; padding-left: 14px; border-left: 2px solid var(--lp-line-2); color: var(--lp-muted); font-size: 14.5px; line-height: 1.65; }
@media (max-width: 860px) {
  .paths { grid-template-columns: 1fr; gap: 44px; padding-top: 30px; }
  .thread { display: none; }
}
@media (prefers-reduced-motion: reduce) { .path { opacity: 1; transform: none; } .thread { transform: none; } }
</style>
