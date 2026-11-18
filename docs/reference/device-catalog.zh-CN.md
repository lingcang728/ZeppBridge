# Amazfit 官方设备目录

[English](device-catalog.md)

`src/assets/devices/catalog.json` 由
[`scripts/assets/build-device-catalog.py`](../../scripts/assets/build-device-catalog.py)
生成并编进应用。共 66 条：65 条是 `active`/`supported`，覆盖 63 个标准型号键；
Helio Armband 只为留存来源列出，标为 `status=accessory`、`supported=false`。里面的日期各指一件事：
型号清单 2026 年 8 月最初按 Amazfit 日本官网整理，文件里的 `checked_at` 是最近一次整份核对，
`deviceSource` 编号 2026-11-02 按 Zepp 官方对照表逐条核过。

图片：52 个图片键（104 个 WebP，每键一张图和一张 `-thumb`）覆盖有图的条目。48 条用官网截图裁出的图，
4 条用 Amazfit 官方 CDN 图，1 条（Amazfit Smart Scale）是官方图经 AI 辅助加了透明留白，
另有 13 条（Balance 2 XT、Pace、Bip S、初代 T-Rex、T-Rex Dual Solar、小米体脂秤 2 这类老型号或只在零售渠道卖的）还没有图，显示通用占位图。
同一型号的配色共用一个键。

来源编号维护在目录的 `device_source_codes`（其中来自官方表的另列在 `device_source_official`）
和构建脚本的 `OFFICIAL_DEVICE_SOURCE_CODES` / `CROWD_DEVICE_SOURCE_CODES` 里。最初 48 张官网卡片的逐张对应关系在
[`scripts/assets/device-catalog-audit.json`](../../scripts/assets/device-catalog-audit.json)（另有 `.csv`）。

## 匹配约定

1. 先拿 `deviceSource` 编号对 `device_source_codes`。有的账号返回的设备列表根本没有产品名
   字段（issue #4），这时这些整数就是报文里唯一的型号类事实。
2. 再对稳定的型号代码（已知的例子：T-Rex 3 是 `A2322`/`A2323`，Helio Ring 是 `A2321`）。
3. `productName`/`deviceName` 与规范化后的别名精确匹配。
4. 完整的多词或带编号的别名可以出现在显示昵称里（例如 `我的 T-Rex 3`）。
5. 绝不做通用模糊匹配。过不了上面任何一条的，一律保持 `unknown`。

### `device_source_codes` 从哪来

**以 Zepp 官方开发者文档的对照表为准**：
[docs.zepp.com › Reference › Device List](https://docs.zepp.com/docs/reference/related-resources/device-list/)
（中英两版一致，`*` 标国行，2026-11-02 逐条核对）。官方表一并裁决了以前众包里吵不出结果的
编号（`10813699` = Active Max、`11141376` = Balance 3、`7995649` = GTS 4、`8454401` = Bip 5）。

3.1.1 之前，编号来自用户在应用里手动指认、并选择分享出来的型号。这条上报已经删掉；
当时收下、官方表里没有的那一小批（Helio Strap / Strap Pro / Ring、Balance 2 XT、
Balance 2 的 `10486017` 等）**冻结保留**，不再增加。现在反馈报告只带「目录认不出的
`deviceSource` 编号」，用来发现官方表更新了什么，工具见[反馈分拣](../../scripts/feedback/README.md)。

规则由
[`scripts/assets/build-device-catalog.py`](../../scripts/assets/build-device-catalog.py)
执行，`device_catalog` 单元测试守着：

* **只认 `deviceSource`，绝不用 `deviceType` 认型号。** `deviceType` 是族码（0 = 表 / 手环、
  1 = 体脂秤、7 = 耳机）：反馈数据里光 `deviceType:0` 就横跨二十个不同型号。它只用来分大类：
  认不出型号、`deviceType` 为 1 的设备显示成「体脂秤」，不算未识别设备。
* **低段（< 1,000,000）只收官方表列出的。** 老表本来就是低位（`418` = T-Rex 2、`254` =
  Band 7）。官方表没有的 `15` / `101`–`104` 一律不收——反馈库里 `101`–`104` 全都带着
  `deviceType:1`，是体脂秤那一行被用户指认成了自己的表。
* **一个编号只能指向一款。** 官方表和冻结的众包撞号时脚本直接报错。

相邻几个编号对应同一产品是正常的：低位编码的是配色 / 尺寸 / 国行变体。

账号里的原始昵称留在 `name`/`display_name`；目录补上 `canonical_name`、`display_name`、
`name_zh` 和 `catalog_id`。`user_fused` 和来源不明的记录永远不认领实体设备。

## 本地图片与授权

有图的条目都对应 [`src/assets/devices/`](../../src/assets/devices/) 下的一张 RGBA WebP 和一张
`-thumb.webp`；没图的用占位图。`catalog.json` 里的 `asset_hash` 是随包 WebP 的 SHA-256。
`src/lib/deviceCatalog.ts` 用 `import.meta.glob` 找文件。运行时不外链任何图片。

**授权还没解决。** 官网截图衍生图和 CDN 图都是 Amazfit 的产品照片，官网没有给本仓库再分发许可，
而应用已经公开分发（GitHub 和 Microsoft Store）。在拿到有授权的新闻素材或 Amazfit 许可之前，
这些图是已知风险；随时可以整体换回占位图。

重建目录、校验图片属于维护工作，见 [`scripts/assets/README.md`](../../scripts/assets/README.md)。
