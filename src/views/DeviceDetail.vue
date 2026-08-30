<script setup lang="ts">
/**
 * 单台设备的二级界面。
 *
 * 存在的理由只有一个：**自动识别可能是错的，用户得有一条退路。**
 * 早先只有「未识别」的设备才显示手动指认入口，一旦这台设备被自动认出来、
 * 或者本机已经有它的数据，入口就消失了——识别错了也改不回来。
 *
 * 所以这一页无论识别状态如何，重新选择型号的入口始终在。指认结果会被如实
 * 标注成「你指认的型号」，不会伪装成自动识别。
 */
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import DesignIcon from '../components/DesignIcon.vue';
import DevicePicker from '../components/DevicePicker.vue';
import DeviceVisual from '../components/DeviceVisual.vue';
import EmptyState from '../components/EmptyState.vue';
import Icon from '../components/Icon.vue';
import SkeletonBlock from '../components/SkeletonBlock.vue';
import { deviceStateLabel, useDeviceAssignment, useDevices } from '../composables/useDevices';

const route = useRoute();
const { models, loading, initialized, error, load, maskIdentifier } = useDevices();
const { assignBusy, assignError, assignMessage, assignModel, clearAssignFeedback } = useDeviceAssignment();

const deviceKey = computed(() => String(route.params.deviceKey || '').trim());
const model = computed(() => models.value.find((entry) => entry.deviceKey === deviceKey.value) ?? null);

const pickerOpen = ref(false);

/* 「这个型号是怎么来的」比「型号是什么」更重要：用户要判断该不该改，
   就得先知道现在这个结论是机器猜的、目录里对上的，还是他自己上次指认的。 */
const originLabel = computed(() => {
  const item = model.value;
  if (!item) return '未知';
  if (item.userAssigned) return '你上次手动指认的';
  switch (item.matchStatus) {
    case 'exact': return '内置设备目录精确匹配';
    case 'alias': return '内置设备目录别名匹配';
    case 'unknown': return '没有匹配到（云端没有给出可识别的产品名）';
    default: return item.profile.canonical_name ? '内置设备目录匹配' : '没有匹配到';
  }
});

const openPicker = () => {
  clearAssignFeedback();
  pickerOpen.value = true;
};

const confirmPick = async (catalogId: string, contribute: boolean) => {
  await assignModel(deviceKey.value, catalogId, contribute);
  if (!assignError.value) pickerOpen.value = false;
};

const clearPick = async () => {
  await assignModel(deviceKey.value, '', false);
  if (!assignError.value) pickerOpen.value = false;
};

onMounted(() => {
  if (!initialized.value) void load(false);
});
</script>

<template>
  <section class="page device-page" aria-labelledby="device-detail-title">
    <div class="page-toolbar">
      <RouterLink class="back-link" to="/settings"><Icon name="arrow-left" :size="14" />返回设置</RouterLink>
    </div>

    <div v-if="loading && !model" class="detail-loading" aria-live="polite">
      <SkeletonBlock height="150px" /><SkeletonBlock height="200px" />
    </div>

    <EmptyState
      v-else-if="!model"
      icon="link"
      title="找不到这台设备"
      :message="error || '它可能已从账号中移除，或者本机还没识别到它。'"
    >
      <button class="button button-secondary" type="button" @click="load(true)">重新识别设备</button>
    </EmptyState>

    <template v-else>
      <section class="device-hero">
        <DeviceVisual :src="model.image" :alt="model.canonicalName" :kind="model.kind" />
        <div class="hero-copy">
          <p class="hero-eyebrow">DEVICE</p>
          <h1 id="device-detail-title">{{ model.canonicalName }}</h1>
          <p class="hero-sub">{{ model.displayName }}</p>
          <span :class="['hero-state', { on: model.state !== 'unknown' }]"><i></i>{{ deviceStateLabel(model.state) }}</span>
        </div>
      </section>

      <section class="surface-card facts-card" aria-label="设备信息">
        <dl>
          <div><dt>型号从哪来</dt><dd>{{ originLabel }}</dd></div>
          <div><dt>固件</dt><dd>{{ model.firmware }}</dd></div>
          <div><dt>最近数据</dt><dd>{{ model.lastData }}</dd></div>
          <div><dt>本机是否有它的数据</dt><dd>{{ model.hasLocalData ? '有' : '暂无' }}</dd></div>
          <div><dt>设备 ID</dt><dd>{{ maskIdentifier(model.profile.device_id || model.profile.serial) }}</dd></div>
        </dl>
        <p class="facts-note">
          <DesignIcon name="secure" :size="20" />
          设备 ID 只在本机使用，界面上永远只显示后四位，也不会写进导出或错误报告。
        </p>
      </section>

      <section class="surface-card assign-card" aria-label="型号识别">
        <h2>识别得对吗？</h2>
        <p class="assign-sub">
          识别结果不对（比如实际是 Balance 2，这里写成了别的型号），可以随时自己指认。
          指认只保存在本机，会被标成「你指认的型号」，不会伪装成自动识别结果；也可以随时撤销，恢复成自动识别。
        </p>

        <div v-if="!pickerOpen" class="inline-actions">
          <button class="button primary" type="button" :disabled="assignBusy || !model.deviceKey" @click="openPicker">
            <Icon name="watch" :size="15" />{{ model.userAssigned ? '换一台' : '不对，我来指认' }}
          </button>
          <button
            v-if="model.userAssigned"
            class="button secondary"
            type="button"
            :disabled="assignBusy"
            @click="clearPick"
          >撤销指认，用回自动识别</button>
        </div>

        <p v-if="!model.deviceKey" class="hint-line">
          这台设备没有可用的本机标识，暂时无法保存指认。
        </p>
        <p v-if="assignError" class="api-error" role="alert">{{ assignError }}</p>
        <p v-else-if="assignMessage" class="hint-line ok" role="status">{{ assignMessage }}</p>

        <DevicePicker
          v-if="pickerOpen"
          :model-value="model.profile.catalog_id"
          :busy="assignBusy"
          @confirm="confirmPick"
          @clear="clearPick"
          @cancel="pickerOpen = false"
        />
      </section>
    </template>
  </section>
</template>

<style scoped>
.device-page { width: 100%; display: grid; gap: 16px; align-content: start; }
.detail-loading { display: grid; gap: 12px; }
.page-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 38px; }
.back-link { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; text-decoration: none; }
.back-link:hover { color: var(--accent); }

/* 设备主图比列表里的缩略图大一号，上下留够，别把表带切了。 */
.device-hero :deep(.device-visual) { width: 104px; height: 124px; flex-basis: 104px; }
.device-hero {
  display: flex; align-items: center; gap: 20px; padding: 22px;
  border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface-raised);
}
.hero-copy { display: grid; gap: 4px; min-width: 0; }
.hero-eyebrow { margin: 0; color: var(--subtle); font-size: 11px; letter-spacing: .12em; }
.hero-copy h1 { margin: 0; font-size: 22px; font-weight: 700; color: var(--ink); }
.hero-sub { margin: 0; color: var(--muted); font-size: 13px; }
.hero-state { display: inline-flex; align-items: center; gap: 6px; margin-top: 6px; color: var(--muted); font-size: 12px; }
.hero-state i { width: 7px; height: 7px; border-radius: 50%; background: var(--subtle); }
.hero-state.on i { background: #7da33e; }

.facts-card, .assign-card { padding: 18px 20px; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface); }
.facts-card dl { display: grid; gap: 10px; margin: 0; }
.facts-card dl > div { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; }
.facts-card dt { color: var(--muted); font-size: 12px; }
.facts-card dd { margin: 0; color: var(--ink); font-size: 13px; text-align: right; }
.facts-note { display: flex; align-items: center; gap: 8px; margin: 14px 0 0; color: var(--subtle); font-size: 11px; }

.assign-card h2 { margin: 0 0 6px; font-size: 15px; font-weight: 700; color: var(--ink); }
.assign-sub { margin: 0 0 14px; color: var(--muted); font-size: 12px; line-height: 1.65; }
.inline-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.hint-line { margin: 10px 0 0; color: var(--muted); font-size: 12px; }
.hint-line.ok { color: #b9da77; }
.api-error { margin: 10px 0 0; color: #e2856f; font-size: 12px; }

@media (max-width: 640px) {
  .device-hero { flex-direction: column; align-items: flex-start; }
  .facts-card dl > div { flex-direction: column; gap: 2px; }
  .facts-card dd { text-align: left; }
}
</style>
