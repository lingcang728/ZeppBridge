// The MiSans CJK slice only carries characters that appear in the source tree
// (scripts/assets/subset-fonts.py). New interface copy with a character outside the
// slice would silently render in the fallback font, so fail loudly instead.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
// Not trim(): U+3000 (ideographic space) is in the list and trim() would eat it.
const shipped = new Set(readFileSync(join(root, 'src/assets/fonts/misans-cjk-chars.txt'), 'utf8').replace(/\r?\n$/, ''));
// The rebuilt website owns its fonts; extending site copy must not alter the app's slice.
const siteShipped = new Set(readFileSync(join(root, 'public/landing/fonts/cjk-chars.txt'), 'utf8').replace(/\r?\n$/, ''));
const usesSiteFont = (file) => file.replace(/\\/g, '/').includes('/src/views/landing/')
  || file.replace(/\\/g, '/').endsWith('/src/views/LandingPage.vue')
  || file.replace(/\\/g, '/').endsWith('/src/composables/useLandingLocale.ts');
const CJK = /[⺀-⿿　-〿぀-ヿ㄀-ㇿ㐀-䶿一-鿿豈-﫿︰-﹏＀-￯]/gu;

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|vue|json|css|html)$/.test(name)) out.push(path);
  }
  return out;
};

test('every CJK character in the interface is in the shipped MiSans slice', () => {
  const missing = new Map();
  for (const file of walk(join(root, 'src'))) {
    if (file.includes('__tests__') || /\.test\.[cm]?[jt]s$/.test(file)) continue;
    // Comments never reach the screen; same rule as the subset script.
    const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->|(?<![:\\])\/\/[^\n]*/g, '');
    for (const char of text.match(CJK) ?? []) {
      const covered = usesSiteFont(file) ? siteShipped.has(char) : shipped.has(char);
      if (!covered && !missing.has(char)) missing.set(char, file);
    }
  }
  assert.equal(
    missing.size,
    0,
    `rerun \`python scripts/site/subset-landing-fonts.py\` for website copy or \`python scripts/assets/subset-fonts.py\` for desktop copy; missing: ${[...missing].slice(0, 20).map(([c, f]) => `${c} (${f})`).join(', ')}`,
  );
});
