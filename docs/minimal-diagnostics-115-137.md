# 血压、日汇总与 Cheetah Square 的最小诊断

适用于 [#115](https://github.com/lingcang728/ZeppBridge/issues/115) 和 [#137](https://github.com/lingcang728/ZeppBridge/issues/137)。这两项仍需报告者样本确认；探测成功、手动指认成功都不等于原账号的数据已经完整导入或型号已经能自动识别。

## 先记录现象

记录 ZeppBridge 的实际版本、操作系统、Zepp App 版本和手表型号。说明 Zepp App 是否能看到相应日期的血压/日汇总，以及 ZeppBridge 缺少哪一类数据。日期可以只保留到月份；截图只截相关标签和状态，遮住姓名、头像、健康读数、设备序列号和账号。

不要上传整个 `data` 目录、`zepp.db`、备份、认证文件、网络抓包或完整接口响应。普通「报告问题」发送的是诊断摘要，不包含验证血压字段所需的原始样本，不能单凭它判断血压解析正确。

## #115：血压或日汇总缺失

如果当前安装包包含 `zeppbridge-cli`，在 CLI 所在目录运行以下只读探测。它使用已连接账号请求云端，不导入数据库；不需要复制或粘贴密码、Cookie 或 token。以下命令仅生成本地文件，不会自动提交报告。

```powershell
.\zeppbridge-cli.exe probe --streams blood_pressure,daily_summary --days 7 --json > .\probe-summary.json
```

先打开 `probe-summary.json` 检查，只提供有关流的状态、记录数、字段名、错误码、窗口天数和应用版本。可以去掉 `latest_date` 等具体日期；不要附带终端历史或环境变量。若 CLI 不在当前安装包中，先提供界面版本和现象即可，无需安装额外工具或自行调用私有接口。

探测结果的含义：

| 状态 | 可以得出的结论 |
| --- | --- |
| `available` | 此候选接口返回了条目；仍需核对字段含义与本地导入。 |
| `empty` | 此次窗口为空；不能据此判定设备不支持。 |
| `unavailable` | 此账号或接口此次不可用；不是健康数据为零。 |
| `unrecognized` | 返回结构尚未识别；保留字段名，不公开整段响应。 |
| `error` | 请求失败；先看错误码，不把失败解释为没有数据。 |

日汇总中的 `rawResponses`、`parsedDailyMetricRows`、`dailyMetricDays`、`dailyMetricNames`、`responsesWithoutUsableMetrics` 和 `incomplete` 可以区分「收到响应」「识别出指标」「窗口是否完整」。它们不证明旧月份完整，也不能用 Food CSV 代替原始日汇总或血压结构证据。

只有摘要仍不足、且维护者明确说明所需字段后，再由用户自愿提供**单条**结构样本：保留字段名、嵌套层级、数组形状、JSON 类型及单位；删除账号、标识、URL 查询串、请求头、地点和 GPS。将时间和读数替换为明显的示例，并注明哪些值已替换。示例仅用于验证结构，不用于证明真实读数正确。原始健康读数不应写进公开 issue 或普通反馈备注。

## #137：Cheetah Square 自动识别

1. 在「设置 → 账号与设备」查看当前显示的是自动识别型号还是「你指认的型号」。
2. 如未识别，可打开型号选择器，搜索 Cheetah Square 并手动指认。这样只改善本机显示，不证明云端提供了可供自动识别的型号编号。
3. 如愿意帮助补充目录，可在选择器中主动选择「帮助下一版自动认出这款设备」后确认。该路径提交所选目录型号与该设备的型号类编号提示；它不提交设备 ID、序列号、MAC 或健康读数。是否提交由用户决定。
4. 若仍未找到型号类编号，保留「待样本」状态。可提供诊断中的 `status`、`object_count`、`unknown_device_count`、`model_identifier_hints` 和 `shapes`；只要型号类字段，不要以设备唯一标识替代它。

设备响应有多台设备时，必须逐台配对型号与编号，不能把全部编号与型号列表混在一起推断映射。公开材料可使用如下人工整理模板：

```json
{
  "appVersion": "填写实际版本",
  "reportedModel": "Cheetah Square",
  "recognition": "manual",
  "modelIdentifierHints": [],
  "note": "未取得型号类编号，继续待样本"
}
```

空编号列表不能用于新增自动识别映射。维护者需用同一台设备的型号证据和型号类编号验证后再更新目录；手动指认不能作为自动识别回归通过的依据。
