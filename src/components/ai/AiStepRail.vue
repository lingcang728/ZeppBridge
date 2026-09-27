<script setup lang="ts">
/**
 * 「交给 AI」右侧浮着的步骤栏：三步做成折叠的玻璃胶囊，一次只展开一步。
 *
 * 收起的步骤只露一行摘要（分析哪次运动 / 你问了什么 / 带了几个附件），
 * 所以不用滚也能一眼看清整个任务；点哪一步展开哪一步，其余自动收起。
 * 展开收起用 grid-template-rows 0fr → 1fr 过渡，内容高度不用量。
 */
import Icon from '../Icon.vue';

export interface RailStep {
  id: string;
  title: string;
  /** 收起时那一行摘要。 */
  summary: string;
  /** 这一步已经有了用户给的内容（摘要高亮）。 */
  filled: boolean;
}

defineProps<{ steps: RailStep[]; open: string | null }>();
const emit = defineEmits<{ (event: 'update:open', id: string | null): void }>();
defineSlots<Record<string, () => unknown>>();
</script>

<template>
  <div class="rail">
    <section v-for="(step, index) in steps" :key="step.id" :class="['step', { 'is-open': open === step.id }]">
      <button type="button" class="step-head" :aria-expanded="open === step.id" :aria-controls="`rail-${step.id}`"
        @click="emit('update:open', open === step.id ? null : step.id)">
        <span :class="['step-no', { filled: step.filled }]">
          <Icon v-if="step.filled && open !== step.id" name="check" :size="13" />
          <template v-else>{{ index + 1 }}</template>
        </span>
        <span class="step-copy">
          <span class="step-title">{{ step.title }}</span>
          <span :class="['step-summary', { filled: step.filled }]">{{ step.summary }}</span>
        </span>
        <Icon name="chevron-down" :size="16" class="step-chevron" />
      </button>
      <div :id="`rail-${step.id}`" class="step-fold" :inert="open !== step.id || undefined">
        <div class="step-inner">
          <div class="step-body"><slot :name="step.id" /></div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.rail { display: grid; align-content: start; gap: 8px; }
.step {
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--ink) 4%, transparent);
  box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 6%, transparent);
  transition: background var(--dur-base) ease;
}
.step.is-open { background: color-mix(in srgb, var(--ink) 7%, transparent); }
.step-head {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 12px;
  padding: 13px 14px;
  border: 0;
  border-radius: inherit;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.step-head:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
.step-no {
  display: grid;
  width: 26px;
  height: 26px;
  flex: 0 0 26px;
  place-items: center;
  border-radius: 50%;
  background: color-mix(in srgb, var(--ink) 10%, transparent);
  color: var(--muted);
  font-size: var(--fs-xs);
  font-weight: 700;
}
.step-no.filled, .is-open .step-no { background: var(--accent); color: var(--accent-ink); }
.step-copy { display: grid; flex: 1; min-width: 0; gap: 2px; }
.step-title { color: var(--ink); font-size: var(--fs-md); font-weight: 650; }
.step-summary { overflow: hidden; color: var(--subtle); font-size: var(--fs-xs); text-overflow: ellipsis; white-space: nowrap; }
.step-summary.filled { color: var(--muted); }
.is-open .step-summary { display: none; }
.step-chevron { flex: 0 0 auto; color: var(--subtle); transition: rotate var(--dur-base) var(--ease-out); }
.is-open .step-chevron { rotate: 180deg; }

.step-fold { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 360ms var(--ease-out); }
.is-open .step-fold { grid-template-rows: 1fr; }
.step-inner { min-height: 0; overflow: hidden; }
.step-body {
  padding: 0 14px 16px;
  opacity: 0;
  filter: blur(4px);
  transition: opacity 220ms ease, filter 260ms ease;
}
.is-open .step-body { opacity: 1; filter: none; transition-delay: 80ms; }

/* 里面的面板本来各自是一张卡：放进步骤栏以后去掉卡的外壳和它自己的步骤标题。 */
.step-body :deep(.ai-card) { padding: 0; border: 0; border-radius: 0; background: none; box-shadow: none; }
.step-body :deep(.ai-step-head) { display: none; }
/* 运动列表的日期分组头原本压着卡片的实色底（为了吸顶），在玻璃里就成了一条条暗带。 */
.step-body :deep(.day) { background: none; }

@media (prefers-reduced-motion: reduce) {
  .step-fold, .step-body, .step-chevron { transition: none; }
}
</style>
