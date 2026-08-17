<script setup lang="ts">
import { computed } from 'vue';
import aiChip from '../assets/design-icons/ai-chip.png';
import aiReady from '../assets/design-icons/ai-ready.png';
import appIcon from '../assets/design-icons/app-icon.png';
import autoSync from '../assets/design-icons/auto-sync.png';
import bodyActivity from '../assets/design-icons/body-activity.png';
import brandMark from '../assets/design-icons/brand-mark.png';
import browserLogin from '../assets/design-icons/browser-login.png';
import chevronDown from '../assets/design-icons/chevron-down.png';
import chevronRight from '../assets/design-icons/chevron-right.png';
import cloudOutput from '../assets/design-icons/cloud-output.png';
import database from '../assets/design-icons/database.png';
import document from '../assets/design-icons/document.png';
import handoff from '../assets/design-icons/handoff.png';
import healthWatch from '../assets/design-icons/health-watch.png';
import heartRate from '../assets/design-icons/heart-rate.png';
import manualEntry from '../assets/design-icons/manual-entry.png';
import outdoorCycling from '../assets/design-icons/outdoor-cycling.png';
import outdoorRun from '../assets/design-icons/outdoor-run.png';
import overview from '../assets/design-icons/overview.png';
import privateIcon from '../assets/design-icons/private.png';
import profile from '../assets/design-icons/profile.png';
import recovery from '../assets/design-icons/recovery.png';
import restingHeartRate from '../assets/design-icons/resting-heart-rate.png';
import secure from '../assets/design-icons/secure.png';
import settings from '../assets/design-icons/settings.png';
import sleep from '../assets/design-icons/sleep.png';
import sleepWaves from '../assets/design-icons/sleep-waves.png';
import steps from '../assets/design-icons/steps.png';
import structuredData from '../assets/design-icons/structured-data.png';
import sync from '../assets/design-icons/sync.png';
import trainingLoad from '../assets/design-icons/training-load.png';
import verified from '../assets/design-icons/verified.png';
import vo2Max from '../assets/design-icons/vo2-max.png';
import watchDevice from '../assets/design-icons/watch-device.png';
import zeppCloud from '../assets/design-icons/zepp-cloud.png';

export type DesignIconName =
  | 'ai-chip'
  | 'ai-ready'
  | 'app-icon'
  | 'auto-sync'
  | 'body-activity'
  | 'brand-mark'
  | 'browser-login'
  | 'chevron-down'
  | 'chevron-right'
  | 'cloud-output'
  | 'database'
  | 'document'
  | 'handoff'
  | 'health-watch'
  | 'heart-rate'
  | 'manual-entry'
  | 'outdoor-cycling'
  | 'outdoor-run'
  | 'overview'
  | 'private'
  | 'profile'
  | 'recovery'
  | 'resting-heart-rate'
  | 'secure'
  | 'settings'
  | 'sleep'
  | 'sleep-waves'
  | 'steps'
  | 'structured-data'
  | 'sync'
  | 'training-load'
  | 'verified'
  | 'vo2-max'
  | 'watch-device'
  | 'zepp-cloud';

const props = withDefaults(defineProps<{
  name: DesignIconName;
  size?: number;
  alt?: string;
}>(), {
  size: 32,
  alt: '',
});

const assets: Record<DesignIconName, string> = {
  'ai-chip': aiChip,
  'ai-ready': aiReady,
  'app-icon': appIcon,
  'auto-sync': autoSync,
  'body-activity': bodyActivity,
  'brand-mark': brandMark,
  'browser-login': browserLogin,
  'chevron-down': chevronDown,
  'chevron-right': chevronRight,
  'cloud-output': cloudOutput,
  database,
  document,
  handoff,
  'health-watch': healthWatch,
  'heart-rate': heartRate,
  'manual-entry': manualEntry,
  'outdoor-cycling': outdoorCycling,
  'outdoor-run': outdoorRun,
  overview,
  private: privateIcon,
  profile,
  recovery,
  'resting-heart-rate': restingHeartRate,
  secure,
  settings,
  sleep,
  'sleep-waves': sleepWaves,
  steps,
  'structured-data': structuredData,
  sync,
  'training-load': trainingLoad,
  verified,
  'vo2-max': vo2Max,
  'watch-device': watchDevice,
  'zepp-cloud': zeppCloud,
};

const source = computed(() => assets[props.name]);
</script>

<template>
  <img
    class="design-icon"
    :src="source"
    :alt="alt"
    :width="size"
    :height="size"
    :style="{ width: `${size}px`, height: `${size}px` }"
    :aria-hidden="alt ? undefined : true"
    draggable="false"
  />
</template>

<style scoped>
.design-icon {
  display: block;
  max-width: none;
  object-fit: contain;
  user-select: none;
  -webkit-user-drag: none;
}
</style>
