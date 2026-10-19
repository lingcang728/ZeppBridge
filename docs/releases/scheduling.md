# 定时发布

一晚上把几个版本都做好、测好，各自冻结成一个提交，然后按日期一天发一版（2026-10-19 用户定，背景见桌面 计划.md 开头）。开发节奏和发布节奏分开：main 可以已经写到 3.0.5，3.0.3 仍然从它自己那个提交打包。

## 三样东西

| 东西 | 在哪 | 作用 |
|---|---|---|
| 冻结快照 | `freeze/v<版本>` 分支 | 指向这一版的提交。推上去后 CI 在这个提交上跑完整检查（`ci.yml` 认 `freeze/**`，不打包） |
| 发布计划 | `.github/release-schedule.json` | 每版的提交 SHA、最早发布时间（带时区）、是否已批准；`paused` 总开关 |
| 定时任务 | `.github/workflows/scheduled-release.yml` | 每小时第 17 分跑 `scripts/release/scheduled-release.mjs`：到点、批准了、检查全过，就建附注 tag 并触发 CI 打包发 Release |

是否已发布只看 tag 在不在，计划文件不回写。

## 一版从冻结到发布

1. 在 main 上做完这一版，**单独一个提交**统一版本号（`check-version-consistency.mjs <版本>`）、切 `BUNDLED_VERSION`、12 种更新说明齐全，本地门禁全绿。
2. 冻结并登记：

   ```bash
   node scripts/release/freeze.mjs add 3.0.4
   ```

   冻结的是 HEAD（`--commit <SHA>` 指定更早的提交）。**默认排在计划里上一版的后一天、北京时间晚上 9 点**（3.0.2 就是这个点发的；不早于明天，留出自测时间）；要别的时间加 `--at 2026-10-22T21:00:00+08:00`。脚本先核对快照（见下），再建本地 `freeze/v3.0.3` 分支，计划里记一条 `approved: false`。
3. 提交计划文件，`git push origin main freeze/v3.0.3`。等 freeze 分支的 CI 绿。
4. 打本地包自测。通过后 `node scripts/release/freeze.mjs approve 3.0.3`，提交并推送。
5. 到点后的第一次整点检查（每小时第 17 分，GitHub 忙时会晚一些）建 tag、触发 CI；CI 打包、签名、建 Release 约半小时，已装用户随后收到更新。按晚上 9 点排期，Release 一般在 21:50 前后出现。

下一版在这之后接着写，3.0.4 的提交必须包含 3.0.3 的提交。

## 发布前检查（任何一项不过就不发，工作流标红）

- 快照在 `origin/main` 上，且 `origin/freeze/v<版本>` 正好指向它（防止快照被悄悄换掉）。
- 快照包含上一版 tag 的提交：后一版继承前一版的全部修复。
- 快照里 `package.json` / `tauri.conf.json` 的版本、`BUNDLED_VERSION` 和 glob 都是这一版；`docs/releases/<版本>/` 下 12 种语言齐全。
- **跨版本升级**：`migrations.rs` 相对上一版 tag 只追加不删改，`CURRENT_SCHEMA_VERSION` 不倒退。用户从 3.0.1 直接跳到 3.0.5 时，迁移是按顺序一步步补上的，所以只要每版都只追加就安全；迁移本身的正确性由 CI 里的 storage 测试守着。
- 快照**自己那次** push CI 的 Windows / Linux / macOS verification 全是 success（跳过的不算）。
- 上一版已经有 Release。上一版还在打包就等下一小时；上一版有 tag 没 Release（CI 挂了）就停，修好或删掉那个 tag 之前不发后面的。
- 严格按版本顺序，一次最多发一版。

## 暂停、取消、调整、紧急发布

| 想做的事 | 怎么做 |
|---|---|
| 立刻全部停住 | `gh workflow disable scheduled-release.yml`（恢复：`enable`） |
| 暂停（记在仓库里） | `node scripts/release/freeze.mjs pause`，提交推送；`resume` 恢复 |
| 改某一版的时间 | `node scripts/release/freeze.mjs move 3.0.4 --at <时间>`，提交推送 |
| 撤掉还没发的一版 | `node scripts/release/freeze.mjs remove 3.0.5`，提交推送 |
| 严重 bug 马上发 | Actions → Scheduled release → Run workflow，填 `version`。跳过时间、批准和暂停，**不跳过检查**，也只能是计划里的下一版 |
| 只看检查结果 | 同上，勾 `dry_run`；本地：`DRY_RUN=1 node scripts/release/scheduled-release.mjs` |
| 看计划 | `node scripts/release/freeze.mjs list` |

## 令牌

默认用工作流自带的 `GITHUB_TOKEN`。它建的 tag 不会触发 `push` 事件（GitHub 防递归），所以脚本建完 tag 会再用 `workflow_dispatch` 在这个 tag 上跑一次 CI，这是 GitHub 允许的例外。`ci.yml` 的打包和 Release 作业在 tag 上的手动运行里照常执行。

如果 GitHub 拒绝默认令牌建 tag（例如快照改过 `.github/workflows/`，默认令牌没有 workflows 权限），在仓库 Secrets 里加 `RELEASE_TOKEN`：细粒度个人令牌，只给本仓库 Contents、Actions、Workflows 写权限。有它时 tag 本身会触发 CI，脚本不再重复触发。

## 注意

- GitHub 的定时任务会延迟，高峰时可能晚几十分钟，`notBefore` 是「不早于」，不是准点。
- 仓库 60 天没有提交，GitHub 会自动停用定时工作流。
- tag 正文 = Release 说明 = 应用内更新提示：`# ZeppBridge <版本>` 加空行，再接 `docs/releases/<版本>/en.md`（与 v3.0.2 同格式）。
- 用户天天看到更新提示会疲劳；不急的改进可以攒两天一版，计划里的时间随时能改。
