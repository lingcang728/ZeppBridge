# AI plugins (draft)

`zepp-coach/skills/zepp-coach/SKILL.md` is the coaching skill that goes with the
ZeppBridge MCP server: read the data first, advise conservatively, no medical
judgements, draft plans in the `zeppbridge-plan/3` format, publish only after the
user agrees.

Not packaged yet. Shipping it as a Claude Code plugin, a Codex plugin or a
Claude Desktop `.mcpb` needs one decision first: `zeppbridge-mcp` is distributed
separately from the desktop installer (see `scripts/release/package-tools.ps1`),
so a plugin cannot assume where the binary is. Until that is settled, the skill
can be copied into any client's skills folder by hand, next to an MCP
configuration that points at `zeppbridge-mcp`
(see [docs/reference/cli-and-mcp.md](../../docs/reference/cli-and-mcp.md)).
