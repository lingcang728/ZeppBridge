/**
 * 力量训练的展示计算 + 联动状态（#163）。台前调度（2026-11-13）把力量卡拆成两张：逐组明细（WorkoutStrengthCard）
 * 和肌肉人形（WorkoutStrengthMapCard），两张可能在舞台上并排，也可能一张在侧栏——联动状态放这里由页面建一份、两张共用。
 *
 * - 尚未拉到 detail 逐组报文时，退化成汇总流里的按动作汇总，绝不补零编造重量或单组时长。
 * - 1001 起的新动作名与主 / 辅肌群来自 Zepp 动作目录（useStrengthCatalog）。
 * - 联动：表格行 / 人形上一块肌肉 / 肌群胶囊，三种来源一个状态。悬停优先，点击（触屏）钉住，再点一次取消。
 */
import { computed, nextTick, shallowRef, type Ref } from 'vue';
import { groupShapeKeys, muscleLoad, type MuscleRowInput } from '../lib/anatomy/zeppMuscles';
import type { StrengthExerciseGroup, StrengthSetRow, StrengthWorkoutDetail } from '../types';
import { lessMotion } from '../lib/motion/lessMotion';
import { useMessages } from '../i18n';
import { resolveStrengthExerciseLabel, resolveStrengthMuscleLabel, strengthCatalogMessages } from '../lib/strengthCatalog.i18n';
import { workoutStrengthMessages } from '../components/workout/WorkoutStrengthCard.i18n';
import { useStrengthCatalog } from './useStrengthCatalog';
import type { MuscleChip } from '../components/workout/strength/StrengthMuscleChips.vue';

type RowKeys = 'action_code' | 'muscle_group' | 'exercise_key' | 'exercise_name' | 'secondary_muscle_groups';
export type StrengthRowLike = Pick<StrengthSetRow, RowKeys> | Pick<StrengthExerciseGroup, RowKeys>;
export type FocusKind = 'row' | 'shape' | 'group';
type Focus = { kind: FocusKind; key: string };

const MUSCLE_COLORS: Record<string, string> = {
  chest: 'var(--heart)',
  back: 'var(--accent)',
  shoulders: 'var(--training)',
  biceps: 'var(--pace)',
  triceps: 'var(--activity)',
  forearms: 'var(--altitude)',
  core: 'var(--calories)',
  glutes: 'var(--sleep)',
  legs: 'color-mix(in srgb, var(--training) 65%, var(--accent))',
};
const NONE: ReadonlySet<string> = new Set();

export const useStrengthDetail = (strength: Ref<StrengthWorkoutDetail>) => {
  const t = useMessages(workoutStrengthMessages);
  const catalog = useMessages(strengthCatalogMessages);
  const zepp = useStrengthCatalog();

  /** 主肌群：后端已补就用后端的；否则看当前语言的 Zepp 目录。 */
  const primaryOf = (row: StrengthRowLike): string | null =>
    row.muscle_group ?? zepp.value.get(row.action_code)?.primary_groups[0] ?? null;

  const secondaryOf = (row: StrengthRowLike): string[] => {
    const primary = primaryOf(row);
    const list = row.secondary_muscle_groups?.length
      ? row.secondary_muscle_groups
      : (zepp.value.get(row.action_code)?.secondary_groups ?? []);
    return list.filter((group) => group !== primary);
  };

  /** 动作名；谁都不认识的动作号（如 #2999）给「未识别动作」，号码另放一个灰色小标（用户：#2999 看不懂）。 */
  const exerciseOf = (row: StrengthRowLike): { name: string; unknownCode: number | null } => {
    const label = resolveStrengthExerciseLabel(row.exercise_key, row.action_code, catalog.value, zepp.value.get(row.action_code)?.name, row.exercise_name);
    return label === catalog.value.unknownAction(row.action_code)
      ? { name: t.value.unknownExercise, unknownCode: row.action_code }
      : { name: label, unknownCode: null };
  };

  /** 每行算几组：逐组明细一行一组，汇总流按动作的组数。id 和表格行的 key 一致，联动靠它。 */
  const weightedRows = computed<Array<{ id: string; row: StrengthRowLike; sets: number }>>(() =>
    strength.value.sets.length > 0
      ? strength.value.sets.map((row) => ({ id: `s${row.set_index}`, row, sets: 1 }))
      : strength.value.exercise_groups.map((row, idx) => ({ id: `g${idx}`, row, sets: row.sets })).filter(({ sets }) => sets > 0),
  );

  /** 人形图的负荷：有目录位置号用位置号（分左右、更细），否则退回九大肌群。 */
  const load = computed(() =>
    muscleLoad(weightedRows.value.map(({ id, row, sets }): MuscleRowInput => {
      const entry = zepp.value.get(row.action_code);
      return {
        id, sets,
        mainPositions: entry?.main_positions ?? [],
        subPositions: entry?.sub_positions ?? [],
        primaryGroup: primaryOf(row),
        secondaryGroups: secondaryOf(row),
      };
    })),
  );

  /** 每行练到的肌群（主 + 辅），胶囊和表格行互相亮靠它。 */
  const rowGroups = computed(() =>
    new Map(weightedRows.value.map(({ id, row }) => {
      const primary = primaryOf(row);
      return [id, new Set([...(primary ? [primary] : []), ...secondaryOf(row)])];
    })),
  );

  const hover = shallowRef<Focus | null>(null);
  const pinned = shallowRef<Focus | null>(null);
  const focus = computed(() => hover.value ?? pinned.value);
  /** 逐组明细的表格（两张卡分开时，在人形上点了肌肉也要把对应的组滚出来）。 */
  const tableWrap = shallowRef<HTMLElement | null>(null);

  const hoverOn = (kind: FocusKind, key: string | null) => {
    if (key) hover.value = { kind, key };
    else if (hover.value?.kind === kind) hover.value = null;
  };

  /** 点了肌肉 / 胶囊，第一条对应的组不在视野里就滚过去：在台前调度的窗口里看窗口自己的可视区，否则看整页。 */
  const revealFirstLitRow = () => {
    const row = tableWrap.value?.querySelector<HTMLElement>('tbody tr.lit');
    if (!row) return;
    const rect = row.getBoundingClientRect();
    const scroller = row.closest<HTMLElement>('[data-stage-scroll]');
    const view = scroller ? scroller.getBoundingClientRect() : { top: 96, bottom: window.innerHeight - 16 };
    if (rect.top >= view.top && rect.bottom <= view.bottom) return;
    row.scrollIntoView({ block: 'center', behavior: lessMotion() ? 'auto' : 'smooth' });
  };

  const pin = (kind: FocusKind, key: string) => {
    const same = pinned.value?.kind === kind && pinned.value.key === key;
    pinned.value = same ? null : { kind, key };
    if (!same && kind !== 'row') void nextTick(revealFirstLitRow);
  };

  /** 一个肌群在人形上的那几块；目录位置号画出来的块对不上九大肌群时，退回「练到它的那些组」的块。 */
  const groupShapes = (group: string): ReadonlySet<string> => {
    const present = groupShapeKeys(group).filter((key) => load.value.byShape.has(key));
    if (present.length) return new Set(present);
    const out = new Set<string>();
    for (const [id, groups] of rowGroups.value) {
      if (!groups.has(group)) continue;
      const shapes = load.value.byRow.get(id);
      shapes?.primary.forEach((key) => out.add(key));
      shapes?.secondary.forEach((key) => out.add(key));
    }
    return out;
  };

  const mapRow = computed(() => (focus.value?.kind === 'row' ? focus.value.key : null));
  const mapShape = computed(() => (focus.value?.kind === 'shape' ? focus.value.key : null));
  const mapShapes = computed(() => (focus.value?.kind === 'group' ? groupShapes(focus.value.key) : null));

  /** 表格行在联动里的样子：亮（练到正看着的那块肌肉 / 那个肌群）/ 淡（没练到）。 */
  const rowClass = (id: string) => {
    const f = focus.value;
    if (!f) return undefined;
    if (f.kind === 'row') return f.key === id ? 'lit' : undefined;
    if (f.kind === 'shape') return load.value.byShape.get(f.key)?.rows.has(id) ? 'lit' : 'dim';
    return rowGroups.value.get(id)?.has(f.key) ? 'lit' : 'dim';
  };

  const chipOf = (key: string, sets: number): MuscleChip => ({
    key, sets, label: resolveStrengthMuscleLabel(key, catalog.value) ?? key, color: MUSCLE_COLORS[key] ?? 'var(--accent)',
  });
  const tally = (pick: (row: StrengthRowLike) => string[]) => {
    const counts = new Map<string, number>();
    for (const { row, sets } of weightedRows.value) for (const group of pick(row)) counts.set(group, (counts.get(group) ?? 0) + sets);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([key, sets]) => chipOf(key, sets));
  };
  const muscleShares = computed<MuscleChip[]>(() => tally((row) => { const g = primaryOf(row); return g ? [g] : []; }));
  /** 辅助肌群：哪些肌群在几组里是「辅助」（Zepp App 里的黄色），空心胶囊单列一行。 */
  const secondaryShares = computed<MuscleChip[]>(() => tally(secondaryOf));

  /** 胶囊亮哪几个：停在肌群上就是它；停在一组上是那组练到的；停在人形一块上是覆盖那块的肌群。 */
  const litGroups = computed<ReadonlySet<string>>(() => {
    const f = focus.value;
    if (!f) return NONE;
    if (f.kind === 'group') return new Set([f.key]);
    if (f.kind === 'row') return rowGroups.value.get(f.key) ?? NONE;
    const all = [...muscleShares.value, ...secondaryShares.value].map((chip) => chip.key);
    return new Set(all.filter((group) => groupShapeKeys(group).includes(f.key)));
  });

  const hasMap = computed(() => muscleShares.value.length > 0 && load.value.byShape.size > 0);

  const muscleTitle = (row: StrengthRowLike): string | undefined => {
    const names = secondaryOf(row).map((group) => resolveStrengthMuscleLabel(group, catalog.value)).filter((name): name is string => !!name);
    return names.length ? `${t.value.secondaryMuscles}: ${names.join(' · ')}` : undefined;
  };
  const muscleOf = (row: StrengthRowLike) => resolveStrengthMuscleLabel(primaryOf(row), catalog.value);

  return {
    exerciseOf, muscleOf, muscleTitle, load, focus, tableWrap, hoverOn, pin, mapRow, mapShape, mapShapes, rowClass,
    muscleShares, secondaryShares, litGroups, hasMap,
  };
};

export type StrengthDetail = ReturnType<typeof useStrengthDetail>;
