<script setup lang="ts">
/* 收尾：一句大标题、下载按钮（按访客平台挑主按钮）、另一平台和 MSI / Linux 的链接，
 * 以及装之前该知道的几件事：渠道、适用系统、要不要另外的 AI 账号、各平台的安装提示。 */
import LandingIcon from './LandingIcon.vue';
import { magnetic } from './motion';
import type { LandingCopy } from './types';

defineProps<{
  copy: LandingCopy['final'];
  downloads: LandingCopy['downloads'];
  primary: { label: string; hint: string; href: string };
  secondary: { label: string; hint: string; href: string };
  msiHref: string;
  linux: Array<{ label: string; url: string }>;
  linuxIsPreview: boolean;
  status: string;
}>();
const emit = defineEmits<{ download: [] }>();
const pull = magnetic(12);
</script>

<template>
  <section id="download" class="lp-section final">
    <div class="final-glow" aria-hidden="true"></div>
    <div class="final-inner lp-center" data-reveal>
      <h2 class="lp-h2 final-title">{{ copy.heading }}</h2>
      <p class="lp-lead">{{ copy.lead }}</p>
      <div class="final-cta">
        <a class="lp-btn lp-btn-primary" :href="primary.href" rel="noopener" v-on="pull" @click="emit('download')">
          <LandingIcon name="download" :size="20" />
          <span>{{ primary.label }}<small>{{ primary.hint }}</small></span>
        </a>
        <a class="lp-btn lp-btn-ghost" :href="secondary.href" rel="noopener" @click="emit('download')">
          <span>{{ secondary.label }}<small>{{ secondary.hint }}</small></span>
        </a>
      </div>
      <p class="links">
        <a :href="msiHref" rel="noopener" @click="emit('download')">{{ downloads.windows.msi }}</a>
        <template v-if="linux.length">
          <span>{{ downloads.linux.label }}<em v-if="linuxIsPreview">{{ downloads.linux.previewBadge }}</em></span>
          <a v-for="item in linux" :key="item.label" :href="item.url" rel="noopener" @click="emit('download')">{{ item.label }}</a>
        </template>
      </p>
      <p class="status">{{ status }}</p>
    </div>

    <ul class="facts" data-reveal style="--i: 1">
      <li><LandingIcon name="check" :size="16" />{{ copy.facts.channel }}</li>
      <li><LandingIcon name="laptop" :size="16" />{{ copy.facts.systems }}</li>
      <li><LandingIcon name="sparkle" :size="16" />{{ copy.facts.ai }}</li>
      <li><LandingIcon name="key" :size="16" />{{ copy.facts.windows }}</li>
      <li><LandingIcon name="lock" :size="16" />{{ copy.facts.macos }}</li>
      <li v-if="linuxIsPreview" class="wide"><LandingIcon name="terminal" :size="16" />{{ downloads.linux.note }}</li>
    </ul>
  </section>
</template>

<style scoped>
.final { padding-bottom: 40px; }
.final-glow { position: absolute; top: 40px; left: 50%; z-index: -1; width: min(1100px, 100vw); height: 600px; border-radius: 50%; background: radial-gradient(closest-side, var(--lp-glow), transparent 70%); opacity: .7; transform: translateX(-50%); pointer-events: none; }
.final-title { max-width: 14em; font-size: clamp(36px, 5.6vw, 76px); }
.final-cta { display: flex; flex-wrap: wrap; justify-content: center; gap: 14px; margin-top: 36px; }
.final-cta .lp-btn { min-height: 60px; text-align: left; }
.links { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 8px 18px; margin: 24px 0 0; color: var(--lp-subtle); font-size: 14px; }
.links a { color: var(--lp-muted); text-decoration-color: var(--lp-line-2); text-underline-offset: 4px; }
.links a:hover { color: var(--lp-ink); }
.links em { margin-left: 6px; padding: 1px 8px; border-radius: 999px; background: color-mix(in srgb, var(--lp-green) 14%, transparent); color: var(--lp-green); font-size: 12px; font-style: normal; }
.status { margin: 12px 0 0; color: var(--lp-subtle); font-family: var(--font-mono); font-size: 12.5px; }
.facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 28px; max-width: 980px; margin: 64px auto 0; padding: 28px 30px; border: 1px solid var(--lp-line); border-radius: 24px; background: color-mix(in srgb, var(--lp-panel) 60%, transparent); list-style: none; }
.facts li { display: flex; align-items: flex-start; gap: 10px; color: var(--lp-muted); font-size: 14px; line-height: 1.6; }
.facts li .lp-icon { margin-top: 3px; color: var(--lp-green); }
.facts li.wide { grid-column: 1 / -1; }
@media (max-width: 720px) { .facts { grid-template-columns: 1fr; padding: 22px; } }
</style>
