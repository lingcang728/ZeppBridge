/**
 * 交给 AI 的文件要控制在对方「读得完」的量以内（批次 ⑦）。
 *
 * 免费版的对话往往只读得完约 3 万 token（Gemini 免费版 3.2 万）；订阅版多数在 12 万以上。
 * 默认按 3 万做；用户勾了「我已订阅 X」就对 X 放宽到约 12 万——按所选 AI 分别记住。
 * 后端按这个预算决定运动曲线取几秒的平均、要不要让最旧的运动只留概要。
 */
import { computed, ref } from 'vue';
import type { AiProviderId } from '../aiProviders';
import { intlLocale } from '../../i18n';

export const FREE_TOKEN_BUDGET = 30_000;
export const SUBSCRIBED_TOKEN_BUDGET = 120_000;

const STORAGE_KEY = 'zeppbridge.ai.subscribed';

const read = (): Partial<Record<AiProviderId, boolean>> => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as unknown;
    return parsed && typeof parsed === 'object' ? parsed as Partial<Record<AiProviderId, boolean>> : {};
  } catch {
    return {};
  }
};

const subscribed = ref(read());
/** 交付坞当前选的 AI；预览按它的预算估算。 */
export const currentProviderId = ref<AiProviderId | null>(null);

export const isSubscribed = (id: AiProviderId | null): boolean => Boolean(id && subscribed.value[id]);

export const setSubscribed = (id: AiProviderId, on: boolean) => {
  subscribed.value = { ...subscribed.value, [id]: on };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(subscribed.value));
  } catch {
    // 记不住就算了：本次会话里照样生效。
  }
};

export const tokenBudget = computed(() =>
  (isSubscribed(currentProviderId.value) ? SUBSCRIBED_TOKEN_BUDGET : FREE_TOKEN_BUDGET));

/** 「2.8 万」「28K」：按界面语言的紧凑写法。 */
export const formatTokens = (tokens: number): string =>
  new Intl.NumberFormat(intlLocale(), { notation: 'compact', maximumFractionDigits: 1 }).format(Math.max(0, tokens));
