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
  },
  {
    about: (label: string) => `About ${label}`,
    sectionWhat: 'What this is',
    sectionChart: 'What this chart shows',
    sectionHow: 'How it is computed and where it comes from',
  },
  {
    about: (label: string) => `Sobre ${label}`,
    sectionWhat: 'Qué es',
    sectionChart: 'Qué muestra este gráfico',
    sectionHow: 'Cómo se calcula y de dónde viene',
  },
  // moduleId：让 src/i18n/locales/<locale>.ts 的语言包能覆盖这个模块。
  'components/MetricInfo',
);

export const useMetricInfoText = () => useMessages(metricInfoMessages);
