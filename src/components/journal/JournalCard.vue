<script setup lang="ts">
/* 履历页每一块的卡：卡头（标题、一句说明、右上角的添加按钮）+ 内容。材质同概览的卡。
   右上角要放不止一个按钮时用 actions 插槽（纪元与事件：「新纪元」「记一件事」）。 */
defineProps<{ title: string; hint?: string; action?: string; tone?: 'race' | 'record' | 'shoe' | 'injury' | 'epoch' }>();
const emit = defineEmits<{ (event: 'action', origin: HTMLElement): void }>();
</script>

<template>
  <section :class="['journal-card', tone && `tone-${tone}`]">
    <header class="jc-head">
      <div class="jc-title"><h2>{{ title }}</h2><p v-if="hint">{{ hint }}</p></div>
      <div v-if="$slots.actions" class="jc-actions"><slot name="actions" /></div>
      <button v-else-if="action" type="button" class="pill-button quiet" @click="emit('action', $event.currentTarget as HTMLElement)">{{ action }}</button>
    </header>
    <slot />
  </section>
</template>

<style scoped>
.journal-card { position: relative; display: grid; align-content: start; gap: 14px; min-width: 0; padding: 18px 20px 20px; overflow: hidden;
  border-radius: var(--radius-lg); background: var(--mat-card); box-shadow: var(--mat-rim), var(--mat-shadow); }
/* 类别色只做角落一点微光，不给整张卡上色。 */
.journal-card::before { content: ''; position: absolute; inset: -40% auto auto -20%; width: 60%; height: 80%; pointer-events: none;
  background: radial-gradient(closest-side, color-mix(in srgb, var(--jc-tone, transparent) 14%, transparent), transparent); }
.tone-race { --jc-tone: var(--training); }
.tone-record { --jc-tone: var(--warning); }
.tone-shoe { --jc-tone: var(--pace); }
.tone-injury { --jc-tone: var(--heart); }
.tone-epoch { --jc-tone: var(--sleep); }
.jc-head { position: relative; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.jc-title { display: grid; gap: 4px; min-width: 0; }
.jc-title h2 { margin: 0; color: var(--ink); font-size: var(--fs-md); font-weight: 700; }
.jc-title p { margin: 0; color: var(--subtle); font-size: var(--fs-xs); line-height: 1.6; }
.jc-head .pill-button { flex: none; }
.jc-actions { display: flex; flex: none; flex-wrap: wrap; justify-content: flex-end; gap: 6px; }
</style>
