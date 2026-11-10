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
/* 标题右边放着范围胶囊时，窗口一窄就换到下一行，不和说明文字挤成一团。
   标题块的基准从 22rem 让到 16rem（2026-11-10 普查）：法语「Tâches enregistrées」页的按钮在 1280 宽也被挤到
   下一排；说明文字本来就会换行，标题块窄一点只是多折一行字，胶囊和按钮留在标题同一排。 */
.page-header { flex-wrap: wrap; row-gap: 12px; }
.page-header > div { flex: 1 1 16rem; min-width: 0; }
</style>
