# Amazfit 官方设备目录

[English](device-catalog.md)

`src/assets/devices/catalog.json` 是维护时生成的快照：型号清单 2026-08-15 核对过，
`device_source_codes` 2026-09-01 加入、2026-09-11 扩充。共 55 条，其中 54 条是
`active`/`supported`，覆盖 52 个标准型号键。48 张卡的基线来自提供的 Amazfit 日本官网
截图集（`design_picture/Product`，12 行 × 4 张）；GTR 4 黑色配色那张重复卡共用标准
GTR 4 素材，不算第二个型号。另有三款仍在售的官方型号（Helio Strap Pro、Helio Core、
Helio Ring），所以标准型号数超过 48。Helio Armband 只为留存来源而列出，标为
`status=accessory`、`supported=false`，不算可连接设备。

Balance 2 XT、Amazfit 智能体脂秤和小米体脂秤 2 也可以选，但没有产品图，用现有的占位图。
认可的来源编号维护在目录的 `device_source_codes` 和
`scripts/assets/build-device-catalog.py` 的 `DEVICE_SOURCE_CODES` 里。

逐张卡的对应关系记在
[`device-catalog-audit.json`](./device-catalog-audit.json) 和
[`device-catalog-audit.csv`](./device-catalog-audit.csv)。每条都保留来源的行 / 列、
显示名、尺寸 / 配色变体、合并关系、目录 ID、标准型号键和素材来源。

## 匹配约定

1. 先拿 `deviceSource` 编号对 `device_source_codes`。有的账号返回的设备列表根本没有产品名
   字段（issue #4），这时这些整数就是报文里唯一的型号类事实。
2. 再对稳定的型号代码（已知的例子：T-Rex 3 是 `A2322`/`A2323`，Helio Ring 是 `A2321`）。
3. `productName`/`deviceName` 与规范化后的别名精确匹配。
4. 完整的多词或带编号的别名可以出现在显示昵称里（例如 `我的 T-Rex 3`）。
5. 绝不做通用模糊匹配。过不了上面任何一条的，一律保持 `unknown`。

### `device_source_codes` 从哪来

华米没有公开这些整数的对照表，所以每一条都来自用户在应用里手动指认型号、并选择分享出来。
指认汇总在反馈库里，工具见[反馈分拣](./feedback-triage.zh-CN.md)。

收录规则由
[`scripts/assets/build-device-catalog.py`](../../scripts/assets/build-device-catalog.py)
的 `DEVICE_SOURCE_CODES` 执行，`device_catalog` 单元测试守着：

* **只认 `deviceSource`，绝不用 `deviceType`。** `deviceType` 是系列代码：反馈数据里光
  `deviceType:0` 就横跨二十个不同型号。
* **只收高段（≥ 1,000,000）。** 低段在同一批数据里自相矛盾：`deviceSource:102` 被四个人
  指认成四个不同型号。
* **每个编号至少两份独立报告。**
* **冲突由人裁决，绝不按多数票。** 收了两个（`9568513` → Balance 2，`10289411` → Helio
  Strap）：它们相邻的编号对同一产品意见一致，而每份异议报告还同时指认了第二块表，也就是
  报告人在选择器里点错了设备。拒了一个（`10813699`，Active MAX 2 对 Active 2 44mm 2）
  ——平票不算证据。

相邻几个编号对应同一产品是正常的：低位编码的是配色 / 尺寸变体。

账号里的原始昵称留在 `name`/`display_name`；目录补上 `canonical_name`、`display_name`、
`name_zh` 和 `catalog_id`。`user_fused` 和来源不明的记录永远不认领实体设备。

## 本地图片与来源

每条 active/supported 都对应 [`src/assets/devices/`](../../src/assets/devices/) 下的一张
RGBA WebP 和一张 RGBA PNG 缩略图。`catalog.json` 里的图片哈希是随包 WebP 的 SHA-256，
离线门禁据此发现漂移。`src/lib/deviceCatalog.ts` 用 `import.meta.glob` 找文件，新增一对图
不用手写 import。

48 张基线素材大多是 `screenshot-derived`：从日本官网截图里裁出只含产品的部分，再去掉店铺
文字、价格、奖项徽章、界面控件和白底。另外四条用 Amazfit 美国官网 Shopify CDN 的公开图片。
运行时不外链任何图片。

官网页面没有为本仓库另行授予再分发许可。这些文件是应用户要求作为本地 / 内部产品参考图随包
带的。公开发布前要确认 Amazfit 的商标与图片再分发条款，必要时把截图衍生图换成有授权的
新闻素材，并保留来源 / 哈希审计。

## 图片质检

全部 51 对本地 WebP / 缩略图（50 个可连接的标准型号键，加上不支持的 Helio Armband 来源键；
GTR 4 重复配色共用一个键）都从原始 `design_picture/Product` 截图和记录在案的官方 CDN 来源
重新生成，没有拿任何已损坏的随包 WebP 当输入。Pillow 和 OpenCV GrabCut 从深色 / 彩色产品
像素给出保守的前景种子，多产品同框的 Helio Core/Armband 用显式的来源裁切。Helio Ring 的
中心和 GTS 4 Mini 的表带开口是有意保留的透明孔。二值透明蒙版先加边再裁，alpha 为零处的
RGB 清零，无损 WebP 用 `exact=True` 写出，防止解码时颜色渗出。Strap Pro 只在边缘做去白，
保住它浅色的金属件。

离线校验器检查：精确的 52 条 / 51 支持 / 50 标准 / 51 素材计数，WebP 与缩略图键集合一一
对应，RGBA 模式、尺寸、目录 SHA-256 哈希，透明的四角 / 边框，至少 8 px 的透明留白，与
边缘相连的中性背景残留，细小的高饱和噪点，以及不合理的封闭孔洞（允许表带 / 指环 / 手环的
有意开口和 GTS 4 Mini 的表带开口）。12 个必须人工抽查的全部通过：
`balance-3`、`active-2-square`、`t-rex-ultra-2`、`band-7`、`helio-strap`、
`helio-ring`、`helio-strap-pro`、`cheetah-2-pro`、`bip-6`、`gtr-4-46mm`、
`gts-4-mini` 和 `amazfit-up`。

## 重建与校验

维护脚本只用 Pillow / OpenCV 两个图像依赖，仓库不另装第二份。

```powershell
py -3 scripts/assets/build-device-catalog.py --catalog-only
py -3 scripts/assets/verify-device-assets.py
```

只改来源编号时用 `--catalog-only`：它按 `DEVICE_SOURCE_CODES` 更新目录，保留现有图片、
哈希和来源，只需要 Python 标准库。设备来源匹配在刷新设备列表时运行，与健康记录的
normalizer 修订号无关。旧缓存里没存来源编号，所以要刷新一次设备列表才生效。

历史的 `design_picture/Product` 截图已不在本机保留。完整重建图片要先提供脚本里点名的原始
截图；正常构建应用直接用已提交的图片。

只有在有意刷新那四张官方 CDN 图时才用 `--refresh-official`。校验器检查精确的目录 / 素材
计数、卡片审计覆盖、ID / 别名 / 型号代码唯一、RGBA 透明、尺寸、本地 WebP 与缩略图一一
引用，以及目录 SHA-256 哈希。
