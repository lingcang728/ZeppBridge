import { copyFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, '../..');
const source = join(root, 'src-tauri', 'icons', 'icon-source.svg');
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

copyFileSync(join(output, 'icon.png'), publicIcon);
console.log(`Copied ${join(output, 'icon.png')} -> ${publicIcon}`);
