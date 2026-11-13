/**
 * 写给作者（「写信 = 反馈」）的入口状态（2026-11-11：入口藏得太深，提到顶栏和设置卡叠）。
 * 顶栏的笔、设置里的「写给作者」卡、信匣里那只空信封，三处抽出来的是同一张信纸、同一份草稿。
 * 这里只放「开没开、从哪飞出来、附不附报告」——信封和信纸在 components/letters/AuthorComposeLayer.vue，
 * 第一次打开才加载（顶栏在首屏，不能把信封那一整块带进来）。
 */
import { ref, shallowRef } from 'vue';
import type { ReportCategory } from '../components/letters/AuthorCompose.vue';

/** 带着来意打开：device = 设备没认出（设备卡的入口），report = 旧的「反馈问题」链接；都会先盖上「附上诊断报告」的章。 */
export type AuthorComposePreset = 'device' | 'report';

const writing = shallowRef<{ origin: HTMLElement | null } | null>(null);
const attach = ref(false);
const category = ref<ReportCategory>('other');
/** 每寄出一封加一：信匣据此切到「我的回信」。 */
const sent = ref(0);

/** 从 origin 那里一镜到底展开成写信信纸；关掉时原路缩回 origin。已经开着就不再开第二张。 */
export function openAuthorCompose(origin: HTMLElement | null, preset?: AuthorComposePreset): void {
  if (writing.value) return;
  if (preset) {
    attach.value = true;
    category.value = preset === 'device' ? 'device' : 'other';
  }
  writing.value = { origin };
}

/** 指针移到笔上 / 聚焦时先把信封那一块取回来：点下去信封第一帧就能从笔里飞出来，不等这块代码（2026-11-12 修复计划 A2）。 */
let prefetched = false;
export function prefetchAuthorCompose(): void {
  if (prefetched) return;
  prefetched = true;
  void import('../components/letters/AuthorComposeLayer.vue').catch(() => { prefetched = false; });
  // 信纸上那几句先在屏幕外排一次版（components/letters/paperWarm.ts），空闲时做，不挤占这一帧。
  void import('../components/letters/paperWarm').then(({ warmPaperText }) => {
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(warmPaperText, { timeout: 1500 });
    else window.setTimeout(warmPaperText, 200);
  }).catch(() => undefined);
}

export function closeAuthorCompose(): void {
  writing.value = null;
}

export const useAuthorCompose = () => ({ writing, attach, category, sent });
