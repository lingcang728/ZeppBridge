# AI 插件

[English](README.md)

`zepp-coach/skills/zepp-coach/SKILL.md` 是配合 ZeppBridge MCP 服务器的教练技能：先读数据，
建议从保守，不做医学判断，按 `zeppbridge-plan/3` 格式起草计划，用户同意后才发布。

## 什么东西随哪里分发

| 部件 | 在哪 |
|---|---|
| `zeppbridge-mcp` | Windows 安装包和便携版里，紧挨 `ZeppBridge.exe`（sidecar，`src-tauri/tauri.sidecar.conf.json` + `scripts/release/stage-mcp-sidecar.ps1`）；无界面使用另有单独的 `zeppbridge-tools` 压缩包 |
| Claude Code 插件 | 仓库根的 `.claude-plugin/marketplace.json` → 本目录（`.claude-plugin/plugin.json`） |
| Codex 插件 | 仓库根的 `.agents/plugins/marketplace.json` → 本目录（`.codex-plugin/plugin.json`） |
| Claude Desktop | `ZeppBridge.mcpb`，由应用写出（`save_mcp_bundle`），因为它的清单必须指向已安装的 sidecar |

插件只带技能。MCP 服务器由应用复制出来的命令单独注册，因为它的路径每台机器都不一样。

## 设置里的按钮（设置 › AI 工具 › 接入 AI 工具）

| 客户端 | 按钮做什么 |
|---|---|
| Claude Code | 复制 `claude mcp add --scope user zeppbridge "--" "<path>" --scope task`、`claude plugin marketplace add lingcang728/ZeppBridge#v3`、`claude plugin install zepp-coach@zeppbridge` |
| Codex | 复制 `codex mcp add zeppbridge "--" "<path>" --scope task`、`codex plugin marketplace add lingcang728/ZeppBridge --ref v3`、`codex plugin add zepp-coach@zeppbridge` |
| Claude Desktop | 让你选一个文件夹，把 `ZeppBridge.mcpb` 存进去并在资源管理器里显示 |

命令来自 `src/lib/mcpClients.ts`。在 Windows 上有两个细节要紧：`"--"` 要加引号，因为
PowerShell 会在一个裸的 `--` 传到 npm 装的 `.ps1` 垫片之前把它吃掉；路径一律加双引号。当应用的
库不是 exe 旁边的 `data` 文件夹时，命令还会设置 `ZEPPBRIDGE_DATA_DIR`。

**3.0 还在 beta 时，插件市场的 ref 是 `v3`。** v3 合进 main 时把 `PLUGIN_MARKETPLACE_REF`
改成 `main`。

2026-10-09 用 Claude Code 2.1.295 和 Codex CLI 0.162.0 在一次性配置目录里验证过：两个市场都能
添加，插件能装上，复制出的 `mcp add` 命令存下的命令、参数和环境变量都对。`.mcpb` 还没装进
Claude Desktop 试过。

在任何地方写「本地模型也能用」之前，先真的测一个支持 MCP 的本地模型客户端。
