/**
 * 随应用打包的作者来信（批次 6「信匣」）。每一版的信都打进来，所以信匣离线也能重读所有旧信；
 * 懒加载：只在打开信封 / 信匣时取当前语言那一份。没有该语言时回落英文，再回落中文原稿。
 *
 * 原稿：docs/releases/letters/<版本>/<locale>.md；回音：docs/releases/letters/<版本>/echo/<locale>.md（可以没有）。
 */
import { compareVersions, echoTitle, parseEcho } from '../lib/letters/parse';

type Loader = () => Promise<string>;

const LETTERS = import.meta.glob('../../docs/releases/letters/*/*.md', { query: '?raw', import: 'default' }) as Record<string, Loader>;
const ECHOES = import.meta.glob('../../docs/releases/letters/*/echo/*.md', { query: '?raw', import: 'default' }) as Record<string, Loader>;

const LETTER_PATH = /\/letters\/(\d+\.\d+\.\d+)\/([^/]+)\.md$/;
const ECHO_PATH = /\/letters\/(\d+\.\d+\.\d+)\/echo\/([^/]+)\.md$/;

const index = (files: Record<string, Loader>, pattern: RegExp) => {
  const map = new Map<string, Map<string, Loader>>();
  for (const [path, loader] of Object.entries(files)) {
    const match = pattern.exec(path);
    if (!match) continue;
    if (!map.has(match[1]!)) map.set(match[1]!, new Map());
    map.get(match[1]!)!.set(match[2]!, loader);
  }
  return map;
};

let letterIndex: Map<string, Map<string, Loader>> | null = null;
let echoIndex: Map<string, Map<string, Loader>> | null = null;
/** 测试注入用：换成假的信件。 */
export function __setLetterSources(letters: Record<string, Loader>, echoes: Record<string, Loader> = {}): void {
  letterIndex = index(letters, LETTER_PATH);
  echoIndex = index(echoes, ECHO_PATH);
}
const letters = () => (letterIndex ??= index(LETTERS, LETTER_PATH));
const echoes = () => (echoIndex ??= index(ECHOES, ECHO_PATH));

/** 写过信的版本，从新到旧。 */
export const letterVersions = (): string[] => [...letters().keys()].sort((a, b) => compareVersions(b, a));

const pick = async (byLocale: Map<string, Loader> | undefined, language: string): Promise<{ text: string; locale: string } | null> => {
  if (!byLocale) return null;
  for (const code of [language, 'en', 'zh']) {
    const loader = byLocale.get(code);
    if (!loader) continue;
    try {
      const text = await loader();
      if (text.trim()) return { text, locale: code };
    } catch { /* 换下一种语言 */ }
  }
  return null;
};

export const loadLetter = (version: string, language: string) => pick(letters().get(version), language);
export const loadEcho = (version: string, language: string) => pick(echoes().get(version), language);

/**
 * 回执里「归入『…』」的标题：作者在之后某一版的回音里给这一类起的名字（`#id` 全局唯一）。
 * 从新到旧找，找到为止；找不到就不说归到哪一类（不显示一个没人看得懂的 id）。
 */
export async function echoTitles(language: string): Promise<Map<string, string>> {
  const titles = new Map<string, string>();
  const versions = [...echoes().keys()].sort((a, b) => compareVersions(b, a));
  for (const version of versions) {
    const echo = await loadEcho(version, language);
    if (!echo) continue;
    for (const item of parseEcho(echo.text).items) if (!titles.has(item.id)) titles.set(item.id, echoTitle(item));
  }
  return titles;
}