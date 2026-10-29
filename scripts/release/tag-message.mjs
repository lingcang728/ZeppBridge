// 打 `v*` 附注标签用的正文：标题 + 这一版的英文更新说明（docs/releases/<版本>/en.md），不带作者来信。
//
//   node scripts/release/tag-message.mjs 3.1.1 | git tag -a v3.1.1 --cleanup=verbatim -F -
//
// 正文里有 `##` 标题，所以一定要 --cleanup=verbatim，否则 git 会把它们当注释删掉。
import { readFileSync } from 'node:fs';
import { tagMessage } from './release-core.mjs';

const version = process.argv[2] ?? JSON.parse(readFileSync('package.json', 'utf8')).version;
process.stdout.write(tagMessage(version, readFileSync(`docs/releases/${version}/en.md`, 'utf8')));
