<script setup lang="ts">
import { computed } from 'vue';
import BrandMark from '../components/BrandMark.vue';
import DesignIcon, { type DesignIconName } from '../components/DesignIcon.vue';
import DeviceMarquee from '../components/DeviceMarquee.vue';

const githubUrl = 'https://github.com/lingcang728/ZeppBridge';
const releaseUrl = `${githubUrl}/releases/latest`;

// 访客系统探测：Mac 用户默认看到 macOS 版按钮，其余一律 Windows。
// 只做一次静态判断——探测不到就退回 Windows，绝不隐藏另一个平台的入口。
const isMacVisitor = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const platform = `${navigator.platform ?? ''} ${navigator.userAgent ?? ''}`;
  // iPadOS 会伪装成 Mac，但它同样不是 Windows，归到 macOS 一侧不影响判断。
  return /Mac|iPad|iPhone|iPod/i.test(platform);
};

const downloads = {
  windows: { key: 'windows', label: '下载 Windows 版', hint: 'x64 安装包 · exe / msi' },
  macos: { key: 'macos', label: '下载 macOS 版', hint: 'Apple Silicon · dmg' },
} as const;

const primaryDownload = computed(() => (isMacVisitor() ? downloads.macos : downloads.windows));
const secondaryDownload = computed(() => (isMacVisitor() ? downloads.windows : downloads.macos));

const capabilities: Array<{ icon: DesignIconName; title: string; copy: string; tone: string }> = [
  { icon: 'heart-rate', title: '连续心率', copy: '保留时间戳与数据来源，查看真实波动。', tone: 'red' },
  { icon: 'sleep-waves', title: '睡眠结构', copy: '深睡、浅睡、REM 与清醒阶段本地解析。', tone: 'purple' },
  { icon: 'outdoor-run', title: '训练详情', copy: '轨迹、配速、步频、海拔与训练负荷。', tone: 'green' },
  { icon: 'vo2-max', title: '恢复指标', copy: 'VO₂ Max、HRV 与恢复数据按来源呈现。', tone: 'blue' },
];

/* 1.0.0 起，桌面窗口不是唯一入口。这三条都在本机跑，没有一条会把数据发出去。 */
const localOutlets: Array<{ icon: DesignIconName; title: string; copy: string; tag: string }> = [
  {
    icon: 'structured-data',
    title: '完整历史与快照',
    copy: '按月把云端历史补回本机，逐块记账；整库快照带校验，恢复前先看记录数差异。',
    tag: '本机',
  },
  {
    icon: 'document',
    title: '命令行',
    copy: 'status / sync / export，无交互，退出码稳定，可挂到任务计划或 cron。',
    tag: 'CLI',
  },
  {
    icon: 'ai-ready',
    title: '只读 MCP',
    copy: '让 AI 直接查你的本机数据。stdio 传输，不监听端口，也不联网。',
    tag: 'MCP',
  },
];

const authMethods: Array<{ icon: DesignIconName; title: string; copy: string; tag: string }> = [
  { icon: 'browser-login', title: '官方网页登录', copy: '在官方登录流程中识别账户授权，凭据留在本机。', tag: '推荐' },
  { icon: 'document', title: 'HAR 导入', copy: '面向调试与高级用户，复用已有的授权请求。', tag: '高级' },
  { icon: 'manual-entry', title: '手动填写', copy: '明确掌控 appToken 与用户标识的输入过程。', tag: '可控' },
];
</script>

<template>
  <div class="landing-page">
    <header class="landing-nav">
      <a class="landing-brand" href="#top" aria-label="ZeppBridge 首页"><span><BrandMark :size="34" /></span><strong>ZeppBridge</strong></a>
      <nav aria-label="网站导航"><a href="#features">数据能力</a><a href="#local">本机出口</a><a href="#connect">连接方式</a><a href="#privacy">隐私</a></nav>
      <a class="nav-github" :href="githubUrl" target="_blank" rel="noopener"><DesignIcon name="handoff" :size="23" />GitHub</a>
    </header>

    <main id="top">
      <section class="hero-section">
        <div class="hero-copy">
          <p class="overline"><span></span>LOCAL-FIRST · OPEN SOURCE</p>
          <h1>把你的 Zepp 数据，<br /><em>完整交还给你。</em></h1>
          <p class="hero-lead">ZeppBridge 在 Windows 与 macOS 本机连接、整理并可视化 Amazfit 穿戴数据。数据来源保持清晰，既能自己看，也能安全交给 AI 分析。</p>
          <div class="hero-actions">
            <a class="primary-cta" :href="releaseUrl" target="_blank" rel="noopener"><DesignIcon name="app-icon" :size="34" /><span><b>{{ primaryDownload.label }}</b><small>{{ primaryDownload.hint }}</small></span><DesignIcon name="chevron-right" :size="20" /></a>
            <a class="alt-cta" :href="releaseUrl" target="_blank" rel="noopener"><DesignIcon name="app-icon" :size="24" /><span><b>{{ secondaryDownload.label }}</b><small>{{ secondaryDownload.hint }}</small></span></a>
            <a class="secondary-cta" :href="githubUrl" target="_blank" rel="noopener"><DesignIcon name="document" :size="27" />查看源代码</a>
          </div>
          <div class="trust-row"><span><DesignIcon name="secure" :size="23" />本地优先</span><span><DesignIcon name="private" :size="23" />隐私安全</span><span><DesignIcon name="structured-data" :size="23" />结构化数据</span></div>
        </div>

        <div class="hero-stage" aria-label="Amazfit 在售设备进入 ZeppBridge 并输出结构化数据">
          <div class="stage-glow"></div>
          <DeviceMarquee class="hero-marquee" />
          <article class="bridge-core"><DesignIcon name="app-icon" :size="72" /><div><span>LOCAL BRIDGE</span><strong>ZeppBridge</strong><small>解码 · 整理 · 可视化</small></div></article>
          <div class="output-stack">
            <article><DesignIcon name="structured-data" :size="37" /><span><b>结构化记录</b><small>保留来源与时间</small></span></article>
            <article><DesignIcon name="ai-ready" :size="37" /><span><b>AI-ready</b><small>由你决定何时交付</small></span></article>
          </div>
          <div class="stage-status"><DesignIcon name="verified" :size="24" /><span><b>本地管道就绪</b><small>数据不经过 ZeppBridge 服务器</small></span></div>
        </div>
      </section>

      <section class="principle-strip" aria-label="产品原则">
        <div><DesignIcon name="secure" :size="30" /><span><b>安全 Secure</b><small>数据仅存于本机</small></span></div>
        <div><DesignIcon name="private" :size="30" /><span><b>私密 Private</b><small>不上传，不泄露</small></span></div>
        <div><DesignIcon name="database" :size="30" /><span><b>可追溯 Provenance</b><small>来源不混淆</small></span></div>
        <div><DesignIcon name="ai-ready" :size="30" /><span><b>AI-ready</b><small>结构清晰，按需使用</small></span></div>
      </section>

      <section id="features" class="content-section feature-section">
        <div class="section-heading"><p>WHAT YOU CAN READ</p><h2>从日常状态，到每一次训练。</h2><span>界面只展示真实获取到的字段；缺失数据会明确标记，不用虚构数值填满仪表盘。</span></div>
        <div class="capability-grid"><article v-for="item in capabilities" :key="item.title" :class="`capability-card tone-${item.tone}`"><DesignIcon :name="item.icon" :size="62" /><span><b>{{ item.title }}</b><small>{{ item.copy }}</small></span><DesignIcon name="chevron-right" :size="19" /></article></div>
      </section>

      <section id="local" class="content-section connect-section">
        <div class="connect-intro"><p>NOT ONLY A WINDOW</p><h2>不打开界面，也能用。</h2><span>桌面应用、命令行、MCP 和本机只读接口共用同一个核心，因此单位、时区、来源和缺失值的说法只有一种。缺的数据就是缺的——任何一个出口都不会用 0 填空。</span><div class="connect-art"><DesignIcon name="app-icon" :size="84" /><div class="mini-flow"><i></i><i></i><i></i></div><DesignIcon name="structured-data" :size="84" /></div></div>
        <div class="auth-grid"><article v-for="outlet in localOutlets" :key="outlet.title"><div class="auth-title"><DesignIcon :name="outlet.icon" :size="46" /><span>{{ outlet.tag }}</span></div><h3>{{ outlet.title }}</h3><p>{{ outlet.copy }}</p><DesignIcon name="chevron-right" :size="19" /></article></div>
      </section>

      <section id="connect" class="content-section connect-section">
        <div class="connect-intro"><p>THREE PATHS, ONE LOCAL VAULT</p><h2>选择适合你的连接方式。</h2><span>ZeppBridge 支持从简单的官方网页登录，到可审计的手动授权流程。连接状态和错误原因都会明确显示。</span><div class="connect-art"><DesignIcon name="zepp-cloud" :size="84" /><div class="mini-flow"><i></i><i></i><i></i></div><DesignIcon name="app-icon" :size="84" /></div></div>
        <div class="auth-grid"><article v-for="method in authMethods" :key="method.title"><div class="auth-title"><DesignIcon :name="method.icon" :size="46" /><span>{{ method.tag }}</span></div><h3>{{ method.title }}</h3><p>{{ method.copy }}</p><DesignIcon name="chevron-right" :size="19" /></article></div>
      </section>

      <section id="privacy" class="privacy-section">
        <div class="privacy-copy"><p>PRIVACY BY ARCHITECTURE</p><h2>你的穿戴数据，不该成为别人的云资产。</h2><span>本地数据库、脱敏显示和来源隔离共同构成默认保护。需要 AI 时，由你主动选择导出的内容和去向。</span><div class="privacy-points"><span><DesignIcon name="database" :size="26" />本地 SQLite 存储</span><span><DesignIcon name="profile" :size="26" />账户标识默认脱敏</span><span><DesignIcon name="cloud-output" :size="26" />导出由用户主动触发</span></div></div>
        <div class="privacy-vault"><DesignIcon name="private" :size="104" /><div><b>LOCAL VAULT</b><span>ZeppBridge 没有中转健康数据的后端服务。</span></div></div>
      </section>
    </main>

    <footer><a class="landing-brand" href="#top"><span><BrandMark :size="29" /></span><strong>ZeppBridge</strong></a><p>开源的 Amazfit 数据桥接工具 · Windows 和 Mac（Apple Silicon）</p><p class="footer-disclaimer">独立的非官方开源项目，与 Zepp Health、Huami、Amazfit 无隶属或背书关系。仅用于你本人有权访问的账号和数据。</p><div><a :href="githubUrl" target="_blank" rel="noopener">GitHub</a><a :href="releaseUrl" target="_blank" rel="noopener">下载</a></div></footer>
  </div>
</template>

<style scoped>
.landing-page { --site-bg: #0c0f0d; --site-card: #151a16; --site-line: rgba(211,231,171,.12); min-height: 100%; height: 100%; overflow-x: hidden; overflow-y: auto; background: radial-gradient(circle at 72% 6%, rgba(94,133,49,.12), transparent 28%), var(--site-bg); color: #f2f5ea; scroll-behavior: smooth; }
.landing-page::before { position: fixed; z-index: 0; inset: 0; pointer-events: none; content: ''; opacity: .25; background-image: linear-gradient(rgba(207,228,170,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(207,228,170,.025) 1px, transparent 1px); background-size: 56px 56px; mask-image: linear-gradient(to bottom, black, transparent 70%); }
.landing-nav { position: relative; z-index: 10; display: flex; align-items: center; justify-content: space-between; width: min(1240px, calc(100% - 48px)); min-height: 74px; margin: 0 auto; border-bottom: 1px solid var(--site-line); }
.landing-brand { display: inline-flex; align-items: center; gap: 10px; text-decoration: none; }
.landing-brand > span { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 13px; background: rgba(203,229,132,.05); }
.landing-brand strong { font-size: 18px; letter-spacing: -.02em; }
.landing-nav nav { display: flex; gap: 30px; }
.landing-nav nav a { color: #9ca892; font-size: 12px; text-decoration: none; }
.landing-nav nav a:hover { color: #d6e99e; }
.nav-github { display: inline-flex; align-items: center; gap: 7px; padding: 7px 12px 7px 7px; border: 1px solid var(--site-line); border-radius: 11px; background: rgba(255,255,255,.02); color: #dce7cb; font-size: 12px; font-weight: 700; text-decoration: none; }
main, footer { position: relative; z-index: 1; }
.hero-section { display: grid; grid-template-columns: minmax(0,.9fr) minmax(520px,1.1fr); align-items: center; gap: 42px; width: min(1240px, calc(100% - 48px)); min-height: 690px; margin: 0 auto; padding: 72px 0 82px; }
.overline, .section-heading > p, .connect-intro > p, .privacy-copy > p { display: flex; align-items: center; gap: 8px; margin: 0 0 20px; color: #91b44e; font-family: var(--font-mono); font-size: 10px; font-weight: 700; letter-spacing: .17em; }
.overline span { width: 24px; height: 1px; background: #91b44e; }
.hero-copy h1 { max-width: 660px; margin: 0; font-size: clamp(48px, 5.5vw, 78px); line-height: 1.03; letter-spacing: -.065em; }
.hero-copy h1 em { color: #b9dc70; font-style: normal; }
.hero-lead { max-width: 620px; margin: 26px 0 0; color: #9da79a; font-size: 16px; line-height: 1.8; }
.hero-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 32px; }
.primary-cta, .secondary-cta { display: inline-flex; align-items: center; text-decoration: none; }
.primary-cta { gap: 10px; min-width: 244px; white-space: nowrap; padding: 8px 10px 8px 8px; border: 1px solid rgba(185,220,112,.45); border-radius: 14px; background: linear-gradient(135deg, #789f39, #58772c); color: #f8faef; box-shadow: 0 14px 32px rgba(80,111,38,.2); }
.primary-cta > span { display: grid; margin-right: auto; }
.primary-cta b { font-size: 13px; } .primary-cta small { color: rgba(247,250,238,.68); font-size: 10px; }
.alt-cta { display: inline-flex; gap: 9px; align-items: center; white-space: nowrap; padding: 8px 14px 8px 9px; border: 1px solid var(--site-line); border-radius: 14px; background: #151915; color: #dce6cd; text-decoration: none; }
.alt-cta > span { display: grid; }
.alt-cta b { font-size: 12px; font-weight: 700; } .alt-cta small { color: rgba(220,230,205,.6); font-size: 10px; }
.alt-cta:hover { transform: translateY(-2px); border-color: rgba(185,220,112,.5); }
.alt-cta { transition: transform .2s ease, border-color .2s ease; }
.secondary-cta { gap: 8px; white-space: nowrap; padding: 12px 16px 12px 10px; border: 1px solid var(--site-line); border-radius: 14px; background: #151915; color: #dce6cd; font-size: 12px; font-weight: 700; }
.primary-cta, .secondary-cta, .nav-github { transition: transform .2s ease, border-color .2s ease; }
.primary-cta:hover, .secondary-cta:hover, .nav-github:hover { transform: translateY(-2px); border-color: rgba(185,220,112,.5); }
.trust-row { display: flex; gap: 20px; margin-top: 26px; color: #7e8a79; font-size: 10px; }
.trust-row span { display: inline-flex; align-items: center; gap: 5px; }
.hero-stage { position: relative; display: grid; align-content: start; gap: 18px; min-height: 510px; padding: 28px 22px 18px; overflow: hidden; border: 1px solid var(--site-line); border-radius: 28px; background: linear-gradient(145deg, rgba(26,32,25,.9), rgba(13,16,14,.94)); box-shadow: inset 0 1px 0 rgba(255,255,255,.025), 0 35px 90px rgba(0,0,0,.24); }
.stage-glow { position: absolute; inset: 13% 24%; border-radius: 50%; background: rgba(130,175,61,.13); filter: blur(70px); pointer-events: none; }
.hero-marquee { position: relative; z-index: 1; }
.mini-flow i { position: relative; display: block; height: 1px; background: linear-gradient(90deg, rgba(145,180,78,.15), #8fb34a); }
.mini-flow i::after { position: absolute; top: -3px; right: -1px; width: 7px; height: 7px; border-top: 1px solid #8fb34a; border-right: 1px solid #8fb34a; content: ''; transform: rotate(45deg); }
.bridge-core { position: relative; z-index: 2; display: grid; justify-items: center; justify-self: center; gap: 8px; width: 168px; padding: 14px 12px; border: 1px solid rgba(185,220,112,.25); border-radius: 23px; background: linear-gradient(145deg, rgba(56,72,38,.85), rgba(26,33,24,.95)); box-shadow: 0 20px 55px rgba(0,0,0,.3); }
.bridge-core div { display: grid; justify-items: center; } .bridge-core span { color: #8fa968; font-family: var(--font-mono); font-size: 8px; letter-spacing: .14em; } .bridge-core strong { font-size: 16px; } .bridge-core small { color: #7e8a76; font-size: 9px; }
.output-stack { position: relative; z-index: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 13px; }
.output-stack article { display: flex; align-items: center; gap: 8px; padding: 9px; border: 1px solid var(--site-line); border-radius: 14px; background: rgba(20,25,21,.92); }
.output-stack span { display: grid; } .output-stack b { font-size: 11px; } .output-stack small { color: #737e70; font-size: 8px; }
.stage-status { position: relative; z-index: 1; display: flex; align-items: center; gap: 8px; padding: 9px 0 0; border-top: 1px solid var(--site-line); color: #9aaa8e; }
.stage-status span { display: grid; } .stage-status b { color: #b8d27e; font-size: 10px; } .stage-status small { font-size: 9px; }
.principle-strip { display: grid; grid-template-columns: repeat(4,1fr); width: min(1240px, calc(100% - 48px)); margin: 0 auto; border-top: 1px solid var(--site-line); border-bottom: 1px solid var(--site-line); }
.principle-strip > div { display: flex; align-items: center; justify-content: center; gap: 9px; min-height: 92px; border-right: 1px solid var(--site-line); }
.principle-strip > div:last-child { border-right: 0; }
.principle-strip span { display: grid; } .principle-strip b { font-size: 11px; } .principle-strip small { color: #717c6d; font-size: 9px; }
.content-section { width: min(1240px, calc(100% - 48px)); margin: 0 auto; padding: 116px 0; }
.section-heading { max-width: 780px; }
.section-heading > p, .connect-intro > p, .privacy-copy > p { margin-bottom: 12px; }
.section-heading h2, .connect-intro h2, .privacy-copy h2 { margin: 0; font-size: clamp(31px,4vw,52px); line-height: 1.08; letter-spacing: -.05em; }
.section-heading > span, .connect-intro > span, .privacy-copy > span { display: block; max-width: 680px; margin-top: 18px; color: #8c9788; line-height: 1.8; }
.capability-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 14px; margin-top: 48px; }
.capability-card { position: relative; overflow: hidden; display: grid; min-height: 260px; padding: 22px; border: 1px solid var(--site-line); border-radius: 21px; background: var(--site-card); }
.capability-card::before { position: absolute; right: -40px; bottom: -60px; width: 160px; height: 160px; border-radius: 50%; content: ''; background: rgba(125,163,62,.08); filter: blur(12px); }
.capability-card > span { display: grid; align-self: end; gap: 5px; } .capability-card b { font-size: 18px; } .capability-card small { color: #7e897a; line-height: 1.65; }
.capability-card > .design-icon:last-child { position: absolute; top: 22px; right: 20px; opacity: .5; }
.capability-card.tone-red::before { background: rgba(240,97,106,.12); } .capability-card.tone-purple::before { background: rgba(139,92,246,.14); } .capability-card.tone-blue::before { background: rgba(74,168,232,.13); }
.connect-section { display: grid; grid-template-columns: .82fr 1.18fr; gap: 70px; align-items: center; }
.connect-art { display: flex; align-items: center; gap: 12px; margin-top: 38px; }
.mini-flow { display: grid; gap: 12px; width: 90px; }
.auth-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; }
.auth-grid article { position: relative; min-height: 315px; padding: 19px; border: 1px solid var(--site-line); border-radius: 21px; background: linear-gradient(160deg, #181d18, #111411); }
.auth-title { display: flex; align-items: flex-start; justify-content: space-between; } .auth-title > span { padding: 3px 7px; border-radius: 6px; background: rgba(145,180,78,.1); color: #9fbd63; font-size: 9px; }
.auth-grid h3 { margin: 56px 0 8px; font-size: 18px; } .auth-grid p { margin: 0; color: #7c8778; font-size: 11px; line-height: 1.7; }
.auth-grid article > .design-icon:last-child { position: absolute; right: 18px; bottom: 18px; opacity: .5; }
.privacy-section { display: grid; grid-template-columns: 1fr .75fr; gap: 80px; align-items: center; padding: 100px max(24px, calc((100% - 1240px)/2)); background: linear-gradient(135deg, #171d15, #0d110e); border-top: 1px solid var(--site-line); border-bottom: 1px solid var(--site-line); }
.privacy-points { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 30px; }.privacy-points span { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px 6px 6px; border: 1px solid var(--site-line); border-radius: 10px; color: #9faa99; font-size: 10px; }
.privacy-vault { display: flex; align-items: center; gap: 18px; min-height: 210px; padding: 28px; border: 1px solid rgba(185,220,112,.22); border-radius: 28px; background: radial-gradient(circle at 28% 50%, rgba(126,167,58,.16), transparent 40%), rgba(11,14,11,.65); }
.privacy-vault div { display: grid; gap: 6px; }.privacy-vault b { color: #b9d87a; font-family: var(--font-mono); font-size: 13px; letter-spacing: .12em; }.privacy-vault span { color: #7e8979; font-size: 11px; line-height: 1.6; }
footer { display: flex; align-items: center; flex-wrap: wrap; gap: 18px; width: min(1240px, calc(100% - 48px)); min-height: 120px; margin: 0 auto; } footer p { margin-right: auto; color: #697365; font-size: 10px; } footer .footer-disclaimer { flex-basis: 100%; margin-right: 0; max-width: 62ch; line-height: 1.6; } footer > div { display: flex; gap: 20px; } footer > div a { color: #909b8c; font-size: 11px; text-decoration: none; }
@media (max-width: 1080px) { .hero-section { grid-template-columns: 1fr; padding-top: 56px; } .hero-stage { min-height: 500px; } .capability-grid { grid-template-columns: repeat(2,1fr); } .connect-section { grid-template-columns: 1fr; } .privacy-section { grid-template-columns: 1fr; } }
@media (max-width: 720px) { .landing-nav { width: min(100% - 28px,1240px); }.landing-nav nav { display: none; }.hero-section, .content-section, .principle-strip, footer { width: min(100% - 28px,1240px); }.hero-section { min-height: auto; padding: 48px 0 64px; }.hero-copy h1 { font-size: 44px; }.hero-actions { align-items: stretch; flex-direction: column; }.primary-cta { min-width: 0; }.trust-row { flex-wrap: wrap; }.hero-stage { min-height: auto; }.output-stack { grid-template-columns: 1fr 1fr; }.principle-strip { grid-template-columns: repeat(2,1fr); }.principle-strip > div:nth-child(2) { border-right: 0; }.principle-strip > div:nth-child(-n+2) { border-bottom: 1px solid var(--site-line); }.content-section { padding: 84px 0; }.capability-grid, .auth-grid { grid-template-columns: 1fr; }.capability-card { min-height: 210px; }.auth-grid article { min-height: 245px; }.privacy-section { padding: 80px 20px; }.privacy-vault { align-items: flex-start; flex-direction: column; }.privacy-vault > .design-icon { width: 78px !important; height: 78px !important; } footer { align-items: flex-start; flex-wrap: wrap; padding: 28px 0; } footer p { width: 100%; order: 3; } }
@media (prefers-reduced-motion: reduce) { .landing-page { scroll-behavior: auto; } .primary-cta, .secondary-cta, .nav-github { transition: none; } }
</style>
