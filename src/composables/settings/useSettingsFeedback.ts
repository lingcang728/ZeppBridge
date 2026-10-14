import { ref, type Ref } from 'vue';

/** 设置页顶部那两条全页提示（成功 / 失败）。多个区块都会写它，所以由页面统一持有。 */
export interface SettingsFeedback {
  dataMessage: Ref<string | null>;
  dataError: Ref<string | null>;
}

export const createSettingsFeedback = (): SettingsFeedback => ({
  dataMessage: ref<string | null>(null),
  dataError: ref<string | null>(null),
});
