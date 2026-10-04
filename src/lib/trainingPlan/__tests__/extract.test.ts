import { describe, expect, it } from 'vitest';
import { extractPlan } from '../extract';

const PLAN = { from: '2026-10-03', to: '2026-10-09', workouts: [{ date: '2026-10-03', sport: 'running', name: '轻松跑', steps: [{ kind: 'active', duration: '45min', target: 'hr 130-148' }] }] };
const json = JSON.stringify(PLAN, null, 2);

describe('extractPlan', () => {
  it('前后有文字 + json 代码块：取代码块里的计划', () => {
    const reply = `好的，下面是你下周的安排：\n\n\`\`\`json\n${json}\n\`\`\`\n\nTake it slow.`;
    const result = extractPlan(reply);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe('fence');
      expect(result.document.workouts).toHaveLength(1);
      expect(result.document.from).toBe('2026-10-03');
    }
  });

  it('无语言标注的代码块也行；带语言标注的排在前面', () => {
    const decoy = '```text\n{"hello": 1}\n```';
    const bare = `\`\`\`\n${json}\n\`\`\``;
    expect(extractPlan(`${decoy}\n${bare}`).ok).toBe(true);
    const tagged = `\`\`\`\n{"workouts": []}\n\`\`\`\n\`\`\`json\n${json}\n\`\`\``;
    const result = extractPlan(tagged);
    expect(result.ok && result.document.workouts).toHaveLength(1);
  });

  it('整段回复本身就是 JSON', () => {
    const result = extractPlan(json);
    expect(result.ok && result.source).toBe('whole');
  });

  it('没有代码块、夹在文字中间的 JSON：按括号配对找出来，字符串里的括号不算', () => {
    const tricky = { workouts: [{ date: '2026-10-03', sport: 'running', name: '带 } 和 { 的名字', steps: [] }] };
    const reply = `计划如下 ${JSON.stringify(tricky)} good luck {不是 JSON}`;
    const result = extractPlan(reply);
    expect(result.ok && result.source).toBe('braces');
    expect(result.ok && result.document.workouts[0].name).toBe('带 } 和 { 的名字');
  });

  it('顶层就是训练数组：包成 workouts', () => {
    const result = extractPlan(JSON.stringify(PLAN.workouts));
    expect(result.ok && result.document.workouts).toHaveLength(1);
  });

  it('JSON 是有的，但不是计划：说 not_a_plan，不是 no_json', () => {
    expect(extractPlan('```json\n{"hello": "world"}\n```')).toEqual({ ok: false, failure: 'not_a_plan' });
    expect(extractPlan('[1, 2, 3]')).toEqual({ ok: false, failure: 'not_a_plan' });
  });

  it('根本没有 JSON，或者是空的', () => {
    expect(extractPlan('周三休息，周四间歇跑。')).toEqual({ ok: false, failure: 'no_json' });
    expect(extractPlan('   \n ')).toEqual({ ok: false, failure: 'empty' });
  });

  it('括号没配上的残缺 JSON 不崩，也不当成计划', () => {
    expect(extractPlan('{"workouts": [ {"date": "2026-10-03"')).toEqual({ ok: false, failure: 'no_json' });
  });

  it('清空某几天的写法（workouts 为空数组 + from/to）是合法计划', () => {
    const result = extractPlan('{"from":"2026-10-03","to":"2026-10-05","workouts":[]}');
    expect(result.ok && result.document.workouts).toEqual([]);
  });
});


it('prefers the final plan/2 block over an earlier draft, while keeping source provenance', () => {
 const final = { ...PLAN, format: 'zeppbridge-plan/2', summary: 'Final agreement' };
 const reply = '```json\n'+json+'\n```\nFinal\n```json\n'+JSON.stringify(final)+'\n```';
 expect(extractPlan(reply)).toEqual({ok:true,document:final,source:'fence'});
 expect(extractPlan(JSON.stringify(final))).toEqual({ok:true,document:final,source:'whole'});
 expect(extractPlan('Final: '+JSON.stringify(final))).toEqual({ok:true,document:final,source:'braces'});
});
