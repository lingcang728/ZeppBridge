// 在隔离的子进程中拦截 CLI，测试发布分支与远端状态变化；绝不回退到真实 GitHub。
import childProcess from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

const routes = JSON.parse(readFileSync(process.env.RELEASE_TEST_ROUTES, 'utf8'));
childProcess.execFileSync = (command, args, options) => {
  const key = JSON.stringify([command, ...args]);
  appendFileSync(process.env.RELEASE_TEST_CALLS, `${JSON.stringify({ command, args, input: options?.input })}\n`);
  if (!Object.hasOwn(routes, key)) throw new Error(`Unexpected tool call: ${key}`);
  const value = routes[key];
  if (value?.error) throw new Error(value.error);
  return typeof value === 'string' ? value : JSON.stringify(value);
};
syncBuiltinESMExports();
