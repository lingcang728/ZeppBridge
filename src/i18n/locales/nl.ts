import type { LocalePack } from '../index';

/**
 * Nederlands（nl）语言包。
 *
 * W2 只建机制：这里刻意是空注册表，不放占位译文——占位会让 W4 的
 * 「已翻 / 未翻」审计失真。尚未覆盖的键全部登记在同目录的
 * `nl.pending.txt` 里（`moduleId.键路径` 一行一条）；翻译落地时
 * 把键写进 `modules` 并从 pending 里删掉对应行，`npm run i18n:check` 会核对。
 *
 * 形状：
 *   modules: { '<moduleId>': { <键路径>: '译文' | (参数) => `...` } }
 *   errors: { 'err.x.y': '译文' }        // 等价 modules['i18n/errors']
 *   backendText: { 'ui.x.y': '译文' }    // 后端散文码的兜底表
 */
export default { modules: {} } satisfies LocalePack;
