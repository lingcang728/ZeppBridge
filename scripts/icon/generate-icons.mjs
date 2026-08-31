import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, '../..');
// v0.8.4 起平台图标以 design_picture 定稿的位图母版为源；
// icon-source.svg 仍保留给应用内 BrandMark 使用。
const source = join(root, 'src-tauri', 'icons', 'icon-master.png');
const output = join(root, 'src-tauri', 'icons');
const publicIcon = join(root, 'public', 'zeppbridge-icon.png');
const tauriCli = join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');

if (!existsSync(tauriCli)) {
  throw new Error(`@tauri-apps/cli is missing at ${tauriCli}; use the repository install.`);
}

const result = spawnSync(process.execPath, [tauriCli, 'icon', source, '-o', output], {
  cwd: root,
  stdio: 'inherit',
  windowsHide: true,
});
if (result.status !== 0) process.exit(result.status ?? 1);

// The product currently ships Windows desktop bundles. Keep the output folder
// deterministic while still letting the official Tauri generator do the work.
for (const generatedPlatform of ['android', 'ios']) {
  rmSync(join(output, generatedPlatform), { recursive: true, force: true });
}

/*
 * `tauri icon` 把 .icns 里的块按不固定的顺序写出来，所以每次构建
 * 都会得到一个字节不同、内容完全相同的 icon.icns——于是 `git status` 里
 * 永远挂着一个 1.3 MB 的二进制改动。它既会被误提交进不相干的 PR，
 * 也会让人习惯性忽略工作区里的脏数据。
 *
 * 按块类型排序重写一遍，输出就是确定性的。只改顺序，不碰任何
 * 块的内容，macOS 读取时本来就按类型查找、不依赖存放顺序。
 */
const normaliseIcns = (path) => {
  if (!existsSync(path)) return;
  const data = readFileSync(path);
  if (data.length < 8 || data.toString('latin1', 0, 4) !== 'icns') return;
  const declared = data.readUInt32BE(4);
  const blocks = [];
  let offset = 8;
  while (offset + 8 <= Math.min(declared, data.length)) {
    const length = data.readUInt32BE(offset + 4);
    // 长度不合理就说明我们读错了：宁可原样不动，也不要写出一个坏图标。
    if (length < 8 || offset + length > data.length) return;
    blocks.push({ type: data.toString('latin1', offset, offset + 4), body: data.subarray(offset, offset + length) });
    offset += length;
  }
  if (offset !== declared || blocks.length === 0) return;

  blocks.sort((left, right) => (left.type < right.type ? -1 : left.type > right.type ? 1 : 0));
  const header = Buffer.alloc(8);
  header.write('icns', 0, 'latin1');
  header.writeUInt32BE(declared, 4);
  const normalised = Buffer.concat([header, ...blocks.map((block) => block.body)]);
  if (normalised.length !== data.length) return;
  if (normalised.equals(data)) return;
  writeFileSync(path, normalised);
  console.log(`Normalised chunk order in ${path}`);
};

normaliseIcns(join(output, 'icon.icns'));

copyFileSync(join(output, 'icon.png'), publicIcon);
console.log(`Copied ${join(output, 'icon.png')} -> ${publicIcon}`);
