/**
 * 顶栏长按信件打开的信匣浮层（2026-11-13 用户录屏）：以前长按是跳到 /letters 这一页，
 * 心率这类带图表的来处页不在 KeepAlive 缓存里，返回时整页重挂、所有图表重画，原来的信件按钮也一直露在那里。
 * 现在和单击写信一样，从信件圆钮长出一块浮层（ModalDialog → lib/motion/dialogFlight.ts），背后的页面原样不动。
 * 这里只放「开没开、从哪长出来、落在哪一栏」；浮层本身在 components/letters/LetterBoxLayer.vue，第一次打开才加载。
 */
import { shallowRef } from 'vue';

const box = shallowRef<{ origin: HTMLElement | null; tab: string | null } | null>(null);

export function openLetterBoxSheet(origin: HTMLElement | null, tab: string | null = null): void {
  if (box.value) return;
  box.value = { origin, tab };
}

export function closeLetterBoxSheet(): void {
  box.value = null;
}

export const useLetterBoxSheet = () => ({ box });
