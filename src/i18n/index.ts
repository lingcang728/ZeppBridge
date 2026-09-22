import { computed, ref, type ComputedRef } from 'vue';

/**
 * 应用界面的语言层。
 *
 * **为什么不是 vue-i18n**：量过了。在这个工程里接 vue-i18n（含运行时构建）
 * 首屏 gzip 从 73.0 kB 涨到 91.6 kB，**一句文案都还没翻**就已经超出
 * `bundle-budget.json` 的 84.0 kB 上限。这里真正需要的只有：当前语言、切换、
 * 按语言取文案、日期数字复数跟着语言走——`Intl` 自带复数规则，连当年
 * 「没有复数变格」的代价也没有了。
 *
 * **文案放在哪**：就地定义的部分跟着用它的模块走（`defineMessages` 的
 * zh/en/es 三份），懒加载 chunk 自带本语言；新增的七种语言放进
 * `src/i18n/locales/<locale>.ts` 的**语言包**——每语言一个文件，切换语言时
 * 按需 `import()` 进来，不进首屏。就地定义与语言包之间靠 **moduleId** 挂钩：
 * bundle 上带着它属于哪个模块，语言包按模块给「部分文案」做覆盖。
 *
 * **moduleId 约定**：id 从 `defineMessages(` 调用点所在文件推出——
 * `src/` 相对路径、去掉扩展名、再去掉 `.i18n` 后缀。例如
 * `views/Settings.i18n.ts` → `views/Settings`，`components/HistoryArchivePanel.vue`
 * → `components/HistoryArchivePanel`，`src/i18n/errors.ts` → `i18n/errors`。
 * 模块作者在自己的 `defineMessages(zh, en, es, '<id>')` 第四参数写上这个 id，
 * `npm run i18n:check` 会校验 id 与路径一致、语言包键集与 zh 键集对齐。
 * 没写 id 的模块照常工作，只是永远只有内联三语。
 *
 * 落地页（`useLandingLocale.ts`）有自己的一套开关，刻意不合并：那是给全网
 * 访客看的静态页，判定默认语言的规则和应用不一样，而且它整块是懒加载的。
 */
export type Locale =
  | 'zh' | 'en' | 'es'
  | 'nl' | 'pt-BR' | 'pt-PT' | 'de' | 'ru' | 'hi-IN' | 'fr';

/** 语言选择器按这个顺序排：先内联三语，再七种语言包语言。 */
export const LOCALES: readonly Locale[] = [
  'zh', 'en', 'es', 'nl', 'pt-BR', 'pt-PT', 'de', 'ru', 'hi-IN', 'fr',
];

/** 每种语言在界面上的自称——不翻译，「English」在中文界面里也写 English。 */
export const LOCALE_LABELS: Record<Locale, string> = {
  zh: '中文',
  en: 'English',
  es: 'Español',
  nl: 'Nederlands',
  'pt-BR': 'Português (Brasil)',
  'pt-PT': 'Português (Portugal)',
  de: 'Deutsch',
  ru: 'Русский',
  'hi-IN': 'हिन्दी',
  fr: 'Français',
};

/** 靠语言包覆盖的七种语言；zh/en/es 的文案就地定义，没有语言包。 */
export const PACK_LOCALES: readonly Locale[] = [
  'nl', 'pt-BR', 'pt-PT', 'de', 'ru', 'hi-IN', 'fr',
];

const isPackLocale = (value: Locale): boolean =>
  (PACK_LOCALES as readonly string[]).includes(value);

const STORAGE_KEY = 'zeppbridge-locale';

/** `<html lang>` 用的标记。 */
export const HTML_LANG: Record<Locale, string> = {
  zh: 'zh-CN',
  en: 'en',
  es: 'es',
  nl: 'nl',
  'pt-BR': 'pt-BR',
  'pt-PT': 'pt-PT',
  de: 'de',
  ru: 'ru',
  'hi-IN': 'hi-IN',
  fr: 'fr',
};

/**
 * `Intl` 用的标记。日期、星期、数字分组全跟着它走——只翻文字不换日期格式的话，
 * 英文界面上会出现「2026/8/30」这种一眼就是机翻的东西。
 * 西语用拉美通用的 `es-419`：日/月/年，24 小时制。
 */
export const INTL_LOCALE: Record<Locale, string> = {
  zh: 'zh-CN',
  en: 'en-US',
  es: 'es-419',
  nl: 'nl-NL',
  'pt-BR': 'pt-BR',
  'pt-PT': 'pt-PT',
  de: 'de-DE',
  ru: 'ru-RU',
  'hi-IN': 'hi-IN',
  fr: 'fr-FR',
};

const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (LOCALES as readonly string[]).includes(value);

/**
 * 把一个语言标记匹配到注册表里的语言：先精确匹配（`pt-BR`→`pt-BR`、
 * `hi-IN`→`hi-IN`），再逐段砍地区子标签（`de-AT`→`de`、`zh-TW`→`zh`），
 * 最后裸语言查基础映射。**裸 `pt` 给欧洲葡萄牙语**（`pt-PT`）——两个葡语
 * 是独立条目，巴西葡语只认显式的 `pt-BR` 及其地区变体。
 */
const BASE_LANGUAGE: Record<string, Locale> = {
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

const EXACT_LOCALE = new Map<string, Locale>(
  LOCALES.map((l) => [l.toLowerCase(), l]),
);

const matchLanguageTag = (raw: string | undefined): Locale | null => {
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
 * 按一组偏好语言标记挑界面语言：`navigator.languages` 依序喂进来，
 * 第一条能匹配的算数；一条都配不上就英文。抽成纯函数是为了测试。
 */
export const pickLocale = (tags: readonly string[]): Locale => {
  for (const tag of tags) {
    const hit = matchLanguageTag(tag);
    if (hit) return hit;
  }
  return 'en';
};

/**
 * 首次启动用什么语言：记住的选择优先，其次看系统语言列表。
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
  const navigator_ = window.navigator;
  return pickLocale([...(navigator_?.languages ?? []), navigator_?.language ?? '']);
};

const current = ref<Locale>(detectLocale());

/** 当前语言。只读；要改走 `setLocale`。 */
export const locale = computed<Locale>(() => current.value);

const applyDocumentLanguage = (value: Locale) => {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = HTML_LANG[value];
};

// 一条文案：一句话、一组固定的短语（比如输入框下面的几个建议），
// 或者一个带参数的句子。
type MessageLeaf = string | readonly string[] | ((...args: never[]) => string);

/** 一份文案。可以嵌套，可以带参数（写成函数）。 */
export type MessageTree = { readonly [key: string]: MessageLeaf | MessageTree };

/** 西语那份的形状：键可以缺，缺的回落到英文；已写的键参数必须对得上。 */
export type PartialMessages<T> = {
  readonly [K in keyof T]?: T[K] extends MessageLeaf ? T[K] : PartialMessages<T[K]>;
};

/**
 * 语言包里一个模块的覆盖层。形状和 `PartialMessages` 一样，只是此时不知道
 * 具体模块的 T——键集与叶类型对不对由 `npm run i18n:check` 对着 zh 那份查。
 */
export type PackMessageTree = {
  readonly [key: string]: MessageLeaf | PackMessageTree;
};

/**
 * 一份语言包（`src/i18n/locales/<locale>.ts` 的默认导出）。
 *
 * - `modules`：按 moduleId 给内联文案做覆盖，缺的键回落 en（再回落 zh）。
 * - `errors`：`err.*` 码 → 译文的平铺表，等价于写进 `modules['i18n/errors']`，
 *   只是不用包一层模块名。
 * - `backendText`：`ui.*` 后端散文码 → 译文的平铺表，由 `uiTextFor` 查询。
 *   组件里的 `ui.*` 文案仍然走各自模块的 `modules` 覆盖。
 */
export interface LocalePack {
  readonly modules?: Readonly<Record<string, PackMessageTree>>;
  readonly errors?: Readonly<Record<string, string>>;
  readonly backendText?: Readonly<Record<string, string>>;
}

export interface MessageBundle<T extends MessageTree> {
  readonly zh: T;
  readonly en: T;
  readonly es: T;
  /** 语言包按它找到这个模块的覆盖层；不传则永远只有内联 zh/en/es。 */
  readonly moduleId?: string;
}

const isBranch = (value: unknown): value is MessageTree =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** 逐层合并：叶子（字符串、数组、函数）整条替换，分支递归。 */
const mergeOver = <T extends MessageTree>(
  base: T,
  over: PartialMessages<T> | PackMessageTree | undefined,
): T => {
  if (!over) return base;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(over)) {
    if (value === undefined) continue;
    const baseValue = (base as Record<string, unknown>)[key];
    out[key] = isBranch(value) && isBranch(baseValue)
      ? mergeOver(baseValue, value as PartialMessages<MessageTree>)
      : value;
  }
  return out as T;
};

/*
 * 语言包装载：每种语言至多下载一次（`import('./locales/<locale>.ts')`，
 * Vite 会按文件切成懒加载 chunk）。切语言不阻塞——包没到的时候所有键
 * 照常回落 en，到了之后 `packRevision` 递增让界面重算。
 */
const loadedPacks = new Map<Locale, LocalePack>();
const packInflight = new Map<Locale, Promise<void>>();
const packInjected = new Set<Locale>();
const packRevision = ref(0);

/** `errors:` 平铺表并入 `modules['i18n/errors']`（errors 节优先）。 */
const normalizePack = (pack: LocalePack): LocalePack => {
  const modules: Record<string, PackMessageTree> = { ...(pack.modules ?? {}) };
  if (pack.errors) {
    modules['i18n/errors'] = {
      ...(modules['i18n/errors'] ?? {}),
      ...pack.errors,
    } as PackMessageTree;
  }
  return { ...pack, modules };
};

/**
 * 确保某语言的语言包已加载。zh/en/es 没有语言包，直接返回。
 * 已注入过（测试或未来的远程包）就不再去读文件。
 */
export const ensureLocalePack = (value: Locale): Promise<void> => {
  if (!isPackLocale(value) || loadedPacks.has(value) || packInjected.has(value)) {
    return Promise.resolve();
  }
  const inflight = packInflight.get(value);
  if (inflight) return inflight;
  const task = import(`./locales/${value}.ts`)
    .then((module) => {
      if (!packInjected.has(value)) {
        loadedPacks.set(value, normalizePack(module.default as LocalePack));
      }
    })
    .catch(() => {
      // 语言包加载失败不该让切换语言失败：所有键回落 en。
    })
    .finally(() => {
      packInflight.delete(value);
      packRevision.value += 1;
    });
  packInflight.set(value, task);
  return task;
};

/** 该语言的语言包是否已就位（含注入的）。测试与诊断用。 */
export const localePackLoaded = (value: Locale): boolean => loadedPacks.has(value);

/**
 * 直接登记一份语言包，跳过文件加载。测试用它注入临时文案；
 * 注入优先于 `./locales/<locale>.ts` 文件（先到后到的文件都不会盖掉它）。
 */
export const registerLocalePack = (value: Locale, pack: LocalePack): void => {
  packInjected.add(value);
  loadedPacks.set(value, normalizePack(pack));
  packRevision.value += 1;
};

/** 当前语言已加载的语言包；`backendText.ts` 这类不挂模块的地方查 `ui.*` 用。 */
export const activeLocalePack = (): LocalePack | undefined => loadedPacks.get(current.value);

/** 托盘文案在原生菜单里，前端语言定了之后同步过去。失败不弹错。 */
const syncBackendLocale = (value: Locale) => {
  // 动态 import 而不是顶层依赖：`lib/bridge/errors.ts` 本身依赖本模块，
  // 顶层 import 会成环；而且浏览器运行时里 bridge 只有空壳，按需取即可。
  void import('../lib/bridge')
    .then(({ backend }) => backend.setTrayLocale(value))
    .catch(() => {});
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
  void ensureLocalePack(value);
  syncBackendLocale(value);
};

/**
 * 启动时把探测到的语言写进 `<html lang>`，并开始拉对应语言包。
 * 探测结果**不写** localStorage：用户没选过就不该被记成「选过了」，
 * 否则以后换系统语言反而不生效。
 */
export const initializeLocale = () => {
  applyDocumentLanguage(current.value);
  void ensureLocalePack(current.value);
};

/** 传给 `Intl.*` 的语言标记。日期和数字格式化都必须用它，不要再写死 `'zh-CN'`。 */
export const intlLocale = (): string => INTL_LOCALE[current.value];

const pluralRules = new Map<string, Intl.PluralRules>();

/** 各语言的复数桶。`other` 必填——它是所有桶的兜底。 */
export interface PluralForms {
  readonly zero?: string;
  readonly one?: string;
  readonly two?: string;
  readonly few?: string;
  readonly many?: string;
  readonly other: string;
}

/**
 * 带复数规则的文案助手，给函数叶用：
 * `failedAttempts: (n) => plural(n, { one: `${n} attempt`, other: `${n} attempts` })`。
 * 俄语包给 `one/few/many` 三个桶、印地语给 `one/other`，桶缺了回落 `other`。
 * 规则由 `Intl.PluralRules(intlLocale())` 给，不再手写 `n===1?'':'s'`。
 */
export const plural = (count: number, forms: PluralForms): string => {
  const tag = intlLocale();
  let rules = pluralRules.get(tag);
  if (!rules) {
    rules = new Intl.PluralRules(tag);
    pluralRules.set(tag, rules);
  }
  return forms[rules.select(count)] ?? forms.other;
};

const numberFormatters = new Map<string, Intl.NumberFormat>();
const dateFormatters = new Map<string, Intl.DateTimeFormat>();

/** 按当前界面语言格式化数字。需要本地化小数点的地方用它，别再用 `toFixed` 拼接。 */
export const formatNumber = (value: number, options?: Intl.NumberFormatOptions): string => {
  const key = `${intlLocale()}|${JSON.stringify(options ?? {})}`;
  let formatter = numberFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(intlLocale(), options);
    numberFormatters.set(key, formatter);
  }
  return formatter.format(value);
};

/** 按当前界面语言格式化日期/时间。12/24 小时制等用户偏好由 `lib/dateTime.ts` 组合。 */
export const formatDate = (value: number | Date, options?: Intl.DateTimeFormatOptions): string => {
  const key = `${intlLocale()}|${JSON.stringify(options ?? {})}`;
  let formatter = dateFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(intlLocale(), options);
    dateFormatters.set(key, formatter);
  }
  return formatter.format(value);
};

/*
 * 语言包合并缓存：同一个 bundle 在同一语言同一包版本下的合并结果只算一次。
 * `messagesOf` 会在格式化热路径里被反复调用，不能每次都重建一棵树。
 */
const resolvedCache = new WeakMap<
  MessageBundle<MessageTree>,
  { locale: Locale; rev: number; tree: MessageTree }
>();

const resolveBundle = <T extends MessageTree>(bundle: MessageBundle<T>): T => {
  const value = current.value;
  if (value === 'zh' || value === 'en' || value === 'es') return bundle[value];
  const rev = packRevision.value;
  const hit = resolvedCache.get(bundle);
  if (hit && hit.locale === value && hit.rev === rev) return hit.tree as T;
  const overlay = bundle.moduleId
    ? loadedPacks.get(value)?.modules?.[bundle.moduleId]
    : undefined;
  // 合并顺序：zh 兜底 → en 全量覆盖 → 语言包覆盖。语言包缺的键落 en，
  // en 因编译期约束必定全量，zh 这层只是双保险。
  const tree = overlay
    ? mergeOver(mergeOver(bundle.zh, bundle.en), overlay)
    : bundle.en;
  resolvedCache.set(bundle, { locale: value, rev, tree });
  if (!loadedPacks.has(value)) void ensureLocalePack(value);
  return tree;
};

/**
 * 定义一个模块的文案。
 *
 * 形状以中文那份为准（`NoInfer` 让 TypeScript 只从 `zh` 推类型），所以英文
 * **少一个键、多一个键、参数对不上都会编译不过**——这比运行时回退到中文
 * 有用得多：漏翻的字符串在 `npm run build` 就会被拦下，而不是等用户看到。
 *
 * 第三份是西语，可以只写一部分：没写的键在西语界面下显示英文。
 *
 * 第四参数是 moduleId（见文件头的约定）。写上它，这个模块的文案才会被
 * `src/i18n/locales/<locale>.ts` 语言包覆盖；不写就只有内联三语。
 */
export const defineMessages = <T extends MessageTree>(
  zh: T,
  en: NoInfer<T>,
  es?: PartialMessages<NoInfer<T>>,
  moduleId?: string,
): MessageBundle<T> =>
  ({ zh, en: en as T, es: mergeOver(en as T, es as PartialMessages<T> | undefined), moduleId });

/** 在组件或 composable 里取当前语言的文案。切换语言或语言包到达时跟着变。 */
export const useMessages = <T extends MessageTree>(bundle: MessageBundle<T>): ComputedRef<T> =>
  computed(() => resolveBundle(bundle));

/**
 * 在普通函数里取当前语言的文案（`format.ts` 那种没有组件上下文的地方）。
 * 读的是同一个 ref，所以在 computed 里调用它依然会随语言切换重算。
 */
export const messagesOf = <T extends MessageTree>(bundle: MessageBundle<T>): T =>
  resolveBundle(bundle);
