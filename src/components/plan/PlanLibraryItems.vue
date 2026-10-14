<script setup lang="ts">
/**
 * 浮层里「加一条训练」那一段：存过的模板一行一个（点名字加到这一天，右边垃圾桶删模板），最后一行从文件导入。
 * 单天页的「⋯」和没有计划时的周视图共用。
 */
import Icon from '../Icon.vue';
import type { PlanTemplate } from '../../lib/trainingPlan/templates';
import { useLibraryText } from './library.i18n';

defineProps<{ templates: PlanTemplate[] }>();
const emit = defineEmits<{ place: [template: PlanTemplate]; remove: [id: string]; import: [] }>();
const l = useLibraryText();
const ICONS: Record<string, 'run' | 'bike' | 'swim'> = { running: 'run', cycling: 'bike', pool_swim: 'swim', open_water_swim: 'swim' };
</script>

<template>
  <p class="pop-label">{{ l.addTitle }}</p>
  <div v-for="template in templates" :key="template.id" class="template-row">
    <button type="button" class="menu-item" data-pop-item @click="emit('place', template)">
      <Icon :name="ICONS[template.workout.sport] ?? 'activity'" :size="14" /><span class="name">{{ template.workout.name }}</span>
    </button>
    <button type="button" class="remove" :aria-label="l.removeTemplate(template.workout.name)" :title="l.removeTemplate(template.workout.name)" @click="emit('remove', template.id)">
      <Icon name="trash" :size="13" />
    </button>
  </div>
  <button type="button" class="menu-item" data-pop-item @click="emit('import')"><Icon name="file" :size="14" />{{ l.importFile }}</button>
</template>

<style scoped>
.pop-label { margin: 4px 12px 2px; color: var(--muted); font-size: var(--fs-xs); }
.template-row { display: flex; align-items: center; }
.template-row .menu-item { flex: 1; min-width: 0; }
.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.menu-item { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 38px; padding: 0 12px; border: 0; border-radius: 12px; background: none; color: var(--ink);
  font: inherit; font-size: var(--fs-sm); text-align: left; cursor: pointer; }
.menu-item:hover { background: var(--glass-press); }
.menu-item:focus-visible, .remove:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
.remove { display: grid; flex: none; width: 32px; height: 32px; place-items: center; border: 0; border-radius: 10px; background: none; color: var(--muted); cursor: pointer; opacity: 0; transition: opacity var(--dur-fast, 120ms) ease; }
.template-row:hover .remove, .remove:focus-visible { opacity: 1; }
.remove:hover { background: var(--glass-press); color: var(--danger); }
@media (hover: none) { .remove { opacity: 1; } }
</style>
