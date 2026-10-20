# 定时发布

一晚上把几个版本都做好、测好，各自冻结成一个提交，然后按日期一天发一版（2026-10-19 用户定，背景见桌面 计划.md 开头）。开发节奏和发布节奏分开：main 可以已经写到 3.0.5，3.0.3 仍然从它自己那个提交打包。

## 三样东西

| 东西 | 在哪 | 作用 |
|---|---|---|
| 冻结快照 | `freeze/v<版本>` 分支 | 指向这一版的提交。推上去后 CI 在这个提交上跑完整检查（`ci.yml` 认 `freeze/**`，不打包） |
| 发布计划 | `.github/release-schedule.json` | 每版的提交 SHA、最早发布时间（带时区）、是否已批准；`paused` 总开关 |
| 提前构建与发布 | `.github/workflows/scheduled-release.yml` | 批准后立即在冻结分支提前构建，核验后上传草稿；北京时间 21:00 检查并公开已准备的草稿，每小时第 17 分补偿检查 |

是否已发布以**公开的稳定 Release**为准，草稿和仍在构建的 tag 都不算。计划文件不回写。

## 一版从冻结到发布

1. 在 main 上做完这一版，**单独一个提交**统一版本号（`check-version-consistency.mjs <版本>`）、切 `BUNDLED_VERSION`、12 种更新说明齐全，本地门禁全绿。
2. 冻结并登记：

   ```bash
   node scripts/release/freeze.mjs add 3.0.4
   ```

   冻结的是 HEAD（`--commit <SHA>` 指定更早的提交）。**默认排在计划里上一版的后一天、北京时间晚上 9 点**（3.0.2 就是这个点发的；不早于明天，留出自测时间）；要别的时间加 `--at 2026-10-22T21:00:00+08:00`。脚本先核对快照（见下），再建本地 `freeze/v3.0.3` 分支，计划里记一条 `approved: false`。
3. 提交计划文件，`git push origin main freeze/v3.0.3`。等 freeze 分支的 CI 绿。快照里的 `ci.yml` 还不认 `freeze/**` 时（只有 3.0.3），推送不会自动跑 CI，要手动 `gh workflow run ci.yml --ref freeze/v3.0.3`；手动跑的也算数（它会顺带演练打包，但不在 tag 上，不建 Release）。
4. 打本地包自测。通过后 `node scripts/release/freeze.mjs approve 3.0.3`，提交并推送。计划变动立即触发准备：在 `freeze/v<版本>` 手动运行完整 CI（测试、打包、签名），约半小时；已有未过期的完整构建直接复用，不重复编译。
5. 构建成功后自动下载四份 artifact，核验下载摘要，组装三平台自动更新元数据、生成 SHA-256 清单并记录构建来源声明，上传 **14 个附件的草稿 Release**。逐个核对服务端摘要、冻结提交、更新说明、自动更新签名条目与下载地址。草稿不会进入公开下载页或自动更新。
6. 北京时间 21:00（`0 13 * * *`）检查；到点只复查远端计划、批准状态、freeze 提交、main 最新 CI 和草稿附件，再建附注 tag 并公开草稿，**不再编译或上传安装包**。原有每小时第 17 分检查负责遗漏补偿。检查状态变化时也会自动继续准备。

只准备计划里的下一版，前一版公开后才准备后一版。准备失败会标红，修复或重跑失败构建后自动继续；不会把失败版本公开。已有完整草稿不依赖 CI artifact 的后续保留期。

下一版在这之后接着写，3.0.4 的提交必须包含 3.0.3 的提交。

## 发布前检查（任何一项不过就不发，工作流标红）

- 快照在 `origin/main` 上，且 `origin/freeze/v<版本>` 正好指向它（防止快照被悄悄换掉）。
- 快照包含上一版 tag 的提交：后一版继承前一版的全部修复。
- 快照里 `package.json` / `tauri.conf.json` 的版本、`BUNDLED_VERSION` 和 glob 都是这一版；`docs/releases/<版本>/` 下 12 种语言齐全。
- **跨版本升级**：`migrations.rs` 相对上一版 tag 只追加不删改，`CURRENT_SCHEMA_VERSION` 不倒退。用户从 3.0.1 直接跳到 3.0.5 时，迁移是按顺序一步步补上的，所以只要每版都只追加就安全；迁移本身的正确性由 CI 里的 storage 测试守着。
- 快照**自己那次** push CI 的 Windows / Linux / macOS verification 全是 success（跳过的不算）。
- 上一版已经有公开的稳定 Release。兼容旧流程：上一版已有 tag 且还在打包时等待；构建失败时停止，不重复建 Release 或重打 tag。
- 草稿指向计划的完整提交 SHA，更新说明与冻结快照一致；14 个附件全部上传完成，服务端 SHA-256 与校验和清单一致，自动更新元数据包含 Windows 安装版、Windows 便携版和 Apple Silicon macOS 三个平台。
- 公开前重新读取远端计划；暂停、撤销批准、取消排期或重新冻结会阻止旧运行公开。main 最新提交的 CI 也必须成功。
- 严格按版本顺序，一次最多发一版。

## 暂停、取消、调整、紧急发布

| 想做的事 | 怎么做 |
|---|---|
| 立刻全部停住 | `gh workflow disable scheduled-release.yml`（恢复：`enable`） |
| 暂停（记在仓库里） | `node scripts/release/freeze.mjs pause`，提交推送；`resume` 恢复 |
| 改某一版的时间 | `node scripts/release/freeze.mjs move 3.0.4 --at <时间>`，提交推送 |
| 撤掉还没发的一版 | `node scripts/release/freeze.mjs remove 3.0.5`，提交推送 |
| 已冻结（甚至已批准）的一版还要补修复 | 先暂停；若已有草稿，删除该版本的旧草稿（保留已公开版本和 tag）。修复提交到 main → `git branch -D freeze/v3.0.5` → `freeze.mjs add 3.0.5 --at <原时间>`（会变回未批准）→ 提交计划，`git push origin main`，再 `git push --force-with-lease=freeze/v3.0.5:<旧快照 SHA> origin freeze/v3.0.5` → 等新快照的 CI 绿、重新自测后 `approve`，恢复计划。更新说明加了行要等 12 种语言补齐再冻结 |
| 严重 bug 马上发 | Actions → Scheduled release → Run workflow，填 `version`。跳过时间、批准和暂停，**不跳过检查**，也只能是计划里的下一版 |
| 只看检查结果 | 同上，勾 `dry_run`；本地：`DRY_RUN=1 node scripts/release/scheduled-release.mjs`。不会触发构建、上传草稿、建 tag 或公开 Release |
| 看计划 | `node scripts/release/freeze.mjs list` |

## 令牌

使用工作流自带的 `GITHUB_TOKEN`（Contents / Actions 写权限，另授予构建来源声明权限）。提前构建通过 `workflow_dispatch` 在冻结分支运行；默认令牌建 tag 不触发第二轮 `push` 构建，到点直接公开已核验的草稿，不再使用 `RELEASE_TOKEN`。

构建完成事件只接收 `freeze/**` 的 CI，带写权限的准备工作流始终检出受信任的 main，再按计划核对冻结 SHA、构建来源和成功作业，避免执行触发事件提供的其他分支代码。

## 注意

- **提前准备能消除到点才开始编译的约半小时等待，不能消除 GitHub cron 本身的延迟。** `notBefore` 仍是「不早于」；若要求严格准点，需要独立调度器与告警，不能只依靠 GitHub 定时触发。
- 操作面板中的草稿已准备状态才代表安装包已就绪；只有公开稳定 Release 才会影响已装用户。
- 仓库 60 天没有提交，GitHub 会自动停用定时工作流。
- tag 正文 = Release 说明 = 应用内更新提示：`# ZeppBridge <版本>` 加空行，再接 `docs/releases/<版本>/en.md`（与 v3.0.2 同格式）。
- 用户天天看到更新提示会疲劳；不急的改进可以攒两天一版，计划里的时间随时能改。
