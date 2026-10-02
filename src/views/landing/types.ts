/**
 * 落地页一种语言的全部文案（2026-10 重做版）。
 *
 * zh / en 内联在 `./copy.ts`（首屏不等网络）；其余八种是懒加载语言包
 * `./<locale>.ts`，按这份契约写。类型在编译期强制：少一个键 `npm run build` 就挂。
 *
 * 写文案的规矩：不用破折号（—、–），不编造关于产品的精确数字（「快 4 倍」这种不写）；
 * 演示里的读数一律是示例，页面上写明「示例」。
 *
 * 这一版的页面是「真应用嵌在页面里，随滚动换一页」：文案分成首屏 + 五个片段（beats）。
 * 片段不写功能清单，只讲一件事、配着右边那一页真应用。
 */
export interface LandingCopy {
  nav: {
    home: string;
    site: string;
    demo: string;
    ai: string;
    privacy: string;
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
    github: string;
    /** 按钮下一行小字：适用系统。 */
    meta: string;
    /** 设备滚动带上方的小标题。 */
    devices: string;
    /** 页面里那扇真应用的窗口：邀请点一下、说明、加载中、退出、打不开。 */
    stage: { hint: string; note: string; loading: string; exit: string; unavailable: string };
    starNudge: { title: string; copy: string; action: string; dismiss: string };
  };
  /** 五个片段，顺序固定：同步、如实、交给 AI、排计划、设置。每个对应右边应用换到的一页。 */
  beats: [Beat, Beat, Beat, Beat, Beat];
  flap: {
    /** 翻牌上的数字（示例）和下面的说明。数字按原样显示，各语言自己写千分位。 */
    tiles: Array<{ value: string; label: string }>;
  };
  /** 点「交给 ChatGPT」之后页面上演的那一小段：文件落进对话框，示例回答逐字打出来。 */
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
    heading: string;
    lead: string;
    nodes: { watch: string; cloud: string; computer: string; server: string; none: string };
    points: Array<{ title: string; copy: string }>;
  };
  connect: {
    heading: string;
    lead: string;
    recommended: string;
    /** 顺序固定：官方授权、高级数据、手动。第一条是推荐。 */
    paths: [ConnectPath, ConnectPath, ConnectPath];
    /** 能同步什么取决于账号云端数据、能看到什么指标取决于设备与连接方式。 */
    note: string;
  };
  final: {
    heading: string;
    lead: string;
    facts: { channel: string; systems: string; ai: string; windows: string; macos: string };
  };
  footer: { tagline: string; disclaimer: string; source: string };
}

export interface Beat {
  /** 「01 · 同步」这种栏目小标。 */
  kicker: string;
  title: string;
  body: string;
}

export interface ConnectPath {
  title: string;
  copy: string;
  detail: string;
}
