// 这一版的作者来信写了没有（2026-10-20 用户定：每一版都要先写信，补丁版也算）。
//
//   node scripts/release/check-letter.mjs            # 查 package.json 里的版本
//   node scripts/release/check-letter.mjs 3.1.0      # 查指定版本
//
// 缺语言时退出码 1，并列出缺哪几份。冻结（freeze.mjs add）和定时发布会直接拒绝；
// 本地打包（package:release）只提醒——自测包可以先打，信和翻译齐了再冻结。
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { NOTE_LOCALES, letterPath, needsLetter } from './schedule-core.mjs';

export function missingLetters(version, exists = (path) => existsSync(path) && readFileSync(path, 'utf8').trim() !== '') {
  if (!needsLetter(version)) return [];
  return NOTE_LOCALES.filter((locale) => !exists(letterPath(version, locale)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const version = process.argv[2] ?? JSON.parse(readFileSync('package.json', 'utf8')).version;
  const missing = missingLetters(version);
  if (!needsLetter(version)) {
    console.log(`${version} 早于作者来信流程，不需要信。`);
  } else if (missing.length === 0) {
    console.log(`${version} 的信 12 种语言都在。`);
  } else if (missing.includes('zh')) {
    console.error(`这版的信写了吗？还没有 ${letterPath(version, 'zh')}。先写中文原稿，再审英文，其余语言交给翻译 agent。`);
    process.exitCode = 1;
  } else {
    console.error(`${version} 的信还缺 ${missing.length} 种语言：${missing.join(', ')}（登记到桌面《翻译.md》）。`);
    process.exitCode = 1;
  }
}
