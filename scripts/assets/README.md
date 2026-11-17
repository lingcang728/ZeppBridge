# 设备目录与图片（维护者用）

[`build-device-catalog.py`](build-device-catalog.py) 生成 `src/assets/devices/catalog.json`（被 `include_str!` 编进 Rust，别手改），
[`verify-device-assets.py`](verify-device-assets.py) 校验目录和图片。匹配规则与收录约定见
[设备目录参考](../../docs/reference/device-catalog.zh-CN.md)。

## 只改来源编号

```bash
python3 scripts/assets/build-device-catalog.py --catalog-only   # Windows: py -3
python3 scripts/assets/verify-device-assets.py
```

`--catalog-only` 按脚本里的编号表更新目录，保留现有图片、哈希和来源说明，只需要 Python 标准库。
设备来源匹配在刷新设备列表时运行，和健康记录的 `NORMALIZER_REVISION` 无关；旧缓存没存来源编号，刷新一次设备列表才生效。

## 校验器

`verify-device-assets.py` 需要 Pillow 和 OpenCV。它检查精确的条目 / 支持 / 标准型号 / 素材计数
（改了条目或图片就同步改脚本顶部的 `EXPECTED_*`），WebP 与 `-thumb` 一一对应、RGBA、尺寸、
目录里的 SHA-256、透明四角与至少 8 px 留白、背景残留、细碎噪点和不合理的封闭孔洞
（表带、指环的有意开口除外），以及卡片审计覆盖和 ID / 别名 / 型号代码唯一。它目前没接进 CI，改图后手动跑。

## 重建图片

完整重建需要脚本里点名的原始官网截图（仓库里没有）；正常构建直接用已提交的图片。
`--refresh-official` 只在有意刷新那几张官方 CDN 图时用。处理流程：Pillow + OpenCV GrabCut 取前景、
加边后裁切、alpha 为零处 RGB 清零、无损 WebP 用 `exact=True` 写出。

`device-catalog-audit.json` / `.csv` 记录最初 48 张官网卡片逐张对应到哪个目录条目，由构建脚本写出。
