# ZeppBridge 架构摘要

本文描述 v0.4.0 的产品边界与当前实现。使用入口见项目 [README](../../README.md)，工程门禁见 [开发文档](../development/development.md)。

## 产品边界

ZeppBridge 是 Windows 优先、本地存储的 Zepp 健康数据桌面应用：

```text
网页登录窗口 → 会话 cookie → 区域探测 → Credential Manager
Zepp 区域云端 → ZeppConnector → Raw provenance → Normalizer → SQLite
                                                              ↓
                                                Tauri IPC → Vue 界面
```

健康数据默认只写入本机。同步时会访问用户已配置的 Zepp 区域服务；应用不自动融合不同设备来源，也不会为缺失的轨迹、曲线或指标生成估算值。本机 REST 已提供两个只读接口（`/health`、`/workouts/{id}/series`，仅绑定 `127.0.0.1:43921`）；MCP 仍是后续阶段。

## 当前实现

### 连接、认证与同步

- 首次连接走应用内网页登录：独立 `zepp-login` 窗口打开 `watchface.zepp.com`（超时后备用 `user.huami.com`），只允许导航到 `zepp.com` / `huami.com` 的 HTTPS 页面。
- 后端轮询登录窗口 cookie，解析 `hm-user-login-info` 或 `userid` + `apptoken`，再在允许的区域 host 上用最近心率请求验证。
- 前端只调用 `start_web_login` / `cancel_web_login` / `get_login_status`，并监听 `login://status`。载荷为 `{ state, message, page_url }`。
- app token 存在 Windows Credential Manager；`auth.json` 只保留非敏感元数据。
- 已保存认证在应用重启后直接恢复为「已配置」；启动后会尝试 `verify_auth`。只有明确 401/403 或 `needs_reauth` 才要求重新连接。
- 首次/历史同步覆盖用户选择的 1–365 天（默认 30）；增量同步带 7 天重叠窗口。单例同步控制器统一顶部「立即同步」、设置页、启动同步、15 分钟自动检查、并发锁和页面刷新。
- 同步结果区分 `updated`、`no_new_data`、`partial`、`failed`；云端拉取时间与各数据流最新样本时间分别保存和显示。本地重解析不会改变云端同步时间。

### SQLite 与数据语义

- SQLite 启用 migration、WAL、foreign keys 和 busy timeout；raw payload 具备 hash、source key 与 canonical `raw_record_id` 回指。
- 跑步（Zepp `type=1`）在 history 摘要之后按 `trackid` + `source` 拉 `/v1/sport/run/detail.json`，差分解码后写入 `workout_samples` / `route_points` / `workout_pauses`。没有点就不画轨迹或曲线。
- metric/daily 唯一索引对空设备 ID 使用 `COALESCE`，避免 `NULL` 重复。
- retention 可由用户在 1–365 天内选择，默认 365 天；清理由健康记录时间决定，并回收无引用 raw。
- `user_fused`、`device`、`unknown` 来源继续保留。来源不明确时不做静默融合。
- 编码但未验证的 `band_data` 只保留 raw；没有真实采样或路线时不绘制模拟曲线和地图。

### 桌面界面

- 主导航为概览、交给 AI（`/explore`）、设置。顶栏提供连接状态与全局同步。
- 界面是**统一深色**：设计上不提供浅色 / 跟随系统模式，也没有主题切换入口。可调的只有界面缩放（80%–125%，设置「高级与维护」或 Ctrl + / Ctrl - / Ctrl 0）。
- 概览按「最新心率 → 交给 AI 入口 → 最近睡眠/运动」组织；同步时间与心率样本时间明确分开。不在概览做恢复或训练分析。
- 睡眠与运动不进主导航。概览「查看全部」进入 `/sleep`、`/workouts`；单条详情为 `/sleep/:sleepId`、`/workouts/:workoutId`。
- 睡眠详情显示真实总时长、评分和四阶段比例；运动详情显示距离、热量、平均/最高心率、训练负荷与 VO₂max，只在距离和时长均有效时计算配速。跑步若已解码出轨迹或心率点则画折线，否则仍显示「未提供」。
- JSON 导出在 `/explore`（交给 AI）：选提示词模板、复制、保存文件、直接交接给白名单内的 AI 站点。设置页按编号分区展开连接、账户、设备、隐私、保留、导出偏好、本机 API、更新与自动同步；界面缩放、数据文件夹、清除认证和同步诊断收进底部「高级与维护」。
- 状态色含义为绿色成功、灰色中性、黄色需关注、红色失败。分类色只用于心率、睡眠、运动等数据类别标记。品牌强调色为低饱和橄榄绿 `#7DA33E`，不是系统蓝。完整色板与页面结构见 [UI 约束](../development/ui-guidelines.md)。

## 已验证与未验证

项目已用拥有者授权的账号完成同步和安装入口烟测，公开仓库只保留脱敏后的可复现工程证据，不保存账号、设备或个人健康样本。

当前证据仍不能外推：

- 所有 Zepp 区域、账号、设备与固件均兼容；
- 任意浏览器会话都能稳定给出可解析 cookie（需在真实账号上验证）；
- 跑步 detail 在所有区域/固件上都能返回可解码差分串；
- 走路、骑行等非 `type=1` 运动已有逐点采样；
- 安装包已签名、数据库已整库加密，或已达到公开发布门槛。

## 后续阶段

| 阶段 | 状态 |
| --- | --- |
| 账号同步、SQLite、桌面 Dashboard | 已完成受控安装版烟测 |
| 网页登录首次连接 | 电脑端链路已实现，真实账号登录按环境验证 |
| 本机只读 REST（`/health`、`/workouts/{id}/series`） | 已实现 |
| MCP | 未开始 |
| 更多数据源 | 未开始 |
| 公开发布工程（签名、更新、SBOM、干净 VM） | 部分完成：updater 产物与 `latest.json` 已用 Tauri 密钥签名并经 GitHub Release 自动更新；安装包仍无 Authenticode 证书，也没有干净 VM 验收 |
