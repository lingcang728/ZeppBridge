/**
 * 从 AI 的整段回复里取出训练计划。
 *
 * 网页版 ChatGPT / Kimi / 豆包不会只吐一段 JSON：前面有寒暄，后面有注意事项，
 * JSON 多半包在 ```json 代码块里，偶尔没有围栏。这里按可信度依次试：
 *   1. 代码块（先 ```json 之类带语言的，再无语言的）；
 *   2. 整段文字本身就是 JSON；
 *   3. 在文字里按括号配对找出 `{...}` / `[...]`（字符串里的括号不算）。
 * 第一个「长得像计划」的就用：有 `workouts` 数组的对象，或者本身就是训练数组。
 *
 * 只做提取，不判对错——能不能发、哪里有问题，归后端的校验（`training_plan_preview`）。
 */
import type { PlanDocument, PlanWorkoutInput } from '../../types/trainingPlan';

export type ExtractFailure = 'empty' | 'no_json' | 'not_a_plan';

export type ExtractResult =
  | { ok: true; document: PlanDocument; source: 'fence' | 'whole' | 'braces' }
  | { ok: false; failure: ExtractFailure };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** 长得像计划就整理成 PlanDocument，否则 null。 */
const asPlan = (value: unknown): PlanDocument | null => {
  if (Array.isArray(value)) {
    return value.every(isRecord) ? { workouts: value as unknown as PlanWorkoutInput[] } : null;
  }
  if (isRecord(value) && Array.isArray(value.workouts)) return value as unknown as PlanDocument;
  return null;
};

const tryParse = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/** 代码块里的内容，按出现顺序；带语言标注的排在前面。 */
const fencedBlocks = (text: string): string[] => {
  const tagged: string[] = [];
  const bare: string[] = [];
  const pattern = /```([A-Za-z0-9_-]*)[^\n]*\n([\s\S]*?)```/g;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    (match[1] ? tagged : bare).push(match[2]);
  }
  return [...tagged, ...bare];
};

/** 在文字里按括号配对取出每一段顶层 `{...}` / `[...]`；字符串里的括号和转义不算。 */
const bracketed = (text: string): string[] => {
  const out: string[] = [];
  for (let start = 0; start < text.length; start += 1) {
    const open = text[start];
    if (open !== '{' && open !== '[') continue;
    const close = open === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    let end = -1;
    for (let index = start; index < text.length; index += 1) {
      const char = text[index];
      if (inString) {
        if (char === '\\') index += 1;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === open) depth += 1;
      else if (char === close) {
        depth -= 1;
        if (depth === 0) { end = index; break; }
      }
    }
    if (end < 0) continue;
    out.push(text.slice(start, end + 1));
    start = end;
  }
  return out;
};

export const extractPlan = (reply: string): ExtractResult => {
  const text = reply.trim();
  if (!text) return { ok: false, failure: 'empty' };

  let sawJson = false;
  const attempt = (candidate: string, source: 'fence' | 'whole' | 'braces'): ExtractResult | null => {
    const value = tryParse(candidate.trim());
    if (value === undefined) return null;
    sawJson = true;
    const document = asPlan(value);
    return document ? { ok: true, document, source } : null;
  };

  const candidates = [
    ...fencedBlocks(text).map(text => ({ text, source: 'fence' as const })),
    { text, source: 'whole' as const },
    ...bracketed(text).map(text => ({ text, source: 'braces' as const })),
  ];
  const final = candidates.map(c => ({ value: tryParse(c.text.trim()), source: c.source })).find(c => isRecord(c.value) && ['zeppbridge-plan/2', 'zeppbridge.plan/2'].includes(String(c.value.format)) && asPlan(c.value));
  if (final) return { ok: true, document: asPlan(final.value)!, source: final.source };
  for (const block of fencedBlocks(text)) {
    const hit = attempt(block, 'fence');
    if (hit) return hit;
  }
  const whole = attempt(text, 'whole');
  if (whole) return whole;
  for (const piece of bracketed(text)) {
    const hit = attempt(piece, 'braces');
    if (hit) return hit;
  }
  return { ok: false, failure: sawJson ? 'not_a_plan' : 'no_json' };
};
