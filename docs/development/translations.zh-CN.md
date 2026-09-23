# 翻译贡献指南

界面目前有十种语言：中文、English、Español、Nederlands、Português (Brasil)、
Português、Deutsch、Русский、हिन्दी、Français。本页说明每种语言存在哪里、
以及如何贡献修正或改进。

[English](translations.md)

## 语言层是怎么工作的

- 应用用的是自研的轻量 i18n 层（`src/i18n/index.ts`），不是 vue-i18n。
  文案跟着使用它的模块就地定义：`defineMessages(zh, en, es?, moduleId?)`。
- `zh` 和 `en` 是内联两份：zh 定义结构，en 必须全量（TypeScript 编译器强制），
  es 可以只写一部分、缺的键回落英文。
- 其余七种语言以语言包形式放在 `src/i18n/locales/`：
  `de.ts`、`fr.ts`、`hi-IN.ts`、`nl.ts`、`pt-BR.ts`、`pt-PT.ts`、`ru.ts`，
  用户选中时才懒加载。每个包有 `modules` 节（按 moduleId 组织，moduleId =
  `src/` 下相对路径去扩展名和 `.i18n` 后缀）、`errors` 节（后端 `err.*` 码）
  和 `backendText` 节（`ui.*` 码）。
- 包里缺的键会自动回落英文——部分贡献也有价值。
- 落地页（本站）有自己的语言开关和懒加载文案文件（`src/views/landing/`），
  刻意与应用语言包分开。

## 门禁：`npm run i18n:check`

`scripts/release/check-i18n.mjs` 会在每个 PR 上审计语言包：

- 包里的每个键必须在模块的 zh 文案里存在——来自旧版本的多余键会被拦下。
- zh 有而包里没翻的键必须列在该语言的 `<locale>.pending.txt` 里；
  用 `node scripts/release/check-i18n.mjs --write-pending` 重新生成清单。
- 与英文逐字节相同的叶子会被拦，除非登记在
  `src/i18n/locales/allowlist-en.txt`（品牌名、`bpm` 这类单位等本来就不翻的词）。
- 函数叶的参数个数必须与 zh 源一致；涉及数量的文案用包里已有的
  `plural()` helper——不要写死在 `1` 时会破的复数形式。

## 各语言的语域约定

一致性比单个措辞更重要。改包之前先翻翻它的已有条目、对齐风格：

| 语言 | 语域与约定 |
|---|---|
| `de` | 非正式 `du`，`ß` 正字法（de-DE，不用瑞士 `ss`） |
| `fr` | `vous`，« » 引号，冒号前空格 |
| `nl` | 非正式 `je`/`jouw` |
| `pt-BR` | `você`，动名词，巴西用词 |
| `pt-PT` | `tu` 祈使句，欧洲葡语用词（ecrã、ficheiro、registos） |
| `ru` | 礼貌 `вы`，« » 引号，复数三桶 |
| `hi-IN` | 礼貌 `आप`，天城文行文，技术名词保留拉丁写法 |

占位符（`${value}`）、HTML 标签和 markdown 标记要原样保留在原位置。
品牌与产品名（ZeppBridge、Zepp、Amazfit）、单位（`bpm`、`kg`）、
代码标识符不翻。

## 可以怎么帮

- **改措辞**：直接编辑 `src/i18n/locales/<locale>.ts` 里对应的叶子，提 PR。
  小而聚焦的 PR 最好审。
- **补 pending 键**：还没翻的键都列在 `<locale>.pending.txt`，
  每翻一条删一行。
- **校对**：母语审校多少都欢迎——直接在 PR 或 issue 里评论对应文案。
- **提议新语言**：先开 issue 讨论。新语言需要完整语言包、落地页文案文件
  以及 README/文档的配套，先对齐范围再动笔。
