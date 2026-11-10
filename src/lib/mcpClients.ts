/* 「连到本地 AI」各客户端的预设（3B 起；3.1.2 加 OpenCode / Grok Build / Factory）。
 *
 * 路径来自后端 get_mcp_sidecar：安装包把 zeppbridge-mcp 放在 ZeppBridge.exe 旁边。
 * 3.1.2 起默认读整个库（不带参数）；设置里「只给共享任务」开着时才带 `--scope task`。
 * 只写查实过的格式：DeepSeek Harness 这类没有公开格式的，用通用 JSON，不猜。
 *
 * 两处 Windows 上的坑：
 * - npm 装的 claude / codex / opencode 是 .ps1 外壳，PowerShell 会把裸的 `--` 当成「参数结束」
 *   吞掉，后面的参数就被当成 CLI 自己的。写成 "--" 在 PowerShell 和 cmd 里都原样传下去。
 * - 路径可能带空格，一律加双引号。
 */
import type { McpClientId, McpSidecar } from './bridge/types';

/** 客户端的名字是产品名，不翻译。 */
export const MCP_CLIENT_NAMES: Record<McpClientId, string> = {
  claude_desktop: 'Claude Desktop',
  claude_code: 'Claude Code',
  codex: 'Codex',
  opencode: 'OpenCode',
  grok: 'Grok Build',
  factory: 'Factory',
};

const isStale = (sidecar: McpSidecar, client: McpClientId) =>
  !!sidecar.stale_clients?.includes(client) || !!sidecar.scope_stale_clients?.includes(client);

/** 插件市场所在的分支：3.0 起 v3 已合进 main。 */
export const PLUGIN_MARKETPLACE_REF = 'main';
const PLUGIN_REPO = 'lingcang728/ZeppBridge';
const PLUGIN_ID = 'zepp-coach@zeppbridge';

/** 「只给共享任务」开着才带 `--scope task`（McpTaskScopes）。 */
export const serverArgs = (sidecar: McpSidecar | null): string[] =>
  sidecar?.task_only ? ['--scope', 'task'] : [];

const quote = (value: string) => `"${value}"`;

const envFlag = (flag: string, sidecar: McpSidecar) =>
  sidecar.data_dir_env ? [flag, quote(`ZEPPBRIDGE_DATA_DIR=${sidecar.data_dir_env}`)] : [];

const serverLaunch = (sidecar: McpSidecar, path: string) => [quote('--'), quote(path), ...serverArgs(sidecar)];

/** Claude Code：注册 MCP + 装 zepp-coach 技能插件。sidecar 缺失时返回 null。 */
export const claudeCodeCommands = (sidecar: McpSidecar): string | null => {
  if (!sidecar.path) return null;
  return [
    // 登记过旧版（或另一种范围）时先删掉同名的那条，否则 add 会报「已存在」。
    ...(isStale(sidecar, 'claude_code') ? ['claude mcp remove zeppbridge --scope user'] : []),
    // -e 是可变长参数，放在 --scope 前面，由 --scope 截断，不会吞掉服务名。
    ['claude', 'mcp', 'add', ...envFlag('-e', sidecar), '--scope', 'user', 'zeppbridge', ...serverLaunch(sidecar, sidecar.path)].join(' '),
    `claude plugin marketplace add ${PLUGIN_REPO}#${PLUGIN_MARKETPLACE_REF}`,
    `claude plugin install ${PLUGIN_ID}`,
  ].join('\n');
};

/** Codex：同上，Codex 的插件市场用 --ref 指分支。 */
export const codexCommands = (sidecar: McpSidecar): string | null => {
  if (!sidecar.path) return null;
  return [
    ...(isStale(sidecar, 'codex') ? ['codex mcp remove zeppbridge'] : []),
    ['codex', 'mcp', 'add', ...envFlag('--env', sidecar), 'zeppbridge', ...serverLaunch(sidecar, sidecar.path)].join(' '),
    `codex plugin marketplace add ${PLUGIN_REPO} --ref ${PLUGIN_MARKETPLACE_REF}`,
    `codex plugin add ${PLUGIN_ID}`,
  ].join('\n');
};

/** OpenCode（v2）：`opencode mcp add [--global] [--env K=V] <名字> -- <命令…>`，写进全局配置。
 * 它没有 remove 子命令：登记过旧的，界面提示先在 OpenCode 的配置里删掉那条。 */
export const opencodeCommands = (sidecar: McpSidecar): string | null => {
  if (!sidecar.path) return null;
  return ['opencode', 'mcp', 'add', '--global', ...envFlag('--env', sidecar), 'zeppbridge', ...serverLaunch(sidecar, sidecar.path)].join(' ');
};

/** Grok Build：`grok mcp add -s user [-e K=V] <名字> <路径> [-- 参数…]`，写进 ~/.grok/config.toml；
 * add 本身就是「添加或更新」，不用先删。 */
export const grokCommands = (sidecar: McpSidecar): string | null => {
  if (!sidecar.path) return null;
  const args = serverArgs(sidecar);
  return ['grok', 'mcp', 'add', '-s', 'user', ...envFlag('-e', sidecar), 'zeppbridge', quote(sidecar.path), ...(args.length ? [quote('--'), ...args] : [])].join(' ');
};

const serverEntry = (sidecar: McpSidecar | null, placeholder: string, extra: Record<string, unknown> = {}) => {
  const server: Record<string, unknown> = { ...extra, command: sidecar?.path ?? placeholder, args: serverArgs(sidecar) };
  if (sidecar?.data_dir_env) server.env = { ZEPPBRIDGE_DATA_DIR: sidecar.data_dir_env };
  return server;
};

/** Factory（droid）：~/.factory/mcp.json 里的一段。CLI 要把整条命令塞进一个字符串，路径带空格时不好写，所以给 JSON。 */
export const factoryConfig = (sidecar: McpSidecar | null, placeholder: string): string =>
  JSON.stringify({ mcpServers: { zeppbridge: serverEntry(sidecar, placeholder, { type: 'stdio' }) } }, null, 2);

/** 其他 MCP 客户端通用的 JSON（mcpServers 写法）。没附带 sidecar 时用占位路径。 */
export const genericMcpConfig = (sidecar: McpSidecar | null, placeholder: string): string =>
  JSON.stringify({ mcpServers: { zeppbridge: serverEntry(sidecar, placeholder) } }, null, 2);

/** 复制命令的预设（Claude Desktop 存扩展包，不在这里）。 */
export const COMMAND_PRESETS: { id: McpClientId; build: (sidecar: McpSidecar) => string | null }[] = [
  { id: 'claude_code', build: claudeCodeCommands },
  { id: 'codex', build: codexCommands },
  { id: 'opencode', build: opencodeCommands },
  { id: 'grok', build: grokCommands },
];
