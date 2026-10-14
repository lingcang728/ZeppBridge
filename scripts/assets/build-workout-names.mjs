// 从随包运动目录（src/assets/workouts/catalog.json）生成界面用的运动名文案模块 src/lib/workoutNames.i18n.ts。
// 为什么另生成一份：目录只有 zh / en / es 三语，七种语言包要按 moduleId 覆盖运动名，而 i18n 门禁只认字面量
// defineMessages。改了 catalog.json 以后重跑：node scripts/assets/build-workout-names.mjs
// （src/lib/__tests__/workoutNames.test.ts 会在两边不一致时失败）。
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const catalog = JSON.parse(readFileSync(root + 'src/assets/workouts/catalog.json', 'utf8'));
const tables = { zh: new Map(), en: new Map(), es: new Map() };
for (const sport of catalog.sports) {
  if (tables.zh.has(sport.key)) continue;
  tables.zh.set(sport.key, sport.label_zh);
  tables.en.set(sport.key, sport.label_en);
  tables.es.set(sport.key, sport.label_es ?? sport.label_en);
}
const keys = [...tables.zh.keys()].sort();
const quote = (text) => `'${String(text).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const block = (map) => keys.map((key) => `    ${/^[a-z_][a-z0-9_]*$/i.test(key) ? key : quote(key)}: ${quote(map.get(key))},`).join('\n');
const out = `// 由 scripts/assets/build-workout-names.mjs 从 src/assets/workouts/catalog.json 生成，别手改。
// 运动名（按目录 key）：zh / en / es 与目录一致；其余七种语言在语言包 modules['lib/workoutNames'] 里覆盖，
// 没覆盖的键回落到英文名（lib/labels.ts）。
import { defineMessages } from '../i18n';

export const workoutNameMessages = defineMessages(
  {
${block(tables.zh)}
  },
  {
${block(tables.en)}
  },
  {
${block(tables.es)}
  },
  'lib/workoutNames',
);
`;
writeFileSync(root + 'src/lib/workoutNames.i18n.ts', out);
console.log(`lib/workoutNames.i18n.ts: ${keys.length} sports`);
