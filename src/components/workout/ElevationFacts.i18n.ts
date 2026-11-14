import { defineMessages } from '../../i18n';

/* 爬升卡与海拔卡共用的起伏概览：四格事实 + 坡度分布条。 */
export const elevationFactsMessages = defineMessages(
  {
    aria: '海拔起伏概览',
    ascent: '累计爬升',
    descent: '累计下降',
    drop: '最大落差',
    range: '海拔范围',
    slopeTitle: '坡度分布（按时间）',
    up: '上坡',
    flat: '平地',
    down: '下坡',
    how: (grade: number, step: number, smooth: number, moving: number) =>
      `坡度分布：海拔先按 ${smooth} 秒滑动平均，每走 ${step} 米算一次坡度，超过 ±${grade}% 记上坡 / 下坡，其余记平地；速度低于 ${moving} 米/秒的时间不计。`,
  },
  {
    aria: 'Elevation overview',
    ascent: 'Ascent',
    descent: 'Descent',
    drop: 'Elevation span',
    range: 'Altitude range',
    slopeTitle: 'Time by slope',
    up: 'Uphill',
    flat: 'Flat',
    down: 'Downhill',
    how: (grade: number, step: number, smooth: number, moving: number) =>
      `Time by slope: altitude is smoothed with a ${smooth}-second moving average, the grade is taken every ${step} m, and anything steeper than ±${grade}% counts as uphill or downhill, the rest as flat; time below ${moving} m/s is left out.`,
  },
  {
    aria: 'Resumen del desnivel',
    ascent: 'Ascenso',
    descent: 'Descenso',
    drop: 'Mayor desnivel',
    range: 'Rango de altitud',
    slopeTitle: 'Tiempo por pendiente',
    up: 'Subida',
    flat: 'Llano',
    down: 'Bajada',
    how: (grade: number, step: number, smooth: number, moving: number) =>
      `Tiempo por pendiente: la altitud se suaviza con una media móvil de ${smooth} segundos, la pendiente se mide cada ${step} m y lo que pase de ±${grade}% cuenta como subida o bajada, el resto como llano; no cuenta el tiempo por debajo de ${moving} m/s.`,
  },
  'components/workout/ElevationFacts',
);
