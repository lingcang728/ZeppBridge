<script setup lang="ts">
/** 交给哪个 AI：一行图标按钮，单选。 */
import { AI_PROVIDERS, type AiProvider } from '../../lib/aiProviders';

defineProps<{ modelValue: AiProvider; label: string }>();
const emit = defineEmits<{ (event: 'update:modelValue', value: AiProvider): void }>();
</script>

<template>
  <div class="providers" role="radiogroup" :aria-label="label">
    <button v-for="item in AI_PROVIDERS" :key="item.id" type="button" role="radio"
      :aria-checked="modelValue.id === item.id" :class="['provider', { 'is-on': modelValue.id === item.id }]"
      :title="item.label" @click="emit('update:modelValue', item)">
      <img :src="item.localIcon" alt="" class="provider-icon" />
      <span>{{ item.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.providers { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 6px; }
.provider { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border: 1px solid var(--line-control); border-radius: 10px; background: var(--surface-raised); color: var(--ink); font-size: var(--fs-sm); cursor: pointer; }
.provider:hover { border-color: var(--accent); }
.provider.is-on { border-color: var(--accent); background: var(--accent-soft); }
.provider:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.provider-icon { width: 18px; height: 18px; flex: 0 0 18px; border-radius: 4px; }
</style>
