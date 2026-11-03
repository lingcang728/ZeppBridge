/**
 * 履历页年轮区块看到的每一个数，都在这里按界面语言排好版——界面照着它画，「交给 AI」也照着它写，
 * 两边说的是同一套话（用户 2026-10-27：看得到的都要能交给 AI）。
 *
 * 数据是本机全部可见的运动：云端同步的、官方授权推来的、从文件导入的都算；只有在本机隐藏了的不算。
 */
import { computed, type Ref } from 'vue';
import { useRouter } from 'vue-router';
import { daysInYear } from '../../../lib/rings/geometry';
import { coverageShare, kindLegend, monthTotals, streaks, versusLastYear } from '../../../lib/rings/yearStats';
import { displayDateTimeFormatter } from '../../../lib/dateTime';
import { journalDay, kmText } from '../../../lib/logbook/display';
import { workoutLabel } from '../../../lib/labels';
import { intlLocale } from '../../../i18n';
import { useAiTaskDraft } from '../../../composables/useAiTaskDraft';
import { armPageMorph } from '../../../composables/usePageMorph';
import { useRingsText } from '../../rings/rings.i18n';
import { useJournalText } from '../journal.i18n';
import { useRepairText } from '../repair.i18n';
import { useYearText } from './year.i18n';
import type { AnnualRings } from '../../../types/rings';

export function useYearView(data: Ref<AnnualRings | null>, selected: Ref<number | null>) {
  const t = useRingsText();
  const j = useJournalText();
  const repair = useRepairText();
  const y = useYearText();
  const year = computed(() => data.value?.years.find(v => v.year === selected.value) ?? null);
  const today = computed(() => data.value?.today ?? '');
  const percent = (value: number, signed = true) => new Intl.NumberFormat(intlLocale(), { style: 'percent', maximumFractionDigits: 0, ...(signed ? { signDisplay: 'exceptZero' as const } : {}) }).format(value);
  const km = (meters: number) => j.value.km(kmText(meters / 1000));
  const monthName = (month: number) => displayDateTimeFormatter({ month: 'short' }).format(new Date(2024, month, 1));

  const legend = computed(() => kindLegend(year.value?.stars ?? []).map(item => ({
    key: item.kind ?? 'other', label: item.kind ? workoutLabel(item.kind) : y.value.other, count: item.count, text: t.value.times(item.count),
  })));
  /* 一年的三个总数（和去年比）：界面上不再单独画一张卡（用户 2026-10-27 嫌丑），交给 AI 时仍然写上。 */
  const tiles = computed(() => {
    const v = year.value;
    if (!v) return [];
    const versus = versusLastYear(v, data.value?.years.find(p => p.year === v.year - 1), today.value);
    const delta = (change: number | null | undefined) => (change == null ? null : (versus?.sameSpan ? y.value.vsSameSpan : y.value.vsLastYear)(percent(change)));
    return [
      { label: t.value.workouts, value: t.value.times(v.workouts), note: delta(versus?.workouts) },
      { label: repair.value.distance, value: km(v.distance_m), note: delta(versus?.distance) },
      { label: repair.value.recorded, value: t.value.days(v.data_days), note: y.value.coverage(percent(coverageShare(v, today.value, daysInYear(v.year)), false)) },
    ];
  });
  const months = computed(() => monthTotals(year.value?.stars ?? []).map(m => ({ ...m, label: monthName(m.month), text: t.value.times(m.count), km: m.distance ? km(m.distance) : null })));
  const activeMonths = computed(() => [...months.value].filter(m => m.count).sort((a, b) => b.count - a.count || a.month - b.month));
  const allStreaks = computed(() => streaks(year.value?.stars ?? []).map(s => ({ ...s, text: y.value.streakDays(s.days), range: `${journalDay(s.from)} – ${journalDay(s.to)}` })));
  const bestMonth = computed(() => [...months.value].filter(m => m.distance).sort((a, b) => b.distance - a.distance)[0] ?? null);
  const longestRun = computed(() => {
    const run = year.value?.longest_run;
    return run?.distance_m ? { id: run.workout_id, value: km(run.distance_m), date: journalDay(run.date) } : null;
  });

  /** 交给 AI 的「我看到的这一年」：一行一项，和界面上的字一样。 */
  const seenLines = computed(() => {
    const v = year.value;
    if (!v) return [];
    const lines = tiles.value.map(tile => `${tile.label}: ${tile.value}${tile.note ? ` (${tile.note})` : ''}`);
    if (legend.value.length) lines.push(legend.value.map(item => `${item.label} ${item.text}`).join(' · '));
    if (activeMonths.value.length) lines.push(`${y.value.activeMonths}: ${activeMonths.value.slice(0, 3).map(m => `${m.label} ${m.text}`).join(' · ')}`);
    // 二级弹窗里的十二个月和最长的几段也一起写上：弹窗里看得到的，交出去也有。
    if (activeMonths.value.length) lines.push(months.value.map(m => `${m.label} ${m.count ? m.text : '—'}${m.km ? ` / ${m.km}` : ''}`).join(' · '));
    if (allStreaks.value.length) lines.push(`${y.value.streak}: ${allStreaks.value.slice(0, 5).map(s => `${s.text} (${s.range})`).join(' · ')}`);
    if (bestMonth.value?.km) lines.push(`${y.value.bestMonth}: ${bestMonth.value.label} ${bestMonth.value.km}`);
    if (longestRun.value) lines.push(`${t.value.longestRun}: ${longestRun.value.value} (${longestRun.value.date})`);
    return lines;
  });

  const router = useRouter();
  const draft = useAiTaskDraft();
  /** 新开一个任务：只交运动这一类、这一年的每一天（今年到今天为止），问题和「我看到的」填好；`card` 长成「交给 AI」整页。
      `extra`：调用的页面上另外看得到的几行（年轮页右栏的步数、睡眠、PB……）；`anySize`：来处是那枚「问 AI」按钮本身（年轮页）。 */
  async function askAi(card: HTMLElement | null, extra: string[] = [], options: { anySize?: boolean } = {}) {
    const v = year.value;
    if (!v) return;
    const days: string[] = [];
    for (let d = 0; d < daysInYear(v.year); d++) {
      const date = new Date(v.year, 0, 1 + d);
      const key = `${v.year}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      if (key > today.value) break;
      days.push(key);
    }
    draft.resetDraft();
    draft.applyPicks(new Map([['workout', days]]), today.value);
    draft.setPrompt([y.value.askQuestion(v.year), '', y.value.askSeen(v.year), ...[...seenLines.value, ...extra].map(line => `- ${line}`)].join('\n'));
    armPageMorph(card, '/ai', options);
    await router.push('/ai');
  }

  return { year, today, legend, tiles, months, activeMonths, allStreaks, bestMonth, longestRun, seenLines, askAi };
}
