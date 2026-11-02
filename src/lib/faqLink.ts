/**
 * 常见问题和指南都只写了中英两份（docs/guides/faq*.md 3.0.6、ai*.md 3.1.1）：中文界面开中文，其余开英文。
 * 锚点是文档里手写的 `<a id>`，不随标题翻译变。
 */
import { backend } from './bridge';

const BASE = 'https://github.com/lingcang728/ZeppBridge/blob/main/docs/guides';

export type FaqAnchor = 'relay' | 'missing-data' | 'helio' | 'windows-warning';
export type Guide = 'ai';

export const faqUrl = (anchor: FaqAnchor, locale: string): string =>
  `${BASE}/${locale === 'zh' ? 'faq.zh-CN.md' : 'faq.md'}#${anchor}`;

export const guideUrl = (guide: Guide, locale: string): string =>
  `${BASE}/${guide}${locale === 'zh' ? '.zh-CN' : ''}.md`;

/** 打不开浏览器时什么也不做：这只是一条说明链接，失败不值得弹错。 */
const openQuietly = (url: string): void => {
  void backend.openExternalUrl(url).catch(() => undefined);
};

export const openFaq = (anchor: FaqAnchor, locale: string): void => openQuietly(faqUrl(anchor, locale));
export const openGuide = (guide: Guide, locale: string): void => openQuietly(guideUrl(guide, locale));
