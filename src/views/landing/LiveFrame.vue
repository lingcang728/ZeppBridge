<script setup lang="ts">
import { computed } from 'vue';
import MotionReel from './MotionReel.vue';
import type { LandingLocale } from '../../composables/useLandingLocale';
const props = defineProps<{ route: string; locale: LandingLocale; title: string }>();
const scene = computed(() => ({ '/': 'overview', '/sleep': 'sleep', '/workouts': 'workouts', '/settings': 'settings' })[props.route] ?? 'overview');
</script>
<template><MotionReel class="live-frame" :id="scene" :locale="locale" :title="title" :data-live-route="route" /></template>
