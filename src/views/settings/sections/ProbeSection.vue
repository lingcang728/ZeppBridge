<script setup lang="ts">
/* 接口诊断：每个探测过的接口一行。是拿来排查的，不是拿来读的，所以默认收起、放在高级卡。 */
import Icon from '../../../components/Icon.vue';
import { useSettingsContext } from '../../../composables/settings/context';
import { useMessages } from '../../../i18n';
import { settingsMessages } from '../../Settings.i18n';

const t = useMessages(settingsMessages);
const { probeBusy, probeDiagnostics, runCapabilityProbe } = useSettingsContext().capability;
</script>

<template>
  <details class="s-list probe-fold">
    <summary class="s-row">
      <span class="s-row-main"><span class="s-row-title">{{ t.probeSummary }}</span></span>
      <Icon name="chevron-down" :size="16" class="fold-caret" />
    </summary>
    <div class="s-row">
      <div class="s-row-main"><span class="s-row-sub">{{ t.probeNote }}</span></div>
      <div class="s-row-control">
        <button class="button secondary" type="button" :disabled="probeBusy" @click="runCapabilityProbe">
          <Icon name="sync" :size="14" :class="{ spinning: probeBusy }" />
          {{ probeBusy ? t.probing : t.probeRun }}
        </button>
      </div>
    </div>
    <div v-if="probeDiagnostics.length" class="s-row is-block">
      <ul class="probe-lines">
        <li v-for="line in probeDiagnostics" :key="line">{{ line }}</li>
      </ul>
    </div>
  </details>
</template>

<style scoped src="../settings-local.css"></style>
<style scoped>
.probe-fold > summary { cursor: pointer; list-style: none; }
.probe-fold > summary::-webkit-details-marker { display: none; }
.fold-caret { color: var(--subtle); transition: transform var(--dur-base) var(--ease-out); }
.probe-fold[open] .fold-caret { transform: rotate(180deg); }
.probe-lines { margin: 0; padding-left: 18px; }
.probe-lines li { color: var(--muted); font-family: var(--font-mono); font-size: var(--fs-xs); line-height: 1.7; overflow-wrap: anywhere; }
</style>
