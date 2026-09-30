<script setup lang="ts">
defineProps<{
  title: string;
  intro?: string;
  titleId?: string;
}>();
</script>

<template>
  <div class="page-header-wrap">
    <header class="page-header">
      <div>
        <h1 :id="titleId">{{ title }}</h1>
        <p v-if="intro" class="page-intro">{{ intro }}</p>
      </div>
      <slot />
    </header>
  </div>
</template>

<style scoped>
.page-header-wrap { display: grid; gap: 8px; min-width: 0; }
/* 标题右边放着范围胶囊时，窗口一窄就换到下一行，不和说明文字挤成一团。 */
.page-header { flex-wrap: wrap; row-gap: 12px; }
.page-header > div { flex: 1 1 22rem; min-width: 0; }
</style>
