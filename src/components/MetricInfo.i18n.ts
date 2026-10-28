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
    sectionTrust: '怎么测得的',
    trustChipTitle: '黑盒算法估算',
    excludedChipTitle: '你已让这项不参与分析',
    useInAnalysis: '参与分析',
    useInAnalysisHint: '关掉后这项照常显示、数据不删，只是不参与常态比较，也不交给 AI 和 MCP。',
    trustMeasured: '手表或设备的传感器直接测得的读数。',
    trustComputed: '由测得的读数或你自己的记录，按公开的固定算式换算。',
    trustInferred: '手表从传感器读数推算的，做法大家都熟悉（比如从体动和心率判断睡眠、从步数推距离）。细节没公布，看趋势足够。',
    trustEstimated: 'Zepp 用算法从多项读数推算的估计值。Zepp 没有公布算法和误差范围，和实验室测量可能不一致。',
  },
  {
    about: (label: string) => `About ${label}`,
    sectionWhat: 'What this is',
    sectionChart: 'What this chart shows',
    sectionHow: 'How it is computed and where it comes from',
    sectionTrust: 'How it is measured',
    trustChipTitle: 'Black-box estimate',
    excludedChipTitle: 'You left this out of analysis',
    useInAnalysis: 'Use in analysis',
    useInAnalysisHint: 'When off, this still shows and no data is deleted; it is just left out of norm comparisons and is not sent to AI or MCP.',
    trustMeasured: 'Read directly by the sensor on the watch or device.',
    trustComputed: 'Converted from readings or your own logs with a published, fixed formula.',
    trustInferred: 'Worked out by the watch from its sensor readings in a familiar way (sleep from movement and heart rate, distance from steps). The details are not published, but it is fine for following trends.',
    trustEstimated: 'An estimate Zepp derives from several readings with its own algorithm. Zepp has not published the method or its error range, and lab measurements may differ.',
  },
  {
    about: (label: string) => `Sobre ${label}`,
    sectionWhat: 'Qué es',
    sectionChart: 'Qué muestra este gráfico',
    sectionHow: 'Cómo se calcula y de dónde viene',
    sectionTrust: 'Cómo se mide',
    trustChipTitle: 'Estimación de caja negra',
    excludedChipTitle: 'Dejaste esto fuera del análisis',
    useInAnalysis: 'Usar en el análisis',
    useInAnalysisHint: 'Si lo apagas, se sigue mostrando y no se borra nada; solo queda fuera de las comparaciones con tu norma y no se envía a la IA ni al MCP.',
    trustMeasured: 'La mide directamente el sensor del reloj o del dispositivo.',
    trustComputed: 'Se calcula a partir de lecturas o de tus propios registros con una fórmula fija y publicada.',
    trustInferred: 'El reloj lo deduce de sus sensores de una forma conocida (el sueño a partir del movimiento y el pulso, la distancia a partir de los pasos). Los detalles no se han publicado, pero sirve para seguir tendencias.',
    trustEstimated: 'Una estimación que Zepp obtiene de varias lecturas con su propio algoritmo. Zepp no ha publicado el método ni su margen de error, y una medición de laboratorio puede diferir.',
  },
  // moduleId：让 src/i18n/locales/<locale>.ts 的语言包能覆盖这个模块。
  'components/MetricInfo',
);

export const useMetricInfoText = () => useMessages(metricInfoMessages);
