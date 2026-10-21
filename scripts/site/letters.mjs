/**
 * 官网的作者来信归档：zeppbridge.com/letters（2026-10-20 用户定：信是发版流程的一部分，
 * 就算应用里的信封界面以后不在了，信也照常寄出、公开可查）。
 *
 * 原稿在 docs/releases/letters/<版本>/<locale>.md（格式见 docs/releases/README.md「第一步：先写信」）。
 * 这里只做纯渲染：段落 + `**加粗**` + 落款，其余一律按文本转义，不认链接、不认 HTML。
 * 由 finish-dist.mjs 在部署前写进 .site-cache/site-dist/letters/。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** 和 scripts/release/schedule-core.mjs 的 NOTE_LOCALES 一致；第二列是 <html lang>，第三列是语言自称。 */
export const LETTER_LANGUAGES = [
  ['en', 'en', 'English'], ['zh', 'zh-CN', '中文'], ['es', 'es', 'Español'], ['nl', 'nl', 'Nederlands'],
  ['pt-BR', 'pt-BR', 'Português (Brasil)'], ['pt-PT', 'pt-PT', 'Português (Portugal)'], ['de', 'de', 'Deutsch'],
  ['ru', 'ru', 'Русский'], ['hi-IN', 'hi-IN', 'हिन्दी'], ['fr', 'fr', 'Français'], ['it', 'it', 'Italiano'], ['pl', 'pl', 'Polski'],
];

const VERSION = /^\d+\.\d+\.\d+$/;
const escape = (text) => text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const strong = (text) => escape(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
const byVersionDesc = (a, b) => b.localeCompare(a, 'en', { numeric: true });

/** 一封信 → 段落数组；最后一段以破折号开头就是落款。和应用里 lib/letters.ts 的 parseLetter 同一套规则。 */
export function parseLetter(text) {
  const paragraphs = text.replace(/\r\n/g, '\n').split(/\n\s*\n/).map((p) => p.trim().replace(/\s*\n\s*/g, ' ')).filter(Boolean);
  const last = paragraphs.at(-1);
  const signature = last && /^[—–-]{1,2}\s*/.test(last) && last.length <= 60 ? last.replace(/^[—–-]{1,2}\s*/, '') : null;
  return { paragraphs: signature ? paragraphs.slice(0, -1) : paragraphs, signature };
}

const page = ({ lang, title, body }) => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">`
  + '<meta name="viewport" content="width=device-width, initial-scale=1">'
  + `<title>${escape(title)}</title><link rel="icon" href="/favicon.png">`
  + '<style>'
  + ':root{color-scheme:light dark;--bg:#f4f1ea;--paper:#fffdf8;--ink:#23231f;--muted:#6c6a62;--line:#ddd6c7;--accent:#5d8f2a}'
  + '@media (prefers-color-scheme:dark){:root{--bg:#05070a;--paper:#11151b;--ink:#f0f1ec;--muted:#9aa19a;--line:#262c34;--accent:#8fc24a}}'
  + 'html{background:var(--bg);color:var(--ink);font:17px/1.85 Georgia,"Songti SC","Noto Serif CJK SC","Source Han Serif SC",serif}'
  + 'body{margin:0;padding:48px 16px 72px}main{max-width:640px;margin:0 auto}'
  + 'a{color:var(--accent)}nav{font:14px/1.6 system-ui,sans-serif;color:var(--muted);margin-bottom:28px}'
  + 'nav a{text-decoration:none}.sheet{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:40px clamp(20px,6vw,56px)}'
  + 'h1{font-size:15px;font-family:system-ui,sans-serif;font-weight:400;letter-spacing:.06em;color:var(--muted);margin:0 0 24px}'
  + 'p{margin:0 0 1.1em}.signature{text-align:right;font-style:italic;margin-top:2em}'
  + '.langs{display:flex;flex-wrap:wrap;gap:6px 14px;font:13px/1.6 system-ui,sans-serif;margin-top:28px}'
  + '.langs [aria-current]{color:var(--ink);font-weight:700;text-decoration:none}'
  + 'ul.list{list-style:none;padding:0;margin:0;font-family:system-ui,sans-serif}ul.list li{padding:14px 0;border-bottom:1px solid var(--line)}'
  + 'ul.list a{font-size:18px;text-decoration:none}ul.list span{display:block;color:var(--muted);font-size:14px}'
  + '</style></head><body><main>' + body + '</main></body></html>\n';

/** 读出所有已写好的信：{ version → { locale → 原文 } }。缺语言的版本照样收录，只是少几个语言链接。 */
export function readLetters(root) {
  if (!existsSync(root)) return new Map();
  const letters = new Map();
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !VERSION.test(entry.name)) continue;
    const texts = {};
    for (const [code] of LETTER_LANGUAGES) {
      const file = join(root, entry.name, `${code}.md`);
      if (existsSync(file) && readFileSync(file, 'utf8').trim()) texts[code] = readFileSync(file, 'utf8');
    }
    if (Object.keys(texts).length) letters.set(entry.name, texts);
  }
  return letters;
}

/** 归档的所有页面：{ 站内路径 → HTML }。英文是每封信的默认页，其余语言 /letters/<版本>/<locale>.html。 */
export function renderLetterArchive(letters) {
  const files = new Map();
  const versions = [...letters.keys()].sort(byVersionDesc);
  const opening = (text) => {
    const first = parseLetter(text).paragraphs[0] ?? '';
    const plain = first.replace(/\*\*/g, '');
    return plain.length > 120 ? `${plain.slice(0, 117)}…` : plain;
  };
  const items = versions.map((v) => {
    const texts = letters.get(v);
    const preview = texts.en ?? texts.zh ?? Object.values(texts)[0];
    return `<li><a href="/letters/${v}/">ZeppBridge ${v}</a><span>${escape(opening(preview))}</span></li>`;
  }).join('');
  files.set('letters/index.html', page({
    lang: 'en',
    title: 'Letters · ZeppBridge',
    body: `<nav><a href="/">ZeppBridge</a></nav><div class="sheet"><h1>LETTERS FROM THE AUTHOR</h1>`
      + (items ? `<ul class="list">${items}</ul>` : '<p>No letters yet.</p>') + '</div>',
  }));
  for (const v of versions) {
    const texts = letters.get(v);
    for (const [code, lang] of LETTER_LANGUAGES) {
      if (!texts[code]) continue;
      const { paragraphs, signature } = parseLetter(texts[code]);
      const href = (c) => (c === 'en' ? `/letters/${v}/` : `/letters/${v}/${c}.html`);
      const langs = LETTER_LANGUAGES.filter(([c]) => texts[c])
        .map(([c, l, name]) => `<a href="${href(c)}" hreflang="${l}"${c === code ? ' aria-current="page"' : ''}>${escape(name)}</a>`).join('');
      files.set(code === 'en' ? `letters/${v}/index.html` : `letters/${v}/${code}.html`, page({
        lang,
        title: `ZeppBridge ${v} · Letter`,
        body: `<nav><a href="/">ZeppBridge</a> · <a href="/letters/">Letters</a></nav><article class="sheet">`
          + `<h1>ZEPPBRIDGE ${v}</h1>${paragraphs.map((p) => `<p>${strong(p)}</p>`).join('')}`
          + (signature ? `<p class="signature">— ${strong(signature)}</p>` : '')
          + `</article><div class="langs">${langs}</div>`,
      }));
    }
  }
  return files;
}
