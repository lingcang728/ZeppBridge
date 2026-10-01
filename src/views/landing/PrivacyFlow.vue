<script setup lang="ts">
/* 隐私：一块深色大面板（浅色主题下也是深的，像一段「夜里」）。数据只走「手表 → Zepp 云端 → 你的电脑」
 * 这一条路，路上走着光点；上方挂一个虚线的「ZeppBridge 服务器」，被划掉，标着「不存在」。 */
import LandingIcon from './LandingIcon.vue';
import type { LandingCopy } from './types';

defineProps<{ copy: LandingCopy['privacy'] }>();
</script>

<template>
  <section id="privacy" class="lp-section privacy">
    <div class="vault" data-reveal data-live>
      <div class="vault-head">
        <span class="lock"><LandingIcon name="lock" :size="26" /></span>
        <h2 class="lp-h2">{{ copy.heading }}</h2>
        <p class="lp-lead">{{ copy.lead }}</p>
      </div>

      <div class="path" aria-hidden="true">
        <div class="ghost-node">
          <span class="node ghost"><LandingIcon name="cloud" :size="20" />{{ copy.nodes.server }}</span>
          <span class="none">✕ {{ copy.nodes.none }}</span>
          <span class="ghost-link"></span>
        </div>
        <div class="row">
          <span class="node"><LandingIcon name="watch" :size="20" />{{ copy.nodes.watch }}</span>
          <span class="wire"><i></i><i></i><i></i></span>
          <span class="node"><LandingIcon name="cloud" :size="20" />{{ copy.nodes.cloud }}</span>
          <span class="wire"><i></i><i></i><i></i></span>
          <span class="node home"><LandingIcon name="laptop" :size="20" />{{ copy.nodes.computer }}</span>
        </div>
      </div>

      <ul class="points">
        <li v-for="(point, index) in copy.points" :key="point.title" data-reveal :style="{ '--i': index + 1 }">
          <LandingIcon :name="index === 0 ? 'key' : index === 1 ? 'eye-off' : 'check'" :size="22" />
          <h3>{{ point.title }}</h3>
          <p>{{ point.copy }}</p>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.vault {
  --v-ink: #eef2ea;
  --v-muted: #9aa5a0;
  --v-line: rgba(255, 255, 255, .09);
  position: relative;
  overflow: hidden;
  padding: 72px 56px 56px;
  border-radius: 36px;
  background:
    radial-gradient(70% 60% at 50% 0%, rgba(63, 208, 180, .16), transparent 70%),
    radial-gradient(50% 50% at 90% 100%, rgba(143, 194, 74, .12), transparent 70%),
    #071311;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, .06) inset, 0 50px 100px -50px rgba(0, 0, 0, .8);
  color: var(--v-ink);
}
.vault .lp-lead { color: var(--v-muted); }
.vault-head { display: grid; justify-items: center; text-align: center; }
.vault-head .lp-h2, .vault-head .lp-lead { margin-left: auto; margin-right: auto; }
.lock { display: grid; width: 60px; height: 60px; margin-bottom: 24px; place-items: center; border-radius: 20px; background: rgba(63, 208, 180, .14); color: #5fe0c4; box-shadow: 0 0 0 1px rgba(95, 224, 196, .25) inset, 0 0 40px rgba(63, 208, 180, .25); }

.path { display: grid; justify-items: center; gap: 0; margin: 64px auto 0; }
.row { display: flex; align-items: center; justify-content: center; gap: 0; width: 100%; }
.node {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  border: 1px solid var(--v-line);
  border-radius: 16px;
  background: rgba(255, 255, 255, .04);
  font-size: 14.5px;
  font-weight: 600;
  white-space: nowrap;
}
.node.home { border-color: rgba(143, 194, 74, .45); background: rgba(143, 194, 74, .1); color: #b6e07a; box-shadow: 0 0 30px -6px rgba(143, 194, 74, .35); }
.wire { position: relative; flex: 0 1 140px; min-width: 40px; height: 2px; background: rgba(255, 255, 255, .1); overflow: hidden; }
.wire i { position: absolute; top: 0; left: 0; width: 18px; height: 2px; border-radius: 2px; background: linear-gradient(90deg, transparent, #5fe0c4); animation: flow 2.2s linear infinite; }
.wire i:nth-child(2) { animation-delay: .73s; }
.wire i:nth-child(3) { animation-delay: 1.46s; }
@keyframes flow { from { transform: translateX(-18px); } to { transform: translateX(140px); } }

.ghost-node { position: relative; display: grid; justify-items: center; gap: 8px; margin-bottom: 26px; }
.node.ghost { border-style: dashed; color: var(--v-muted); opacity: .55; text-decoration: line-through; text-decoration-color: rgba(240, 97, 106, .8); }
.none { color: #f0848a; font-family: var(--font-mono); font-size: 12px; letter-spacing: .06em; }
.ghost-link { width: 1px; height: 26px; background: repeating-linear-gradient(180deg, rgba(255, 255, 255, .25) 0 4px, transparent 4px 8px); opacity: .5; }

.points { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 28px; margin: 64px 0 0; padding: 32px 0 0; border-top: 1px solid var(--v-line); list-style: none; }
.points li { display: grid; align-content: start; gap: 10px; color: #8fd8c6; }
.points h3 { margin: 4px 0 0; color: var(--v-ink); font-size: 17px; }
.points p { margin: 0; color: var(--v-muted); font-size: 14.5px; line-height: 1.6; }

@media (max-width: 860px) {
  .vault { padding: 56px 22px 40px; border-radius: 28px; }
  .row { flex-direction: column; }
  .wire { flex: 0 0 36px; width: 2px; height: 36px; min-width: 0; }
  .wire i { width: 2px; height: 14px; background: linear-gradient(180deg, transparent, #5fe0c4); animation-name: flow-y; }
  @keyframes flow-y { from { transform: translateY(-14px); } to { transform: translateY(36px); } }
  .points { grid-template-columns: 1fr; }
}
</style>
