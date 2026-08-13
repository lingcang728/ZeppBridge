# Contributing to ZeppBridge

感谢你愿意改进 ZeppBridge。这个项目处理个人健康数据和非官方上游接口，因此可复现性、隐私与诚实的能力边界比功能数量更重要。

## 开始之前

1. 先搜索现有 issue，确认问题尚未有人跟进。
2. Bug 报告请说明 Windows 版本、ZeppBridge 版本、操作步骤、预期与实际结果。
3. 日志和截图必须删除 token、用户 ID、设备 ID、局域网地址和个人健康值。
4. 不要提交绕过证书固定、平台安全策略或访问他人账号的实现。

## 本地开发

```powershell
npm ci
npm run tauri dev
```

提交前运行：

```powershell
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo check --manifest-path src-tauri/Cargo.toml --locked --all-targets
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --locked --jobs 1
```

## Pull Request 原则

- 一个 PR 聚焦一个问题，说明用户可见变化与验证证据。
- 新接口响应必须使用最小化、脱敏或合成 fixture。
- 不确定的数据字段保持 `unknown` 或 `unverified`，不要根据相似字段猜测。
- 不要为了让门禁通过而降低测试强度或删除真实功能。
- UI 改动需检查深色、浅色、键盘操作和 760px 最小窗口。

提交贡献即表示你同意按项目的 [MIT License](LICENSE) 授权该贡献。

