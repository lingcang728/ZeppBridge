# 更新说明规范

应用内「已更新到 vX」弹窗（`src/components/shell/UpdateNotice.vue`）显示的就是这里的文件，每一版都按这份规范写。更新清单的渲染只有一份，在 `src/components/shell/ReleaseNotesList.vue`；改样式只改它，所有版本一起生效。

## 发版第一步：先写信

每一版（补丁版也算）都要有一封作者来信。信写什么都行，不限于更新；更新说明是单独一张信纸。写信是发版流程，不是界面功能：信装在应用里的信封里寄出，同时归档到官网 `zeppbridge.com/letters`。**信不进 GitHub Release 页**，发布页只写这一版的改动。

- 原稿：`docs/releases/letters/<版本>/zh.md`，作者本人用中文写；`en.md` 由作者审定。其余语言照原稿翻译。
- 格式：普通段落，段与段之间空一行；只认 `**加粗**`，不要标题、列表、链接、HTML。最后一段单独一行写落款（以 `——` 或 `—` 开头），界面会把它排成签名。
- 检查：`npm run letter:check [-- <版本>]`（`scripts/release/check-letter.mjs`）。它不在 CI 里，是发版约定：缺任何一种语言的信都不打 tag。`npm run package:release` 只提醒，自测包可以先打。
- Release 正文只有标题加英文更新说明（`release-core.mjs` 的 `tagMessage`），不接信。

### 读回信、写「上期回音」

用户在信封最后一张信纸上回信（应用里一个文字框，上限 5000 字，最多附 3 张截图），存在 D1 的 `letter_replies` 表。工具是 `scripts/letters/replies.mjs`（需要本机 wrangler 已登录，每个命令都可以加 `--dry-run` 只看 SQL）：

1. `export [--out <文件夹>]`：把没处理完的回信导成 Markdown 和 JSON，按关键词粗分类，附「我也遇到」计票。**导出目录必须在仓库外**，回信原文绝不进仓库。
2. `mark <id...> --category <#id> --status next|later|asking|fixed|declined [--fixed-in x.y.z]`：给回信定性。用户的信匣回执显示的就是这几项（已读 · 归入「补拉卡住」· 3.1.1 修）。`fixed` / `declined` 算处理完。
3. `prune`：从线上删掉处理完满 180 天的回信。这一步由维护者手动跑，不是服务端自动执行；删除前先 `export` 留底。没处理完的回信不会删。
4. 想说的话写进 `docs/releases/letters/<版本>/echo/zh.md`（可以不写）。导语是普通段落，每一条一行：`- next|later|asking #id: **标题**：一句话`。前缀不翻译（下版先修 / 推迟 / 继续征集），`#id` 小写、全局固定，回执「归入『…』」取的是这条的加粗标题。信纸上只画 `next` / `later` 两组，`asking` 条目不显示。只有允许匿名引用的回信才可以引用原话。
5. 回音写了就所有语言都要有，每种语言的 `#id` 和中文原稿同一组、同一顺序；`check-letter.mjs` 会查。

### 一对一回复某一封回信

不用等发版，随时可以回。用户的应用取回执时把作者回复一并取回，盖在「我的回信」那只信封上（D1 列 `author_reply` / `author_reply_at`，`migrations/0009_letter_author_reply.sql`）。

1. `replies.mjs show <id>`：看那封信的语言（`locale`）和原文。
2. 把作者的话译成那封信的语言；中文、英文的信直接用作者原话。译文回译给作者过目，作者同意之前不发。
3. 译文写进仓库外的文件，`replies.mjs reply <id> --file <文件> --dry-run` 先看 SQL，再去掉 `--dry-run` 发出。最长 2000 字；空文件 = 撤回。
4. 回复里**不写对方的个人信息**（名字、邮箱、地点）：拿到那台电脑 install id 的人也能读到作者回复。

### 这一版的邮票（可选）

每一版信封右上角贴一枚邮票，信匣集邮册里收一枚。票面图每版画一张，放 `docs/releases/letters/<版本>/stamp.jpg`（也认 `.webp` / `.png`）；没放就贴默认那枚（海拔山形，`src/components/letters/StampArt.vue`），面值照样印这一版的版本号。

- **只要画**：横版 5:4，至少 1000 × 800，jpg / webp 压到 300 KB 以内。
- **不要**字、面值、边框、齿孔、邮戳：齿孔白边、右上角面值（版本号）、邮戳都由界面画（`PostageStamp.vue` / `Postmark.vue`），每版版式一致。
- 右上角留一块不太花的地方，面值压在那里。

## 文件

- 一版一个目录：`docs/releases/<版本>/<locale>.md`，14 种界面语言各一份（zh、en、es、nl、pt-BR、pt-PT、de、ru、hi-IN、fr、it、pl、ko、zh-TW；繁体 zh-TW 从 3.1.1 起，韩语 ko 从 3.2.1 起（界面从 3.3.0 起）；之前的版本是 12 或 13 种）。
- 官网更新日志 `zeppbridge.com/changelog/` 也从这些文件生成（`scripts/site/changelog.mjs`，部署时由 `finish-dist.mjs` 写出），**只收已经打了 `v<版本>` 标签的版本**。3.0.1 是单文件旧格式 `docs/releases/3.0.1.md`，按 `## 中文` / `## English` 分段。3.0.1 以前的历史在仓库根目录的 `CHANGELOG.md`（已冻结）。
- 发版时把 `src/services/updateNotice.ts` 里的 `BUNDLED_VERSION` 和 glob 目录一起改成新版本；`updateNotice.test.ts` 会检查各语言齐全（繁体缺了回落简体）、和应用版本一致。
- 开发时先写 `zh.md` 和 `en.md`，其余语言照中文翻译。缺语言时弹窗回落英文，但测试会挂，所以打 tag 前要翻齐。

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
- 不夸大、不承诺：说「会」之前先确认已经做到；涉及官方接口的措辞对照 [`official-api-facts`](../reference/official-api-facts.zh-CN.md)。

## 弹窗的样式约定

- 弹窗不描外框；`ModalDialog` 面板自身不显示焦点框（启动时弹出会被当成键盘聚焦）。
- MiSans 只打包了 400 / 700 两档，600 也会画成粗体，所以**层次靠字号和颜色，不靠中间字重**：标题 `--fs-2xl`/700；分组名 `--fs-2xs` 常规 + 色点（新增绿、改进琥珀、修复红）；正文 `--fs-xs` 常规、`--muted` 色；开头加粗 700、`--ink` 色。
- 中文行里加粗段别以「」或括号收尾再接冒号（会排成「」：」）；用逗号或句号接后文。
- 需要先讲一件事再看改动时（如 3.0.2 的「为什么有些数据没有？」），用 `leadsWithWhyHalfData` 这类开关加一页，正文组件用卡片 / 小标签，不要写成大段文字。

## 怎么发

1. 版本号统一（`node scripts/release/check-version-consistency.mjs <版本>`），切 `updateNotice.ts` 的 `BUNDLED_VERSION` 和 glob，所有语言的更新说明和信齐全（`check-letter.mjs` 过），`npm run preflight` 全绿。
2. `npm run package:release` 打本地 Windows 包自测（只出 NSIS 安装包和便携 exe）。
3. 提交、`git push origin main`，等 main 的 CI 绿。改到打包相关文件（依赖、tauri 配置、`rust-toolchain.toml`、`packaging/`、发版脚本、工作流）时，这一次 CI 会顺带把三平台安装包实际打一遍，打包有问题在这里就暴露，不必等到打标签。
4. 打附注标签并推送。CI 随即构建 Windows（NSIS、MSI、便携 zip）、macOS（Apple Silicon dmg）、Linux（deb、rpm、AppImage）和 Flatpak，外加 CLI / MCP 工具包、`SHA256SUMS.txt` 和构建来源证明，创建 GitHub Release 并签 `latest.json`，已装用户随即收到更新：

   ```bash
   node scripts/release/tag-message.mjs 3.1.1 | git tag -a v3.1.1 --cleanup=verbatim -F -
   git push origin v3.1.1
   ```

## GitHub Release / tag 说明

tag 说明用英文（它随安装包发出去），内容就是标题加 `en.md`（`tag-message.mjs` 生成），同样一条一行、开头加粗；第一行是应用内更新提示；**不接作者来信**。正文里有 `##` 标题，所以要加 `git tag --cleanup=verbatim`。合入了外部 PR 的版本，正文末尾加一节 Contributors 列出作者。
