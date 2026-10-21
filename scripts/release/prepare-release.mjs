// 从冻结提交自己的四份 CI artifact 组装发布文件。此步骤只处理下载到 runner 的产物，不编译。
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { letterPath, needsLetter, parseSchedule, releaseAssetNames, tagMessage } from './schedule-core.mjs';

export function prepareAssets({ root, output, entry, notes, letter = null, repo }) {
  const names = releaseAssetNames(entry.version);
  mkdirSync(output, { recursive: true });
  const sources = {
    windows: 'windows', msi: 'windows', portable: 'windows', windowsTools: 'windows',
    dmg: 'macos', mac: 'macos', macTools: 'macos',
    deb: 'linux', rpm: 'linux', appimage: 'linux', linuxTools: 'linux', flatpak: 'flatpak',
  };
  for (const [key, name] of Object.entries(names)) {
    const source = join(root, sources[key], name);
    if (!statSync(source).isFile() || statSync(source).size === 0) throw new Error(`构建产物为空：${name}`);
    copyFileSync(source, join(output, name));
  }
  const latest = JSON.parse(readFileSync(join(root, 'windows', 'latest.json'), 'utf8'));
  if (latest.version !== entry.version) throw new Error('Windows 构建产物版本与冻结版本不一致');
  for (const key of ['windows-x86_64', 'windows-x86_64-portable']) {
    if (!latest.platforms?.[key]?.signature?.trim()) throw new Error(`缺少自动更新签名：${key}`);
  }
  const signature = readFileSync(join(root, 'macos', `${names.mac}.sig`), 'utf8').trim();
  if (!signature) throw new Error('缺少 macOS 自动更新签名');
  const download = (name) => `https://github.com/${repo}/releases/download/v${entry.version}/${name}`;
  latest.notes = tagMessage(entry.version, notes, letter).trim();
  latest.pub_date = entry.notBefore.toISOString();
  latest.platforms['windows-x86_64'].url = download(names.windows);
  latest.platforms['windows-x86_64-portable'].url = download(names.portable);
  latest.platforms['darwin-aarch64'] = { signature, url: download(names.mac) };
  writeFileSync(join(output, 'latest.json'), `${JSON.stringify(latest, null, 2)}\n`);
  const files = [...Object.values(names), 'latest.json'].sort();
  const sums = files.map((name) => `${createHash('sha256').update(readFileSync(join(output, name))).digest('hex')}  ${name}`).join('\n');
  writeFileSync(join(output, 'SHA256SUMS.txt'), `${sums}\n`);
  return [...files, 'SHA256SUMS.txt'];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const schedule = parseSchedule(readFileSync('.github/release-schedule.json', 'utf8'));
  const entry = schedule.releases.find((r) => r.version === process.env.PREPARE_VERSION && r.commit === process.env.PREPARE_COMMIT);
  if (!entry) throw new Error('待组装的版本与冻结计划不一致');
  const notes = execFileSync('git', ['show', `${entry.commit}:docs/releases/${entry.version}/en.md`], { encoding: 'utf8' });
  const letter = needsLetter(entry.version)
    ? execFileSync('git', ['show', `${entry.commit}:${letterPath(entry.version, 'en')}`], { encoding: 'utf8' })
    : null;
  const files = prepareAssets({ root: '.prepared-release', output: '.prepared-release/assets', entry, notes, letter, repo: process.env.GITHUB_REPOSITORY });
  console.log(`已组装并生成 SHA-256 清单：${files.length} 个发布附件，快照 ${entry.commit}`);
}
