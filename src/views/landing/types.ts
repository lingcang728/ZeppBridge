/**
 * 落地页一种语言的全部文案（2026-10 重写版）。
 *
 * zh / en 内联在 `./copy.ts`（首屏不等网络）；其余八种是懒加载语言包
 * `./<locale>.ts`，按这份契约写。类型在编译期强制：少一个键 `npm run build` 就挂。
 *
 * 写文案的规矩：不用破折号（—、–），不编造关于产品的精确数字（「快 4 倍」这种不写）；
 * 演示里的读数一律是示例，页面上写明「示例」。
 */
export interface LandingCopy {
  nav: {
    home: string;
    site: string;
    demo: string;
    features: string;
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
    /** 标题两段：第一段正文字体，第二段强调（拉丁语系用衬线斜体）。 */
    titleLead: string;
    titleAccent: string;
    lead: string;
    github: string;
    /** 标题下并列的两个亮点（同步到电脑 / 交给 AI），分量一样。 */
    pillars: [string, string];
    /** 按钮下一行小字：适用系统。 */
    meta: string;
    /** 设备滚动带上方的小标题。 */
    devices: string;
    /** 右侧轮播的示例通知（应用里真的会出现的那类提示）。 */
    toasts: Array<{ title: string; body: string }>;
    /** 左侧的示例：一个带着 .md 附件、正要发给 AI 的问题（第二个亮点的缩影）。 */
    ask: { question: string; file: string };
    starNudge: { title: string; copy: string; action: string; dismiss: string };
  };
  /** 两章的章节标：「01 同步到电脑」「02 交给 AI」。 */
  chapters: { sync: string; ai: string };
  flap: {
    heading: string;
    lead: string;
    /** 翻牌上的数字（示例）和下面的说明。数字按原样显示，各语言自己写千分位。 */
    tiles: Array<{ value: string; label: string }>;
  };
  demo: {
    heading: string;
    lead: string;
    window: string;
    tabs: { heart: string; sleep: string; steps: string };
    /** 侧栏的四个入口（只是装饰）。 */
    nav: [string, string, string, string];
    heart: { value: string; unit: string; caption: string };
    sleep: { value: string; caption: string; stages: [string, string, string, string] };
    steps: { value: string; unit: string; caption: string };
    /** 「没戴表的那段」开关：诚实地留空 vs 别的工具补 0。 */
    gap: { label: string; honest: string; zero: string; honestNote: string; zeroNote: string };
  };
  bento: {
    heading: string;
    lead: string;
    connect: { title: string; copy: string; rows: [string, string, string]; states: [string, string, string] };
    local: { title: string; copy: string };
    export: { title: string; copy: string };
    api: { title: string; copy: string; output: [string, string, string] };
    languages: { title: string; copy: string };
    theme: { title: string; copy: string; dark: string; light: string };
  };
  ai: {
    heading: string;
    lead: string;
    pick: string;
    chips: string[];
    /** `{n}` 换成已选类别数。 */
    picked: string;
    file: string;
    prompt: string;
    answer: string;
    note: string;
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

export interface ConnectPath {
  title: string;
  copy: string;
  detail: string;
}
