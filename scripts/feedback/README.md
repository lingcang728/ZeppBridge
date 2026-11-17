# 反馈分拣（维护者用）

只有能用 `wrangler login` 登录项目 Cloudflare 账号的维护者用得上。

应用内的诊断报告发到 `POST /api/feedback`
（[`functions/api/feedback.js`](../../functions/api/feedback.js)），写进一个私有的
Cloudflare D1 数据库。没有管理页面，`GET /api/feedback` 故意返回 405。

分拣只走一个脚本：
[`triage.mjs`](triage.mjs)。

```bash
npm run feedback:triage summary
```

## 为什么是脚本而不是管理界面

`feedback_reports` 这张表存的是型号类编号、运动编码、JSON 字段的**形状**，以及报告人自己打的那句话，没有账号、
token、cookie、序列号、MAC、GPS 或健康数值。同一个 D1 里还有回信表 `letter_replies`（自由文本）和按日期做的 IP 哈希限流计数——整个库都不该挂在公网上。一个带认证的管理页
得有自己的登录、审计记录和最少字段约束，而这件事大约一周才做一次。把命令固定在一个审过的
脚本里，大家跑的就是同一条查询，也没人会顺手把原始行整个倒出来。

## 命令

| 命令 | 显示什么 |
| --- | --- |
| `summary` | 按状态、应用版本、系统、类别统计总数，以及日期跨度 |
| `notes` | 报告人写了一句话的每一份报告——通常信号最强 |
| `codes` | 未知运动编码：报告数、记录数、出现过的版本 |
| `corrections` | 用户手动纠正过的运动类型：哪个编号被我们认成了什么、用户改成了什么 |
| `rejections` | 云端业务错误码——HTTP 200 但内容说「没成功」的响应 |
| `devices` | 反馈里的 `deviceSource` 编号对着当前目录：哪些仍认不出、哪些已经认得出 |
| `list <status>` | 某个状态下的报告 id |
| `mark <status> <id...>` | 把报告挪到某个状态 |

输出都是汇总。没有任何命令会倒出 `device_evidence_json` 或其他原始载荷。

## 状态的含义

`status` 由
[`migrations/0001_feedback_reports.sql`](../../migrations/0001_feedback_reports.sql)
限定为 `new` / `reviewed` / `resolved` / `ignored`。

* **`new`**——还没看。
* **`reviewed`**——看过并处理了，但修复还没进公开发布版。合并到发布之间，大多数报告应该
  停在这里。
* **`resolved`**——修复已在发布的版本里。合并了但没发布的别用它：「代码在 main 里」和
  「报告人能装上」是两回事，报告人在乎的是后者。
* **`ignored`**——重复提交，或者没有可做的事。

## 把贡献变成目录条目

有两项汇总直接喂给随包目录。

### 运动编码

`codes` 按记录数给未知的 Zepp 运动编码排序。**数量不是含义的证据。** 一个编码有 200 条
记录，只说明有人在用，并不说明它是哪项运动。收录规则（和 `triage.mjs` 的 `codes` / `corrections` 输出一致）：至少两份互相独立、没有分歧的报告（报告人写的那句话或手动纠正都算），才把编码加进
[`src/assets/workouts/catalog.json`](../../src/assets/workouts/catalog.json)。

例子：`211`（公路骑行）是报告人写明「211 被读成未知运动」后收进目录的（早于现在的两份报告规则）；其余未知编码在凑够证据前有意不映射。

### 云端拒绝码

`rejections` 是唯一一项**预期为空**的汇总，这正是它的意义。Zepp 有三条流用
`{ code, message, data }` 包着，`code: 1` 表示成功。目前还没在报告里见过一个失败码，所以 `classify_business_code`
把非 1 的码当成要上报的错误，并拒绝自行认定它意味着「请重新登录」：瞎猜等于拿一个确定的坏
体验（被踢回登录页）去换一个没验证过的猜测。

一旦这里出现非空的一行，就把那个具体的码映射到
[`connectors/zepp/policy.rs`](../../src-tauri/crates/core/src/connectors/zepp/policy.rs)（`classify_business_code`）
里的 `NeedsReauth`，并在旁边记下报告 id。在那之前，账号看起来是空的人（"All my readings
are showing empty"）既得不到重新连接的提示，也拿不到任何数据——这一栏存在就是为了结束这个
死胡同。

报告里带的是编号、哪条流和时间戳，从不带云端自己的 message：那是服务器给的自由文本，而报告
对用户的承诺是字段白名单。

### 没有编码的目录条目

目录条目可以写 `"code": null`。意思是这项运动可以作为手动更正选项，但不知道哪个 Zepp 编号
会产生它——编一个出来，normalizer 就会凭猜测把一整类历史改掉标签。

**改目录就要推 `NORMALIZER_REVISION`**
（[`src-tauri/crates/core/src/storage/mod.rs`](../../src-tauri/crates/core/src/storage/mod.rs)）。
这个常量是重放 `raw_records` 的唯一触发器；不推的话新映射只对以后的同步生效，已经存下的
`unknown:211` 行永远是错的——而这恰恰是报告人在抱怨的事。

### 设备型号编号

`devices` 把有未识别设备的报告里的 `deviceSource` 编号拿出来，对着当前的
`src/assets/devices/catalog.json` 分两张表：仍认不出的（带报告数和出现过的版本），和现在已经
认得出的（标明来自官方表还是冻结的众包）。

3.1.1 起目录以 Zepp 官方对照表为准，众包指认冻结、不再上报（规则见
[设备目录参考](../../docs/reference/device-catalog.zh-CN.md)）。仍认不出的编号先去核官方表有没有更新，**不按报告数
收**。低位的 `101`–`104` 是体脂秤（反馈里全带 `deviceType:1`），新版本已经不会再报。

## 凭据

脚本调用 `wrangler`，所以用的是 `wrangler login` 登录的那个 Cloudflare 账号。数据库绑定和
id 在 [`wrangler.jsonc`](../../wrangler.jsonc) 里。
