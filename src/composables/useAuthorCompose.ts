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

/** 从 origin 那里飞出信封、抽出信纸；关掉时飞回 origin。已经开着就不再开第二张。 */
export function openAuthorCompose(origin: HTMLElement | null, preset?: AuthorComposePreset): void {
  if (writing.value) return;
  if (preset) {
    attach.value = true;
    category.value = preset === 'device' ? 'device' : 'other';
  }
  writing.value = { origin };
}

export function closeAuthorCompose(): void {
  writing.value = null;
}

export const useAuthorCompose = () => ({ writing, attach, category, sent });
