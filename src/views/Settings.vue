<script setup lang="ts">
/* 设置页只负责布局和组装。
 *
 * 每一块的界面和逻辑住在 views/settings/sections/ 下各自的组件里；几块之间
 * 共享的状态（全页提示、登录进度、保留期与补拉窗口、诊断报告的提交中）由这里
 * provide 一份，见 composables/settings/context.ts。 */
import { onMounted, onUnmounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import HistoryArchivePanel from '../components/HistoryArchivePanel.vue';
import Icon from '../components/Icon.vue';
import { provideSettingsContext } from '../composables/settings/context';
import { useSyncController } from '../composables/useSyncController';
import { useMessages } from '../i18n';
import { settingsMessages } from './Settings.i18n';
import AccountSection from './settings/sections/AccountSection.vue';
import AdvancedSection from './settings/sections/AdvancedSection.vue';
import AuthSection from './settings/sections/AuthSection.vue';
import AutoSyncSection from './settings/sections/AutoSyncSection.vue';
import CapabilitySection from './settings/sections/CapabilitySection.vue';
import DevicesSection from './settings/sections/DevicesSection.vue';
import DisplayPrefsSection from './settings/sections/DisplayPrefsSection.vue';
import ExportDefaultsSection from './settings/sections/ExportDefaultsSection.vue';
import McpSection from './settings/sections/McpSection.vue';
import PrivacySection from './settings/sections/PrivacySection.vue';
import RetentionSection from './settings/sections/RetentionSection.vue';
import UpdateSection from './settings/sections/UpdateSection.vue';
import WorkoutCodesSection from './settings/sections/WorkoutCodesSection.vue';

const t = useMessages(settingsMessages);
const route = useRoute();
const { statusError, refreshStatus } = useSyncController();
const { feedback, auth, prefs } = provideSettingsContext();
const { dataMessage, dataError } = feedback;
const { loginError } = auth;
const { userPrefs, applyPrefsChange } = prefs;

const focusConnection = () => {
  if (route.hash !== '#connection' && route.query.focus !== 'connection') return;
  window.setTimeout(() => {
    document.getElementById('connection')?.scrollIntoView({ block: 'start' });
  }, 0);
};
watch(() => [route.hash, route.query.focus], focusConnection);

onMounted(async () => {
  focusConnection();
  await prefs.load();
  await auth.attach();
});
onUnmounted(() => {
  auth.detach();
});
</script>

<template>
  <section class="page settings-page" aria-labelledby="settings-title">
    <header class="page-header">
      <div>
        <h1 id="settings-title">{{ t.title }}</h1>
        <p class="page-intro">{{ t.intro }}</p>
      </div>
    </header>

    <DisplayPrefsSection />

    <div v-if="statusError" class="alert danger" role="alert">
      <Icon name="warning" :size="15" />{{ statusError }}
      <button type="button" @click="() => refreshStatus()">{{ t.retry }}</button>
    </div>
    <div v-if="loginError" class="alert danger" role="alert"><Icon name="warning" :size="15" />{{ loginError }}</div>
    <div v-if="dataMessage" class="alert success"><Icon name="circle-check" :size="15" />{{ dataMessage }}</div>
    <div v-if="dataError" class="alert danger" role="alert"><Icon name="warning" :size="15" />{{ dataError }}</div>

    <!-- 1. 认证方式 -->
    <AuthSection />

    <!-- 宽屏并列：账户摘要和数据来源各占一列，设备列表在右侧自适应排列。 -->
    <div class="connection-stack">
      <!-- 2. 账户与区域 -->
      <AccountSection />
      <!-- 3. 连接设备 / 数据来源 -->
      <DevicesSection />
    </div>

    <CapabilitySection />
    <WorkoutCodesSection />

    <!-- 隐私与安全这一块最高，早先和「本地数据保留」「导出偏好」并排在三栏里，
         网格拉平行高，右边两张卡片下面就空出小半屏没有意义的留白。
         现在它单独一行，另外两块自己配一对。 -->
    <div class="one-col">
      <!-- 4. 隐私安全 -->
      <PrivacySection />
    </div>

    <!-- 5. MCP -->
    <McpSection />

    <div class="two-col paired">
      <!-- 6. 数据保留 -->
      <RetentionSection />
      <!-- 7. 导出默认值 -->
      <ExportDefaultsSection />
    </div>

    <!-- 历史补拉的账本要和「补拉范围」一起看，所以留在正文；
         数据库快照是灾难恢复工具，进「高级与维护」。 -->
    <div class="one-col wide-panels">
      <HistoryArchivePanel :prefs="userPrefs" @prefs-changed="applyPrefsChange" />
    </div>

    <!-- 8. 软件更新 -->
    <UpdateSection />

    <!-- 9. 自动同步 -->
    <AutoSyncSection />

    <!-- 高级维护 -->
    <AdvancedSection />
  </section>
</template>

<style scoped>
.page { width: 100%; min-width: 0; margin: 0; display: grid; gap: 14px; }
.page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 0; min-width: 0; }
h1, p { margin-top: 0; }
h1 { font-size: 26.5px; font-weight: 700; color: var(--ink); }
.page-intro { margin-bottom: 0; color: var(--muted); font-size: var(--fs-sm); }
.alert { display: flex; align-items: flex-start; gap: 7px; padding: 9px 12px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); color: var(--muted); font-size: var(--fs-sm); }
.alert.success { color: var(--accent); }
.alert.danger { color: var(--danger); }
.alert button { margin-left: auto; border: 0; background: transparent; color: inherit; cursor: pointer; font-size: var(--fs-sm); }
.two-col { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); gap: 14px; align-items: start; }
/* 成对的两块卡片等高对齐；高度由内容较多的一块决定，而不是被第三块撑开。 */
.two-col.paired { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: stretch; }
.one-col { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; }
.wide-panels { grid-template-columns: minmax(0, 1fr); }
.connection-stack { display: grid; grid-template-columns: minmax(320px, .8fr) minmax(0, 1.4fr); gap: 14px; align-items: start; }
.connection-stack > * { min-width: 0; }
.two-col > * { min-width: 0; }

@media (max-width: 1080px) {
  .connection-stack { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 860px) {
  .two-col { grid-template-columns: minmax(0, 1fr); }
}
</style>
