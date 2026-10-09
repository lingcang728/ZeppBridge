# AI plugins

`zepp-coach/skills/zepp-coach/SKILL.md` is the coaching skill that goes with the
ZeppBridge MCP server: read the data first, advise conservatively, no medical
judgements, draft plans in the `zeppbridge-plan/3` format, publish only after the
user agrees.

## What ships where

| Piece | Where |
|---|---|
| `zeppbridge-mcp` | Next to `ZeppBridge.exe` in the Windows installer and the portable build (sidecar, `src-tauri/tauri.sidecar.conf.json` + `scripts/release/stage-mcp-sidecar.ps1`), and in the separate `zeppbridge-tools` archive for headless use |
| Claude Code plugin | `.claude-plugin/marketplace.json` at the repository root → this directory (`.claude-plugin/plugin.json`) |
| Codex plugin | `.agents/plugins/marketplace.json` at the repository root → this directory (`.codex-plugin/plugin.json`) |
| Claude Desktop | `ZeppBridge.mcpb`, written by the app (`save_mcp_bundle`) because its manifest must point at the installed sidecar |

The plugins carry the skill only. The MCP server is registered separately by
the command the app copies, because its path differs on every machine.

## The settings buttons (Settings › AI tools › Connect an AI tool)

| Client | What the button does |
|---|---|
| Claude Code | Copies `claude mcp add --scope user zeppbridge "--" "<path>" --scope task`, `claude plugin marketplace add lingcang728/ZeppBridge#v3`, `claude plugin install zepp-coach@zeppbridge` |
| Codex | Copies `codex mcp add zeppbridge "--" "<path>" --scope task`, `codex plugin marketplace add lingcang728/ZeppBridge --ref v3`, `codex plugin add zepp-coach@zeppbridge` |
| Claude Desktop | Asks for a folder, saves `ZeppBridge.mcpb` there and shows it in Explorer |

The commands come from `src/lib/mcpClients.ts`. Two details matter on Windows:
`"--"` is quoted because PowerShell drops a bare `--` before it reaches the
npm-installed `.ps1` shims, and paths are always double-quoted. When the app's
library is not the `data` folder next to the executable, the commands also set
`ZEPPBRIDGE_DATA_DIR`.

**The marketplace ref is `v3` while 3.0 is in beta.** Switch
`PLUGIN_MARKETPLACE_REF` to `main` when v3 is merged.

Verified on 2026-10-09 with Claude Code 2.1.295 and Codex CLI 0.162.0 in
throwaway config directories: both marketplaces add, the plugin installs, and
the copied `mcp add` commands store the right command, arguments and
environment. The `.mcpb` has not been installed into Claude Desktop yet.

Before writing "local models work too" anywhere, test one local-model MCP client
for real.
