/* 「连到 Claude Code / Codex / Claude Desktop」按钮复制的命令（3B）。
 *
 * 路径来自后端 get_mcp_sidecar：安装包把 zeppbridge-mcp 放在 ZeppBridge.exe 旁边。
 *
 * 两处 Windows 上的坑：
 * - npm 装的 claude / codex 是 .ps1 外壳，PowerShell 会把裸的 `--` 当成「参数结束」
 *   吞掉，后面的 `--scope task` 就被当成 CLI 自己的参数。写成 "--" 在 PowerShell
 *   和 cmd 里都原样传下去。
 * - 路径可能带空格，一律加双引号。
 */
import type { McpSidecar } from './bridge/types';

/** 插件市场所在的分支。v3 还没合进 main，发 3.0 时改成 main（见计划 5F）。 */
export const PLUGIN_MARKETPLACE_REF = 'v3';
const PLUGIN_REPO = 'lingcang728/ZeppBridge';
const PLUGIN_ID = 'zepp-coach@zeppbridge';
/** MCP 默认只看用户在「交给 AI」里共享出去的任务（McpTaskScopes）。 */
const SERVER_ARGS = ['--scope', 'task'];

const quote = (value: string) => `"${value}"`;

const envFlag = (flag: string, sidecar: McpSidecar) =>
  sidecar.data_dir_env ? [flag, quote(`ZEPPBRIDGE_DATA_DIR=${sidecar.data_dir_env}`)] : [];

const serverLaunch = (path: string) => [quote('--'), quote(path), ...SERVER_ARGS];

/** Claude Code：注册 MCP + 装 zepp-coach 技能插件。sidecar 缺失时返回 null。 */
export const claudeCodeCommands = (sidecar: McpSidecar): string | null => {
  if (!sidecar.path) return null;
  return [
    // -e 是可变长参数，放在 --scope 前面，由 --scope 截断，不会吞掉服务名。
    ['claude', 'mcp', 'add', ...envFlag('-e', sidecar), '--scope', 'user', 'zeppbridge', ...serverLaunch(sidecar.path)].join(' '),
    `claude plugin marketplace add ${PLUGIN_REPO}#${PLUGIN_MARKETPLACE_REF}`,
    `claude plugin install ${PLUGIN_ID}`,
  ].join('\n');
};

/** Codex：同上，Codex 的插件市场用 --ref 指分支。 */
export const codexCommands = (sidecar: McpSidecar): string | null => {
  if (!sidecar.path) return null;
  return [
    ['codex', 'mcp', 'add', ...envFlag('--env', sidecar), 'zeppbridge', ...serverLaunch(sidecar.path)].join(' '),
    `codex plugin marketplace add ${PLUGIN_REPO} --ref ${PLUGIN_MARKETPLACE_REF}`,
    `codex plugin add ${PLUGIN_ID}`,
  ].join('\n');
};

/** 其他 MCP 客户端通用的 JSON（mcpServers 写法）。没附带 sidecar 时用占位路径。 */
export const genericMcpConfig = (sidecar: McpSidecar | null, placeholder: string): string => {
  const server: Record<string, unknown> = { command: sidecar?.path ?? placeholder, args: SERVER_ARGS };
  if (sidecar?.data_dir_env) server.env = { ZEPPBRIDGE_DATA_DIR: sidecar.data_dir_env };
  return JSON.stringify({ mcpServers: { zeppbridge: server } }, null, 2);
};
