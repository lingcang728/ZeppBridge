import { computed, ref, type ComputedRef } from 'vue';

/**
 * 应用界面的语言层。
 *
 * **为什么不是 vue-i18n**：量过了。在这个工程里接 vue-i18n（含运行时构建）
 * 首屏 gzip 从 73.0 kB 涨到 91.6 kB，**一句文案都还没翻**就已经超出
 * `bundle-budget.json` 的 84.0 kB 上限 7.6 kB。而这里真正需要的只有四件事：
 * 当前语言、切换、按语言取文案、日期数字跟着语言走——加起来一个屏幕的代码。
 * 用 18.6 kB 换这四件事不划算，尤其是它会拖慢每一个只打开落地页的访客。
 *
 * 代价是没有 vue-i18n 的复数规则和 ICU 消息格式。这个产品的文案里没有需要
 * 复数变格的句子（中文没有，英文那几处直接写成两个词），所以这笔代价是零。
 *
 * **文案放在哪**：跟着用它的模块走（`defineMessages` 就地定义），不建一个全局
 * 大字典。两个理由——一是键名不会在全局撞车，二是懒加载的页面 chunk 里本来
 * 就带着自己的中文，抽 key 之后仍然只带自己那份，首屏不会因为多一种语言
 * 就把整本词典拖下来。
 *
 * 落地页（`useLandingLocale.ts`）有自己的一套开关，刻意不合并：那是给全网
 * 访客看的静态页，判定默认语言的规则和应用不一样，而且它整块是懒加载的。
 */
export type Locale = 'zh' | 'en';

/** 语言选择器按这个顺序排。 */
export const LOCALES: readonly Locale[] = ['zh', 'en'];

/** 每种语言在界面上的自称——不翻译，「English」在中文界面里也写 English。 */
export const LOCALE_LABELS: Record<Locale, string> = { zh: '中文', en: 'English' };

const STORAGE_KEY = 'zeppbridge-locale';

/** `<html lang>` 用的标记。 */
const HTML_LANG: Record<Locale, string> = { zh: 'zh-CN', en: 'en' };

/**
 * `Intl` 用的标记。日期、星期、数字分组全跟着它走——只翻文字不换日期格式的话，
 * 英文界面上会出现「2026/8/30」这种一眼就是机翻的东西。
 */
const INTL_LOCALE: Record<Locale, string> = { zh: 'zh-CN', en: 'en-US' };

const isLocale = (value: unknown): value is Locale => value === 'zh' || value === 'en';

/**
 * 首次启动用什么语言：记住的选择优先，其次看系统语言。
 * 只有明确说中文的才给中文——桌面端 WebView 的 `navigator.language` 跟随系统，
 * 一台英文系统上的用户不该先看到满屏中文再自己去设置里找开关。
 */
const detectLocale = (): Locale => {
  if (typeof window === 'undefined') return 'zh';
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    // 隐私模式下 localStorage 可能直接抛异常，这不该拦住应用启动。
  }
  const preferred = window.navigator.languages?.[0] ?? window.navigator.language ?? '';
  return /^zh\b/i.test(preferred) ? 'zh' : 'en';
};

const current = ref<Locale>(detectLocale());

/** 当前语言。只读；要改走 `setLocale`。 */
export const locale = computed<Locale>(() => current.value);

const applyDocumentLanguage = (value: Locale) => {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = HTML_LANG[value];
};

export const setLocale = (value: Locale) => {
  if (!isLocale(value) || value === current.value) return;
  current.value = value;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // 存不下就只在本次会话里生效，比整个切换动作失败要好。
  }
  applyDocumentLanguage(value);
};

/**
 * 启动时把探测到的语言写进 `<html lang>`。
 * 探测结果**不写** localStorage：用户没选过就不该被记成「选过了」，
 * 否则以后换系统语言反而不生效。
 */
export const initializeLocale = () => {
  applyDocumentLanguage(current.value);
};

/** 传给 `Intl.*` 的语言标记。日期和数字格式化都必须用它，不要再写死 `'zh-CN'`。 */
export const intlLocale = (): string => INTL_LOCALE[current.value];

type MessageLeaf = string | ((...args: never[]) => string);

/** 一份文案。可以嵌套，可以带参数（写成函数）。 */
export type MessageTree = { readonly [key: string]: MessageLeaf | MessageTree };

export interface MessageBundle<T extends MessageTree> {
  readonly zh: T;
  readonly en: T;
}

/**
 * 定义一个模块的两份文案。
 *
 * 形状以中文那份为准（`NoInfer` 让 TypeScript 只从 `zh` 推类型），所以英文
 * **少一个键、多一个键、参数对不上都会编译不过**——这比运行时回退到中文
 * 有用得多：漏翻的字符串在 `npm run build` 就会被拦下，而不是等用户看到。
 */
export const defineMessages = <T extends MessageTree>(zh: T, en: NoInfer<T>): MessageBundle<T> =>
  ({ zh, en: en as T });

/** 在组件或 composable 里取当前语言的文案。切换语言时跟着变。 */
export const useMessages = <T extends MessageTree>(bundle: MessageBundle<T>): ComputedRef<T> =>
  computed(() => bundle[current.value]);

/**
 * 在普通函数里取当前语言的文案（`format.ts` 那种没有组件上下文的地方）。
 * 读的是同一个 ref，所以在 computed 里调用它依然会随语言切换重算。
 */
export const messagesOf = <T extends MessageTree>(bundle: MessageBundle<T>): T =>
  bundle[current.value];
