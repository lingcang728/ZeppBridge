/**
 * 来信提醒的结果（左上角的 Z 要不要变成信封、点进去落在哪个分栏）。
 * 这里只放一个响应式的格子，不带任何依赖，顶栏可以静态引用它而不把信匣服务拉进首屏；
 * 真正去查、去算的是按需加载的 `mailStatus.ts`。
 */
import { reactive } from 'vue';

/** 新信在哪个分栏：作者回信在「我的回信」，每周来信 / 到期胶囊在「你的信」。 */
export type MailTab = 'replies' | 'mine';

export const mailState = reactive<{ tab: MailTab | null }>({ tab: null });
