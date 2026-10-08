import { defineMessages } from '../../i18n';

/* 运动详情的爬升卡。参数（窗口、阈值）由后端随结果给出，这里只排版。 */
export const workoutClimbsMessages = defineMessages(
  {
    eyebrow: '爬升',
    title: '主要爬升与下降',
    aria: '主要爬升与下降段',
    flat: '没有明显爬升：落差和坡度都没到下面的门槛。',
    climb: '上坡',
    descent: '下坡',
    range: (from: string, to: string) => `${from}–${to}`,
    grade: '坡度',
    vertical: '垂直速度',
    heartRate: '心率',
    pace: '配速',
    speed: '速度',
    perHour: (unit: string) => `${unit}/时`,
    howTitle: '怎么算的',
    how: (window: number, reversal: number, change: number, grade: number, moving: number) =>
      `海拔先按 ${window} 秒滑动平均做平滑；从最高（最低）点回落（回升）超过 ${reversal} 米才算这一段结束。` +
      `落差至少 ${change} 米、平均坡度至少 ${grade}% 的段才列出来。距离由逐点速度积分，再按这次记录的总距离校准；` +
      `垂直速度和配速按移动时间算（速度低于 ${moving} 米/秒的时间不计）。`,
  },
  {
    eyebrow: 'Climbs',
    title: 'Main climbs and descents',
    aria: 'Main climb and descent segments',
    flat: 'No notable climbs: nothing reached the elevation and grade thresholds below.',
    climb: 'Climb',
    descent: 'Descent',
    range: (from: string, to: string) => `${from}–${to}`,
    grade: 'Grade',
    vertical: 'Vertical speed',
    heartRate: 'Heart rate',
    pace: 'Pace',
    speed: 'Speed',
    perHour: (unit: string) => `${unit}/h`,
    howTitle: 'How this is worked out',
    how: (window: number, reversal: number, change: number, grade: number, moving: number) =>
      `Altitude is smoothed with a ${window}-second moving average; a segment ends once it drops (or rises) more than ${reversal} m from its highest (lowest) point. ` +
      `Only segments with at least ${change} m of elevation change and an average grade of at least ${grade}% are listed. Distance comes from integrating per-point speed, calibrated to the recorded total distance; ` +
      `vertical speed and pace use moving time (time below ${moving} m/s is left out).`,
  },
  {
    eyebrow: 'Subidas',
    title: 'Subidas y bajadas principales',
    aria: 'Tramos principales de subida y bajada',
    flat: 'Sin subidas notables: ningún tramo alcanzó los umbrales de desnivel y pendiente de abajo.',
    climb: 'Subida',
    descent: 'Bajada',
    grade: 'Pendiente',
    vertical: 'Velocidad vertical',
    heartRate: 'Frecuencia cardiaca',
    pace: 'Ritmo',
    speed: 'Velocidad',
    howTitle: 'Cómo se calcula',
    how: (window: number, reversal: number, change: number, grade: number, moving: number) =>
      `La altitud se suaviza con una media móvil de ${window} segundos; un tramo termina cuando baja (o sube) más de ${reversal} m desde su punto más alto (bajo). ` +
      `Solo se listan tramos con al menos ${change} m de desnivel y una pendiente media de al menos ${grade}%. La distancia sale de integrar la velocidad punto a punto, calibrada con la distancia total registrada; ` +
      `la velocidad vertical y el ritmo usan el tiempo en movimiento (no cuenta el tiempo por debajo de ${moving} m/s).`,
  },
  'components/workout/WorkoutClimbsCard',
);
