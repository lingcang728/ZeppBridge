import { defineMessages } from '../i18n';

/* 只连官方授权时的说明。另外 7 种语言在 src/i18n/locales/*.ts 的 'components/OfficialOnlyNote' 下。 */
export const officialOnlyNoteMessages = defineMessages(
  {
    text: '只连了 Zepp 官方授权：心率、睡眠、步数、跑步和步行、PAI、体重会同步。HRV、血氧、压力、准备度、训练负荷、骑行等其余运动和设备识别，官方没有开放，需再连「高级数据」。',
    workouts: '只连了官方授权：官方接口只给跑步、步行等部分运动，骑行、力量训练、球类等要再连「高级数据」才有。',
    action: '去连接',
  },
  {
    text: 'Only official Zepp authorization is connected: heart rate, sleep, steps, runs and walks, PAI and weight sync. The official API does not offer HRV, blood oxygen, stress, readiness, training load, cycling and other workouts, or device identification — connect Advanced data for those.',
    workouts: 'Only official authorization is connected. The official API returns runs, walks and a few other workouts; cycling, strength training, racket sports and the rest need Advanced data.',
    action: 'Connect',
  },
  {
    text: 'Solo está conectada la autorización oficial de Zepp: se sincronizan frecuencia cardíaca, sueño, pasos, carreras y caminatas, PAI y peso. La API oficial no ofrece VFC, oxígeno en sangre, estrés, recuperación, carga de entrenamiento, ciclismo y otros entrenamientos ni la identificación de dispositivos; conecta «Datos avanzados» para verlos.',
    workouts: 'Solo está conectada la autorización oficial. La API oficial devuelve carreras, caminatas y pocos entrenamientos más; ciclismo, fuerza, deportes de raqueta y el resto necesitan «Datos avanzados».',
    action: 'Conectar',
  },
  'components/OfficialOnlyNote',
);
