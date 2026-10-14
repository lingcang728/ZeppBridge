/**
 * 计划里 AI 写的那几段字（summary、休息建议的 note……）不是界面文案：AI 用对话时的语言写，ZeppBridge 不翻译。
 * 中文对话里排的计划，换成别的界面语言后这些字还是中文（10-13 葡语界面录屏）。界面不假装它是自己的文案：
 * 和界面语言不是一种文字时，旁边标一枚「AI 原话」，`lang` 也写成它真正的语言，读屏、断行都对。
 * 以后要的计划在 planGuide 里明确要求按界面语言写。
 */
import { locale } from '../../i18n';

const CJK = /\p{Script=Han}/u;

/** 这段 AI 写的字和界面语言不是一种文字（目前只认「非中文界面里夹着汉字」）。 */
export const foreignToUi = (text: string | null | undefined): boolean => !!text && locale.value !== 'zh' && CJK.test(text);

/** 给这段字的 `lang`：认得出是中文就写 zh，否则不写（跟随页面）。 */
export const langOf = (text: string | null | undefined): string | undefined => (text && CJK.test(text) ? 'zh' : undefined);
