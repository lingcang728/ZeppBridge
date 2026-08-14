# ZeppBridge 开发与门禁

本文面向需要修改代码、运行测试或生成 Windows 安装包的人。产品入口请先看项目 [README](../../README.md)；连接流程请看 [连接指南](../guides/connection.md)。

## 环境与目录

- Windows 11（当前交付目标）
- Node.js 18+、npm
- Rust 工具链（`cargo`、Windows MSVC build tools）
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
```

`dist` 是构建输出，不是源码真相。改动 `src/` 后必须重新运行 `npm run build`，不要手工修生成的 bundle。

### Tauri 开发与生产构建

```powershell
npm run tauri dev
npm run tauri build
.\scripts\windows\start-dev.bat
.\scripts\windows\build.bat
```

`scripts\windows\build.bat` 会先执行 `cargo metadata` 读取 `target_directory`，检查生成的 NSIS/MSI，再复制到项目根目录的 `release\`。日常只认 `release\`；不要删除仓库里的 `src-tauri/target/` 以外、仅作本机缓存的 Cargo 目录。

安装包当前在 `src-tauri/tauri.conf.json` 声明目标 `nsis` 和 `msi`。配置存在不等于已签名发布；当前没有签名、自动更新或干净 Windows VM 的验收声明。

### Rust 检查与测试

```powershell
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo check --manifest-path src-tauri/Cargo.toml --locked --all-targets
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --locked --jobs 1
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
| `start_initial_sync` / `start_history_sync` | 按用户选择的 1–365 天补拉 | 默认 30 天；有进度事件和取消 |
| `start_incremental_sync` | 7 天 overlap 增量 | 仅已验证连接可用；顶栏/自动同步/托盘触发 |
| `cancel_sync` | 取消进行中的同步 | 原子标记，下一窗口停止 |
| `set_user_prefs` | 保存保留天数和历史补拉天数 | 1–365 |
| `get_app_status` | 连接、云端同步结果、数据流样本时间 | 启动恢复失败会保留可操作 warning |
| `get_health_overview` | 读取本地概览 | 没有数据时返回 `null` 字段，不填假零值 |
| `get_recent_sleep` / `get_recent_workouts` | 读取最近记录 | limit 在后端限制为 `1–500` |
| `get_sleep_detail` / `get_workout_detail` | 按稳定 ID 读取单条详情 | 找不到返回 `null`；不生成估算字段 |
| `get_workout_series` | 读取已解码的跑步 samples/route/pauses | 没有点则空数组，不编造 |
| `cleanup_old_data` | 按天清理旧数据 | `1–365` 天；跨 canonical 表并清理无引用 raw |
| `open_data_folder` | 在 Windows Explorer 打开 app data | 实际目录由 Tauri `app_data_dir` 决定 |

`LoginStatus.state` 只能是：`idle`、`waiting`、`extracting`、`verifying`、`connected`、`failed`。

已删除、不得再注册：`start_capture`、`get_capture_status`、`complete_capture_user_id`、`reuse_saved_auth`、`stop_capture`。

## 当前数据链路

1. `AuthManager` 校验 user ID、token 和区域地址，从系统凭据管理器读取 token。
2. 网页登录从 cookie 抽出凭据后，在 allow-list 区域 host 上调用与 `verify_auth` 相同的心率探测。
3. `ZeppConnector` 只构造 HTTPS origin，host 仅允许 `api-mifit*.zepp.com` / `api-mifit*.huami.com`，HTTP client 超时 30 秒，401/403/404/429/5xx 分类处理。
4. `DataFetcher` 为每个响应保留 stream/source key/raw payload。连接器有有限重试，但没有通用的 cursor 分页实现；运动 endpoint 使用 track ID 语义，当前窗口 helper 仍是保守范围。
5. `Normalizer` 只接受能识别的结构化数组/对象，并能解码当前真实 fixture 验证过的 Base64 `band_data` 睡眠/分钟心率结构；无法识别的编码仍只保留 raw 并标记 `unverified`。
6. `Database` 使用 WAL、外键和 schema migration（当前版本 1→2）；表达式唯一索引处理 `NULL device_id`，canonical 行保留 `raw_record_id`。
7. `SyncManager` 用 run lock 防止并发同步；核心流失败时 `success=false`，可选流显示 `unavailable`/`unverified`，成功后再做 retention。

## 前端开发约定

- 页面通过 `tauriApi` / `backend` 调用 command，不直接访问 Zepp。
- 空值显示 `—`、`未记录` 或明确的空状态；不要把缺失数据变成 `0`。
- 时间格式化前检查 `Date.getTime()`；错误应保留可操作信息，不要静默吞掉字符串。
- 使用 `App.vue` 里的主题变量、`focus-visible`、语义元素、ARIA 和最小 44px 触控区域；移动端断点目前以 760px 为主。
- `index.html` 的语言为 `zh-CN`，标题为 `ZeppBridge · 健康数据`；当前没有把默认 Vite 图标当成产品 favicon 的验收证据。

## 推荐验收顺序

1. `npm run build`
2. `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check`
3. `cargo check --manifest-path src-tauri/Cargo.toml --locked --all-targets`
4. `cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings`
5. `cargo test --manifest-path src-tauri/Cargo.toml --locked --jobs 1`
6. `cmd.exe /d /c scripts\windows\build.bat`，记录 Cargo metadata 给出的实际 bundle 目录和 NSIS/MSI 文件。
7. 安装一个实际生成的包，启动窗口，确认产品名/标识、首次启动恢复、设置页网页登录 command。

第 6–7 步是用户真正会打开的交付面，不能以源码检查替代。真实 Zepp 网页登录以及多区域、多设备数据仍需按环境分别验证。

## 变更边界

- REST/MCP 尚未实现；不要在文档或 UI 中把它们写成现有 command。
- 不要恢复局域网 MITM、用户 CA、Wi-Fi 代理教程或 `start_capture` 一类 command。
- 应用启动后同步一次；关闭主窗口后进程留在托盘，并每 15 分钟检查。只有从托盘退出或结束进程后同步才会停止；当前没有系统级后台服务。
- GPS/路线、逐点训练样本及未覆盖的专有指标，仍需取得合法、脱敏的真实响应后再从 `unverified` 提升。
- 不要把 token、完整请求头、HAR、精确 GPS 或健康 raw payload 写入日志、测试输出或提交。

架构边界见 [架构摘要](../reference/architecture.md)，安全边界见 [安全与隐私](../reference/security-and-privacy.md)。
