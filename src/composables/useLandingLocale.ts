import { readonly, ref } from 'vue';

/**
 * 落地页（zeppbridge.pages.dev）专用的语言开关。
 *
 * 只服务落地页这一个文件，**不是**应用的 i18n 方案：应用界面另有计划，
 * 到时候会引 vue-i18n。这里只有两份文案对象加一个开关，刻意不引框架——
 * 为 205 行的静态页装一套 i18n 运行时，只会把首屏体积赔进去。
 *
 * 落地页本身是懒加载的（App.vue），所以这个模块也只会跟着落地页 chunk 走，
 * 不进桌面应用的首屏。
 */
export type LandingLocale = 'zh' | 'en';

const STORAGE_KEY = 'zeppbridge-landing-locale';

/** `<html lang>` 用的完整标记，和 locale 一一对应。 */
const HTML_LANG: Record<LandingLocale, string> = { zh: 'zh-CN', en: 'en' };

/** 每种语言的页面级元信息。SEO 是这次双语的重点之一，所以不只换正文。 */
const DOCUMENT_META: Record<LandingLocale, {
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
}> = {
  zh: {
    title: 'ZeppBridge · 本地数据桥梁',
    description: 'ZeppBridge 是本地优先、开源的 Amazfit/Zepp 穿戴数据桥接与可视化工具。',
    ogTitle: 'ZeppBridge · 把 Zepp 数据完整交还给你',
    ogDescription: '在 Windows 与 macOS 本机连接、整理并可视化 Amazfit 穿戴数据，保留来源并按需交给 AI。',
  },
  en: {
    title: 'ZeppBridge · Local Data Bridge',
    description:
      'ZeppBridge is a local-first, open-source bridge and viewer for Amazfit / Zepp wearable data. Runs on your own Windows or Mac.',
    ogTitle: 'ZeppBridge · Your Zepp data, handed back in full',
    ogDescription:
      'Connect, organize and visualize Amazfit wearable data on your own machine. Sources stay intact, and nothing leaves until you send it.',
  },
};

const isLandingLocale = (value: string | null): value is LandingLocale =>
  value === 'zh' || value === 'en';

/**
 * 首次进入用什么语言：记住的选择优先，其次看浏览器语言。
 * 只有明确说中文的才给中文，其余一律英文——落地页面向的是全网访客，
 * 猜不准时给英文比给中文的读者面更宽。
 */
const detectLocale = (): LandingLocale => {
  if (typeof window === 'undefined') return 'zh';
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (isLandingLocale(saved)) return saved;
  const preferred = window.navigator.languages?.[0] ?? window.navigator.language ?? '';
  return /^zh\b/i.test(preferred) ? 'zh' : 'en';
};

/** 按 name 或 property 找一个 meta 标签并改掉它；找不到就补一个。 */
const setMeta = (attribute: 'name' | 'property', key: string, content: string) => {
  const selector = `meta[${attribute}="${key}"]`;
  let tag = document.head.querySelector<HTMLMetaElement>(selector);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attribute, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
};

const applyDocumentLanguage = (value: LandingLocale) => {
  if (typeof document === 'undefined') return;
  const meta = DOCUMENT_META[value];
  document.documentElement.lang = HTML_LANG[value];
  document.title = meta.title;
  setMeta('name', 'description', meta.description);
  setMeta('property', 'og:title', meta.ogTitle);
  setMeta('property', 'og:description', meta.ogDescription);
  setMeta('property', 'og:locale', value === 'zh' ? 'zh_CN' : 'en_US');
};

const locale = ref<LandingLocale>('zh');
let initialized = false;

const setLocale = (value: LandingLocale) => {
  locale.value = value;
  if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, value);
  applyDocumentLanguage(value);
};

const initializeLocale = () => {
  if (initialized) return;
  initialized = true;
  // 探测结果先不写 localStorage：用户没选过就不该被记成「选过了」，
  // 否则以后换浏览器语言反而不生效。
  locale.value = detectLocale();
  applyDocumentLanguage(locale.value);
};

const toggleLocale = () => setLocale(locale.value === 'zh' ? 'en' : 'zh');

export const useLandingLocale = () => ({
  locale: readonly(locale),
  initializeLocale,
  setLocale,
  toggleLocale,
});
