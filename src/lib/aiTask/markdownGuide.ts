/**
 * 单个 `.md` 交付里「这份文件怎么读」那一段（批次 ⑦）。
 *
 * 放在提示词之后、数据之前；用户手改了提示词它也还在（后端单独收，不会被覆盖掉）。
 * 节标题与列名是机器名（Summary、Daily metrics…），这里只解释它们，按界面语言写。
 */
import { defineMessages, messagesOf } from '../../i18n';

const messages = defineMessages(
  {
    guide: [
      '读法：',
      '- 表格都是 CSV 代码块，第一行是列名，括号里是单位。',
      '- 单元格空着 = 那天 / 那一刻没有数据，不是 0；不要补全或推测。',
      '- Daily metrics 一行一天；Sleep 一行一晚；Workouts 一行一次运动；Coverage 写明每类数据的日期范围和实际有数据的天数。',
      '- 运动曲线（Samples）按 Summary 里 curve_average_seconds 的秒数取了平均，heart_rate_min / heart_rate_max 是每段的最低和最高；整次运动的统计用逐秒全量算好，在 Curve statistics。',
      '- workouts_summary_only 里的运动为了让文件读得完只留了概要行。',
    ].join('\n'),
  },
  {
    guide: [
      'How to read this file:',
      '- Every table is a CSV code block; the first row is the header and units are in parentheses.',
      '- An empty cell means no data for that day or moment — it is not 0. Do not fill in or guess.',
      '- Daily metrics: one row per day. Sleep: one row per night. Workouts: one row per workout. Coverage: the date range and how many days actually have data, per category.',
      '- Workout curves (Samples) are averaged over curve_average_seconds (see Summary); heart_rate_min / heart_rate_max are the lowest and highest in each step. Whole-workout statistics come from the full per-second data, under Curve statistics.',
      '- Workouts listed in workouts_summary_only keep only their summary row so the file stays readable.',
    ].join('\n'),
  },
  {
    guide: [
      'Cómo leer este archivo:',
      '- Todas las tablas son bloques CSV; la primera fila es la cabecera y las unidades van entre paréntesis.',
      '- Una celda vacía significa que no hay datos de ese día o momento; no es 0. No rellenes ni supongas.',
      '- Daily metrics: una fila por día. Sleep: una por noche. Workouts: una por entrenamiento. Coverage: el rango de fechas y cuántos días tienen datos, por categoría.',
      '- Las curvas (Samples) están promediadas cada curve_average_seconds segundos (ver Summary); heart_rate_min / heart_rate_max son el mínimo y el máximo de cada tramo. Las estadísticas de todo el entrenamiento salen de los datos segundo a segundo, en Curve statistics.',
      '- Los entrenamientos de workouts_summary_only solo conservan su fila de resumen para que el archivo quepa.',
    ].join('\n'),
  },
  'lib/aiTask/markdownGuide',
);

export const markdownGuide = (): string => messagesOf(messages).guide;
