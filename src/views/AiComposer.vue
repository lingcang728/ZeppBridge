<script setup lang="ts">
/**
 * 交给 AI —— 任务编排页（Beta1）。
 *
 * 布局（02-orbit-composer / 05-dark-composer）：左上是圆球工作台
 * （OrbitCanvas，P5 契约，S3 实现已在 W3 集成接入），
 * 其下是类别卡片列表备用入口；右栏是任务配置面板。
 *
 * 点 member 节点 → 右侧滑出类别配置面板（03-orbit-drag）：窗口天数
 * 7/14/30、是否含运动当天、逐运动窗口预览。
 *
 * 「预览交付」走 `?stage=preview` 查询参数切换（/ai 路由归 S2，本页
 * 内部托管预览子状态，不需要新路由）。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Icon from '../components/Icon.vue';
import SelectMenu, { type SelectMenuOption } from '../components/SelectMenu.vue';
import OrbitCanvas from '../components/orbit/OrbitCanvas.vue';
import type { OrbitNode } from '../lib/orbit/types';
import AiHandoffPreview from './AiHandoffPreview.vue';
import { useAiTaskDraft } from '../composables/useAiTaskDraft';
import { isDesktop, toUserMessage } from '../lib/bridge';
import type { AiTaskCategory, AiTaskDetailLevel } from '../lib/bridge/types';
import {
  AI_TASK_CATEGORY_META,
  AI_TASK_CATEGORY_ORDER,
  CATEGORY_DAY_CHOICES,
  categoryLabel,
  categoryRangeOf,
} from '../lib/aiTask/categories';
import { categoryWindows } from '../lib/aiTask/coverage';
import { pickAttachments } from '../lib/aiTask/attachments';
import { attachmentPlainReferenceNote } from '../lib/aiTask/copy';
import { AI_TASK_PROMPT_MAX } from '../lib/aiTask/draft';
import { templateName } from '../lib/aiTask/prompt';
import { formatDateTime, formatDistance } from '../lib/format';
import { displayableWorkouts, workoutDisplayLabel } from '../lib/workouts';
import { defineMessages, useMessages } from '../i18n';

defineOptions({ name: 'AiComposer' });

const messages = defineMessages(
  {
    pageTitle: '交给 AI',
    pageIntro: '把本地健康数据整理成任务，准备好文件后自己发给 AI。',
    savedTasks: '已保存的任务',
    newTask: '新建任务',
    taskTitle: '任务名称',
    taskTitlePlaceholder: '给这次分析起个名字',
    workoutsTitle: '关联运动',
    workoutsEmpty: '本机还没有运动记录',
    templateTitle: '模板',
    noTemplate: '不使用模板',
    categoriesTitle: '分析内容',
    categoriesEmpty: '拖入或点击类别，把它们加入这次分析',
    promptTitle: '你的问题',
    promptPlaceholder: '想让 AI 分析什么？例如：这次恢复跑的强度合适吗？',
    promptCounter: (used: number, max: number) => `${used}/${max}`,
    attachTitle: '附件原件',
    attachAdd: '添加文件',
    attachPickerTitle: '选择要引用的原件',
    attachFilterName: 'PDF 与图片',
    attachSkipped: (count: number) => `${count} 个文件类型不支持，未加入`,
    attachPickFailed: '附件没有添加成功',
    attachEmpty: '还没有附件。原件只按引用交付，不会复制或脱敏。',
    optionsTitle: '选项',
    preciseGps: '精确路线（GPS 坐标）',
    preciseGpsHint: '默认关闭。打开后导出的轨迹保留原始坐标。',
    detailLevel: '详细程度',
    detailSummary: '摘要',
    detailStandard: '标准',
    detailDetailed: '详细（含逐点序列）',
    mcpShared: '开放给任务限定 MCP',
    mcpSharedHint: '本机 MCP 工具只能查这个任务覆盖的范围。',
    saveTask: '保存任务',
    savedOk: '已保存',
    previewHandoff: '预览交付',
    undoAction: '撤销',
    resetView: '重置视图',
    zoomIn: '放大',
    zoomOut: '缩小',
    cardFallback: '类别列表（备用入口）',
    cardJoin: '加入',
    cardLeave: '移除',
    daysBefore: '回溯天数',
    daysOption: (days: number) => `${days} 天`,
    includeWorkoutDay: '包含运动当天',
    windowPreview: '各运动的窗口',
    noteEditor: '个人说明',
    notePlaceholder: '写给 AI 看的背景：伤病史、目标、近期状态。会和数据一起进导出。',
    attachPanelHint: '添加或移除附件原件。',
    panelClose: '关闭',
    desktopOnly: '连接桌面后端后可保存与预览',
    removeAttachment: '移除',
    generalWindow: '统一窗口',
    eachWorkoutWindow: '按运动分别回溯',
  },
  {
    pageTitle: 'Hand to AI',
    pageIntro: 'Compose an analysis task from local health data, then deliver it to an AI yourself.',
    savedTasks: 'Saved tasks',
    newTask: 'New task',
    taskTitle: 'Task name',
    taskTitlePlaceholder: 'Name this analysis',
    workoutsTitle: 'Linked workouts',
    workoutsEmpty: 'No workouts on this machine yet',
    templateTitle: 'Template',
    noTemplate: 'No template',
    categoriesTitle: 'Analysis contents',
    categoriesEmpty: 'Drag in or click categories to include them',
    promptTitle: 'Your question',
    promptPlaceholder: 'What should the AI analyze? E.g. was this recovery run the right intensity?',
    promptCounter: (used: number, max: number) => `${used}/${max}`,
    attachTitle: 'Original attachments',
    attachAdd: 'Add files',
    attachPickerTitle: 'Choose original files to reference',
    attachFilterName: 'PDF and images',
    attachSkipped: (count: number) => `${count} file(s) skipped — unsupported type`,
    attachPickFailed: 'Could not add the files',
    attachEmpty: 'No attachments yet. Originals are referenced as-is — never copied or redacted.',
    optionsTitle: 'Options',
    preciseGps: 'Precise route (GPS coordinates)',
    preciseGpsHint: 'Off by default. When on, exported tracks keep raw coordinates.',
    detailLevel: 'Detail level',
    detailSummary: 'Summary',
    detailStandard: 'Standard',
    detailDetailed: 'Detailed (includes per-point series)',
    mcpShared: 'Share with task-scoped MCP',
    mcpSharedHint: 'The local MCP tool may only query what this task covers.',
    saveTask: 'Save task',
    savedOk: 'Saved',
    previewHandoff: 'Preview hand-off',
    undoAction: 'Undo',
    resetView: 'Reset view',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    cardFallback: 'Category list (fallback)',
    cardJoin: 'Add',
    cardLeave: 'Remove',
    daysBefore: 'Days before',
    daysOption: (days: number) => `${days} days`,
    includeWorkoutDay: 'Include workout day',
    windowPreview: 'Window per workout',
    noteEditor: 'Personal note',
    notePlaceholder: 'Context for the AI: injury history, goals, recent form. Ships with the data.',
    attachPanelHint: 'Add or remove original attachments.',
    panelClose: 'Close',
    desktopOnly: 'Connect the desktop backend to save and preview',
    removeAttachment: 'Remove',
    generalWindow: 'Shared window',
    eachWorkoutWindow: 'Per-workout lookback',
  },
  {
    pageTitle: 'Pasar a la IA',
    pageIntro: 'Compón una tarea de análisis con tus datos locales y entrégala a la IA tú mismo.',
    savedTasks: 'Tareas guardadas',
    newTask: 'Nueva tarea',
    taskTitle: 'Nombre de la tarea',
    taskTitlePlaceholder: 'Ponle nombre a este análisis',
    workoutsTitle: 'Entrenamientos vinculados',
    workoutsEmpty: 'Aún no hay entrenamientos en este equipo',
    templateTitle: 'Plantilla',
    noTemplate: 'Sin plantilla',
    categoriesTitle: 'Contenido del análisis',
    categoriesEmpty: 'Arrastra o pulsa categorías para incluirlas',
    promptTitle: 'Tu pregunta',
    promptPlaceholder: '¿Qué debe analizar la IA? Por ejemplo: ¿fue adecuada la intensidad de esta recuperación?',
    promptCounter: (used: number, max: number) => `${used}/${max}`,
    attachTitle: 'Adjuntos originales',
    attachAdd: 'Añadir archivos',
    attachPickerTitle: 'Elige los originales a referenciar',
    attachFilterName: 'PDF e imágenes',
    attachSkipped: (count: number) => `${count} archivo(s) omitidos — tipo no admitido`,
    attachPickFailed: 'No se pudieron añadir los archivos',
    attachEmpty: 'Sin adjuntos. Los originales se referencian tal cual: no se copian ni se redactan.',
    optionsTitle: 'Opciones',
    preciseGps: 'Ruta precisa (coordenadas GPS)',
    preciseGpsHint: 'Desactivado por defecto. Al activarlo, las trazas conservan las coordenadas.',
    detailLevel: 'Nivel de detalle',
    detailSummary: 'Resumen',
    detailStandard: 'Estándar',
    detailDetailed: 'Detallado (incluye series por punto)',
    mcpShared: 'Compartir con MCP de tarea',
    mcpSharedHint: 'La herramienta MCP local solo consulta lo que cubre esta tarea.',
    saveTask: 'Guardar tarea',
    savedOk: 'Guardado',
    previewHandoff: 'Vista de entrega',
    undoAction: 'Deshacer',
    resetView: 'Restablecer vista',
    zoomIn: 'Acercar',
    zoomOut: 'Alejar',
    cardFallback: 'Lista de categorías (alternativa)',
    cardJoin: 'Añadir',
    cardLeave: 'Quitar',
    daysBefore: 'Días previos',
    daysOption: (days: number) => `${days} días`,
    includeWorkoutDay: 'Incluir el día del entrenamiento',
    windowPreview: 'Ventana por entrenamiento',
    noteEditor: 'Nota personal',
    notePlaceholder: 'Contexto para la IA: lesiones, objetivos, estado reciente. Se exporta con los datos.',
    attachPanelHint: 'Añade o quita adjuntos originales.',
    panelClose: 'Cerrar',
    desktopOnly: 'Conecta el backend de escritorio para guardar y previsualizar',
    removeAttachment: 'Quitar',
    generalWindow: 'Ventana común',
    eachWorkoutWindow: 'Ventana por entrenamiento',
  },
);
const t = useMessages(messages);

const route = useRoute();
const router = useRouter();
const stage = computed(() => (route.query.stage === 'preview' ? 'preview' : 'compose'));

const {
  draft, canUndo, taskList, templates, recentWorkouts, busy, lastError, savedNotice,
  loadTaskList, loadTemplates, loadRecentWorkouts, loadTask, resetDraft, saveDraft,
  setTemplateId, setCategoryEnabled, setCategoryDays, setIncludeWorkoutDay, undo,
  toggleWorkout, setPrompt, setPersonalNote, setTitle, setDetailLevel,
  setPreciseGps, setMcpShared, addAttachments, removeAttachment,
} = useAiTaskDraft();

const zoom = ref(1);
const activeCategory = ref<AiTaskCategory | null>(null);
const attachNotice = ref<string | null>(null);
const desktop = isDesktop();

/* —— 轨道节点：一个类别一个节点；member = 已启用 —— */
const orbitNodes = computed<OrbitNode[]>(() =>
  AI_TASK_CATEGORY_ORDER.map((category) => {
    const meta = AI_TASK_CATEGORY_META[category];
    const range = categoryRangeOf(draft.value.categories, category);
    return {
      id: category,
      category,
      label: categoryLabel(category),
      sublabel: meta.hasWindow && range.enabled ? t.value.daysOption(range.days_before) : undefined,
      icon: meta.icon,
      state: range.enabled ? 'member' : 'candidate',
      count: category === 'attachment' && draft.value.attachments.length
        ? draft.value.attachments.length
        : undefined,
    };
  }),
);

const orbitCenter = computed(() => ({
  label: draft.value.title.trim() || t.value.taskTitle,
  sublabel: draft.value.workout_ids.length
    ? `${draft.value.workout_ids.length} ${categoryLabel('workout')}`
    : undefined,
}));

const asCategory = (id: string): AiTaskCategory | null =>
  (AI_TASK_CATEGORY_ORDER as readonly string[]).includes(id) ? (id as AiTaskCategory) : null;

const onNodeJoin = (id: string) => {
  const category = asCategory(id);
  if (category) setCategoryEnabled(category, true);
};
const onNodeLeave = (id: string) => {
  const category = asCategory(id);
  if (category) setCategoryEnabled(category, false);
};
const onNodeOpen = (id: string) => {
  const category = asCategory(id);
  activeCategory.value = category;
};
const onNodeFocus = () => undefined;
const onUndo = () => undo();
const onZoom = (value: number) => {
  zoom.value = Math.min(1.8, Math.max(0.6, value));
};

/* 侧栏里的回调：activeCategory 在脚本层就是 AiTaskCategory，不做模板窄化。 */
const setActiveDays = (days: number) => {
  if (activeCategory.value) setCategoryDays(activeCategory.value, days);
};
const setActiveIncludeDay = (include: boolean) => {
  if (activeCategory.value) setIncludeWorkoutDay(activeCategory.value, include);
};

/* —— 类别配置侧栏 —— */
const activeRange = computed(() =>
  activeCategory.value ? categoryRangeOf(draft.value.categories, activeCategory.value) : null);
const activeMeta = computed(() =>
  activeCategory.value ? AI_TASK_CATEGORY_META[activeCategory.value] : null);

const windowPreview = computed(() => {
  if (!activeCategory.value || !activeRange.value) return [];
  const workouts = draft.value.workout_ids
    .map((id) => recentWorkouts.value.find((workout) => workout.workout_id === id))
    .filter((workout): workout is NonNullable<typeof workout> => Boolean(workout))
    .map((workout) => ({ id: workout.workout_id, start_time: workout.start_time }));
  return categoryWindows(draft.value.workout_ids, workouts, activeRange.value);
});

const workoutTitle = (workoutId: string): string => {
  const workout = recentWorkouts.value.find((item) => item.workout_id === workoutId);
  return workout ? workoutDisplayLabel(workout) : workoutId;
};

/* —— 右栏数据 —— */
const workoutChoices = computed(() => displayableWorkouts(recentWorkouts.value));

const templateOptions = computed<SelectMenuOption[]>(() => [
  { value: '', label: t.value.noTemplate },
  ...templates.value.map((template) => ({
    value: template.id,
    label: templateName(template),
  })),
]);
const selectedTemplateId = computed({
  get: () => draft.value.template_id ?? '',
  // 「不使用模板」也要真的摘掉 template_id，不是选了等于没选。
  set: (id: string | number) => setTemplateId(String(id) || null),
});

const detailOptions = computed<SelectMenuOption[]>(() => [
  { value: 'summary', label: t.value.detailSummary },
  { value: 'standard', label: t.value.detailStandard },
  { value: 'detailed', label: t.value.detailDetailed },
]);
const detailLevel = computed({
  get: () => draft.value.detail_level,
  set: (value: string | number) => setDetailLevel(value as AiTaskDetailLevel),
});

const enabledCategories = computed(() =>
  AI_TASK_CATEGORY_ORDER.filter(
    (category) => categoryRangeOf(draft.value.categories, category).enabled,
  ));

/* 附件视图模型：display_name 是用户文件名——不进模板字段直取，
   这里改名成 name 再渲染。 */
const attachmentRows = computed(() =>
  draft.value.attachments.map(({ display_name: name, ...rest }) => ({ ...rest, name })));

const pickMoreAttachments = async () => {
  attachNotice.value = null;
  try {
    const { added, skipped } = await pickAttachments(t.value.attachPickerTitle, t.value.attachFilterName);
    addAttachments(added);
    if (skipped.length) attachNotice.value = t.value.attachSkipped(skipped.length);
  } catch (error) {
    // 「需要桌面应用」只在真不在桌面时成立；桌面上对话框/磁盘错误报真实原因。
    attachNotice.value = desktop ? toUserMessage(error, t.value.attachPickFailed) : t.value.desktopOnly;
  }
};

const save = async () => {
  try {
    await saveDraft();
  } catch {
    // lastError 已写好，界面底部会显示。
  }
};

const openPreview = () => {
  const query = { ...route.query, stage: 'preview' };
  void router.push({ path: route.path, query });
};
const exitPreview = () => {
  const query = { ...route.query };
  delete query.stage;
  void router.replace({ path: route.path, query });
};

onMounted(() => {
  void loadTemplates();
  void loadTaskList();
  void loadRecentWorkouts();
  const taskId = route.query.task;
  if (typeof taskId === 'string' && taskId) {
    void loadTask(taskId).catch(() => undefined);
  }
});

/* 换路由里的 task 参数时载入对应草稿（任务列表点进来的场景）。 */
watch(
  () => route.query.task,
  (taskId) => {
    if (typeof taskId === 'string' && taskId && taskId !== draft.value.id) {
      void loadTask(taskId).catch(() => undefined);
    }
  },
);
</script>

<template>
  <section class="page ai-composer" aria-labelledby="ai-composer-title">
    <AiHandoffPreview v-if="stage === 'preview'" @back="exitPreview" />
    <template v-else>
      <header class="page-head">
        <h1 id="ai-composer-title">{{ t.pageTitle }}</h1>
        <p class="page-intro">{{ t.pageIntro }}</p>
      </header>

      <div class="composer-layout">
        <!-- 左列：圆球工作台 + 备用类别列表 -->
        <div class="composer-main">
          <div class="orbit-host surface-card">
            <div class="orbit-toolbar">
              <button type="button" class="tool-btn" :disabled="!canUndo" @click="onUndo">
                <Icon name="refresh" :size="14" />{{ t.undoAction }}
              </button>
              <span class="toolbar-gap" />
              <button type="button" class="tool-btn" :aria-label="t.zoomOut" @click="onZoom(zoom - 0.1)">
                <span aria-hidden="true">−</span>
              </button>
              <button type="button" class="tool-btn" @click="onZoom(1)">{{ t.resetView }}</button>
              <button type="button" class="tool-btn" :aria-label="t.zoomIn" @click="onZoom(zoom + 0.1)">
                <span aria-hidden="true">+</span>
              </button>
            </div>
            <OrbitCanvas
              :center="orbitCenter"
              :nodes="orbitNodes"
              :zoom="zoom"
              :active-id="activeCategory"
              @update:zoom="onZoom"
              @node-join="onNodeJoin"
              @node-leave="onNodeLeave"
              @node-open="onNodeOpen"
              @node-focus="onNodeFocus"
              @undo="onUndo"
            />

            <!-- 类别配置侧栏（03-orbit-drag） -->
            <aside v-if="activeCategory && activeRange && activeMeta" class="cat-panel" role="dialog" :aria-label="categoryLabel(activeCategory)">
              <div class="cat-panel-head">
                <Icon :name="activeMeta.icon" :size="16" />
                <strong>{{ categoryLabel(activeCategory) }}</strong>
                <span class="toolbar-gap" />
                <button type="button" class="tool-btn" :aria-label="t.panelClose" @click="activeCategory = null">
                  <Icon name="x" :size="14" />
                </button>
              </div>

              <template v-if="activeMeta.hasWindow">
                <p class="cat-label">{{ t.daysBefore }}</p>
                <div class="seg" role="radiogroup" :aria-label="t.daysBefore">
                  <button
                    v-for="days in CATEGORY_DAY_CHOICES"
                    :key="days"
                    type="button"
                    role="radio"
                    :aria-checked="activeRange.days_before === days"
                    :class="['seg-item', { 'is-on': activeRange.days_before === days }]"
                    @click="setActiveDays(days)"
                  >{{ t.daysOption(days) }}</button>
                </div>
                <label class="check-row">
                  <input
                    type="checkbox"
                    :checked="activeRange.include_workout_day"
                    @change="setActiveIncludeDay(($event.target as HTMLInputElement).checked)"
                  />
                  <span>{{ t.includeWorkoutDay }}</span>
                </label>
                <template v-if="windowPreview.length">
                  <p class="cat-label">{{ t.windowPreview }}</p>
                  <ul class="window-list">
                    <li v-for="win in windowPreview" :key="win.workoutId">
                      <span class="win-title">{{ workoutTitle(win.workoutId) }}</span>
                      <span class="win-range">{{ win.start }} ~ {{ win.end }}</span>
                    </li>
                  </ul>
                </template>
              </template>

              <template v-else-if="activeCategory === 'personal_note'">
                <p class="cat-label">{{ t.noteEditor }}</p>
                <textarea
                  class="note-input"
                  :value="draft.personal_note"
                  :placeholder="t.notePlaceholder"
                  rows="6"
                  @input="setPersonalNote(($event.target as HTMLTextAreaElement).value)"
                ></textarea>
              </template>

              <template v-else-if="activeCategory === 'attachment'">
                <p class="cat-label">{{ t.attachPanelHint }}</p>
                <ul v-if="attachmentRows.length" class="attach-list">
                  <li v-for="att in attachmentRows" :key="att.id">
                    <Icon :name="att.kind === 'pdf' ? 'file' : 'pin'" :size="14" />
                    <span class="att-name">{{ att.name }}</span>
                    <button type="button" class="tool-btn" @click="removeAttachment(att.id)">{{ t.removeAttachment }}</button>
                  </li>
                </ul>
                <button type="button" class="button button-secondary" @click="pickMoreAttachments">
                  <Icon name="plus" :size="14" />{{ t.attachAdd }}
                </button>
              </template>
            </aside>
          </div>

          <!-- 备用入口：类别卡片列表 -->
          <section class="surface-card pad">
            <p class="col-title">{{ t.cardFallback }}</p>
            <div class="cat-cards">
              <div
                v-for="category in AI_TASK_CATEGORY_ORDER"
                :key="category"
                :class="['cat-card', { 'is-on': categoryRangeOf(draft.categories, category).enabled }]"
              >
                <button type="button" class="cat-card-open" @click="activeCategory = category">
                  <Icon :name="AI_TASK_CATEGORY_META[category].icon" :size="16" />
                  <span class="cat-card-label">{{ categoryLabel(category) }}</span>
                  <span v-if="AI_TASK_CATEGORY_META[category].hasWindow && categoryRangeOf(draft.categories, category).enabled" class="cat-card-sub">
                    {{ t.daysOption(categoryRangeOf(draft.categories, category).days_before) }}
                  </span>
                </button>
                <button
                  type="button"
                  class="tool-btn"
                  @click="categoryRangeOf(draft.categories, category).enabled ? onNodeLeave(category) : onNodeJoin(category)"
                >{{ categoryRangeOf(draft.categories, category).enabled ? t.cardLeave : t.cardJoin }}</button>
              </div>
            </div>
          </section>
        </div>

        <!-- 右栏：任务配置 -->
        <aside class="composer-side">
          <section v-if="taskList.length" class="surface-card pad">
            <div class="side-head">
              <p class="col-title">{{ t.savedTasks }}</p>
              <button type="button" class="tool-btn" @click="resetDraft()">{{ t.newTask }}</button>
            </div>
            <div class="task-list">
              <button
                v-for="task in taskList"
                :key="task.id"
                type="button"
                :class="['task-item', { 'is-on': task.id === draft.id }]"
                @click="loadTask(task.id).catch(() => undefined)"
              >
                <span class="task-name">{{ task.title }}</span>
                <span class="task-sub">{{ task.workout_count }} · {{ task.updated_at.slice(0, 10) }}</span>
              </button>
            </div>
          </section>
          <section v-else class="surface-card pad">
            <button type="button" class="tool-btn" @click="resetDraft()">{{ t.newTask }}</button>
          </section>

          <section class="surface-card pad">
            <label class="field-label" for="task-title">{{ t.taskTitle }}</label>
            <input
              id="task-title"
              class="text-input"
              type="text"
              :value="draft.title"
              :placeholder="t.taskTitlePlaceholder"
              @input="setTitle(($event.target as HTMLInputElement).value)"
            />

            <p class="col-title">{{ t.workoutsTitle }}</p>
            <div v-if="workoutChoices.length" class="workout-list">
              <label v-for="workout in workoutChoices" :key="workout.workout_id" class="workout-item">
                <input
                  type="checkbox"
                  :checked="draft.workout_ids.includes(workout.workout_id)"
                  @change="toggleWorkout(workout.workout_id)"
                />
                <span class="workout-copy">
                  <span>{{ workoutDisplayLabel(workout) }}</span>
                  <span class="workout-sub">
                    {{ formatDateTime(workout.start_time) }}<template v-if="workout.distance_meters"> · {{ formatDistance(workout.distance_meters) }}</template>
                  </span>
                </span>
              </label>
            </div>
            <p v-else class="empty-note">{{ t.workoutsEmpty }}</p>

            <p class="col-title">{{ t.templateTitle }}</p>
            <SelectMenu v-model="selectedTemplateId" :options="templateOptions" :aria-label="t.templateTitle" />

            <p class="col-title">{{ t.categoriesTitle }}</p>
            <div v-if="enabledCategories.length" class="chip-list">
              <button
                v-for="category in enabledCategories"
                :key="category"
                type="button"
                class="chip"
                @click="activeCategory = category"
              >
                <Icon :name="AI_TASK_CATEGORY_META[category].icon" :size="13" />
                {{ categoryLabel(category) }}
              </button>
            </div>
            <p v-else class="empty-note">{{ t.categoriesEmpty }}</p>

            <p class="col-title">{{ t.promptTitle }}</p>
            <textarea
              class="prompt-input"
              :value="draft.prompt"
              :maxlength="AI_TASK_PROMPT_MAX"
              :placeholder="t.promptPlaceholder"
              rows="4"
              @input="setPrompt(($event.target as HTMLTextAreaElement).value)"
            ></textarea>
            <p class="prompt-counter">{{ t.promptCounter(draft.prompt.length, AI_TASK_PROMPT_MAX) }}</p>

            <p class="col-title">{{ t.attachTitle }}</p>
            <ul v-if="attachmentRows.length" class="attach-list">
              <li v-for="att in attachmentRows" :key="att.id">
                <Icon :name="att.kind === 'pdf' ? 'file' : 'pin'" :size="14" />
                <span class="att-name">{{ att.name }}</span>
                <button type="button" class="tool-btn" @click="removeAttachment(att.id)">{{ t.removeAttachment }}</button>
              </li>
            </ul>
            <p v-else class="empty-note">{{ t.attachEmpty }}</p>
            <button type="button" class="button button-secondary" @click="pickMoreAttachments">
              <Icon name="plus" :size="14" />{{ t.attachAdd }}
            </button>
            <p class="attach-note"><Icon name="shield" :size="13" />{{ attachmentPlainReferenceNote() }}</p>
            <p v-if="attachNotice" class="empty-note" role="status">{{ attachNotice }}</p>

            <p class="col-title">{{ t.optionsTitle }}</p>
            <label class="check-row">
              <input type="checkbox" :checked="draft.include_precise_gps" @change="setPreciseGps(($event.target as HTMLInputElement).checked)" />
              <span>{{ t.preciseGps }}</span>
            </label>
            <p class="field-hint">{{ t.preciseGpsHint }}</p>
            <label class="check-row">
              <input type="checkbox" :checked="draft.mcp_shared" @change="setMcpShared(($event.target as HTMLInputElement).checked)" />
              <span>{{ t.mcpShared }}</span>
            </label>
            <p class="field-hint">{{ t.mcpSharedHint }}</p>
            <p class="field-label">{{ t.detailLevel }}</p>
            <SelectMenu v-model="detailLevel" :options="detailOptions" :aria-label="t.detailLevel" />
          </section>

          <section class="surface-card pad actions">
            <button type="button" class="button button-secondary" :disabled="busy === 'save' || !desktop" @click="save">
              <Icon name="check" :size="14" />{{ t.saveTask }}
            </button>
            <button type="button" class="button button-primary" :disabled="!desktop" @click="openPreview">
              <Icon name="send" :size="14" />{{ t.previewHandoff }}
            </button>
            <p v-if="savedNotice" class="action-note ok" role="status"><Icon name="circle-check" :size="13" />{{ t.savedOk }}</p>
            <p v-if="lastError" class="action-note bad" role="alert"><Icon name="warning" :size="13" />{{ lastError }}</p>
            <p v-if="!desktop" class="empty-note">{{ t.desktopOnly }}</p>
          </section>
        </aside>
      </div>
    </template>
  </section>
</template>

<style scoped>
.page { padding: 24px; min-width: 0; }
.page-head { margin-bottom: 16px; }
.page-head h1 { margin: 0 0 4px; font-size: var(--fs-3xl); }
.page-intro { margin: 0; color: var(--muted); }

.composer-layout { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 16px; align-items: start; }
.composer-main { display: grid; gap: 16px; min-width: 0; }
.composer-side { display: grid; gap: 16px; min-width: 0; }
.surface-card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-md); }
.pad { padding: 16px; }

.orbit-host { position: relative; min-height: 480px; display: flex; flex-direction: column; overflow: hidden; }
.orbit-toolbar { display: flex; align-items: center; gap: 6px; padding: 10px 12px; border-bottom: 1px solid var(--line); }
.toolbar-gap { flex: 1; }
.tool-btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 5px 10px; border: 1px solid var(--line-control); border-radius: 8px;
  background: var(--surface-raised); color: var(--muted); font-size: var(--fs-sm); cursor: pointer;
}
.tool-btn:hover:not(:disabled) { color: var(--ink); border-color: var(--accent); }
.tool-btn:disabled { opacity: .45; cursor: not-allowed; }

.cat-panel {
  position: absolute; top: 48px; right: 12px; width: 300px; max-height: calc(100% - 60px);
  overflow-y: auto; padding: 14px;
  background: var(--surface-raised); border: 1px solid var(--line-strong); border-radius: var(--radius-md);
  box-shadow: 0 18px 44px rgba(4, 6, 8, .55); z-index: 5;
}
.cat-panel-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; color: var(--ink); }
.cat-label { margin: 12px 0 6px; color: var(--muted); font-size: var(--fs-sm); }
.seg { display: flex; gap: 6px; }
.seg-item {
  flex: 1; padding: 7px 0; border: 1px solid var(--line-control); border-radius: 8px;
  background: var(--surface); color: var(--muted); font-size: var(--fs-sm); cursor: pointer;
}
.seg-item.is-on { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
.check-row { display: flex; align-items: center; gap: 8px; margin-top: 10px; color: var(--ink); font-size: var(--fs-sm); cursor: pointer; }
.check-row input { accent-color: var(--accent); width: 16px; height: 16px; }
.window-list { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
.window-list li { display: grid; gap: 2px; padding: 8px 10px; background: var(--surface); border-radius: 8px; }
.win-title { color: var(--ink); font-size: var(--fs-sm); }
.win-range { color: var(--subtle); font-size: var(--fs-xs); font-family: var(--font-mono); }
.note-input, .prompt-input, .text-input {
  width: 100%; padding: 9px 11px; border: 1px solid var(--line-control); border-radius: var(--radius-sm);
  background: var(--surface-raised); color: var(--ink); font: inherit; font-size: var(--fs-md); resize: vertical;
}
.note-input:focus, .prompt-input:focus, .text-input:focus { border-color: var(--accent); outline: none; }

.cat-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.cat-card {
  display: flex; align-items: center; gap: 8px; padding: 10px 12px;
  border: 1px solid var(--line); border-radius: var(--radius-sm); color: var(--muted);
}
.cat-card.is-on { border-color: color-mix(in srgb, var(--accent) 40%, transparent); color: var(--ink); }
.cat-card-label { flex: 1; min-width: 0; font-size: var(--fs-sm); }
.cat-card-sub { color: var(--subtle); font-size: var(--fs-xs); }

.col-title { margin: 14px 0 8px; color: var(--muted); font-size: var(--fs-sm); font-weight: 600; }
.col-title:first-child { margin-top: 0; }
.field-label { display: block; margin: 0 0 6px; color: var(--muted); font-size: var(--fs-sm); font-weight: 600; }
.field-hint { margin: 4px 0 10px; color: var(--subtle); font-size: var(--fs-xs); }
.side-head { display: flex; align-items: center; justify-content: space-between; }
.side-head .col-title { margin: 0; }
.task-list { display: grid; gap: 6px; margin-top: 10px; max-height: 200px; overflow-y: auto; }
.task-item { display: grid; gap: 2px; padding: 8px 10px; text-align: left; border: 1px solid var(--line); border-radius: 8px; background: var(--surface-raised); color: var(--ink); cursor: pointer; }
.task-item.is-on { border-color: var(--accent); }
.task-name { font-size: var(--fs-sm); overflow-wrap: anywhere; }
.task-sub { color: var(--subtle); font-size: var(--fs-xs); }

.workout-list { display: grid; gap: 4px; max-height: 220px; overflow-y: auto; }
.workout-item { display: flex; align-items: center; gap: 9px; padding: 7px 8px; border-radius: 8px; cursor: pointer; }
.workout-item:hover { background: var(--surface-hover); }
.workout-item input { accent-color: var(--accent); width: 16px; height: 16px; flex: 0 0 auto; }
.workout-copy { display: grid; min-width: 0; font-size: var(--fs-sm); color: var(--ink); }
.workout-sub { color: var(--subtle); font-size: var(--fs-xs); }

.chip-list { display: flex; flex-wrap: wrap; gap: 6px; }
.chip {
  display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent); border-radius: 999px;
  background: var(--accent-soft); color: var(--ink); font-size: var(--fs-sm); cursor: pointer;
}
.chip:hover { border-color: var(--accent); }

.prompt-counter { margin: 4px 0 0; text-align: right; color: var(--subtle); font-size: var(--fs-xs); }
.attach-list { margin: 0 0 8px; padding: 0; list-style: none; display: grid; gap: 6px; }
.attach-list li { display: flex; align-items: center; gap: 8px; padding: 7px 9px; background: var(--surface-raised); border-radius: 8px; }
.att-name { flex: 1; min-width: 0; font-size: var(--fs-sm); color: var(--ink); overflow-wrap: anywhere; }
.attach-note { display: flex; align-items: flex-start; gap: 6px; margin: 8px 0 0; color: var(--subtle); font-size: var(--fs-xs); }
.empty-note { margin: 6px 0; color: var(--subtle); font-size: var(--fs-sm); }

.actions { display: grid; gap: 10px; }
.actions .button { justify-content: center; }
.button {
  display: inline-flex; align-items: center; gap: 7px; padding: 9px 16px;
  border: 1px solid var(--line-control); border-radius: var(--radius-sm);
  font-size: var(--fs-md); cursor: pointer;
}
.button-secondary { background: var(--surface-raised); color: var(--ink); }
.button-secondary:hover:not(:disabled) { border-color: var(--accent); }
.button-primary { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); font-weight: 600; }
.button-primary:hover:not(:disabled) { background: var(--accent-hover); }
.button:disabled { opacity: .5; cursor: not-allowed; }
.action-note { display: flex; align-items: center; gap: 6px; margin: 0; font-size: var(--fs-sm); }
.action-note.ok { color: var(--accent); }
.action-note.bad { color: var(--danger); }

@media (max-width: 1100px) {
  .composer-layout { grid-template-columns: 1fr; }
}
</style>
