<script setup lang="ts">
/* Beta 实验室（2026-11-10，计划 C1）：顶替「反馈问题」卡的位置。每一项都标明实验性。
   unstrap 导入 / 导出（UnstrapRows.vue）这一版不上（相关选项先全部拿掉，下个版本再做），
   组件和后端都留着，下个版本挂回来。玻璃组合并动效开关 11-12 撤掉（实现在提交 d0e7dfc4）。

   「Personal Agent 选项」（2026-11-18 与推送入口合并，用户：「只要开关关闭，就不要出现任何东西」）：
   这枚开关就是推送的总闸——关着时界面上哪儿都没有推送 / 云端的字样，推送目标也一并暂停（后端同步后不推）；
   开着时推送的全部设置都在这张卡里（PushSection），不散到别的卡。 */
import GlassSwitch from '../../../components/GlassSwitch.vue';
import { useServerPush } from '../../../composables/useServerPush';
import { useMessages } from '../../../i18n';
import { labFlag, setLabFlag } from '../../../lib/labs';
import { cloudMessages } from './cloud.i18n';
import { labsMessages } from './labs.i18n';
import PushSection from './PushSection.vue';

const t = useMessages(labsMessages);
const c = useMessages(cloudMessages);
const lab = labFlag('cloud');
const push = useServerPush();

/** 总闸：开关跟着把已设好的推送目标一起开 / 停，免得「界面上关了、后台还在推」。 */
const toggle = async (on: boolean) => {
  setLabFlag('cloud', on);
  await push.refresh();
  if (push.state.value?.configured && push.state.value.enabled !== on) await push.setEnabled(on);
};
</script>

<template>
  <section id="labs" class="s-section">
    <p class="s-note">{{ t.lead }}</p>
    <div class="s-list">
      <div class="s-row">
        <div class="s-row-main">
          <span class="s-row-title">{{ c.labTitle }} <span class="lab-badge">{{ t.badge }}</span></span>
          <span class="s-row-sub">{{ c.labSub }}</span>
        </div>
        <div class="s-row-control">
          <GlassSwitch data-setting="labs-cloud" :model-value="lab" :aria-label="c.labTitle" :disabled="!!push.busy.value"
            @update:model-value="toggle" />
        </div>
      </div>
    </div>
  </section>
  <PushSection v-if="lab" />
</template>

<style scoped src="../settings-local.css"></style>
<style scoped src="./labs.css"></style>
