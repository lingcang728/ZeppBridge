<script setup lang="ts">
import { computed, onMounted } from 'vue';
import BrandMark from '../components/BrandMark.vue';
import DesignIcon, { type DesignIconName } from '../components/DesignIcon.vue';
import DeviceMarquee from '../components/DeviceMarquee.vue';
import { useLandingLocale } from '../composables/useLandingLocale';

const githubUrl = 'https://github.com/lingcang728/ZeppBridge';
const releaseUrl = `${githubUrl}/releases/latest`;

const { locale, initializeLocale, toggleLocale } = useLandingLocale();
onMounted(initializeLocale);

// 访客系统探测：Mac 用户默认看到 macOS 版按钮，其余一律 Windows。
// 只做一次静态判断——探测不到就退回 Windows，绝不隐藏另一个平台的入口。
const isMacVisitor = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const platform = `${navigator.platform ?? ''} ${navigator.userAgent ?? ''}`;
  // iPadOS 会伪装成 Mac，但它同样不是 Windows，归到 macOS 一侧不影响判断。
  return /Mac|iPad|iPhone|iPod/i.test(platform);
};

type IconEntry = { icon: DesignIconName; title: string; copy: string };
type TaggedEntry = IconEntry & { tag: string };

interface LandingCopy {
  nav: { home: string; site: string; features: string; local: string; connect: string; privacy: string };
  /** 切到另一种语言的按钮文字，所以写的是目标语言的名字。 */
  languageToggle: string;
  downloads: { windows: { label: string; hint: string }; macos: { label: string; hint: string } };
  hero: {
    headlineLead: string;
    headlineAccent: string;
    lead: string;
    viewSource: string;
    /** 只有英文版有：界面还是中文，不能让人下完才发现。 */
    uiLanguageNotice: string | null;
    trust: Array<{ icon: DesignIconName; label: string }>;
    stageLabel: string;
    coreCaption: string;
    outputs: [{ title: string; copy: string }, { title: string; copy: string }];
    status: { title: string; copy: string };
  };
  principlesLabel: string;
  principles: Array<{ icon: DesignIconName; title: string; copy: string }>;
  features: { overline: string; heading: string; lead: string; items: Array<IconEntry & { tone: string }> };
  local: { overline: string; heading: string; lead: string; items: TaggedEntry[] };
  connect: { overline: string; heading: string; lead: string; items: TaggedEntry[] };
  privacy: {
    overline: string;
    heading: string;
    lead: string;
    points: Array<{ icon: DesignIconName; label: string }>;
    vault: string;
  };
  footer: { tagline: string; disclaimer: string; download: string };
}

// 英文版是重写，不是翻译。中文文案的语气（「缺就是缺，不用 0 补」）直译会全废，
// 所以两边各自按自己的语言写，只保证说的是同一件事。
const COPY: Record<'zh' | 'en', LandingCopy> = {
  zh: {
    nav: {
      home: 'ZeppBridge 首页',
      site: '网站导航',
      features: '数据能力',
      local: '本机出口',
      connect: '连接方式',
      privacy: '隐私',
    },
    languageToggle: 'English',
    downloads: {
      windows: { label: '下载 Windows 版', hint: 'x64 安装包 · exe / msi' },
      macos: { label: '下载 macOS 版', hint: 'Apple Silicon · dmg' },
    },
    hero: {
      headlineLead: '把你的 Zepp 数据，',
      headlineAccent: '完整交还给你。',
      lead: 'ZeppBridge 在 Windows 与 macOS 本机连接、整理并可视化 Amazfit 穿戴数据。数据来源保持清晰，既能自己看，也能安全交给 AI 分析。',
      viewSource: '查看源代码',
      uiLanguageNotice: null,
      trust: [
        { icon: 'secure', label: '本地优先' },
        { icon: 'private', label: '隐私安全' },
        { icon: 'structured-data', label: '结构化数据' },
      ],
      stageLabel: 'Amazfit 在售设备进入 ZeppBridge 并输出结构化数据',
      coreCaption: '解码 · 整理 · 可视化',
      outputs: [
        { title: '结构化记录', copy: '保留来源与时间' },
        { title: 'AI-ready', copy: '由你决定何时交付' },
      ],
      status: { title: '本地管道就绪', copy: '数据不经过 ZeppBridge 服务器' },
    },
    principlesLabel: '产品原则',
    principles: [
      { icon: 'secure', title: '安全 Secure', copy: '数据仅存于本机' },
      { icon: 'private', title: '私密 Private', copy: '不上传，不泄露' },
      { icon: 'database', title: '可追溯 Provenance', copy: '来源不混淆' },
      { icon: 'ai-ready', title: 'AI-ready', copy: '结构清晰，按需使用' },
    ],
    features: {
      overline: 'WHAT YOU CAN READ',
      heading: '从日常状态，到每一次训练。',
      lead: '界面只展示真实获取到的字段；缺失数据会明确标记，不用虚构数值填满仪表盘。',
      items: [
        { icon: 'heart-rate', title: '连续心率', copy: '保留时间戳与数据来源，查看真实波动。', tone: 'red' },
        { icon: 'sleep-waves', title: '睡眠结构', copy: '深睡、浅睡、REM 与清醒阶段本地解析。', tone: 'purple' },
        { icon: 'outdoor-run', title: '训练详情', copy: '轨迹、配速、步频、海拔与训练负荷。', tone: 'green' },
        { icon: 'vo2-max', title: '恢复指标', copy: 'VO₂ Max、HRV 与恢复数据按来源呈现。', tone: 'blue' },
      ],
    },
    local: {
      overline: 'NOT ONLY A WINDOW',
      heading: '不打开界面，也能用。',
      lead: '桌面应用、命令行、MCP 和本机只读接口共用同一个核心，因此单位、时区、来源和缺失值的说法只有一种。缺的数据就是缺的——任何一个出口都不会用 0 填空。',
      items: [
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
      ],
    },
    connect: {
      overline: 'THREE PATHS, ONE LOCAL VAULT',
      heading: '选择适合你的连接方式。',
      lead: 'ZeppBridge 支持从简单的官方网页登录，到可审计的手动授权流程。连接状态和错误原因都会明确显示。',
      items: [
        { icon: 'browser-login', title: '官方网页登录', copy: '在官方登录流程中识别账户授权，凭据留在本机。', tag: '推荐' },
        { icon: 'document', title: 'HAR 导入', copy: '面向调试与高级用户，复用已有的授权请求。', tag: '高级' },
        { icon: 'manual-entry', title: '手动填写', copy: '明确掌控 appToken 与用户标识的输入过程。', tag: '可控' },
      ],
    },
    privacy: {
      overline: 'PRIVACY BY ARCHITECTURE',
      heading: '你的穿戴数据，不该成为别人的云资产。',
      lead: '本地数据库、脱敏显示和来源隔离共同构成默认保护。需要 AI 时，由你主动选择导出的内容和去向。',
      points: [
        { icon: 'database', label: '本地 SQLite 存储' },
        { icon: 'profile', label: '账户标识默认脱敏' },
        { icon: 'cloud-output', label: '导出由用户主动触发' },
      ],
      vault: 'ZeppBridge 没有中转健康数据的后端服务。',
    },
    footer: {
      tagline: '开源的 Amazfit 数据桥接工具 · Windows 和 Mac（Apple Silicon）',
      disclaimer: '独立的非官方开源项目，与 Zepp Health、Huami、Amazfit 无隶属或背书关系。仅用于你本人有权访问的账号和数据。',
      download: '下载',
    },
  },
  en: {
    nav: {
      home: 'ZeppBridge home',
      site: 'Site navigation',
      features: 'What it reads',
      local: 'Local outlets',
      connect: 'Connect',
      privacy: 'Privacy',
    },
    languageToggle: '中文',
    downloads: {
      windows: { label: 'Download for Windows', hint: 'x64 installer · exe / msi' },
      macos: { label: 'Download for macOS', hint: 'Apple Silicon · dmg' },
    },
    hero: {
      headlineLead: 'Your Zepp data,',
      headlineAccent: 'handed back in full.',
      lead: 'ZeppBridge connects, organizes and visualizes your Amazfit wearable data on your own Windows or Mac. Every field keeps its source, so you can read it yourself — or hand it to an AI on your terms.',
      viewSource: 'View source',
      // 落地页英文了、下载下来还是中文界面，等于把人骗进来。应用 i18n 做完再删掉这句。
      uiLanguageNotice: 'The app UI is currently Chinese only — English is in progress.',
      trust: [
        { icon: 'secure', label: 'Local-first' },
        { icon: 'private', label: 'Private by default' },
        { icon: 'structured-data', label: 'Structured data' },
      ],
      stageLabel: 'Current Amazfit devices feeding ZeppBridge and coming out as structured data',
      coreCaption: 'Decode · Organize · Visualize',
      outputs: [
        { title: 'Structured records', copy: 'Source and timestamps kept' },
        { title: 'AI-ready', copy: 'It leaves when you say so' },
      ],
      status: { title: 'Local pipeline ready', copy: 'Nothing routes through a ZeppBridge server' },
    },
    principlesLabel: 'Product principles',
    principles: [
      { icon: 'secure', title: 'Secure', copy: 'Stays on your machine' },
      { icon: 'private', title: 'Private', copy: 'Nothing uploaded, nothing leaked' },
      { icon: 'database', title: 'Provenance', copy: 'Sources never blur together' },
      { icon: 'ai-ready', title: 'AI-ready', copy: 'Clear structure, used on request' },
    ],
    features: {
      overline: 'WHAT YOU CAN READ',
      heading: "From today's numbers to every single session.",
      lead: 'The interface only shows fields it actually received. Anything missing is marked as missing — no invented numbers to fill out a dashboard.',
      items: [
        { icon: 'heart-rate', title: 'Continuous heart rate', copy: 'Timestamps and source kept, so you see the real curve.', tone: 'red' },
        { icon: 'sleep-waves', title: 'Sleep structure', copy: 'Deep, light, REM and awake stages, parsed locally.', tone: 'purple' },
        { icon: 'outdoor-run', title: 'Workout detail', copy: 'Route, pace, cadence, elevation and training load.', tone: 'green' },
        { icon: 'vo2-max', title: 'Recovery metrics', copy: 'VO₂ Max, HRV and recovery figures, shown per source.', tone: 'blue' },
      ],
    },
    local: {
      overline: 'NOT ONLY A WINDOW',
      heading: "You don't have to open it.",
      lead: 'The desktop app, the command line, MCP and the read-only local API share one core — so units, time zones, sources and missing values only ever have one story. Missing is missing: no outlet fills the gap with a zero.',
      items: [
        {
          icon: 'structured-data',
          title: 'Full history & snapshots',
          copy: 'Pull cloud history back month by month with a per-chunk ledger. Whole-database snapshots are checksummed, and you see the row-count difference before restoring.',
          tag: 'Local',
        },
        {
          icon: 'document',
          title: 'Command line',
          copy: 'status / sync / export. No prompts, stable exit codes — safe to hang off Task Scheduler or cron.',
          tag: 'CLI',
        },
        {
          icon: 'ai-ready',
          title: 'Read-only MCP',
          copy: 'Let an AI query your local data itself. stdio transport: no port to listen on, no network access.',
          tag: 'MCP',
        },
      ],
    },
    connect: {
      overline: 'THREE PATHS, ONE LOCAL VAULT',
      heading: 'Pick the way in that suits you.',
      lead: 'From a plain official web login to a fully auditable manual handoff. Connection state and failure reasons are always spelled out.',
      items: [
        { icon: 'browser-login', title: 'Official web login', copy: 'Authorize inside the official flow. Credentials stay on your machine.', tag: 'Recommended' },
        { icon: 'document', title: 'HAR import', copy: 'For debugging and advanced users: reuse an authorized request you already captured.', tag: 'Advanced' },
        { icon: 'manual-entry', title: 'Manual entry', copy: 'Enter the appToken and user id yourself, in full view.', tag: 'Hands-on' },
      ],
    },
    privacy: {
      overline: 'PRIVACY BY ARCHITECTURE',
      heading: "Your wearable data shouldn't become someone else's cloud asset.",
      lead: 'A local database, masked identifiers and isolated sources are the default. When you want an AI involved, you choose what goes out and where it lands.',
      points: [
        { icon: 'database', label: 'Local SQLite storage' },
        { icon: 'profile', label: 'Account IDs masked by default' },
        { icon: 'cloud-output', label: 'Export only when you trigger it' },
      ],
      vault: 'There is no ZeppBridge backend relaying your health data.',
    },
    footer: {
      tagline: 'Open-source Amazfit data bridge · Windows and Mac (Apple Silicon)',
      disclaimer: 'An independent, unofficial open-source project, not affiliated with or endorsed by Zepp Health, Huami or Amazfit. For use only with accounts and data you are entitled to access.',
      download: 'Download',
    },
  },
};

const t = computed(() => COPY[locale.value]);

const primaryDownload = computed(() => (isMacVisitor() ? t.value.downloads.macos : t.value.downloads.windows));
const secondaryDownload = computed(() => (isMacVisitor() ? t.value.downloads.windows : t.value.downloads.macos));
</script>

<template>
  <div class="landing-page">
    <header class="landing-nav">
      <a class="landing-brand" href="#top" :aria-label="t.nav.home"><span><BrandMark :size="34" /></span><strong>ZeppBridge</strong></a>
      <nav :aria-label="t.nav.site"><a href="#features">{{ t.nav.features }}</a><a href="#local">{{ t.nav.local }}</a><a href="#connect">{{ t.nav.connect }}</a><a href="#privacy">{{ t.nav.privacy }}</a></nav>
      <div class="nav-actions">
        <button type="button" class="lang-toggle" @click="toggleLocale"><DesignIcon name="handoff" :size="19" />{{ t.languageToggle }}</button>
        <a class="nav-github" :href="githubUrl" target="_blank" rel="noopener"><DesignIcon name="handoff" :size="23" />GitHub</a>
      </div>
    </header>

    <main id="top">
      <section class="hero-section">
        <div class="hero-copy">
          <p class="overline"><span></span>LOCAL-FIRST · OPEN SOURCE</p>
          <h1>{{ t.hero.headlineLead }}<br /><em>{{ t.hero.headlineAccent }}</em></h1>
          <p class="hero-lead">{{ t.hero.lead }}</p>
          <div class="hero-actions">
            <a class="primary-cta" :href="releaseUrl" target="_blank" rel="noopener"><DesignIcon name="app-icon" :size="34" /><span><b>{{ primaryDownload.label }}</b><small>{{ primaryDownload.hint }}</small></span><DesignIcon name="chevron-right" :size="20" /></a>
            <a class="alt-cta" :href="releaseUrl" target="_blank" rel="noopener"><DesignIcon name="app-icon" :size="24" /><span><b>{{ secondaryDownload.label }}</b><small>{{ secondaryDownload.hint }}</small></span></a>
            <a class="secondary-cta" :href="githubUrl" target="_blank" rel="noopener"><DesignIcon name="document" :size="27" />{{ t.hero.viewSource }}</a>
          </div>
          <p v-if="t.hero.uiLanguageNotice" class="ui-language-notice"><DesignIcon name="handoff" :size="19" />{{ t.hero.uiLanguageNotice }}</p>
          <div class="trust-row"><span v-for="item in t.hero.trust" :key="item.label"><DesignIcon :name="item.icon" :size="23" />{{ item.label }}</span></div>
        </div>

        <div class="hero-stage" :aria-label="t.hero.stageLabel">
          <div class="stage-glow"></div>
          <DeviceMarquee class="hero-marquee" />
          <article class="bridge-core"><DesignIcon name="app-icon" :size="72" /><div><span>LOCAL BRIDGE</span><strong>ZeppBridge</strong><small>{{ t.hero.coreCaption }}</small></div></article>
          <div class="output-stack">
            <article><DesignIcon name="structured-data" :size="37" /><span><b>{{ t.hero.outputs[0].title }}</b><small>{{ t.hero.outputs[0].copy }}</small></span></article>
            <article><DesignIcon name="ai-ready" :size="37" /><span><b>{{ t.hero.outputs[1].title }}</b><small>{{ t.hero.outputs[1].copy }}</small></span></article>
          </div>
          <div class="stage-status"><DesignIcon name="verified" :size="24" /><span><b>{{ t.hero.status.title }}</b><small>{{ t.hero.status.copy }}</small></span></div>
        </div>
      </section>

      <section class="principle-strip" :aria-label="t.principlesLabel">
        <div v-for="item in t.principles" :key="item.title"><DesignIcon :name="item.icon" :size="30" /><span><b>{{ item.title }}</b><small>{{ item.copy }}</small></span></div>
      </section>

      <section id="features" class="content-section feature-section">
        <div class="section-heading"><p>{{ t.features.overline }}</p><h2>{{ t.features.heading }}</h2><span>{{ t.features.lead }}</span></div>
        <div class="capability-grid"><article v-for="item in t.features.items" :key="item.title" :class="`capability-card tone-${item.tone}`"><DesignIcon :name="item.icon" :size="62" /><span><b>{{ item.title }}</b><small>{{ item.copy }}</small></span><DesignIcon name="chevron-right" :size="19" /></article></div>
      </section>

      <section id="local" class="content-section connect-section">
        <div class="connect-intro"><p>{{ t.local.overline }}</p><h2>{{ t.local.heading }}</h2><span>{{ t.local.lead }}</span><div class="connect-art"><DesignIcon name="app-icon" :size="84" /><div class="mini-flow"><i></i><i></i><i></i></div><DesignIcon name="structured-data" :size="84" /></div></div>
        <div class="auth-grid"><article v-for="outlet in t.local.items" :key="outlet.title"><div class="auth-title"><DesignIcon :name="outlet.icon" :size="46" /><span>{{ outlet.tag }}</span></div><h3>{{ outlet.title }}</h3><p>{{ outlet.copy }}</p><DesignIcon name="chevron-right" :size="19" /></article></div>
      </section>

      <section id="connect" class="content-section connect-section">
        <div class="connect-intro"><p>{{ t.connect.overline }}</p><h2>{{ t.connect.heading }}</h2><span>{{ t.connect.lead }}</span><div class="connect-art"><DesignIcon name="zepp-cloud" :size="84" /><div class="mini-flow"><i></i><i></i><i></i></div><DesignIcon name="app-icon" :size="84" /></div></div>
        <div class="auth-grid"><article v-for="method in t.connect.items" :key="method.title"><div class="auth-title"><DesignIcon :name="method.icon" :size="46" /><span>{{ method.tag }}</span></div><h3>{{ method.title }}</h3><p>{{ method.copy }}</p><DesignIcon name="chevron-right" :size="19" /></article></div>
      </section>

      <section id="privacy" class="privacy-section">
        <div class="privacy-copy"><p>{{ t.privacy.overline }}</p><h2>{{ t.privacy.heading }}</h2><span>{{ t.privacy.lead }}</span><div class="privacy-points"><span v-for="point in t.privacy.points" :key="point.label"><DesignIcon :name="point.icon" :size="26" />{{ point.label }}</span></div></div>
        <div class="privacy-vault"><DesignIcon name="private" :size="104" /><div><b>LOCAL VAULT</b><span>{{ t.privacy.vault }}</span></div></div>
      </section>
    </main>

    <footer><a class="landing-brand" href="#top"><span><BrandMark :size="29" /></span><strong>ZeppBridge</strong></a><p>{{ t.footer.tagline }}</p><p class="footer-disclaimer">{{ t.footer.disclaimer }}</p><div><a :href="githubUrl" target="_blank" rel="noopener">GitHub</a><a :href="releaseUrl" target="_blank" rel="noopener">{{ t.footer.download }}</a></div></footer>
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
.nav-actions { display: inline-flex; align-items: center; gap: 10px; }
.lang-toggle { display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px 7px 8px; border: 1px solid var(--site-line); border-radius: 11px; background: rgba(255,255,255,.02); color: #9ca892; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
.lang-toggle:hover { color: #d6e99e; border-color: rgba(185,220,112,.5); }
.nav-github { display: inline-flex; align-items: center; gap: 7px; padding: 7px 12px 7px 7px; border: 1px solid var(--site-line); border-radius: 11px; background: rgba(255,255,255,.02); color: #dce7cb; font-size: 12px; font-weight: 700; text-decoration: none; }
.ui-language-notice { display: inline-flex; align-items: center; gap: 7px; margin: 16px 0 0; padding: 7px 12px 7px 9px; border: 1px solid rgba(211,231,171,.16); border-radius: 11px; color: #a9b79c; font-size: 11px; line-height: 1.5; }
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
.primary-cta, .secondary-cta, .nav-github, .lang-toggle { transition: transform .2s ease, border-color .2s ease, color .2s ease; }
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
@media (max-width: 720px) { .landing-nav { width: min(100% - 28px,1240px); }.landing-nav nav { display: none; }.hero-section, .content-section, .principle-strip, footer { width: min(100% - 28px,1240px); }.hero-section { min-height: auto; padding: 48px 0 64px; }.hero-copy h1 { font-size: 44px; }.hero-actions { align-items: stretch; flex-direction: column; }.primary-cta { min-width: 0; }.ui-language-notice { align-items: flex-start; }.trust-row { flex-wrap: wrap; }.hero-stage { min-height: auto; }.output-stack { grid-template-columns: 1fr 1fr; }.principle-strip { grid-template-columns: repeat(2,1fr); }.principle-strip > div:nth-child(2) { border-right: 0; }.principle-strip > div:nth-child(-n+2) { border-bottom: 1px solid var(--site-line); }.content-section { padding: 84px 0; }.capability-grid, .auth-grid { grid-template-columns: 1fr; }.capability-card { min-height: 210px; }.auth-grid article { min-height: 245px; }.privacy-section { padding: 80px 20px; }.privacy-vault { align-items: flex-start; flex-direction: column; }.privacy-vault > .design-icon { width: 78px !important; height: 78px !important; } footer { align-items: flex-start; flex-wrap: wrap; padding: 28px 0; } footer p { width: 100%; order: 3; } }
@media (prefers-reduced-motion: reduce) { .landing-page { scroll-behavior: auto; } .primary-cta, .secondary-cta, .nav-github, .lang-toggle { transition: none; } }
</style>
