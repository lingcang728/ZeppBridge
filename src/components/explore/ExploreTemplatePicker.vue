<script setup lang="ts">
/* 探索页左列：模板分类 + 可搜索的模板列表。选中哪一个由父级持有。 */
import { computed, ref } from 'vue';
import Icon, { type IconName } from '../Icon.vue';
import { useMessages } from '../../i18n';
import { exploreMessages, type PromptTemplate } from '../../views/Explore.i18n';

const props = defineProps<{ templates: PromptTemplate[]; activeId: string }>();
const emit = defineEmits<{ select: [template: PromptTemplate] }>();

const t = useMessages(exploreMessages);

const categories = computed(() => {
  const list = props.templates;
  const count = (key: string) => list.filter((tpl) => tpl.category === key).length;
  return [
    { key: 'all', label: t.value.categoryAll, icon: 'grid' as IconName, count: list.length },
    { key: 'summary', label: t.value.categorySummary, icon: 'file' as IconName, count: count('summary') },
    { key: 'training', label: t.value.categoryTraining, icon: 'activity' as IconName, count: count('training') },
    { key: 'recovery', label: t.value.categoryRecovery, icon: 'heart' as IconName, count: count('recovery') },
    { key: 'sleep', label: t.value.categorySleep, icon: 'moon' as IconName, count: count('sleep') },
  ];
});

const activeCategory = ref('all');
const templateQuery = ref('');

const filteredTemplates = computed(() =>
  props.templates.filter((tpl) =>
    (activeCategory.value === 'all' || tpl.category === activeCategory.value)
    && (!templateQuery.value.trim() || tpl.name.includes(templateQuery.value.trim()) || tpl.sub.includes(templateQuery.value.trim())),
  ),
);
</script>

<template>
  <aside class="col-templates">
    <section class="surface-card pad">
      <p class="col-title">{{ t.categoryTitle }}</p>
      <div class="category-list" role="group" :aria-label="t.categoryAria">
        <button
          v-for="cat in categories"
          :key="cat.key"
          type="button"
          :class="['category-item', { 'is-on': activeCategory === cat.key }]"
          :aria-pressed="activeCategory === cat.key"
          @click="activeCategory = cat.key"
        >
          <Icon :name="cat.icon" :size="15" />
          <span>{{ cat.label }}</span>
          <em>{{ cat.count }}</em>
        </button>
      </div>
    </section>

    <section class="surface-card pad">
      <p class="col-title">{{ t.templateListTitle }}</p>
      <div class="template-search">
        <Icon name="search" :size="14" />
        <input v-model="templateQuery" type="search" :placeholder="t.templateSearchPlaceholder" :aria-label="t.templateSearchAria" />
      </div>
      <div class="template-list">
        <button
          v-for="tpl in filteredTemplates"
          :key="tpl.id"
          type="button"
          :class="['template-item', { 'is-on': activeId === tpl.id }]"
          :aria-pressed="activeId === tpl.id"
          @click="emit('select', tpl)"
        >
          <span class="tpl-icon"><Icon :name="tpl.icon" :size="15" /></span>
          <span class="tpl-copy">
            <strong>{{ tpl.name }}</strong>
            <span>{{ tpl.sub }}</span>
          </span>
          <Icon v-if="activeId === tpl.id" name="star" :size="14" class="tpl-star" />
        </button>
        <p v-if="!filteredTemplates.length" class="empty-note">{{ t.noTemplates }}</p>
      </div>
    </section>
  </aside>
</template>

<style scoped src="./ExploreTemplatePicker.css"></style>
