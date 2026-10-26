import { defineMessages, useMessages } from '../i18n';

/**
 * 「?」浮层的固定三段（D6）：这是什么 / 这张图展示什么 / 怎么算的与来源。
 * 三段的内容按指标 id 放在 `lib/metricInfo/` 各域文件里；这里只有浮层自己的骨架文案。
 */
export const metricInfoMessages = defineMessages(
  {
    about: (label: string) => `了解「${label}」`,
    sectionWhat: '这是什么',
    sectionChart: '这张图展示什么',
    sectionHow: '怎么算的与来源',
    sectionTrust: '能信几分',
    trustChipTitle: '算法估算值：只看自己的长期趋势',
    trustMeasured: '传感器直接测量的读数。单次读数有误差，但可以直接拿来比较。',
    trustComputed: '由测量值或你自己的记录按固定算式换算，可以复现。',
    trustEstimated: '手表或体脂秤用算法推断的估计值，可能和医院检测差得很远（VO₂max 就常见这种情况）。只看自己的长期趋势，别和别人或医疗数值直接比较。',
  },
  {
    about: (label: string) => `About ${label}`,
    sectionWhat: 'What this is',
    sectionChart: 'What this chart shows',
    sectionHow: 'How it is computed and where it comes from',
    sectionTrust: 'How far to trust it',
    trustChipTitle: 'Algorithm estimate: watch your own long-term trend',
    trustMeasured: 'A direct sensor reading. Single readings have some error, but they can be compared as they are.',
    trustComputed: 'Converted from measurements or your own logs with a fixed formula, so it can be reproduced.',
    trustEstimated: 'An estimate inferred by the watch or scale, which can be far from a lab test (VO₂max often is). Follow your own long-term trend; don’t compare it with other people or medical values.',
  },
  {
    about: (label: string) => `Sobre ${label}`,
    sectionWhat: 'Qué es',
    sectionChart: 'Qué muestra este gráfico',
    sectionHow: 'Cómo se calcula y de dónde viene',
    sectionTrust: 'Cuánto fiarse',
    trustChipTitle: 'Estimación del algoritmo: sigue tu propia tendencia a largo plazo',
    trustMeasured: 'Una lectura directa del sensor. Cada lectura tiene algo de error, pero se puede comparar tal cual.',
    trustComputed: 'Se convierte a partir de mediciones o de tus propios registros con una fórmula fija, así que se puede reproducir.',
    trustEstimated: 'Una estimación que infiere el reloj o la báscula y puede alejarse mucho de una prueba clínica (al VO₂máx le pasa a menudo). Sigue tu propia tendencia a largo plazo; no la compares con otras personas ni con valores médicos.',
  },
  // moduleId：让 src/i18n/locales/<locale>.ts 的语言包能覆盖这个模块。
  'components/MetricInfo',
);

export const useMetricInfoText = () => useMessages(metricInfoMessages);
