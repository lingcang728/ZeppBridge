import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// These two documents are compiled into the MCP contract tests.
const CONTRACT_DOC = /^docs\/reference\/cli-and-mcp(?:\.zh-CN)?\.md$/;

export function isOrdinaryDocumentation(path) {
  if (CONTRACT_DOC.test(path)) return false;
  return /^(?:README(?:\.[\w-]+)?|CHANGELOG)\.md$/.test(path)
    || /^docs\/.+\.md$/.test(path)
    || /^docs\/assets\/.+\.(?:png|jpe?g|gif|svg|webp)$/.test(path)
    || /^packaging\/README(?:\.[\w-]+)?\.md$/.test(path);
}

export function selectChecks({ eventName, ref, event, cwd = process.cwd() }) {
  // Releases and explicit manual runs always keep the complete pipeline.
  if (ref?.startsWith('refs/tags/') || eventName === 'workflow_dispatch') {
    return { full: true, reason: 'Release tag or manual run' };
  }

  let base;
  let head;
  let separator;
  if (eventName === 'pull_request') {
    base = event.pull_request?.base?.sha;
    head = event.pull_request?.head?.sha;
    separator = '...'; // Include every PR commit, excluding base-only changes.
  } else if (eventName === 'push') {
    base = event.before;
    head = event.after;
    separator = '..'; // Include the entire push, not just its last commit.
  } else {
    return { full: true, reason: 'Unrecognized event' };
  }

  if (![base, head].every((sha) => /^[a-f0-9]{40}$/.test(sha ?? '') && !/^0+$/.test(sha))) {
    return { full: true, reason: 'No complete comparison range' };
  }

  // Disable rename detection so both the old and new paths are classified.
  // A missing commit or failed diff fails this required job; it must not skip CI.
  const paths = execFileSync('git', [
    'diff', '--name-only', '--no-renames', '-z', `${base}${separator}${head}`, '--',
  ], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 }).split('\0').filter(Boolean);
  const full = paths.length === 0 || !paths.every(isOrdinaryDocumentation);
  return { full, reason: full ? 'Code, configuration, contract, or unknown changes' : 'Ordinary documentation only' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = selectChecks({
    eventName: process.env.GITHUB_EVENT_NAME,
    ref: process.env.GITHUB_REF,
    event: JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')),
  });
  appendFileSync(process.env.GITHUB_OUTPUT, `full=${result.full}\n`);
  console.log(`${result.reason}: ${result.full ? 'full verification' : 'documentation checks only'}`);
}
