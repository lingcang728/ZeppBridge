<script setup lang="ts">
import LandingIcon from './LandingIcon.vue';
import type { LandingCopy } from './types';
import { GITHUB_URL } from './useDownloads';
defineProps<{ copy: LandingCopy }>();
</script>
<template>
<section id="privacy" class="lp-section trust" aria-labelledby="privacy-title">
<div class="trust-top"><div><p class="lp-kicker">{{ copy.privacy.kicker }}</p><h2 id="privacy-title" class="lp-h2">{{ copy.privacy.heading }}</h2></div><p class="lp-lead">{{ copy.privacy.lead }}</p></div>
<ol class="data-path"><li><LandingIcon name="watch" :size="25" /><span>{{ copy.privacy.nodes.watch }}</span></li><li><LandingIcon name="cloud" :size="25" /><span>{{ copy.privacy.nodes.cloud }}</span></li><li class="your-computer"><LandingIcon name="laptop" :size="25" /><span>{{ copy.privacy.nodes.computer }}</span></li><li class="ai-destination"><LandingIcon name="file" :size="25" /><span>{{ copy.privacy.nodes.export }}<small>{{ copy.privacy.exportNote }}</small></span></li></ol>
<p class="data-path-note">{{ copy.privacy.flowNote }}</p>
<div class="trust-details"><div class="connection-summary"><p class="lp-kicker">{{ copy.connect.recommended }}</p><h3>{{ copy.connect.paths[0].title }}</h3><p>{{ copy.connect.paths[0].copy }} {{ copy.connect.paths[0].detail }}</p><details><summary>{{ copy.rebuild.moreConnections }}<LandingIcon name="chevron-down" :size="15" /></summary><div v-for="path in copy.connect.paths.slice(1)" :key="path.title"><h4>{{ path.title }}</h4><p>{{ path.copy }} {{ path.detail }}</p></div><p>{{ copy.connect.note }}</p><a :href="GITHUB_URL+'/blob/v3/docs/guides/connection.md'" target="_blank" rel="noopener noreferrer">{{ copy.connect.docs }} ↗</a></details></div>
<div class="boundaries"><div v-for="point in copy.privacy.points" :key="point.title"><h3>{{ point.title }}</h3><p>{{ point.copy }}</p></div><details><summary>{{ copy.privacy.services.title }}<LandingIcon name="chevron-down" :size="15" /></summary><p>{{ copy.privacy.services.copy }}</p><a :href="GITHUB_URL+'/blob/v3/docs/reference/security-and-privacy.md'" target="_blank" rel="noopener noreferrer">{{ copy.privacy.docs }} ↗</a></details></div></div>
</section>
</template>
<style scoped>
.trust { padding-top:70px; padding-bottom:30px; }
.trust-top { display:grid; grid-template-columns:1.2fr 1fr; gap:72px; align-items:end; }
.trust-top .lp-lead { margin:0; font-size:15px; }
.data-path { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); list-style:none; padding:28px 0; margin:40px 0 0; border-block:1px solid var(--lp-line); }
.data-path li { display:flex; align-items:center; gap:12px; padding:10px 16px; border-right:1px solid var(--lp-line); color:var(--lp-muted); font-size:12px; line-height:1.7; position:relative; }
.data-path li:first-child { padding-left:0; }
.data-path li:not(:last-child)::after { content:"→"; position:absolute; right:-7px; background:var(--lp-bg); color:var(--lp-subtle); }
.data-path li:last-child { border:0; }
.data-path small { display:block; font-size:10px; color:var(--lp-subtle); margin-top:2px; }
.data-path .your-computer { color:var(--lp-green); font-weight:600; }
.data-path .ai-destination { font-size:11px; }
.data-path-note { color:var(--lp-subtle); font-size:11px; margin:14px 0 0; line-height:1.8; }
.trust-details { display:grid; grid-template-columns:1fr 1fr; gap:80px; margin-top:36px; }
.trust-details h3 { font-size:16px; font-weight:600; margin:0 0 10px; }
.trust-details p { color:var(--lp-muted); font-size:12px; line-height:1.9; margin:0 0 16px; }
.trust-details h4 { font-size:13px; margin:22px 0 8px; }
.trust-details details { border-top:1px solid var(--lp-line); font-size:12px; }
.trust-details summary { display:flex; justify-content:space-between; gap:16px; align-items:center; min-height:46px; cursor:pointer; list-style:none; }
summary::-webkit-details-marker { display:none; }
.trust-details a { display:inline-flex; padding:10px 0; color:var(--lp-green); text-underline-offset:5px; }
.boundaries > div { padding-bottom:8px; }
.boundaries h3 { font-size:13px; }
@media(max-width:720px) { .trust-top,.trust-details { grid-template-columns:1fr; gap:24px; } .data-path { grid-template-columns:1fr 1fr; gap:12px; padding:18px 0; margin-top:24px; } .data-path li { padding:10px!important; border:0; font-size:11px; } .data-path li::after { display:none; } .trust-details { margin-top:24px; } }
</style>
