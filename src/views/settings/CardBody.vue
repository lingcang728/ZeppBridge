<script setup lang="ts">
/* 设置大卡的内容：按卡 id 摆各区块。
 *
 * 单独成一个组件，是为了让 Settings.vue 用 <KeepAlive> 按卡缓存它：甩到下一张卡时，
 * 开过的那张直接复用，不用把整段表单（补拉账本、设备列表、MCP 配置）重新挂一遍——
 * 以前每甩一下都要等新区块挂载完才浮上来，就是「甩一下卡一下」。 */
import AccountSection from './sections/AccountSection.vue';
import AdvancedSection from './sections/AdvancedSection.vue';
import ArchiveSection from './sections/ArchiveSection.vue';
import AutoSyncSection from './sections/AutoSyncSection.vue';
import CapabilitySection from './sections/CapabilitySection.vue';
import CloudSection from './sections/CloudSection.vue';
import DevicesSection from './sections/DevicesSection.vue';
import DisplayPrefsSection from './sections/DisplayPrefsSection.vue';
import ExportDefaultsSection from './sections/ExportDefaultsSection.vue';
import GuideSection from './sections/GuideSection.vue';
import LabsSection from './sections/LabsSection.vue';
import McpSection from './sections/McpSection.vue';
import PrivacySection from './sections/PrivacySection.vue';
import { labFlag } from '../../lib/labs';

defineProps<{ id: string }>();
/* 「推给云端」在 Beta 实验室里自己打开才有；没开的人这张卡和以前一模一样。 */
const cloud = labFlag('cloud');
</script>

<template>
  <div class="card-body">
    <template v-if="id === 'account'">
      <AccountSection />
      <DevicesSection />
    </template>
    <AutoSyncSection v-else-if="id === 'sync'" />
    <ArchiveSection v-else-if="id === 'archive'" />
    <CapabilitySection v-else-if="id === 'data'" />
    <template v-else-if="id === 'ai'">
      <CloudSection v-if="cloud" />
      <McpSection />
      <ExportDefaultsSection />
    </template>
    <DisplayPrefsSection v-else-if="id === 'display'" />
    <LabsSection v-else-if="id === 'labs'" />
    <GuideSection v-else-if="id === 'guide'" />
    <PrivacySection v-else-if="id === 'privacy'" />
    <AdvancedSection v-else-if="id === 'advanced'" />
  </div>
</template>
