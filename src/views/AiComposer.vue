<script setup lang="ts">
/* BETA1-STUB — 交给 AI 工作台占位页。
 *
 * 真正的交接台（提示词、范围、脱敏、发送）由 S4 在集成阶段实现；
 * 遇到 add/add 冲突时以正式实现为准，这个文件可以直接整页替换。 */
import Icon from '../components/Icon.vue';
import { defineMessages, useMessages } from '../i18n';

defineOptions({ name: 'AiComposer' });

const messages = defineMessages(
  {
    title: '交给 AI',
    body: '这里正在搭建新的 AI 交接台。现在请先从顶部导航回到概览，或前往设置检查同步状态。',
  },
  {
    title: 'Hand to AI',
    body: 'A new AI handoff studio is being built here. For now, head back to the overview or check sync status in settings.',
  },
  {
    title: 'Pasar a la IA',
    body: 'Aquí se está construyendo el nuevo estudio de entrega a la IA. Por ahora, vuelve al resumen o revisa la sincronización en configuración.',
  },
);
const t = useMessages(messages);
</script>

<template>
  <section class="page stub-page" :aria-labelledby="'stub-title'">
    <div class="stub-card">
      <span class="stub-icon"><Icon name="spark" :size="30" /></span>
      <h1 id="stub-title">{{ t.title }}</h1>
      <p>{{ t.body }}</p>
    </div>
  </section>
</template>

<style scoped>
.stub-page {
  display: grid;
  min-height: 60vh;
  place-items: center;
}
.stub-card {
  display: grid;
  justify-items: center;
  gap: 10px;
  max-width: 460px;
  padding: 40px 36px;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--surface);
  text-align: center;
}
.stub-icon {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: 18px;
  background: var(--accent-soft);
  color: var(--accent);
}
.stub-card h1 { margin: 4px 0 0; font-size: var(--fs-2xl); }
.stub-card p { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
</style>
