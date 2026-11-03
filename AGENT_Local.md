# 本地工作交接：Linux 桌面、Arch 打包与凭证恢复

更新时间：2026-10-21（主要实现与验证发生于 2026-10-17 至 2026-10-19）。

本文件记录本次会话的工作和本机情况，供下一位接手者阅读；仓库规则仍以 `AGENTS.md` 和用户指令为准。不要把“代码已完成”“本机构建通过”和“用户已验证完整功能”混为一谈。

## 当前状态与约束

- 仓库：`/home/jaxtsai/AgentWorkSpaces/ZeppBridge`。
- 当前分支：`fix/linux-webkit-rendering`，按用户要求为本轮 Linux 修复创建。修改仍在工作区，尚未提交、推送、创建 PR 或发版。
- 开发基线为 `main`；不要从冻结的 `v3` 分支继续开发或合并。推送、打标签、发版必须先获得用户同意。
- `git status` 中同时包含本轮多个任务的修改，不能整体丢弃或只按最后一个任务理解。
- `src-tauri/icons/128x128.png`、`Square310x310Logo.png`、`icon.icns` 在本轮工作开始时就有修改，不应当作本轮新增改动回滚。
- `release/data` 是真实用户库，不得修改或删除。`~/.local/share/zeppbridge/data/` 同样是真实用户数据，绝不能用于测试。
- 多语言任务须按 `AGENTS.md` 为每种语言单独分配 Agent。本次新增文案已由各语言 Agent 分别处理；文档同步了中英文。

## 1. Node/npm 与开发入口

- 用户最初在系统 Node/npm 下执行 `npm ci` 失败；当时系统为 Node 26/npm 12，锁文件有 `registry.npmmirror.com` 的 tarball 地址，与 npm 的远端地址策略产生冲突。切换到 nvm 的 Node 22 后成功。
- 根目录 `.nvmrc` 为 Node 22；本轮命令主要使用 nvm Node `22.23.3`。后续先执行 `nvm use`，不要无理由升级依赖或整体重写锁文件。
- `npm run dev` 的 `/` 是介绍网站，并非桌面应用。
- 浏览器应用预览：`http://localhost:1420/?app-preview`；演示数据：`http://localhost:1420/?demo=1&lang=zh-CN`。
- 原生功能使用 `npm run tauri dev`。浏览器预览不能验证原生凭证存储或完整登录流程。

## 2. Linux 白屏、卡顿与 WebKit 渲染策略

### 发现与实现

- 本机当时为 Arch 系列、AMD、Niri/Wayland、WebKitGTK `2.54.1`、Wayland `1.26.0`。
- 旧代码在 Linux 全局设置 `WEBKIT_DISABLE_DMABUF_RENDERER=1`。本机关闭 DMABUF 后执行 View Transition 快照动效，会使 WebKit 子进程在 `FrameRenderer::graphicsLayerFactory()` 中止，表现为白屏、卡顿。
- 最终参考 Clash Verge Rev 的硬件／会话检测策略；没有保留曾讨论过的“仅按 WebKit 版本号决定回退”的方案。
- 新增 `src-tauri/src/linux_rendering.rs`：仅在检测到 NVIDIA 或 Wayland client `<=1.23.0` 时自动禁用 DMABUF；版本未知时不强制回退；显式环境变量值优先。
- 保留 AppImage 的禁用合成兼容措施。任一禁用变量为非 `0` 时，注入 `window.__ZB_DISABLE_VIEW_TRANSITIONS__`，跳过相关快照动效。
- 前端新增 `src/lib/motion/viewTransitions.ts`，主题与语言切换调用统一保护逻辑；另有主题回归测试。
- 不强制 `GDK_BACKEND=x11`，避免破坏没有 XWayland 的环境。

关键文件：`src-tauri/src/lib.rs`、`src-tauri/src/linux_rendering.rs`、`src/composables/useTheme.ts`、`src/lib/motion/ashSwitch.ts`、`src/lib/motion/viewTransitions.ts`。

### 用户验证结果

用户曾用 `packaging/arch/PKGBUILD` 直接构建远端 `main`，安装后再次白屏。核查发现该源码没有包含当前工作区修复，仍然全局关闭 DMABUF。用户随后安装本地快照构建的包，明确反馈之前的白屏问题已修复。

注意：原始 PKGBUILD 的远端源码与本地工作区是两回事；在修复合入远端 `main` 前，直接 `makepkg -si` 不会带上未提交修改。

## 3. Vite 外部 CSS 冷加载错误

截图中的错误为 `[plugin:vite:vue] Cannot read properties of undefined (reading 'scoped')`，出现在 `BodyStatus.css`。

- 定位到 `@vitejs/plugin-vue` `6.0.8` 对外部样式的临时 descriptor 处理：仅包含 `styles[0]`，且冷加载时可能缺少 scoped id。
- 新增 `scripts/dev/patch-vue-external-styles.mjs`，由 `postinstall` 调用；补丁幂等，并校验版本和目标代码锚点，避免升级后静默错误打补丁。
- 插件版本固定为 `6.0.8`，同步修改 `package.json` 和锁文件。
- 新增 `tests/dev-styles.test.mjs`，启动真实 Vite 服务，对所有 Vue 外部样式做冷请求和 scoped 属性检查；当时 60 个请求通过。加入 `test:dev` 和 `test:functions`。
- 没有把所有外部 CSS 改成内联。

应用补丁后需完全停止并重启已有 Vite 进程。

## 4. deb/rpm/AppImage 排查与 Arch/AUR 配方

### 原 Linux 打包失败原因

- `deb`、`rpm` 构建成功；失败集中在 AppImage 工具链。
- 旧 linuxdeploy strip 不支持宿主 ELF 的 `.relr.dyn`，报未知 section type `0x13`。
- 设置 `NO_STRIP=true` 可越过该处，但 GTK 插件接着要求不存在的旧式 `/usr/lib/gdk-pixbuf-2.0/2.10.0` loader 目录；本机新版 gdk-pixbuf 已使用 Glycin。
- 没有修改系统库、伪造 loader 目录或替换系统依赖。可分发 AppImage 建议使用已有 Debian Bookworm 构建容器；本机无 Docker/Podman，容器构建未验证。

### 新增 Arch 支持

- `packaging/arch/PKGBUILD`：`zeppbridge-git`，当前面向 `x86_64`，默认拉取远端 `main`。
- `packaging/arch/.SRCINFO`：由 `makepkg --printsrcinfo` 生成。
- `packaging/arch/build-local.sh`：对当前工作区的允许列表源码做本地 Git 快照，包含未提交修改；独立缓存中调用 makepkg，产物写到根目录 `release-arch/`。
- 原生包包含桌面程序、CLI、MCP、桌面入口、AppStream 元数据、图标、MIT 和字体许可证；使用系统 GTK/WebKit，不经过 AppImage 工具。
- 准备阶段安装锁定 npm 依赖、显式运行项目 postinstall、fetch Rust 依赖；构建阶段使用冻结、离线 Rust 依赖。
- 快照不复制用户数据库、`node_modules` 或 Cargo 构建缓存。不要为了打包把整个仓库／用户目录复制进去。
- 配方尚未发布到 AUR，不能声称可通过 `yay -S zeppbridge-git` 安装。

当前工作区重新打包并安装：

```bash
nvm use
./packaging/arch/build-local.sh --install
```

仅构建时省略 `--install`。需要安装缺失系统依赖时，用户可显式加 `--syncdeps`。原始 `cd packaging/arch && makepkg -si` 构建远端已提交源码。

2026-10-21 核查时，`release-arch/` 已有以下三个约 24 MB 的本地包：

- `zeppbridge-git-3.0.1.r1.gc0ce5f5-1-x86_64.pkg.tar.zst`：本轮最初完整构建并检查的包，不包含后续全部凭证恢复修改。
- `zeppbridge-git-3.0.1.r1.gec41a4f-1-x86_64.pkg.tar.zst`。
- `zeppbridge-git-3.0.1.r1.gbf13441-1-x86_64.pkg.tar.zst`。

后两个包由之后的本地操作产生，不能仅凭文件名或时间断言其覆盖哪些修改或已通过完整功能验证。不要用通配符一次安装这三个同名包，选择准确文件名或使用构建脚本的 `--install`。

## 5. 官方授权和高级数据的凭证恢复选择器

### 本机问题

官方授权成功，但令牌保存失败。检查时 D-Bus 的 `org.freedesktop.secrets` 由 KWallet 的 `ksecretd` 提供，但 collection 列表为空，默认 alias 返回 `/`，即没有可用的默认钱包。

不是每位用户都必须安装 KWallet。系统可使用 GNOME Keyring、KWallet 或其他 Secret Service 提供者；本机缺少的是创建／设置并解锁默认钱包的初始化步骤。`kwalletmanager` 是完成该步骤的图形管理工具。

### 已实现行为

- 官方授权、**高级数据网页登录**和**高级数据手动 App Token**在凭证存储失败后均可显示恢复选择面板。
- 默认选择修复系统凭证存储，提供平台对应的指引，修复后重试保存。
- JSON 为显式选择，必须勾选明文存储同意；不因密钥环失败自动降级。
- Unix 文件后端使用数据目录的 `credentials.json`，权限 `0600`，目录 `0700`；同一用户运行的程序仍可读到令牌。Windows 不开放此 Unix 文件后端选项。
- 显式启动环境配置优先；与文件模式冲突时，UI 和后端均不允许切换。
- 失败后的凭证仅在后端内存中保留最多 10 分钟。令牌不进入 IPC 状态、界面返回值或日志。取消、新登录、重新提交手动凭证、退出或过期后不能复用。
- **10 分钟只针对尚未保存成功的临时凭证**，不限制保存成功后的登录有效期；正常续期仍遵循官方令牌规则。
- 官方授权与高级数据保留各自的会话／代次保护；恢复保存前重新核对账号与数据库归属。
- 已验证的高级数据网页登录恢复后安装同步器，进入已连接状态；手动令牌恢复后仅为已配置，保留原有验证步骤，不自动冒充已验证或启动同步。
- 手动保存失败进入恢复面板时清空前端令牌输入框，后续重试只引用后端临时凭证。
- 生产 `AuthManager` 在每次操作开始时解析有效存储后端，并在该操作内保持一致，解决切到 JSON 后高级数据仍沿用旧密钥环、必须重启的问题。测试注入的后端仍保持固定。
- JSON 文件修改增加 `credentials.json.lock`／`flock` 保护，序列化 read-modify-write，避免官方／高级数据或 CLI/MCP 并发写入时丢失另一条令牌。锁文件本身不含令牌，不要因文件仍存在就手动删除锁。

### 主要文件

- 共用类型与规则：`src-tauri/src/commands/credential_recovery.rs`。
- 官方恢复：`src-tauri/src/commands/official.rs`、`src-tauri/src/commands/official/recovery.rs`。
- 高级数据恢复：`src-tauri/src/commands/login/recovery.rs`、`login/mod.rs`、`login/poll.rs`、`commands/auth.rs`。
- 后端选择／文件写入：`src-tauri/crates/core/src/auth/mod.rs`、`auth/backends.rs`。
- 会话与 IPC：`src-tauri/src/app_state.rs`、`src-tauri/src/ipc_types.rs`。
- UI：`src/components/CredentialRecovery.vue`、同名 `.i18n.ts`、`useOfficialAuth.ts`、`useAuthFlow.ts`、设置页 `AccountSection.vue`／`AuthSection.vue`。
- IPC 命令：`recover_official_credentials`、`recover_advanced_credentials`，已登记到 Tauri、bridge 和 demo runtime。

## 6. 数据迁移测试事故与恢复记录：接手前必须知道

2026-10-19 新增高级数据测试时，错误调用了生产 `AppState::new(temp_dir)`。该入口会执行 `paths::relocate_legacy_data`，访问真实 XDG 数据目录，并将真实数据库／凭证迁移到测试目录。测试因此出现账号不匹配和预期外文件。这不是正常的测试结果，而是测试隔离失误。

已完成恢复：

1. 停止该轮测试，并暂停当时运行的应用。
2. 从应用仍持有的文件描述符保全数据库、WAL、SHM；在副本上使用 SQLite backup 合并 WAL，执行完整性检查。
3. 恢复 `~/.local/share/zeppbridge/data/zepp.db` 及 `credentials.json`；凭证与被迁移文件逐字节核对一致，SQLite `quick_check` 为 `ok`。
4. 关闭持有已删除文件描述符的旧进程，再启动已安装应用。仅移除了此次失败测试创建的三个临时目录。

受保护的恢复快照仍位于：

```text
/home/jaxtsai/.local/state/zeppbridge-recovery/20261019-144033/
```

该目录包含真实数据库及凭证，**不得提交、上传、打印内容或拿来做测试，也不要擅自删除**。本交接文件没有记录任何实际令牌或健康记录。

已新增 `AppState::isolated_test_state`（仅 `cfg(all(test, unix))`）：只创建指定的新测试目录和空库，不执行生产迁移。新增恢复测试全部改用此入口。

**绝不要再次用 `AppState::new(temp_dir)` 作为隔离测试工厂。也不要以为设置临时数据目录就能阻止生产迁移入口访问真实 XDG 路径。**

## 7. 最近验证结果及证据

以下为 2026-10-19 记录，不表示未来修改后仍自动有效：

- Rust：`cargo fmt --all -- --check`、workspace/all-targets `cargo check`、`cargo clippy -- -D warnings` 通过；最后 workspace 测试日志汇总 823 passed、2 ignored、0 failed。
- 前端：`npm run build` 和类型检查通过；Vitest 694 项通过，109 个测试文件。
- `npm run test:functions`：45 项通过，包括外部 CSS 冷加载检查。
- `npm run i18n:check`、`docs:check`、`budget:check`、`version:check` 通过。
- 图标验证曾因系统 Python 缺 Pillow 无法运行；使用隔离依赖命令 `uv run --no-project --with pillow python scripts/icon/verify-icons.py` 后通过，没有为此全局安装依赖。
- WebKitGTK 原生测试窗口验证了选择器默认值、明文同意、禁止无同意提交、独立 radio 分组、保存／取消回调等。临时 HTML 已删除，测试用 Vite 已停止。
- Arch 最初的原生包实际构建成功，并检查了三个二进制、动态库解析、桌面入口、许可证及不含用户数据。未验证洁净 chroot。
- **凭证恢复的完整真实官方／高级数据登录流程，不能用模拟测试或打包成功替代验证。** 用户安装本地包后明确确认的是先前白屏修复；后续功能是否已完整复测，应继续向用户确认实际结果。

关键测试文件：

- `src-tauri/crates/core/tests/live_credential_store.rs`：不重启切换存储、重启读取、删除高级凭证时保留官方条目、并发保存不丢条目。
- `src-tauri/src/commands/login/recovery.rs` 内测试：手动与已验证网页登录恢复、过期／取消、不暴露令牌、非存储错误不提供降级。
- `src-tauri/src/commands/official/recovery.rs` 内测试：授权代次、有效期、显式环境配置、文件权限与不自动降级。
- `src/composables/settings/__tests__/credentialRecovery.test.ts`、`advancedCredentialRecovery.test.ts`。
- `tests/dev-styles.test.mjs`、`src/composables/__tests__/useTheme.test.ts`。

主要日志（`/tmp` 文件可能随系统清理消失）：

```text
/tmp/zeppbridge-advanced-rust-tests.log
/tmp/zeppbridge-advanced-clippy-final.log
/tmp/zeppbridge-advanced-vitest.log
/tmp/zeppbridge-advanced-build.log
/tmp/zeppbridge-advanced-functions.log
/tmp/zeppbridge-advanced-ui.log
/tmp/zeppbridge-advanced-i18n.log
/tmp/zeppbridge-advanced-budget.log
/tmp/zeppbridge-arch-build.log
/tmp/zeppbridge-appimage-bundle.log
/tmp/zeppbridge-appimage-no-strip.log
```

## 接手后的建议顺序

1. 阅读本文件和 `AGENTS.md`，核对 `git status`，保护真实数据及已有图标修改。
2. 若用户报告新故障，先确认安装包是否来自本地工作区或远端 `main`，以及它是否包含最新修改；不要立即推断渲染修复失效。
3. 对最新工作区重打包后，验证真实高级数据登录、密钥环修复后重试、JSON 保存后立即使用及重启读取。不要为了复现故障读取或输出实际令牌。
4. 如需继续修改，使用隔离测试状态和新建测试库，按变更范围运行门禁。本机没有 `pwsh`，Rust 门禁使用 `scripts/v3-gates.ps1` 所列命令的 Linux 等价调用。
5. 用户要求提交／PR 时再整理多个任务的 diff 与验证说明；推送、标签、发版先征得同意。
