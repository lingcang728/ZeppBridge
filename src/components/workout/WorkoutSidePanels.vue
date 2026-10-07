<script setup lang="ts">
/* 运动详情右侧一列：本地解析明细、交出去（交给 AI / 导出文件，一张卡分段切换）；来源信息由页面决定放哪列。 */
import { computed, ref } from 'vue';
import type { DesignIconName } from '../DesignIcon.vue';
import GlyphTile from '../GlyphTile.vue';
import Icon from '../Icon.vue';
import CapsuleWheel from '../CapsuleWheel.vue';
import SegmentTrack from '../SegmentTrack.vue';
import type { ExportFormat } from '../../composables/useWorkoutDetail';
import { isTauri } from '../../composables/useTauriApi';
import { useSyncController } from '../../composables/useSyncController';
import { useMessages } from '../../i18n';
import { workoutDetailMessages } from '../../views/WorkoutDetail.i18n';

defineProps<{
  decoded: { label: string; value: string; icon: DesignIconName }[];
  exportBusy: boolean;
  exportedNote: string | null;
  actionError: string | null;
  aiProviderChoices: { value: string; label: string; image?: string }[];
  aiProviderLabel: string;
  handoffBusy: boolean;
  aiNote: string | null;
  handoffError: string | null;
}>();
const format = defineModel<ExportFormat>('format', { required: true });
const provider = defineModel<string>('provider', { required: true });
const emit = defineEmits<{ export: []; handoff: [] }>();
const t = useMessages(workoutDetailMessages);
const { isSyncing } = useSyncController();
const FORMATS: ExportFormat[] = ['json', 'csv', 'gpx', 'fit'];
const mode = ref<'ai' | 'export'>('ai');
const modeItems = computed(() => [
  { value: 'ai' as const, label: t.value.handoffTitle },
  { value: 'export' as const, label: t.value.exportTitle },
]);
</script>

<template>
  <div class="side-col">
    <section class="surface-card side-card decoded-card" :aria-label="t.decodedAria">
      <div class="section-head"><GlyphTile name="structured-data" tone="pace" :size="40" /><div><p class="section-eyebrow">{{ t.eyebrowDecoded }}</p><h2>{{ t.decodedTitle }}</h2></div></div>
      <div class="decoded-list">
        <div v-for="metric in decoded" :key="metric.label"><GlyphTile :name="metric.icon" :size="28" plain /><span>{{ metric.label }}</span><strong>{{ metric.value }}</strong></div>
      </div>
      <p class="mapping-note"><GlyphTile name="verified" :size="18" />{{ t.decodedNote }}</p>
    </section>

    <!-- 导出与交给 AI 合成一张卡：两件事都是「把这条运动交出去」，分两张卡会把右列拉得
         比左列长一大截，左边底下空出一片。分段切换，默认先给「交给 AI」。 -->
    <section class="surface-card side-card deliver-card" :aria-label="mode === 'ai' ? t.handoffAria : t.exportAria">
      <div class="section-head">
        <GlyphTile :name="mode === 'ai' ? 'handoff' : 'document'" :tone="mode === 'ai' ? undefined : 'sleep'" :size="40" />
        <SegmentTrack v-model="mode" class="deliver-tabs" :items="modeItems" :aria-label="t.exportAria" />
      </div>
      <!-- 两块叠在同一格里交叉淡化（审计 B1，2026-10-07；以前 v-if 硬换）：高度取两块里高的那块，切换时不跳。 -->
      <div class="deliver-stack">
      <div :class="['deliver-body', { shown: mode === 'ai' }]" :inert="mode !== 'ai' || undefined">
        <p class="card-sub">{{ t.handoffSub }}</p>
        <div class="ai-provider">
          <span>{{ t.handoffTarget }}</span>
          <CapsuleWheel v-model="provider" loop :span="230" :items="aiProviderChoices" :aria-label="t.handoffTargetAria" />
        </div>
        <!-- 同步进行中不交付：导出的会是同步前的旧数据。 -->
        <button class="button primary wide" type="button" :disabled="handoffBusy || isSyncing" @click="emit('handoff')">
          <Icon name="send" :size="18" class="cta-icon" />{{ handoffBusy ? t.preparing : isSyncing ? t.handWaitSync : t.handTo(aiProviderLabel) }}
        </button>
        <p v-if="aiNote" class="action-note ok" role="status"><Icon name="circle-check" :size="13" />{{ aiNote }}</p>
        <p v-if="handoffError" class="action-note bad" role="alert"><Icon name="warning" :size="13" />{{ handoffError }}</p>
      </div>
      <div :class="['deliver-body', { shown: mode !== 'ai' }]" :inert="mode === 'ai' || undefined">
        <p class="card-sub">{{ t.exportSub }}</p>
        <SegmentTrack
          fill
          compact
          :items="FORMATS.filter((item) => item !== 'fit' || isTauri()).map((item) => ({ value: item, label: item.toUpperCase() }))"
          :model-value="format"
          :disabled="exportBusy"
          :aria-label="t.exportFormatAria"
          @update:model-value="(value) => { format = value as ExportFormat; }"
        />
        <button class="button primary wide" type="button" :disabled="exportBusy" @click="emit('export')"><GlyphTile name="cloud-output" :size="20" />{{ format === 'fit' ? t.saveFit : t.exportGo(format.toUpperCase()) }}</button>
        <p v-if="exportedNote" class="action-note ok" role="status"><Icon name="circle-check" :size="13" />{{ exportedNote }}</p>
        <p v-if="actionError" class="action-note bad" role="alert"><Icon name="warning" :size="13" />{{ actionError }}</p>
      </div>
      </div>
    </section>

    <slot name="after" />
  </div>
</template>

<style scoped>
.side-col { display: grid; gap: 16px; min-width: 0; }
.side-card { padding: 16px 18px 18px; border-radius: var(--radius-lg); }
.section-head { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.section-head h2 { margin: 1px 0 0; font-size: var(--fs-2xl); letter-spacing: -.02em; }
.cta-icon { flex: 0 0 auto; color: currentColor; }
/* 按内容收紧、靠右：以前铺满整行，两枚标签挤在左边、右边拖着一大段空胶囊。 */
.deliver-tabs { flex: 0 1 auto; min-width: 0; margin-left: auto; }
.deliver-stack { display: grid; }
.deliver-body { display: grid; grid-area: 1 / 1; align-content: start; opacity: 0; visibility: hidden; transform: translateY(4px);
  transition: opacity 260ms ease, transform 320ms cubic-bezier(.4, .6, .2, 1), visibility 0s linear 320ms; }
.deliver-body.shown { opacity: 1; visibility: visible; transform: none; transition: opacity 320ms ease 60ms, transform 320ms cubic-bezier(.4, .6, .2, 1) 60ms, visibility 0s; }
.deliver-body > .wide { margin-top: 12px; }
.section-eyebrow { margin: 0; color: var(--subtle); font-family: var(--font-mono); font-size: var(--fs-2xs); font-weight: 700; letter-spacing: .16em; }
.card-sub { margin: 0 0 12px; color: var(--muted); font-size: var(--fs-sm); }
.decoded-list { display: grid; }
.decoded-list > div { display: grid; grid-template-columns: 30px minmax(0,1fr) auto; align-items: center; gap: 8px; min-height: 42px; padding: 4px 3px; color: var(--muted); }
.decoded-list > div + div { border-top: 1px solid var(--mat-line); }
.decoded-list span { color: var(--muted); font-size: var(--fs-xs); }
.decoded-list strong { color: var(--ink); font-family: var(--font-mono); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
.mapping-note { display: flex; align-items: flex-start; gap: 7px; margin: 12px 0 0; padding: 10px 12px; border-radius: 10px; background: var(--accent-soft); color: var(--muted); font-size: var(--fs-2xs); line-height: 1.6; }
.wide { width: 100%; min-height: 42px; margin-top: 12px; }
.ai-provider { display: grid; gap: 6px; font-size: var(--fs-sm); color: var(--muted); }
.action-note { display: inline-flex; align-items: center; gap: 6px; margin: 10px 0 0; font-size: var(--fs-sm); }
.action-note.ok { color: var(--accent); } .action-note.bad { color: var(--danger); }
/* 两列时解析明细跨两行：多出来的高度全给第二行（来源信息那一格），交付卡按内容高、不被拉长——
   以前两行平分，「交给 AI / 导出与分享」按钮下面空出一大截。 */
@media (max-width: 1180px) { .side-col { grid-template-columns: repeat(2, minmax(0,1fr)); grid-template-rows: auto 1fr; align-items: start; } .decoded-card { grid-row: span 2; align-self: stretch; } }
@media (max-width: 760px) { .side-col { grid-template-columns: minmax(0, 1fr); grid-template-rows: none; } .decoded-card { grid-row: auto; } }
</style>
