# 自托管拉取：`/v1/records` 契约

给和 ZeppBridge 跑在一起、定时来拉数据的服务用（SparkyFitness、Home Assistant 一类）。ZeppBridge 负责把本地库保持最新，拉取方通过一个小的只读 REST API 来读。把我们的记录映射成对方自己的模型归拉取方；这一页写的是我们这边保持稳定的部分。

[English](self-hosted-pull.md)

## 跑在哪里

拉取只对常开的机器有意义，所以支持的形态是无头镜像：NAS 或家用服务器上的 Docker 里跑 `zeppbridge-cli serve`，`zeppbridge-cli sync` 照旧由宿主机定时跑（见 [Docker](docker.zh-CN.md)）。

- **不设 `ZEPPBRIDGE_LISTEN` 时 `serve` 只听 `127.0.0.1:43921`**（容器里通常设成 `0.0.0.0:43921`）。
- **监听非本机地址必须有拉取 token**，否则拒绝启动。可以设 `ZEPPBRIDGE_PULL_TOKEN`（至少 32 个字符，例如 `openssl rand -base64 33`），或者用 `zeppbridge-cli pull-token rotate` 生成一把存进凭据库。`pull-token status | show | rotate | revoke` 管理存着的那把；吊销或轮换后几秒内生效，不用重启服务。`ZEPPBRIDGE_CREDENTIAL_STORE=env`（Docker 默认）没地方存，请用环境变量。
- **拉取 token 只能读 `/v1/*` 和 `/health`**。它和桌面端的本机 API token 是两把钥匙，可以单独吊销。
- **明文 HTTP**。把 API 放在容器内部网络里——`packaging/docker/docker-compose.yml` 的 `serve` 服务不发布端口，只接入一个 `internal: true` 的网络——或者在前面加 HTTPS 反向代理。监听非本机地址时，serve 启动日志里会写明这一点。
- **限流**：serve 每个来源地址每分钟最多 120 个请求。一分钟内鉴权失败 10 次的地址封 10 分钟（桌面端的 API 也这样）。两种情况都回 `429` 和 `Retry-After`。
- 桌面端也给同一台电脑上的进程提供同样的 `/v1/records`，用它自己的本机 API token。桌面端永远只听 `127.0.0.1`，没有任何设置能改。

## 请求

每个请求都要带 `Authorization: Bearer <token>`。

`GET /v1` 描述服务：版本、`records_version`、路由、默认类型和下面这些上限。`GET /health` 是存活探针。

`GET /v1/records`

| 参数 | 必填 | 含义 |
|---|---|---|
| `from`、`to` | 是 | 本地日期 `YYYY-MM-DD`，含两端。一次最多 **92 天**，更长的区间拆开请求。 |
| `types` | 否 | 逗号分隔。默认 `sleep,heart_rate,hrv,activity,workouts,weight`。也认导出类型的原名（`daily_activity`、`steps`、`hrv_rmssd` 等）。 |
| `since` | 否 | RFC 3339 时间。只返回源数据在这个时刻及之后从云端拿到的记录。用户自己写的记录（`source: "user"`）总是返回。 |
| `detail` | 否 | `summary`（默认）或 `full`。`full` 额外带运动逐秒采样和日内序列。 |
| `include_gps` | 否 | `true` / `false`（默认）。**只有** `include_gps=true` 且 `detail=full` 才返回运动轨迹。 |
| `limit` | 否 | 每页条数，1–2000，默认 500。 |
| `cursor` | 否 | 上一页的 `next_cursor`。游标绑定查询：除 `limit` 以外改了任何参数，旧游标就失效。 |

不认识的参数、重复给的参数都会报错，不会被悄悄忽略。

## 响应

```json
{
  "records_version": "zeppbridge.records.v1",
  "query": {
    "types": ["sleep", "workouts"],
    "from": "2026-11-01",
    "to": "2026-11-07",
    "since": null,
    "detail": "summary",
    "include_gps": false,
    "timezone": "system_local"
  },
  "count": 2,
  "total": 9,
  "next_cursor": "djE6…",
  "records": [
    { "record_type": "sleep_session", "source": "official", "…": "…" },
    { "record_type": "workout", "source": "advanced", "…": "…" }
  ],
  "devices": [],
  "capabilities": {}
}
```

- `records` 是一个平铺的列表，每条都带 `record_type` 和 `source`；其余字段和 `zeppbridge-cli export --format json` 一致。`record_type` 依次是 `sleep_session`、`workout`、`daily_metric`、`metric_sample`、`life_event` 之一。
- `source`：`official` = Zepp 官方开放平台授权；`advanced` = 账号连接器；`mixed` = 同一个折叠值两边都有读数；`user` = 用户自己写的日历上下文。按每行入库时的来源读出，不是猜的。只想要官方数据的拉取方可以按它过滤。
- 最后一页的 `next_cursor` 是 `null`。同一个查询的各页取自 30 秒内的同一份快照；两页之间要是刚好同步了一次，请去重：睡眠按 `sleep_id`、运动按 `workout_id`、每日指标按 `date` + `metric`、采样按 `timestamp` + `metric`。重拉有重叠的时间窗时按同样的键去重即可。
- 单位、时区和缺失值遵守读取契约（`zeppbridge-cli contract`）：缺失就是没有这个字段或 `null`，绝不写成 `0`。
- 错误统一是 `{"error": {"code": "…", "message": "…"}}`：

| 状态 | `code` | 什么时候 |
|---|---|---|
| 400 | `invalid_query` | 不认识或重复的参数、编码不对、查询串超过 2 KB、`include_gps` 不对 |
| 400 | `invalid_range` / `range_too_long` | 日期缺失或格式不对、`to` 早于 `from`、超过 92 天 |
| 400 | `invalid_types` | 不认识的类型，或一个都没选 |
| 400 | `invalid_since` / `invalid_detail` / `invalid_limit` / `invalid_cursor` | 如其名 |
| 401 | `unauthorized` | 没带 token 或 token 不对 |
| 403 | `token_scope` | 拉取 token 访问了 `/v1/*` 和 `/health` 以外的路由 |
| 429 | `rate_limited` | 见上面的限流；请按 `Retry-After` 等 |
| 503 | `local_data_unavailable` | 本地库此刻读不了（比如正在升级），稍后重试 |

只有不兼容的改动才会换 `records_version`。`v1` 里可能新增字段，不认识的忽略即可。

## 无头登录

暂时没有。授权中转站本身不在乎是哪台设备来要（客户端生成随机的 `state` 和领取密钥，用户在任意浏览器里授权，客户端再去领令牌），所以 `zeppbridge-cli` 完全可以打印链接、自己领令牌。但 `zeppbridge-cli sync` 还不跑官方通道——那套编排还在桌面应用里——命令行登录拿到的令牌没有地方用。两件事要一起做；在那之前，请先用桌面应用连一次，再把数据目录交给容器，做法见 [Docker](docker.zh-CN.md)。
