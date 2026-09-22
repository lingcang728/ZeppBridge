<script setup lang="ts">
/* BETA1-STUB — Orbit Lab 占位页。
 *
 * 轨道编排实验场由 S3 在集成阶段实现；遇到 add/add 冲突时以正式实现为准，
 * 这个文件可以直接整页替换。路由存在但不出现在主导航里。 */
import Icon from '../components/Icon.vue';
import { defineMessages, useMessages } from '../i18n';

defineOptions({ name: 'OrbitLab' });

const messages = defineMessages(
  {
    title: 'Orbit Lab',
    body: '轨道编排实验场还在搭建中。这里将用来试用新的拖拽式任务编排。',
  },
  {
    title: 'Orbit Lab',
    body: 'The orbit composer lab is still under construction. This is where the new drag-based task composer will be tried out.',
  },
  {
    title: 'Orbit Lab',
    body: 'El laboratorio de composición orbital aún está en construcción. Aquí se probará el nuevo editor de tareas con arrastrar y soltar.',
  },
);
const t = useMessages(messages);
</script>

<template>
  <section class="page stub-page" :aria-labelledby="'stub-title'">
    <div class="stub-card">
      <span class="stub-icon"><Icon name="sliders" :size="30" /></span>
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
