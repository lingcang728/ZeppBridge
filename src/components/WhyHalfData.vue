<script setup lang="ts">
/* 「为什么有些数据没有？」的正文。设置页账号卡的弹窗和 3.0.2 更新说明第一页共用这一份，
   改措辞只改 WhyHalfData.i18n.ts。两条连接左右对照（窄屏上下叠），各自能拿到什么一枚枚列出来，
   不再是四段长文（用户 2026-10-19：「很难读」）。 */
import { computed } from 'vue';
import Icon from './Icon.vue';
import { useMessages } from '../i18n';
import { whyHalfDataMessages } from './WhyHalfData.i18n';

defineProps<{ titleId: string }>();
const t = useMessages(whyHalfDataMessages);
const list = (value: string) => value.split('|').map((item) => item.trim()).filter(Boolean);
const official = computed(() => list(t.value.officialHas));
const advanced = computed(() => list(t.value.advancedHas));
</script>

<template>
  <div class="why-half">
    <h3 :id="titleId">{{ t.title }}</h3>
    <p class="why-lead">{{ t.lead }}</p>
    <div class="why-columns">
      <section class="why-col">
        <header><span class="why-glyph"><Icon name="shield" :size="16" /></span><strong>{{ t.officialName }}</strong></header>
        <ul class="why-chips"><li v-for="item in official" :key="item">{{ item }}</li></ul>
        <p class="why-line is-no"><Icon name="x" :size="14" />{{ t.officialLacks }}</p>
      </section>
      <section class="why-col is-advanced">
        <header><span class="why-glyph"><Icon name="key" :size="16" /></span><strong>{{ t.advancedName }}</strong></header>
        <ul class="why-chips"><li v-for="item in advanced" :key="item">{{ item }}</li></ul>
        <p class="why-line"><Icon name="lock" :size="14" />{{ t.advancedLogin }}</p>
        <p class="why-line is-no"><Icon name="x" :size="14" />{{ t.advancedNoThirdParty }}</p>
      </section>
    </div>
    <p class="why-footer">{{ t.footer }}</p>
  </div>
</template>

<style scoped>
.why-half h3 { margin: 0; font-size: var(--fs-md); font-weight: 700; line-height: 1.4; letter-spacing: -.01em; }
.why-lead { margin: 6px 0 16px; color: var(--muted); font-size: var(--fs-xs); line-height: 1.6; }
.why-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.why-col { display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; border-radius: var(--radius-sm); background: var(--mat-inset); box-shadow: var(--mat-inset-shadow); }
.why-col header { display: flex; align-items: center; gap: 8px; font-size: var(--fs-xs); }
.why-col header strong { font-weight: 700; }
.why-glyph { display: inline-grid; place-items: center; width: 26px; height: 26px; border-radius: 8px; color: var(--muted); background: color-mix(in srgb, var(--ink) 7%, transparent); }
.is-advanced .why-glyph { color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent); }
.why-chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
.why-chips li { padding: 3px 9px; border-radius: 999px; background: color-mix(in srgb, var(--ink) 7%, transparent); color: var(--ink); font-size: var(--fs-2xs); line-height: 1.5; }
.is-advanced .why-chips li { background: color-mix(in srgb, var(--accent) 13%, transparent); }
.why-line { display: flex; align-items: flex-start; gap: 6px; margin: 0; color: var(--ink); font-size: var(--fs-2xs); line-height: 1.55; }
.why-line :deep(svg) { flex: none; margin-top: 2px; color: var(--accent); }
.why-line.is-no { color: var(--muted); }
.why-line.is-no :deep(svg) { color: var(--danger); }
.why-footer { margin: 14px 0 0; color: var(--subtle); font-size: var(--fs-2xs); line-height: 1.65; }
@media (max-width: 600px) { .why-columns { grid-template-columns: 1fr; } }
</style>
