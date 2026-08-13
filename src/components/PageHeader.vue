<script setup lang="ts">
defineProps<{
  eyebrow?: string;
  title: string;
  intro?: string;
  titleId?: string;
}>();
</script>

<template>
  <header class="page-header">
    <div>
      <p v-if="eyebrow" class="eyebrow">{{ eyebrow }}</p>
      <h1 :id="titleId">{{ title }}</h1>
      <p v-if="intro" class="page-intro">{{ intro }}</p>
    </div>
    <slot />
  </header>
</template>
