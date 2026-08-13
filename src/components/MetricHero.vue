<script setup lang="ts">
import CategoryMark from './CategoryMark.vue';
import type { HealthCategory } from '../lib/format';

defineProps<{
  category: HealthCategory;
  icon: 'heart' | 'moon' | 'steps';
  kicker: string;
  value: string;
  unit?: string;
  detail?: string;
}>();
</script>

<template>
  <article :class="['metric-hero', `tone-${category}`]">
    <div class="hero-heading">
      <CategoryMark :category="category" :icon="icon" />
      <span>{{ kicker }}</span>
      <slot name="progress" />
    </div>
    <div class="hero-reading">
      <strong>{{ value }}</strong>
      <span v-if="unit">{{ unit }}</span>
    </div>
    <p v-if="detail">{{ detail }}</p>
    <slot />
  </article>
</template>

<style scoped>
.metric-hero {
  display: flex;
  min-height: 220px;
  flex-direction: column;
  padding: 22px 24px 20px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
}
.hero-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--muted);
  font-size: 13px;
  font-weight: 600;
}
.hero-heading > span {
  flex: 1;
}
.hero-reading {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  margin-top: auto;
  padding-top: 28px;
}
.hero-reading strong {
  font-family: var(--font-mono);
  font-size: clamp(56px, 8vw, 84px);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.08em;
  line-height: 0.86;
}
.hero-reading span {
  margin-bottom: 8px;
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 12px;
}
.tone-heart .hero-reading span { color: var(--heart); }
.tone-sleep .hero-reading span { color: var(--sleep); }
.tone-activity .hero-reading span { color: var(--activity); }
.metric-hero > p {
  margin: 14px 0 0;
  color: var(--muted);
  font-size: 12px;
}
</style>
