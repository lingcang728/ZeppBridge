import type { DesignIconName } from '../../components/DesignIcon.vue';

/**
 * 落地页一种语言的全部文案。
 *
 * zh / en 内联在 `./copy.ts`（首屏不等网络）；其余八种是懒加载语言包
 * `./<locale>.ts`，按这份契约写。类型在编译期强制：少一个键 `npm run build` 就挂。
 *
 * 写文案的规矩：不用破折号（—、–），不编造精确数字；演示里的数字一律是示例，
 * 页面上写明「示例数据」。
 */
export interface LandingCopy {
  nav: {
    home: string;
    site: string;
    connect: string;
    motion: string;
    handoff: string;
    privacy: string;
    star: string;
    /** 语言下拉的 aria-label。 */
    language: string;
  };
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
    github: string;
    starNudge: { title: string; copy: string; action: string; dismiss: string };
  };
  /** 首屏右侧的迷你应用：点一张卡长成详情，返回缩回原处。 */
  demo: {
    label: string;
    sample: string;
    hint: string;
    back: string;
    greeting: string;
    heart: { title: string; unit: string; detail: string };
    steps: { title: string; unit: string; detail: string };
    sleep: { title: string; hours: string; minutes: string; detail: string };
  };
  devicesLabel: string;
  connect: {
    heading: string;
    lead: string;
    /** 顺序固定：官方授权、高级数据、手动。第一条是推荐。 */
    paths: [ConnectPath, ConnectPath, ConnectPath];
    recommended: string;
  };
  deck: {
    heading: string;
    lead: string;
    hint: string;
    close: string;
    cards: Array<{ icon: DesignIconName; title: string; copy: string }>;
  };
  handoff: {
    heading: string;
    lead: string;
    hint: string;
    center: string;
    /** 图上的指标节点，拖进中间的「交给 AI」就算选上。 */
    nodes: string[];
    /** `{n}` 换成已选数量。 */
    picked: string;
    reset: string;
  };
  privacy: {
    heading: string;
    lead: string;
    points: Array<{ icon: DesignIconName; title: string; copy: string }>;
  };
  footer: { heading: string; tagline: string; disclaimer: string; download: string };
}

export interface ConnectPath {
  icon: DesignIconName;
  title: string;
  copy: string;
  detail: string;
}
