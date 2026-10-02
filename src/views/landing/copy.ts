import type { LandingCopy } from './types';

/*
 * 落地页的中英文案（首屏即时，不等网络）。其余八种语言是同目录的懒加载语言包。
 * 英文是重写不是翻译：两边各按自己的语言写，只保证说的是同一件事。
 * 不用破折号；演示读数一律是示例。
 */
export const COPY: Record<'zh' | 'en', LandingCopy> = {
  zh: {
    nav: { home: 'ZeppBridge 首页', site: '网站导航', demo: '演示', ai: '交给 AI', privacy: '隐私', download: '下载', github: 'GitHub', language: '界面语言', toDark: '切换到深色', toLight: '切换到浅色' },
    downloads: {
      windows: { label: '下载 Windows 版', hint: 'x64 安装包', msi: '批量部署用 MSI' },
      macos: { label: '下载 macOS 版', hint: 'Apple Silicon' },
      linux: {
        label: 'Linux',
        previewBadge: '实验性',
        note: 'deb / rpm / AppImage / Flatpak 由 CI 构建，还没人在真实 Linux 桌面上完整跑通登录和密钥环。遇到问题请开 issue。',
      },
      status: { loading: '正在读取最新安装包', ready: '点击直接下载', fallback: '会打开 GitHub Releases 页面，在那里挑安装包' },
    },
    sample: '示例',
    hero: {
      eyebrow: '免费 · 开源 · 数据只在你的电脑里',
      titleLead: '手表记下的，',
      titleAccent: '都在你电脑里。',
      lead: 'ZeppBridge 把 Amazfit 记下的心率、睡眠和运动，从 Zepp 云端同步到你自己的电脑，存成一份看得懂、带得走的本地档案。想问 AI 的时候，挑好范围，一个文件就交出去。',
      github: '在 GitHub 上看源码',
      meta: '免费 · Windows 10 / 11 · macOS（Apple Silicon） · Linux 实验性',
      devices: '这些 Amazfit 设备都认得',
      stage: { hint: '点一下，试试看', note: '右边是真的 ZeppBridge，用的是示例数据。', loading: '正在打开应用…', exit: '退出体验', unavailable: '这个浏览器打不开演示，下载装上就能看到它。' },
      starNudge: { title: '下载已经开始', copy: '觉得有用的话，去 GitHub 点个 Star，让更多 Amazfit 用户找到它。', action: '去点 Star', dismiss: '下次吧' },
    },
    beats: [
      {
        kicker: '01 · 同步',
        title: '把手腕记下的，拉到你自己的电脑里',
        body: '登录你自己的 Zepp 账号，心率、睡眠、运动按天存进本机的数据库。看得懂、带得走，断了网也照样能看。',
      },
      {
        kicker: '02 · 如实',
        title: '没测到，就是没测到',
        body: '看右边这张图：昨天下午有一段是空的，因为那会儿表没戴在手上。ZeppBridge 不补 0，也不画一条假的线；缺了的那几天，在每个数据块外面是灰格。',
      },
      {
        kicker: '03 · 交给 AI',
        title: '想问 AI？先挑要给它看什么',
        body: '圈里的会交出去，圈外的不会，每个节点外面的小格是哪几天有数据。点「交给 ChatGPT」，打包好的 .md 就备好了，拖进对话框就行。',
      },
      {
        kicker: '04 · 排计划',
        title: 'AI 排的训练，你看过了才发到手表',
        body: '把 AI 的回复整段贴回来：逐天看改了什么，每一步要的心率范围画成图；还没在你的手表上核实过的写法会标出来。确认了才发到 Zepp，随时能撤销。',
      },
      {
        kicker: '05 · 你说了算',
        title: '该有的开关都在，没用的一样没加',
        body: '设置是一叠卡片：点开一张，按住卡头左右拖就翻到下一张。数据留多久、同步多勤、要不要开本机接口，都由你定。',
      },
    ],
    flap: {
      tiles: [
        { value: '1,096', label: '个夜晚的睡眠' },
        { value: '742', label: '次运动，带轨迹' },
        { value: '1.5M', label: '个逐分钟心率' },
        { value: '9.8M', label: '步' },
      ],
    },
    handoff: {
      chat: 'AI 对话',
      you: '你',
      file: 'ZeppBridge 最近14天.md',
      prompt: '我这周是不是睡得比上周差？可能是什么原因？',
      answer: '是差一些：平均少了 38 分钟，主要少在深睡。周二、周四都有晚间训练，那两晚入睡后心率降得更慢。可以先把训练挪到下午试一周。',
      note: '不内置 AI，也不用另外注册账号。交什么、交多少、什么时候交，都是你点了才算。',
      close: '关闭',
    },
    privacy: {
      heading: '你的健康数据，只在两个地方',
      lead: 'Zepp 的云端，和你自己的电脑。中间没有第三个。',
      nodes: { watch: '手表', cloud: 'Zepp 云端', computer: '你的电脑', server: 'ZeppBridge 服务器', none: '不存在' },
      points: [
        { title: '令牌进系统凭据库', copy: '放在 Windows 凭据管理器或 macOS 钥匙串，不写进数据文件夹。' },
        { title: '没有遥测', copy: '不统计你怎么用，不收集任何健康数据。' },
        { title: '来源分得清', copy: '每条记录都知道自己来自官方授权还是高级数据。' },
      ],
    },
    connect: {
      heading: '三种连接方式，挑顺手的那条',
      lead: '先用官方授权；想要更多指标，再加上高级数据。',
      recommended: '推荐',
      paths: [
        {
          title: 'Zepp 官方授权',
          copy: '在常用浏览器里登录 Zepp，点同意就连上。',
          detail: 'Google、小米、Apple 账号都能用。睡眠、心率、步数、运动、PAI、体重会同步。',
        },
        { title: '高级数据', copy: '补上官方没开放的 HRV、血氧、压力、准备度。', detail: '用邮箱或手机号登录，令牌只存在系统凭据库里。' },
        { title: '手动填写', copy: '前两条都用不了时的后备。', detail: '自己粘贴令牌，适合熟悉接口的人。' },
      ],
      note: '能同步到什么，取决于你的账号在 Zepp 云端存了什么；具体能看到哪些指标，取决于你的设备和用的连接方式。',
    },
    final: {
      heading: '装上，看看它这些年记了些什么',
      lead: '免费，开源，不用注册。',
      facts: {
        channel: '稳定版，安装包来自 GitHub Releases',
        systems: 'Windows 10 / 11（x64）和 macOS（Apple Silicon）；Linux 为实验性',
        ai: '不需要另外的账号，交给 AI 时用你自己平时用的那个',
        windows: 'Windows：安装包还没有代码签名，可能提示「未知发布者」，点「更多信息」再点「仍要运行」',
        macos: 'macOS：未签名版本，第一次打开会被拦下，放行步骤写在 GitHub 的说明里',
      },
    },
    footer: {
      tagline: '本地优先的 Amazfit / Zepp 数据桥梁。',
      disclaimer: 'ZeppBridge 是独立的开源项目，与 Zepp Health、Amazfit 没有隶属关系。',
      source: '源码',
    },
  },
  en: {
    nav: {
      home: 'ZeppBridge home',
      site: 'Site navigation',
      demo: 'Demo',
      ai: 'AI handoff',
      privacy: 'Privacy',
      download: 'Download',
      github: 'GitHub',
      language: 'Language',
      toDark: 'Switch to dark',
      toLight: 'Switch to light',
    },
    downloads: {
      windows: { label: 'Download for Windows', hint: 'x64 installer', msi: 'MSI for managed installs' },
      macos: { label: 'Download for macOS', hint: 'Apple Silicon' },
      linux: {
        label: 'Linux',
        previewBadge: 'Experimental',
        note: 'deb, rpm, AppImage and Flatpak are built by CI, but nobody has run sign-in and the keyring end to end on a real Linux desktop yet. Hit a problem? Open an issue.',
      },
      status: {
        loading: 'Looking up the latest installer',
        ready: 'Click to download directly',
        fallback: 'Opens GitHub Releases, where you pick the installer',
      },
    },
    sample: 'Sample',
    hero: {
      eyebrow: 'Free · Open source · Your data stays on your computer',
      titleLead: 'What your watch records,',
      titleAccent: 'on your own computer.',
      lead: 'ZeppBridge pulls the heart rate, sleep and workouts your Amazfit records from the Zepp cloud onto your own computer and keeps them as a local archive you can read and take with you. When you want to ask an AI, you pick the range and hand over one file.',
      github: 'Read the source on GitHub',
      meta: 'Free · Windows 10 / 11 · macOS (Apple Silicon) · Linux experimental',
      devices: 'Amazfit devices it already knows',
      stage: {
        hint: 'Click to try it',
        note: 'This is the real ZeppBridge on the right, running on sample data.',
        loading: 'Opening the app…',
        exit: 'Leave the demo',
        unavailable: 'This browser cannot open the demo. Download the app to see it.',
      },
      starNudge: {
        title: 'Your download has started',
        copy: 'If ZeppBridge helps, a star on GitHub helps other Amazfit owners find it.',
        action: 'Star on GitHub',
        dismiss: 'Maybe later',
      },
    },
    beats: [
      {
        kicker: '01 · Sync',
        title: 'Pull what your wrist recorded onto your own computer',
        body: 'Sign in with your own Zepp account and your heart rate, sleep and workouts are stored day by day in a database on this machine. Readable, portable, and still there with the network off.',
      },
      {
        kicker: '02 · Honest',
        title: 'Not measured means not measured',
        body: 'Look at the chart on the right: yesterday afternoon is blank because the watch was off your wrist. ZeppBridge never fills in a 0 and never draws a made-up line; missing days show as grey ticks around each data block.',
      },
      {
        kicker: '03 · Hand off to AI',
        title: 'Want to ask an AI? Choose what it sees first',
        body: 'What is inside the circle is handed over, what is outside is not, and the small ticks around each node show which days have data. Press the send button and the packed .md is ready to drag into the chat.',
      },
      {
        kicker: '04 · Plan',
        title: 'Training an AI plans, sent to your watch only after you have checked it',
        body: 'Paste the AI’s reply back whole: see day by day what changes, with each step’s heart-rate range drawn as a chart. Wording that has not been verified on your watch is flagged. Only after you confirm does it go to Zepp, and you can undo it any time.',
      },
      {
        kicker: '05 · Your call',
        title: 'The switches you need are there, and nothing you do not',
        body: 'Settings are a stack of cards: open one, then drag its header sideways to flip to the next. How long data is kept, how often it syncs and whether the local API is on are all yours to set.',
      },
    ],
    flap: {
      tiles: [
        { value: '1,096', label: 'nights of sleep' },
        { value: '742', label: 'workouts with routes' },
        { value: '1.5M', label: 'minutes of heart rate' },
        { value: '9.8M', label: 'steps' },
      ],
    },
    handoff: {
      chat: 'AI chat',
      you: 'You',
      file: 'ZeppBridge last 14 days.md',
      prompt: 'Did I sleep worse this week than last? What might be behind it?',
      answer: 'A little worse: 38 minutes less on average, mostly deep sleep. Tuesday and Thursday had evening training, and on those nights your heart rate took longer to settle. Try moving training to the afternoon for a week.',
      note: 'No built-in AI and no extra account. What goes out, how much and when only happens when you click.',
      close: 'Close',
    },
    privacy: {
      heading: 'Your health data lives in two places',
      lead: 'The Zepp cloud and your own computer. There is no third.',
      nodes: { watch: 'Watch', cloud: 'Zepp cloud', computer: 'Your computer', server: 'ZeppBridge server', none: 'does not exist' },
      points: [
        {
          title: 'Tokens in the system vault',
          copy: 'Kept in Windows Credential Manager or the macOS Keychain, never in the data folder.',
        },
        { title: 'No telemetry', copy: 'No usage tracking and no health data collected.' },
        {
          title: 'Clear provenance',
          copy: 'Every record knows whether it came from the official authorization or advanced data.',
        },
      ],
    },
    connect: {
      heading: 'Three ways to connect. Pick the easy one.',
      lead: 'Start with the official authorization. Add advanced data when you want more metrics.',
      recommended: 'Recommended',
      paths: [
        {
          title: 'Zepp official authorization',
          copy: 'Sign in to Zepp in your usual browser and approve.',
          detail: 'Google, Xiaomi and Apple accounts work. Sleep, heart rate, steps, workouts, PAI and weight sync.',
        },
        {
          title: 'Advanced data',
          copy: 'Adds HRV, blood oxygen, stress and readiness, which the official API does not offer.',
          detail: 'Sign in with email or phone. The token lives only in your system vault.',
        },
        {
          title: 'Manual entry',
          copy: 'The fallback when neither of the others works.',
          detail: 'Paste a token yourself. Meant for people who know the API.',
        },
      ],
      note: 'What syncs depends on what your account holds in the Zepp cloud. Which metrics you see depends on your device and the way you connect.',
    },
    final: {
      heading: 'Install it and see what your watch remembers',
      lead: 'Free, open source, no sign-up.',
      facts: {
        channel: 'Stable channel, installers from GitHub Releases',
        systems: 'Windows 10 / 11 (x64) and macOS (Apple Silicon). Linux is experimental.',
        ai: 'No extra account needed. For AI questions you use the one you already have.',
        windows: 'Windows: the installer is not code signed yet. If you see "Unknown publisher", choose "More info", then "Run anyway".',
        macos: 'macOS: an unsigned build, so the first launch is blocked. The steps to allow it are in the GitHub readme.',
      },
    },
    footer: {
      tagline: 'A local-first bridge for Amazfit and Zepp data.',
      disclaimer: 'ZeppBridge is an independent open-source project, not affiliated with Zepp Health or Amazfit.',
      source: 'Source',
    },
  },
};
