/**
 * 往计划里加一条现成的训练：存过的模板（「把这次训练存成模板再练一次」），或别处导出的 .zwo / 训练 .fit。
 *
 * 加到哪、怎么加由调用方给（`add`）：单天页是往草稿里那一天加一条（计划已经发出去也行，第一下改动时拿回来变成草稿），
 * 没有计划时是用这一条起一份新草稿。加进去以后和别的改动一样由后端重新校验，模板和导入都不绕过检查。
 *
 * 文件按 %FTP / 阈值配速写强度时先问一次那个数（记在本机，下次不问），问到了再读一遍同一个文件。
 * 模板列表全局一份：单天页和周视图看到的是同一份。
 */
import { ref } from 'vue';
import { importWorkout, IMPORT_ACCEPT, type ImportFailure, type ImportNeed, type ImportNote, type ImportedWorkout } from '../lib/trainingPlan/importWorkout';
import {
  readTemplates, readThresholds, withTemplate, withoutTemplate, writeTemplates, writeThresholds,
  type PlanTemplate, type TemplateWorkout,
} from '../lib/trainingPlan/templates';

export type PlanAddOutcome =
  | { kind: 'saved' }
  | { kind: 'save_failed' }
  | { kind: 'added'; name: string; notes: ImportNote[] }
  | { kind: 'failed'; failure: ImportFailure };

const templates = ref<PlanTemplate[]>(readTemplates());

export const usePlanAdd = (add: (workout: ImportedWorkout) => Promise<unknown>) => {
  const outcome = ref<PlanAddOutcome | null>(null);
  /** 文件还缺的那个数；不为空时界面在页内问一句。 */
  const need = ref<ImportNeed | null>(null);
  let pending: ArrayBuffer | null = null;

  const save = (workout: TemplateWorkout) => {
    const next = withTemplate(templates.value, workout, new Date());
    if (!writeTemplates(next)) { outcome.value = { kind: 'save_failed' }; return; }
    templates.value = next;
    outcome.value = { kind: 'saved' };
  };
  const remove = (id: string) => {
    templates.value = withoutTemplate(templates.value, id);
    writeTemplates(templates.value);
  };
  const place = async (workout: ImportedWorkout, notes: ImportNote[] = []) => {
    await add(workout);
    outcome.value = { kind: 'added', name: workout.name, notes };
  };

  const read = async (buffer: ArrayBuffer) => {
    const result = importWorkout(buffer, readThresholds());
    if (result.ok) { await place(result.workout, result.notes); return; }
    if ('need' in result) { pending = buffer; need.value = result.need; return; }
    outcome.value = { kind: 'failed', failure: result.failure };
  };
  /** 打开系统的选文件框（只列 .zwo / .fit）。 */
  const openFile = () => {
    outcome.value = null;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = IMPORT_ACCEPT;
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file) void file.arrayBuffer().then(read, () => { outcome.value = { kind: 'failed', failure: 'unreadable' }; });
    }, { once: true });
    input.click();
  };
  /** 用户给出 FTP（瓦）或阈值配速（秒 / 公里）：记下来，再读一遍刚才那个文件。 */
  const supply = async (value: number) => {
    const kind = need.value;
    const buffer = pending;
    need.value = null;
    pending = null;
    if (!kind || !buffer) return;
    const thresholds = readThresholds();
    writeThresholds(kind === 'ftp' ? { ...thresholds, ftp: value } : { ...thresholds, thresholdPace: value });
    await read(buffer);
  };
  const cancelNeed = () => { need.value = null; pending = null; };

  return { templates, outcome, need, save, remove, place, openFile, supply, cancelNeed, dismiss: () => { outcome.value = null; } };
};
