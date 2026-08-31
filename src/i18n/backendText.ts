/**
 * 后端原文的最后一道闸。
 *
 * 界面处处都是「按码取文案，取不到就回落到后端原文」。这个回落本身是对的——
 * 后端加了新说法而界面还不认识时，显示一句看不懂的也好过显示空白。问题在于
 * 后端原文**一律是中文**，于是每一个回落分支都是一个潜在的「英文界面冒中文」。
 *
 * 这已经翻车三次了，每次都是某个回落点被漏掉：漏了码、漏了渲染点、或者库里
 * 存着旧版本写进去的没有码的行。逐个堵不可靠——只要还有一个回落点，就还会有
 * 第四次。
 *
 * 所以在这里一刀切：**英文界面下，带中文的后端原文永远不输出**，改用调用方
 * 给的通用文案。中文界面下原样返回，它本来就是中文的。
 *
 * 代价是英文用户偶尔会看到一句笼统的「原因未记录」而不是具体原因。这个代价
 * 是值得的：看不懂的中文对他既没有信息量，也没法反馈给我们。
 */
import { locale } from './index';

/** 中日韩统一表意文字。够覆盖这个项目里会出现的中文。 */
const CJK = /[一-鿿]/;

/**
 * 决定要不要显示后端给的这句原文。
 *
 * @param text 后端返回的文案，可能是中文
 * @param fallback 界面自己的通用说法，当 `text` 不能显示时用它
 */
export const backendText = (
  text: string | null | undefined,
  fallback: string,
): string => {
  const value = (text ?? '').trim();
  if (!value) return fallback;
  if (locale.value === 'zh') return value;
  return CJK.test(value) ? fallback : value;
};

/** 只做判断，不做替换。给需要自己决定怎么处理的调用方用。 */
export const containsChinese = (text: string | null | undefined): boolean =>
  CJK.test(text ?? '');
