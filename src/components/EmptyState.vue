<script setup lang="ts">
import Icon from './Icon.vue';

defineProps<{
  icon: 'link' | 'moon' | 'steps' | 'warning' | 'file' | 'heart';
  eyebrow?: string;
  title: string;
  message: string;
  tone?: 'empty' | 'error';
}>();
</script>

<template>
  <div :class="['state-panel', tone === 'error' ? 'error-panel' : 'empty-panel']" :role="tone === 'error' ? 'alert' : undefined">
    <div class="state-mark"><Icon :name="icon" :size="20" /></div>
    <div>
      <p v-if="eyebrow" class="eyebrow">{{ eyebrow }}</p>
      <h2>{{ title }}</h2>
      <p>{{ message }}</p>
      <slot />
    </div>
  </div>
</template>

<style scoped>
.state-panel {
  display: flex;
  max-width: 640px;
  align-items: flex-start;
  gap: 16px;
  padding: 22px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
}
.state-panel h2 { margin: 0 0 6px; font-size: 18px; }
.state-panel p { margin: 0 0 16px; color: var(--muted); }
.state-panel p:last-child { margin-bottom: 0; }
.state-mark {
  display: grid;
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  place-items: center;
  border-radius: 10px;
  color: var(--activity);
  background: color-mix(in srgb, var(--activity) 12%, transparent);
}
.error-panel .state-mark {
  color: var(--warning);
  background: color-mix(in srgb, var(--warning) 12%, transparent);
}
</style>
