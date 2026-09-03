# ZeppBridge 安全与隐私边界

[English](security-and-privacy.md)

本页说明当前实现中的数据流和清除范围。它不是「绝对安全」保证；安装包未签名，健康数据库默认明文，真实账号/区域行为也尚未完成 live 验证。

## 凭据

- app token 由 Windows Credential Manager 保存，服务名为 `com.zeppbridge.app`，账户名按 user ID 区分。
- `auth.json` 位于程序目录旁的 `data/`（`{exe_dir}/data`），只保存认证元数据（版本、user ID、区域 host、更新时间）；正常保存不会把 token 写入文件。不写入 `%APPDATA%`。
- 启动恢复会从元数据和凭据管理器重建同步 manager。凭据缺失或失效时，设置页显示需要重新认证，不把 token 放进状态响应。
- 网页登录在独立窗口内读取会话 cookie，解析出 user ID 与 app token 后立刻写入凭据管理器。`login://status` 只返回 `state`、`message`、`page_url`，不返回 token。
- token 仍然是敏感数据。不要记录、复制到 issue、提交到 Git、发送给第三方或公开分享。

## 网络与区域

- 同步不是离线功能：用户点击验证/同步后，ZeppBridge 会向用户允许的 Zepp 区域 host 发起 HTTPS 请求。
- 连接器只接受 `https://api-mifit*.zepp.com` 或 `https://api-mifit*.huami.com` 的 origin，不接受任意域名、路径、query、fragment、凭据或不受控端口。
- HTTP client 有 30 秒 timeout，并对 401/403、404、429/5xx 与其他非 2xx 做分类和有限重试。
- 登录窗口只允许导航到 `https://*.zepp.com` / `https://*.huami.com`（以及 `about`/`data`/`blob` 中间页）。区域探测只打 allow-list 上的 API origin。
- 当前没有局域网 HTTP 代理，也不安装系统或用户 CA。
- 本机 REST API 只绑定 `127.0.0.1:43921`，不监听局域网地址，不提供 CORS，只暴露只读健康探针和运动序列路由。**默认关闭**；用户在设置页开启后才会监听，且每个请求都要带 token（`zbk_` 前缀，比较用常量时间）。token 可随时轮换，轮换后旧 token 立即失效；关闭开关会释放端口。请求行、单条 header 与 header 总量都有上限，超长请求直接拒绝而不是读进内存。
- `zeppbridge-mcp` 只用 stdio，**不监听任何端口，也不发出任何网络请求**。它连库用 `PRAGMA query_only`，写操作在 SQLite 层就被拒绝，不依赖工具列表里恰好没有写操作。返回里没有 token、Cookie、完整账号，也没有本机绝对路径。
- `zeppbridge-cli` 只在 `sync` 时联网，走的是和桌面应用完全相同的连接器与 host allow-list。它不做登录，也不打印 token；`export --out` 只回显用户自己给的路径，不把它解析成绝对路径打印出来。

## 三种「导出」的边界不同

混淆它们会导致真实的隐私事故——把整库快照当成「导出给 AI 的数据」发出去，等于把全部原始报文交出去。

| | 内容 | 脱敏 | 谁能读 |
|---|---|---|---|
| **JSON / CSV / GPX** | 选中范围的标准化数据 | 无自动脱敏，由用户决定范围 | 任何工具 |
| **数据库快照** | 整个 `zepp.db`，含 raw 报文与 provenance | **无** | 只有 ZeppBridge |
| **AI 数据包** | 用户挑选的范围 | 自动移除认证字段、账户、设备、序列号与精确坐标 | 用户选的模型 |

快照留在本机 `data/backups/`，不会上传任何地方，也不加密——它和 `zepp.db` 一样是明文 SQLite。共用电脑请用各自独立的系统账户。

## 网页登录会话

1. `start_web_login` 递增 epoch、关闭旧登录窗、打开新窗，并把状态设为 `waiting`。
2. 后台轮询 cookie；解析成功后状态变为 `extracting` → `verifying`，并行探测区域 host。
3. 验证成功后保存凭据、初始化同步 manager，状态变为 `connected` 并关闭登录窗。
4. `cancel_web_login`、关闭登录窗或新的 `start_web_login` 会使旧 epoch 失效；超时 15 分钟记为 `failed`。
5. 「清除认证」同时作废登录 epoch，并把登录状态重置为 `idle`。

登录窗口能力仅覆盖主窗口与 `zepp-login`。不要把登录 URL 分享给不可信的人。

## 健康数据库

- 数据库和 raw payload 位于程序目录旁的 `data/zepp.db`，默认 SQLite 明文；当前没有整库加密或远程备份。WebView 缓存在 `data/webview`。
- SQLite 启用 WAL、外键、migration、去重和 raw provenance。canonical 健康行可回指对应 raw 记录，便于解释来源。
- retention 可由用户在 1–365 天内选择，默认 365 天；清理依据健康记录时间，成功同步后删除旧 canonical 和无引用 raw。清理不可撤销，请先备份。
- `band_data` 的编码/压缩 payload 可能只保留 raw 并标记 `unverified`；程序不将未知内容伪造成睡眠阶段。

## 外部 AI 交接

Explore 的「发送到 AI」先通过本地 `prepare_ai_handoff` 生成当前日期范围和数据类型的结构化导出，再递归移除认证字段（token、cookie、authorization、credential 等）以及账户、设备、序列号和睡眠/训练记录标识。默认完全删除 `route`、纬度/经度和其他精确坐标；只有用户主动打开「包含精确 GPS 路线」并通过第二次确认后才保留这些字段。认证信息始终不会导出，`redactions` 和 `metadata` 会记录本次策略。

小于等于 2 MiB 的脱敏 JSON 会和提示词一起放进剪贴板；超过阈值时只把提示词和「请上传已生成文件」说明放进剪贴板，脱敏 JSON 写入桌面的 `zeppbridge-ai-handoff.json`；解析不到桌面目录时才回退到应用数据目录的 `exports/`。剪贴板失败不会打开浏览器；浏览器打开失败时保留已复制内容并允许重试。目标 URL 是代码内固定的七家提供商地址，不能从用户输入或提示词改变，也不会带 query 参数、健康数据或提示词。

交接只负责复制和打开目标网站，不做网页注入、自动登录或自动发送。外部 AI 网站的账号、网络、留存和隐私政策由用户自行确认；在网站预览中看到页面不代表数据已经提交。

## 主动错误报告

当设备或运动类型未被识别时，用户可以在设置页点击「提交错误报告」。提交前必须通过一次明确确认；应用不会后台自动上报，也不会创建或回复 GitHub Issue。

桌面端使用一套不带 Zepp cookie jar 的独立 HTTPS client，只向 `https://zeppbridge.pages.dev/api/feedback` 发送强类型白名单报告。允许字段只有应用/解析器版本、操作系统、数据库 schema 版本、设备响应的字段名与 JSON 类型、目录候选、固件版本、安全的产品名/短型号提示、型号类编号、未知设备数量、未知运动编号与记录数、类型冲突数，以及云端最近一次拒绝请求的数字错误码（只有编号、哪条数据流和时间，不包括云端返回的文字）。报告类型没有账号、Token、cookie、序列号、设备 ID、MAC 地址、GPS、健康数值、原始响应或本机路径的字段槽位。

型号类编号（`modelIdentifierHints`）是严格形如 `名字:整数` 的字符串，名字只接受 `deviceSource` 和 `deviceType` 两个；取值必须是设备响应里 0–99,999,999 范围内的 JSON 整数，其余一律在组装报告前就丢掉。有些 Zepp 账号的设备响应里根本没有任何产品名字段，这两个数字是仅有的型号线索；它们描述的是「哪一款表」而不是「哪一台表」，形状在客户端和 Pages Function 两侧都被钉死成 `名字:整数`，序列号、MAC 或任何字符串都进不来。没有它们，这类设备在内置目录里永远补不上，对每个用户都会一直显示未识别。

Pages Function 再次执行严格 schema、字段数量和 32 KiB 大小校验后写入私有 D1 数据库；接口不提供公开读取路由，响应只返回随机报告编号。D1 仅用于定位目录/解析兼容性问题，不用于用户画像、使用统计或健康分析。

## 「清除认证」与「清理数据」

### 清除认证

- 作废网页登录会话；
- 删除 Credential Manager 中当前 user ID 对应的 token；
- 删除 `auth.json` 元数据；
- 清空内存中的同步 manager、认证状态和 warning；
- **保留**已有健康数据库、canonical 记录和 raw 记录。

### 清理旧数据

- 由设置页 `cleanup_old_data` 触发，天数限制为 `1–365`；
- 删除超过窗口的 metric、daily、sleep、workout 等 canonical 记录；
- 删除不再被 canonical 记录引用的旧 raw；
- 不删除 Windows Credential Manager token，除非你另行点击「清除认证」。

如果需要彻底清除，请先使用应用动作，再打开 data folder 检查并按自己的备份策略处理残余数据库。

## 遥测声明

ZeppBridge 当前没有自动产品遥测、使用统计或后台崩溃上报，但同步、认证验证、网页登录和用户主动确认的错误报告会产生网络流量。网络目的地仅限：

- 用户配置并通过 host 校验的 Zepp 区域服务；
- 登录窗口访问的 Zepp / Huami 官方页面；
- 主动错误报告访问的 ZeppBridge Cloudflare Pages Function；
- 应用自身的本地 Tauri IPC。

ZeppBridge 运行期间会开启只读本机 API。`GET /workouts/{id}/series` 不返回认证字段，但可能包含心率、步态和精确 GPS；电脑上的其他本机进程可访问，因此只应运行可信程序。退出托盘进程后监听器停止。

## 发布前余留风险

- 本机安装包可用本地自签证书 `CN=ZeppBridge Local` 做 Authenticode 签名，便于识别发布者；证书链不在 Windows 受信任根里，SmartScreen 仍可能提示。这不是 EV/OV 代码签名，不能当公开发布门槛；
- 健康 DB 默认明文；
- 没有系统级后台服务、SBOM 或干净 VM 证据；更新检查只在应用进程运行期间进行；
- 没有覆盖全部区域/账号的真实登录证据；
- 真实睡眠阶段、GPS/路线、训练详情和 HybridCharge 尚未有脱敏 fixture 验证。

工程门禁与发布前检查见 [开发文档](../development/development.zh-CN.md)。
