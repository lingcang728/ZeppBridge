# Windows 代码签名（SignPath Foundation）

安装包没签名，浏览器下载信誉每版都从零开始，Chrome / Edge 会拦成「危险文件」、SmartScreen 提示未知发布者（3.0 反馈，见桌面 计划.md 批次 4）。打算申请 [SignPath Foundation](https://signpath.org/) 的免费开源签名；**还没申请，CI 还没接**——接法写在这里，批下来照着改。

## 申请前要备好的（用户来办）

SignPath Foundation 的条件（[terms](https://signpath.org/terms)）对照本仓库：

| 条件 | 现状 |
|---|---|
| OSI 许可证、无商业双授权、无闭源代码 | MIT ✅。MiSans 字体随包分发，它不是 OSI 许可——字体是资源不是代码，申请时如实说明 |
| 已发布、仍在维护 | ✅ |
| 从源码可验证地构建 | ✅ GitHub 托管 runner 构建（`ci.yml` 的 `package` 作业） |
| 每次签名前人工批准 | 定时发布的 `approve` 之外，SignPath 后台还要再点一次 |
| 首页公布签名策略 | 要加：README 或网站放 *Free code signing provided by SignPath.io, certificate by SignPath Foundation*，列出 Authors / Reviewers / Approvers 三个角色（目前都是 lingcang728） |
| 隐私声明：未经同意不传数据 | 已有 [security-and-privacy](../reference/security-and-privacy.md) 和 README「隐私与连接」 |
| 所有成员在 GitHub 和 SignPath 都开 MFA | 用户确认 |

申请通过后会拿到：组织 ID、项目 slug、签名策略 slug（一般是 `release-signing`）、一个 CI 用户的 API token。前三个放 Actions variables，token 放 secret `SIGNPATH_API_TOKEN`。

## 接法（批下来再改 `ci.yml`）

**坑：签名必须在 updater 签名之前。** `latest.json` 里的 `.sig` 是 Tauri 在 `tauri build` 时对安装包算的 minisign 签名；SignPath 改写了 exe 之后旧 `.sig` 就对不上，已装用户的自动更新会全部校验失败。所以不能「打完包再整包送签」。

顺序：

1. `npm run tauri build -- --no-bundle` 只编出 `ZeppBridge.exe`（和 sidecar `zeppbridge-mcp.exe`）。
2. `actions/upload-artifact` 上传这两个 exe → `signpath/github-action-submit-signing-request`（`wait-for-completion: true`）送签 → 用签好的覆盖原文件。
3. `npm run tauri bundle` 用签好的 exe 打 NSIS / MSI。
4. 安装包本身再送签一次（第 2 步同样的动作）。
5. 对签好的安装包重新算 updater 签名：`npx tauri signer sign -f <安装包>`（`TAURI_SIGNING_PRIVATE_KEY` 已在 secrets），覆盖 `.sig`；之后才 `merge-latest-json.mjs`。
6. 便携版 zip 里放第 2 步签好的 exe，`package-portable.ps1` 不用改。

SignPath 的项目里要按文件配置签名对象：`ZeppBridge.exe`、`zeppbridge-mcp.exe`、`zeppbridge-cli.exe` 用 PE 签名；NSIS 安装包按普通 PE；MSI 用 MSI 签名。元数据（产品名 `ZeppBridge`、版本号）要在签名策略里强制，和 `tauri.conf.json` 一致。

签名步骤用 `if: vars.SIGNPATH_ORGANIZATION_ID != ''` 守着，没配置时整段跳过、产物照旧未签名，这样 fork 和 PR 构建不受影响。

## 签完要核对

- `Get-AuthenticodeSignature release\ZeppBridge.exe` 是 `Valid`，签名者是 SignPath Foundation。
- 用 3.0.x 未签名版走一次自动更新到签名版（[静默更新端到端验法](../development/development.md)），确认 `.sig` 校验通过。
- 新签名的头几版 SmartScreen 仍可能提示——OV 证书的信誉要靠下载量攒，不是一签就消失；但 Chrome「危险文件」拦截应当消失。
