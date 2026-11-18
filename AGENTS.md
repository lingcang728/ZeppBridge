# ZeppBridge

`lingcang728/ZeppBridge` 的仓库规则，给在这里工作的人和 AI agent 看。构建、测试和发版细节见 [开发文档](docs/development/development.zh-CN.md)，外部贡献流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。

维护者本机的路径、测试包、真实库和 agent 派发规则在仓库**外面**的 `../ZeppBridge-private/`（`AGENTS.local.md`、`CLAUDE.private.md`）；有这个目录时一并读。计划、交接、验收记录这类工作笔记也写在那里，不写进仓库目录。

## 分支与发版

- 在 `main` 上开发。`v3` 分支已冻结，不再提交、不从它开新分支；2.x 不再维护。
- 维护者直接推送 `main`；外部贡献走 PR。分支保护（Documentation and CI routing、Windows / macOS verification）拦外部 PR。
- 动手前 `git pull --rebase origin main`，本地门禁跑完再推。push 会自动跑 CI；打 `v*` 标签前确认 main 最新的 CI 是绿的。
- **推 `v*` 标签就会触发 CI 打包并创建 GitHub Release**，已装用户随即收到更新。所以推送、打标签、发版都要维护者明确同意，agent 不自行做。
- 普通 README、`docs/**/*.md` 和文档图片的改动只跑轻量文档检查，三平台构建和 Docker 跳过。参与 Rust 契约测试的 `docs/reference/cli-and-mcp*.md`、代码、配置、脚本和其他文件仍跑完整验证；发布标签和手动触发的 CI 始终跑完整流程。

## 门禁

- 前端：`npm run build`、`npm test`、`npm run test:functions`、`npm run i18n:check`、`npm run docs:check`、`npm run version:check`、`npm run lockfile:check`。改了 `.vue` 模板再跑一次 `npx vite build`（vue-tsc 查不出模板编译错误）。
- Rust：`cargo fmt --all -- --check`、`cargo clippy --workspace --all-targets -- -D warnings`、`cargo test --workspace --locked`（在 `src-tauri/` 下，或加 `--manifest-path src-tauri/Cargo.toml`）。`--workspace` 不能省：这是 cargo workspace（应用 + core + cli + mcp），漏掉它只测了应用一个包。
- 多个 worktree 并行时，每个 worktree 用自己的 `CARGO_TARGET_DIR`。共用 target 目录会让两棵源码树写同一批产物指纹，典型症状是 `cargo check` 过、`cargo test` 却挂在莫名其妙的地方。
- `cfg(not(windows))` 分支的编译和 clippy 错只在 Linux / macOS CI 上暴露，Windows 本机门禁看不到。

## 契约与文档

- `docs/reference/cli-and-mcp*.md` 的 MCP 工具表由 `src-tauri/crates/mcp/src/tests/browse.rs` 校验：首格是反引号包住的 snake_case 名字的表格行都被当成工具名，集合必须和注册的工具完全一致。增删工具时两份文档一起改；不要在这两份文档里另加首格是反引号 snake_case 的表格行。
- CLI 参数以 `src-tauri/crates/cli/src/main.rs` 的 `HELP` 为准，退出码以 `EXIT_*` 常量为准；文档跟着代码改。
- `scripts/release/check-version-consistency.mjs` 用正则盯着两份 `docs/reference/architecture*.md` 开头的版本句，改那一句要同步改脚本。
- `docs/releases/<版本>/*.md` 和 `docs/releases/letters/**` 会被应用和官网读取，路径不能动。
- 能力有变化就同步改 [`capability-maturity`](docs/reference/capability-maturity.zh-CN.md) 对应的那一行（中英两份）。
- 官方开放平台的接口事实写在 [`official-api-facts`](docs/reference/official-api-facts.zh-CN.md)；代码注释引用接口事实时指向它。

## 代码约定

- 数据库迁移（`storage/migrations.rs`）只能追加，已发布的 DDL 永不修改。
- 同步窗口、保留期这类常量只在 `crates/core/src/contract.rs` 定义一次，别处不要写死数字。
- 新增 Tauri command 要改四处：`src-tauri/src/commands/` 里的实现、`commands/mod.rs` 的同名导出、`src-tauri/src/lib.rs` 的 `generate_handler!`、前端 `src/lib/bridge/types.ts` 与 `tauri.ts`。漏一处 `npm run build` 就会挂。
- 界面文案用 `defineMessages(zh, en, es?)` 写；新文案至少写中文和英文，其余语言由 `npm run i18n:check -- --write-pending` 登记到 `src/i18n/locales/<语言>.pending.txt`，翻完一行删一行。导出 JSON 里给 CLI / MCP 用的说明字段是契约，不翻译。
- 改界面要看所有界面语言（`src/i18n/index.ts` 的 `LOCALES`），不能有重叠、叠字或空缺；可以用 `scripts/verify/text_overlap.py` 辅助检查。
- 不要把令牌、Cookie、HAR、精确 GPS、个人健康数值写进日志、测试、fixture 或提交。测试数据用虚构值。
- Zepp 合作方资料（官方 PDF、对接截图、应用凭据）不进本仓库或任何公开仓库；需要时只写结论。
- 提交说明、公开文档、代码注释、Release、issue / PR 回复只写改了什么和为什么，用产品和代码的语言写；不转述和维护者的讨论（「用户说 / 用户定 / 看过录屏 / 第几轮反馈」、日期拍板、内部计划编号），不写本机路径。`scripts/git-hooks/` 的 pre-commit / commit-msg 和 CI 的隐私检查（`scripts/privacy/check.mjs`）会拦；`npm ci` 会自动装钩子，也可以 `npm run hooks:install`。
- 已移除的旧方案不要恢复：局域网抓包（MITM、用户 CA、Wi-Fi 代理）、`start_capture` 一类命令。
