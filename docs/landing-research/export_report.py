from pathlib import Path
import re
import json

root = Path('C:/Users/15pro/Desktop/MyProject/ZeppBridge')
research = root / 'docs/landing-research'
desktop = Path('C:/Users/15pro/Desktop/ZeppBridge落地页优化.md')
manifest = json.loads((research / 'manifest.json').read_text(encoding='utf-8'))
first = [research / f'batch-{i:02d}.md' for i in range(1, 11)]
supplement = [research / f'supplement-{i:02d}.md' for i in range(1, 6)]
assert all(p.is_file() for p in first + supplement), 'All fifteen collection reports must be present before export'

def nest(text):
    return re.sub(r'^(#{1,6}) ', lambda m: '#' * min(6, len(m.group(1)) + 2) + ' ', text, flags=re.M)

parts = ['''# ZeppBridge落地页优化

研究日期：2026-10-07（Asia/Taipei）。本文件是当前任务的完整研究与实施交接文档。

## 阅读说明与范围

用户提供三张 a16z 榜单：收入前 50、移动月活前 50、网页访问前 50。它们不是落地页设计评奖。150 个位置去重后得到 **112 个产品入口**（仅合并 OpenAI/ChatGPT、Anthropic/Claude 后为 110 个品牌标签；不代表按全部母公司合并的企业数）。第一轮以 100 个主入口、12 个补充入口覆盖全部图片；第二轮另研究 **50 个相关品牌网站**。

第一轮由 10 个 GPT-6 Luna high 并发收集，第二轮由 5 个 GPT-6 Luna high 并发深入收集。修改阶段限定为 2 个 GPT-6.1 Sol high，主调度负责整合与验收。研究结论按已观察的页面、文字证据和设计推断区分；没有独立设计奖项或编辑证据的新增品牌以相关性/编辑判断纳入，不冒称得奖。

本文中文综合和执行说明在前，全部逐站原始详细报告在后。原始报告保留英文原文与原始来源，避免翻译时丢失测量、访问限制和身份核验信息。每个条目都包含特色、页面/导航/字体/动效、ZeppBridge 关联及取舍；被阻挡的部分明确未知。查找品牌名可直达对应报告。

项目：`C:/Users/15pro/Desktop/MyProject/ZeppBridge`，当前 v3 开发分支。网站仅本地修改/预览；部署到 zeppbridge.com 等待用户审阅认可。本任务没有发布 beta 包、tag、Release 或 push。真实健康库不得用于验收，演示必须使用合成示例数据。

目录：

1. 综合原则、品牌关联与证据边界
2. ZeppBridge 改造前现状
3. 调整方向、文件分工与文案契约
4. 第二轮 50 个网站的综合增补
5. 修改结果与验收交接
6. 第一轮全部逐站详情（100 主入口 + 12 补充入口）
7. 第二轮全部逐站详情（50 个新增品牌）

## 1. 综合原则、品牌关联与证据边界

''']
parts.append(nest((research / 'synthesis.md').read_text(encoding='utf-8')))
parts.append('\n## 2. ZeppBridge 改造前现状\n\n')
parts.append(nest((research / 'local-audit.md').read_text(encoding='utf-8')))
parts.append('\n## 3. 调整方向、文件分工与文案契约\n\n')
parts.append(nest((research / 'IMPLEMENTATION-BRIEF.md').read_text(encoding='utf-8')))
parts.append('\n## 4. 第二轮 50 个网站的综合增补\n\n')
addon = research / 'supplement-synthesis.md'
assert addon.is_file(), 'Second-pass synthesis must exist'
parts.append(nest(addon.read_text(encoding='utf-8')))
parts.append('\n## 5. 修改结果与验收交接\n\n')
handoff = research / 'verification.md'
parts.append(nest(handoff.read_text(encoding='utf-8')) if handoff.exists() else '研究已汇总；实施与最终浏览器验收尚未完成。主调度将在完成后更新本节；此状态不能被当作已上线或验收通过。\n')
parts.append('\n## 6. 第一轮全部逐站详情\n\n')
for batch, path in zip(manifest['batches'], first):
    parts.append(f'\n### 分组 {batch["batch"]:02d}\n\n')
    parts.append('主入口：' + '、'.join(batch['core']) + '。\n\n补充：' + '、'.join(batch['supplement']) + '。\n\n')
    parts.append(nest(path.read_text(encoding='utf-8')))
parts.append('\n## 7. 第二轮全部逐站详情\n\n')
for i, path in enumerate(supplement, 1):
    parts.append(f'\n### 深入分组 {i:02d}\n\n')
    parts.append(nest(path.read_text(encoding='utf-8')))
parts.append('\n## 文档与证据维护\n\n本桌面文件由当前仓库 `docs/landing-research/` 下的十五份报告、综合与验收记录完整汇编。修改和复核应先更新对应来源，再用仓库中的 docs/landing-research/export_report.py 重建桌面文件。原始截图/HTML/JSON 的绝对路径逐批列出，均为临时证据，可随本机清理失效；关键结论、URL、测量与限制已保留在本文件。外部网页可能随时间、地区、登录状态和 A/B 测试变化，后续实现不得把这次快照当作永恒事实。\n')
content = '\n'.join(parts)
desktop.write_text(content, encoding='utf-8')
print(json.dumps({'path': str(desktop), 'bytes': desktop.stat().st_size, 'characters': len(content), 'reports': 15, 'product_entries_first_pass': 112, 'supplement_brands': 50}, ensure_ascii=False))
