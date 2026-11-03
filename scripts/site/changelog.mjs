/**
 * 官网的更新日志：zeppbridge.com/changelog（英文）与 /changelog/<locale>.html。
 *
 * 原稿就是应用内更新弹窗用的 docs/releases/<版本>/<locale>.md（规范见 docs/releases/README.md）；
 * 3.0.1 是单文件旧格式 docs/releases/3.0.1.md，按 `## 中文` / `## English` 分段。
 * **只收已经有 v<版本> 标签的版本**：还没发的版本即使说明写好了也不会提前上网。
 * 分组规则和应用里 services/updateNotice.ts 的 releaseRows / groupRows 同一套；只认 `**加粗**`，其余按文本转义。
 * 由 finish-dist.mjs 在部署前写进 .site-cache/site-dist/changelog/。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { LETTER_LANGUAGES, escape, page, strong } from './letters.mjs';

const VERSION = /^\d+\.\d+\.\d+$/;
const byVersionDesc = (a, b) => b.localeCompare(a, 'en', { numeric: true });

/* 分组名抄自应用 components/shell/UpdateNotice 的各语言包；页面标题是新文案，只写了中英西，其余登记在桌面《翻译.md》。 */
const EN = { title: 'Changelog', added: 'New', improved: 'Improved', fixed: 'Fixed', note: 'Update' };
const LABELS = {
  en: EN,
  zh: { title: '更新日志', added: '新增', improved: '改进', fixed: '修复', note: '更新' },
  es: { title: 'Registro de cambios', added: 'Nuevo', improved: 'Mejorado', fixed: 'Corregido', note: 'Novedad' },
  de: { ...EN, title: 'Changelog', added: 'Neu', improved: 'Verbessert', fixed: 'Behoben' },
  fr: { ...EN, title: 'Historique des versions', added: 'Nouveau', improved: 'Amélioré', fixed: 'Corrigé' },
  'hi-IN': { ...EN, title: 'बदलावों का विवरण', added: 'नया', improved: 'बेहतर', fixed: 'ठीक किया' },
  it: { ...EN, title: 'Registro modifiche', added: 'Novità', improved: 'Miglioramenti', fixed: 'Risoluzioni' },
  nl: { ...EN, title: 'Wijzigingsoverzicht', added: 'Nieuw', improved: 'Verbeterd', fixed: 'Opgelost' },
  'pt-BR': { ...EN, title: 'Histórico de alterações', added: 'Novo', improved: 'Melhorado', fixed: 'Corrigido' },
  'pt-PT': { ...EN, title: 'Registo de alterações', added: 'Novo', improved: 'Melhorado', fixed: 'Corrigido' },
  ru: { ...EN, title: 'История изменений', added: 'Новое', improved: 'Улучшено', fixed: 'Исправлено' },
  pl: { title: 'Dziennik zmian', added: 'Nowości', improved: 'Ulepszenia', fixed: 'Poprawki', note: 'Aktualizacja' },
  'zh-TW': { title: '更新日誌', added: '新增', improved: '改進', fixed: '修復', note: '更新' },
};

/** 旧单文件里的分段标题 → locale。 */
const LEGACY_SECTIONS = { 中文: 'zh', English: 'en' };

/** 读出所有写好的更新说明：{ version → { locale → 原文 } }。 */
export function readReleaseNotes(root) {
  const notes = new Map();
  if (!existsSync(root)) return notes;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory() && VERSION.test(entry.name)) {
      const texts = {};
      for (const [code] of LETTER_LANGUAGES) {
        const file = join(root, entry.name, `${code}.md`);
        if (existsSync(file) && readFileSync(file, 'utf8').trim()) texts[code] = readFileSync(file, 'utf8');
      }
      if (Object.keys(texts).length) notes.set(entry.name, texts);
    } else if (entry.isFile() && VERSION.test(entry.name.replace(/\.md$/, '')) && !notes.has(entry.name.slice(0, -3))) {
      const texts = splitLegacy(readFileSync(join(root, entry.name), 'utf8'));
      if (Object.keys(texts).length) notes.set(entry.name.slice(0, -3), texts);
    }
  }
  return notes;
}

/** 3.0.1 的单文件：`## 中文` 下是中文、`## English` 下是英文，`#` 大标题丢掉。 */
export function splitLegacy(text) {
  const texts = {};
  let current = null;
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) { current = LEGACY_SECTIONS[heading[1]] ?? null; continue; }
    if (current && !/^#\s/.test(line)) texts[current] = `${texts[current] ?? ''}${line}\n`;
  }
  for (const code of Object.keys(texts)) if (!texts[code].trim()) delete texts[code];
  return texts;
}

/** 和 updateNotice.ts 的 releaseRows + groupRows 一致：按「新增 → 改进 → 修复 → 其他」分组，标题行丢掉。 */
export function groupNotes(text) {
  const groups = { added: [], improved: [], fixed: [], note: [] };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^#{1,6}\s/.test(line)) continue;
    let item = line.replace(/^[-*+]\s+/, '');
    const match = /^(新增|新功能|Added|New|改进|优化|Improved|Changed|修复|Fixed|Fix)\s*[:：]\s*/i.exec(item);
    let kind = 'note';
    if (match) {
      kind = /^(新增|新功能|Added|New)$/i.test(match[1]) ? 'added' : /^(修复|Fixed|Fix)$/i.test(match[1]) ? 'fixed' : 'improved';
      item = item.slice(match[0].length);
    }
    groups[kind].push(item);
  }
  return Object.entries(groups).filter(([, items]) => items.length).map(([kind, items]) => ({ kind, items }));
}

/** 某个语言缺这一版的说明时：繁体先落简体，其余落英文，再不行随便拿一份。 */
function pick(texts, code) {
  for (const candidate of [code, code === 'zh-TW' ? 'zh' : null, 'en', 'zh']) {
    if (candidate && texts[candidate]) return [candidate, texts[candidate]];
  }
  const [first] = Object.entries(texts);
  return first;
}

const STYLE = 'main{max-width:720px}h1{font-size:28px;letter-spacing:-.01em;color:var(--ink);font-weight:600;margin:0 0 8px}'
  + '.release{border-top:1px solid var(--line);padding:28px 0 8px}.release:first-of-type{border-top:0}'
  + 'h2{font:600 22px/1.3 system-ui,sans-serif;margin:0}h2 time{font-weight:400;font-size:14px;color:var(--muted);margin-left:10px}'
  + 'h3{font:600 13px/1.6 system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:20px 0 6px}'
  + '.release ul{margin:0;padding-left:1.2em;font:16px/1.7 system-ui,sans-serif}.release li{margin:0 0 8px}';

const href = (code) => (code === 'en' ? '/changelog/' : `/changelog/${code}.html`);

/**
 * 日志的所有页面：{ 站内路径 → HTML }。`tags` 是 { 版本 → 打标签的日期（YYYY-MM-DD，可为空串）}，
 * 只有在里面的版本才会出现在页面上。
 */
export function renderChangelog(notes, tags) {
  const versions = [...notes.keys()].filter((v) => tags.has(v)).sort(byVersionDesc);
  const files = new Map();
  for (const [code, lang] of LETTER_LANGUAGES) {
    const label = LABELS[code] ?? EN;
    const sections = versions.map((v) => {
      const [used, text] = pick(notes.get(v), code);
      const usedLang = LETTER_LANGUAGES.find(([c]) => c === used)?.[1] ?? 'en';
      const date = tags.get(v);
      const groups = groupNotes(text).map(({ kind, items }) => `<h3>${escape(label[kind])}</h3><ul>${items.map((item) => `<li>${strong(item)}</li>`).join('')}</ul>`).join('');
      return `<section class="release" id="v${v}"${usedLang === lang ? '' : ` lang="${usedLang}"`}>`
        + `<h2>${v}${date ? ` <time datetime="${date}">${date}</time>` : ''}</h2>${groups}</section>`;
    }).join('');
    const langs = LETTER_LANGUAGES
      .map(([c, l, name]) => `<a href="${href(c)}" hreflang="${l}"${c === code ? ' aria-current="page"' : ''}>${escape(name)}</a>`).join('');
    files.set(code === 'en' ? 'changelog/index.html' : `changelog/${code}.html`, page({
      lang,
      title: `${label.title} · ZeppBridge`,
      style: STYLE,
      body: `<nav><a href="/">ZeppBridge</a></nav><h1>${escape(label.title)}</h1>`
        + `<div class="langs">${langs}</div>${sections || '<p>—</p>'}`,
    }));
  }
  return files;
}
