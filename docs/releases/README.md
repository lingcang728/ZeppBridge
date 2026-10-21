# 更新说明规范

应用内「已更新到 vX」弹窗（`src/components/shell/UpdateNotice.vue`）显示的就是这里的文件。**每一版都按这份规范写**（2026-10-19 用户定）；改渲染样式也只改那一个组件，所有版本一起生效。

## 第一步：先写信

**每一版都要有作者来信**（2026-10-20 用户定，补丁版也算，不降级成明信片）。信写什么都行，不限于更新——更新说明是单独一张信纸。写信是发版流程，不是界面功能：就算以后信封界面被砍了，信也照常寄出（GitHub Release 正文 + 官网 `zeppbridge.com/letters` 归档）。

- 原稿：`docs/releases/letters/<版本>/zh.md`，**用户本人用中文写**。开发会话不替用户写信，只能提醒。
- `en.md` 由开发会话译出、**用户亲自审**；其余 10 种语言登记到桌面《翻译.md》交给翻译 agent。
- 格式：普通段落，段与段之间空一行；只认 `**加粗**`，不要标题、列表、链接、HTML。最后一段单独一行写落款（以 `——` 或 `—` 开头），界面会把它排成签名。
- 门禁：`node scripts/release/check-letter.mjs [<版本>]`。从 3.0.7 起，`freeze.mjs add` 和定时发布在缺任何一种语言的信时拒绝；`npm run package:release` 只提醒（自测包可以先打，但「翻译完再打包」的规矩不变）。
- Release 正文：英文更新说明之后接一节 `## A letter from the author` + `en.md` 全文（`schedule-core.mjs` 的 `tagMessage`）。

### 读回信、写「上期回音」

用户在信封最后一张信纸上回信（应用里只有一个文字框，上限 1000 字），存在 D1 的 `letter_replies` 表。发版前：

1. `node scripts/letters/replies.mjs export`：把没处理完的回信导到 `桌面\回信\<日期>.md`（**仓库外，回信原文绝不进仓库**），按关键词粗分类，附「我也遇到」计票。
2. 读完给它们定性：`node scripts/letters/replies.mjs mark <id...> --category <#id> --status next|later|asking|fixed|declined [--fixed-in x.y.z]`。用户的信匣回执显示的就是这几项（已读 · 归入「补拉卡住」· 3.1.1 修）。`fixed` / `declined` 算处理完。
3. `node scripts/letters/replies.mjs prune`：处理完满 180 天的从线上删除（先 export 留底）。每个命令都可以加 `--dry-run` 只看 SQL。
4. 想说的话写进 `docs/releases/letters/<版本>/echo/zh.md`（可以不写）。导语是普通段落，每一条一行：`- next|later|asking #id: **标题**：一句话`，前缀不翻译（下版先修 / 推迟 / 继续征集），`#id` 小写、全局固定——回执「归入『…』」取的是这条的加粗标题。信纸上只画 `next` / `later` 两组，`asking`（继续征集）条目不显示、也没有「我也遇到」了（2026-10-21 用户：没意义），别再写。允许匿名引用的回信才可以引用原话。
5. 回音写了就 12 种语言都要有、每种语言的 `#id` 和中文原稿同一组同一顺序；`check-letter.mjs` 和冻结都会查。

### 这一版的邮票（可选）

每一版信封右上角贴一枚邮票、信匣集邮册里收一枚。票面图由用户每版画一张（如 gpt-image），放 `docs/releases/letters/<版本>/stamp.jpg`（也认 `.webp` / `.png`）；没放就贴默认那枚（海拔山形，`src/components/letters/StampArt.vue`），面值照样印这一版的版本号。

- **只要画**：横版 5:4，至少 1000 × 800，jpg / webp 压到 300 KB 以内。
- **不要**字、面值、边框、齿孔、邮戳——齿孔白边、右上角面值（版本号）、邮戳都由界面画（`PostageStamp.vue` / `Postmark.vue`），每版版式一致。
- 右上角留一块不太花的地方，面值压在那里。

## 文件

- 一版一个目录：`docs/releases/<版本>/<locale>.md`，12 种界面语言各一份（zh、en、es、nl、pt-BR、pt-PT、de、ru、hi-IN、fr、it、pl）。
- 发版时把 `src/services/updateNotice.ts` 里的 `BUNDLED_VERSION` 和 glob 目录一起改成新版本；`updateNotice.test.ts` 会检查 12 种语言齐全、和应用版本一致。
- **开发会话只写 `zh.md` 和 `en.md`**，其余 10 种语言登记到桌面《翻译.md》，交给翻译 agent。缺语言时弹窗回落英文，但门禁会挂，所以打 tag 前要翻齐。

## 每一行怎么写

```markdown
- 修复：**一句话说清改了什么（#136）**：后面补一两句细节。
- 改进：**……**。……
- 新增：**……**。
```

- **一条一行**，以 `- ` 开头，前缀固定：`新增：` / `改进：` / `修复：`（英文 `Added:` / `Improved:` / `Fixed:`；其他语言照 `releaseRows` 认得的词写，认不出的归到「更新」组）。弹窗按「新增 → 改进 → 修复」分组显示，文件里的顺序就是组内顺序。
- **开头一小段用 `**加粗**`**：读者扫一眼加粗就知道这条讲什么。每条只加粗一处，别整句加粗。
- 加粗之后最多两句，写用户看得到的变化，不写实现。issue 编号放在加粗里或句末。
- 只支持 `**加粗**`；不支持链接、图片、表格、HTML（更新清单里的文字永远按纯文本渲染，见 `emphasis()`）。`##` 标题行会被忽略，不要用来分段。
- 不夸大、不承诺：说「会」之前先确认已经做到；涉及官方接口的措辞对照 `docs/development/v3-plan.md`。

## 弹窗的样式约定

- 弹窗不描外框；`ModalDialog` 面板自身不显示焦点框（启动时弹出会被当成键盘聚焦）。
- MiSans 只打包了 400 / 700 两档，600 也会画成粗体，所以**层次靠字号和颜色，不靠中间字重**：标题 `--fs-2xl`/700；分组名 `--fs-2xs` 常规 + 色点（新增绿、改进琥珀、修复红）；正文 `--fs-xs` 常规、`--muted` 色；开头加粗 700、`--ink` 色。
- 中文行里加粗段别以「」或括号收尾再接冒号（会排成「」：」）；用逗号或句号接后文。
- 需要先讲一件事再看改动时（如 3.0.2 的「为什么有些数据没有？」），用 `leadsWithWhyHalfData` 这类开关加一页，正文组件用卡片 / 小标签，不要写成大段文字。

## 什么时候发

冻结、排期、批准和自动打 tag 见 [`scheduling.md`](scheduling.md)。

## GitHub Release / tag 说明

tag 说明用英文（随安装包发出去，见 CLAUDE.md），内容就是 `en.md`，同样一条一行、开头加粗；第一行是应用内更新提示。正文里有 `##` 标题时 `git tag --cleanup=verbatim`。
