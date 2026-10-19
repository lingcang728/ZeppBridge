// 定时发布的纯逻辑（docs/releases/scheduling.md）：读计划、挑下一版、核对快照。
// 不碰网络，git 通过参数传进来，测试用临时仓库跑真的 git。

/** 每一版的更新说明必须齐全的 12 种界面语言（与 docs/releases/README.md 一致）。 */
export const NOTE_LOCALES = ['zh', 'en', 'es', 'nl', 'pt-BR', 'pt-PT', 'de', 'ru', 'hi-IN', 'fr', 'it', 'pl'];

const VERSION = /^\d+\.\d+\.\d+$/;
const SHA = /^[0-9a-f]{40}$/;

export function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

/** 解析 .github/release-schedule.json；格式不对直接抛错，宁可不发也不猜。 */
export function parseSchedule(text) {
  const raw = JSON.parse(text);
  if (typeof raw.paused !== 'boolean') throw new Error('paused 必须是 true / false');
  if (!Array.isArray(raw.releases)) throw new Error('releases 必须是数组');
  const releases = raw.releases.map((r, i) => {
    const where = `releases[${i}]`;
    if (!VERSION.test(r.version ?? '')) throw new Error(`${where}.version 不是 x.y.z：${r.version}`);
    if (!SHA.test(r.commit ?? '')) throw new Error(`${where}.commit 要写完整的 40 位 SHA`);
    const at = new Date(r.notBefore);
    if (!/[zZ]|[+-]\d\d:\d\d$/.test(r.notBefore ?? '') || Number.isNaN(at.getTime())) {
      throw new Error(`${where}.notBefore 要带时区，例如 2026-10-20T10:00:00+08:00`);
    }
    if (typeof r.approved !== 'boolean') throw new Error(`${where}.approved 必须是 true / false`);
    return { version: r.version, commit: r.commit, notBefore: at, approved: r.approved };
  });
  for (let i = 1; i < releases.length; i += 1) {
    if (compareVersions(releases[i - 1].version, releases[i].version) >= 0) {
      throw new Error(`版本要按从小到大排、不能重复：${releases[i - 1].version} → ${releases[i].version}`);
    }
  }
  return { paused: raw.paused, releases };
}

/**
 * 计划里第一个还没有 tag 的版本。严格按顺序：后面的版本已经发了、前面的却没发，
 * 说明有人手动插过队，停下来让人看，不自己判断。
 */
export function nextRelease(schedule, releasedTags) {
  const released = (v) => releasedTags.has(`v${v}`);
  const index = schedule.releases.findIndex((r) => !released(r.version));
  if (index === -1) return null;
  const skipped = schedule.releases.slice(index + 1).find((r) => released(r.version));
  if (skipped) throw new Error(`v${skipped.version} 已经发了，但更早的 v${schedule.releases[index].version} 还没发；计划顺序乱了`);
  const newest = [...releasedTags].map((t) => t.slice(1)).filter((v) => VERSION.test(v)).sort(compareVersions).at(-1);
  const entry = schedule.releases[index];
  if (newest && compareVersions(entry.version, newest) <= 0) {
    throw new Error(`计划里的 v${entry.version} 不高于已发布的 v${newest}`);
  }
  return { entry, previousTag: newest ? `v${newest}` : null };
}

/** 默认发布时刻：北京时间晚上 9 点（2026-10-19 用户定，3.0.2 就是这个点发的）。 */
export const RELEASE_HOUR_BEIJING = 21;

/**
 * 冻结时没写 --at 就用它：排在计划最后一版的后一天、且不早于明天，北京时间 21:00。
 * 一天一版，当天冻结的版本留出自测的时间。
 */
export function defaultReleaseTime(lastNotBefore, now) {
  const beijingDay = (date) => new Date(date.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
  const nextDay = (day) => new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const candidates = [nextDay(beijingDay(now))];
  if (lastNotBefore) candidates.push(nextDay(beijingDay(lastNotBefore)));
  const day = candidates.sort().at(-1);
  return `${day}T${String(RELEASE_HOUR_BEIJING).padStart(2, '0')}:00:00+08:00`;
}

/** 到点了没有、批准了没有。urgent = 手动「立即发布」这一版：跳过时间、批准和暂停，但不跳过检查。 */
export function decide({ schedule, entry, now, urgentVersion }) {
  if (urgentVersion) {
    if (urgentVersion !== entry.version) {
      return { release: false, reason: `只能立即发布下一版 v${entry.version}，不能跳到 v${urgentVersion}`, error: true };
    }
    return { release: true, reason: `手动立即发布 v${entry.version}` };
  }
  if (schedule.paused) return { release: false, reason: '发布计划已暂停（paused: true）' };
  if (!entry.approved) return { release: false, reason: `v${entry.version} 还没批准（自测通过后把 approved 改成 true）` };
  if (now < entry.notBefore) return { release: false, reason: `v${entry.version} 定在 ${entry.notBefore.toISOString()} 之后` };
  return { release: true, reason: `v${entry.version} 到点且已批准` };
}

/** 已发布的迁移只能往后追加：和上一版 tag 比，migrations.rs 不许删改任何一行。 */
export function removedLines(unifiedDiff) {
  return unifiedDiff.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---'));
}

const schemaVersionOf = (source) => Number(/CURRENT_SCHEMA_VERSION:\s*i64\s*=\s*(\d+)/.exec(source ?? '')?.[1]);

/**
 * 快照本身对不对：版本号、更新说明、继承关系、迁移只追加。
 * git(args) 返回 stdout 字符串，失败抛错；show(ref, path) 读不到返回 null。
 */
export function verifySnapshot({ git, entry, previousTag, mainRef = 'origin/main', freezeRef }) {
  const problems = [];
  const show = (path) => {
    try { return git(['show', `${entry.commit}:${path}`]); } catch { return null; }
  };
  const isAncestor = (a, b) => {
    try { git(['merge-base', '--is-ancestor', a, b]); return true; } catch { return false; }
  };
  const v = entry.version;

  if (!isAncestor(entry.commit, mainRef)) problems.push(`快照 ${entry.commit.slice(0, 8)} 不在 ${mainRef} 上`);
  if (freezeRef) {
    let head = null;
    try { head = git(['rev-parse', freezeRef]).trim(); } catch { /* 没有这个分支 */ }
    if (head !== entry.commit) problems.push(`${freezeRef} 应当指向 ${entry.commit.slice(0, 8)}，实际是 ${head?.slice(0, 8) ?? '（不存在）'}`);
  }
  if (previousTag && !isAncestor(previousTag, entry.commit)) {
    problems.push(`快照不包含上一版 ${previousTag} 的提交——后一版必须继承前一版的全部修复`);
  }

  const pkg = show('package.json');
  if (JSON.parse(pkg ?? '{}').version !== v) problems.push(`package.json 的版本不是 ${v}`);
  const conf = show('src-tauri/tauri.conf.json');
  if (JSON.parse(conf ?? '{}').version !== v) problems.push(`tauri.conf.json 的版本不是 ${v}`);
  const notice = show('src/services/updateNotice.ts') ?? '';
  if (!notice.includes(`BUNDLED_VERSION = '${v}'`) || !notice.includes(`docs/releases/${v}/*.md`)) {
    problems.push(`updateNotice.ts 的 BUNDLED_VERSION / glob 没切到 ${v}`);
  }
  for (const locale of NOTE_LOCALES) {
    const text = show(`docs/releases/${v}/${locale}.md`);
    if (!text?.trim()) problems.push(`缺 docs/releases/${v}/${locale}.md`);
  }

  if (previousTag) {
    const migrations = 'src-tauri/crates/core/src/storage/migrations.rs';
    const removed = removedLines(git(['diff', '--unified=0', previousTag, entry.commit, '--', migrations]));
    if (removed.length) problems.push(`migrations.rs 相对 ${previousTag} 删改了 ${removed.length} 行（已发布的迁移只能追加）`);
    const storage = 'src-tauri/crates/core/src/storage/mod.rs';
    let before = NaN;
    try { before = schemaVersionOf(git(['show', `${previousTag}:${storage}`])); } catch { /* 老版本没有这个文件 */ }
    const after = schemaVersionOf(show(storage));
    if (!Number.isNaN(before) && !(after >= before)) problems.push(`CURRENT_SCHEMA_VERSION 从 ${before} 变成了 ${after}（不能倒退）`);
  }
  return problems;
}

/** tag 正文 = Release 说明 = 应用内更新提示：第一行标题，下面是英文更新说明（与 v3.0.2 同格式）。 */
export function tagMessage(version, englishNotes) {
  return `# ZeppBridge ${version}\n\n${englishNotes.trim()}\n`;
}
