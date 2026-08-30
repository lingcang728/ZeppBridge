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
import { defineMessages, useMessages } from '../i18n';

const messages = defineMessages(
  {
    backToSettings: '返回设置',
    notFoundTitle: '找不到这台设备',
    notFoundMessage: '它可能已从账号中移除，或者本机还没识别到它。',
    reidentify: '重新识别设备',
    factsAria: '设备信息',
    factOrigin: '型号从哪来',
    factFirmware: '固件',
    factLastData: '最近数据',
    factHasLocal: '本机是否有它的数据',
    factDeviceId: '设备 ID',
    hasLocalYes: '有',
    hasLocalNo: '暂无',
    factsNote: '设备 ID 只在本机使用，界面上永远只显示后四位，也不会写进导出或错误报告。',
    assignAria: '型号识别',
    assignTitle: '识别得对吗？',
    assignSub: '识别结果不对（比如实际是 Balance 2，这里写成了别的型号），可以随时自己指认。指认只保存在本机，会被标成「你指认的型号」，不会伪装成自动识别结果；也可以随时撤销，恢复成自动识别。',
    changeModel: '换一台',
    pickModel: '不对，我来指认',
    clearAssignment: '撤销指认，用回自动识别',
    noLocalIdentifier: '这台设备没有可用的本机标识，暂时无法保存指认。',
    originUnknown: '未知',
    originUserAssigned: '你上次手动指认的',
    originExact: '内置设备目录精确匹配',
    originAlias: '内置设备目录别名匹配',
    originNoMatchCloud: '没有匹配到（云端没有给出可识别的产品名）',
    originCatalog: '内置设备目录匹配',
    originNoMatch: '没有匹配到',
  },
  {
    backToSettings: 'Back to settings',
    notFoundTitle: 'This device is not here',
    notFoundMessage: 'It may have been removed from the account, or this machine has not identified it yet.',
    reidentify: 'Identify devices again',
    factsAria: 'Device information',
    factOrigin: 'Where the model came from',
    factFirmware: 'Firmware',
    factLastData: 'Latest data',
    factHasLocal: 'Local data for it',
    factDeviceId: 'Device ID',
    hasLocalYes: 'Yes',
    hasLocalNo: 'None yet',
    factsNote: 'The device ID is used only on this machine, only its last four characters ever appear on screen, and it never reaches an export or an error report.',
    assignAria: 'Model identification',
    assignTitle: 'Is this right?',
    assignSub: 'If the match is wrong — say it is really a Balance 2 and this says something else — you can point at the right model yourself. Your pick stays on this machine, shows up as "Model you picked" rather than posing as an automatic match, and can be withdrawn at any time.',
    changeModel: 'Pick a different one',
    pickModel: "That's wrong, let me pick",
    clearAssignment: 'Withdraw the pick and go back to automatic',
    noLocalIdentifier: 'This device carries no local identifier, so a pick cannot be saved for it.',
    originUnknown: 'Unknown',
    originUserAssigned: 'You picked it last time',
    originExact: 'Exact match in the built-in catalog',
    originAlias: 'Alias match in the built-in catalog',
    originNoMatchCloud: 'No match (the cloud gave no recognizable product name)',
    originCatalog: 'Matched in the built-in catalog',
    originNoMatch: 'No match',
  },
);
const t = useMessages(messages);

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
  if (!item) return t.value.originUnknown;
  if (item.userAssigned) return t.value.originUserAssigned;
  switch (item.matchStatus) {
    case 'exact': return t.value.originExact;
    case 'alias': return t.value.originAlias;
    case 'unknown': return t.value.originNoMatchCloud;
    default: return item.profile.canonical_name ? t.value.originCatalog : t.value.originNoMatch;
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
      <RouterLink class="back-link" to="/settings"><Icon name="arrow-left" :size="14" />{{ t.backToSettings }}</RouterLink>
    </div>

    <div v-if="loading && !model" class="detail-loading" aria-live="polite">
      <SkeletonBlock height="150px" /><SkeletonBlock height="200px" />
    </div>

    <EmptyState
      v-else-if="!model"
      icon="link"
      :title="t.notFoundTitle"
      :message="error || t.notFoundMessage"
    >
      <button class="button button-secondary" type="button" @click="load(true)">{{ t.reidentify }}</button>
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

      <section class="surface-card facts-card" :aria-label="t.factsAria">
        <dl>
          <div><dt>{{ t.factOrigin }}</dt><dd>{{ originLabel }}</dd></div>
          <div><dt>{{ t.factFirmware }}</dt><dd>{{ model.firmware }}</dd></div>
          <div><dt>{{ t.factLastData }}</dt><dd>{{ model.lastData }}</dd></div>
          <div><dt>{{ t.factHasLocal }}</dt><dd>{{ model.hasLocalData ? t.hasLocalYes : t.hasLocalNo }}</dd></div>
          <div><dt>{{ t.factDeviceId }}</dt><dd>{{ maskIdentifier(model.profile.device_id || model.profile.serial) }}</dd></div>
        </dl>
        <p class="facts-note">
          <DesignIcon name="secure" :size="20" />
          {{ t.factsNote }}
        </p>
      </section>

      <section class="surface-card assign-card" :aria-label="t.assignAria">
        <h2>{{ t.assignTitle }}</h2>
        <p class="assign-sub">{{ t.assignSub }}</p>

        <div v-if="!pickerOpen" class="inline-actions">
          <button class="button primary" type="button" :disabled="assignBusy || !model.deviceKey" @click="openPicker">
            <Icon name="watch" :size="15" />{{ model.userAssigned ? t.changeModel : t.pickModel }}
          </button>
          <button
            v-if="model.userAssigned"
            class="button secondary"
            type="button"
            :disabled="assignBusy"
            @click="clearPick"
          >{{ t.clearAssignment }}</button>
        </div>

        <p v-if="!model.deviceKey" class="hint-line">{{ t.noLocalIdentifier }}</p>
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
