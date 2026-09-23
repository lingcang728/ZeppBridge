import { readonly, ref } from 'vue';
import type { LandingCopy } from '../views/landing/types';

/**
 * 落地页（zeppbridge.pages.dev）专用的语言层。
 *
 * 只服务落地页这一个文件，**不是**应用的 i18n 方案：应用界面有自己的一套
 * （`src/i18n/`），这里的判定规则不一样——落地页面向全网访客，猜不准时给
 * 英文比给中文的读者面更宽。刻意不引框架，也不引应用那层：落地页 chunk
 * 不该背着整个 i18n 运行时。
 *
 * 十种语言里只有 zh/en 的文案内联在 `LandingPage.vue`（首屏即时、不出白屏）；
 * 其余八种各是一个懒加载语言包 `src/views/landing/<locale>.ts`，切换时才
 * `import()` 进来——访客不会为这页面下载十份文案。
 *
 * 落地页本身是懒加载的（App.vue），所以这个模块也只会跟着落地页 chunk 走，
 * 不进桌面应用的首屏。
 */
export type LandingLocale =
  | 'zh' | 'en' | 'es'
  | 'nl' | 'pt-BR' | 'pt-PT' | 'de' | 'ru' | 'hi-IN' | 'fr';

/** 语言下拉按这个顺序排，与应用内 LOCALES 一致：先内联的 zh/en，再懒加载语言包。 */
export const LANDING_LOCALES: readonly LandingLocale[] = [
  'zh', 'en', 'es', 'nl', 'pt-BR', 'pt-PT', 'de', 'ru', 'hi-IN', 'fr',
];

/** 每种语言在菜单里用自己的名字，不翻译。 */
export const LOCALE_LABELS: Record<LandingLocale, string> = {
  zh: '中文',
  en: 'English',
  es: 'Español',
  nl: 'Nederlands',
  'pt-BR': 'Português (Brasil)',
  'pt-PT': 'Português',
  de: 'Deutsch',
  ru: 'Русский',
  'hi-IN': 'हिन्दी',
  fr: 'Français',
};

/** `<html lang>` 用的标记，和 locale 一一对应。 */
const HTML_LANG: Record<LandingLocale, string> = {
  zh: 'zh-CN',
  en: 'en',
  es: 'es',
  nl: 'nl',
  'pt-BR': 'pt-BR',
  'pt-PT': 'pt-PT',
  de: 'de',
  ru: 'ru',
  'hi-IN': 'hi',
  fr: 'fr',
};

/** `og:locale` 要求 language_TERRITORY 形式，纯机械映射，不放语言包里。 */
const OG_LOCALE: Record<LandingLocale, string> = {
  zh: 'zh_CN',
  en: 'en_US',
  es: 'es_ES',
  nl: 'nl_NL',
  'pt-BR': 'pt_BR',
  'pt-PT': 'pt_PT',
  de: 'de_DE',
  ru: 'ru_RU',
  'hi-IN': 'hi_IN',
  fr: 'fr_FR',
};

/** 每种语言的页面级元信息。SEO 是多语言的重点之一，所以不只换正文。 */
export interface LandingMeta {
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
}

/** 一个懒加载语言包（`src/views/landing/<locale>.ts` 的默认导出）。 */
export interface LandingPack {
  copy: LandingCopy;
  meta: LandingMeta;
}

/** zh/en 的 meta 和文案一样内联——首屏就要写对 title，不能等网络。 */
const DOCUMENT_META: Record<'zh' | 'en', LandingMeta> = {
  zh: {
    title: 'ZeppBridge · 本地数据桥梁',
    description: 'ZeppBridge 是本地优先、开源的 Amazfit/Zepp 穿戴数据桥接与可视化工具。',
    ogTitle: 'ZeppBridge · 把 Zepp 数据完整交还给你',
    ogDescription: '在 Windows、macOS 与 Linux 本机连接、整理并可视化 Amazfit 穿戴数据，保留来源并按需交给 AI。',
  },
  en: {
    title: 'ZeppBridge · Local Data Bridge',
    description:
      'ZeppBridge is a local-first, open-source bridge and viewer for Amazfit / Zepp wearable data. Runs on your own Windows, Mac or Linux machine.',
    ogTitle: 'ZeppBridge · Your Zepp data, handed back in full',
    ogDescription:
      'Connect, organize and visualize Amazfit wearable data on your own machine. Sources stay intact, and nothing leaves until you send it.',
  },
};

const STORAGE_KEY = 'zeppbridge-landing-locale';

const isLandingLocale = (value: unknown): value is LandingLocale =>
  typeof value === 'string' && (LANDING_LOCALES as readonly string[]).includes(value);

/**
 * 把一个语言标记匹配到落地页语言：先精确匹配（`pt-BR`→`pt-BR`、
 * `hi-IN`→`hi-IN`），再逐段砍地区子标签（`de-AT`→`de`、`zh-TW`→`zh`），
 * 最后裸语言查基础映射。**裸 `pt` 给欧洲葡萄牙语**（`pt-PT`）——巴西葡语
 * 只认显式的 `pt-BR` 及其地区变体。
 */
const BASE_LANGUAGE: Record<string, LandingLocale> = {
  zh: 'zh',
  en: 'en',
  es: 'es',
  nl: 'nl',
  pt: 'pt-PT',
  de: 'de',
  ru: 'ru',
  hi: 'hi-IN',
  fr: 'fr',
};

const EXACT_LOCALE = new Map<string, LandingLocale>(
  LANDING_LOCALES.map((value) => [value.toLowerCase(), value]),
);

const matchLanguageTag = (raw: string | undefined): LandingLocale | null => {
  let tag = (raw ?? '').trim().toLowerCase().replace(/_/g, '-');
  while (tag) {
    const exact = EXACT_LOCALE.get(tag);
    if (exact) return exact;
    const base = BASE_LANGUAGE[tag];
    if (base) return base;
    const cut = tag.lastIndexOf('-');
    if (cut < 0) break;
    tag = tag.slice(0, cut);
  }
  return null;
};

/**
 * 按一组偏好语言标记挑落地页语言：`navigator.languages` 依序喂进来，
 * 第一条能匹配的算数；一条都配不上就英文。抽成纯函数是为了测试。
 */
export const pickLandingLocale = (tags: readonly string[]): LandingLocale => {
  for (const tag of tags) {
    const hit = matchLanguageTag(tag);
    if (hit) return hit;
  }
  return 'en';
};

/**
 * 首次进入用什么语言：记住的选择优先，其次按浏览器语言列表逐条匹配。
 */
const detectLocale = (): LandingLocale => {
  if (typeof window === 'undefined') return 'zh';
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isLandingLocale(saved)) return saved;
  } catch {
    // Storage may be unavailable; browser language still provides a default.
  }
  const navigator_ = window.navigator;
  return pickLandingLocale([...(navigator_?.languages ?? []), navigator_?.language ?? '']);
};

/**
 * 语言包装载：zh/en 没有语言包；其余八种每种至多下载一次
 * （`import('../views/landing/<locale>.ts')`，Vite 会按文件切成懒加载 chunk）。
 * 切换不阻塞——包没到的时候文案回落 en，到了之后 `loadedPacks` 换新对象让
 * 界面重算。加载失败静默回落 en：切语言这个动作本身不该失败。
 */
const loadedPacks = ref<Partial<Record<LandingLocale, LandingPack>>>({});
const packInflight = new Map<LandingLocale, Promise<void>>();

/** 确保某语言的落地页语言包已加载。zh/en 直接返回。 */
export const ensureLandingCopy = (value: LandingLocale): Promise<void> => {
  if (value === 'zh' || value === 'en' || loadedPacks.value[value]) {
    return Promise.resolve();
  }
  const inflight = packInflight.get(value);
  if (inflight) return inflight;
  const task = import(`../views/landing/${value}.ts`)
    .then((module) => {
      loadedPacks.value = { ...loadedPacks.value, [value]: module.default as LandingPack };
      // 包到了之后补写一次页面级 meta——加载期间 title 用的是英文兜底。
      if (locale.value === value) applyDocumentLanguage(value);
    })
    .catch(() => {
      // 语言包加载失败不该让切换语言失败：所有键回落 en。
    })
    .finally(() => {
      packInflight.delete(value);
    });
  packInflight.set(value, task);
  return task;
};

/** 该语言已加载的落地页文案；zh/en 和「包还没到」都返回 undefined，调用方回落。 */
export const landingCopyFor = (value: LandingLocale): LandingCopy | undefined =>
  loadedPacks.value[value]?.copy;

const metaFor = (value: LandingLocale): LandingMeta => {
  if (value === 'zh' || value === 'en') return DOCUMENT_META[value];
  return loadedPacks.value[value]?.meta ?? DOCUMENT_META.en;
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
  const meta = metaFor(value);
  document.documentElement.lang = HTML_LANG[value];
  document.title = meta.title;
  setMeta('name', 'description', meta.description);
  setMeta('property', 'og:title', meta.ogTitle);
  setMeta('property', 'og:description', meta.ogDescription);
  setMeta('property', 'og:locale', OG_LOCALE[value]);
};

const locale = ref<LandingLocale>('zh');
let initialized = false;

const setLocale = (value: LandingLocale) => {
  if (!isLandingLocale(value)) return;
  locale.value = value;
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Keep the chosen language for this page even when persistence is blocked.
  }
  applyDocumentLanguage(value);
  void ensureLandingCopy(value);
};

const initializeLocale = () => {
  if (initialized) return;
  initialized = true;
  // 探测结果先不写 localStorage：用户没选过就不该被记成「选过了」，
  // 否则以后换浏览器语言反而不生效。
  locale.value = detectLocale();
  applyDocumentLanguage(locale.value);
  void ensureLandingCopy(locale.value);
};

export const useLandingLocale = () => ({
  locale: readonly(locale),
  initializeLocale,
  setLocale,
  landingCopyFor,
  ensureLandingCopy,
});
