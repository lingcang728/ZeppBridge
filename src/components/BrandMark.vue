<script setup lang="ts">
import DesignIcon from './DesignIcon.vue';

withDefaults(defineProps<{ size?: number }>(), { size: 36 });
</script>

<template>
  <DesignIcon class="brand-mark" name="brand-mark" :size="size" />
</template>

<style scoped>
.brand-mark {
  display: block;
  flex: 0 0 auto;
  object-fit: contain;
}
</style>
