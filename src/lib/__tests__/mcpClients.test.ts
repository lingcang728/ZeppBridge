import { describe, expect, it } from 'vitest';
import { claudeCodeCommands, codexCommands, genericMcpConfig } from '../mcpClients';

const path = 'C:\\Program Files\\ZeppBridge\\zeppbridge-mcp.exe';

describe('mcpClients', () => {
  it('没附带 sidecar 时不拼命令', () => {
    const none = { path: null, data_dir_env: null };
    expect(claudeCodeCommands(none)).toBeNull();
    expect(codexCommands(none)).toBeNull();
  });

  it('引号包住 "--" 和带空格的路径，服务参数在最后', () => {
    const [mcp, market, install] = claudeCodeCommands({ path, data_dir_env: null })!.split('\n');
    expect(mcp).toBe(`claude mcp add --scope user zeppbridge "--" "${path}" --scope task`);
    expect(market).toBe('claude plugin marketplace add lingcang728/ZeppBridge#main');
    expect(install).toBe('claude plugin install zepp-coach@zeppbridge');
  });

  it('库不在 sidecar 旁边时三种写法都带上 ZEPPBRIDGE_DATA_DIR', () => {
    const sidecar = { path, data_dir_env: 'D:\\my data' };
    expect(claudeCodeCommands(sidecar)!.split('\n')[0]).toBe(
      `claude mcp add -e "ZEPPBRIDGE_DATA_DIR=D:\\my data" --scope user zeppbridge "--" "${path}" --scope task`,
    );
    expect(codexCommands(sidecar)!.split('\n')[0]).toBe(
      `codex mcp add --env "ZEPPBRIDGE_DATA_DIR=D:\\my data" zeppbridge "--" "${path}" --scope task`,
    );
    const config = JSON.parse(genericMcpConfig(sidecar, '<x>'));
    expect(config.mcpServers.zeppbridge).toEqual({
      command: path,
      args: ['--scope', 'task'],
      env: { ZEPPBRIDGE_DATA_DIR: 'D:\\my data' },
    });
  });

  it('登记过旧版的客户端先删掉同名那条再加，别的客户端不受影响', () => {
    const sidecar = { path, data_dir_env: null, stale_clients: ['codex' as const] };
    expect(codexCommands(sidecar)!.split('\n').slice(0, 2)).toEqual([
      'codex mcp remove zeppbridge',
      `codex mcp add zeppbridge "--" "${path}" --scope task`,
    ]);
    expect(claudeCodeCommands(sidecar)!.split('\n')[0]).toMatch(/^claude mcp add /);
    expect(claudeCodeCommands({ ...sidecar, stale_clients: ['claude_code'] })!.split('\n')[0])
      .toBe('claude mcp remove zeppbridge --scope user');
  });

  it('通用配置在没有 sidecar 时用占位路径', () => {
    expect(JSON.parse(genericMcpConfig(null, '<x>')).mcpServers.zeppbridge.command).toBe('<x>');
  });
});
