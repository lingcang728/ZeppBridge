import { defineMessages, messagesOf } from '../../i18n';

const messages = defineMessages({
  systolic: '收缩压：心脏收缩时的压力，单位 mmHg。',
  diastolic: '舒张压：心脏舒张时的压力，单位 mmHg。',
  pulse: '血压测量同时返回的脉搏，单位 bpm；与全天心率分开保存。',
  chart: '柱子表示每日实测平均值，最低和最高取自实测读数。未测日期留空；导出保留每次测量的时间和值。',
  how: '实验性血压同步：只收录明确字段的成对读数。候选接口尚待实际测量账号核对，测量方式和校准信息保留在原始报文。',
}, {
  systolic: 'Systolic pressure during heart contraction, in mmHg.',
  diastolic: 'Diastolic pressure between heartbeats, in mmHg.',
  pulse: 'Pulse returned with a blood-pressure measurement, in bpm. Stored separately from all-day heart rate.',
  chart: 'Bars show daily measured averages; minimum and maximum come from individual readings. Unmeasured dates stay blank. Exports retain each measurement time and value.',
  how: 'Experimental blood-pressure sync accepts explicit paired readings. Candidate endpoints still need verification on a measuring account. Method and calibration metadata remain in the raw response.',
}, {
  systolic: 'Presión sistólica durante la contracción del corazón, en mmHg.',
  diastolic: 'Presión diastólica entre latidos, en mmHg.',
  pulse: 'Pulso de la medición de presión, en bpm. Se guarda separado de la frecuencia de todo el día.',
  chart: 'Las barras muestran promedios diarios; mínimo y máximo proceden de lecturas individuales. Las fechas sin mediciones quedan vacías. La exportación conserva cada hora y valor.',
  how: 'Sincronización experimental: acepta pares de valores explícitos. Los candidatos necesitan verificación con una cuenta que mida. Método y calibración quedan en la respuesta original.',
}, 'lib/metricInfo/bloodPressure');

export const BLOOD_PRESSURE_METRICS = ['blood_pressure_systolic', 'blood_pressure_diastolic', 'blood_pressure_pulse'];
export const bloodPressureInfo = (metric: string) => {
  if (!BLOOD_PRESSURE_METRICS.includes(metric)) return null;
  const t = messagesOf(messages);
  return { what: metric.endsWith('_systolic') ? t.systolic : metric.endsWith('_diastolic') ? t.diastolic : t.pulse, chart: t.chart, how: t.how };
};
