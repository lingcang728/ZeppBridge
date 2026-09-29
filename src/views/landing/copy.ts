import type { LandingCopy } from './types';

/*
 * 落地页的中英文案（首屏即时，不等网络）。其余八种语言是同目录的懒加载语言包。
 * 英文是重写不是翻译：两边各按自己的语言写，只保证说的是同一件事。
 * 不用破折号；演示数字一律是示例。
 */
export const COPY: Record<'zh' | 'en', LandingCopy> = {
  zh: {
    nav: {
      home: 'ZeppBridge 首页',
      site: '网站导航',
      connect: '连接',
      motion: '界面',
      handoff: '交给 AI',
      privacy: '隐私',
      star: 'GitHub',
      language: '界面语言',
    },
    downloads: {
      windows: { label: '下载 Windows 版', hint: 'x64 安装包', msi: '批量部署：下载 MSI' },
      macos: { label: '下载 macOS 版', hint: 'Apple Silicon' },
      linux: {
        label: 'Linux',
        previewBadge: '实验性',
        note: 'deb / rpm / AppImage / Flatpak 已由 CI 构建，但还没人在真实 Linux 桌面上完整跑通登录和密钥环。遇到问题开 issue。',
      },
      status: {
        loading: '正在读取最新安装包',
        ready: '点击直接下载',
        fallback: '暂时读不到直链，点击会打开 GitHub Release',
      },
    },
    hero: {
      headlineLead: '你的 Zepp 数据，',
      headlineAccent: '回到你自己手里。',
      lead: '在自己的电脑上同步、查看、整理 Amazfit 数据，想交给 AI 时一键打包。',
      github: '在 GitHub 上查看',
      starNudge: {
        title: '下载已开始',
        copy: 'ZeppBridge 有用的话，在 GitHub 点个 Star，让更多 Amazfit 用户找到它。',
        action: '去点 Star',
        dismiss: '暂时不用',
      },
    },
    demo: {
      label: 'ZeppBridge 概览页的可交互演示',
      sample: '示例数据',
      hint: '点一张卡片试试',
      back: '返回',
      greeting: '概览',
      heart: { title: '最近心率', unit: '次/分', detail: '全天逐分钟心率，没戴表的那几分钟留空，不补 0。' },
      steps: { title: '今日步数', unit: '步', detail: '每小时步数来自 Zepp 官方授权，和你自己此前的记录比。' },
      sleep: { title: '昨晚睡眠', hours: '小时', minutes: '分', detail: '深睡、浅睡、REM、清醒按时间排开，官方给的 REM 真值优先。' },
    },
    devicesLabel: '支持的 Amazfit 设备',
    connect: {
      heading: '三种连接方式，选最顺手的那条',
      lead: '先用官方授权，想要更多指标再补上高级数据。两条都没法用时，还能手动填。',
      recommended: '推荐',
      paths: [
        {
          icon: 'verified',
          title: 'Zepp 官方授权',
          copy: '在你平时的浏览器里登录 Zepp，点同意就连上。',
          detail: 'Google、小米、Apple 账号都能用。睡眠、心率、步数、运动、PAI、体重会同步。',
        },
        {
          icon: 'zepp-cloud',
          title: '高级数据',
          copy: '补上官方没有开放的 HRV、血氧、压力、准备度。',
          detail: '用邮箱或手机号登录，令牌只存在系统凭据管理器里。',
        },
        {
          icon: 'manual-entry',
          title: '手动填写',
          copy: '前两条都用不了时的后备方案。',
          detail: '自己粘贴令牌，适合熟悉接口的用户。',
        },
      ],
    },
    deck: {
      heading: '设置不是一长串表单，是一叠卡片',
      lead: '把鼠标放上去它们会散开，点一张就抽出来。',
      hint: '悬停散开，点一张抽出来',
      close: '放回去',
      cards: [
        { icon: 'profile', title: '账号与设备', copy: '官方授权和高级数据各占一行，连的是哪个账号一眼看清。' },
        { icon: 'auto-sync', title: '同步与更新', copy: '启动时同步一次，之后按你设的间隔静默同步。' },
        { icon: 'database', title: '归档与存储', copy: '保留多久由你定，快照可以随时恢复。' },
        { icon: 'structured-data', title: '数据健康', copy: '每条数据流拉没拉到、看没看懂、写没写进去，分开说清。' },
        { icon: 'secure', title: '隐私与安全', copy: '本机只读接口默认关闭，只绑 127.0.0.1。' },
      ],
    },
    handoff: {
      heading: '把要问的数据拖给 AI',
      lead: '拖动一个指标，旁边的节点会让开；松手落在中间，它就进这次交给 AI 的包。',
      hint: '拖一个节点到中间',
      center: '交给 AI',
      nodes: ['心率', '睡眠', 'HRV', '步数', '训练负荷', 'PAI', '体重', '压力'],
      picked: '已选 {n} 项',
      reset: '重来',
    },
    privacy: {
      heading: '数据只在你的电脑上',
      lead: 'ZeppBridge 没有自己的服务器存你的健康数据。',
      points: [
        { icon: 'secure', title: '令牌进系统凭据库', copy: '默认放进 Windows 凭据管理器或 macOS 钥匙串，不写进数据目录。' },
        { icon: 'private', title: '没有遥测', copy: '不上报使用情况，不收集任何健康数据。' },
        { icon: 'database', title: '来源分得清', copy: '每条记录都知道自己来自官方授权还是高级数据。' },
        { icon: 'ai-ready', title: '交给 AI 由你决定', copy: '选哪些、交多少、什么时候交，都在你手里。' },
      ],
    },
    footer: {
      heading: '免费、开源，装上就能用',
      tagline: '本地优先的 Amazfit / Zepp 数据桥梁。',
      disclaimer: 'ZeppBridge 是独立的开源项目，与 Zepp Health、Amazfit 没有隶属关系。',
      download: '下载',
    },
  },
  en: {
    nav: {
      home: 'ZeppBridge home',
      site: 'Site navigation',
      connect: 'Connect',
      motion: 'Interface',
      handoff: 'AI handoff',
      privacy: 'Privacy',
      star: 'GitHub',
      language: 'Language',
    },
    downloads: {
      windows: { label: 'Download for Windows', hint: 'x64 installer', msi: 'Deploying at scale? Get the MSI' },
      macos: { label: 'Download for macOS', hint: 'Apple Silicon' },
      linux: {
        label: 'Linux',
        previewBadge: 'Experimental',
        note: 'deb, rpm, AppImage and Flatpak are CI-built, but nobody has run sign-in and the keyring end to end on a real Linux desktop yet. Hit a problem? Open an issue.',
      },
      status: {
        loading: 'Looking up the latest installer',
        ready: 'Click to download directly',
        fallback: 'Direct link unavailable, so this opens the GitHub release',
      },
    },
    hero: {
      headlineLead: 'Your Zepp data,',
      headlineAccent: 'back in your hands.',
      lead: 'Sync, browse and organize your Amazfit data on your own computer. Package it for an AI in one click.',
      github: 'View on GitHub',
      starNudge: {
        title: 'Your download has started',
        copy: 'If ZeppBridge helps you, a star on GitHub helps other Amazfit owners find it.',
        action: 'Star on GitHub',
        dismiss: 'Not now',
      },
    },
    demo: {
      label: 'Interactive demo of the ZeppBridge overview',
      sample: 'Sample data',
      hint: 'Tap a card',
      back: 'Back',
      greeting: 'Overview',
      heart: { title: 'Heart rate', unit: 'bpm', detail: 'Minute by minute, all day. Minutes off the wrist stay empty, never zero-filled.' },
      steps: { title: 'Steps today', unit: 'steps', detail: 'Hourly steps come from the Zepp official authorization, compared only with your own history.' },
      sleep: { title: 'Last night', hours: 'h', minutes: 'min', detail: 'Deep, light, REM and awake laid out in order, with the official measured REM preferred.' },
    },
    devicesLabel: 'Supported Amazfit devices',
    connect: {
      heading: 'Three ways in. Pick the easy one.',
      lead: 'Start with the official authorization and add advanced data for more metrics. Manual entry is there if neither works.',
      recommended: 'Recommended',
      paths: [
        {
          icon: 'verified',
          title: 'Zepp official authorization',
          copy: 'Sign in to Zepp in your usual browser and approve.',
          detail: 'Google, Xiaomi and Apple accounts all work. Sleep, heart rate, steps, workouts, PAI and weight sync.',
        },
        {
          icon: 'zepp-cloud',
          title: 'Advanced data',
          copy: 'Adds HRV, blood oxygen, stress and readiness the official API does not offer.',
          detail: 'Signs in with email or phone. The token lives only in your system credential store.',
        },
        {
          icon: 'manual-entry',
          title: 'Manual entry',
          copy: 'A fallback when the other two are not an option.',
          detail: 'Paste a token yourself. Meant for people who know the API.',
        },
      ],
    },
    deck: {
      heading: 'Settings as a deck of cards, not a wall of forms',
      lead: 'Hover and they fan out. Click one to pull it out.',
      hint: 'Hover to fan, click to open',
      close: 'Put it back',
      cards: [
        { icon: 'profile', title: 'Account and devices', copy: 'Official authorization and advanced data each get a row, so you always know which account is connected.' },
        { icon: 'auto-sync', title: 'Sync and updates', copy: 'Syncs once at launch, then quietly on the schedule you set.' },
        { icon: 'database', title: 'Archive and storage', copy: 'Retention is your call. Snapshots restore any time.' },
        { icon: 'structured-data', title: 'Data health', copy: 'Whether each stream was fetched, understood and written, told apart.' },
        { icon: 'secure', title: 'Privacy and security', copy: 'The local read-only API is off by default and binds to 127.0.0.1 only.' },
      ],
    },
    handoff: {
      heading: 'Drag what you want to ask about to the AI',
      lead: 'Drag a metric and its neighbours get nudged aside. Drop it in the middle and it joins the bundle sent to the AI.',
      hint: 'Drag a node to the middle',
      center: 'Send to AI',
      nodes: ['Heart rate', 'Sleep', 'HRV', 'Steps', 'Training load', 'PAI', 'Weight', 'Stress'],
      picked: '{n} picked',
      reset: 'Reset',
    },
    privacy: {
      heading: 'Your data stays on your computer',
      lead: 'ZeppBridge runs no server that holds your health data.',
      points: [
        { icon: 'secure', title: 'Tokens in the system credential store', copy: 'Kept in Windows Credential Manager or the macOS Keychain by default, not in the data folder.' },
        { icon: 'private', title: 'No telemetry', copy: 'No usage reports. No health data collected.' },
        { icon: 'database', title: 'Clear provenance', copy: 'Every record knows whether it came from the official authorization or advanced data.' },
        { icon: 'ai-ready', title: 'You decide what the AI sees', copy: 'What to include, how much, and when. All up to you.' },
      ],
    },
    footer: {
      heading: 'Free, open source, ready to install',
      tagline: 'A local-first bridge for Amazfit and Zepp data.',
      disclaimer: 'ZeppBridge is an independent open-source project, not affiliated with Zepp Health or Amazfit.',
      download: 'Download',
    },
  },
};
