<script setup lang="ts">
/**
 * 交付预览（04-handoff-preview）。
 *
 * 这一页存在的意义是「实话实说」：
 *   - 文件准备好了 ≠ 已发送；
 *   - 提示词复制了 ≠ 已上传；
 *   - 附件只能由用户在 AI 站点上手动添加。
 * 所以三步各自独立成状态、各自可重试；主按钮只做它真做的事：
 * 准备文件 → 复制提示词 → 打开那个网站。
 *
 * 草稿是 useAiTaskDraft 的单例——从编排页过来时它是同一份。
 * 挂载/草稿变化时拉 `ai_task_preview` 刷新覆盖表与附件体检。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Icon from '../components/Icon.vue';
import { useAiTaskDraft } from '../composables/useAiTaskDraft';
import { useAiTaskHandoff } from '../composables/useAiTaskHandoff';
import { isDesktop } from '../lib/bridge';
import { AI_PROVIDERS, type AiProvider } from '../lib/aiProviders';
import { aiTaskIssueText } from '../lib/aiTask/copy';
import { coverageRows, formatBytes } from '../lib/aiTask/coverage';
import { attachmentPlainReferenceNote } from '../lib/aiTask/copy';
import { pickAttachments } from '../lib/aiTask/attachments';
import { taskSnapshot, AI_TASK_PROMPT_MAX } from '../lib/aiTask/draft';
import { defineMessages, useMessages } from '../i18n';

defineOptions({ name: 'AiHandoffPreview' });

const emit = defineEmits<{ (event: 'back'): void }>();

const messages = defineMessages(
  {
    pageTitle: '交付预览',
    backToCompose: '返回编辑',
    refreshPreview: '刷新预览',
    coverageTitle: '数据范围',
    coverageEmpty: '当前选择没有覆盖任何类别',
    colCategory: '类别',
    colWorkout: '运动',
    colWindow: '时间窗',
    colCoverage: '覆盖',
    colSources: '来源',
    colUnits: '单位',
    colState: '状态',
    coverageCount: (withData: number, inRange: number) => `${withData}/${inRange} 天`,
    stateMissing: '缺失',
    stateOk: '有数据',
    globalWindow: '全部记录',
    attachTitle: '附件原件',
    attachMissingTitle: '附件需要处理',
    attachMissingBody: '下面的原件在本机找不到了。重新选择文件，或明确移除这条引用——不会带着缺失文件继续。',
    attachChangedBody: '下面的原件大小变了。请确认还是同一份文件，或重新选择。',
    attachReselect: '重新选择',
    attachRemove: '移除',
    attachPickerTitle: '重新选择原件',
    attachFilterName: 'PDF 与图片',
    attachStatusOk: '就位',
    attachStatusMissing: '找不到',
    attachStatusChanged: '已变化',
    attachManualNote: '这些文件不会被上传。准备好后，请自己在 AI 对话里添加。',
    gpsTitle: '精确路线',
    gpsOff: '未包含 GPS 坐标（默认）',
    gpsOn: '将包含原始 GPS 坐标',
    promptTitle: '提示词',
    promptHint: '可以在这里最后改一遍；复制的就是这一段。',
    promptCounter: (used: number, max: number) => `${used}/${max}`,
    providerTitle: '交付给谁',
    stepsTitle: '交付步骤',
    stepPrepare: '准备文件',
    stepCopy: '复制提示词',
    stepAttach: '手动添加附件',
    stepIdle: '未开始',
    stepDoing: '进行中',
    stepDone: '完成',
    stepFailed: '失败',
    stepBlocked: '被阻塞',
    stepWaiting: '等你确认',
    retry: '重试',
    attachConfirm: '我已在 AI 对话里添加附件',
    attachConfirmDone: '已确认添加',
    openOutcomeOpened: (label: string) => `已在浏览器打开 ${label}——还没有发送任何东西`,
    openOutcomeSkipped: '网页预览不能替你打开浏览器；文件与提示词已就绪',
    openOutcomeFailed: '浏览器没有打开成，可以重试',
    outputTitle: '已生成的文件',
    outputDir: '输出目录',
    outputSize: '大小',
    ctaMain: (label: string) => `准备文件并打开 ${label}`,
    ctaExportOnly: '仅导出文件',
    ctaHonestNote: '打开网站不等于发送：文件在你机器上，要发什么由你在 AI 页面里决定。',
    staleNotice: '草稿在准备之后又改过了——下面列出的文件还是旧的。重新准备后再交付。',
    reprepare: '重新准备',
    previewLoadingText: '正在统计覆盖范围…',
    previewFailedTitle: '预览生成失败',
    desktopOnly: '连接桌面后端后才能准备交付文件',
    unsavedNote: '这是未保存的草稿，预览照常工作；保存后才能出现在任务列表里。',
    taskUntitled: '未命名任务',
    estimatedSize: '预计导出大小',
  },
  {
    pageTitle: 'Hand-off preview',
    backToCompose: 'Back to editing',
    refreshPreview: 'Refresh preview',
    coverageTitle: 'Data coverage',
    coverageEmpty: 'The current selection covers no categories',
    colCategory: 'Category',
    colWorkout: 'Workout',
    colWindow: 'Window',
    colCoverage: 'Coverage',
    colSources: 'Sources',
    colUnits: 'Units',
    colState: 'State',
    coverageCount: (withData: number, inRange: number) => `${withData}/${inRange} days`,
    stateMissing: 'Missing',
    stateOk: 'Has data',
    globalWindow: 'All records',
    attachTitle: 'Original attachments',
    attachMissingTitle: 'Attachments need attention',
    attachMissingBody: 'These originals can no longer be found. Reselect the file or remove the reference — hand-off will not proceed silently.',
    attachChangedBody: 'These originals have a different size now. Confirm it is still the same file, or reselect it.',
    attachReselect: 'Reselect',
    attachRemove: 'Remove',
    attachPickerTitle: 'Reselect the original file',
    attachFilterName: 'PDF and images',
    attachStatusOk: 'Ready',
    attachStatusMissing: 'Not found',
    attachStatusChanged: 'Changed',
    attachManualNote: 'These files are never uploaded. Once prepared, add them to the AI conversation yourself.',
    gpsTitle: 'Precise route',
    gpsOff: 'GPS coordinates excluded (default)',
    gpsOn: 'Raw GPS coordinates will be included',
    promptTitle: 'Prompt',
    promptHint: 'You can still edit it here — this is exactly what gets copied.',
    promptCounter: (used: number, max: number) => `${used}/${max}`,
    providerTitle: 'Deliver to',
    stepsTitle: 'Hand-off steps',
    stepPrepare: 'Prepare files',
    stepCopy: 'Copy prompt',
    stepAttach: 'Add attachments manually',
    stepIdle: 'Not started',
    stepDoing: 'Working',
    stepDone: 'Done',
    stepFailed: 'Failed',
    stepBlocked: 'Blocked',
    stepWaiting: 'Waiting for you',
    retry: 'Retry',
    attachConfirm: 'I added the attachments in the AI conversation',
    attachConfirmDone: 'Confirmed added',
    openOutcomeOpened: (label: string) => `${label} opened in your browser — nothing was sent`,
    openOutcomeSkipped: 'A web preview cannot open a browser for you; files and prompt are ready',
    openOutcomeFailed: 'The browser did not open — you can retry',
    outputTitle: 'Generated files',
    outputDir: 'Output folder',
    outputSize: 'Size',
    ctaMain: (label: string) => `Prepare files and open ${label}`,
    ctaExportOnly: 'Export files only',
    ctaHonestNote: 'Opening the site is not sending: the files stay on your machine; you decide what to hand over in the AI page.',
    staleNotice: 'The draft changed after preparation — the files listed below are stale. Prepare again before handing off.',
    reprepare: 'Prepare again',
    previewLoadingText: 'Measuring coverage…',
    previewFailedTitle: 'Could not build the preview',
    desktopOnly: 'Connect the desktop backend to prepare hand-off files',
    unsavedNote: 'This is an unsaved draft — preview works anyway; save it to keep it in the task list.',
    taskUntitled: 'Untitled task',
    estimatedSize: 'Estimated export size',
  },
  {
    pageTitle: 'Vista de entrega',
    backToCompose: 'Volver a editar',
    refreshPreview: 'Actualizar vista',
    coverageTitle: 'Cobertura de datos',
    coverageEmpty: 'La selección actual no cubre ninguna categoría',
    colCategory: 'Categoría',
    colWorkout: 'Entrenamiento',
    colWindow: 'Ventana',
    colCoverage: 'Cobertura',
    colSources: 'Fuentes',
    colUnits: 'Unidades',
    colState: 'Estado',
    coverageCount: (withData: number, inRange: number) => `${withData}/${inRange} días`,
    stateMissing: 'Falta',
    stateOk: 'Con datos',
    globalWindow: 'Todos los registros',
    attachTitle: 'Adjuntos originales',
    attachMissingTitle: 'Los adjuntos necesitan atención',
    attachMissingBody: 'Estos originales ya no se encuentran. Vuelve a elegir el archivo o quita la referencia: la entrega no continúa en silencio.',
    attachChangedBody: 'Estos originales tienen otro tamaño ahora. Confirma que siguen siendo los mismos o vuelve a elegirlos.',
    attachReselect: 'Volver a elegir',
    attachRemove: 'Quitar',
    attachPickerTitle: 'Vuelve a elegir el original',
    attachFilterName: 'PDF e imágenes',
    attachStatusOk: 'Listo',
    attachStatusMissing: 'No encontrado',
    attachStatusChanged: 'Cambiado',
    attachManualNote: 'Estos archivos nunca se suben. Cuando estén listos, añádelos tú mismo en la conversación de la IA.',
    gpsTitle: 'Ruta precisa',
    gpsOff: 'Coordenadas GPS excluidas (por defecto)',
    gpsOn: 'Se incluirán las coordenadas GPS originales',
    promptTitle: 'Prompt',
    promptHint: 'Aún puedes editarlo aquí: esto es exactamente lo que se copia.',
    promptCounter: (used: number, max: number) => `${used}/${max}`,
    providerTitle: 'Entregar a',
    stepsTitle: 'Pasos de entrega',
    stepPrepare: 'Preparar archivos',
    stepCopy: 'Copiar el prompt',
    stepAttach: 'Añadir adjuntos a mano',
    stepIdle: 'Sin empezar',
    stepDoing: 'En curso',
    stepDone: 'Hecho',
    stepFailed: 'Falló',
    stepBlocked: 'Bloqueado',
    stepWaiting: 'Te espera',
    retry: 'Reintentar',
    attachConfirm: 'Ya añadí los adjuntos en la conversación de la IA',
    attachConfirmDone: 'Confirmado',
    openOutcomeOpened: (label: string) => `${label} abierto en el navegador — nada se ha enviado`,
    openOutcomeSkipped: 'La vista web no puede abrir el navegador; archivos y prompt están listos',
    openOutcomeFailed: 'El navegador no se abrió — puedes reintentarlo',
    outputTitle: 'Archivos generados',
    outputDir: 'Carpeta de salida',
    outputSize: 'Tamaño',
    ctaMain: (label: string) => `Preparar archivos y abrir ${label}`,
    ctaExportOnly: 'Solo exportar archivos',
    ctaHonestNote: 'Abrir el sitio no es enviar: los archivos quedan en tu equipo; tú decides qué entregar en la página de la IA.',
    staleNotice: 'El borrador cambió después de preparar — los archivos listados ya están viejos. Prepáralos de nuevo antes de entregar.',
    reprepare: 'Preparar de nuevo',
    previewLoadingText: 'Midiendo cobertura…',
    previewFailedTitle: 'No se pudo generar la vista previa',
    desktopOnly: 'Conecta el backend de escritorio para preparar la entrega',
    unsavedNote: 'Es un borrador sin guardar — la vista funciona igual; guárdalo para que aparezca en la lista.',
    taskUntitled: 'Tarea sin nombre',
    estimatedSize: 'Tamaño estimado de la exportación',
  },
);
const t = useMessages(messages);

const { draft, setPrompt, removeAttachment, replaceAttachment } = useAiTaskDraft();
const {
  preview, previewLoading, previewError, prepareResult, preparedSnapshot, steps,
  openOutcome, openError, loadPreview, runPrepare, runCopy, runOpen,
  runAll, exportOnly, markAttached,
} = useAiTaskHandoff();

/* 草稿变了之后，已产出的文件不再代表当前任务——比较落在本组件的响应式
   上下文里：draft 是单例 ref，patchDraft 整体替换才会触发重算。 */
const stale = computed(() =>
  preparedSnapshot.value !== null && preparedSnapshot.value !== taskSnapshot(draft.value));

const desktop = isDesktop();
const provider = ref<AiProvider>(AI_PROVIDERS[0]);
const reselecting = ref<string | null>(null);

/* —— 预览刷新：草稿一改就重算，600ms 去抖（提示词打字也算草稿变化） —— */
let previewTimer: ReturnType<typeof setTimeout> | undefined;
const refreshPreview = () => {
  if (!desktop) return;
  void loadPreview(draft.value);
};
watch(
  () => taskSnapshot(draft.value),
  () => {
    window.clearTimeout(previewTimer);
    previewTimer = setTimeout(refreshPreview, 600);
  },
);
onMounted(refreshPreview);
onBeforeUnmount(() => window.clearTimeout(previewTimer));

/* —— 覆盖表 —— */
const rows = computed(() =>
  preview.value ? coverageRows(preview.value.coverage, preview.value.workouts) : []);

const workoutBriefTitle = (workoutId: string | null): string => {
  if (!workoutId) return t.value.globalWindow;
  const brief = preview.value?.workouts.find((item) => item.id === workoutId);
  return brief ? brief.title : workoutId;
};

/* —— 附件：状态按 id 与草稿里的引用对上，名字取草稿里的 display_name —— */
const attachmentRows = computed(() => {
  const names = new Map(
    draft.value.attachments.map(({ id, display_name: name }) => [id, name]),
  );
  const statuses = new Map(
    (preview.value?.attachments ?? []).map((item) => [item.id, item]),
  );
  return draft.value.attachments.map((ref) => {
    const status = statuses.get(ref.id);
    return {
      id: ref.id,
      name: names.get(ref.id) ?? ref.id,
      kind: ref.kind,
      // null = 还没有预览结果，不猜状态。
      status: status?.status ?? null,
      byte_len: status?.byte_len ?? ref.byte_len,
    };
  });
});

const blockedAttachments = computed(() =>
  attachmentRows.value.filter((row) => row.status === 'missing'));
const changedAttachments = computed(() =>
  attachmentRows.value.filter((row) => row.status === 'changed'));

/** 后端 prepare 回 blocked 时携带的原因清单（附件缺失等）。 */
const blockedIssues = computed(() =>
  prepareResult.value?.status === 'blocked' ? prepareResult.value.blocked : []);
const isBlocked = computed(() => blockedAttachments.value.length > 0 || blockedIssues.value.length > 0);

const reselectAttachment = async (id: string) => {
  reselecting.value = id;
  try {
    const { added } = await pickAttachments(t.value.attachPickerTitle, t.value.attachFilterName, false);
    if (added.length) replaceAttachment(id, added[0]);
  } finally {
    reselecting.value = null;
  }
};

/* —— 步骤条 —— */
const stepOrder = ['prepare', 'copy', 'attach'] as const;
const stepLabel = (id: (typeof stepOrder)[number]) =>
  id === 'prepare' ? t.value.stepPrepare : id === 'copy' ? t.value.stepCopy : t.value.stepAttach;
const stepStateText = (state: string) =>
  state === 'doing' ? t.value.stepDoing
    : state === 'done' ? t.value.stepDone
    : state === 'failed' ? t.value.stepFailed
    : state === 'blocked' ? t.value.stepBlocked
    : state === 'waiting' ? t.value.stepWaiting
    : t.value.stepIdle;
const stepIcon = (state: string) =>
  state === 'done' ? 'circle-check'
    : state === 'failed' ? 'warning'
    : state === 'blocked' ? 'warning'
    : state === 'doing' ? 'refresh'
    : state === 'waiting' ? 'clock'
    : 'ring';

const retryStep = (id: (typeof stepOrder)[number]) => {
  if (id === 'prepare') void runPrepare(draft.value);
  else if (id === 'copy') void runCopy();
};

const ctaBusy = computed(() => steps.value.prepare.state === 'doing' || steps.value.copy.state === 'doing');
const canRun = computed(() => desktop && !ctaBusy.value && !isBlocked.value);

const runPrimary = () => {
  if (!canRun.value) return;
  void runAll(draft.value, provider.value);
};
const runExportOnly = () => {
  if (!canRun.value) return;
  void exportOnly(draft.value);
};
const retryOpenSite = () => {
  void runOpen(provider.value);
};

const warnings = computed(() => preview.value?.warnings ?? []);
const issueText = aiTaskIssueText;
</script>

<template>
  <section class="handoff" aria-labelledby="handoff-title">
    <header class="page-head">
      <button type="button" class="back-btn" @click="emit('back')">
        <Icon name="arrow-left" :size="15" />{{ t.backToCompose }}
      </button>
      <h1 id="handoff-title">{{ t.pageTitle }}</h1>
      <p class="task-line">{{ draft.title.trim() || t.taskUntitled }}</p>
    </header>

    <p v-if="!draft.id" class="note-line"><Icon name="info" :size="13" />{{ t.unsavedNote }}</p>

    <div class="handoff-layout">
      <!-- 左列：覆盖表 / 附件 / GPS / 提示词 -->
      <div class="handoff-main">
        <section v-if="warnings.length" class="surface-card pad warn-card" role="status">
          <ul class="warn-list">
            <li v-for="(warn, index) in warnings" :key="index">
              <Icon name="warning" :size="14" /><span>{{ issueText(warn) }}</span>
            </li>
          </ul>
        </section>

        <section class="surface-card pad">
          <div class="card-head">
            <p class="col-title">{{ t.coverageTitle }}</p>
            <button type="button" class="tool-btn" :disabled="previewLoading || !desktop" @click="refreshPreview">
              <Icon name="refresh" :size="13" />{{ t.refreshPreview }}
            </button>
          </div>
          <p v-if="previewLoading" class="empty-note">{{ t.previewLoadingText }}</p>
          <p v-else-if="previewError" class="empty-note bad" role="alert">{{ previewError }}</p>
          <template v-else-if="rows.length">
            <p class="est-line">{{ t.estimatedSize }}: {{ formatBytes(preview?.estimated_bytes) }}</p>
            <div class="coverage-scroll">
              <table class="coverage-table">
                <thead>
                  <tr>
                    <th>{{ t.colCategory }}</th>
                    <th>{{ t.colWorkout }}</th>
                    <th>{{ t.colWindow }}</th>
                    <th>{{ t.colCoverage }}</th>
                    <th>{{ t.colSources }}</th>
                    <th>{{ t.colUnits }}</th>
                    <th>{{ t.colState }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in rows" :key="row.key" :class="{ 'is-missing': row.missing }">
                    <td>{{ row.categoryLabel }}</td>
                    <td>{{ workoutBriefTitle(row.workoutId) }}</td>
                    <td class="mono">{{ row.start_date }} ~ {{ row.end_date }}</td>
                    <td class="mono">{{ t.coverageCount(row.days_with_data, row.days_in_range) }}</td>
                    <td>{{ row.sources.join(', ') || '—' }}</td>
                    <td>{{ row.units.join(', ') || '—' }}</td>
                    <td>
                      <span :class="['state-pill', row.missing ? 'is-missing' : 'is-ok']">
                        {{ row.missing ? t.stateMissing : t.stateOk }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
          <p v-else class="empty-note">{{ t.coverageEmpty }}</p>
        </section>

        <section class="surface-card pad">
          <p class="col-title">{{ t.attachTitle }}</p>
          <div v-if="blockedAttachments.length" class="attach-alert" role="alert">
            <p class="attach-alert-title"><Icon name="warning" :size="14" />{{ t.attachMissingTitle }}</p>
            <p class="attach-alert-body">{{ t.attachMissingBody }}</p>
          </div>
          <div v-else-if="changedAttachments.length" class="attach-alert is-warn" role="status">
            <p class="attach-alert-title"><Icon name="warning" :size="14" />{{ t.attachChangedBody }}</p>
          </div>
          <ul v-if="attachmentRows.length" class="attach-list">
            <li v-for="att in attachmentRows" :key="att.id" :class="{ 'is-missing': att.status === 'missing', 'is-changed': att.status === 'changed' }">
              <Icon :name="att.kind === 'pdf' ? 'file' : 'pin'" :size="14" />
              <span class="att-name">{{ att.name }}</span>
              <span class="att-size mono">{{ formatBytes(att.byte_len) }}</span>
              <span :class="['state-pill', att.status === 'ok' ? 'is-ok' : att.status === 'changed' ? 'is-warn' : att.status === 'missing' ? 'is-missing' : '']">
                {{ att.status === 'ok' ? t.attachStatusOk : att.status === 'changed' ? t.attachStatusChanged : att.status === 'missing' ? t.attachStatusMissing : '—' }}
              </span>
              <button
                type="button"
                class="tool-btn"
                :disabled="reselecting === att.id || !desktop"
                @click="reselectAttachment(att.id)"
              >{{ t.attachReselect }}</button>
              <button type="button" class="tool-btn" @click="removeAttachment(att.id)">{{ t.attachRemove }}</button>
            </li>
          </ul>
          <p v-else class="empty-note">{{ t.attachManualNote }}</p>
          <p v-if="attachmentRows.length" class="attach-note"><Icon name="shield" :size="13" />{{ attachmentPlainReferenceNote() }}</p>
        </section>

        <section class="surface-card pad">
          <p class="col-title">{{ t.gpsTitle }}</p>
          <p :class="['gps-line', draft.include_precise_gps ? 'is-on' : '']">
            <Icon :name="draft.include_precise_gps ? 'map' : 'shield'" :size="14" />
            {{ draft.include_precise_gps ? t.gpsOn : t.gpsOff }}
          </p>
        </section>

        <section class="surface-card pad">
          <p class="col-title">{{ t.promptTitle }}</p>
          <p class="field-hint">{{ t.promptHint }}</p>
          <textarea
            class="prompt-input"
            :value="draft.prompt"
            :maxlength="AI_TASK_PROMPT_MAX"
            rows="8"
            @input="setPrompt(($event.target as HTMLTextAreaElement).value)"
          ></textarea>
          <p class="prompt-counter">{{ t.promptCounter(draft.prompt.length, AI_TASK_PROMPT_MAX) }}</p>
        </section>
      </div>

      <!-- 右列：提供方 / 步骤 / 输出 / CTA -->
      <aside class="handoff-side">
        <section class="surface-card pad">
          <p class="col-title">{{ t.providerTitle }}</p>
          <div class="provider-grid" role="radiogroup" :aria-label="t.providerTitle">
            <button
              v-for="item in AI_PROVIDERS"
              :key="item.id"
              type="button"
              role="radio"
              :aria-checked="provider.id === item.id"
              :class="['provider-card', { 'is-on': provider.id === item.id }]"
              @click="provider = item"
            >
              <img :src="item.localIcon" :alt="item.label" class="provider-icon" />
              <span>{{ item.label }}</span>
            </button>
          </div>
        </section>

        <section class="surface-card pad">
          <p class="col-title">{{ t.stepsTitle }}</p>
          <ol class="step-list">
            <li v-for="id in stepOrder" :key="id" :class="['step-item', `is-${steps[id].state}`]">
              <span class="step-icon"><Icon :name="stepIcon(steps[id].state)" :size="15" /></span>
              <span class="step-copy">
                <span class="step-name">{{ stepLabel(id) }}</span>
                <span class="step-state">{{ stepStateText(steps[id].state) }}</span>
                <span v-if="steps[id].errorText" class="step-error">{{ steps[id].errorText }}</span>
              </span>
              <button
                v-if="steps[id].state === 'failed' || steps[id].state === 'blocked'"
                type="button"
                class="tool-btn"
                :disabled="id !== 'attach' && !desktop"
                @click="retryStep(id)"
              >{{ t.retry }}</button>
              <button
                v-else-if="id === 'attach' && steps[id].state === 'waiting'"
                type="button"
                class="tool-btn"
                @click="markAttached()"
              >{{ t.attachConfirm }}</button>
              <span v-else-if="id === 'attach' && steps[id].state === 'done'" class="step-ok">{{ t.attachConfirmDone }}</span>
            </li>
          </ol>
          <p v-if="openOutcome === 'opened'" class="outcome ok" role="status">
            <Icon name="external" :size="13" />{{ t.openOutcomeOpened(provider.label) }}
          </p>
          <p v-else-if="openOutcome === 'skipped'" class="outcome" role="status">
            <Icon name="info" :size="13" />{{ t.openOutcomeSkipped }}
          </p>
          <p v-else-if="openOutcome === 'failed'" class="outcome bad" role="alert">
            <Icon name="warning" :size="13" />{{ t.openOutcomeFailed }}
            <button type="button" class="tool-btn" @click="retryOpenSite">{{ t.retry }}</button>
          </p>
          <p v-if="openError" class="outcome bad">{{ openError }}</p>
        </section>

        <section v-if="prepareResult && prepareResult.status === 'ready'" class="surface-card pad">
          <p class="col-title">{{ t.outputTitle }}</p>
          <dl class="output-list">
            <div><dt>{{ t.outputDir }}</dt><dd class="mono">{{ prepareResult.output_dir }}</dd></div>
            <div><dt>{{ t.outputSize }}</dt><dd class="mono">{{ formatBytes(prepareResult.byte_len) }}</dd></div>
          </dl>
          <p v-if="stale" class="outcome warn" role="status">
            <Icon name="warning" :size="13" />{{ t.staleNotice }}
          </p>
        </section>

        <section class="surface-card pad actions">
          <ul v-if="blockedIssues.length" class="warn-list blocked-list" role="alert">
            <li v-for="(issue, index) in blockedIssues" :key="index">
              <Icon name="warning" :size="14" /><span>{{ issueText(issue) }}</span>
            </li>
          </ul>
          <button type="button" class="button button-primary" :disabled="!canRun" @click="runPrimary">
            <Icon name="send" :size="14" />{{ t.ctaMain(provider.label) }}
          </button>
          <button type="button" class="button button-secondary" :disabled="!canRun" @click="runExportOnly">
            <Icon name="export" :size="14" />{{ t.ctaExportOnly }}
          </button>
          <button
            v-if="stale"
            type="button"
            class="button button-secondary"
            :disabled="!canRun"
            @click="runPrimary"
          >{{ t.reprepare }}</button>
          <p class="honest-note"><Icon name="shield" :size="13" />{{ t.ctaHonestNote }}</p>
          <p v-if="!desktop" class="empty-note">{{ t.desktopOnly }}</p>
        </section>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.handoff { padding: 24px; min-width: 0; }
.page-head { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; margin-bottom: 12px; }
.page-head h1 { margin: 0; font-size: var(--fs-3xl); }
.task-line { margin: 0; color: var(--muted); }
.back-btn {
  display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px;
  border: 1px solid var(--line-control); border-radius: 8px;
  background: var(--surface-raised); color: var(--muted); font-size: var(--fs-sm); cursor: pointer;
}
.back-btn:hover { color: var(--ink); border-color: var(--accent); }
.note-line { display: flex; align-items: center; gap: 6px; margin: 0 0 12px; color: var(--subtle); font-size: var(--fs-sm); }

.handoff-layout { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 16px; align-items: start; }
.handoff-main, .handoff-side { display: grid; gap: 16px; min-width: 0; }
.surface-card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-md); }
.pad { padding: 16px; }
.col-title { margin: 0 0 10px; color: var(--muted); font-size: var(--fs-sm); font-weight: 600; }
.card-head { display: flex; align-items: center; justify-content: space-between; }
.card-head .col-title { margin: 0; }
.tool-btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 5px 10px; border: 1px solid var(--line-control); border-radius: 8px;
  background: var(--surface-raised); color: var(--muted); font-size: var(--fs-sm); cursor: pointer;
}
.tool-btn:hover:not(:disabled) { color: var(--ink); border-color: var(--accent); }
.tool-btn:disabled { opacity: .45; cursor: not-allowed; }

.warn-card { border-color: color-mix(in srgb, var(--warn, #c9a227) 45%, transparent); }
.warn-list { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
.warn-list li { display: flex; align-items: flex-start; gap: 7px; color: var(--ink); font-size: var(--fs-sm); }
.warn-list .icon, .warn-list svg { color: var(--warn, #c9a227); flex: 0 0 auto; margin-top: 2px; }

.est-line { margin: 0 0 8px; color: var(--subtle); font-size: var(--fs-xs); }
.coverage-scroll { overflow-x: auto; }
.coverage-table { width: 100%; border-collapse: collapse; font-size: var(--fs-sm); }
.coverage-table th { text-align: left; padding: 7px 10px; color: var(--muted); font-weight: 600; border-bottom: 1px solid var(--line); white-space: nowrap; }
.coverage-table td { padding: 7px 10px; border-bottom: 1px solid var(--line); color: var(--ink); vertical-align: top; }
.coverage-table tr:last-child td { border-bottom: 0; }
.coverage-table tr.is-missing td { color: var(--subtle); }
.mono { font-family: var(--font-mono); font-size: var(--fs-xs); }
.state-pill { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: var(--fs-xs); white-space: nowrap; }
.state-pill.is-ok { background: var(--accent-soft); color: var(--accent); }
.state-pill.is-missing { background: color-mix(in srgb, var(--danger) 16%, transparent); color: var(--danger); }
.state-pill.is-warn { background: color-mix(in srgb, var(--warn, #c9a227) 16%, transparent); color: var(--warn, #c9a227); }

.attach-alert { padding: 10px 12px; margin-bottom: 10px; border: 1px solid color-mix(in srgb, var(--danger) 45%, transparent); border-radius: var(--radius-sm); background: color-mix(in srgb, var(--danger) 8%, transparent); }
.attach-alert.is-warn { border-color: color-mix(in srgb, var(--warn, #c9a227) 45%, transparent); background: color-mix(in srgb, var(--warn, #c9a227) 8%, transparent); }
.attach-alert-title { display: flex; align-items: center; gap: 6px; margin: 0 0 4px; color: var(--ink); font-weight: 600; font-size: var(--fs-sm); }
.attach-alert-body { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
.attach-list { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
.attach-list li { display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: var(--surface-raised); border: 1px solid transparent; border-radius: 8px; }
.attach-list li.is-missing { border-color: color-mix(in srgb, var(--danger) 45%, transparent); }
.attach-list li.is-changed { border-color: color-mix(in srgb, var(--warn, #c9a227) 45%, transparent); }
.att-name { flex: 1; min-width: 0; font-size: var(--fs-sm); color: var(--ink); overflow-wrap: anywhere; }
.att-size { color: var(--subtle); }
.attach-note { display: flex; align-items: flex-start; gap: 6px; margin: 8px 0 0; color: var(--subtle); font-size: var(--fs-xs); }

.gps-line { display: flex; align-items: center; gap: 7px; margin: 0; color: var(--muted); font-size: var(--fs-sm); }
.gps-line.is-on { color: var(--warn, #c9a227); }
.field-hint { margin: 0 0 8px; color: var(--subtle); font-size: var(--fs-xs); }
.prompt-input {
  width: 100%; padding: 9px 11px; border: 1px solid var(--line-control); border-radius: var(--radius-sm);
  background: var(--surface-raised); color: var(--ink); font: inherit; font-size: var(--fs-md); resize: vertical;
}
.prompt-input:focus { border-color: var(--accent); outline: none; }
.prompt-counter { margin: 4px 0 0; text-align: right; color: var(--subtle); font-size: var(--fs-xs); }

.provider-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.provider-card {
  display: flex; align-items: center; gap: 8px; padding: 9px 10px;
  border: 1px solid var(--line); border-radius: var(--radius-sm);
  background: var(--surface-raised); color: var(--ink); font-size: var(--fs-sm); cursor: pointer;
}
.provider-card.is-on { border-color: var(--accent); background: var(--accent-soft); }
.provider-icon { width: 20px; height: 20px; border-radius: 5px; object-fit: contain; }

.step-list { margin: 0; padding: 0; list-style: none; display: grid; gap: 10px; }
.step-item { display: flex; align-items: flex-start; gap: 9px; }
.step-icon { flex: 0 0 auto; margin-top: 1px; color: var(--subtle); }
.step-item.is-done .step-icon { color: var(--accent); }
.step-item.is-failed .step-icon, .step-item.is-blocked .step-icon { color: var(--danger); }
.step-item.is-doing .step-icon { color: var(--accent); }
.step-item.is-waiting .step-icon { color: var(--warn, #c9a227); }
.step-copy { flex: 1; min-width: 0; display: grid; gap: 1px; }
.step-name { color: var(--ink); font-size: var(--fs-sm); }
.step-state { color: var(--subtle); font-size: var(--fs-xs); }
.step-error { color: var(--danger); font-size: var(--fs-xs); overflow-wrap: anywhere; }
.step-ok { color: var(--accent); font-size: var(--fs-xs); }

.outcome { display: flex; align-items: center; gap: 7px; margin: 12px 0 0; padding: 9px 11px; border-radius: var(--radius-sm); background: var(--surface-raised); color: var(--muted); font-size: var(--fs-sm); }
.outcome.ok { color: var(--accent); }
.outcome.bad { color: var(--danger); }
.outcome.warn { color: var(--warn, #c9a227); }
.outcome .tool-btn { margin-left: auto; }

.output-list { margin: 0; display: grid; gap: 6px; }
.output-list div { display: grid; gap: 2px; }
.output-list dt { color: var(--muted); font-size: var(--fs-xs); }
.output-list dd { margin: 0; color: var(--ink); font-size: var(--fs-xs); overflow-wrap: anywhere; }

.actions { display: grid; gap: 10px; }
.button {
  display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 10px 16px;
  border: 1px solid var(--line-control); border-radius: var(--radius-sm);
  font-size: var(--fs-md); cursor: pointer;
}
.button-primary { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); font-weight: 600; }
.button-primary:hover:not(:disabled) { background: var(--accent-hover); }
.button-secondary { background: var(--surface-raised); color: var(--ink); }
.button-secondary:hover:not(:disabled) { border-color: var(--accent); }
.button:disabled { opacity: .5; cursor: not-allowed; }
.honest-note { display: flex; align-items: flex-start; gap: 6px; margin: 0; color: var(--subtle); font-size: var(--fs-xs); }
.empty-note { margin: 6px 0; color: var(--subtle); font-size: var(--fs-sm); }
.empty-note.bad { color: var(--danger); }

@media (max-width: 1100px) {
  .handoff-layout { grid-template-columns: 1fr; }
}
</style>
