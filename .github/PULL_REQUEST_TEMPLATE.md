## What changed · 改了什么

<!-- One or two sentences. Link the issue if there is one. · 一两句话，有 issue 就贴上。 -->

## How you checked it · 怎么验证的

<!-- Commands you ran, screenshots for UI changes (redact accounts and health values). · 跑了哪些命令；改界面请附截图（遮住账号和健康数值）。 -->

## Checklist

- [ ] `npm run build` and `npm test` pass · 通过
- [ ] Touched Rust: `cargo fmt` / `clippy -D warnings` / `cargo test --workspace` pass · 改了 Rust 时三项都过
- [ ] New interface text has Chinese and English, and `npm run i18n:check -- --write-pending` was run · 新文案有中英文，并跑过 `--write-pending`
- [ ] No tokens, real health values or precise GPS in code, tests, logs or screenshots · 代码、测试、日志、截图里没有令牌、真实健康数值或精确 GPS
