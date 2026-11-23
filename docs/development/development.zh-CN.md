# 开发 ZeppBridge

给改代码、跑检查、打安装包的人看。应用是什么见 [README](../../README.zh-CN.md)，整体怎么拼起来见[架构说明](../reference/architecture.zh-CN.md)。

[English](development.md)

## 环境

- Windows 11、macOS 11+（Apple Silicon），或装了 WebKitGTK 4.1 的 Linux
- Node.js 22+ 和 npm
- Rust stable 工具链（Windows 要 MSVC 构建工具，macOS 要 Xcode Command Line Tools，Linux 要 WebKitGTK 开发包——CI 的 `Install Linux build dependencies` 一步列全了）
- Python 3 和 Pillow，`npm run icons:verify` 要用

```bash
npm ci
```

`npm ci` 同时会给 `@vitejs/plugin-vue` 打上仓库自带的补丁（见 [scoped 外置样式](#scoped-外置样式)）。

## 目录

`src-tauri/` 是一个 cargo workspace，四个成员：

| crate | 路径 | 是什么 |
|---|---|---|
| `zeppbridge` | `src-tauri/src` | Tauri 应用：命令、窗口、托盘、更新 |
| `zeppbridge-core` | `src-tauri/crates/core` | 几乎全部逻辑：认证、连接器、抓取、解析、存储、同步、导出、本机 API |
| `zeppbridge-cli` | `src-tauri/crates/cli` | 无交互的 `status` / `sync` / `export`，退出码是契约 |
| `zeppbridge-mcp` | `src-tauri/crates/mcp` | stdio MCP 服务 |

`src/` 是 Vue 3 前端：`views/` → `composables/` → `lib/bridge/` → Tauri IPC。页面不直接 `invoke`，也不直接访问 Zepp。

## 日常命令

| 命令 | 做什么 |
|---|---|
| `npm run dev` | 只起 Vite。浏览器里看到的是落地页；加 `?app-preview=1` 看不带账户数据的桌面外壳 |
| `npm run tauri dev` | 开发模式的桌面应用 |
| `npm run build` | `vue-tsc --noEmit && vite build`，前端的类型门禁 |
| `npm test` | Vitest：所有 `src/**/__tests__/**/*.test.ts` |
| `npm run test:functions` | 用 `node --test` 测 Pages 函数、网站与字体脚本，并包含 `test:dev` |
| `npm run test:dev` | 起 Vite，冷请求 scoped 外置样式 |
| `npm run i18n:check` | 界面没有写死的中文；后端的每个码都有文案 |
| `npm run docs:check` | 仓库内的链接都有效 |
| `npm run version:check` | 十一处版本号一致 |
| `npm run lockfile:check` | `package-lock.json` 只从 registry.npmjs.org 解析 |
| `npm run budget:check` | 首屏体积预算（先 `npm run build`） |
| `npm run icons:verify` | 生成的图标和源文件一致 |
| `npm run build:web` | 构建官网（落地页测试 + `vite build --mode site`），不是桌面前端 |
| `npm run tools:package` | 打包 `zeppbridge-cli` 和 `zeppbridge-mcp`，附 `SHA256SUMS` |

`dist/` 是产物。改完 `src/` 要重新构建，不要手改 bundle。

`npm test` 盯的是一条规则：**缺失的数据绝不显示成 0**。没有组件快照——它们每改一次样式就变红，什么也拦不住。

`npm run budget:check` 量的是首屏之前必须加载的东西（入口脚本、`modulepreload` 分块、入口样式），不是 `dist` 的总大小。上限在 `bundle-budget.json`；确认增长值得时才用 `npm run budget:update` 刷新，并在提交里说明原因。

### scoped 外置样式

好几个页面用 `<style scoped src="…">`。锁定版本的 `@vitejs/plugin-vue` 需要补丁才支持，补丁在 `scripts/dev/patch-vue-external-styles.mjs`，由 `postinstall` 打上。用 `--ignore-scripts` 安装的话，手动跑一次 `npm run postinstall` 再重启开发服务。升级插件时检查这个补丁并跑 `npm run test:dev`，因为生产构建走不到这条路径。

## Rust 检查

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo check --manifest-path src-tauri/Cargo.toml --workspace --locked --all-targets
cargo clippy --manifest-path src-tauri/Cargo.toml --workspace --locked --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --workspace --locked --jobs 1
```

`--workspace` 不能省，省了只查应用一个包。单元测试放在各模块自己的 `tests.rs` 或 `tests/` 子模块里；只有 CLI 和 MCP 有 crate 级的集成测试。跑单个测试用过滤器：

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p zeppbridge-core --lib storage::tests::queries
```

同时在几个检出目录里干活时，给每个目录单独的 `CARGO_TARGET_DIR`。两棵源码树共用一个 target 目录会互相覆盖构建指纹，典型症状是 `cargo check` 过、`cargo test` 挂。

只在 Windows 编译的代码只在 Windows 上检查，`cfg(not(windows))` 的代码只在 Linux 和 macOS 上检查，所以本机跑绿不代表其他平台也绿。CI 在三个平台上跑同样的四条命令。

Rust 版本钉在仓库根目录的 `rust-toolchain.toml`，本机和 CI 用同一版。升级 Rust 只改这一个文件；推到 main 时 CI 会顺带把三平台安装包打一遍。本机测试带 `--jobs 1`，免得长时间全核满载；CI 上不限。

推送前可以先跑 `npm run preflight`：按 CI 的顺序把 Windows 上能跑的检查跑一遍（路由和隐私检查、锁文件、前端门禁、Rust 门禁、Flatpak 来源）。`npm run preflight:quick` 跳过 Rust，几分钟跑完。

Rust 测试只留能挡住假成功、丢数据、错文案的那些。

## CI 跑什么

每次推送和 PR，先由一个分流作业（`scripts/ci/select-checks.mjs`）按改动的文件挑出要跑的检查。每个平台都是：lockfile 检查、`npm ci`、`npm run build`、四条 Rust 命令，依赖编译结果按 main 上的缓存复用。Windows 另外跑体积预算、`i18n:check`、`npm test`、`test:functions` 和 `icons:verify`。Flatpak 清单检查和无头 Docker 镜像各自是单独的作业，和三个平台的验证并行跑。另有一个作业检查文档链接、版本号和新提交的隐私问题。

安装包（NSIS + MSI、macOS app 与 dmg、Flatpak、deb、rpm、AppImage）在打 `v*` 标签、手动触发，以及推 main 时改到了打包相关文件（`Cargo.toml` / `Cargo.lock`、tauri 配置、`rust-toolchain.toml`、`package.json`、`packaging/`、`scripts/release/`、`scripts/ci/`、工作流）时构建，和验证并行跑。只有 `v*` 标签会创建 GitHub Release，而且要等全部验证和打包都通过，见[发版](../releases/README.md)。

发版的顺序：`npm run preflight` → 推 main → 等 main 的 CI 绿（改了打包相关文件时，这一步已经把三平台安装包实际打过一遍）→ 打 `v*` 标签。

## 打安装包

```bash
npm run tauri build   # Windows：NSIS + MSI（目标写在 src-tauri/tauri.conf.json）
npm run build:mac     # macOS：前端、门禁，然后 tauri build --bundles app,dmg
```

没有 `TAURI_SIGNING_PRIVATE_KEY` 就不产出更新包，本地构建不受影响。Windows 安装包没有 Authenticode 签名；macOS 包是 ad-hoc 签名、未公证（见[代码签名](code-signing.md)）。Linux 包见 [Linux 打包](linux-packaging.md)（英文）。CLI 和 MCP：`cargo build --release --manifest-path src-tauri/Cargo.toml -p zeppbridge-cli -p zeppbridge-mcp`。

`npm run package:release` 是维护者在 Windows 上打本地测试包的脚本：跑门禁、把 CLI 和 MCP 作为 sidecar 带上、在 `release\` 里产出 NSIS 安装包和便携 exe，需要更新签名密钥的备份。贡献者用不到它。

## 新增一个 command

一个 Tauri command 要改四处：

1. 实现写在 `src-tauri/src/commands/`；
2. 在 `src-tauri/src/commands/mod.rs` 里同名导出；
3. 加进 `src-tauri/src/lib.rs` 的 `invoke_handler` 列表；
4. 在 `src/lib/bridge/types.ts` 的 `BridgeBackend` 接口里声明，并在 `src/lib/bridge/tauri.ts` 实现。

接口是全量的，漏了第 4 步 `npm run build` 就会挂。`src/lib/bridge/web.ts` 不用动：浏览器里每个方法都以 `DesktopUnavailableError` 拒绝。

command 的完整清单就是 `src-tauri/src/lib.rs`，这里不另抄一份。前端据以分支的取值：

- `LoginState`：`idle`、`waiting`、`extracting`、`verifying`、`connected`、`failed`。
- `SyncOutcome`：`updated`、`no_new_data`、`partial`、`failed`、`cancelled`、`deferred`、`cloud_stale`。`deferred` 表示启动时正在重放本地原始报文，同步让路，之后会自己重试，不算失败。`cloud_stale` 表示云端没有比本地更新的数据，这一轮什么都没拉。

## 本机 REST API

默认关闭。用户打开后桌面端只监听 `127.0.0.1`：地址是代码里的常量（`LOCAL_API_ADDRESS`），没有任何设置能改。只读、不发 CORS 头，每个请求都要 `Authorization: Bearer <token>`。路由：`/health`、`/workouts/{id}/series` 和 `/v1/records`（和 `zeppbridge-cli export --format json` 同一个 `records::query_records`；请求里没写 `include_gps=true` 就不带 GPS）。

无头版 `zeppbridge-cli serve`（`local_api/headless.rs`）给 Docker 和服务器用，跑同一套处理逻辑。不设 `ZEPPBRIDGE_LISTEN` 就只听 `127.0.0.1`；听本机以外的地址时没有单独的拉取 token（`zeppbridge-cli pull-token`）就拒绝启动。代码在 `src-tauri/crates/core/src/local_api/`；契约见[自托管拉取](../guides/self-hosted-pull.zh-CN.md)，边界见[安全与隐私](../reference/security-and-privacy.zh-CN.md)。

## 数据链路

1. `AuthManager`（`crates/core/src/auth/`）经 `keyring` 把令牌存进系统凭据存储（Windows 凭据管理器、macOS 钥匙串、Linux Secret Service，或用户同意的文件），`auth.json` 只存元数据。
2. `ZeppConnector` 只为白名单主机（`api-mifit*.zepp.com`、`api-mifit*.huami.com`）构造 HTTPS 地址，并区分 401/403/404/429/5xx。官方开放平台的通道在 `crates/core/src/official/` 和 `sync/official.rs`。
3. `DataFetcher` 为每个响应保留数据流、来源键和原始报文。
4. normalizer 只接受认得的结构，认不出的保留原始报文并标 `unverified`。改派生逻辑要推 `storage/mod.rs` 里的 `NORMALIZER_REVISION`；启动时值不同，库会重放原始报文。
5. 数据库用 WAL 和 `PRAGMA user_version` 迁移（`storage/mod.rs` 的 `CURRENT_SCHEMA_VERSION`，步骤在 `storage/migrations.rs`）。迁移只能追加，已发布的 DDL 永不修改，因为用户的库是按当时的 DDL 建的。迁移前一定先拍一份快照。
6. 所有写库动作——同步、补拉、迁移、恢复、备份、重放、清理——都先拿跨进程写锁（`storage::write_lock`）。同步全程持有同步租约，写锁只在落库那几段拿，绝不跨网络请求持有。只读路径用 `Database::open_read_only`。
7. 抓取、解析、写入三个阶段按数据流分别记在 `stream_provenance`，供数据健康页和 MCP 的 `get_data_health` 使用。

## 关掉窗口之后的同步

关掉主窗口，进程留在托盘；再次启动会唤醒它。自动同步按用户选的间隔跑（15、30 或 60 分钟）。窗口不可见时，后端每 60 秒看一次，到点就同步，失败后退避。没有系统级后台服务：从托盘退出就不再同步。

## 前端约定

- 缺失值显示 `—`、「未记录」或空状态，绝不显示 `0`。
- 格式化时间前先检查 `Date.getTime()`。
- 用 `src/styles/tokens.css` 里的 token，组件不按主题分支。见 [UI 规范](ui-guidelines.zh-CN.md)。
- 后端从不按界面语言出文案。它返回稳定的码（错误用 `err.*`，其他文字用 `ui.*`），中文原文只是兜底；界面按码渲染，`i18n/backendText.ts` 挡住中文兜底流到其他语言。新的错误码要在 `src/i18n/errors.ts` 补文案，`npm run i18n:check` 会查。
- 中文、英文、西班牙语文案放在组件旁的 `*.i18n.ts` 里（`defineMessages(zh, en, es)`），其余十种语言在 `src/i18n/locales/`。

## 保护用户数据的规矩

- 不编造数据：没有采样就不画曲线，没有轨迹就不画地图。
- 云端同步时间和健康样本时间分开；重新解析本地数据不改云端同步时间。
- 不要把令牌、完整请求头、HAR、精确 GPS 或原始健康报文写进日志、测试输出或提交。
- REST 只读，永不返回凭据。桌面端只监听 `127.0.0.1`，没有任何设置能改；只有无头版 `zeppbridge-cli serve` 可由用户显式指定监听地址，且必须带拉取 token；传输加密交给反向代理或容器内部网络。
- 2.x 的局域网抓包方案（代理、用户 CA、`start_capture` 一类命令）已经移除，不会再加回来。
