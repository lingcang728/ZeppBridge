import fs from 'node:fs';
import ts from 'typescript';

const file = 'src/components/WorkoutTools.i18n.ts';
let source = fs.readFileSync(file, 'utf8');
const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
let call;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(tree) === 'defineMessages') call = node;
  ts.forEachChild(node, visit);
}
visit(tree);
if (!call || call.arguments.length !== 4) throw new Error('Expected one four-argument defineMessages call');
for (const [index, lang] of [[2, 'es'], [1, 'en']]) {
  const draft = fs.readFileSync(`artifacts/issue-repair-20261024/i18n/${lang}.ts`, 'utf8');
  const parsed = ts.createSourceFile(`${lang}.ts`, draft, ts.ScriptTarget.Latest, true);
  const declaration = parsed.statements.find(ts.isVariableStatement)?.declarationList.declarations[0];
  if (!declaration?.initializer || !ts.isObjectLiteralExpression(declaration.initializer)) throw new Error(`Missing ${lang} object`);
  source = source.slice(0, call.arguments[index].getStart(tree)) + declaration.initializer.getText(parsed) + source.slice(call.arguments[index].end);
}
fs.writeFileSync(file, source);
console.log('Integrated independently reviewed en and es messages.');
