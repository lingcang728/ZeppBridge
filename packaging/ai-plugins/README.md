# AI plugins (draft)

`zepp-coach/skills/zepp-coach/SKILL.md` is the coaching skill that goes with the
ZeppBridge MCP server: read the data first, advise conservatively, no medical
judgements, draft plans in the `zeppbridge-plan/3` format, publish only after the
user agrees.

## Packaging decision (2026-10-09)

`zeppbridge-mcp` will ship **inside the desktop installer** as a sidecar next to
`ZeppBridge.exe` (about 6 MB more), in addition to the separate
`zeppbridge-tools` archive for headless use. That way the desktop app always
knows the real path of the MCP binary, and the settings card can offer three
ready-to-use buttons:

| Client | What the button does |
|---|---|
| Claude Code | Copies `claude mcp add zeppbridge -- "<path>" --scope task` (or offers the plugin) |
| Codex | Copies the `[mcp_servers.zeppbridge]` block for `~/.codex/config.toml` |
| Claude Desktop | Saves a `.mcpb` bundle whose manifest points at the sidecar |

The Claude Code plugin (`.claude-plugin/marketplace.json` at the repository root,
plugin = this skill + MCP config) and the Codex plugin reuse this same skill.
Nothing here is wired up yet; until it is, copy the skill into a client's skills
folder by hand next to an MCP configuration that points at `zeppbridge-mcp`
(see [docs/reference/cli-and-mcp.md](../../docs/reference/cli-and-mcp.md)).

Before writing "local models work too" anywhere, test one local-model MCP client
for real.
