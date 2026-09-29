import { defineMessages } from '../i18n';

/* 只连官方授权时的说明。另外 7 种语言在 src/i18n/locales/*.ts 的 'components/OfficialOnlyNote' 下。 */
export const officialOnlyNoteMessages = defineMessages(
  {
    text: '只连了 Zepp 官方授权：心率、睡眠、步数、运动、PAI 和体重会同步。HRV、血氧、压力、准备度、训练负荷官方没有开放，需再连「高级数据」。',
    action: '去连接',
  },
  {
    text: 'Only official Zepp authorization is connected: heart rate, sleep, steps, workouts, PAI and weight sync. The official API does not offer HRV, blood oxygen, stress, readiness or training load — connect Advanced data for those.',
    action: 'Connect',
  },
  {
    text: 'Solo está conectada la autorización oficial de Zepp: se sincronizan frecuencia cardíaca, sueño, pasos, entrenamientos, PAI y peso. La API oficial no ofrece VFC, oxígeno en sangre, estrés, preparación ni carga de entrenamiento; conecta «Datos avanzados» para verlos.',
    action: 'Conectar',
  },
  'components/OfficialOnlyNote',
);
