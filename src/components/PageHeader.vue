<script setup lang="ts">
defineProps<{
  title: string;
  intro?: string;
  titleId?: string;
  /** 返回目标路由；不传就不显示返回。 */
  back?: string;
  /** 返回按钮上的字，默认「返回概览」。 */
  backLabel?: string;
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
