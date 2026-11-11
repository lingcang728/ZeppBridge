<script setup lang="ts">
/* Beta 实验室（2026-11-10，计划 C1）：顶替「反馈问题」卡的位置。每一项都标明实验性。
   unstrap 导入 / 导出（UnstrapRows）是一次性的动作；玻璃组合并动效是开关，默认关。
   「推给云端」（2026-11-11）也是开关：只给自己愿意装云端组件的人，关着时别处没有任何云端的字样。组件只有 Windows 版。 */
import GlassSwitch from '../../../components/GlassSwitch.vue';
import { useMessages } from '../../../i18n';
import { labFlag, setLabFlag } from '../../../lib/labs';
import { isWindows } from '../../../lib/platformKeys';
import { cloudMessages } from './cloud.i18n';
import { labsMessages } from './labs.i18n';
import UnstrapRows from './UnstrapRows.vue';

const t = useMessages(labsMessages);
const glassGroup = labFlag('glassGroup');
const c = useMessages(cloudMessages);
const cloud = labFlag('cloud');
const cloudAvailable = isWindows();
</script>

<template>
  <section id="labs" class="s-section">
    <p class="s-note">{{ t.lead }}</p>
    <div class="s-list">
      <UnstrapRows />
      <div class="s-row">
        <div class="s-row-main">
          <span class="s-row-title">{{ t.glassTitle }} <span class="lab-badge">{{ t.badge }}</span></span>
          <span class="s-row-sub">{{ t.glassSub }}</span>
        </div>
        <div class="s-row-control">
          <GlassSwitch data-setting="labs-glass-group" :model-value="glassGroup" :aria-label="t.glassTitle"
            @update:model-value="(on: boolean) => setLabFlag('glassGroup', on)" />
        </div>
      </div>
      <div v-if="cloudAvailable" class="s-row">
        <div class="s-row-main">
          <span class="s-row-title">{{ c.labTitle }} <span class="lab-badge">{{ t.badge }}</span></span>
          <span class="s-row-sub">{{ c.labSub }}</span>
          <RouterLink v-if="cloud" class="why-link" to="/settings/ai">{{ c.secTitle }} →</RouterLink>
        </div>
        <div class="s-row-control">
          <GlassSwitch data-setting="labs-cloud" :model-value="cloud" :aria-label="c.labTitle"
            @update:model-value="(on: boolean) => setLabFlag('cloud', on)" />
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped src="../settings-local.css"></style>
<style scoped src="./labs.css"></style>
