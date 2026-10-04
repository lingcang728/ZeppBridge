/**
 * 演示里的训练计划：一份「AI 排的下一周」草稿 + 手表上已经发过的几天，日期都从今天往后排。
 *
 * 校验不在这里重做（那是 Rust 的事）：草稿预览是写好的——其中一天带一条「未核实」提示，
 * 为的是让访客看到界面怎么说清「格式没问题，但还没在你的手表上核实过」。
 */
import { at, dayKey, iso } from './rng';
import { demoText } from './texts';
import type {
  PlanDayPreview, PlanDraftPreview, PlanPublishAction, PlanPublishRecord, PlanPublishResult,
  PlanStepNode, PlanWorkout, TrainingPlanState,
  PlanDocument,
} from '../types/trainingPlan';

const hr = (low: number, high: number) => ({ type: 'heart_rate' as const, low, high });
const step = (intensity: 'warmup' | 'active' | 'interval' | 'recovery' | 'cooldown', seconds: number, low: number, high: number): PlanStepNode =>
  ({ type: 'step', intensity, length: { type: 'time', seconds }, target: hr(low, high) });
const bare = (intensity: 'interval' | 'recovery', seconds: number, low: number, high: number) =>
  ({ intensity, length: { type: 'time' as const, seconds }, target: hr(low, high) });

const easy = (): PlanStepNode[] => [step('warmup', 360, 105, 125), step('active', 1980, 130, 148), step('cooldown', 360, 100, 120)];
const intervals = (): PlanStepNode[] => [
  step('warmup', 720, 110, 130),
  { type: 'repeat', times: 5, steps: [bare('interval', 180, 160, 172), bare('recovery', 120, 120, 140)] },
  step('cooldown', 480, 100, 125),
];
const tempo = (): PlanStepNode[] => [step('warmup', 600, 110, 130), step('active', 1500, 150, 162), step('cooldown', 600, 100, 120)];
const ride = (): PlanStepNode[] => [step('active', 2700, 110, 130)];
const longRun = (): PlanStepNode[] => [
  step('warmup', 480, 105, 125),
  { type: 'step', intensity: 'active', length: { type: 'distance', meters: 12000 }, target: hr(130, 150) },
  step('cooldown', 480, 100, 120),
];

export interface DemoPlan {
  state(): TrainingPlanState;
  preview(): PlanDraftPreview;
  saveDraft(): string;
  discard(): boolean;
  updateDraft(document: PlanDocument): boolean;
  publish(action: PlanPublishAction, confirmClear: boolean): PlanPublishResult;
}

export const createDemoPlan = (now: Date): DemoPlan => {
  const day = (offset: number) => dayKey(at(now, offset));
  const w = (offset: number, sport: PlanWorkout['sport'], name: string, steps: PlanStepNode[]): PlanWorkout => ({ date: day(offset), sport, name, steps });

  /* 训练名取自"被问到的那一刻"的界面语言：访客中途换了语言，下一次读到的就是新语言。
     已经"发出去"的那几条停在发出去那一刻的名字，和真账本一样。 */
  const build = () => {
    const text = demoText();
    const easy1 = w(1, 'running', text.easyRun, easy());
    const ride2 = w(2, 'cycling', text.recoveryRide, ride());
    const tempo3 = w(3, 'running', text.tempoRun, tempo());
    const oldIntervals3 = w(3, 'running', text.intervals, intervals());
    const oldEasy4 = w(4, 'running', text.easyRun, easy());
    const intervals5 = w(5, 'running', text.intervals, intervals());
    const long6 = w(6, 'running', text.longRun, longRun());
    const easy7 = w(7, 'running', text.easyRun, easy());
    return { easy1, ride2, tempo3, oldIntervals3, oldEasy4, intervals5, long6, easy7, proposed: [easy1, ride2, tempo3, intervals5, long6, easy7] };
  };

  let sent: PlanWorkout[] | null = null;
  let record: PlanPublishRecord | null = {
    id: 1, kind: 'publish', window_start: day(0), workout_count: 3, state: 'sent', http_status: 200, error_code: null,
    undone: false, created_at: iso(new Date(now.getTime() - 3_700_000)), finished_at: iso(new Date(now.getTime() - 3_690_000)),
  };
  let draftOpen = true;
  let canUndo = true;
  let edited: PlanDocument | null = null;
  const applyEdits = (b: ReturnType<typeof build>) => edited ? edited.workouts.flatMap(input => {
    const original = b.proposed.find(w => w.name === input.name);
    return original ? [{ ...original, date: input.date }] : [];
  }) : b.proposed;
  const initialSent = (b: ReturnType<typeof build>): PlanWorkout[] => [b.easy1, b.oldIntervals3, b.oldEasy4];

  const days = (b: ReturnType<typeof build>): PlanDayPreview[] => [
    { date: day(0), change: 'rest', before: [], after: [] },
    { date: day(1), change: 'unchanged', before: [b.easy1], after: [b.easy1] },
    { date: day(2), change: 'added', before: [], after: [b.ride2] },
    { date: day(3), change: 'replaced', before: [b.oldIntervals3], after: [b.tempo3] },
    { date: day(4), change: 'removed', before: [b.oldEasy4], after: [] },
    { date: day(5), change: 'added', before: [], after: [b.intervals5] },
    { date: day(6), change: 'added', before: [], after: [b.long6] },
    { date: day(7), change: 'added', before: [], after: [b.easy7] },
  ];

  return {
    state: () => {
      const b = build();
      return {
        window: { start: day(0) },
        sent: sent ?? initialSent(b),
        planned: [],
        uncertain: false,
        last_publish: record,
        can_undo: canUndo,
        ai_may_publish: false,
        drafts: draftOpen ? [{
          id: 'demo-draft', origin: 'ai_paste', status: 'open', created_at: iso(now), updated_at: iso(now),
          document: edited ?? { from: day(1), to: day(7), workouts: b.proposed.map((item) => ({ date: item.date, sport: item.sport, name: item.name, steps: [] })) },
        }] : [],
      };
    },
    preview: () => {
      const b = build();
      return {
        check: {
          from: day(1), to: day(7), workouts: applyEdits(b),
          issues: [{ severity: 'unverified', workout: 4, step: '2', message: '', message_code: 'ui.training_plan.issue.distance_unverified', params: {} }],
        },
        window: { start: day(0) },
        days: edited ? days(b).map(d => ({ ...d, after: applyEdits(b).filter(w => w.date === d.date) })) : days(b),
      };
    },
    saveDraft: () => { draftOpen = true; return 'demo-draft'; },
    discard: () => { draftOpen = false; return true; },
    updateDraft: (document) => { edited = JSON.parse(JSON.stringify(document)); return true; },
    publish: (action) => {
      const b = build();
      if (action.kind === 'undo') {
        canUndo = false;
        sent = initialSent(b);
        record = record && { ...record, id: 3, kind: 'undo' };
        return { outcome: { outcome: 'send', publish_id: 3, body: {} }, record };
      }
      if (action.kind === 'clear') {
        sent = [];
        record = record && { ...record, id: 4, kind: 'clear', workout_count: 0 };
        return { outcome: { outcome: 'send', publish_id: 4, body: {} }, record };
      }
      draftOpen = false;
      canUndo = true;
      sent = b.proposed.filter((item) => item.date <= day(6));
      record = {
        id: 2, kind: 'publish', window_start: day(0), workout_count: sent.length, state: 'sent', http_status: 200, error_code: null,
        undone: false, created_at: iso(new Date()), finished_at: iso(new Date()),
      };
      return { outcome: { outcome: 'send', publish_id: 2, body: {} }, record };
    },
  };
};
