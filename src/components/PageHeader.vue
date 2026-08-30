<script setup lang="ts">
import { RouterLink } from 'vue-router';
import Icon from './Icon.vue';
import { defineMessages, useMessages } from '../i18n';

const messages = defineMessages(
  { backToOverview: '返回概览' },
  { backToOverview: 'Back to overview' },
);
const t = useMessages(messages);

/*
 * 二级页统一的页头。
 *
 * `back` 是返回目标。它存在的理由很简单：从概览点进心率、日常活动、睡眠列表
 * 之后，页面上没有任何回去的入口，用户只能再点一次左边的导航——那是「重新
 * 开始」，不是「返回」。所有能被点进来的页面都要给一个。
 */
defineProps<{
  eyebrow?: string;
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
    <RouterLink v-if="back" class="back-link" :to="back">
      <Icon name="arrow-left" :size="14" />{{ backLabel || t.backToOverview }}
    </RouterLink>
    <header class="page-header">
      <div>
        <p v-if="eyebrow" class="eyebrow">{{ eyebrow }}</p>
        <h1 :id="titleId">{{ title }}</h1>
        <p v-if="intro" class="page-intro">{{ intro }}</p>
      </div>
      <slot />
    </header>
  </div>
</template>

<style scoped>
.page-header-wrap { display: grid; gap: 8px; min-width: 0; }
.back-link {
  display: inline-flex;
  align-items: center;
  justify-self: start;
  gap: 6px;
  color: var(--muted);
  font-size: 12px;
  text-decoration: none;
}
.back-link:hover { color: var(--accent); }
</style>
