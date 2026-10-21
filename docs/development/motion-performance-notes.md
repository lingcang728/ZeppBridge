# 动效与性能笔记（参考 Telegram-iOS）

2026-10-21，批次 6「想法 6」。Telegram-iOS 是 GPL-2.0：**只读过、借思路，一行代码都没拷**。读的是
`DustEffect`（消息删除时化成灰）、`MetalEngine` 的共享渲染、`DeviceMetrics.Performance` 与「省电模式」设置。

## 他们怎么做

| 做法 | Telegram | 我们 |
|---|---|---|
| 灰的画法 | 拍一次快照成纹理；每像素一粒，粒子缓冲在 GPU 上初始化一次、之后每帧只更新；一次 instanced 画完 | 已经是同一个思路：`ashGlyphs` 取一次字形 → `ashDust` 一张整屏 WebGL 画布，位置在顶点着色器里按时间算（连更新都省了） |
| 帧驱动 | 一个共享 display link，有东西要动才订阅，图层不在屏幕上就退订 | `ashDust` 只在有灰时跑 rAF，灰飘完就收画布；rAF 在窗口隐藏时本来就停 |
| 步长 | 本帧间隔 ≤1ms 或 ≥200ms 视为异常，用标称步长 | 我们的灰按绝对时间算，不累加步长，卡一下不会「跳一截」；量帧时同样丢掉 ≥200ms 的异常帧 |
| 性能分档 | 按 CPU 核数判断「图形够不够用」，不够就默认关半透明和表情循环 | `performance.ts`：核数给上限，首启空闲时量 48 帧定档并记住 |
| 省电 | 电量低于阈值（默认 15%）自动进省电：关自动播放、循环、半透明 | 电量 ≤15% 且没充电时，「自动」特效档按低特效走；用电池时灰只画 30 帧、灰粒少四成 |
| 调试 | 帧 >20ms 在 debug 里打点 | 重特效的帧间隔只记在内存里，用来自适应降档，不写日志、不上报 |

## 落到代码

- `src/lib/motion/performance.ts`
  - `motionTier`：high / mid / low。`tierFromCores` 给上限，`tierFromFrames` 看 90 分位帧间隔（>22ms 中、>40ms 低），只降不升。
  - 自适应：重特效放完把帧间隔交回 `claimHeavy` 的释放函数；超过 33ms 的帧占三成以上算卡，**连续两次**卡才降一档并记住。
  - `claimHeavy(name)`：重特效名额，一次一个，同名可重入（换语言连拨）。拿不到就退成直接切换：换语言直接换字，信纸「知道了」直接收起。
  - `grainBudget()`：一屏灰粒上限 36k / 24k / 12k，用电池再 ×0.6。`frameFloorMs()`：用电池时两帧至少隔约 30ms。
  - `autoLite`：低档或低电量 → `useEffects` 的「自动」走低特效（`<html data-effects="lite">`：毛玻璃换不透明、形变和灰退成淡入淡出）。用户明确选「完整」不受影响。
- `ashDust`：跳帧 + 记帧；`ashGlyphs`：按 `grainBudget()` 取样；`ashDissolve` / `ashSwitch`：先要名额。
- 已有的 `budget.ts`（形变进行中时图表等重活让路）继续管「主线程让给形变」，和这里的「重特效一次一个」是两件事。

## 规矩

1. 动画只动 transform / opacity；模糊、遮罩只做静态（见 `animation-compositor-only` 的教训）。
2. 一个时刻只有一个重特效；后来的降级，不排队抢帧。
3. 量性能只在空闲、窗口可见时量；被切走就作罢，下次再量。
4. 帧数据只在内存，不进诊断报告、不上报。
5. 本机限制：不持续满载、不并行解码；测性能用 CPU 降速 4× + DPR 2（`measure-jank-throttled`）。

## 没做的

- 列表 `content-visibility: auto`：还没量过现有长列表（运动列表、生活事件）的收益，等有卡顿实例再按「降速量」的办法量了再加，不盲加。
- 离屏预渲染：WebView 里没有便宜的离屏合成路径，`whenFramesSteady` 先停在起点等帧平稳已经覆盖了首帧卡顿。
