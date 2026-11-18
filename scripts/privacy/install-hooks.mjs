// npm ci / npm install 之后自动把 git 钩子指到 scripts/git-hooks/。
// 不在 git 仓库里（Docker、Flatpak、源码包构建）就什么都不做，不能让安装失败。
import { execFileSync } from 'node:child_process';

try {
  execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { stdio: 'ignore' });
  execFileSync('git', ['config', 'core.hooksPath', 'scripts/git-hooks'], { stdio: 'ignore' });
  console.log('git hooks: core.hooksPath = scripts/git-hooks');
} catch {
  // 没有 git 或不是仓库：跳过。
}
