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

// Files that decide whether the installers still build. A push to main that
// touches one of them also runs the packaging jobs (without publishing), so a
// broken bundle shows up before a release tag instead of in the release run.
const PACKAGING_INPUTS = [
  /^src-tauri\/(?:.+\/)?Cargo\.(?:toml|lock)$/,
  /^src-tauri\/tauri(?:\.[\w-]+)?\.conf\.json$/,
  /^src-tauri\/build\.rs$/,
  /^rust-toolchain(?:\.toml)?$/,
  /^package(?:-lock)?\.json$/,
  /^packaging\//,
  /^scripts\/release\//,
  /^scripts\/ci\//,
  /^\.github\/workflows\//,
];

export function isPackagingInput(path) {
  if (isOrdinaryDocumentation(path)) return false;
  return PACKAGING_INPUTS.some((pattern) => pattern.test(path));
}

export function selectChecks({ eventName, ref, event, cwd = process.cwd() }) {
  // Releases and explicit manual runs always keep the complete pipeline.
  if (ref?.startsWith('refs/tags/') || eventName === 'workflow_dispatch') {
    return { full: true, package: true, reason: 'Release tag or manual run' };
  }
  // Pull requests never package: the release jobs are not for fork code.
  const mayPackage = eventName === 'push' && ref === 'refs/heads/main';

  let base;
  let head;
  let separator;
  if (eventName === 'pull_request') {
    base = event.pull_request?.base?.sha;
    head = event.pull_request?.head?.sha;
    separator = '...'; // Include every PR commit, excluding base-only changes.
  } else if (eventName === 'push') {
    // After a force push (a history rewrite) `before` is no longer in the
    // history, so there is no range to diff. Run everything instead of failing.
    if (event.forced) {
      return { full: true, package: mayPackage, reason: 'Force push without a comparable range' };
    }
    base = event.before;
    head = event.after;
    separator = '..'; // Include the entire push, not just its last commit.
  } else {
    return { full: true, package: false, reason: 'Unrecognized event' };
  }

  if (![base, head].every((sha) => /^[a-f0-9]{40}$/.test(sha ?? '') && !/^0+$/.test(sha))) {
    return { full: true, package: mayPackage, reason: 'No complete comparison range' };
  }

  // Disable rename detection so both the old and new paths are classified.
  // A missing commit or failed diff fails this required job; it must not skip CI.
  const paths = execFileSync('git', [
    'diff', '--name-only', '--no-renames', '-z', `${base}${separator}${head}`, '--',
  ], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 }).split('\0').filter(Boolean);
  const full = paths.length === 0 || !paths.every(isOrdinaryDocumentation);
  const pkg = mayPackage && (paths.length === 0 || paths.some(isPackagingInput));
  return {
    full,
    package: pkg,
    reason: full ? 'Code, configuration, contract, or unknown changes' : 'Ordinary documentation only',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = selectChecks({
    eventName: process.env.GITHUB_EVENT_NAME,
    ref: process.env.GITHUB_REF,
    event: JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')),
  });
  appendFileSync(process.env.GITHUB_OUTPUT, `full=${result.full}\npackage=${result.package}\n`);
  console.log(`${result.reason}: ${result.full ? 'full verification' : 'documentation checks only'}`
    + (result.package ? ', plus installer packaging' : ''));
}
