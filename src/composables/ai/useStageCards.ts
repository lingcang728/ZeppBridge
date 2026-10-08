/**
 * 舞台左边那一把牌（2026-10-08 横向舞台）：一类一张，收集箱挑的日子并进那一类的牌面；再加一张个人档案、
 * 一张「加一类」虚位。合计不超过 9 张（一页 ≤10 张卡）。
 *
 * 牌面只说三件事：这一类叫什么、交多长一段（最近 N 天 / 挑了 N 天）、里面几天真有数据（`have/total`，
 * 来自 `ai_task_preview` 的 coverage，和寄出前检查同源）。还没算出来时数字写「—」，不写 0。
 */
import { computed } from 'vue';
import type { IconName } from '../../components/Icon.vue';
import { AI_TASK_CATEGORY_META, categoryLabel, categoryRangeOf } from '../../lib/aiTask/categories';
import { emptyCategories } from '../../lib/aiTask/emptyCategories';
import type { AiTaskCategory, AiTaskCoverage } from '../../lib/bridge/types';
import { useAiTaskDraft } from '../useAiTaskDraft';
import { useAiTaskPreview } from '../useAiTaskPreview';
import { useBridgeStrip } from '../useBridgeStrip';
import { useStageText } from '../../components/ai/stage/stage.i18n';
import { useBridgeText } from '../../components/ai/bridge/bridge.i18n';

export const STAGE_DATA_ORDER: readonly AiTaskCategory[] = ['sleep', 'recovery', 'resting_hr', 'heart_rate', 'workout', 'training', 'body'];

export interface StageCardModel {
  id: string;
  kind: 'data' | 'profile' | 'add';
  category: AiTaskCategory | null;
  icon: IconName;
  tint: string;
  title: string;
  line: string;
  /** 大字：有数据的天数；没算出来是 null（画「—」）。 */
  have: number | null;
  total: number | null;
  sub: string | null;
}

/** 一类的覆盖：不按运动分的那一行优先（同底栏小牌的取法）。 */
const coverageOf = (rows: AiTaskCoverage[], category: AiTaskCategory) => {
  const mine = rows.filter((row) => row.category === category);
  return mine.find((row) => row.workout_id === null) ?? mine[0] ?? null;
};

export const useStageCards = () => {
  const { draft } = useAiTaskDraft();
  const { preview } = useAiTaskPreview();
  const strips = useBridgeStrip();
  const s = useStageText();
  const b = useBridgeText();
  const empty = computed(() => emptyCategories(strips.rows.value));

  const dataCard = (category: AiTaskCategory): StageCardModel => {
    const meta = AI_TASK_CATEGORY_META[category];
    const range = categoryRangeOf(draft.value.categories, category);
    const row = coverageOf(preview.value?.coverage ?? [], category);
    const picked = range.picked_days?.length ?? 0;
    const extra = category === 'workout' ? draft.value.workout_ids.length : 0;
    return {
      id: category, kind: 'data', category, icon: meta.icon, tint: meta.tint, title: categoryLabel(category),
      line: picked ? s.value.picked(picked) : s.value.recent(range.days_before + 1),
      have: row ? row.days_with_data : null,
      total: row ? row.days_in_range : null,
      sub: extra ? s.value.extraWorkouts(extra) : row && !row.days_with_data ? s.value.noRecord : null,
    };
  };

  const enabled = (category: AiTaskCategory) => categoryRangeOf(draft.value.categories, category).enabled;
  /** 关着的数据类别：「加一类」里列出来（90 天都没记录的也列，写明没有记录）。 */
  const off = computed(() => STAGE_DATA_ORDER.filter((category) => !enabled(category)));

  const cards = computed<StageCardModel[]>(() => {
    const out = STAGE_DATA_ORDER.filter(enabled).map(dataCard);
    const note = draft.value.personal_note.trim();
    out.push({
      id: 'personal_note', kind: 'profile', category: 'personal_note', icon: 'user', tint: 'var(--muted)', title: b.value.profile,
      line: note ? s.value.profileFilled : s.value.profileEmpty, have: null, total: null, sub: note ? note.slice(0, 28) : null,
    });
    if (off.value.length) out.push({ id: 'add', kind: 'add', category: null, icon: 'plus', tint: 'var(--subtle)', title: s.value.add, line: '', have: null, total: null, sub: null });
    return out;
  });

  return { cards, off, empty, dataCard };
};
