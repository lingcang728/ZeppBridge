/**
 * 胶囊的短名（SegmentTrack 回退梯子的「短名」那一档）只用当前语言自己的那一份。
 *
 * 语言包缺的键会回落英文：短名刚加、翻译还没到的时候，葡语界面里退到短名就成了英文
 * 「Forever」。所以当前不是英文界面、而短名又和英文那份一字不差时，当它还没翻，返回
 * undefined——那一项没有短名，梯子照旧往下退到折行，界面上不会冒出别的语言。
 */
import { locale, messagesOf, type MessageBundle, type MessageTree } from '../i18n';

export const ownShort = <T extends MessageTree>(
  bundle: MessageBundle<T>,
  pick: (tree: T) => string | undefined,
): string | undefined => {
  const value = pick(messagesOf(bundle));
  if (!value || locale.value === 'en') return value;
  return value === pick(bundle.en) ? undefined : value;
};
