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

健康数据默认只写入本机。同步时会访问用户已配置的 Zepp 区域服务；应用不自动融合不同设备来源，也不会为缺失的轨迹、曲线或指标生成估算值。REST/MCP 仍是后续阶段，不是当前公开接口。

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
- metric/daily 唯一索引对空设备 ID 使用 `COALESCE`，避免 `NULL` 重复。
- retention 可由用户在 1–365 天内选择，默认 365 天；清理由健康记录时间决定，并回收无引用 raw。
- `user_fused`、`device`、`unknown` 来源继续保留。来源不明确时不做静默融合。
- 编码但未验证的 `band_data` 只保留 raw；没有真实采样或路线时不绘制模拟曲线和地图。

### 桌面界面

- 主导航为概览、交给 AI、设置。顶栏提供连接状态、全局同步和自定义三态主题菜单。
- 概览按「最新心率 → 交给 AI 入口 → 最近睡眠/运动」组织；同步时间与心率样本时间明确分开。不在概览做恢复或训练分析。
- 睡眠与运动不进主导航。概览「查看全部」进入 `/sleep`、`/workouts`；单条详情为 `/sleep/:sleepId`、`/workouts/:workoutId`。
- 睡眠详情显示真实总时长、评分和四阶段比例；运动详情显示距离、热量、平均/最高心率、训练负荷与 VO₂max，只在距离和时长均有效时计算配速。
- JSON 导出在 `/ai`：复制、保存文件、更新本机 AI 数据源。设置页默认只显示连接、自动同步、保留/补拉和外观；诊断和数据维护收进「高级与隐私」。
- 浅色、深色、跟随系统均持久化；状态色含义为绿色成功、灰色中性、黄色需关注、红色失败。分类色只用于心率、睡眠、运动标记。强调色为低饱和绿 `#3DDC84`，不是系统蓝。

## 已验证与未验证

项目已用拥有者授权的账号完成同步和安装入口烟测，公开仓库只保留脱敏后的可复现工程证据，不保存账号、设备或个人健康样本。

当前证据仍不能外推：

- 所有 Zepp 区域、账号、设备与固件均兼容；
- 任意浏览器会话都能稳定给出可解析 cookie（需在真实账号上验证）；
- 当前不存在的运动采样、GPS 路线或睡眠完整时间轴可用；
- 安装包已签名、数据库已整库加密，或已达到公开发布门槛。

## 后续阶段

| 阶段 | 状态 |
| --- | --- |
| 账号同步、SQLite、桌面 Dashboard | 已完成受控安装版烟测 |
| 网页登录首次连接 | 电脑端链路已实现，真实账号登录按环境验证 |
| REST + MCP | 未开始 |
| 更多数据源 | 未开始 |
| 公开发布工程（签名、更新、SBOM、干净 VM） | 未开始 |
