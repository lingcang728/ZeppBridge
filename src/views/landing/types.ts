/**
 * 落地页一种语言的全部文案（2026-10 重做版）。
 *
 * zh / en 内联在 `./copy.ts`（首屏不等网络）；其余八种是懒加载语言包
 * `./<locale>.ts`，按这份契约写。类型在编译期强制：少一个键 `npm run build` 就挂。
 *
 * 写文案的规矩：不用破折号（—、–），不编造关于产品的精确数字（「快 4 倍」这种不写）；
 * 演示里的读数一律是示例，页面上写明「示例」。
 *
 * 固定首屏价值主张，七组线性功能叙事和独立可操作示例。示例是开发中的 v3，
 * 下载是公开稳定版；文案须说明两者边界。
 */
export interface LandingCopy {
  rebuild: {
    nav: [string, string, string, string];
    learnFeatures: string; languageFallback: string;
    title: [string, string];
    featuresHeading: string; featuresLead: string;
    demoHeading: string; demoLead: string; mobileHint: string; fullscreen: string;
    retry: string; play: string; pause: string; mediaNote: string;
    moreConnections: string; partner: string; disclaimer: string;
    docsHeading: string; guide: string; versions: string; community: string; privacyDoc: string;
    star: string; dismiss: string;
    stories: Array<{ eyebrow: string; title: string; body: string; bullets: string[] }>;
  };
  nav: {
    home: string;
    site: string;
    demo: string;
    ai: string;
    privacy: string;
    connect: string;
    faq: string;
    download: string;
    github: string;
    /** 语言菜单的 aria-label。 */
    language: string;
    /** 主题切换按钮的 aria-label：切到深色 / 切到浅色。 */
    toDark: string;
    toLight: string;
  };
  downloads: {
    windows: { label: string; hint: string; msi: string };
    macos: { label: string; hint: string };
    linux: { label: string; previewBadge: string; note: string };
    status: { loading: string; ready: string; fallback: string };
  };
  /** 演示角标：「示例」。 */
  sample: string;
  hero: {
    eyebrow: string;
    /** 标题两段：第二段是被荧光笔划过的那一句。 */
    titleLead: string;
    titleAccent: string;
    lead: string;
    demo: string;
    edition: string;
    github: string;
    /** 按钮下一行小字：适用系统。 */
    meta: string;
    /** 设备滚动带上方的小标题。 */
    devices: string;
    /** 页面里那扇真应用的窗口：邀请点一下、说明、加载中、退出、打不开。 */
    stage: { hint: string; note: string; loading: string; exit: string; unavailable: string };
  };
  /** 明确标注合成内容的交接示例，不执行外部提交。 */
  handoff: {
    chat: string;
    you: string;
    file: string;
    prompt: string;
    answer: string;
    note: string;
    close: string;
  };
  privacy: {
    kicker: string;
    heading: string;
    lead: string;
    nodes: { watch: string; cloud: string; computer: string; export: string };
    flowNote: string;
    exportNote: string;
    services: { title: string; copy: string };
    docs: string;
    points: Array<{ title: string; copy: string }>;
  };
  connect: {
    kicker: string;
    heading: string;
    lead: string;
    recommended: string;
    advanced: string;
    edition: string;
    docs: string;
    /** 顺序固定：官方授权、高级数据、手动。第一条是推荐。 */
    paths: [ConnectPath, ConnectPath, ConnectPath];
    /** 能同步什么取决于账号云端数据、能看到什么指标取决于设备与连接方式。 */
    note: string;
  };
  final: {
    kicker: string;
    heading: string;
    lead: string;
    docs: string;
    facts: { channel: string; systems: string; ai: string; windows: string; macos: string };
  };
  footer: { tagline: string; disclaimer: string; source: string };
  faq: { heading: string; lead: string; docs: string; items: Array<{ question: string; answer: string }> };
}

export interface ConnectPath {
  title: string;
  copy: string;
  detail: string;
}
