import { describe, expect, it } from 'vitest';
import { PINNABLE_METRICS } from '../../lib/pinnedMetrics';
import { pinnedMetricsMessages } from '../overview/PinnedMetrics.i18n';
import { activityDetailMessages } from '../../views/ActivityDetail.i18n';
import { bodyStatusMessages } from '../../views/BodyStatus.i18n';
import { heartRateDetailMessages } from '../../views/HeartRateDetail.i18n';
import { trainingStatusMessages } from '../../views/TrainingStatus.i18n';
import de from '../../i18n/locales/de';
import fr from '../../i18n/locales/fr';
import hiIN from '../../i18n/locales/hi-IN';
import nl from '../../i18n/locales/nl';
import ptBR from '../../i18n/locales/pt-BR';
import ptPT from '../../i18n/locales/pt-PT';
import ru from '../../i18n/locales/ru';

/*
 * 概览置顶磁贴的名字必须和点进去那张趋势卡的标题逐字一样（用户 2026-10-04：首页「活动消耗」、点进去「活动热量」；
 * 首页「准备度」、点进去「恢复状态」——不知道是不是同一个东西）。磁贴不 import 详情页的整份文案（概览首屏体积），
 * 自己抄一份，这里把每种语言都对一遍。
 */
type Bundle = { zh: Record<string, unknown>; en: Record<string, unknown>; es: Record<string, unknown>; moduleId?: string };
type Source = { bundle: Bundle; key: string } | { literal: string };

const SOURCES: Record<string, Source[]> = {
  resting_hr: [{ bundle: bodyStatusMessages, key: 'restingLabel' }, { bundle: heartRateDetailMessages, key: 'restingLabel' }],
  hrv: [{ literal: 'HRV (SDNN)' }],
  hrv_rmssd: [{ literal: 'HRV (RMSSD)' }],
  readiness: [{ bundle: bodyStatusMessages, key: 'readinessLabel' }],
  stress: [{ bundle: bodyStatusMessages, key: 'stressLabel' }],
  spo2: [{ bundle: bodyStatusMessages, key: 'spo2Label' }],
  steps: [{ bundle: activityDetailMessages, key: 'stepsLabel' }],
  active_calories: [{ bundle: activityDetailMessages, key: 'caloriesLabel' }],
  active_minutes: [{ bundle: activityDetailMessages, key: 'minutesLabel' }],
  training_load: [{ bundle: trainingStatusMessages, key: 'loadLabel' }],
  vo2max: [{ literal: 'VO₂max' }],
  pai_total: [{ bundle: trainingStatusMessages, key: 'paiLabel' }],
  weight: [{ bundle: bodyStatusMessages, key: 'weightLabel' }],
  body_fat_rate: [{ bundle: bodyStatusMessages, key: 'fatLabel' }],
  bmi: [{ bundle: bodyStatusMessages, key: 'bmiLabel' }],
};

type Pack = { modules: Record<string, Record<string, unknown>> };
const PACKS: Record<string, Pack> = { de, fr, 'hi-IN': hiIN, nl, 'pt-BR': ptBR, 'pt-PT': ptPT, ru } as unknown as Record<string, Pack>;

/** 某语言下一条文案的实际显示值：语言包有就用语言包，没有回落英文（和 i18n 运行时一样）。 */
const resolve = (bundle: Bundle, path: string[], locale: string): unknown => {
  const dig = (tree: unknown) => path.reduce<unknown>((node, key) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined), tree);
  if (locale === 'zh' || locale === 'en' || locale === 'es') return dig(bundle[locale]);
  const pack = bundle.moduleId ? PACKS[locale]?.modules[bundle.moduleId] : undefined;
  return dig(pack) ?? dig(bundle.en);
};

const LOCALES = ['zh', 'en', 'es', ...Object.keys(PACKS)];

describe('置顶指标的名字和详情页卡片标题一致', () => {
  it('每个可固定的指标都登记了对照', () => {
    expect(PINNABLE_METRICS.map((metric) => metric.id).filter((id) => id !== 'sleep_score' && !SOURCES[id])).toEqual([]);
  });

  for (const locale of LOCALES) {
    it(locale, () => {
      const wrong: string[] = [];
      for (const [id, sources] of Object.entries(SOURCES)) {
        const pin = resolve(pinnedMetricsMessages as Bundle, ['names', id], locale);
        for (const source of sources) {
          const detail = 'literal' in source ? source.literal : resolve(source.bundle, [source.key], locale);
          if (pin !== detail) wrong.push(`${id}: 磁贴「${String(pin)}」≠ 详情页「${String(detail)}」`);
        }
      }
      expect(wrong).toEqual([]);
    });
  }
});
