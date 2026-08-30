# ZeppBridge 开发与门禁

本文面向需要修改代码、运行测试或生成安装包（Windows 与 macOS）的人。产品入口请先看项目 [README](../../README.md)；连接流程请看 [连接指南](../guides/connection.md)。

## 环境与目录

- Windows 11（主力交付目标）或 macOS 11+（Apple Silicon）
- Node.js 18+、npm
- Rust 工具链（Windows 需 MSVC build tools；macOS 需 Xcode Command Line Tools）
- 使用项目锁文件通过 `npm ci` 安装前端依赖；当前门禁不依赖 Playwright。

进入仓库后先检查工具：

```powershell
where.exe node
where.exe npm
where.exe cargo
```

安装前端依赖：

```powershell
npm ci
```

Rust 依赖由 Cargo 按 `src-tauri/Cargo.toml` 解析。认证和真实数据测试需要 Windows Credential Manager、网络和真实 Zepp 账号；当前交付没有这些 live fixture。

## 日常命令

### 前端

```powershell
npm run dev        # 只启动 Vite，适合查看静态 UI
npm run build      # vue-tsc --noEmit && vite build
npm run build:web  # 仅 vite build，跳过 vue-tsc
npm run preview    # 预览 dist（不会连接账户数据）
npm test           # Vitest：src/lib 的纯函数层
npm run version:check   # 七处版本号是否一致
npm run budget:check    # 首屏体积预算（需要先 build）
```

`npm test` 集中在一条规则上：**缺失不能被显示成 0**。「0 分钟睡眠」的卡片比「—」危险得多，用户会拿它当真实读数。刻意不做组件快照——它会在每次调样式时红掉，于是被习惯性 `-u` 掉，最后既挡不住回归也没人再看。

`npm run budget:check` 量的是「为了看到第一屏必须先加载多少」（入口脚本 + `modulepreload` 的 chunk + 入口样式），不是 `dist` 总大小。基线和上限在 `bundle-budget.json`；确认某次增长值得之后用 `npm run budget:update` 刷新，并在提交里说明原因。

`dist` 是构建输出，不是源码真相。改动 `src/` 后必须重新运行 `npm run build`，不要手工修生成的 bundle。

### Tauri 开发与生产构建

```powershell
npm run tauri dev
npm run tauri build
.\scripts\windows\start-dev.bat
.\scripts\windows\build.bat
```

`npm run package:release` 会跑完整 `tauri build`，成功后再调用 `scripts\windows\publish-local.ps1`：

- 编译缓存在 `G:\build_cache\cargo-target`（`~/.cargo/config.toml` 的 `target-dir`），**不是**用户入口
- 把独立 exe、当前版本 NSIS / MSI **覆盖**到项目根目录的 `release\`（本盘给用户双击/分发的安装包）
- 删掉 `release\` 以及 Cargo bundle 目录里**上一版本**的安装包，只留当前版本
- 把桌面和「开始」菜单快捷方式、`App Paths` 指到 `release\ZeppBridge.exe`

日常只认 `release\ZeppBridge.exe`。不要跑 NSIS / MSI 往 `LocalAppData` 再装一份，否则 Windows 搜索会打开旧入口。若快捷方式被安装包改走了，跑 `npm run publish:local` 即可拨回。不要删除仅作本机缓存的 `G:\build_cache\cargo-target`。

### macOS 构建

```bash
npm run build:mac   # scripts/macos/build-release.sh：前端 + 门禁 + tauri build（app,dmg）
```

无 `TAURI_SIGNING_PRIVATE_KEY` 时脚本自动跳过 updater 产物，便于本地验证构建。产物在 `src-tauri/target/release/bundle/`。

安装包当前在 `src-tauri/tauri.conf.json` 声明目标 `nsis` 和 `msi`（macOS 侧由 `--bundles app,dmg` 指定）。NSIS updater 产物与 `latest.json` 已使用 Tauri updater 密钥签名，并由 GitHub Release 提供自动更新；安装包本身仍没有受 Windows 信任的 Authenticode 证书，也没有干净 Windows VM 的验收声明。

### Rust 检查与测试

```powershell
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo check --manifest-path src-tauri/Cargo.toml --workspace --locked --all-targets
cargo clippy --manifest-path src-tauri/Cargo.toml --workspace --locked --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --workspace --locked --jobs 1
```

`--workspace` 不能省：仓库是一个 cargo workspace，成员有 `zeppbridge`（Tauri 应用）、`zeppbridge-core`（共享核心）、`zeppbridge-cli` 和 `zeppbridge-mcp`。漏掉它就只检查了应用那一个包。

单独构建两个附带程序并打成分发包：

```powershell
cargo build --release --manifest-path src-tauri/Cargo.toml -p zeppbridge-cli -p zeppbridge-mcp
npm run tools:package   # 产出 release\zeppbridge-tools-<版本>-<平台>.zip（含 SHA256SUMS）
```

Rust library 测试只保留会挡住假成功、丢数据、错文案的门禁：凭据不落盘、host 校验、同步 outcome、REM 不编造、保留天数边界、去重、登录 cookie 解析。不要为了数量再堆冗余用例。具体数量以当前 `cargo test` 输出为准。

## 当前 command 契约

Tauri command 在 `src-tauri/src/lib.rs` 注册，前端封装在 `src/lib/bridge/`（`useTauriApi` 再导出）：

| command | 用途 | 关键边界 |
| --- | --- | --- |
| `start_web_login` | 打开 Zepp 登录窗口并开始轮询 | 返回 `LoginStatus`；事件 `login://status` |
| `cancel_web_login` | 关闭登录窗口并作废 epoch | 状态回到 `idle` |
| `get_login_status` | 读取当前登录状态 | `{ state, message, page_url }` |
| `save_auth` | 保存认证元数据和 token | token 进入 Windows Credential Manager；host 由连接器再次校验 |
| `verify_auth` | 最近两小时真实心率请求 | 只接受结构化 JSON 和明确成功代码；401/403 需要重新认证 |
| `clear_auth` | 作废登录会话并清除认证 | 保留健康数据库 |
| `import_from_har` | 从用户自己导出的 HAR 里抽取凭据 | 必须含 `api-mifit*` 请求且带 `apptoken`；随后走 `save_auth` 同一条保存路径 |
| `manual_auth` | 手动输入 token / user id / region host | 只是 `save_auth` 的包装，边界完全相同 |
| `start_initial_sync` / `start_history_sync` | 按用户选择的 1–365 天补拉 | 默认 30 天；有进度事件和取消 |
| `start_incremental_sync` | 7 天 overlap 增量 | 仅已验证连接可用；顶栏/自动同步/托盘触发 |
| `cancel_sync` | 取消进行中的同步 | 原子标记，下一窗口停止 |
| `set_user_prefs` | 保存保留天数和历史补拉天数 | 1–365 |
| `get_app_status` | 连接、云端同步结果、数据流样本时间 | 启动恢复失败会保留可操作 warning |
| `get_health_overview` | 读取本地概览 | 没有数据时返回 `null` 字段，不填假零值 |
| `get_recent_sleep` / `get_recent_workouts` | 读取最近记录 | limit 在后端限制为 `1–500` |
| `get_sleep_detail` / `get_workout_detail` | 按稳定 ID 读取单条详情 | 找不到返回 `null`；不生成估算字段 |
| `get_workout_series` | 读取已解码的跑步 samples/route/pauses | 没有点则空数组，不编造 |
| `get_heart_rate_series` / `get_training_load_series` | 概览折线用的时序点 | 按小时 / 天读本地库；没有样本就是空数组 |
| `get_metric_series` | `/body` 与 `/training` 的按天曲线 | 只应答 `SERIES_METRICS` 白名单里的指标名，别的直接跳过；返回 `days_with_data`，缺的天不补 0 |
| `get_training_balance` | 7 天 / 28 天负荷与急慢比 | 与导出 `training_load_balance` 同一个函数；chronic 窗口不足 21 天时 ratio 为 `null` |
| `get_heart_rate_zones` | 心率区间选择器的全部状态 | 基准全部实测并带出处与测量日期；未选算法时 `report` 为 `null` |
| `set_heart_rate_zone_preference` | 记录用户选的算法与基准 | 四个槽位都可为 `null`——「还没决定」必须能存回去 |
| `get_device_profile` / `get_device_profiles` | 读取识别到的设备档案 | 来自编译进二进制的 `catalog.json`；认不出的设备不猜型号 |
| `get_storage_estimate` | 估算本地库体积与可清理量 | 只读，按天计算 |
| `reprocess_local_data` | 用当前解析器重放本地 raw | 不触网，不改云端同步时间；返回各 stream 重放条数 |
| `get_export_json` | 生成导出 JSON 字符串 | 只按 `ExportSelection` 取本地数据 |
| `save_json_export` | 另存导出文件 | 路径经 `validate_export_path(.., "json")` 校验 |
| `save_csv_export` | 另存长表 CSV（汇总） | 复用同一份标准化 JSON 再转换；`record_count` 是数据行数；不含逐点序列与轨迹 |
| `save_gpx_export` | 另存 GPX 1.1 轨迹 | 只有解码出 route 的运动才成轨；一个点都没有时报错而不是写空文件；心率仅在时间戳完全一致时写入 |
| `publish_ai_export` | 更新本机 `exports/zeppbridge-ai-feed.json` | 固定路径，原子写 |
| `prepare_ai_handoff` | 生成交给外部 AI 的脱敏数据包 | 复用同一 export builder 后再做递归脱敏；> 2 MiB 改写桌面文件；精确轨迹需显式开启 |
| `get_local_api_status` | 读取本机 REST API 启动状态与固定地址 | 端口冲突不会阻止桌面 App 启动 |
| `cleanup_old_data` | 按天清理旧数据 | `1–365` 天；跨 canonical 表并清理无引用 raw |
| `open_data_folder` | 在 Windows Explorer 打开安装目录旁的 `data/` | 不再使用 `%APPDATA%` |
| `is_portable_update` / `launch_migrated_install` | 判断当前是否为非安装版入口，并在更新后拉起 `%LOCALAPPDATA%\ZeppBridge\ZeppBridge.exe` | 仅 Windows；找不到安装版时报错而不是静默退出 |

`LoginStatus.state` 只能是：`idle`、`waiting`、`extracting`、`verifying`、`connected`、`failed`。

`SyncReport.outcome` 只能是：`updated`、`no_new_data`、`partial`、`failed`、`cancelled`、`deferred`。`deferred` 不是失败——启动时的原始报文重放正在批量写库，本次同步主动让路，前端一分钟后自动重试，横幅用中性灰而不是红色。

已删除、不得再注册：`start_capture`、`get_capture_status`、`complete_capture_user_id`、`reuse_saved_auth`、`stop_capture`。

## 本机 REST API

桌面进程启动时由 `src-tauri/src/local_api.rs` 绑定 `127.0.0.1:43921`。当前公开两个只读 GET 路由：

| 路由 | 说明 |
| --- | --- |
| `/health` | 服务状态和应用版本 |
| `/workouts/{id}/series` | 复用 `Database::get_workout_series()`，返回标准化 `WorkoutSeries` JSON；未知 ID 返回 404 |

API 不监听 `0.0.0.0`、不提供 CORS、响应 `Cache-Control: no-store`，也不读取或返回认证信息。端口被占用时桌面 App 继续启动，设置页通过 `get_local_api_status` 显示错误。测试必须覆盖路由、404/405、编码 ID、泛化 500 错误以及无 CORS 边界。

## 当前数据链路

1. `AuthManager` 校验 user ID、token 和区域地址，从系统凭据管理器读取 token。
2. 网页登录从 cookie 抽出凭据后，在 allow-list 区域 host 上调用与 `verify_auth` 相同的心率探测。
3. `ZeppConnector` 只构造 HTTPS origin，host 仅允许 `api-mifit*.zepp.com` / `api-mifit*.huami.com`，HTTP client 超时 30 秒，401/403/404/429/5xx 分类处理。
4. `DataFetcher` 为每个响应保留 stream/source key/raw payload。连接器有有限重试，但没有通用的 cursor 分页实现；运动 endpoint 使用 track ID 语义，当前窗口 helper 仍是保守范围。
5. `Normalizer` 只接受能识别的结构化数组/对象，并能解码当前真实 fixture 验证过的 Base64 `band_data` 睡眠/分钟心率结构；无法识别的编码仍只保留 raw 并标记 `unverified`。
6. `Database` 使用 WAL、外键和 schema migration（`PRAGMA user_version`，当前为 **15**；迁移步骤只能追加，不要改已有 DDL——已发布的库是按当时的 DDL 建的）；表达式唯一索引处理 `NULL device_id`，canonical 行保留 `raw_record_id`。迁移在拿到跨进程写锁并生成升级前备份之后才开始。
7. `SyncManager` 用 run lock 防止进程内并发，并额外获取跨进程写锁，因此桌面应用和 CLI 不会同时写同一个库；核心流失败时 `success=false`，可选流显示 `unavailable`/`unverified`，成功后再做 retention（长期归档开启时跳过清理）。
8. 抓取、解析、写入三个阶段分别记进 `stream_provenance`，失败带稳定的机器可读类别，供数据健康页和 MCP 的 `get_data_health` 使用。

## 前端开发约定

- 页面通过 `tauriApi` / `backend` 调用 command，不直接访问 Zepp。
- 空值显示 `—`、`未记录` 或明确的空状态；不要把缺失数据变成 `0`。
- 时间格式化前检查 `Date.getTime()`；错误应保留可操作信息，不要静默吞掉字符串。
- 使用 `App.vue` `:root` 里的设计 token（唯一来源，界面统一深色，不做浅色分支）、`focus-visible`、语义元素、ARIA 和最小 44px 触控区域；移动端断点目前以 760px 为主。详见 [UI 约束](ui-guidelines.md)。
- `index.html` 的语言为 `zh-CN`，标题为 `ZeppBridge · 健康数据`；当前没有把默认 Vite 图标当成产品 favicon 的验收证据。

## 推荐验收顺序

1. `npm run build`
2. `npm test`
3. `npm run version:check` 与 `npm run budget:check`
4. `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check`
5. `cargo check --manifest-path src-tauri/Cargo.toml --workspace --locked --all-targets`
6. `cargo clippy --manifest-path src-tauri/Cargo.toml --workspace --locked --all-targets -- -D warnings`
7. `cargo test --manifest-path src-tauri/Cargo.toml --workspace --locked --jobs 1`
8. `npm run package:release`（或 `cmd.exe /d /c scripts\windows\build.bat`），确认 `release\ZeppBridge.exe` 和当前版本 NSIS/MSI 已更新，旧版本安装包已被删掉。
7. 双击桌面或开始菜单的 ZeppBridge 快捷方式，确认打开的是 `release\ZeppBridge.exe`；再确认产品名/标识、首次启动恢复、设置页网页登录 command。

第 6–7 步是用户真正会打开的交付面，不能以源码检查替代。真实 Zepp 网页登录以及多区域、多设备数据仍需按环境分别验证。

## 变更边界

- MCP 尚未实现；REST 仅限上述本机只读接口，不得扩展到局域网监听或返回凭据。
- 不要恢复局域网 MITM、用户 CA、Wi-Fi 代理教程或 `start_capture` 一类 command。
- 应用启动后同步一次；关闭主窗口后进程留在托盘，并每 15 分钟检查。再次启动会唤醒已有进程，不会创建第二个托盘图标。只有从托盘退出或结束进程后同步才会停止；当前没有系统级后台服务。
- GPS/路线、逐点训练样本及未覆盖的专有指标，仍需取得合法、脱敏的真实响应后再从 `unverified` 提升。
- 不要把 token、完整请求头、HAR、精确 GPS 或健康 raw payload 写入日志、测试输出或提交。

架构边界见 [架构摘要](../reference/architecture.md)，安全边界见 [安全与隐私](../reference/security-and-privacy.md)。
