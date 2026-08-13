# ZeppBridge 安全与隐私边界

本页说明当前实现中的数据流和清除范围。它不是“绝对安全”保证；安装包未签名，健康数据库默认明文，真实手机/区域行为也尚未完成 live 验证。

## 凭据

- app token 由 Windows Credential Manager 保存，服务名为 `com.zeppbridge.app`，账户名按 user ID 区分。
- `auth.json` 位于 Tauri `app_data_dir()`，只保存认证元数据（版本、user ID、区域 host、更新时间）；正常保存不会把 token 写入文件。
- 启动恢复会从元数据和凭据管理器重建同步 manager。凭据缺失或失效时，设置页显示需要重新认证，不把 token 放进状态响应。
- 前端 token 输入框使用 password 类型，保存后清空；捕获状态只返回脱敏用户摘要与区域 host。
- 部分捕获只允许补交缺失的 user ID；已捕获 token 只在本次运行的内存状态中沿用，不通过 UI 要求复制或再次输入 token。
- token 仍然是敏感数据。不要记录、复制到 issue、提交到 Git、发送给第三方或公开分享。

## 网络与区域

- 同步不是离线功能：用户点击验证/同步后，ZeppBridge 会向用户允许的 Zepp 区域 host 发起 HTTPS 请求。
- 连接器只接受 `https://api-mifit*.zepp.com` 或 `https://api-mifit*.huami.com` 的 origin，不接受任意域名、路径、query、fragment、凭据或不受控端口。
- HTTP client 有 30 秒 timeout，并对 401/403、404、429/5xx 与其他非 2xx 做分类和有限重试。
- 内置代理绑定电脑的局域网监听地址和页面显示的端口。它只对 `api-mifit*.zepp.com` / `api-mifit*.huami.com` 做 HTTPS MITM；其他 CONNECT/TLS 目标保持隧道转发，不被解密。
- 电脑防火墙、路由器客户端隔离、Android/厂商 CA 策略或 Zepp 证书固定可能阻止手机捕获。不得用 root、破解或 patch 绕过这些机制。

## 证书与私钥生命周期

1. 捕获启动时从 Windows Credential Manager 的 `com.zeppbridge.ca` 条目读取 CA 私钥；若该数据目录 hash 身份没有条目才生成一次。身份只由数据目录 hash 表示，不在 target 中写明文路径或 secret。
2. 页面只显示公开 DER `.cer`、PEM 公共导出路径（用于本机排查）和手机可访问的证书 URL/二维码；私钥不会写入磁盘，也不会通过 IPC 返回。磁盘上的 `.cer/.pem` 是 public exports。
3. 手机在同一 Wi‑Fi 下载并安装 CA 后，代理只在捕获期间工作；停止或完整重启只释放监听器，不删除凭据管理器中的 CA 私钥，因此同一安装复用同一证书。
4. 旧版本遗留的 `zeppbridge-ca.key` 只会在成功写入凭据管理器后执行一次迁移并删除，当前实现不会继续写该文件。
5. “清除认证”不删除 CA 私钥，也不提供 UI reset CA。显式重置凭据或删除应用数据后，可能需要在手机重新安装证书。

CA 是本机调试材料，不应安装到不属于你的设备或网络，也不应把证书 URL 分享给不可信的人。

## 健康数据库

- 数据库和 raw payload 位于 Tauri `app_data_dir()`，默认 SQLite 明文；当前没有整库加密或远程备份。
- SQLite 启用 WAL、外键、migration、去重和 raw provenance。canonical 健康行可回指对应 raw 记录，便于解释来源。
- retention 可由用户在 1–365 天内选择，默认 365 天；清理依据健康记录时间，成功同步后删除旧 canonical 和无引用 raw。清理不可撤销，请先备份。
- `band_data` 的编码/压缩 payload 可能只保留 raw 并标记 `unverified`；程序不将未知内容伪造成睡眠阶段。

## “清除认证”与“清理数据”

### 清除认证

- 停止本机捕获代理；
- 删除 Credential Manager 中当前 user ID 对应的 token；
- 删除 `auth.json` 元数据；
- 清空内存中的同步 manager、认证状态和 warning；
- 保留 `com.zeppbridge.ca` 中的 CA 私钥和 public certificate exports；不重置 CA；
- **保留**已有健康数据库、canonical 记录和 raw 记录。

### 清理旧数据

- 由设置页 `cleanup_old_data` 触发，天数限制为 `1–365`；
- 删除超过窗口的 metric、daily、sleep、workout 等 canonical 记录；
- 删除不再被 canonical 记录引用的旧 raw；
- 不删除 Windows Credential Manager token，除非你另行点击“清除认证”。

如果需要彻底清除，请先使用应用动作，再打开 data folder 检查并按自己的备份策略处理残余数据库和公开证书文件。

## 遥测声明

ZeppBridge 当前没有产品遥测或使用统计上报，但同步、认证验证和手机代理捕获都可能产生网络流量。网络目的地仅限：

- 用户配置并通过 host 校验的 Zepp 区域服务；
- 用户同一局域网中访问证书 URL 的手机；
- 应用自身的本地 Tauri IPC。

REST/MCP 尚未实现，也没有默认开启的本地 API 监听器。

## 发布前余留风险

- 安装包 Authenticode `NotSigned`，Windows 可能显示 SmartScreen 提示；这是公开发布阻碍；
- 健康 DB 默认明文；
- 没有后台定时调度、自动更新、SBOM 或干净 VM 证据；
- 没有真实账号、实体手机、不同区域/账号和证书固定兼容性证据；
- 真实睡眠阶段、GPS/路线、训练详情和 HybridCharge 尚未有脱敏 fixture 验证。

对应缺陷 disposition 和最终门禁见 [REPAIR_AUDIT.md](REPAIR_AUDIT.md) 与 [COMPLETION_REPORT.md](COMPLETION_REPORT.md)。
