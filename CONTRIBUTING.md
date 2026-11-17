# Contributing · 参与贡献

Thanks for helping. ZeppBridge is a small project, so a short, focused pull request is the easiest to review.

谢谢你愿意帮忙。ZeppBridge 是个小项目，改动小而集中的 PR 最容易审。

## Before you start · 开始之前

- Bugs and data problems: use the [issue forms](https://github.com/lingcang728/ZeppBridge/issues/new/choose). For anything bigger than a fix, open an issue first so we can agree on the approach. · 报 bug 和数据问题请用 issue 表单；比修 bug 大的改动请先开 issue 商量做法。
- Security problems: see [SECURITY.md](SECURITY.md), not a public issue. · 安全问题按 [SECURITY.md](SECURITY.md) 私下报告。
- Read [AGENTS.md](AGENTS.md): it lists the repository rules (contracts, migrations, i18n, what must never be committed). · 先读 [AGENTS.md](AGENTS.md)：契约、迁移、多语言和绝不能提交的东西都在里面。

## Build and test · 构建与测试

Setup and the full command list are in [development](docs/development/development.md) ([中文](docs/development/development.zh-CN.md)). Before opening a PR, run:

```bash
npm ci
npm run build
npm test
npm run test:functions
npm run i18n:check
npm run docs:check
```

If you touched Rust (`src-tauri/`):

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --workspace --locked --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --workspace --locked
```

`--workspace` matters: the repository is a cargo workspace (app, core, cli, mcp).

## Pull requests · 提交 PR

- Branch from `main`; PRs target `main`. CI runs Windows, macOS and Linux checks. Documentation-only PRs take a faster path. · 从 `main` 开分支、合回 `main`；CI 跑三平台检查，只改文档的 PR 走快速通道。
- Interface text: write Chinese and English with `defineMessages`, then run `npm run i18n:check -- --write-pending` so the other languages get queued for translation. Don't machine-translate them yourself. · 界面文案写中文和英文，然后跑 `npm run i18n:check -- --write-pending` 把其余语言排进待翻译清单，不要自己机翻。
- Never commit tokens, cookies, HAR files, precise GPS or real health values. Test data must be made up. · 不要提交令牌、Cookie、HAR、精确 GPS 或真实健康数值，测试数据用虚构值。
- No missing value may be drawn as `0`: show "—" or "not provided" instead. · 缺失值不能画成 `0`，显示 “—” 或 “未提供”。
- Release notes and version numbers are handled by the maintainer at release time; you don't need to edit them. · 更新说明和版本号由维护者发版时处理，PR 里不用改。

By contributing you agree that your work is released under the repository's [license](LICENSE).
