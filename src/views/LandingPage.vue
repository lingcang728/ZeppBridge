<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import BrandMark from '../components/BrandMark.vue';
import DesignIcon, { type DesignIconName } from '../components/DesignIcon.vue';
import DeviceMarquee from '../components/DeviceMarquee.vue';
import { useLandingLocale } from '../composables/useLandingLocale';
import { isUsableReleasePayload } from '../lib/releaseAssets';

const githubUrl = 'https://github.com/lingcang728/ZeppBridge';
const releaseUrl = `${githubUrl}/releases/latest`;
const releaseEndpoint = '/api/release';

const { locale, initializeLocale, toggleLocale } = useLandingLocale();

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
type DownloadPlatform = 'windows' | 'macos';

interface ReleaseAsset {
  /** 这个下载项还没有经过真实设备验证。目前只有 Linux 的四个包会带上它。 */
  preview?: boolean;
  name: string;
  url: string;
  size: number;
  digest: string | null;
}

interface LatestRelease {
  version: string;
  tagName: string;
  publishedAt: string;
  releaseUrl: string;
  downloads: {
    windowsExe: ReleaseAsset;
    windowsMsi: ReleaseAsset;
    macosDmg: ReleaseAsset;
    /*
     * Linux 四个包。**可选**：它们从 2.0.0 才开始有，而这个页面还要能对着
     * 更早的 latest release 正常渲染。
     *
     * `preview` 由 /api/release 给，不写死在页面上——写死的话，等哪天真的
     * 有人在 Linux 上跑通了登录和密钥环，没人会记得回来删那句话。
     */
    linuxDeb?: ReleaseAsset;
    linuxRpm?: ReleaseAsset;
    linuxAppImage?: ReleaseAsset;
    linuxFlatpak?: ReleaseAsset;
  };
}

interface LandingCopy {
  nav: { home: string; site: string; features: string; local: string; connect: string; privacy: string; star: string };
  /** 切到另一种语言的按钮文字，所以写的是目标语言的名字。 */
  languageToggle: string;
  downloads: {
    windows: { label: string; hint: string; msi: string };
    macos: { label: string; hint: string };
    linux: { label: string; previewBadge: string; note: string };
    status: { loading: string; ready: string; fallback: string };
  };
  hero: {
    headlineLead: string;
    headlineAccent: string;
    lead: string;
    starNudge: { title: string; copy: string; action: string; dismiss: string };
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
      star: '给个 Star',
    },
    languageToggle: 'English',
    downloads: {
      windows: { label: '下载 Windows 版', hint: '推荐 · x64 EXE 安装包', msi: '企业 / 批量部署：下载 MSI' },
      macos: { label: '下载 macOS 版', hint: 'Apple Silicon · DMG 安装包' },
      linux: {
        label: 'Linux',
        previewBadge: '实验性',
        // 一句话把边界说清楚。含糊其辞的「实验性支持」只会让人以为是客套。
        note: 'deb / rpm / AppImage / Flatpak 已经能由 CI 构建出来，但还没有人在真实 Linux 桌面上完整跑通登录和密钥环（Secret Service / KWallet）。愿意试的话，遇到问题请开 issue——这正是它现在最需要的。',
      },
      status: {
        loading: '正在读取 GitHub 最新安装包…',
        ready: '点击直接下载，无需打开 GitHub',
        fallback: '暂时没读取到直链，点击会打开 GitHub Release 页面',
      },
    },
    hero: {
      headlineLead: '把你的 Zepp 数据，',
      headlineAccent: '完整交还给你。',
      lead: 'ZeppBridge 在 Windows、macOS 与 Linux 本机连接、整理并可视化 Amazfit 穿戴数据。数据来源保持清晰，既能自己看，也能安全交给 AI 分析。',
      starNudge: {
        title: '下载已开始',
        copy: '如果 ZeppBridge 对你有用，欢迎顺手在 GitHub 点个 Star。它会让更多 Amazfit 用户找到这个项目。',
        action: '去 GitHub 点 Star',
        dismiss: '暂时不用',
      },
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
      star: 'Star on GitHub',
    },
    languageToggle: '中文',
    downloads: {
      windows: { label: 'Download for Windows', hint: 'Recommended · x64 EXE installer', msi: 'Managed deployment: download MSI' },
      macos: { label: 'Download for macOS', hint: 'Apple Silicon · DMG installer' },
      linux: {
        label: 'Linux',
        previewBadge: 'Preview',
        note: 'deb / rpm / AppImage / Flatpak all build in CI, but nobody has yet completed sign-in plus keyring (Secret Service / KWallet) on a real Linux desktop. Try it if you like — and please open an issue when something breaks. That is exactly what it needs right now.',
      },
      status: {
        loading: 'Checking the latest GitHub release…',
        ready: 'Downloads directly — no GitHub page in the way',
        fallback: 'Direct links are temporarily unavailable; the Release page will open instead',
      },
    },
    hero: {
      headlineLead: 'Your Zepp data,',
      headlineAccent: 'handed back in full.',
      lead: 'ZeppBridge connects, organizes and visualizes your Amazfit wearable data on your own Windows, Mac or Linux machine. Every field keeps its source, so you can read it yourself — or hand it to an AI on your terms.',
      starNudge: {
        title: 'Your download has started',
        copy: 'If ZeppBridge earns a place on your machine, a GitHub Star helps more Amazfit users find it.',
        action: 'Star ZeppBridge on GitHub',
        dismiss: 'Maybe later',
      },
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

const latestRelease = ref<LatestRelease | null>(null);
const releaseState = ref<'loading' | 'ready' | 'fallback'>('loading');
const showStarNudge = ref(false);

const isTrustedAssetUrl = (value: string): boolean =>
  value.startsWith(`${githubUrl}/releases/download/`);

const loadLatestRelease = async () => {
  try {
    const response = await fetch(releaseEndpoint, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`release endpoint returned ${response.status}`);
    const payload = await response.json() as LatestRelease;
    /*
     * 判据在 lib/releaseAssets.ts，那里能测。
     *
     * 这里原来写的是 `assets.length !== 3`：2.0.0 给 /api/release 加了四个
     * 可选的 Linux 包之后，这一句立刻把整个下载页打进 fallback——三个 CTA
     * 全部退化成「打开 GitHub Release 页面」，Windows 和 macOS 的直链也跟着
     * 一起没了。页面照样渲染，控制台照样干净。
     */
    if (!isUsableReleasePayload(payload.downloads, isTrustedAssetUrl)) {
      throw new Error('release endpoint returned an invalid asset set');
    }
    latestRelease.value = payload;
    releaseState.value = 'ready';
  } catch {
    releaseState.value = 'fallback';
  }
};

onMounted(() => {
  initializeLocale();
  void loadLatestRelease();
});

const primaryPlatform = computed<DownloadPlatform>(() => (isMacVisitor() ? 'macos' : 'windows'));
const secondaryPlatform = computed<DownloadPlatform>(() => (primaryPlatform.value === 'macos' ? 'windows' : 'macos'));
const primaryDownload = computed(() => t.value.downloads[primaryPlatform.value]);
const secondaryDownload = computed(() => t.value.downloads[secondaryPlatform.value]);
const assetFor = (platform: DownloadPlatform): ReleaseAsset | null => {
  if (!latestRelease.value) return null;
  return platform === 'windows'
    ? latestRelease.value.downloads.windowsExe
    : latestRelease.value.downloads.macosDmg;
};
const primaryAsset = computed(() => assetFor(primaryPlatform.value));
const secondaryAsset = computed(() => assetFor(secondaryPlatform.value));
const primaryHref = computed(() => primaryAsset.value?.url ?? releaseUrl);
const secondaryHref = computed(() => secondaryAsset.value?.url ?? releaseUrl);
const windowsMsiHref = computed(() => latestRelease.value?.downloads.windowsMsi.url ?? releaseUrl);
/*
 * Linux 的四个包。没有就整块不渲染——旧的 latest release 里确实没有它们，
 * 那不是错误，不该在页面上留下四个指向 GitHub 首页的死链接。
 */
const linuxDownloads = computed(() => {
  const downloads = latestRelease.value?.downloads;
  if (!downloads) return [];
  const candidates: Array<{ label: string; asset?: ReleaseAsset }> = [
    { label: '.deb', asset: downloads.linuxDeb },
    { label: '.rpm', asset: downloads.linuxRpm },
    { label: 'AppImage', asset: downloads.linuxAppImage },
    { label: 'Flatpak', asset: downloads.linuxFlatpak },
  ];
  return candidates
    .filter((entry): entry is { label: string; asset: ReleaseAsset } => Boolean(entry.asset))
    .map((entry) => ({ label: entry.label, url: entry.asset.url }));
});
const linuxIsPreview = computed(
  () => latestRelease.value?.downloads.linuxDeb?.preview === true,
);
const releaseStatusText = computed(() => {
  if (releaseState.value === 'ready') {
    return `v${latestRelease.value?.version} · ${t.value.downloads.status.ready}`;
  }
  return t.value.downloads.status[releaseState.value];
});
const revealStarNudge = () => {
  showStarNudge.value = true;
};
</script>

<template>
  <div class="landing-page">
    <header class="landing-nav">
      <a class="landing-brand" href="#top" :aria-label="t.nav.home"><span><BrandMark :size="34" /></span><strong>ZeppBridge</strong></a>
      <nav :aria-label="t.nav.site"><a href="#features">{{ t.nav.features }}</a><a href="#local">{{ t.nav.local }}</a><a href="#connect">{{ t.nav.connect }}</a><a href="#privacy">{{ t.nav.privacy }}</a></nav>
      <div class="nav-actions">
        <button type="button" class="lang-toggle" @click="toggleLocale"><DesignIcon name="handoff" :size="19" />{{ t.languageToggle }}</button>
        <a class="nav-github" :href="githubUrl" target="_blank" rel="noopener">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.8 2.7 5.47 6.04.88-4.37 4.26 1.03 6.02L12 16.58l-5.4 2.85 1.03-6.02-4.37-4.26 6.04-.88L12 2.8Z" /></svg>
          {{ t.nav.star }}
        </a>
      </div>
    </header>

    <main id="top">
      <section class="hero-section">
        <div class="hero-copy">
          <p class="overline"><span></span>LOCAL-FIRST · OPEN SOURCE</p>
          <h1>{{ t.hero.headlineLead }}<br /><em>{{ t.hero.headlineAccent }}</em></h1>
          <p class="hero-lead">{{ t.hero.lead }}</p>
          <div class="hero-actions">
            <div class="download-choice is-primary">
              <a class="primary-cta" :href="primaryHref" :target="primaryAsset ? undefined : '_blank'" rel="noopener" @click="revealStarNudge">
                <DesignIcon name="app-icon" :size="34" />
                <span><b>{{ primaryDownload.label }}</b><small>{{ primaryDownload.hint }}</small></span>
                <DesignIcon name="chevron-right" :size="20" />
              </a>
              <a v-if="primaryPlatform === 'windows'" class="format-link" :href="windowsMsiHref" :target="latestRelease ? undefined : '_blank'" rel="noopener" @click="revealStarNudge">{{ t.downloads.windows.msi }}</a>
            </div>
            <div class="download-choice">
              <a class="alt-cta" :href="secondaryHref" :target="secondaryAsset ? undefined : '_blank'" rel="noopener" @click="revealStarNudge">
                <DesignIcon name="app-icon" :size="24" />
                <span><b>{{ secondaryDownload.label }}</b><small>{{ secondaryDownload.hint }}</small></span>
              </a>
              <a v-if="secondaryPlatform === 'windows'" class="format-link" :href="windowsMsiHref" :target="latestRelease ? undefined : '_blank'" rel="noopener" @click="revealStarNudge">{{ t.downloads.windows.msi }}</a>
            </div>
          </div>
          <div v-if="linuxDownloads.length" class="linux-row">
            <p class="linux-head">
              <strong>{{ t.downloads.linux.label }}</strong>
              <em v-if="linuxIsPreview">{{ t.downloads.linux.previewBadge }}</em>
            </p>
            <div class="linux-links">
              <a
                v-for="item in linuxDownloads"
                :key="item.label"
                :href="item.url"
                rel="noopener"
                @click="revealStarNudge"
              >{{ item.label }}</a>
            </div>
            <p v-if="linuxIsPreview" class="linux-note">{{ t.downloads.linux.note }}</p>
          </div>
          <p class="release-status" :class="`is-${releaseState}`"><i></i>{{ releaseStatusText }}</p>
          <Transition name="star-nudge">
            <aside v-if="showStarNudge" class="star-nudge" aria-live="polite">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.8 2.7 5.47 6.04.88-4.37 4.26 1.03 6.02L12 16.58l-5.4 2.85 1.03-6.02-4.37-4.26 6.04-.88L12 2.8Z" /></svg>
              <div><strong>{{ t.hero.starNudge.title }}</strong><p>{{ t.hero.starNudge.copy }}</p></div>
              <a :href="githubUrl" target="_blank" rel="noopener">{{ t.hero.starNudge.action }}</a>
              <button type="button" @click="showStarNudge = false">{{ t.hero.starNudge.dismiss }}</button>
            </aside>
          </Transition>
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

<style scoped src="./LandingPage.css"></style>
