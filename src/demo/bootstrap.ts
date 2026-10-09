/**
 * 演示模式起来以后的收尾：按地址参数定主题和语言，并开始和外层落地页互相通消息。
 * 只在演示里被动态导入。
 */
import type { Router } from 'vue-router';
import { createApp } from 'vue';
import { setTheme } from '../composables/useTheme';
import { LOCALES, setLocale, type Locale } from '../i18n';
import { hostPost, listenToSite } from './host';

const asLocale = (value: string | null | undefined): Locale | null =>
  value && (LOCALES as readonly string[]).includes(value) ? (value as Locale) : null;

/** 首次渲染前：外层给了主题 / 语言就用它（落地页是深色，演示窗口也该是深色，反之亦然）。 */
export const prepareDemoAppearance = (): void => {
  const flags = window.__ZB_DEMO__;
  if (flags?.theme === 'light' || flags?.theme === 'dark') setTheme(flags.theme);
  const locale = asLocale(flags?.lang);
  if (locale) setLocale(locale);
};

/** 把应用的滚动区（`.main-content`）滚到某个元素；没给选择器就回到顶。平滑滚，到不了就算了。 */
const scrollMain = (selector: string | null): void => {
  const main = document.querySelector<HTMLElement>('.main-content');
  if (!main) return;
  const target = selector ? document.querySelector<HTMLElement>(selector) : null;
  const top = target ? main.scrollTop + target.getBoundingClientRect().top - main.getBoundingClientRect().top - 12 : 0;
  main.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
};

/** 挂载以后：听外层的指令，把自己当前在哪一页告诉外层。 */
export const startDemoHost = (router: Router): void => {
  listenToSite((message) => {
    if (message.type === 'go' && message.to && message.to.startsWith('/') && !message.to.startsWith('//')) {
      void router.push(message.to);
    } else if (message.type === 'scroll') {
      scrollMain(message.selector ?? null);
    } else if (message.type === 'theme' && (message.value === 'light' || message.value === 'dark')) {
      setTheme(message.value);
    } else if (message.type === 'locale' && asLocale(message.value)) {
      setLocale(asLocale(message.value) as Locale);
    } else if (message.type === 'visibility') {
      document.documentElement.classList.toggle('is-backgrounded', message.value === 'hidden');
    }
  });
  router.afterEach((to) => hostPost('route', { path: to.path }));
  hostPost('ready', { path: router.currentRoute.value.path });
  void import('./DemoConversation.vue').then(({ default: Conversation }) => {
    const root = document.createElement('div'); document.body.append(root);
    createApp(Conversation, { onReview: () => router.push('/ai/plan') }).mount(root);
  });
};
