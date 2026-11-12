<script setup lang="ts">
/* Beta 实验室（2026-11-10，计划 C1）：顶替「反馈问题」卡的位置。每一项都标明实验性。
   unstrap 导入 / 导出（UnstrapRows.vue）这一版不上（用户 2026-11-12：「先把所有与 unstrap 相关的选项全部删掉，放到下个版本再做」），
   组件和后端都留着，下个版本挂回来。玻璃组合并动效开关 11-12 撤掉（实现在提交 d0e7dfc4）。
   「推给云端」（2026-11-11）也是开关：只给自己愿意装云端组件的人，关着时别处没有任何云端的字样。组件只有 Windows 版。 */
import GlassSwitch from '../../../components/GlassSwitch.vue';
import { useMessages } from '../../../i18n';
import { labFlag, setLabFlag } from '../../../lib/labs';
import { isWindows } from '../../../lib/platformKeys';
import { cloudMessages } from './cloud.i18n';
import { labsMessages } from './labs.i18n';

const t = useMessages(labsMessages);
const c = useMessages(cloudMessages);
const cloud = labFlag('cloud');
const cloudAvailable = isWindows();
</script>

<template>
  <section id="labs" class="s-section">
    <p class="s-note">{{ t.lead }}</p>
    <div class="s-list">
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
